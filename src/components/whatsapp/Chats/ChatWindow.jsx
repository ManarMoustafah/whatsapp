// src/components/whatsapp/Chats/ChatWindow.jsx
import { useState, useRef, useEffect } from "react";
import {
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";

import { db } from "../../../config/firebase";
import searchIcon from "../../../assets/search.png";
import callIcon from "../../../assets/call.png";
import videoCallIcon from "../../../assets/video-call.png";
import moreIcon from "../../../assets/more.png";
import sendIcon from "../../../assets/send.png";
import endCallIcon from "../../../assets/end-call.png";

import clockIcon from "../../../assets/clockIcon.png";
import singleGreyIcon from "../../../assets/singleGreyIcon.png";
import doubleGreyIcon from "../../../assets/doubleGreyIcon.png";
import doubleBlueIcon from "../../../assets/doubleBlueIcon.png";

import editmass from "../../../assets/editmass.webp";
import deleteIcon from "../../../assets/del.png";
import Spinner from "../looding";
import ReceiverSidebar from "./ReceiverSidebar";

const ChatWindow = ({
  selectedUser,
  messages,
  onSendMessage,
  currentUserId,
  showToast,
  onSelectGroup,
  onSwitchToGroups,
  onLoadMoreMessages,
  hasMoreMessages,
  loadingMoreMessages,
  onStartCall,
  isInCall,
  outgoingCall,
  onCancelOutgoingCall,
}) => {
  // =========================================
  // States
  // =========================================
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [currentResult, setCurrentResult] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isBlockedByUser, setIsBlockedByUser] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const previousScrollHeightRef = useRef(0);
  const isPrependingRef = useRef(false);

  // =========================================
  // Check Block Status
  // =========================================
  useEffect(() => {
    if (!currentUserId || !selectedUser?.uid) {
      setIsBlocked(false);
      setIsBlockedByUser(false);
      return;
    }

    const myBlockRef = doc(
      db,
      "blocks",
      `${currentUserId}_${selectedUser.uid}`,
    );
    const theirBlockRef = doc(
      db,
      "blocks",
      `${selectedUser.uid}_${currentUserId}`,
    );

    const unsubscribeMyBlock = onSnapshot(
      myBlockRef,
      (snapshot) => {
        setIsBlocked(snapshot.exists());
      },
      (error) => {
        console.error("Error checking my block:", error);
      },
    );

    const unsubscribeTheirBlock = onSnapshot(
      theirBlockRef,
      (snapshot) => {
        setIsBlockedByUser(snapshot.exists());
      },
      (error) => {
        console.error("Error checking their block:", error);
      },
    );

    return () => {
      unsubscribeMyBlock();
      unsubscribeTheirBlock();
    };
  }, [currentUserId, selectedUser?.uid]);

  // =========================================
  // Scroll to bottom / Preserve scroll
  // =========================================
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (isPrependingRef.current) {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = newScrollHeight - previousScrollHeightRef.current;
      isPrependingRef.current = false;
      return;
    }

    if (!searchTerm) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, searchTerm]);

  // =========================================
  // Reset scroll state when switching chats
  // =========================================
  useEffect(() => {
    isPrependingRef.current = false;
    previousScrollHeightRef.current = 0;
    setEditingMessage(null);
    setInput("");
  }, [selectedUser?.uid]);

  // =========================================
  // تحديث حالة الرسائل الواردة إلى "seen" ✓✓ أزرق
  // بيشتغل كل مرة الرسائل تتحدّث والمحادثة مفتوحة عندي فعلياً (الكومبوننت شغال)
  // =========================================
  useEffect(() => {
    if (!currentUserId || !selectedUser?.uid) return;

    const chatId = [currentUserId, selectedUser.uid].sort().join("_");
    const unseenMessages = messages.filter(
      (message) =>
        message.senderId === selectedUser.uid && message.status !== "seen",
    );
    if (unseenMessages.length === 0) return;

    unseenMessages.forEach((message) => {
      updateDoc(doc(db, "chats", chatId, "messages", message.id), {
        status: "seen",
      }).catch((error) => {
        console.error("❌ Error marking message as seen:", error);
      });
    });
  }, [messages, currentUserId, selectedUser?.uid]);

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

  // =========================================
  // Scroll to selected search result
  // =========================================
  useEffect(() => {
    if (!searchResults.length) return;
    const result = searchResults[currentResult];
    if (!result) return;

    const messageElement = document.getElementById(`message-${result.id}`);
    messageElement?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentResult, searchResults]);

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

  // =========================================
  // Edit Message
  // =========================================
  const handleEditMessage = (message) => {
    if (message.senderId !== currentUserId) return;
    setEditingMessage(message);
    setInput(message.text || "");

    setTimeout(() => {
      document.querySelector(".message-input input")?.focus();
    }, 0);
  };

  // =========================================
  // Cancel Edit
  // =========================================
  const handleCancelEdit = () => {
    setEditingMessage(null);
    setInput("");
  };

  // =========================================
  // Delete Message
  // =========================================
  const handleDeleteMessage = async (message) => {
    if (message.senderId !== currentUserId) return;

    try {
      const chatId = [currentUserId, selectedUser.uid].sort().join("_");

      const messageRef = doc(db, "chats", chatId, "messages", message.id);

      const chatRef = doc(db, "chats", chatId);

      const isLastMessage =
        messages.length > 0 && messages[messages.length - 1]?.id === message.id;

      // الرسالة غير مقروءة إذا لم تكن seen
      const isUnread = message.status !== "seen";

      // الرسائل المتبقية بعد الحذف
      const remainingMessages = messages.filter((msg) => msg.id !== message.id);

      // =========================================
      // حذف الرسالة
      // =========================================
      await deleteDoc(messageRef);

      // =========================================
      // تحديث الـ Chat والـ unread count
      // في نفس updateDoc
      // =========================================
      const chatUpdates = {};

      // إذا كانت الرسالة المحذوفة هي آخر رسالة
      if (isLastMessage) {
        if (remainingMessages.length > 0) {
          const previousMessage =
            remainingMessages[remainingMessages.length - 1];

          chatUpdates.lastMessage = previousMessage.text || "";
          chatUpdates.lastMessageTime = previousMessage.timestamp || null;
        } else {
          chatUpdates.lastMessage = "";
          chatUpdates.lastMessageTime = null;
        }
      }

      // إذا كانت الرسالة غير مقروءة عند الطرف الآخر
      if (isUnread) {
        chatUpdates[`unreadCounts.${selectedUser.uid}`] = increment(-1);
      }

      // تنفيذ كل التحديثات مرة واحدة
      if (Object.keys(chatUpdates).length > 0) {
        await updateDoc(chatRef, chatUpdates);
      }

      // =========================================
      // إذا كانت الرسالة قيد التعديل
      // =========================================
      if (editingMessage?.id === message.id) {
        setEditingMessage(null);
        setInput("");
      }

      showToast("🗑️ تم حذف الرسالة", "success");
    } catch (error) {
      console.error("Error deleting message:", error);
      showToast("❌ فشل حذف الرسالة", "error");
    }
  };

  // =========================================
  // Send / Edit message
  // =========================================
  const handleSend = async () => {
    if (isBlocked) {
      showToast("🚫 You have blocked this user", "error");
      return;
    }

    if (isBlockedByUser) {
      showToast("🚫 You cannot send messages to this user", "error");
      return;
    }

    if (!input.trim()) {
      showToast("📝 Please type a message", "error");
      return;
    }

    setIsSending(true);

    try {
      if (editingMessage) {
        const chatId = [currentUserId, selectedUser.uid].sort().join("_");
        const messageRef = doc(
          db,
          "chats",
          chatId,
          "messages",
          editingMessage.id,
        );

        const newText = input.trim();
        await updateDoc(messageRef, {
          text: newText,
          edited: true,
        });

        const chatRef = doc(db, "chats", chatId);
        const isLastMessage =
          messages.length > 0 &&
          messages[messages.length - 1]?.id === editingMessage.id;

        if (isLastMessage) {
          await updateDoc(chatRef, {
            lastMessage: newText,
            lastMessageTime: serverTimestamp(),
          });
        } else {
          await updateDoc(chatRef, {
            lastMessageTime: serverTimestamp(),
          });
        }

        setEditingMessage(null);
        setInput("");
        showToast("✏️ تم تعديل الرسالة", "success");
        return;
      }

      await onSendMessage(input);
      setInput("");
    } catch (error) {
      console.error("Send/Edit message error:", error);
      if (editingMessage) {
        showToast("❌ Failed to edit message", "error");
      } else {
        showToast("❌ Failed to send message", "error");
      }
    } finally {
      setIsSending(false);
    }
  };

  // =========================================
  // Enter key
  // =========================================
  const handleInputKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // =========================================
  // Handle messages scroll
  // =========================================
  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (
      container.scrollTop < 80 &&
      hasMoreMessages &&
      !loadingMoreMessages &&
      onLoadMoreMessages
    ) {
      previousScrollHeightRef.current = container.scrollHeight;
      isPrependingRef.current = true;
      onLoadMoreMessages();
    }
  };

  // =========================================
  // Search result helpers
  // =========================================
  const isCurrentSearchResult = (messageId) => {
    return searchResults[currentResult]?.id === messageId;
  };

  // =========================================
  // Get delivery status icon
  // =========================================
  const getDeliveryStatusIcon = (message) => {
    if (message.senderId !== currentUserId) {
      return null;
    }

    const status = message.status || "sent";

    switch (status) {
      case "sending":
        return (
          <img
            src={clockIcon}
            alt="sending"
            style={{ width: "14px", height: "14px", marginLeft: "4px" }}
          />
        );
      case "sent":
        return (
          <img
            src={singleGreyIcon}
            alt="sent"
            style={{ width: "14px", height: "14px", marginLeft: "4px" }}
          />
        );
      case "delivered":
        return (
          <img
            src={doubleGreyIcon}
            alt="delivered"
            style={{ width: "14px", height: "14px", marginLeft: "4px" }}
          />
        );
      case "seen":
        return (
          <img
            src={doubleBlueIcon}
            alt="seen"
            style={{ width: "14px", height: "14px", marginLeft: "4px" }}
          />
        );
      default:
        return (
          <img
            src={singleGreyIcon}
            alt="sent"
            style={{ width: "14px", height: "14px", marginLeft: "4px" }}
          />
        );
    }
  };

  // =========================================
  // Empty chat
  // =========================================
  if (!selectedUser) {
    return <div className="chat-window empty"></div>;
  }

  // =========================================
  // Render
  // =========================================
  return (
    <div className="chat-window-all">
      <div className="chat-window">
        {/* ========================================= Chat Header ========================================= */}
        <div className="chat-header">
          <div className="chat-user-info">
            <div className="user-avatar user-list-avatar">
              {selectedUser.photoURL ? (
                <img
                  src={selectedUser.photoURL}
                  alt={selectedUser.displayName}
                />
              ) : (
                <div className="avatar-placeholder">
                  {selectedUser.displayName?.[0]?.toUpperCase() || "?"}
                </div>
              )}
              {selectedUser.showOnlineStatus && (
                <div
                  className={`online-dot ${selectedUser.online ? "online" : "offline"}`}
                />
              )}
            </div>
            <div>
              <div className="chat-user-name">
                {selectedUser.displayName || selectedUser.email}
              </div>
              {selectedUser.showOnlineStatus && (
                <div className="chat-user-status">
                  {selectedUser.online
                    ? "Online"
                    : selectedUser.lastSeen?.toDate
                      ? `Last seen ${selectedUser.lastSeen
                          .toDate()
                          .toLocaleString([], {
                            minute: "2-digit",
                            hour: "2-digit",
                            day: "2-digit",
                            month: "short",
                          })}`
                      : "Offline"}
                </div>
              )}
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
              onClick={() => onStartCall?.(selectedUser.uid, "audio")}
              disabled={isInCall}
              title="Voice Call"
            >
              <img src={callIcon} style={{ height: "25px" }} alt="Voice Call" />
            </button>
            <button
              className="callIcon setting"
              onClick={() => onStartCall?.(selectedUser.uid, "video")}
              disabled={isInCall}
              title="Video Call"
            >
              <img
                src={videoCallIcon}
                style={{ height: "25px" }}
                alt="Video Call"
              />
            </button>
            <button
              className="more setting"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              <img src={moreIcon} style={{ height: "30px" }} alt="More" />
            </button>
          </div>
        </div>

        {/* ========================================= Search ========================================= */}
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

        {/* ========================================= Messages ========================================= */}
        <div
          className="messages-area"
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
        >
          {loadingMoreMessages && <Spinner text="جاري تحميل رسائل أقدم..." />}
          {!hasMoreMessages && messages.length > 0 && (
            <div
              className="no-more-messages"
              style={{
                textAlign: "center",
                padding: "8px",
                fontSize: "12px",
                opacity: 0.6,
              }}
            ></div>
          )}

          {messages.length === 0 ? (
            <div className="empty-messages">
              💬 No messages yet
              <span className="empty-sub">Send the first message! 🎉</span>
            </div>
          ) : (
            messages.map((message) => {
              const messageIsCurrentResult = isCurrentSearchResult(message.id);
              const statusIcon = getDeliveryStatusIcon(message);
              const isMyMessage = message.senderId === currentUserId;

              return (
                <div
                  key={message.id}
                  id={`message-${message.id}`}
                  className={`message-wrapper ${isMyMessage ? "my-message" : ""}`}
                >
                  <div
                    className={`message-bubble ${isMyMessage ? "sent" : "received"} ${
                      messageIsCurrentResult ? "current-search-result" : ""
                    }`}
                  >
                    <span>
                      {" " + message.text}
                      {message.edited && (
                        <span className="edited-label"> (edited)</span>
                      )}
                    </span>
                    <span className="message-time">
                      {message.timestamp?.toDate?.()?.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      }) || ""}
                      {statusIcon}
                    </span>

                    {isMyMessage && (
                      <div className="message-actions-menu">
                        <button
                          type="button"
                          onClick={() => handleEditMessage(message)}
                        >
                          <img
                            src={editmass}
                            alt="edit"
                            style={{ width: "15px", height: "15px" }}
                          />{" "}
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(message)}
                        >
                          <img
                            src={deleteIcon}
                            alt="delete"
                            style={{ width: "15px", height: "15px" }}
                          />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ========================================= Message Input ========================================= */}
        <div
          className={`message-input ${
            isBlocked || isBlockedByUser ? "blocked-message-input" : ""
          } ${editingMessage ? "editing-message-input" : ""}`}
        >
          {editingMessage && (
            <button
              type="button"
              className="cancel-edit-btn"
              onClick={handleCancelEdit}
              title="Cancel edit"
            >
              ✕
            </button>
          )}
          <input
            placeholder={
              editingMessage
                ? "Edit message..."
                : isBlocked
                  ? "You blocked this user"
                  : isBlockedByUser
                    ? "You can't message this user"
                    : "Type a message..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={isSending || isBlocked || isBlockedByUser}
          />
          <button
            onClick={handleSend}
            disabled={isSending || isBlocked || isBlockedByUser}
            title={editingMessage ? "Save changes" : "Send message"}
          >
            <img
              src={sendIcon}
              alt={editingMessage ? "Edit" : "Send"}
              style={{ height: "20px" }}
            />
          </button>
        </div>
      </div>

      {/* ========================================= Receiver Sidebar ========================================= */}
      {showSidebar && (
        <ReceiverSidebar
          selectedUser={selectedUser}
          onClose={() => setShowSidebar(false)}
          showToast={showToast}
          onSelectGroup={onSelectGroup}
          onSwitchToGroups={onSwitchToGroups}
        />
      )}

      {/* ========================================= Outgoing Call Overlay ========================================= */}
      {outgoingCall && !isInCall && (
        <div className="incoming-call-overlay">
          <div className="incoming-call-card">
            <div className="incoming-call-avatar">
              {selectedUser?.photoURL ? (
                <img
                  src={selectedUser.photoURL}
                  alt={selectedUser.displayName}
                  className="caller-avatar"
                />
              ) : (
                <div className="caller-avatar-placeholder">
                  {selectedUser?.displayName?.[0]?.toUpperCase() || "?"}
                </div>
              )}
            </div>
            <h3>Calling...</h3>
            <p className="caller-name">
              {selectedUser?.displayName || selectedUser?.email || "Unknown"}
            </p>
            <p className="call-type">
              {outgoingCall.type === "video"
                ? "📹 Video Call"
                : "🎧 Voice Call"}
            </p>
            <div className="call-actions">
              <button
                className="reject-call-btn"
                onClick={() => onCancelOutgoingCall?.()}
              >
                <img src={endCallIcon} alt="Cancel" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWindow;
