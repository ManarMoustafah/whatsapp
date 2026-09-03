import { useState } from "react";
import searchIcon from "../../../assets/search.png";

const UsersList = ({ users, onStartChat, onClose }) => {
  const [searchTerm, setSearchTerm] = useState("");

  // Filter users
  const filteredUsers = users.filter((user) => {
    const searchText = (user.displayName || user.email || "").toLowerCase();

    return searchText.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="users-list-overlay">
      <div className="users-list-modal">
        {/* Header */}

        <div className="users-list-header">
          <h3>👥 Users</h3>

          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Search */}

        <div className="sidebarheader">
          <div className="search-field-container">
            <img src={searchIcon} alt="Search" className="inner-search-icon" />

            <input
              type="text"
              className="search-users"
              placeholder="Search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Users */}

        <div className="users-list-items">
          {filteredUsers.length === 0 ? (
            <div className="no-users-found">
              <p>😕 No new users found</p>
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div
                key={user.uid}
                className="user-list-item"
                onClick={() => onStartChat(user)}
              >
                {/* Avatar */}

                <div className="user-list-avatar">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || "User"} />
                  ) : (
                    <div className="avatar-placeholder">
                      {user.displayName?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}

                  <div
                    className={`online-dot ${
                      user.online ? "online" : "offline"
                    }`}
                  />
                </div>

                {/* User Info */}

                <div className="user-list-info">
                  <div className="user-list-name">
                    {user.displayName || user.email || "Unknown User"}
                  </div>

                  <div className="user-list-status">
                    {user.online ? "Online" : "Offline"}
                  </div>
                </div>

                {/* Start Chat */}

                <button
                  className="start-chat-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartChat(user);
                  }}
                >
                  ➕ Start
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default UsersList;