import { useState, useEffect } from "react";
import { db } from "../../../config/firebase";

import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  orderBy,
} from "firebase/firestore";

import searchIcon from "../../../assets/search.png";
import addIcon from "../../../assets/add.png";
import pin from "../../../assets/pen.png";
import icon from "../../../assets/icon.png";

const GroupsList = ({
  currentUserId,
  showToast,
  onSelectGroup,
  onSwitchToChats,
}) => {
  // =========================================
  // States
  // =========================================

  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);

  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const [groupName, setGroupName] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [selectedMembers, setSelectedMembers] = useState([]);

  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // =========================================
  // Get Users
  // =========================================

  useEffect(() => {
    if (!currentUserId) return;

    const usersRef = collection(db, "users");

    const unsubscribe = onSnapshot(
      usersRef,
      (snapshot) => {
        const usersList = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((user) => user.id !== currentUserId);

        setUsers(usersList);
      },
      (error) => {
        console.error("Error fetching users:", error);
      },
    );

    return unsubscribe;
  }, [currentUserId]);

  // =========================================
  // Get Groups
  // =========================================

  useEffect(() => {
    if (!currentUserId) return;

    const groupsRef = collection(db, "groups");

    const q = query(
      groupsRef,
      where("members", "array-contains", currentUserId),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const groupsList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setGroups(groupsList);
      },
      (error) => {
        console.error("Error fetching groups:", error);
      },
    );

    return unsubscribe;
  }, [currentUserId]);

  // =========================================
  // Select / Unselect Member
  // =========================================

  const toggleMember = (userId) => {
    setSelectedMembers((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      }

      return [...prev, userId];
    });
  };

  // =========================================
  // Create Group
  // =========================================

  const createGroup = async () => {
    const trimmedName = groupName.trim();

    if (!trimmedName) {
      showToast?.("Please enter a group name", "error");
      return;
    }

    if (selectedMembers.length === 0) {
      showToast?.("Please select at least one member", "error");
      return;
    }

    try {
      setLoading(true);

      let finalPhotoURL =
        "https://res.cloudinary.com/dcmadldlg/image/upload/v1787737070/groupprof.png"; // القيمة الافتراضية فارغة إذا لم يتم اختيار صورة

      // 1. رفع الصورة إلى Cloudinary بنفس طريقة Profile
      if (photoFile) {
        const formData = new FormData();
        formData.append("file", photoFile);
        formData.append("upload_preset", "profile_images"); // يمكنك استخدام نفس الـ preset أو تخصيص واحد للمجموعات

        const response = await fetch(
          "https://api.cloudinary.com/v1_1/dcmadldlg/image/upload",
          {
            method: "POST",
            body: formData,
          },
        );

        const data = await response.json();

        if (data.secure_url) {
          finalPhotoURL = data.secure_url;
        } else {
          throw new Error("Failed to upload image to Cloudinary");
        }
      }

      // Add current user as a member automatically
      const members = [
        currentUserId,
        ...selectedMembers.filter((id) => id !== currentUserId),
      ];

      // 2. حفظ المجموعة في الفايرستور مع رابط الصورة الدائم
      await addDoc(collection(db, "groups"), {
        name: trimmedName,
        createdBy: currentUserId,
        members: members,
        photoURL: finalPhotoURL,
        createdAt: serverTimestamp(),
      });

      // Reset form
      setGroupName("");
      setPhotoFile(null);
      setPhotoURL("");
      setSelectedMembers([]);
      setShowCreateGroup(false);

      showToast?.("Group created successfully", "success");
    } catch (error) {
      console.error("Error creating group:", error);
      showToast?.("Failed to create group", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setPhotoFile(file);
    setPhotoURL(URL.createObjectURL(file)); // معاينة مؤقتة محلية
  };

  // =========================================
  // Cancel Create Group
  // =========================================

  const cancelCreateGroup = () => {
    setGroupName("");
    setPhotoFile(null);
    setPhotoURL("");
    setSelectedMembers([]);
    setShowCreateGroup(false);
  };

  // =========================================
  // Render
  // =========================================

  return (
    <div className="groups-container">
      {/* Search Header */}
      {!showCreateGroup && (
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
      )}

      {/* Create Group Section */}
      {showCreateGroup ? (
        <div className="create-group-section">
          <div className="create-group-header">
            <img src={addIcon} alt="add" />
            <h3>Create Group</h3>
          </div>

          {/* Group Name */}
          <div className="group-name-section">
            <label>Group name</label>

            <input
              type="text"
              placeholder="Enter group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>

          {/* Group photo */}
          <div className="group-name-section">
            <label>Group photo</label>
            <div className="profile-container">
              <label htmlFor="file-upload" className="edit-badge">
                <img src={pin} alt="edit" />
              </label>

              <img className="prfilePic" src={photoURL || icon} alt="profile" />

              <input
                id="file-upload"
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handlePhotoChange}
              />
            </div>
          </div>

          {/* Members */}
          <div className="members-section">
            <h4>Add members</h4>

            {users.length === 0 ? (
              <p className="no-users">No users available</p>
            ) : (
              <div className="users-list">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="user-item"
                    onClick={() => toggleMember(user.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(user.id)}
                      onChange={() => toggleMember(user.id)}
                      onClick={(e) => e.stopPropagation()}
                    />

                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName}
                        className="group-user-image"
                      />
                    ) : (
                      <div className="group-user-placeholder">
                        {user.displayName?.charAt(0)?.toUpperCase() || "👤"}
                      </div>
                    )}

                    <div className="group-user-info">
                      <span className="group-user-name">
                        {user.displayName || "Unknown User"}
                      </span>

                      {user.email && (
                        <span className="group-user-email">{user.email}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected Members */}
          <div className="selected-members-count">
            {selectedMembers.length} member
            {selectedMembers.length !== 1 ? "s" : ""} selected
          </div>

          {/* Buttons */}
          <div className="create-group-actions">
            <button
              className="cancel-group-button"
              onClick={cancelCreateGroup}
              disabled={loading}
            >
              Cancel
            </button>

            <button
              className="save-group-button"
              onClick={createGroup}
              disabled={loading}
            >
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      ) : (
        /* Groups List */
        <div className="chats-list">
          {groups.length === 0 ? (
            <div className="empty-chats">
              <p>👥 No groups yet</p>

              <p className="empty-hint">
                Click + to create a group and start chatting with your friends.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div
                key={group.id}
                className="chat-item"
                onClick={() => {
                  onSelectGroup(group);
                  // ✅ لا نستدعي onSwitchToChats هنا
                  // لأننا نريد البقاء في قائمة الجروبات
                }}
              >
                <div className="chat-avatar">
                  {group.photoURL ? (
                    <img
                      src={group.photoURL}
                      alt={group.name}
                      className="group-image"
                    />
                  ) : (
                    <div className="group-placeholder">👥</div>
                  )}
                </div>

                <div className="chat-info">
                  <div className="chat-name-wrapper">
                    <span className="chat-name">{group.name} </span>
                  </div>


                  <div className="chat-last-message">
                    {group.lastMessage
                      ? group.lastMessage.slice(0, 30)
                      : "No messages yet"}

                    {group.lastMessage?.length > 30 && "..."}
                  </div></div>

                  {group.lastMessageTime && (
                    <div className="chat-time">
                      {group.lastMessageTime.toDate().toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                </div>
            ))
          )}
        </div>
      )}

      <div className="sidebar-header-left">
        <button
          className="hamburger-btn"
          onClick={() => setShowCreateGroup(true)}
        >
          +
        </button>
      </div>
    </div>
  );
};

export default GroupsList;
