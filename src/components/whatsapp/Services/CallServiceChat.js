// src/services/CallService.js
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../../../config/firebase";

class CallServiceChat {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.currentCallId = null;
    this.callListeners = [];
    this.isCalling = false;
    this.isIncomingCall = false;
    this.currentUserId = null;
    this.onRemoteStream = null;
    this.onCallEnded = null;
    this.onCallStatusChanged = null;
    // ✅ تخزين ICE candidates البعيدة (من الطرف الآخر) لحين توفر remote description
    this.pendingIceCandidates = [];
    // ✅ تخزين ICE candidates المحلية لحين توفر currentCallId
    this.pendingLocalIceCandidates = [];
    // ✅ تخزين الإضافات المؤقتة
    this._addedIceCandidates = new Set();
    // ✅ قفل لمنع تعيين remote description أكثر من مرة (race condition)
    this._remoteDescriptionPending = false;
    // ✅ خاص بإضافة الفيديو أثناء مكالمة صوتية شغّالة (renegotiation)
    this._lastProcessedOfferVersion = 0; // آخر renegotiation offer عالجناه (كطرف مستقبِل)
    this._lastSentOfferVersion = 0; // آخر renegotiation offer بعتناه (كطرف طالب الفيديو)
    this._processingRenegotiationOffer = false;
    this._applyingRenegotiationAnswer = false;
  }

  // 🔹 إعداد الاتصال
  setupPeerConnection() {
    const configuration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
      ],
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    // إضافة الـ tracks المحلية
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // استقبال الـ remote tracks
    this.peerConnection.ontrack = (event) => {
      console.log("🔵 Remote track received:", event.track.kind);

      if (this.remoteStream) {
        this.remoteStream.addTrack(event.track);
      } else {
        this.remoteStream = new MediaStream();
        this.remoteStream.addTrack(event.track);
        if (this.onRemoteStream) {
          this.onRemoteStream(this.remoteStream);
        }
      }
    };

    // جمع ICE Candidates وإرسالها إلى Firestore
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("🧊 ICE candidate collected");
        this.addIceCandidate(event.candidate);
      }
    };

    // مراقبة حالة الاتصال
    this.peerConnection.onconnectionstatechange = () => {
      console.log("🔗 Connection state:", this.peerConnection.connectionState);

      if (this.peerConnection.connectionState === "connected") {
        if (this.onCallStatusChanged) {
          this.onCallStatusChanged("connected");
        }
      } else if (this.peerConnection.connectionState === "disconnected") {
        if (this.onCallStatusChanged) {
          this.onCallStatusChanged("disconnected");
        }
      } else if (this.peerConnection.connectionState === "failed") {
        console.error("❌ Connection failed");
        this.endCall();
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log(
        "🧊 ICE connection state:",
        this.peerConnection.iceConnectionState,
      );
    };

    return this.peerConnection;
  }

  // 🔹 بدء مكالمة
  async startCall(receiverId, chatId, type = "video") {
    if (this.isCalling) {
      console.log("⚠️ Call already in progress");
      return null;
    }

    try {
      console.log("📞 Starting call to:", receiverId);

      // ✅ إعادة تعيين قائمة الـ candidates المؤقتة
      this.pendingIceCandidates = [];
      this.pendingLocalIceCandidates = [];
      this._addedIceCandidates = new Set();
      this._remoteDescriptionPending = false;
      this._lastProcessedOfferVersion = 0;
      this._lastSentOfferVersion = 0;
      this._processingRenegotiationOffer = false;
      this._applyingRenegotiationAnswer = false;

      // الحصول على الـ stream المحلي
      const constraints = {
        video: type === "video",
        audio: true,
      };

      console.log("🎥 Getting user media with constraints:", constraints);
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

      if (this.localStream.getVideoTracks().length === 0 && type === "video") {
        console.warn("⚠️ No video track available, switching to audio only");
      }

      this.isCalling = true;
      this.setupPeerConnection();

      // إنشاء الـ offer
      console.log("📤 Creating offer...");
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === "video",
      });

      await this.peerConnection.setLocalDescription(offer);
      console.log("✅ Local description set");

      // إنشاء مستند المكالمة في Firestore
      const callRef = doc(collection(db, "calls"));
      this.currentCallId = callRef.id;

      const callData = {
        callerId: this.currentUserId,
        receiverId: receiverId,
        chatId: chatId,
        type: type,
        status: "calling",
        offer: {
          sdp: offer.sdp,
          type: offer.type,
        },
        iceCandidates: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isVideoEnabled: type === "video",
        isAudioEnabled: true,
      };

      console.log("💾 Saving call to Firestore:", callData);
      await setDoc(callRef, callData);

      // ✅ إرسال أي ICE candidates تجمّعت قبل ما يصير عندنا currentCallId
      await this.flushPendingLocalIceCandidates();

      // ✅ الاستماع للتغييرات في المكالمة (بعد حفظ المستند)
      this.listenToCall(callRef.id);

      console.log("✅ Call started successfully, ID:", callRef.id);
      return { callId: callRef.id, stream: this.localStream };
    } catch (error) {
      console.error("❌ Error starting call:", error);
      this.cleanup();
      throw error;
    }
  }

  // 🔹 الاستماع للمكالمات الواردة
  // src/services/CallService.js

  // 🔹 استبدال دالة listenForIncomingCalls بهذه النسخة المعدلة
  listenForIncomingCalls(userId, onCallReceived) {
    console.log("👂 Listening for incoming calls for user:", userId);
    this.currentUserId = userId;

    // ✅ استعلام مبسط بدون orderBy لتجنب الحاجة لفهرس
    const callsQuery = query(
      collection(db, "calls"),
      where("receiverId", "==", userId),
      where("status", "in", ["calling", "ringing"]),
    );

    const unsubscribe = onSnapshot(
      callsQuery,
      (snapshot) => {
        console.log(
          "📨 Incoming calls snapshot received, size:",
          snapshot.size,
        );
        snapshot.docChanges().forEach((change) => {
          if (
            change.type === "removed" &&
            change.doc.id === this.currentCallId &&
            this.isIncomingCall &&
            !this.isCalling
          ) {
            console.log(
              "📞 Incoming call cancelled/ended before answer:",
              change.doc.id,
            );

            this.isIncomingCall = false;
            this.currentCallId = null;

            onCallReceived(null);
          }
        });

        // ✅ ترتيب النتائج يدوياً بعد جلبها
        const calls = [];
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const callData = change.doc.data();
            calls.push({
              docId: change.doc.id,
              ...callData,
            });
          }
        });

        // ✅ ترتيب النتائج تنازلياً حسب createdAt
        calls.sort((a, b) => {
          const timeA = a.createdAt?.toDate?.() || new Date(0);
          const timeB = b.createdAt?.toDate?.() || new Date(0);
          return timeB - timeA;
        });

        // ✅ معالجة أحدث مكالمة فقط
        if (calls.length > 0) {
          const latestCall = calls[0];
          const callData = latestCall;

          console.log("📞 New incoming call:", callData);

          if (
            callData.status === "calling" &&
            !this.isIncomingCall &&
            !this.isCalling
          ) {
            this.isIncomingCall = true;
            this.currentCallId = callData.docId;

            this.pendingIceCandidates = [];
            this._addedIceCandidates = new Set();

            this.getUserInfo(callData.callerId)
              .then((userInfo) => {
                onCallReceived({
                  callId: callData.docId,
                  ...callData,
                  callerInfo: userInfo,
                });
              })
              .catch((error) => {
                console.error("Error fetching caller info:", error);
                onCallReceived({
                  callId: callData.docId,
                  ...callData,
                });
              });
          }
        }
      },
      (error) => {
        console.error("❌ Error listening for calls:", error);
        // ✅ عرض رسالة خطأ واضحة للمستخدم
        if (
          error.code === "failed-precondition" &&
          error.message.includes("index")
        ) {
          console.error(
            "⚠️ Please create the required index in Firebase Console",
          );
        }
      },
    );

    this.callListeners.push(unsubscribe);
    return unsubscribe;
  }

  // 🔹 جلب معلومات المستخدم
  async getUserInfo(userId) {
    try {
      const userRef = doc(db, "users", userId);
      const userSnapshot = await getDoc(userRef);
      if (userSnapshot.exists()) {
        return userSnapshot.data();
      }
      return null;
    } catch (error) {
      console.error("Error fetching user info:", error);
      return null;
    }
  }

  // 🔹 الرد على المكالمة
  async answerCall(callId, type = "video") {
    console.log("📞 Answering call:", callId);

    try {
      // ✅ إعادة تعيين قائمة الـ candidates المؤقتة
      this.pendingIceCandidates = [];
      this.pendingLocalIceCandidates = [];
      this._addedIceCandidates = new Set();
      this._remoteDescriptionPending = false;
      this._lastProcessedOfferVersion = 0;
      this._lastSentOfferVersion = 0;
      this._processingRenegotiationOffer = false;
      this._applyingRenegotiationAnswer = false;

      // الحصول على الـ stream المحلي
      const constraints = {
        video: type === "video",
        audio: true,
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("✅ Local stream obtained");

      // ✅ تعيين currentCallId فوراً (نعرفه من الباراميتر) عشان الـ candidates تنحفظ صح من أول لحظة
      this.currentCallId = callId;

      this.setupPeerConnection();

      this.isIncomingCall = false;
      this.isCalling = true;

      const callRef = doc(db, "calls", callId);
      const callSnapshot = await getDoc(callRef);

      if (!callSnapshot.exists()) {
        throw new Error("Call not found");
      }

      const callData = callSnapshot.data();
      console.log("📄 Call data:", callData);

      // ✅ تعيين الـ remote description من الـ offer
      const offerDescription = new RTCSessionDescription(callData.offer);
      await this.peerConnection.setRemoteDescription(offerDescription);
      console.log("✅ Remote description set");

      // ✅ معالجة ICE candidates المعلقة بعد تعيين remote description
      this.processPendingIceCandidates();

      // إنشاء الـ answer
      const answer = await this.peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === "video",
      });

      await this.peerConnection.setLocalDescription(answer);
      console.log("✅ Local answer set");

      // تحديث المستند بالإجابة
      await updateDoc(callRef, {
        status: "accepted",
        answer: {
          sdp: answer.sdp,
          type: answer.type,
        },
        updatedAt: serverTimestamp(),
        startedAt: serverTimestamp(),
      });

      // ✅ إرسال أي ICE candidates تجمّعت أثناء الإعداد
      await this.flushPendingLocalIceCandidates();

      // ✅ الاستماع للتغييرات
      this.listenToCall(callId);

      console.log("✅ Call answered successfully");
      return this.localStream;
    } catch (error) {
      console.error("❌ Error answering call:", error);
      this.cleanup();
      throw error;
    }
  }

  // 🔹 رفض المكالمة
  async rejectCall(callId) {
    console.log("📞 Rejecting call:", callId);

    try {
      const callRef = doc(db, "calls", callId);
      await updateDoc(callRef, {
        status: "rejected",
        updatedAt: serverTimestamp(),
      });

      await this.addCallLog(callId, "rejected");
      this.cleanup();
      console.log("✅ Call rejected");
    } catch (error) {
      console.error("❌ Error rejecting call:", error);
    }
  }

  // 🔹 إنهاء المكالمة
  async endCall() {
    // ✅ نثبّت الـ callId بمتغير محلي فوراً، لأن onSnapshot (listenToCall) رح يستقبل
    //    تحديث status:'ended' اللي رح نرسله تحت وينفّذ cleanup() ويصفّر this.currentCallId
    //    بشكل متزامن (نفس الـ session)، فلازم ما نعتمد على this.currentCallId بعد هيك
    const callId = this.currentCallId;
    console.log("📞 Ending call:", callId);

    if (!callId) {
      console.log("⚠️ No active call to end");
      this.cleanup();
      return;
    }

    try {
      const callRef = doc(db, "calls", callId);
      const callSnapshot = await getDoc(callRef);

      if (callSnapshot.exists()) {
        const data = callSnapshot.data();

        let duration = 0;
        if (data.startedAt) {
          const startTime = data.startedAt.toDate();
          const endTime = new Date();
          duration = Math.floor((endTime - startTime) / 1000);
          console.log("⏱️ Call duration:", duration, "seconds");
        }

        await updateDoc(callRef, {
          status: "ended",
          endedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          duration: duration,
        });

        await this.addCallLog(callId, "answered", duration);
      }

      this.cleanup();
      console.log("✅ Call ended successfully");
    } catch (error) {
      console.error("❌ Error ending call:", error);
      this.cleanup();
    }
  }

  // 🔹 إضافة ICE Candidate محلي — مهمتها الوحيدة: حفظه في Firestore
  //    عشان الطرف الآخر ياخده. ما إلها أي علاقة بالـ peerConnection تبعنا نحنا.
  async addIceCandidate(candidate) {
    if (!this.currentCallId) {
      console.log("⚠️ No current call ID yet, queueing local candidate");
      this.pendingLocalIceCandidates.push(candidate);
      return;
    }

    try {
      const callRef = doc(db, "calls", this.currentCallId);
      await updateDoc(callRef, {
        iceCandidates: arrayUnion({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
          from: this.currentUserId,
          timestamp: new Date().toISOString(),
        }),
        updatedAt: serverTimestamp(),
      });
      console.log("✅ ICE candidate saved to Firestore");
    } catch (error) {
      console.error("❌ Error adding ICE candidate:", error);
    }
  }

  // 🔹 إرسال أي candidates محلية اتجمّعت قبل ما يصير عندنا currentCallId
  async flushPendingLocalIceCandidates() {
    if (this.pendingLocalIceCandidates.length === 0) return;

    console.log(
      "📤 Flushing local candidates queued before call ID existed:",
      this.pendingLocalIceCandidates.length,
    );
    const queued = this.pendingLocalIceCandidates;
    this.pendingLocalIceCandidates = [];

    for (const candidate of queued) {
      await this.addIceCandidate(candidate);
    }
  }

  // 🔹 معالجة ICE candidates البعيدة (من الطرف الآخر) المعلقة لحين توفر remote description
  processPendingIceCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      console.log(
        "⚠️ Cannot process pending candidates: no remote description",
      );
      return;
    }

    console.log(
      "📦 Processing pending remote ICE candidates:",
      this.pendingIceCandidates.length,
    );

    for (const candidate of this.pendingIceCandidates) {
      try {
        const candidateKey = candidate.candidate + (candidate.sdpMid || "");
        if (!this._addedIceCandidates.has(candidateKey)) {
          this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          this._addedIceCandidates.add(candidateKey);
          console.log("✅ Pending remote ICE candidate added");
        }
      } catch (error) {
        console.error("❌ Error adding pending remote ICE candidate:", error);
      }
    }

    // ✅ تفريغ القائمة بعد المعالجة
    this.pendingIceCandidates = [];
  }

  // 🔹 الاستماع لتغييرات المكالمة
  listenToCall(callId) {
    console.log("👂 Listening to call:", callId);

    const callRef = doc(db, "calls", callId);
    const unsubscribe = onSnapshot(
      callRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          console.log("⚠️ Call document deleted");
          this.cleanup();
          return;
        }

        const callData = snapshot.data();
        console.log("📄 Call data updated:", callData.status);

        // ✅ التعامل مع الـ answer إذا كانت المكالمة مقبولة
        if (callData.status === "accepted" && callData.answer) {
          if (
            this.peerConnection &&
            !this.peerConnection.currentRemoteDescription &&
            !this._remoteDescriptionPending
          ) {
            // ✅ نأخذ القفل فوراً (بشكل متزامن) قبل أي await، عشان نمنع أي
            //    استدعاء آخر للـ callback يمرّ من هالشرط بنفس اللحظة
            this._remoteDescriptionPending = true;
            try {
              // ✅ تأكد من أن الـ remote description صالح
              const answerDesc = new RTCSessionDescription(callData.answer);
              await this.peerConnection.setRemoteDescription(answerDesc);
              console.log("✅ Remote answer set");

              // ✅ معالجة ICE candidates المعلقة بعد تعيين remote description
              this.processPendingIceCandidates();
            } catch (error) {
              console.error("❌ Error setting remote description:", error);
              // ✅ لو فشلت، افتح القفل تاني تحسباً لإعادة محاولة لاحقة
              this._remoteDescriptionPending = false;
            }
          }
        }

        // ✅ التعامل مع ICE Candidates - تحسين المعالجة
        if (callData.iceCandidates && this.peerConnection) {
          // ✅ تجاهل الـ candidates تبعتي أنا (خزّنها الطرف الآخر بالمستند بس هي أصلاً عندي)
          const remoteCandidates = callData.iceCandidates.filter(
            (c) => c.from !== this.currentUserId,
          );

          // ✅ انتظر حتى يتم تعيين remote description
          if (!this.peerConnection.remoteDescription) {
            console.log(
              "⏳ Remote description not set yet, storing candidates",
            );
            for (const candidate of remoteCandidates) {
              // ✅ تجنب التكرار
              const candidateKey =
                candidate.candidate + (candidate.sdpMid || "");
              if (!this._addedIceCandidates.has(candidateKey)) {
                this.pendingIceCandidates.push(candidate);
              }
            }
          } else {
            // ✅ إضافة الـ candidates مباشرة
            for (const candidate of remoteCandidates) {
              try {
                const candidateKey =
                  candidate.candidate + (candidate.sdpMid || "");
                if (!this._addedIceCandidates.has(candidateKey)) {
                  await this.peerConnection.addIceCandidate(
                    new RTCIceCandidate(candidate),
                  );
                  this._addedIceCandidates.add(candidateKey);
                  console.log("✅ ICE candidate added from remote");
                }
              } catch (error) {
                console.error("❌ Error adding ICE candidate:", error);
              }
            }
          }
        }

        // ✅ التعامل مع طلب إعادة تفاوض (renegotiation offer) — الطرف التاني عم يحاول يضيف فيديو
        if (
          callData.renegotiationOffer &&
          callData.renegotiationOffer.from !== this.currentUserId &&
          callData.renegotiationOffer.version >
            this._lastProcessedOfferVersion &&
          this.peerConnection &&
          !this._processingRenegotiationOffer
        ) {
          // ✅ نأخذ القفل ونحدّث الرقم فوراً (متزامن) قبل أي await، لتفادي المعالجة المزدوجة
          this._processingRenegotiationOffer = true;
          const offerVersion = callData.renegotiationOffer.version;
          this._lastProcessedOfferVersion = offerVersion;
          try {
            console.log(
              "📥 Renegotiation offer received, version:",
              offerVersion,
            );
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription(callData.renegotiationOffer),
            );
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            await updateDoc(callRef, {
              renegotiationAnswer: {
                sdp: answer.sdp,
                type: answer.type,
                version: offerVersion,
                from: this.currentUserId,
              },
              updatedAt: serverTimestamp(),
            });
            console.log("✅ Renegotiation answer sent, version:", offerVersion);
          } catch (error) {
            console.error("❌ Error handling renegotiation offer:", error);
          } finally {
            this._processingRenegotiationOffer = false;
          }
        }

        // ✅ التعامل مع رد إعادة التفاوض (renegotiation answer) — أنا اللي طلبت إضافة الفيديو
        if (
          callData.renegotiationAnswer &&
          callData.renegotiationAnswer.from !== this.currentUserId &&
          callData.renegotiationAnswer.version === this._lastSentOfferVersion &&
          this.peerConnection &&
          this.peerConnection.signalingState === "have-local-offer" &&
          !this._applyingRenegotiationAnswer
        ) {
          this._applyingRenegotiationAnswer = true;
          try {
            console.log(
              "📥 Renegotiation answer received, version:",
              callData.renegotiationAnswer.version,
            );
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription(callData.renegotiationAnswer),
            );
            console.log("✅ Renegotiation completed — video added to the call");
          } catch (error) {
            console.error("❌ Error applying renegotiation answer:", error);
          } finally {
            this._applyingRenegotiationAnswer = false;
          }
        }

        // إذا انتهت المكالمة من الطرف الآخر
        if (callData.status === "ended" || callData.status === "rejected") {
          console.log("📞 Call ended by remote, status:", callData.status);

          if (this.onCallEnded) {
            this.onCallEnded(callData.status);
          }

          if (callData.status === "missed") {
            await this.addCallLog(callId, "missed");
          }

          this.cleanup();
        }
      },
      (error) => {
        console.error("❌ Error listening to call:", error);
      },
    );

    this.callListeners.push(unsubscribe);
    return unsubscribe;
  }

  // 🔹 تسجيل سجل المكالمات
  async addCallLog(callId, status, duration = 0) {
    try {
      console.log("📝 Adding call log:", { callId, status, duration });

      const callRef = doc(db, "calls", callId);
      const callSnapshot = await getDoc(callRef);

      if (!callSnapshot.exists()) {
        console.warn("⚠️ Call not found for logging");
        return;
      }

      const callData = callSnapshot.data();

      const [callerInfo, receiverInfo] = await Promise.all([
        this.getUserInfo(callData.callerId),
        this.getUserInfo(callData.receiverId),
      ]);

      const logData = {
        callId: callId,
        callerId: callData.callerId,
        receiverId: callData.receiverId,
        type: callData.type || "video",
        status: status,
        duration: duration,
        timestamp: serverTimestamp(),
        callerName: callerInfo?.displayName || callerInfo?.email || "Unknown",
        receiverName:
          receiverInfo?.displayName || receiverInfo?.email || "Unknown",
      };

      await setDoc(doc(collection(db, "call_logs")), logData);
      console.log("✅ Call log added");
    } catch (error) {
      console.error("❌ Error adding call log:", error);
    }
  }

  // 🔹 تنظيف الموارد
  cleanup() {
    console.log("🧹 Cleaning up call resources");

    this.isCalling = false;
    this.isIncomingCall = false;
    this.currentCallId = null;
    this.pendingIceCandidates = [];
    this.pendingLocalIceCandidates = [];
    this._addedIceCandidates = new Set();
    this._remoteDescriptionPending = false;
    this._lastProcessedOfferVersion = 0;
    this._lastSentOfferVersion = 0;
    this._processingRenegotiationOffer = false;
    this._applyingRenegotiationAnswer = false;

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
        console.log("🛑 Local track stopped:", track.kind);
      });
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => {
        track.stop();
        console.log("🛑 Remote track stopped:", track.kind);
      });
      this.remoteStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
      console.log("🔗 Peer connection closed");
    }

    this.callListeners.forEach((unsubscribe) => {
      try {
        unsubscribe();
        console.log("👂 Listener unsubscribed");
      } catch (e) {
        console.warn("Error unsubscribing listener:", e);
      }
    });
    this.callListeners = [];

    console.log("✅ Cleanup completed");
  }

  // 🔹 إلغاء الاشتراك من الاستماع
  unsubscribe() {
    this.callListeners.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (e) {}
    });
    this.callListeners = [];
  }

  // 🔹 تبديل حالة الكاميرا
  toggleCamera() {
    if (!this.localStream) return false;

    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) return false;

    const enabled = !videoTracks[0].enabled;
    videoTracks.forEach((track) => (track.enabled = enabled));
    console.log("📷 Camera toggled:", enabled);
    return enabled;
  }

  // 🔹 هل في video track أصلاً بالمكالمة الحالية؟
  hasVideoTrack() {
    return !!(this.localStream && this.localStream.getVideoTracks().length > 0);
  }

  // 🔹 إضافة فيديو لمكالمة صوتية شغّالة (renegotiation) — بتحوّل المكالمة لفيديو بالمنتصف
  async enableVideoDuringCall() {
    if (!this.peerConnection || !this.currentCallId) {
      console.warn("⚠️ No active call to add video to");
      return false;
    }

    // لو أصلاً في video track (متوقف بس)، فقط فعّله
    const existingVideoTrack = this.localStream?.getVideoTracks()[0];
    if (existingVideoTrack) {
      existingVideoTrack.enabled = true;
      console.log("📷 Existing video track re-enabled");
      return true;
    }

    try {
      console.log("🎥 Requesting camera to add video mid-call...");
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      const videoTrack = videoStream.getVideoTracks()[0];

      // ✅ إضافة الـ track للـ localStream — العنصر <video> المحلي أصلاً متعلق
      //    بنفس الـ MediaStream object فبيبيّن الكاميرا تلقائياً بدون أي تعديل UI إضافي
      this.localStream.addTrack(videoTrack);

      // ✅ إضافة الـ track لـ peerConnection — هاد بيحتاج renegotiation عشان
      //    الطرف التاني يعرف يستقبله
      this.peerConnection.addTrack(videoTrack, this.localStream);

      // ✅ إنشاء offer جديد لإعادة التفاوض
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this._lastSentOfferVersion += 1;
      const version = this._lastSentOfferVersion;

      const callRef = doc(db, "calls", this.currentCallId);
      await updateDoc(callRef, {
        renegotiationOffer: {
          sdp: offer.sdp,
          type: offer.type,
          version,
          from: this.currentUserId,
        },
        isVideoEnabled: true,
        updatedAt: serverTimestamp(),
      });

      console.log(
        "📤 Renegotiation offer sent to add video, version:",
        version,
      );
      return true;
    } catch (error) {
      console.error("❌ Error enabling video mid-call:", error);
      return false;
    }
  }

  // 🔹 تبديل حالة الميكروفون
  toggleMicrophone() {
    if (!this.localStream) return false;

    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) return false;

    const enabled = !audioTracks[0].enabled;
    audioTracks.forEach((track) => (track.enabled = enabled));
    console.log("🎤 Microphone toggled:", enabled);
    return enabled;
  }

  // 🔹 تبديل الكاميرا الأمامية/الخلفية
  async switchCamera() {
    if (!this.localStream) return false;

    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) return false;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(
        (device) => device.kind === "videoinput",
      );

      if (videoDevices.length < 2) {
        console.log("⚠️ Only one camera available");
        return false;
      }

      const currentTrack = videoTracks[0];
      const currentDeviceId = currentTrack.getSettings().deviceId;
      const currentIndex = videoDevices.findIndex(
        (d) => d.deviceId === currentDeviceId,
      );
      const nextIndex = (currentIndex + 1) % videoDevices.length;
      const nextDevice = videoDevices[nextIndex];

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: nextDevice.deviceId },
        audio: false,
      });

      const newTrack = stream.getVideoTracks()[0];

      const senders = this.peerConnection.getSenders();
      const videoSender = senders.find(
        (sender) => sender.track.kind === "video",
      );

      if (videoSender) {
        await videoSender.replaceTrack(newTrack);
      }

      const oldTrack = videoTracks[0];
      this.localStream.removeTrack(oldTrack);
      this.localStream.addTrack(newTrack);
      oldTrack.stop();

      console.log("🔄 Camera switched to:", nextDevice.label);
      return true;
    } catch (error) {
      console.error("❌ Error switching camera:", error);
      return false;
    }
  }

  // 🔹 التحقق من وجود كاميرا
  async hasCamera() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some((device) => device.kind === "videoinput");
    } catch (error) {
      console.error("Error checking camera:", error);
      return false;
    }
  }

  // 🔹 التحقق من وجود ميكروفون
  async hasMicrophone() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some((device) => device.kind === "audioinput");
    } catch (error) {
      console.error("Error checking microphone:", error);
      return false;
    }
  }
}

export default new CallServiceChat();
