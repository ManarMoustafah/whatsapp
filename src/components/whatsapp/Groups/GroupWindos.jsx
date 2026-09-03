// src/components/whatsapp/Groups/GroupWindos.jsx
import { useEffect, useRef, useState } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  deleteDoc,
  serverTimestamp,
  updateDoc,
  doc,
  getDoc,
} from "firebase/firestore";

import { db } from "../../../config/firebase";

import sendIcon from "../../../assets/send.png";
import moreIcon from "../../../assets/more.png";
import searchIcon from "../../../assets/search.png";
import callIcon from "../../../assets/call.png";
import videoCallIcon from "../../../assets/video-call.png";
import endCallIcon from "../../../assets/end-call.png";

import edit from "../../../assets/editmass.webp";
import del from "../../../assets/del.png";
import GroupSideBar from "./GroupSideBar";
import Spinner from "../looding";

const GroupWindow = ({
  selectedGroup,
  currentUser,
  showToast,
  onStartChat,
  onSelectUser,
  onSwitchToChats,
  onStartGroupCall,
  isInCall,
  outgoingCall,
  onCancelOutgoingCall,
}) => {
  const [messages, setMessages] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(true);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [usersData, setUsersData] = useState({});
  const messagesEndRef = useRef(null);

  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [currentResult, setCurrentResult] = useState(0);

  const [showSidebar, setShowSidebar] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);

  // =========================================
  // Get Group Messages
  // =========================================

  useEffect(() => {
    if (!selectedGroup?.id) {
      setMessages([]);
      setIsChatLoading(false);
      return;
    }

    setIsChatLoading(true);

    const messagesRef = collection(db, "groups", selectedGroup.id, "messages");

    const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const messagesList = snapshot.docs.map((messageDoc) => ({
          id: messageDoc.id,
          ...messageDoc.data(),
        }));

        setMessages(messagesList);
        setIsChatLoading(false);
      },
      (error) => {
        console.error("Error fetching group messages:", error);
        setIsChatLoading(false);
      },
    );

    return unsubscribe;
  }, [selectedGroup?.id]);

  // جلب بيانات الأعضاء
  useEffect(() => {
    if (!selectedGroup?.id) {
      setUsersData({});
      setIsUsersLoading(false);
      return;
    }

    const members = selectedGroup.members || [];

    if (members.length === 0) {
      setUsersData({});
      setIsUsersLoading(false);
      return;
    }

    setIsUsersLoading(true);

    const fetchUsers = async () => {
      const usersMap = {};

      try {
        await Promise.all(
          members.map(async (userId) => {
            const userDocRef = doc(db, "users", userId);
            const userSnap = await getDoc(userDocRef);

            if (userSnap.exists()) {
              usersMap[userId] = userSnap.data();
            }
          }),
        );

        setUsersData(usersMap);
      } catch (error) {
        console.error("Error fetching users data:", error);
      } finally {
        setIsUsersLoading(false);
      }
    };

    fetchUsers();
  }, [selectedGroup?.id]);

  // =========================================
  // Scroll
  // =========================================

  useEffect(() => {
    if (!searchTerm) {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [messages, searchTerm]);

  // =========================================
  // Search messages
  // =========================================

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setCurrentResult(0);
      return;
    }

    const search = searchTerm.toLowerCase();

    const results = messages
      .map((message) => ({
        id: message.id,
        text: message.text || "",
      }))
      .filter((message) => message.text.toLowerCase().includes(search));

    setSearchResults(results);
    setCurrentResult(0);
  }, [searchTerm, messages]);

  useEffect(() => {
    if (!searchResults.length) return;

    const result = searchResults[currentResult];

    if (!result) return;

    const messageElement = document.getElementById(`message-${result.id}`);

    messageElement?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [currentResult, searchResults]);

  // =========================================
  // Send Message
  // =========================================

  const handleSend = async () => {
    if (!input.trim()) {
      showToast?.("📝 الرجاء كتابة رسالة", "error");
      return;
    }

    if (!selectedGroup?.id) return;

    try {
      setIsSending(true);

      const groupRef = doc(db, "groups", selectedGroup.id);
      const newText = input.trim();

      if (editingMessage) {
        const messageRef = doc(
          db,
          "groups",
          selectedGroup.id,
          "messages",
          editingMessage.id,
        );

        await updateDoc(messageRef, {
          text: newText,
          isEdited: true,
        });

        const isLastMessage =
          messages.length > 0 &&
          messages[messages.length - 1]?.id === editingMessage.id;

        if (isLastMessage) {
          await updateDoc(groupRef, {
            lastMessage: newText,
          });
        }

        showToast?.("تم تعديل الرسالة بنجاح", "success");
        setEditingMessage(null);
      } else {
        await addDoc(collection(db, "groups", selectedGroup.id, "messages"), {
          text: newText,
          senderId: currentUser.uid,
          timestamp: serverTimestamp(),
          read: false,
        });

        await updateDoc(groupRef, {
          lastMessage: newText,
          lastMessageTime: serverTimestamp(),
          lastMessageSenderId: currentUser.uid,
        });
      }

      setInput("");
    } catch (error) {
      console.error("Error handling message submission:", error);
      showToast?.(
        `❌ فشل ${editingMessage ? "تعديل" : "إرسال"} الرسالة`,
        "error",
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDeleteForEveryone = async (messageId) => {
    try {
      const groupRef = doc(db, "groups", selectedGroup.id);
      const messageRef = doc(
        db,
        "groups",
        selectedGroup.id,
        "messages",
        messageId,
      );

      const isLastMessage =
        messages.length > 0 && messages[messages.length - 1]?.id === messageId;

      await deleteDoc(messageRef);

      if (isLastMessage) {
        const remainingMessages = messages.filter(
          (msg) => msg.id !== messageId,
        );

        if (remainingMessages.length > 0) {
          const previousMessage =
            remainingMessages[remainingMessages.length - 1];
          await updateDoc(groupRef, {
            lastMessage: previousMessage.text || "",
            lastMessageTime: previousMessage.timestamp || null,
          });
        } else {
          await updateDoc(groupRef, {
            lastMessage: "",
            lastMessageTime: null,
          });
        }
      }

      showToast?.("تم حذف الرسالة لدى الجميع", "success");
    } catch (error) {
      console.error("Error deleting message for everyone:", error);
      showToast?.("❌ فشل حذف الرسالة لدى الجميع", "error");
    }
  };

  const handleEditMessage = (message) => {
    setInput(message.text);
    setEditingMessage(message);
  };

  // =========================================
  // دالة بدء المكالمة الجماعية
  // =========================================

  const handleGroupCall = (type) => {
    if (!selectedGroup?.id || !selectedGroup?.members) {
      showToast("❌ لا يمكن بدء المكالمة", "error");
      return;
    }

    const members = selectedGroup.members.filter(
      (memberId) => memberId !== currentUser.uid,
    );

    if (members.length === 0) {
      showToast("⚠️ لا يوجد أعضاء آخرين في المجموعة", "error");
      return;
    }

    onStartGroupCall?.(selectedGroup.id, type, members);
  };

  // =========================================
  // Search controls
  // =========================================

  const handleSearchClick = (open) => {
    setShowSearch(open);

    if (!open) {
      setSearchTerm("");
      setSearchResults([]);
      setCurrentResult(0);
    }
  };

  const goToNextResult = () => {
    if (!searchResults.length) return;

    setCurrentResult((previous) =>
      previous === searchResults.length - 1 ? 0 : previous + 1,
    );
  };

  const goToPreviousResult = () => {
    if (!searchResults.length) return;

    setCurrentResult((previous) =>
      previous === 0 ? searchResults.length - 1 : previous - 1,
    );
  };

  const isCurrentSearchResult = (messageId) => {
    return searchResults[currentResult]?.id === messageId;
  };

  // =========================================
  // Empty
  // =========================================

  if (!selectedGroup) {
    return <div className="chat-window empty"></div>;
  }

  // =========================================
  // Render
  // =========================================

  return (
    <div className="chat-window-all">
      <div className="chat-window">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-user-info">
            <div className="user-avatar user-list-avatar">
              {selectedGroup.photoURL ? (
                <img src={selectedGroup.photoURL} alt={selectedGroup.name} />
              ) : (
                <div className="avatar-placeholder">👥</div>
              )}
            </div>

            <div>
              <div className="chat-user-name">{selectedGroup.name}</div>

              <div className="chat-user-status">
                {selectedGroup.members?.length || 0} members
              </div>
            </div>
          </div>

          <div className="chatinfo">
            <button
              className="setting callIcon"
              onClick={() => handleSearchClick(true)}
            >
              <img src={searchIcon} style={{ height: "25px" }} alt="Search" />
            </button>

            <button
              className="callIcon setting"
              title="مكالمة صوتية جماعية"
              onClick={() => handleGroupCall("audio")}
              disabled={isInCall}
            >
              <img src={callIcon} style={{ height: "25px" }} alt="Voice Call" />
            </button>

            <button
              className="callIcon setting"
              title="مكالمة فيديو جماعية"
              onClick={() => handleGroupCall("video")}
              disabled={isInCall}
            >
              <img
                src={videoCallIcon}
                style={{ height: "25px" }}
                alt="Video Call"
              />
            </button>

            <button
              className="setting"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              <img src={moreIcon} style={{ height: "30px" }} alt="More" />
            </button>
          </div>
        </div>

        {/* Search */}
        {showSearch && (
          <div className="search-field-container">
            <input
              type="text"
              className="search-users"
              placeholder="Search in chat..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />

            {searchTerm && (
              <div className="search-results-info">
                {searchResults.length > 0 ? (
                  <>
                    <span className="close-btn" style={{ fontSize: "20px" }}>
                      {currentResult + 1}/{searchResults.length}
                    </span>

                    <button className="close-btn" onClick={goToPreviousResult}>
                      ↑
                    </button>

                    <button className="close-btn" onClick={goToNextResult}>
                      ↓
                    </button>
                  </>
                ) : (
                  <span className="close-btn">0</span>
                )}
              </div>
            )}

            <button
              className="close-btn"
              onClick={() => handleSearchClick(false)}
            >
              ✕
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="messages-area">
          {isChatLoading || isUsersLoading ? (
            <Spinner />
          ) : messages.length === 0 ? (
            <div className="empty-messages">
              👥 No messages yet
              <span className="empty-sub">Send the first message! 🎉</span>
            </div>
          ) : (
            messages.map((message, index) => {
              const isSent = message.senderId === currentUser.uid;
              const senderInfo = usersData[message.senderId] || {};
              const isSameSenderAsPrevious =
                index > 0 && messages[index - 1].senderId === message.senderId;

              const messageIsCurrentResult = isCurrentSearchResult(message.id);

              return (
                <div
                  key={message.id}
                  id={`message-${message.id}`}
                  className={`message-container ${isSent ? "sent" : "received"} ${isSameSenderAsPrevious ? "same-sender" : ""}`}
                >
                  {!isSent && (
                    <div className="avatar-container">
                      {!isSameSenderAsPrevious ? (
                        senderInfo?.photoURL ? (
                          <img
                            src={senderInfo.photoURL}
                            alt="avatar"
                            className="message-avatar"
                          />
                        ) : (
                          // إذا لم تكن الصورة موجودة، يتم عرض أول حرف من الاسم
                          <div className="group-user-placeholder message-avatar">
                            {senderInfo?.displayName
                              ?.charAt(0)
                              ?.toUpperCase() || "👤"}
                          </div>
                        )
                      ) : // الفراغ البديل إذا كان نفس المرسل للحفاظ على المحاذاة الدقيقة
                      senderInfo?.photoURL ? (
                        <div className="message-avatar-placeholder" />
                      ) : (
                        // فراغ بديل بنفس أبعاد دائرة الحرف تماماً لكي لا تتحرك الرسائل
                        <div
                          className="group-user-placeholder message-avatar"
                          style={{ visibility: "hidden" }}
                        />
                      )}
                    </div>
                  )}

                  <div
                    className={`message-bubble message-with-options ${messageIsCurrentResult ? "current-search-result" : ""}`}
                  >
                    {!isSent && !isSameSenderAsPrevious && (
                      <div className="message-sender">
                        {senderInfo.displayName || "مستخدم"}
                      </div>
                    )}
                    <div className="message-content">
                      {isSent ? (
                        <>
                          <span className="message-time">
                            {message.timestamp
                              ?.toDate?.()
                              ?.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              }) || ""}
                          </span>
                          <p className="message-text">{message.text}</p>
                        </>
                      ) : (
                        <>
                          <p className="message-text">{message.text}</p>
                          <span className="message-time">
                            {message.timestamp
                              ?.toDate?.()
                              ?.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              }) || ""}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="message-options-menu">
                      {isSent ? (
                        <>
                          <button onClick={() => handleEditMessage(message)}>
                            <img
                              src={edit}
                              alt="edit"
                              style={{ width: "15px", height: "15px" }}
                            />
                          </button>
                          <button
                            onClick={() => handleDeleteForEveryone(message.id)}
                          >
                            <img
                              src={del}
                              alt="delete"
                              style={{ width: "15px", height: "15px" }}
                            />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="message-input">
          <input
            placeholder={
              editingMessage ? "تعديل الرسالة..." : "Type a message..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={isSending}
          />

          <button onClick={handleSend} disabled={isSending}>
            <img src={sendIcon} alt="Send" style={{ height: "20px" }} />
          </button>
        </div>
      </div>

      {/* Outgoing Group Call Overlay */}
      {outgoingCall && !isInCall && outgoingCall.isGroupCall && (
        <div className="incoming-call-overlay">
          <div className="incoming-call-card">
            <div className="incoming-call-avatar">
              {selectedGroup?.photoURL ? (
                <img
                  src={selectedGroup.photoURL}
                  alt={selectedGroup.name}
                  className="caller-avatar"
                />
              ) : (
                <div className="caller-avatar-placeholder group-avatar">👥</div>
              )}
              <div className="group-call-badge">📞</div>
            </div>

            <h3>جاري الاتصال الجماعي...</h3>

            <p className="caller-name">{selectedGroup?.name || "المجموعة"}</p>

            <p className="call-type">
              {outgoingCall.type === "video"
                ? "📹 مكالمة فيديو جماعية"
                : "🎧 مكالمة صوتية جماعية"}
            </p>

            <p className="call-participants">
              {selectedGroup?.members?.length || 0} عضو في المجموعة
            </p>

            <div className="call-actions">
              <button
                className="reject-call-btn"
                onClick={() => onCancelOutgoingCall?.()}
              >
                <img src={endCallIcon} alt="Cancel" />
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Sidebar */}
      {showSidebar && (
        <GroupSideBar
          selectedGroup={selectedGroup}
          currentUserId={currentUser.uid}
          onClose={() => setShowSidebar(false)}
          showToast={showToast}
          onStartChat={onStartChat}
          onSelectUser={onSelectUser}
          onSwitchToChats={onSwitchToChats}
        />
      )}
    </div>
  );
};

export default GroupWindow;

// import { useEffect, useRef, useState } from "react";
// import {
//   collection,
//   query,
//   orderBy,
//   onSnapshot,
//   addDoc,
//   deleteDoc,
//   serverTimestamp,
//   where,
//   updateDoc,
//   doc,
//   getDoc,
//   increment,
// } from "firebase/firestore";

// import { db } from "../../../config/firebase";

// import sendIcon from "../../../assets/send.png";
// import moreIcon from "../../../assets/more.png";
// import searchIcon from "../../../assets/search.png";
// import callIcon from "../../../assets/call.png";
// import videoCallIcon from "../../../assets/video-call.png";

// import edit from "../../../assets/editmass.webp";
// import del from "../../../assets/del.png";
// import GroupSideBar from "./GroupSideBar";

// const GroupWindow = ({
//   selectedGroup,
//   currentUser,
//   showToast,
//   onStartChat,
//   onSelectUser,
//   onSwitchToChats,
// }) => {
//   const [messages, setMessages] = useState([]);
//   const [selectedMessageId, setSelectedMessageId] = useState(null);
//   const [input, setInput] = useState("");
//   const [isSending, setIsSending] = useState(false);
//   const [usersData, setUsersData] = useState({});
//   const messagesEndRef = useRef(null);

//   const [showSearch, setShowSearch] = useState(false);
//   const [searchTerm, setSearchTerm] = useState("");
//   const [searchResults, setSearchResults] = useState([]);
//   const [currentResult, setCurrentResult] = useState(0);

//   const [showSidebar, setShowSidebar] = useState(false);

//   // =========================================
//   // Get Group Messages
//   // =========================================

//   useEffect(() => {
//     if (!selectedGroup?.id) {
//       setMessages([]);
//       return;
//     }

//     const messagesRef = collection(db, "groups", selectedGroup.id, "messages");

//     const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));

//     const unsubscribe = onSnapshot(
//       messagesQuery,
//       (snapshot) => {
//         const messagesList = snapshot.docs.map((messageDoc) => ({
//           id: messageDoc.id,
//           ...messageDoc.data(),
//         }));

//         setMessages(messagesList);
//       },
//       (error) => {
//         console.error("Error fetching group messages:", error);
//       },
//     );

//     return unsubscribe;
//   }, [selectedGroup?.id]);

//   // جلب بيانات الأعضاء من مجموعة users بناءً على الـ members في الجروب
//   useEffect(() => {
//     if (!selectedGroup?.members || selectedGroup.members.length === 0) return;

//     const fetchUsers = async () => {
//       const usersMap = {};
//       try {
//         for (const userId of selectedGroup.members) {
//           const userDocRef = doc(db, "users", userId);
//           const userSnap = await getDoc(userDocRef);
//           if (userSnap.exists()) {
//             usersMap[userId] = userSnap.data();
//           }
//         }
//         setUsersData(usersMap);
//       } catch (error) {
//         console.error("Error fetching users data:", error);
//       }
//     };

//     fetchUsers();
//   }, [selectedGroup]);

//   // =========================================
//   // Scroll
//   // =========================================

//   useEffect(() => {
//     if (!searchTerm) {
//       messagesEndRef.current?.scrollIntoView({
//         behavior: "smooth",
//       });
//     }
//   }, [messages, searchTerm]);
//   // =========================================
//   // Search messages
//   // =========================================

//   useEffect(() => {
//     if (!searchTerm.trim()) {
//       setSearchResults([]);
//       setCurrentResult(0);
//       return;
//     }

//     const search = searchTerm.toLowerCase();

//     const results = messages
//       .map((message) => ({
//         id: message.id,
//         text: message.text || "",
//       }))
//       .filter((message) => message.text.toLowerCase().includes(search));

//     setSearchResults(results);
//     setCurrentResult(0);
//   }, [searchTerm, messages]);

//   // =========================================
//   // Scroll to selected search result
//   // =========================================

//   useEffect(() => {
//     if (!searchResults.length) return;

//     const result = searchResults[currentResult];

//     if (!result) return;

//     const messageElement = document.getElementById(`message-${result.id}`);

//     messageElement?.scrollIntoView({
//       behavior: "smooth",
//       block: "center",
//     });
//   }, [currentResult, searchResults]);

//   // =========================================
//   // Send Message
//   // =========================================

//   // const handleSend = async () => {
//   //   if (!input.trim()) {
//   //     showToast?.("📝 الرجاء كتابة رسالة", "error");
//   //     return;
//   //   }

//   //   if (!selectedGroup?.id) return;

//   //   try {
//   //     setIsSending(true);

//   //     await addDoc(collection(db, "groups", selectedGroup.id, "messages"), {
//   //       text: input.trim(),
//   //       senderId: currentUser.uid,
//   //       timestamp: serverTimestamp(),
//   //       read: false,
//   //     });

//   //     setInput("");
//   //   } catch (error) {
//   //     console.error("Error sending group message:", error);

//   //     showToast?.("❌ فشل إرسال الرسالة", "error");
//   //   } finally {
//   //     setIsSending(false);
//   //   }
//   // };
//   const handleSend = async () => {
//     if (!input.trim()) {
//       showToast?.("📝 الرجاء كتابة رسالة", "error");
//       return;
//     }

//     if (!selectedGroup?.id) return;

//     try {
//       setIsSending(true);

//       const groupRef = doc(db, "groups", selectedGroup.id);
//       const newText = input.trim();

//       if (editingMessage) {
//         // =========================================
//         // تعديل رسالة موجودة
//         // =========================================

//         const messageRef = doc(
//           db,
//           "groups",
//           selectedGroup.id,
//           "messages",
//           editingMessage.id,
//         );

//         await updateDoc(messageRef, {
//           text: newText,
//           isEdited: true,
//         });

//         // =========================================
//         // هل الرسالة المعدلة هي آخر رسالة؟
//         // =========================================

//         const isLastMessage =
//           messages.length > 0 &&
//           messages[messages.length - 1]?.id === editingMessage.id;

//         if (isLastMessage) {
//           await updateDoc(groupRef, {
//             lastMessage: newText,
//           });
//         }

//         showToast?.("تم تعديل الرسالة بنجاح", "success");

//         setEditingMessage(null);
//       } else {
//         // =========================================
//         // إرسال رسالة جديدة
//         // =========================================

//         await addDoc(collection(db, "groups", selectedGroup.id, "messages"), {
//           text: newText,
//           senderId: currentUser.uid,
//           timestamp: serverTimestamp(),
//           read: false,
//         });

//         // =========================================
//         // تحديث آخر رسالة في الجروب
//         // =========================================

//         await updateDoc(groupRef, {
//           lastMessage: newText,
//           lastMessageTime: serverTimestamp(),
//           lastMessageSenderId: currentUser.uid,
//         });
//       }

//       setInput("");
//     } catch (error) {
//       console.error("Error handling message submission:", error);

//       showToast?.(
//         `❌ فشل ${editingMessage ? "تعديل" : "إرسال"} الرسالة`,
//         "error",
//       );
//     } finally {
//       setIsSending(false);
//     }
//   };

//   const handleInputKeyDown = (e) => {
//     if (e.key === "Enter" && !e.shiftKey) {
//       e.preventDefault();
//       handleSend();
//     }
//   };

//   const handleDeleteForEveryone = async (messageId) => {
//     try {
//       // 1. مرجع مستند المجموعة
//       const groupRef = doc(db, "groups", selectedGroup.id);

//       // 2. مرجع الرسالة المراد حذفها
//       const messageRef = doc(
//         db,
//         "groups",
//         selectedGroup.id,
//         "messages",
//         messageId,
//       );

//       // 3. التحقق هل الرسالة المحذوفة هي آخر رسالة في قائمة رسائل المجموعة الحالية
//       const isLastMessage =
//         messages.length > 0 && messages[messages.length - 1]?.id === messageId;

//       // 4. حذف الرسالة من قاعدة البيانات
//       await deleteDoc(messageRef);

//       // 5. تحديث lastMessage للمجموعة إذا كانت هي الأخيرة
//       if (isLastMessage) {
//         const remainingMessages = messages.filter(
//           (msg) => msg.id !== messageId,
//         );

//         if (remainingMessages.length > 0) {
//           // جلب الرسالة السابقة لتكون هي الأخيرة
//           const previousMessage =
//             remainingMessages[remainingMessages.length - 1];
//           await updateDoc(groupRef, {
//             lastMessage: previousMessage.text || "",
//             lastMessageTime: previousMessage.timestamp || null,
//           });
//         } else {
//           // إذا لم يتبقى أي رسائل في المجموعة
//           await updateDoc(groupRef, {
//             lastMessage: "",
//             lastMessageTime: null,
//           });
//         }
//       }

//       setSelectedMessageId(null);
//       showToast?.("تم حذف الرسالة لدى الجميع", "success");
//     } catch (error) {
//       console.error("Error deleting message for everyone:", error);
//       showToast?.("❌ فشل حذف الرسالة لدى الجميع", "error");
//     }
//   };

//   // حذف لدي (غالباً يتم إضافتها في مصفوفة hiddenFor للمستخدم في قاعدة البيانات، أو إخفاؤها محلياً)
//   // const handleDeleteForMe = (messageId) => {
//   //   // يمكنك هنا تحديث الـ state محلياً لإخفائها عن الشاشة لديك فقط
//   //   setMessages(messages.filter((msg) => msg.id !== messageId));
//   //   setSelectedMessageId(null);
//   //   showToast?.("تم حذف الرسالة لديك", "success");
//   // };
//   // State لحفظ الرسالة التي يتم تعديلها حالياً

//   const [editingMessage, setEditingMessage] = useState(null);

//   const handleEditMessage = (message) => {
//     // 1. ضع النص القديم داخل الـ input فوراً
//     setInput(message.text);

//     // 2. احفظ كائن الرسالة بالكامل لتعرف الـ ID الخاص بها عند الحفظ
//     setEditingMessage(message);
//   };

//   // =========================================
//   // Empty
//   // =========================================

//   if (!selectedGroup) {
//     return <div className="chat-window empty"></div>;
//   }
//   // =========================================
//   // Search controls
//   // =========================================

//   const handleSearchClick = (open) => {
//     setShowSearch(open);

//     if (!open) {
//       setSearchTerm("");
//       setSearchResults([]);
//       setCurrentResult(0);
//     }
//   };

//   const goToNextResult = () => {
//     if (!searchResults.length) return;

//     setCurrentResult((previous) =>
//       previous === searchResults.length - 1 ? 0 : previous + 1,
//     );
//   };

//   const goToPreviousResult = () => {
//     if (!searchResults.length) return;

//     setCurrentResult((previous) =>
//       previous === 0 ? searchResults.length - 1 : previous - 1,
//     );
//   };
//   const isSearchResult = (messageId) => {
//     return searchResults.some((result) => result.id === messageId);
//   };

//   const isCurrentSearchResult = (messageId) => {
//     return searchResults[currentResult]?.id === messageId;
//   };

//   // =========================================
//   // Render
//   // =========================================

//   return (
//     <div className="chat-window-all">
//       <div className="chat-window">
//         {/* Header */}
//         <div className="chat-header">
//           <div className="chat-user-info">
//             <div className="user-avatar user-list-avatar">
//               {selectedGroup.photoURL ? (
//                 <img src={selectedGroup.photoURL} alt={selectedGroup.name} />
//               ) : (
//                 <div className="avatar-placeholder">👥</div>
//               )}
//             </div>

//             <div>
//               <div className="chat-user-name">{selectedGroup.name}</div>

//               <div className="chat-user-status">
//                 {selectedGroup.members?.length || 0} members
//               </div>
//             </div>
//           </div>

//           <div className="chatinfo">
//             <button className="setting callIcon" onClick={() => handleSearchClick(true)}>
//               <img src={searchIcon} style={{ height: "25px" }} alt="Search" />
//             </button>

//             {/* Voice Call */}

//             <button className="callIcon setting" title="Voice Call">
//               <img src={callIcon} alt="Voice Call" />
//             </button>

//             {/* Video Call */}

//             <button className="callIcon setting" title="Video Call">
//               <img src={videoCallIcon} alt="Video Call" />
//             </button>

//             <button
//               className="setting"
//               onClick={() => setShowSidebar(!showSidebar)}
//             >
//               <img src={moreIcon} style={{ height: "30px" }} alt="More" />
//             </button>
//           </div>
//         </div>
//         {/* =========================================
//             Search
//         ========================================= */}

//         {showSearch && (
//           <div className="search-field-container">
//             <input
//               type="text"
//               className="search-users"
//               placeholder="Search in chat..."
//               value={searchTerm}
//               onChange={(e) => setSearchTerm(e.target.value)}
//               autoFocus
//             />

//             {searchTerm && (
//               <div className="search-results-info">
//                 {searchResults.length > 0 ? (
//                   <>
//                     <span className="close-btn" style={{ fontSize: "20px" }}>
//                       {currentResult + 1}/{searchResults.length}
//                     </span>

//                     <button className="close-btn" onClick={goToPreviousResult}>
//                       ↑
//                     </button>

//                     <button className="close-btn" onClick={goToNextResult}>
//                       ↓
//                     </button>
//                   </>
//                 ) : (
//                   <span className="close-btn">0</span>
//                 )}
//               </div>
//             )}

//             <button
//               className="close-btn"
//               onClick={() => handleSearchClick(false)}
//             >
//               ✕
//             </button>
//           </div>
//         )}

//         {/* Messages */}
//         <div className="messages-area">
//           {messages.length === 0 ? (
//             <div className="empty-messages">
//               👥 No messages yet
//               <span className="empty-sub">Send the first message! 🎉</span>
//             </div>
//           ) : (
//             messages.map((message, index) => {
//               const isSent = message.senderId === currentUser.uid;
//               const senderInfo = usersData[message.senderId] || {};
//               const isSameSenderAsPrevious =
//                 index > 0 && messages[index - 1].senderId === message.senderId;

//               const messageIsCurrentResult = isCurrentSearchResult(message.id);

//               return (
//                 <div
//                   key={message.id}
//                   id={`message-${message.id}`}
//                   /* إذا كانت متتالية نضيف كلاس same-sender لتقليل المسافات بالـ CSS */
//                   className={`message-container ${isSent ? "sent" : "received"} ${isSameSenderAsPrevious ? "same-sender" : ""}`}
//                 >
//                   {/* عرض الصورة فقط إذا كانت مستقبلة ولأول رسالة في المجموعة المتتالية */}
//                   {!isSent && (
//                     <div className="avatar-container">
//                       {!isSameSenderAsPrevious ? (
//                         <img
//                           src={senderInfo.photoURL}
//                           alt="avatar"
//                           className="message-avatar"
//                         />
//                       ) : (
//                         /* مساحة فارغة بديلة عن الصورة للحفاظ على محاذاة فقاعة الرسالة الثانية والثالثة */
//                         <div className="message-avatar-placeholder" />
//                       )}
//                     </div>
//                   )}

//                   <div
//                     className={`message-bubble message-with-options ${messageIsCurrentResult ? "current-search-result" : ""}`}
//                   >
//                     {/* عرض الاسم فقط إذا كانت مستقبلة ولأول رسالة في المجموعة المتتالية */}
//                     {!isSent && !isSameSenderAsPrevious && (
//                       <div className="message-sender">
//                         {senderInfo.displayName || "مستخدم"}
//                       </div>
//                     )}
//                     <div className="message-content">
//                       {isSent ? (
//                         <>
//                           <span className="message-time">
//                             {message.timestamp
//                               ?.toDate?.()
//                               ?.toLocaleTimeString([], {
//                                 hour: "2-digit",
//                                 minute: "2-digit",
//                               }) || ""}
//                           </span>
//                           <p className="message-text">{message.text}</p>
//                         </>
//                       ) : (
//                         <>
//                           <p className="message-text">{message.text}</p>
//                           <span className="message-time">
//                             {message.timestamp
//                               ?.toDate?.()
//                               ?.toLocaleTimeString([], {
//                                 hour: "2-digit",
//                                 minute: "2-digit",
//                               }) || ""}
//                           </span>
//                         </>
//                       )}
//                     </div>{" "}
//                     {/* قائمة الخيارات تظهر فقط للرسالة المحددة */}
//                     <div className="message-options-menu">
//                       {isSent ? (
//                         <>
//                           <button onClick={() => handleEditMessage(message)}>
//                             <img
//                               src={edit}
//                               alt="edit"
//                               style={{ width: "15px", height: "15px" }}
//                             />
//                           </button>
//                           <button
//                             onClick={() => handleDeleteForEveryone(message.id)}
//                           >
//                             <img
//                               src={del}
//                               alt="edit"
//                               style={{ width: "15px", height: "15px" }}
//                             />
//                           </button>
//                           {/* <button
//                               onClick={() => handleDeleteForMe(message.id)}
//                             >
//                               حذف لدي
//                             </button> */}
//                         </>
//                       ) : (
//                         <>
//                           {/* <button
//                               onClick={() => handleDeleteForMe(message.id)}
//                             >
//                               حذف لدي
//                             </button> */}
//                         </>
//                       )}
//                     </div>
//                   </div>
//                 </div>
//               );
//             })
//           )}

//           <div ref={messagesEndRef} />
//         </div>

//         {/* Input */}
//         <div className="message-input">
//           <input
//             placeholder="Type a message..."
//             value={input}
//             onChange={(e) => setInput(e.target.value)}
//             onKeyDown={handleInputKeyDown}
//             disabled={isSending}
//           />

//           <button onClick={handleSend} disabled={isSending}>
//             <img src={sendIcon} alt="Send" style={{ height: "20px" }} />
//           </button>
//         </div>
//       </div>
//       {/* =========================================
//           groups Sidebar
//       ========================================= */}

//       {showSidebar && (
//         <GroupSideBar
//           selectedGroup={selectedGroup}
//           currentUserId={currentUser.uid}
//           onClose={() => setShowSidebar(false)}
//           showToast={showToast}
//           onStartChat={onStartChat}
//           onSelectUser={onSelectUser}
//           onSwitchToChats={onSwitchToChats}
//         />
//       )}
//     </div>
//   );
// };

// export default GroupWindow;
