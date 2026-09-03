// src/services/CallServiceGroup.js
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
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "../../../config/firebase";

class CallServiceGroup {
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
    this.onParticipantJoined = null;
    this.onParticipantLeft = null;
    this.pendingIceCandidates = [];
    this.pendingLocalIceCandidates = [];
    this._addedIceCandidates = new Set();
    this._remoteDescriptionPending = false;
    this.participantStreams = new Map();
    this.rejectedParticipants = new Set(); // ✅ تخزين الأعضاء الذين رفضوا
    this.groupInfo = null; // ✅ تخزين معلومات الجروب
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

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    this.peerConnection.ontrack = (event) => {
      console.log("🔵 Remote track received in group call:", event.track.kind);

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

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("🧊 ICE candidate collected for group call");
        this.addIceCandidate(event.candidate);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log(
        "🔗 Group call connection state:",
        this.peerConnection.connectionState,
      );

      if (this.peerConnection.connectionState === "connected") {
        if (this.onCallStatusChanged) {
          this.onCallStatusChanged("connected");
        }
      } else if (this.peerConnection.connectionState === "failed") {
        console.error("❌ Group call connection failed");
      }
    };

    return this.peerConnection;
  }

  // 🔹 جلب معلومات الجروب
  async getGroupInfo(groupId) {
    try {
      const groupRef = doc(db, "groups", groupId);
      const groupSnapshot = await getDoc(groupRef);
      if (groupSnapshot.exists()) {
        this.groupInfo = groupSnapshot.data();
        return this.groupInfo;
      }
      return null;
    } catch (error) {
      console.error("Error fetching group info:", error);
      return null;
    }
  }

  // 🔹 بدء مكالمة جماعية
  async startGroupCall(
    groupId,
    callerId,
    chatId,
    type = "video",
    members = [],
  ) {
    if (this.isCalling) {
      console.log("⚠️ Group call already in progress");
      return null;
    }

    try {
      console.log(
        "📞 Starting group call for group:",
        groupId,
        "members:",
        members.length,
      );

      // ✅ جلب معلومات الجروب
      await this.getGroupInfo(groupId);

      this.pendingIceCandidates = [];
      this.pendingLocalIceCandidates = [];
      this._addedIceCandidates = new Set();
      this._remoteDescriptionPending = false;
      this.rejectedParticipants = new Set();

      const constraints = {
        video: type === "video",
        audio: true,
      };

      console.log("🎥 Getting user media with constraints:", constraints);
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

      this.isCalling = true;
      this.setupPeerConnection();

      console.log("📤 Creating offer for group call...");
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === "video",
      });

      await this.peerConnection.setLocalDescription(offer);
      console.log("✅ Local description set for group call");

      const callRef = doc(collection(db, "group_calls"));
      this.currentCallId = callRef.id;

      const callData = {
        groupId: groupId,
        callerId: callerId,
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
        participants: [callerId],
        invitedMembers: members,
        participantAnswers: {},
        rejectedParticipants: [], // ✅ قائمة من رفضوا
        activeParticipants: [callerId], // ✅ المشاركين النشطين حالياً
      };

      console.log("💾 Saving group call to Firestore:", callData);
      await setDoc(callRef, callData);

      await this.flushPendingLocalIceCandidates();
      this.listenToGroupCall(callRef.id);

      console.log("✅ Group call started successfully, ID:", callRef.id);
      return { callId: callRef.id, stream: this.localStream };
    } catch (error) {
      console.error("❌ Error starting group call:", error);
      this.cleanup();
      throw error;
    }
  }

  // 🔹 الاستماع للمكالمات الجماعية الواردة
  listenForIncomingGroupCalls(userId, onCallReceived) {
    console.log("👂 Listening for incoming group calls for user:", userId);
    this.currentUserId = userId;

    const callsQuery = query(
      collection(db, "group_calls"),
      where("invitedMembers", "array-contains", userId),
      where("status", "in", ["calling", "ringing", "active"]),
    );

    const unsubscribe = onSnapshot(
      callsQuery,
      async (snapshot) => {
        console.log(
          "📨 Incoming group calls snapshot received, size:",
          snapshot.size,
        );

        const calls = [];
        snapshot.forEach((doc) => {
          const callData = doc.data();
          // ✅ تجاهل المكالمات التي رفضها المستخدم بالفعل
          if (callData.rejectedParticipants?.includes(userId)) {
            return;
          }
          calls.push({
            docId: doc.id,
            ...callData,
          });
        });

        // ترتيب تنازلي حسب createdAt
        calls.sort((a, b) => {
          const timeA = a.createdAt?.toDate?.() || new Date(0);
          const timeB = b.createdAt?.toDate?.() || new Date(0);
          return timeB - timeA;
        });

        if (calls.length > 0) {
          const latestCall = calls[0];
          const callData = latestCall;

          // ✅ إذا كان المستخدم هو المتصل أو بالفعل في المكالمة، تجاهل
          if (
            callData.callerId === userId ||
            callData.participants?.includes(userId)
          ) {
            return;
          }

          // ✅ إذا كانت المكالمة ended، تجاهل
          if (callData.status === "ended") {
            return;
          }

          console.log("📞 Incoming group call detected:", callData);

          // ✅ جلب معلومات الجروب
          let groupInfo = null;
          if (callData.groupId) {
            groupInfo = await this.getGroupInfo(callData.groupId);
          }

          // ✅ جلب معلومات المتصل
          const callerInfo = await this.getUserInfo(callData.callerId);

          // ✅ جلب معلومات المشاركين الحاليين
          const participantPromises = (callData.participants || [])
            .filter((id) => id !== callData.callerId)
            .map((id) => this.getUserInfo(id));

          const participantsInfo = await Promise.all(participantPromises);

          onCallReceived({
            callId: callData.docId,
            ...callData,
            callerInfo: callerInfo,
            groupInfo: groupInfo, // ✅ إرسال معلومات الجروب
            participantsInfo: [callerInfo, ...participantsInfo.filter(Boolean)],
            isGroupCall: true,
          });
        }
      },
      (error) => {
        console.error("❌ Error listening for group calls:", error);
      },
    );

    this.callListeners.push(unsubscribe);
    return unsubscribe;
  }

  // 🔹 رفض المكالمة الجماعية (للمستخدم الفرد)
  async rejectGroupCall(callId, userId) {
    console.log("📞 Rejecting group call:", callId, "for user:", userId);

    try {
      const callRef = doc(db, "group_calls", callId);

      // ✅ إضافة المستخدم إلى قائمة الرافضين
      await updateDoc(callRef, {
        rejectedParticipants: arrayUnion(userId),
        updatedAt: serverTimestamp(),
      });

      // ✅ التحقق: إذا كل الأعضاء رفضوا، ننهي المكالمة
      const callSnapshot = await getDoc(callRef);
      if (callSnapshot.exists()) {
        const callData = callSnapshot.data();
        const allMembers = callData.invitedMembers || [];
        const rejected = callData.rejectedParticipants || [];

        // ✅ الأعضاء الذين لم يرفضوا ولم ينضموا بعد
        const pendingMembers = allMembers.filter(
          (m) => !rejected.includes(m) && !callData.participants?.includes(m),
        );

        // ✅ إذا لم يبقى أحد غير المتصل، ننهي المكالمة
        if (pendingMembers.length === 0 && callData.participants?.length <= 1) {
          console.log("📞 All members rejected or left, ending group call");
          await updateDoc(callRef, {
            status: "ended",
            endedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          this.cleanup();
        }
      }

      console.log("✅ Group call rejected by user:", userId);
    } catch (error) {
      console.error("❌ Error rejecting group call:", error);
    }
  }

  // 🔹 الانضمام إلى مكالمة جماعية
  async joinGroupCall(callId, type = "video") {
    console.log("📞 Joining group call:", callId);

    try {
      this.pendingIceCandidates = [];
      this.pendingLocalIceCandidates = [];
      this._addedIceCandidates = new Set();
      this._remoteDescriptionPending = false;

      const constraints = {
        video: type === "video",
        audio: true,
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("✅ Local stream obtained for group call");

      this.currentCallId = callId;
      this.setupPeerConnection();

      this.isIncomingCall = false;
      this.isCalling = true;

      const callRef = doc(db, "group_calls", callId);
      const callSnapshot = await getDoc(callRef);

      if (!callSnapshot.exists()) {
        throw new Error("Group call not found");
      }

      const callData = callSnapshot.data();

      // ✅ إضافة المستخدم إلى قائمة المشاركين
      await updateDoc(callRef, {
        participants: arrayUnion(this.currentUserId),
        activeParticipants: arrayUnion(this.currentUserId),
        updatedAt: serverTimestamp(),
        // ✅ إزالة من قائمة الرافضين إذا كان موجوداً
        rejectedParticipants: arrayRemove(this.currentUserId),
      });

      // في دالة joinGroupCall - بعد إضافة المستخدم
      await updateDoc(callRef, {
        participants: arrayUnion(this.currentUserId),
        activeParticipants: arrayUnion(this.currentUserId), // ✅ إضافة للمشاركين النشطين
        updatedAt: serverTimestamp(),
        rejectedParticipants: arrayRemove(this.currentUserId),
      });

      // في دالة listenToGroupCall - إضافة مراقبة للمشاركين النشطين
      // أضف هذا الجزء في onSnapshot
      if (callData.activeParticipants) {
        // تحديث قائمة المشاركين النشطين
        console.log("👥 Active participants:", callData.activeParticipants);
      }

      // في دالة leaveGroupCall - إزالة من المشاركين النشطين
      await updateDoc(callRef, {
        participants: arrayRemove(this.currentUserId),
        activeParticipants: arrayRemove(this.currentUserId),
        updatedAt: serverTimestamp(),
      });

      const offerDescription = new RTCSessionDescription(callData.offer);
      await this.peerConnection.setRemoteDescription(offerDescription);
      console.log("✅ Remote description set for group call");

      this.processPendingIceCandidates();

      const answer = await this.peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === "video",
      });

      await this.peerConnection.setLocalDescription(answer);
      console.log("✅ Local answer set for group call");

      await updateDoc(callRef, {
        status: "active",
        [`participantAnswers.${this.currentUserId}`]: {
          sdp: answer.sdp,
          type: answer.type,
        },
        updatedAt: serverTimestamp(),
        startedAt: serverTimestamp(),
      });

      await this.flushPendingLocalIceCandidates();
      this.listenToGroupCall(callId);

      // ✅ إعلام أن مشارك جديد انضم
      if (this.onParticipantJoined) {
        this.onParticipantJoined(this.currentUserId);
      }

      console.log("✅ Joined group call successfully");
      return this.localStream;
    } catch (error) {
      console.error("❌ Error joining group call:", error);
      this.cleanup();
      throw error;
    }
  }

  // 🔹 الاستماع لتغييرات المكالمة الجماعية
  listenToGroupCall(callId) {
    console.log("👂 Listening to group call:", callId);

    const callRef = doc(db, "group_calls", callId);
    const unsubscribe = onSnapshot(
      callRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          console.log("⚠️ Group call document deleted");
          this.cleanup();
          return;
        }

        const callData = snapshot.data();
        console.log("📄 Group call data updated:", callData.status);

        // ✅ معالجة إجابات المشاركين الجدد
        if (callData.participantAnswers && this.peerConnection) {
          const otherAnswers = Object.keys(callData.participantAnswers).filter(
            (id) => id !== this.currentUserId,
          );

          for (const userId of otherAnswers) {
            const answer = callData.participantAnswers[userId];
            if (!this.peerConnection.currentRemoteDescription) {
              try {
                const answerDesc = new RTCSessionDescription(answer);
                await this.peerConnection.setRemoteDescription(answerDesc);
                console.log("✅ Remote answer set for participant:", userId);
                this.processPendingIceCandidates();
              } catch (error) {
                console.error("❌ Error setting remote description:", error);
              }
            }
          }
        }

        // ✅ معالجة ICE Candidates
        if (callData.iceCandidates && this.peerConnection) {
          const remoteCandidates = callData.iceCandidates.filter(
            (c) => c.from !== this.currentUserId,
          );

          if (!this.peerConnection.remoteDescription) {
            for (const candidate of remoteCandidates) {
              const candidateKey =
                candidate.candidate + (candidate.sdpMid || "");
              if (!this._addedIceCandidates.has(candidateKey)) {
                this.pendingIceCandidates.push(candidate);
              }
            }
          } else {
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

        // ✅ معالجة انتهاء المكالمة (فقط إذا انتهت فعلاً)
        if (callData.status === "ended") {
          console.log("📞 Group call ended");
          if (this.onCallEnded) {
            this.onCallEnded("ended");
          }
          this.cleanup();
        }
      },
      (error) => {
        console.error("❌ Error listening to group call:", error);
      },
    );

    this.callListeners.push(unsubscribe);
    return unsubscribe;
  }

  // 🔹 إضافة ICE Candidate
  async addIceCandidate(candidate) {
    if (!this.currentCallId) {
      console.log("⚠️ No current call ID yet, queueing local candidate");
      this.pendingLocalIceCandidates.push(candidate);
      return;
    }

    try {
      const callRef = doc(db, "group_calls", this.currentCallId);
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

  // 🔹 إرسال candidates معلقة
  async flushPendingLocalIceCandidates() {
    if (this.pendingLocalIceCandidates.length === 0) return;

    console.log(
      "📤 Flushing local candidates queued:",
      this.pendingLocalIceCandidates.length,
    );
    const queued = this.pendingLocalIceCandidates;
    this.pendingLocalIceCandidates = [];

    for (const candidate of queued) {
      await this.addIceCandidate(candidate);
    }
  }

  // 🔹 معالجة ICE candidates المعلقة
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

    this.pendingIceCandidates = [];
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

  // 🔹 إنهاء المكالمة الجماعية (للمتصل فقط)
  async endGroupCall() {
    const callId = this.currentCallId;
    console.log("📞 Ending group call:", callId);

    if (!callId) {
      console.log("⚠️ No active group call to end");
      this.cleanup();
      return;
    }

    try {
      const callRef = doc(db, "group_calls", callId);
      const callSnapshot = await getDoc(callRef);

      if (callSnapshot.exists()) {
        const data = callSnapshot.data();

        let duration = 0;
        if (data.startedAt) {
          const startTime = data.startedAt.toDate();
          const endTime = new Date();
          duration = Math.floor((endTime - startTime) / 1000);
          console.log("⏱️ Group call duration:", duration, "seconds");
        }

        await updateDoc(callRef, {
          status: "ended",
          endedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          duration: duration,
        });
      }

      this.cleanup();
      console.log("✅ Group call ended successfully");
    } catch (error) {
      console.error("❌ Error ending group call:", error);
      this.cleanup();
    }
  }

  // 🔹 مغادرة المكالمة الجماعية (لمستخدم فرد)
  async leaveGroupCall() {
    const callId = this.currentCallId;
    console.log("📞 Leaving group call:", callId);

    if (!callId) {
      console.log("⚠️ No active group call to leave");
      this.cleanup();
      return;
    }

    try {
      const callRef = doc(db, "group_calls", callId);

      await updateDoc(callRef, {
        participants: arrayRemove(this.currentUserId),
        activeParticipants: arrayRemove(this.currentUserId),
        updatedAt: serverTimestamp(),
      });

      this.cleanup();
      console.log("✅ Left group call successfully");
    } catch (error) {
      console.error("❌ Error leaving group call:", error);
      this.cleanup();
    }
  }

  // 🔹 تنظيف الموارد
  cleanup() {
    console.log("🧹 Cleaning up group call resources");

    this.isCalling = false;
    this.isIncomingCall = false;
    this.currentCallId = null;
    this.pendingIceCandidates = [];
    this.pendingLocalIceCandidates = [];
    this._addedIceCandidates = new Set();
    this._remoteDescriptionPending = false;
    this.rejectedParticipants = new Set();

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

    this.participantStreams.clear();

    console.log("✅ Group call cleanup completed");
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
}

export default new CallServiceGroup();
