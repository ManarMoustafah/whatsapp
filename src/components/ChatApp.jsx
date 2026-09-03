// src/components/whatsapp/ChatApp.jsx
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { db } from "../config/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  serverTimestamp,
  updateDoc,
  doc,
  setDoc,
  getDoc,
  increment,
  limit,
  startAfter,
  getDocs,
} from "firebase/firestore";
import Sidebar from "./whatsapp/Sidebar";
import Spinner from "./whatsapp/looding";
import endCallIcon from "../assets/end-call.png";
import answerCallIcon from "../assets/answer-call.png";
import whatsappIcon from "../../public/whatsapp.png";
import callService from "./whatsapp/Services/CallServiceChat";
import callServiceGroup from "./whatsapp/Services/CallServiceGroup";

// تحميل كسول: بس واحد من هدول بيظهر بنفس اللحظة (شات أو جروب)،
// و UsersList مجرد مودال بيظهر عند الحاجة بس (زر +)
const ChatWindow = lazy(() => import("./whatsapp/Chats/ChatWindow"));
const GroupWindow = lazy(() => import("./whatsapp/Groups/GroupWindos"));
const UsersList = lazy(() => import("./whatsapp/sideBar/UsersList"));

const MESSAGES_PAGE_SIZE = 13;

const ChatApp = ({ user, showToast }) => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [showUsersList, setShowUsersList] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingChats, setLoadingChats] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const oldestMessageDocRef = useRef(null);
  const sidebarRef = useRef(null);
  const [isInCall, setIsInCall] = useState(false);
  const [callStream, setCallStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCall, setOutgoingCall] = useState(null);
  const [participants, setParticipants] = useState([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // =========================================
  // Routing: قراءة الـ URL والتنقل برمجياً
  // =========================================
  const { userId, groupId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // =========================================
  // مزامنة عرض السايدبار (شاتس/جروبات) مع الرابط
  // بتغطي حالة الدخول المباشر للرابط أو عمل ريفرش
  // (بدون هاي الخطوة، لو فتحت /group/xyz مباشرة كان السايدبار
  // بيرجع لقائمة الشاتس الافتراضية بدل قائمة الجروبات)
  // =========================================
  useEffect(() => {
    if (!sidebarRef.current) return;
    const isGroupsView =
      location.pathname === "/groups" ||
      location.pathname.startsWith("/group/");
    if (isGroupsView) {
      sidebarRef.current.switchToGroups();
    } else {
      sidebarRef.current.switchToChats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // =========================================
  // مزامنة selectedUser مع باراميتر الرابط (/chat/:userName)
  // بتغطي حالتين: الضغط من السايدبار، وفتح الرابط مباشرة/عمل ريفرش
  // =========================================
  useEffect(() => {
    if (!userId) return;
    if (loadingUsers) return;
    const targetId = userId;
    if (selectedUser?.uid === targetId) return;
    const userFromList = allUsers.find((u) => u.uid === targetId);
    if (userFromList) {
      setSelectedGroup(null);
      setSelectedUser(userFromList);
    } else {
      showToast("❌ المحادثة غير موجودة", "error");
      navigate("/chat", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, allUsers, loadingUsers]);

  // =========================================
  // مزامنة selectedGroup مع باراميتر الرابط (/group/:groupName)
  // بما إنو قائمة الجروبات مش محفوظة جوا ChatApp (بتتحمل جوا GroupsList)،
  // بنجيب بيانات الجروب مباشرة من Firestore وقت الحاجة (بالـ ID المستخرج من السلاج)
  // =========================================
  useEffect(() => {
    if (!groupId) return;
    const targetId = groupId;
    if (selectedGroup?.id === targetId) return;
    let isCancelled = false;
    (async () => {
      try {
        const groupSnap = await getDoc(doc(db, "groups", targetId));
        if (isCancelled) return;
        if (groupSnap.exists()) {
          setSelectedUser(null);
          setSelectedGroup({ id: groupSnap.id, ...groupSnap.data() });
        } else {
          showToast("❌ الجروب غير موجود", "error");
          navigate("/chat", { replace: true });
        }
      } catch (error) {
        console.error("❌ Error fetching group by id:", error);
      }
    })();
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // =========================================
  // Get users from Firestore
  // =========================================
  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const usersList = snapshot.docs
          .map((docSnapshot) => ({
            id: docSnapshot.id,
            ...docSnapshot.data(),
          }))
          .filter((userData) => userData.uid !== user.uid);
        setAllUsers(usersList);
        setSelectedUser((previousUser) => {
          if (!previousUser?.uid) {
            return previousUser;
          }
          const updatedUser = usersList.find(
            (userData) => userData.uid === previousUser.uid,
          );
          return updatedUser || previousUser;
        });
        setLoadingUsers(false);
      },
      (error) => {
        console.error("Error fetching users:", error);
        setLoadingUsers(false);
      },
    );
    return unsubscribe;
  }, [user?.uid]);

  // =========================================
  // Get chats from Firestore
  // =========================================
  useEffect(() => {
    if (!user?.uid) return;
    const chatsQuery = query(
      collection(db, "chats"),
      where("participants", "array-contains", user.uid),
    );
    const unsubscribe = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const chatList = [];
        snapshot.docs.forEach((chatDoc) => {
          const chatData = chatDoc.data();
          const otherUserId = chatData.participants.find(
            (id) => id !== user.uid,
          );
          const otherUser = allUsers.find(
            (userData) => userData.uid === otherUserId,
          );
          if (!otherUser) return;
          chatList.push({
            chatId: chatDoc.id,
            ...chatData,
            otherUser,
            unreadCount: chatData.unreadCounts?.[user.uid] || 0,
          });
        });
        chatList.sort((a, b) => {
          const timeA = a.lastMessageTime?.toDate?.() || new Date(0);
          const timeB = b.lastMessageTime?.toDate?.() || new Date(0);
          return timeB - timeA;
        });
        setChats(chatList);
        setLoadingChats(false);
      },
      (error) => {
        console.error("Error listening to chats:", error);
        setLoadingChats(false);
      },
    );
    return unsubscribe;
  }, [user?.uid, allUsers]);

  // =========================================
  // Get messages
  // =========================================
  useEffect(() => {
    if (!user?.uid || !selectedUser?.uid || selectedGroup) {
      setMessages([]);
      oldestMessageDocRef.current = null;
      setHasMoreMessages(true);
      return;
    }
    const chatId = [user.uid, selectedUser.uid].sort().join("_");
    const messagesQuery = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("timestamp", "desc"),
      limit(MESSAGES_PAGE_SIZE),
    );
    setHasMoreMessages(true);
    oldestMessageDocRef.current = null;
    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const messagesList = snapshot.docs
          .map((messageDoc) => ({
            id: messageDoc.id,
            ...messageDoc.data(),
          }))
          .reverse();
        setMessages(messagesList);
        if (snapshot.docs.length > 0) {
          oldestMessageDocRef.current = snapshot.docs[snapshot.docs.length - 1];
        }
        setHasMoreMessages(snapshot.docs.length === MESSAGES_PAGE_SIZE);
      },
      (error) => {
        console.error("Error fetching messages:", error);
      },
    );
    return unsubscribe;
  }, [user?.uid, selectedUser?.uid, selectedGroup]);

  // =========================================
  // تحديث حالة رسائلي من "sent" ✓ إلى "delivered" ✓✓ رمادي
  // لما الطرف التاني (selectedUser) يصير أونلاين، والمحادثة معاه مفتوحة عندي حالياً
  // (بيراقب selectedUser.online اللي بينحدث لحظياً من useEffect قائمة اليوزرز)
  // =========================================
  useEffect(() => {
    if (!user?.uid || !selectedUser?.uid || selectedGroup) return;
    if (!selectedUser.online) return;

    const chatId = [user.uid, selectedUser.uid].sort().join("_");
    const pendingMessages = messages.filter(
      (message) => message.senderId === user.uid && message.status === "sent",
    );
    if (pendingMessages.length === 0) return;

    pendingMessages.forEach((message) => {
      updateDoc(doc(db, "chats", chatId, "messages", message.id), {
        status: "delivered",
      }).catch((error) => {
        console.error("❌ Error upgrading message to delivered:", error);
      });
    });
  }, [user?.uid, selectedUser?.uid, selectedUser?.online, selectedGroup, messages]);

  // =========================================
  // Load more messages
  // =========================================
  const loadMoreMessages = async () => {
    if (!user?.uid || !selectedUser?.uid) return;
    if (!hasMoreMessages || loadingMoreMessages) return;
    if (!oldestMessageDocRef.current) return;
    setLoadingMoreMessages(true);
    try {
      const chatId = [user.uid, selectedUser.uid].sort().join("_");
      const olderMessagesQuery = query(
        collection(db, "chats", chatId, "messages"),
        orderBy("timestamp", "desc"),
        startAfter(oldestMessageDocRef.current),
        limit(MESSAGES_PAGE_SIZE),
      );
      const snapshot = await getDocs(olderMessagesQuery);
      const olderMessages = snapshot.docs
        .map((messageDoc) => ({
          id: messageDoc.id,
          ...messageDoc.data(),
        }))
        .reverse();
      setMessages((previousMessages) => [
        ...olderMessages,
        ...previousMessages,
      ]);
      if (snapshot.docs.length > 0) {
        oldestMessageDocRef.current = snapshot.docs[snapshot.docs.length - 1];
      }
      setHasMoreMessages(snapshot.docs.length === MESSAGES_PAGE_SIZE);
    } catch (error) {
      console.error("Error loading more messages:", error);
      showToast("❌ فشل تحميل الرسائل القديمة", "error");
    } finally {
      setLoadingMoreMessages(false);
    }
  };

  // =========================================
  // Send message
  // =========================================
  const sendMessage = async (text) => {
    if (!text.trim()) {
      showToast("📝 الرجاء كتابة رسالة", "error");
      return;
    }
    if (!selectedUser?.uid) {
      showToast("👤 الرجاء اختيار مستخدم أولاً", "error");
      return;
    }
    try {
      const chatId = [user.uid, selectedUser.uid].sort().join("_");

      // 👈 بننشئ الـ ref قبل الكتابة، هيك بنقدر نحدّث حالتها لاحقاً
      const newMessageRef = doc(collection(db, "chats", chatId, "messages"));

      // 1) "sending" 🕐 — أول ما تنكتب محلياً وقبل ما توصل تأكيد من السيرفر
      await setDoc(newMessageRef, {
        text: text.trim(),
        senderId: user.uid,
        timestamp: serverTimestamp(),
        status: "sending", // 👈 "sending" | "sent" | "delivered" | "seen"
      });

      const chatRef = doc(db, "chats", chatId);
      await setDoc(
        chatRef,
        {
          participants: [user.uid, selectedUser.uid],
          lastMessage: text.trim(),
          lastMessageTime: serverTimestamp(),
          unreadCounts: {
            [user.uid]: 0,
            [selectedUser.uid]: increment(1),
          },
        },
        { merge: true },
      );

      // 2) بعد ما توصل الرسالة فعلياً للسيرفر:
      //    - لو المستلم أونلاين حالياً → "delivered" ✓✓ رمادي
      //    - لو أوف لاين / لاست سين → "sent" ✓ رمادي واحد
      const isRecipientOnline = Boolean(selectedUser.online);
      await updateDoc(newMessageRef, {
        status: isRecipientOnline ? "delivered" : "sent",
      });
    } catch (error) {
      console.error("Error sending message:", error);
      showToast("❌ فشل إرسال الرسالة", "error");
    }
  };

  // =========================================
  // Start new chat
  // =========================================
  const startNewChat = async (userToChat) => {
    if (!user?.uid || !userToChat?.uid) return;
    try {
      const chatId = [user.uid, userToChat.uid].sort().join("_");
      const chatRef = doc(db, "chats", chatId);
      const chatSnapshot = await getDoc(chatRef);
      if (!chatSnapshot.exists()) {
        await setDoc(chatRef, {
          participants: [user.uid, userToChat.uid],
          lastMessage: "",
          lastMessageTime: serverTimestamp(),
          unreadCounts: {
            [user.uid]: 0,
            [userToChat.uid]: 0,
          },
        });
      } else {
        await updateDoc(chatRef, {
          [`unreadCounts.${user.uid}`]: 0,
        });
      }
      setSelectedGroup(null);
      setSelectedUser(userToChat);
      setShowUsersList(false);
      navigate(`/chat/${userToChat.uid}`);
      showToast(
        `💬 بدأت محادثة مع ${userToChat.displayName || userToChat.email}`,
        "success",
      );
    } catch (error) {
      console.error("Error starting new chat:", error);
      showToast("❌ فشل بدء المحادثة", "error");
    }
  };

  // =========================================
  // Users without chats
  // =========================================
  const newUsers =
    loadingUsers || loadingChats
      ? []
      : allUsers.filter(
          (userData) =>
            !chats.some((chat) => chat.otherUser?.uid === userData.uid),
        );

  // =========================================
  // Handle Select Group
  // =========================================
  const handleSelectGroup = (group) => {
    setSelectedGroup(group);
    setSelectedUser(null);
    setMessages([]);
    navigate(`/group/${group.id}`);
  };

  // =========================================
  // Handle Select User
  // =========================================
  const handleSelectUser = async (targetUser) => {
    setSelectedUser(targetUser);
    setSelectedGroup(null);
    setMessages([]);
    navigate(`/chat/${targetUser.uid}`);
    if (!user?.uid || !targetUser?.uid) return;
    try {
      const chatId = [user.uid, targetUser.uid].sort().join("_");
      const chatRef = doc(db, "chats", chatId);
      await updateDoc(chatRef, {
        [`unreadCounts.${user.uid}`]: 0,
      });
    } catch (error) {
      console.error("Error resetting unread count:", error);
    }
  };

  // =========================================
  // دوال المكالمات الفردية
  // =========================================
  const startCall = async (receiverId, type = "video") => {
    if (!user?.uid || !receiverId) {
      showToast("❌ لا يمكن بدء المكالمة", "error");
      return;
    }
    if (isInCall) {
      showToast("⚠️ أنت في مكالمة حالياً", "error");
      return;
    }
    try {
      console.log("📞 Starting call to:", receiverId, "type:", type);
      callService.currentUserId = user.uid;
      setOutgoingCall({ receiverId, type });
      callService.onRemoteStream = (stream) => {
        console.log("📹 Remote stream received");
        setRemoteStream(stream);
        setIsInCall(true);
        setOutgoingCall(null);
        showToast("📞 تم الاتصال", "success");
      };
      callService.onCallEnded = (status) => {
        console.log("📞 Call ended with status:", status);
        setIsInCall(false);
        setCallStream(null);
        setRemoteStream(null);
        setOutgoingCall(null);
        setIncomingCall(null);
        const statusMessages = {
          ended: "📞 انتهت المكالمة",
          rejected: "📞 تم رفض المكالمة",
          missed: "📞 مكالمة فائتة",
        };
        showToast(statusMessages[status] || "📞 انتهت المكالمة", "info");
      };
      callService.onCallStatusChanged = (status) => {
        console.log("📞 Call status changed:", status);
        if (status === "connected") {
          showToast("📞 تم الاتصال", "success");
        }
      };
      const chatId = [user.uid, receiverId].sort().join("_");
      const result = await callService.startCall(receiverId, chatId, type);
      if (result) {
        setCallStream(result.stream);
        console.log("✅ Call started successfully");
      } else {
        setOutgoingCall(null);
      }
    } catch (error) {
      console.error("❌ Error starting call:", error);
      setIsInCall(false);
      setCallStream(null);
      setRemoteStream(null);
      setOutgoingCall(null);
      showToast(`❌ فشل بدء المكالمة: ${error.message}`, "error");
    }
  };

  const cancelOutgoingCall = async () => {
    try {
      console.log("📞 Cancelling outgoing call");
      if (outgoingCall?.isGroupCall) {
        await callServiceGroup.endGroupCall();
      } else {
        await callService.endCall();
      }
    } catch (error) {
      console.error("❌ Error cancelling call:", error);
    } finally {
      setOutgoingCall(null);
      setCallStream(null);
    }
  };

  const answerCall = async (callId, type = "video") => {
    try {
      console.log("📞 Answering call:", callId);
      callService.currentUserId = user.uid;
      callService.onRemoteStream = (stream) => {
        console.log("📹 Remote stream received");
        setRemoteStream(stream);
        setIsInCall(true);
      };
      callService.onCallEnded = (status) => {
        console.log("📞 Call ended with status:", status);
        setIsInCall(false);
        setCallStream(null);
        setRemoteStream(null);
        setIncomingCall(null);
        const statusMessages = {
          ended: "📞 انتهت المكالمة",
          rejected: "📞 تم رفض المكالمة",
          missed: "📞 مكالمة فائتة",
        };
        showToast(statusMessages[status] || "📞 انتهت المكالمة", "info");
      };
      const stream = await callService.answerCall(callId, type);
      setCallStream(stream);
      setIncomingCall(null);
      showToast("📞 تم قبول المكالمة", "success");
    } catch (error) {
      console.error("❌ Error answering call:", error);
      setIncomingCall(null);
      showToast(`❌ فشل قبول المكالمة: ${error.message}`, "error");
    }
  };

  const rejectCall = async (callId) => {
    try {
      console.log("📞 Rejecting call:", callId);
      await callService.rejectCall(callId);
      setIncomingCall(null);
      showToast("📞 تم رفض المكالمة", "info");
    } catch (error) {
      console.error("❌ Error rejecting call:", error);
      showToast("❌ فشل رفض المكالمة", "error");
    }
  };

  const enableVideo = async () => {
    try {
      console.log("📷 Enabling video mid-call...");
      const success = await callService.enableVideoDuringCall();
      if (success) {
        showToast("📷 تم تشغيل الكاميرا", "success");
      } else {
        showToast("❌ تعذر تشغيل الكاميرا", "error");
      }
      return success;
    } catch (error) {
      console.error("❌ Error enabling video:", error);
      showToast("❌ تعذر تشغيل الكاميرا", "error");
      return false;
    }
  };

  // =========================================
  // دوال المكالمات الجماعية
  // =========================================
  const startGroupCall = async (groupId, type = "video", members = []) => {
    if (!user?.uid || !groupId) {
      showToast("❌ لا يمكن بدء المكالمة الجماعية", "error");
      return;
    }
    if (isInCall) {
      showToast("⚠️ أنت في مكالمة حالياً", "error");
      return;
    }
    try {
      console.log(
        "📞 Starting group call for group:",
        groupId,
        "members:",
        members.length,
      );
      callServiceGroup.currentUserId = user.uid;
      setOutgoingCall({ receiverId: groupId, type, isGroupCall: true });
      callServiceGroup.onRemoteStream = (stream) => {
        console.log("📹 Remote stream received in group call");
        setRemoteStream(stream);
        setIsInCall(true);
        setOutgoingCall(null);
        showToast("📞 تم الاتصال الجماعي", "success");
      };
      callServiceGroup.onCallEnded = (status) => {
        console.log("📞 Group call ended with status:", status);
        setIsInCall(false);
        setCallStream(null);
        setRemoteStream(null);
        setOutgoingCall(null);
        setIncomingCall(null);
        setParticipants([]);
        const statusMessages = {
          ended: "📞 انتهت المكالمة الجماعية",
          rejected: "📞 تم رفض المكالمة الجماعية",
          missed: "📞 مكالمة جماعية فائتة",
        };
        showToast(
          statusMessages[status] || "📞 انتهت المكالمة الجماعية",
          "info",
        );
      };
      callServiceGroup.onCallStatusChanged = (status) => {
        console.log("📞 Group call status changed:", status);
        if (status === "connected") {
          showToast("📞 تم الاتصال الجماعي", "success");
        }
      };
      const chatId = `group_${groupId}`;
      const result = await callServiceGroup.startGroupCall(
        groupId,
        user.uid,
        chatId,
        type,
        members,
      );
      if (result) {
        setCallStream(result.stream);
        console.log("✅ Group call started successfully");
      } else {
        setOutgoingCall(null);
      }
    } catch (error) {
      console.error("❌ Error starting group call:", error);
      setIsInCall(false);
      setCallStream(null);
      setRemoteStream(null);
      setOutgoingCall(null);
      showToast(`❌ فشل بدء المكالمة الجماعية: ${error.message}`, "error");
    }
  };

  const joinGroupCall = async (callId, type = "video") => {
    try {
      console.log("📞 Joining group call:", callId);
      callServiceGroup.currentUserId = user.uid;
      callServiceGroup.onRemoteStream = (stream) => {
        console.log("📹 Remote stream received in group call");
        setRemoteStream(stream);
        setIsInCall(true);
      };
      callServiceGroup.onCallEnded = (status) => {
        console.log("📞 Group call ended with status:", status);
        setIsInCall(false);
        setCallStream(null);
        setRemoteStream(null);
        setIncomingCall(null);
        setParticipants([]);
        const statusMessages = {
          ended: "📞 انتهت المكالمة الجماعية",
          rejected: "📞 تم رفض المكالمة الجماعية",
          missed: "📞 مكالمة جماعية فائتة",
        };
        showToast(
          statusMessages[status] || "📞 انتهت المكالمة الجماعية",
          "info",
        );
      };
      const stream = await callServiceGroup.joinGroupCall(callId, type);
      setCallStream(stream);
      setIncomingCall(null);
      showToast("📞 تم الانضمام إلى المكالمة الجماعية", "success");
    } catch (error) {
      console.error("❌ Error joining group call:", error);
      setIncomingCall(null);
      showToast(
        `❌ فشل الانضمام إلى المكالمة الجماعية: ${error.message}`,
        "error",
      );
    }
  };

  const rejectGroupCall = async (callId) => {
    try {
      console.log("📞 Rejecting group call:", callId);
      await callServiceGroup.rejectGroupCall(callId, user.uid);
      setIncomingCall(null);
      showToast("📞 تم رفض المكالمة الجماعية", "info");
    } catch (error) {
      console.error("❌ Error rejecting group call:", error);
      showToast("❌ فشل رفض المكالمة الجماعية", "error");
    }
  };

  const leaveGroupCall = async () => {
    try {
      console.log("📞 Leaving group call");
      await callServiceGroup.leaveGroupCall();
      setIsInCall(false);
      setCallStream(null);
      setRemoteStream(null);
      setIncomingCall(null);
      setOutgoingCall(null);
      setParticipants([]);
      showToast("📞 تم مغادرة المكالمة الجماعية", "info");
    } catch (error) {
      console.error("❌ Error leaving group call:", error);
      showToast("❌ فشل مغادرة المكالمة الجماعية", "error");
    }
  };

  const endCall = async () => {
    try {
      console.log("📞 Ending call");
      if (outgoingCall?.isGroupCall) {
        await callServiceGroup.endGroupCall();
      } else if (incomingCall?.isGroupCall) {
        await callServiceGroup.leaveGroupCall();
      } else {
        await callService.endCall();
      }
      setIsInCall(false);
      setCallStream(null);
      setRemoteStream(null);
      setIncomingCall(null);
      setOutgoingCall(null);
      setParticipants([]);
      showToast("📞 انتهت المكالمة", "info");
    } catch (error) {
      console.error("❌ Error ending call:", error);
      showToast("❌ فشل إنهاء المكالمة", "error");
    }
  };

  // =========================================
  // تتبع الحضور: تحديث lastSeen/online حسب حالة التاب
  // (مش عند تسجيل الخروج فقط) — باستخدام Page Visibility API
  // بتغطي: تبديل تاب، تصغير النافذة، وإغلاق التاب/المتصفح
  // =========================================
  // useEffect(() => {
  //   if (!user?.uid) return;
  //   const userRef = doc(db, "users", user.uid);
  //   const handleVisibilityChange = () => {
  //     if (document.hidden) {
  //       updateDoc(userRef, {
  //         online: false,
  //         lastSeen: serverTimestamp(),
  //       }).catch((error) => {
  //         console.error("❌ Error updating lastSeen on tab leave:", error);
  //       });
  //     } else {
  //       updateDoc(userRef, {
  //         online: true,
  //       }).catch((error) => {
  //         console.error("❌ Error updating online on tab return:", error);
  //       });
  //     }
  //   };
  //   document.addEventListener("visibilitychange", handleVisibilityChange);
  //   return () => {
  //     document.removeEventListener("visibilitychange", handleVisibilityChange);
  //   };
  // }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const userRef = doc(db, "users", user.uid);
    updateDoc(userRef, { online: true }).catch((error) => {
      console.error("❌ Error setting user online:", error);
    });
    const handleBeforeUnload = () => {
      updateDoc(userRef, {
        online: false,
        lastSeen: serverTimestamp(),
      }).catch((error) => {
        console.error("❌ Error updating lastSeen:", error);
      });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [user?.uid]);

  // =========================================
  // الاستماع للمكالمات الواردة
  // =========================================
  useEffect(() => {
    if (!user?.uid) return;
    console.log("👂 Setting up incoming call listener for user:", user.uid);
    callService.currentUserId = user.uid;
    const unsubscribe = callService.listenForIncomingCalls(
      user.uid,
      (callData) => {
        if (callData === null) {
          console.log("📞 Incoming call was cancelled by caller");
          setIncomingCall(null);
          return;
        }
        console.log("📞 Incoming call detected:", callData);
        setIncomingCall(callData);
        showToast(
          `📞 مكالمة واردة من ${callData.callerInfo?.displayName || "مستخدم"}`,
          "info",
        );
      },
    );
    return () => {
      console.log("🧹 Cleaning up call listener");
      unsubscribe();
      callService.cleanup();
    };
  }, [user?.uid]);

  // =========================================
  // الاستماع للمكالمات الجماعية الواردة
  // =========================================
  useEffect(() => {
    if (!user?.uid) return;
    console.log(
      "👂 Setting up incoming group call listener for user:",
      user.uid,
    );
    callServiceGroup.currentUserId = user.uid;
    const unsubscribe = callServiceGroup.listenForIncomingGroupCalls(
      user.uid,
      (callData) => {
        if (callData === null) {
          console.log("📞 Incoming group call was cancelled");
          setIncomingCall(null);
          return;
        }
        console.log("📞 Incoming group call detected:", callData);
        setIncomingCall({ ...callData, isGroupCall: true });
        showToast(
          `📞 مكالمة جماعية واردة من ${callData.groupInfo?.name || "مجموعة"}`,
          "info",
        );
      },
    );
    return () => {
      console.log("🧹 Cleaning up group call listener");
      unsubscribe();
      callServiceGroup.cleanup();
    };
  }, [user?.uid]);

  // =========================================
  // الاستماع للمشاركين في المكالمة الجماعية
  // =========================================
  useEffect(() => {
    if (!incomingCall?.isGroupCall && !outgoingCall?.isGroupCall) {
      setParticipants([]);
      return;
    }
    const callId = incomingCall?.callId || outgoingCall?.receiverId;
    if (!callId) return;
    const callRef = doc(db, "group_calls", callId);
    const unsubscribe = onSnapshot(callRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      const activeParticipants = data.activeParticipants || [];
      setParticipants(activeParticipants);
    });
    return () => unsubscribe();
  }, [
    incomingCall?.callId,
    incomingCall?.isGroupCall,
    outgoingCall?.receiverId,
    outgoingCall?.isGroupCall,
  ]);

  // =========================================
  // Update video streams
  // =========================================
  useEffect(() => {
    if (localVideoRef.current && callStream) {
      localVideoRef.current.srcObject = callStream;
      localVideoRef.current.play().catch(console.error);
    }
  }, [callStream, isInCall]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch((error) => {
        console.error("❌ Remote audio/video play failed:", error);
        showToast("🔇 اضغط بأي مكان لتفعيل الصوت", "info");
        const retryPlay = () => {
          remoteVideoRef.current?.play().catch((e) => {
            console.error("❌ Retry play failed:", e);
          });
          document.removeEventListener("click", retryPlay);
          document.removeEventListener("touchstart", retryPlay);
        };
        document.addEventListener("click", retryPlay, { once: true });
        document.addEventListener("touchstart", retryPlay, { once: true });
      });
    }
  }, [remoteStream, isInCall]);

  // =========================================
  // Cleanup video tracks
  // =========================================
  useEffect(() => {
    return () => {
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        const stream = localVideoRef.current.srcObject;
        if (stream && stream.getTracks) {
          stream.getTracks().forEach((track) => track.stop());
        }
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        const stream = remoteVideoRef.current.srcObject;
        if (stream && stream.getTracks) {
          stream.getTracks().forEach((track) => track.stop());
        }
        remoteVideoRef.current.srcObject = null;
      }
    };
  }, []);

  // =========================================
  // دوال التبديل
  // =========================================
  const switchToGroups = () => {
    setSelectedUser(null);
    setSelectedGroup(null);
    setMessages([]);
    navigate("/groups");
    if (sidebarRef.current) {
      sidebarRef.current.switchToGroups();
    }
  };

  //لا يعود للمحادثة السابقة بعد ما يضغط على زر الرجوع من صفحة البروفايل
  // const switchToChats = () => {
  //   setSelectedUser(null);
  //   setSelectedGroup(null);
  //   setMessages([]);
  //   navigate("/chat");
  //   if (sidebarRef.current) {
  //     sidebarRef.current.switchToChats();
  //   }
  // };

  //عودة للمحادة السابقة بعد ما يضغط على زر الرجوع من صفحة البروفايل
  const switchToChats = () => {
    setShowProfile(false);
    setSelectedGroup(null);
    navigate(selectedUser?.uid ? `/chat/${selectedUser.uid}` : "/chat");
    if (sidebarRef.current) {
      sidebarRef.current.switchToChats();
    }
  };

  // =========================================
  // Loading
  // =========================================
  if (!user?.uid) {
    return <div>جاري تحميل بيانات المستخدم...</div>;
  }

  // =========================================
  // Render
  // =========================================
  return (
    <div className="chat-app">
      {/* ========================================= Incoming Call Overlay ========================================= */}
      {incomingCall && (
        <div className="incoming-call-overlay">
          <div className="incoming-call-card">
            <div className="incoming-call-avatar">
              {incomingCall.isGroupCall ? (
                incomingCall.groupInfo?.photoURL ? (
                  <img
                    src={incomingCall.groupInfo.photoURL}
                    alt={incomingCall.groupInfo.name || "Group"}
                    className="caller-avatar"
                  />
                ) : (
                  <div className="caller-avatar-placeholder group-avatar">
                    👥
                  </div>
                )
              ) : incomingCall.callerInfo?.photoURL ? (
                <img
                  src={incomingCall.callerInfo.photoURL}
                  alt={incomingCall.callerInfo.displayName}
                  className="caller-avatar"
                />
              ) : (
                <div className="caller-avatar-placeholder">
                  {incomingCall.callerInfo?.displayName?.[0]?.toUpperCase() ||
                    "?"}
                </div>
              )}
              {incomingCall.isGroupCall && (
                <div className="group-call-badge">👥</div>
              )}
            </div>
            <h3>
              {incomingCall.isGroupCall
                ? "مكالمة جماعية واردة"
                : "مكالمة واردة"}
            </h3>
            <p className="caller-name">
              {incomingCall.isGroupCall
                ? incomingCall.groupInfo?.name || "مجموعة"
                : incomingCall.callerInfo?.displayName ||
                  incomingCall.callerInfo?.email ||
                  "Unknown"}
              {incomingCall.isGroupCall && (
                <span className="group-call-participants">
                  {" "}
                  • {incomingCall.participants?.length || 0} مشارك
                </span>
              )}
            </p>
            {incomingCall.isGroupCall && (
              <p className="call-caller">
                {" "}
                من: {incomingCall.callerInfo?.displayName || "مستخدم"}{" "}
              </p>
            )}
            <p className="call-type">
              {incomingCall.type === "video"
                ? "📹 مكالمة فيديو"
                : "🎧 مكالمة صوتية"}
              {incomingCall.isGroupCall && " (جماعية)"}
            </p>
            <div className="call-actions">
              <button
                className="answer-call-btn"
                onClick={() =>
                  incomingCall.isGroupCall
                    ? joinGroupCall(incomingCall.callId, incomingCall.type)
                    : answerCall(incomingCall.callId, incomingCall.type)
                }
              >
                <img src={answerCallIcon} alt="Answer" />
                {incomingCall.isGroupCall ? "انضمام" : "رد"}
              </button>
              <button
                className="reject-call-btn"
                onClick={() =>
                  incomingCall.isGroupCall
                    ? rejectGroupCall(incomingCall.callId)
                    : rejectCall(incomingCall.callId)
                }
              >
                <img src={endCallIcon} alt="Reject" />
                رفض
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================= Active Call Overlay - Group Call ========================================= */}
      {isInCall && (incomingCall?.isGroupCall || outgoingCall?.isGroupCall) && (
        <div className="active-call-overlay group-call-overlay">
          <div className="active-call-card group-call-card">
            <div className="group-call-video-container">
              <div className="main-video-wrapper">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="main-video"
                />
                <div className="main-video-label">
                  {incomingCall?.groupInfo?.name ||
                    outgoingCall?.receiverId ||
                    "المجموعة"}
                </div>
              </div>
              <div className="participants-grid">
                <div className="participant-video-wrapper local-participant">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="participant-video"
                  />
                  <div className="participant-label">أنت</div>
                </div>
                {participants
                  .filter(
                    (id) => id !== user?.uid && id !== incomingCall?.callerId,
                  )
                  .slice(0, 5)
                  .map((participantId, index) => (
                    <div
                      key={participantId}
                      className="participant-video-wrapper"
                    >
                      <video
                        autoPlay
                        playsInline
                        className="participant-video"
                      />
                      <div className="participant-label">
                        {participantId === incomingCall?.callerId
                          ? incomingCall?.callerInfo?.displayName
                          : `مشارك ${index + 1}`}
                      </div>
                    </div>
                  ))}
                {participants.filter(
                  (id) => id !== user?.uid && id !== incomingCall?.callerId,
                ).length > 5 && (
                  <div className="participant-video-wrapper more-participants">
                    <div className="more-participants-icon">
                      +{" "}
                      {participants.filter(
                        (id) =>
                          id !== user?.uid && id !== incomingCall?.callerId,
                      ).length - 5}
                    </div>
                  </div>
                )}
              </div>
              <div className="call-info-overlay group-call-info">
                <p className="call-with">
                  {incomingCall?.groupInfo?.name ||
                    outgoingCall?.receiverId ||
                    "مكالمة جماعية"}
                </p>
                <p className="call-status">🔴 {participants.length} مشارك</p>
              </div>
            </div>
            <div className="call-controls group-call-controls">
              <button
                className="call-control-btn microphone-btn"
                onClick={() => {
                  if (callStream) {
                    const audioTracks = callStream.getAudioTracks();
                    if (audioTracks.length > 0) {
                      const isEnabled = audioTracks[0].enabled;
                      audioTracks.forEach((track) => {
                        track.enabled = !isEnabled;
                      });
                      showToast(
                        isEnabled
                          ? "🎤 تم كتم الميكروفون"
                          : "🎤 تم إلغاء كتم الميكروفون",
                        "info",
                      );
                    }
                  }
                }}
              >
                🎤
              </button>
              <button
                className="call-control-btn camera-btn"
                onClick={async () => {
                  if (!callStream) return;
                  const videoTracks = callStream.getVideoTracks();
                  if (videoTracks.length > 0) {
                    const isEnabled = videoTracks[0].enabled;
                    videoTracks.forEach(
                      (track) => (track.enabled = !isEnabled),
                    );
                    showToast(
                      isEnabled
                        ? "📷 تم إيقاف الكاميرا"
                        : "📷 تم تشغيل الكاميرا",
                      "info",
                    );
                  } else {
                    showToast("📷 جاري تشغيل الكاميرا...", "info");
                    await enableVideo();
                  }
                }}
              >
                📷
              </button>
              <button className="end-call-btn" onClick={endCall}>
                <img src={endCallIcon} alt="End Call" />
                {incomingCall?.isGroupCall ? "مغادرة" : "إنهاء"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================= Active Call Overlay - Individual Call ========================================= */}
      {isInCall && !incomingCall?.isGroupCall && !outgoingCall?.isGroupCall && (
        <div className="active-call-overlay">
          <div className="active-call-card">
            <div className="call-video-container">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="remote-video"
              />
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="local-video"
              />
              <div className="call-info-overlay">
                <p className="call-with">
                  {selectedUser?.displayName || selectedUser?.email}
                </p>
                <p className="call-status">🔴 Live</p>
              </div>
            </div>
            <div className="call-controls">
              <button
                className="call-control-btn microphone-btn"
                onClick={() => {
                  if (callStream) {
                    const audioTracks = callStream.getAudioTracks();
                    if (audioTracks.length > 0) {
                      const isEnabled = audioTracks[0].enabled;
                      audioTracks.forEach((track) => {
                        track.enabled = !isEnabled;
                      });
                      showToast(
                        isEnabled
                          ? "🎤 تم كتم الميكروفون"
                          : "🎤 تم إلغاء كتم الميكروفون",
                        "info",
                      );
                    }
                  }
                }}
              >
                🎤
              </button>
              <button
                className="call-control-btn camera-btn"
                onClick={async () => {
                  if (!callStream) return;
                  const videoTracks = callStream.getVideoTracks();
                  if (videoTracks.length > 0) {
                    const isEnabled = videoTracks[0].enabled;
                    videoTracks.forEach(
                      (track) => (track.enabled = !isEnabled),
                    );
                    showToast(
                      isEnabled
                        ? "📷 تم إيقاف الكاميرا"
                        : "📷 تم تشغيل الكاميرا",
                      "info",
                    );
                  } else {
                    showToast("📷 جاري تشغيل الكاميرا...", "info");
                    await enableVideo();
                  }
                }}
              >
                📷
              </button>
              <button className="end-call-btn" onClick={endCall}>
                <img src={endCallIcon} alt="End Call" />
                إنهاء
              </button>
            </div>
          </div>
        </div>
      )}

      <Sidebar
        ref={sidebarRef}
        chats={chats}
        onSelectUser={handleSelectUser}
        onSelectGroup={handleSelectGroup}
        currentUserId={user.uid}
        onOpenUsersList={() => setShowUsersList(true)}
        showToast={showToast}
        onSwitchToGroups={switchToGroups}
        onSwitchToChats={switchToChats}
        onOpenProfile={() => setShowProfile(true)}
      />

      {showProfile ? (
        <div className="chat-window empty">
          <div className="empty-state">
            <img
              src={whatsappIcon}
              alt="WhatsApp"
              style={{ width: "70px", height: "70px" }}
            />
            <h3 style={{ color: "#008000" }}> WhatsApp</h3>
          </div>
        </div>
      ) : selectedGroup ? (
        <Suspense
          fallback={
            <div className="chat-window empty">
              <Spinner />
            </div>
          }
        >
          <GroupWindow
            selectedGroup={selectedGroup}
            currentUser={user}
            showToast={showToast}
            onStartChat={startNewChat}
            onSelectUser={handleSelectUser}
            onSwitchToChats={switchToChats}
            onStartGroupCall={startGroupCall}
            isInCall={isInCall}
            outgoingCall={outgoingCall}
            onCancelOutgoingCall={cancelOutgoingCall}
          />
        </Suspense>
      ) : selectedUser ? (
        <Suspense
          fallback={
            <div className="chat-window empty">
              <Spinner />
            </div>
          }
        >
          <ChatWindow
            selectedUser={selectedUser}
            messages={messages}
            onSendMessage={sendMessage}
            currentUserId={user.uid}
            showToast={showToast}
            onSelectGroup={handleSelectGroup}
            onSwitchToGroups={switchToGroups}
            onLoadMoreMessages={loadMoreMessages}
            hasMoreMessages={hasMoreMessages}
            loadingMoreMessages={loadingMoreMessages}
            onStartCall={startCall}
            isInCall={isInCall}
            outgoingCall={outgoingCall}
            onCancelOutgoingCall={cancelOutgoingCall}
          />
        </Suspense>
      ) : (
        <div className="chat-window empty">
          <div className="empty-state">
            <span style={{ fontSize: "48px" }}>💬</span>
            <h3>Select a chat or group</h3>
            <p>Choose a user or group to start messaging</p>
          </div>
        </div>
      )}

      {showUsersList && !loadingUsers && !loadingChats && (
        <Suspense fallback={null}>
          <UsersList
            users={newUsers}
            onStartChat={startNewChat}
            onClose={() => setShowUsersList(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ChatApp;