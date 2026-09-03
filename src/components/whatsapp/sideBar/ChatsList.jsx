import { useState } from "react";

import searchIcon from "../../../assets/search.png";

const ChatsList = ({ chats, onSelectUser, onOpenUsersList }) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredChats = chats.filter((chat) => {
    const name = (
      chat.otherUser?.displayName ||
      chat.otherUser?.email ||
      ""
    ).toLowerCase();

    return name.includes(searchTerm.toLowerCase());
  });

  return (
    <>
      {/* Search */}
      <div className="sidebarheader">
        <div className="search-field-container">
          <img src={searchIcon} alt="search" className="inner-search-icon" />

          <input
            type="text"
            className="search-users"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Chats List */}
      <div className="chats-list">
        {filteredChats.length === 0 ? (
          <div className="empty-chats">
            <p>💬 No conversations yet</p>

            <p className="empty-hint">Click + to start a new chat</p>
          </div>
        ) : (
          filteredChats.map((chat) => {
            const unread = chat.unreadCount || 0;

            return (
              <div
                className="group-item chat-item"
                key={chat.chatId}
                onClick={() => onSelectUser(chat.otherUser)}
              >
                {/* Avatar */}
                <div className="chat-avatar">
                  {chat.otherUser?.photoURL &&
                  chat.otherUser.photoURL.trim() !== "" ? (
                    <img
                      src={chat.otherUser.photoURL}
                      alt={chat.otherUser.displayName?.[0]?.toUpperCase()}
                    />
                  ) : (
                    <div className="avatar-placeholder">
                      {chat.otherUser?.displayName?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                </div>

                {/* Chat Info */}
                <div className="chat-info">
                  <div className="chat-name-wrapper">
                    <span className="chat-name">
                      {chat.otherUser?.displayName || chat.otherUser?.email}
                    </span>
                  </div>

                  <div className="chat-last-message">
                    {chat.lastMessage?.slice(0, 30)}

                    {chat.lastMessage?.length > 30 && "..."}
                  </div>
                </div>

                {/* Unread */}
                {unread > 0 && <span className="unread-badge">{unread}</span>}

                {/* Time */}
                <div className="chat-time">
                  {chat.lastMessageTime?.toDate?.()?.toLocaleTimeString([], {
                    minute: "2-digit",
                    hour: "2-digit",
                  }) || ""}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add New User */}
      <div className="sidebar-header-left">
        <button className="hamburger-btn" onClick={onOpenUsersList}>
          <span>+</span>
        </button>
      </div>
    </>
  );
};

export default ChatsList;
