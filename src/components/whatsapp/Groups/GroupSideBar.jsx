import { useEffect, useState } from "react";
import { db } from "../../../config/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  setDoc,
  serverTimestamp,
  deleteDoc,
  arrayUnion,
} from "firebase/firestore";
import pin from "../../../assets/pen.png";
import groupprof from "../../../assets/groupprof.png";

const GroupSideBar = ({
  selectedGroup,
  currentUserId,
  onClose,
  showToast,
  onStartChat,
  onSelectUser,
  onSwitchToChats,
}) => {
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]); // لجلب كل مستخدمي التطبيق

  const [photoURL, setPhotoURL] = useState("");
  const [photoFile, setPhotoFile] = useState(null);

  // حالات تعديل اسم المجموعة
  const [isEditingName, setIsEditingName] = useState(false);
  const [groupName, setGroupName] = useState("");

  // حالة إظهار/إخفاء قائمة إضافة أعضاء جدد
  const [showAddMemberSection, setShowAddMemberSection] = useState(false);

  // =========================================
  // Get Group Data
  // =========================================
  useEffect(() => {
    if (!selectedGroup?.id) {
      setGroup(null);
      return;
    }

    const groupRef = doc(db, "groups", selectedGroup.id);

    const unsubscribe = onSnapshot(
      groupRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const groupData = {
            id: snapshot.id,
            ...snapshot.data(),
          };

          setGroup(groupData);
          setPhotoURL(groupData.photoURL || "");

          if (!isEditingName) {
            setGroupName(groupData.name || "");
          }
        } else {
          setGroup(null);
          setPhotoURL("");
          onClose();
        }
      },
      (error) => {
        console.error("Error fetching group:", error);
      },
    );

    return unsubscribe;
  }, [selectedGroup?.id, isEditingName]);

  // =========================================
  // Get Group Members & All Users
  // =========================================
  useEffect(() => {
    if (!group?.members) return;

    const usersRef = collection(db, "users");

    const unsubscribe = onSnapshot(
      usersRef,
      (snapshot) => {
        const usersList = snapshot.docs.map((userDoc) => ({
          id: userDoc.id,
          ...userDoc.data(),
        }));

        // أعضاء الجروب الحاليين
        const currentMembers = usersList.filter((user) =>
          group.members.includes(user.id),
        );
        setMembers(currentMembers);

        // تخزين كل المستخدمين لاستخدامهم في قائمة الإضافة
        setAllUsers(usersList);
      },
      (error) => {
        console.error("Error fetching users:", error);
      },
    );

    return unsubscribe;
  }, [group?.members]);

  // =========================================
  // Update Group Photo
  // =========================================
  const handlePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setPhotoFile(file);
    setPhotoURL(URL.createObjectURL(file));

    await updategropphoto(file);
  };

  const updategropphoto = async (file) => {
    if (!file || !group?.id) return;

    if (group.createdBy !== currentUserId) {
      showToast?.("Only the group creator can change the group photo", "error");
      return;
    }

    try {
      showToast?.("⏳ Uploading group photo...", "success");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", "profile_images");

      const response = await fetch(
        "https://api.cloudinary.com/v1_1/dcmadldlg/image/upload",
        { method: "POST", body: formData },
      );

      const data = await response.json();
      if (!data.secure_url) throw new Error("Failed to upload image");

      const finalPhotoURL = data.secure_url;
      const groupRef = doc(db, "groups", group.id);

      await updateDoc(groupRef, { photoURL: finalPhotoURL });
      setPhotoURL(finalPhotoURL);
      showToast?.("✅ Group photo updated successfully", "success");
    } catch (error) {
      console.error("❌ Error updating group photo:", error);
      showToast?.("❌ Failed to update group photo", "error");
    }
  };

  // =========================================
  // Update Group Name (Admin Only)
  // =========================================
  const handleUpdateGroupName = async () => {
    if (!groupName.trim()) {
      showToast?.("Group name cannot be empty", "error");
      return;
    }

    if (group.createdBy !== currentUserId) {
      showToast?.("Only the group creator can change the group name", "error");
      return;
    }

    try {
      const groupRef = doc(db, "groups", group.id);
      await updateDoc(groupRef, { name: groupName.trim() });

      setIsEditingName(false);
      showToast?.("✅ Group name updated successfully", "success");
    } catch (error) {
      console.error("Error updating group name:", error);
      showToast?.("❌ Failed to update group name", "error");
    }
  };

  // =========================================
  // Add Member to Group (Available for Everyone)
  // =========================================
  const handleAddMember = async (userId, userName) => {
    try {
      const groupRef = doc(db, "groups", group.id);
      await updateDoc(groupRef, {
        members: arrayUnion(userId),
      });

      showToast?.(`✅ Added ${userName} to the group`, "success");
    } catch (error) {
      console.error("Error adding member:", error);
      showToast?.("❌ Failed to add member", "error");
    }
  };

  // =========================================
  // Remove Member or Leave Group
  // =========================================
  const handleRemoveMember = async (memberId, memberName) => {
    const isSelfLeave = memberId === currentUserId;
    const confirmMsg = isSelfLeave
      ? "Are you sure you want to leave this group?"
      : `Are you sure you want to remove ${memberName} from the group?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const groupRef = doc(db, "groups", group.id);
      const updatedMembers = group.members.filter((id) => id !== memberId);

      if (updatedMembers.length === 0) {
        await deleteDoc(groupRef);
        showToast?.("Group deleted because it has no members", "success");
        onClose();
        return;
      }

      const updateData = { members: updatedMembers };

      if (group.createdBy === memberId) {
        updateData.createdBy = updatedMembers[0];
      }

      await updateDoc(groupRef, updateData);

      if (isSelfLeave) {
        showToast?.("You have left the group", "success");
        onClose();
      } else {
        showToast?.(`Successfully removed ${memberName}`, "success");
      }
    } catch (error) {
      console.error("Error removing member:", error);
      showToast?.("Failed to process request", "error");
    }
  };

  // =========================================
  // Click on group member
  // =========================================
  const handleMemberClick = async (member) => {
    if (member.id === currentUserId) return;

    try {
      const chatId = [currentUserId, member.id].sort().join("_");
      const chatRef = doc(db, "chats", chatId);
      const chatSnapshot = await getDoc(chatRef);

      if (!chatSnapshot.exists()) {
        await setDoc(chatRef, {
          participants: [currentUserId, member.id],
          lastMessage: "",
          lastMessageTime: serverTimestamp(),
          unreadCounts: { [currentUserId]: 0, [member.id]: 0 },
        });
      }

      if (onSwitchToChats) onSwitchToChats();
      if (onSelectUser) onSelectUser(member);
      onClose();
      if (onStartChat) await onStartChat(member);

      showToast?.(
        `💬 Started chat with ${member.displayName || member.email}`,
        "success",
      );
    } catch (error) {
      console.error("Error starting chat:", error);
      showToast?.("❌ Failed to start chat", "error");
    }
  };

  if (!selectedGroup || !group) return null;

  const deleteGroup = async (groupId, groupName, createdBy) => {
    if (createdBy !== currentUserId) {
      showToast?.("Only the group creator can delete this group", "error");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete "${groupName}"?`))
      return;

    try {
      await deleteDoc(doc(db, "groups", groupId));
      showToast?.("Group deleted successfully", "success");
      onClose();
    } catch (error) {
      console.error("Error deleting group:", error);
      showToast?.("Failed to delete group", "error");
    }
  };

  const creator = members.find((member) => member.id === group.createdBy);

  // المستخدمون غير الموجودين حالياً في المجموعة لإمكانية إضافتهم
  const nonMembers = allUsers.filter(
    (user) => !group.members.includes(user.id),
  );

  return (
    <div className="receiver-sidebar profile-section">
      {/* Header */}
      <div className="profile-header">
        <h3>👥 Group info</h3>
        <button className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Group Photo */}
      <div className="profile-photo-section">
        <div className="profile-container">
          {group.createdBy === currentUserId && (
            <label htmlFor="file-upload" className="edit-badge">
              <img src={pin} alt="edit" />
            </label>
          )}
          <img
            className="prfilePic"
            src={photoURL || group.photoURL || groupprof}
            alt="profile"
          />
          <input
            id="file-upload"
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handlePhotoChange}
          />
        </div>
      </div>

      {/* Group Name & Editing */}
      <div
        className="receiver-info"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          padding: "0 15px",
        }}
      >
        {isEditingName ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
            }}
          >
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              autoFocus
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                borderBottom: "2px solid #00a884",
                color: "#fff",
                fontSize: "16px",
                outline: "none",
                padding: "4px",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUpdateGroupName();
                if (e.key === "Escape") {
                  setIsEditingName(false);
                  setGroupName(group.name || "");
                }
              }}
            />
            <span
              onClick={handleUpdateGroupName}
              style={{ cursor: "pointer", fontSize: "18px", color: "#00a884" }}
              title="Save"
            >
              ✓
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h3 style={{ margin: 0, wordBreak: "break-word" }}>
              {group.name || "Unnamed Group"}
            </h3>
            {group.createdBy === currentUserId && (
              <img
                src={pin}
                alt="edit name"
                style={{
                  width: "16px",
                  height: "16px",
                  cursor: "pointer",
                  filter: "invert(1)",
                }}
                onClick={() => {
                  setGroupName(group.name || "");
                  setIsEditingName(true);
                }}
                title="Edit group name"
              />
            )}
          </div>
        )}
      </div>

      <hr style={{ color: "#606060", margin: "20px 0" }} />

      <div className="receiver-details">
        <div style={{ marginBottom: "5px" }}>
          <h4 style={{ marginTop: "10px" }}>Created by</h4>
          <div className="common-group-item">
            {creator?.photoURL ? (
              <img
                src={creator.photoURL}
                className="common-group-avatar"
                alt={creator.displayName}
              />
            ) : (
              <div className="common-group-avatar">
                <span>
                  {creator?.displayName?.charAt(0)?.toUpperCase() || "👤"}
                </span>
              </div>
            )}
            <p>{creator?.displayName || "Unknown user"}</p>
          </div>
        </div>
      </div>

      <hr style={{ color: "#606060" }} />

      {/* Members List & Add Member Feature */}
      <div className="receiver-details">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "10px",
          }}
        >
          <h4>Members ({members.length})</h4>

          {/* زر إظهار/إخفاء قائمة إضافة الأعضاء (متاح لجميع الأعضاء) */}
          <button
            onClick={() => setShowAddMemberSection(!showAddMemberSection)}
            style={{
              background: "#25d366",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            {showAddMemberSection ? "Cancel" : "+ Add Member"}
          </button>
        </div>

        {/* قائمة المستخدمين المتاح إضافتهم */}
        {showAddMemberSection && (
          <div
            style={{
              background: "#ccc",
              padding: "10px",
              borderRadius: "6px",
              margin: "10px 0",
              maxHeight: "150px",
              overflowY: "auto",
            }}
          >
            <p
              style={{
                fontSize: "11px",
                color: "#111111",
                marginBottom: "6px",
              }}
            >
              Select a user to add:
            </p>
            {nonMembers.length === 0 ? (
              <p style={{ fontSize: "12px", color: "#777" }}>
                No more users to add
              </p>
            ) : (
              nonMembers.map((user) => (
                <div
                  key={user.id}
                  onClick={() =>
                    handleAddMember(user.id, user.displayName || user.email)
                  }
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px",
                    cursor: "pointer",
                    borderBottom: "1px solid #333",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "#111111" }}>
                    {user.displayName || user.email}
                  </span>
                  <span style={{ color: "#00a884", fontWeight: "bold" }}>
                    + Add
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        <div className="group-members">
          {members.length === 0 ? (
            <p className="no-common-groups">No members found</p>
          ) : (
            members.map((member) => (
              <div
                key={member.id}
                className="common-group-item"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: member.id !== currentUserId ? "pointer" : "default",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flex: 1,
                  }}
                  onClick={() => handleMemberClick(member)}
                >
                  <div className="common-group-avatar">
                    {member.photoURL ? (
                      <img src={member.photoURL} alt={member.displayName} />
                    ) : (
                      <span>
                        {member.displayName?.charAt(0)?.toUpperCase() || "👤"}
                      </span>
                    )}
                  </div>

                  <div className="common-group-info">
                    <div className="common-group-name">
                      {member.displayName || "Unknown User"}
                      {member.id === group.createdBy && (
                        <span
                          style={{
                            marginLeft: "6px",
                            fontSize: "12px",
                            color: "#888",
                          }}
                        >
                          Admin
                        </span>
                      )}
                      {member.id === currentUserId && (
                        <span
                          style={{
                            marginLeft: "6px",
                            fontSize: "12px",
                            color: "#4CAF50",
                            fontWeight: "bold",
                          }}
                        >
                          (You)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* زر طرد العضو يظهر للأدمن فقط */}
                {group.createdBy === currentUserId &&
                  member.id !== currentUserId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveMember(member.id, member.displayName);
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#ff5252",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "bold",
                      }}
                      title="Remove member"
                    >
                      Remove
                    </button>
                  )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* الأزرار بالأسفل: الخروج من الجروب والحذف */}
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <button
          style={{
            width: "100%",
            padding: "10px",
            backgroundColor: "#444",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            fontWeight: "bold",
            fontSize: "12px",
            cursor: "pointer",
          }}
          onClick={(e) => {
            e.stopPropagation();
            const currentUserObj = members.find((m) => m.id === currentUserId);
            handleRemoveMember(
              currentUserId,
              currentUserObj?.displayName || "You",
            );
          }}
        >
          Leave Group
        </button>

        {group.createdBy === currentUserId && (
          <button
            style={{
              width: "100%",
              padding: "10px",
              backgroundColor: "#d45555",
              color: "#fff",
              border: "none",
              borderRadius: "5px",
              fontWeight: "bold",
              fontSize: "12px",
              cursor: "pointer",
            }}
            onClick={(e) => {
              e.stopPropagation();
              deleteGroup(group.id, group.name, group.createdBy);
            }}
          >
            Delete Group
          </button>
        )}
      </div>
    </div>
  );
};

export default GroupSideBar;
