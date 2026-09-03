import { useEffect, useState } from "react";
import { db, auth } from "../../../config/firebase";
import {
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  query,
  where,
} from "firebase/firestore";

const ReceiverSidebar = ({
  selectedUser,
  onClose,
  showToast,
  onSelectGroup, // ✅ إضافة prop
  onSwitchToGroups,
}) => {
  const [isBlocked, setIsBlocked] = useState(false);
  const [isLoadingBlock, setIsLoadingBlock] = useState(false);

  const currentUserId = auth.currentUser?.uid;
  const [commonGroups, setCommonGroups] = useState([]);

  // =========================================
  // Get Common Groups
  // =========================================

  useEffect(() => {
    if (!currentUserId || !selectedUser?.uid) {
      setCommonGroups([]);
      return;
    }

    const groupsRef = collection(db, "groups");

    // نجيب الجروبات التي أنا عضو فيها
    const groupsQuery = query(
      groupsRef,
      where("members", "array-contains", currentUserId),
    );

    const unsubscribe = onSnapshot(
      groupsQuery,
      (snapshot) => {
        const groups = snapshot.docs
          .map((groupDoc) => ({
            id: groupDoc.id,
            ...groupDoc.data(),
          }))
          .filter((group) => group.members?.includes(selectedUser.uid));

        setCommonGroups(groups);
      },
      (error) => {
        console.error("Error fetching common groups:", error);
      },
    );

    return unsubscribe;
  }, [currentUserId, selectedUser?.uid]);
  // =========================================
  // Check Block Status
  // =========================================

  useEffect(() => {
    if (!currentUserId || !selectedUser?.uid) return;

    const blockId = `${currentUserId}_${selectedUser.uid}`;

    const blockRef = doc(db, "blocks", blockId);

    const unsubscribe = onSnapshot(
      blockRef,
      (snapshot) => {
        setIsBlocked(snapshot.exists());
      },
      (error) => {
        console.error("Error checking block:", error);
      },
    );

    return unsubscribe;
  }, [currentUserId, selectedUser?.uid]);

  if (!selectedUser) return null;

  // =========================================
  // ✅ Handle Group Click - فتح المجموعة
  // =========================================

  const handleGroupClick = (group) => {
    console.log("🔄 Group clicked:", group.name);
    console.log("📤 Calling onSwitchToGroups...");

    // 1. إغلاق الـ Sidebar الحالي
    onClose();

    // 2. التبديل إلى GroupsList
    if (onSwitchToGroups) {
      console.log("✅ onSwitchToGroups exists, calling it...");
      onSwitchToGroups();
    } else {
      console.log("❌ onSwitchToGroups is undefined!");
    }

    // 3. فتح نافذة المجموعة
    if (onSelectGroup) {
      console.log("✅ onSelectGroup exists, calling it...");
      onSelectGroup(group);
    } else {
      console.log("❌ onSelectGroup is undefined!");
    }

    showToast?.(`👥 تم فتح مجموعة ${group.name}`, "success");
  };

  if (!selectedUser) return null;

  // =========================================
  // Block / Unblock
  // =========================================

  const handleBlockToggle = async () => {
    if (!currentUserId || !selectedUser?.uid) {
      showToast("❌ User information is missing", "error");
      return;
    }

    const blockId = `${currentUserId}_${selectedUser.uid}`;

    const blockRef = doc(db, "blocks", blockId);

    setIsLoadingBlock(true);

    try {
      if (isBlocked) {
        // =========================
        // UNBLOCK
        // =========================

        await deleteDoc(blockRef);

        setIsBlocked(false);

        showToast(
          `✅ ${selectedUser.displayName || "User"} has been unblocked`,
          "success",
        );
      } else {
        // =========================
        // BLOCK
        // =========================

        await setDoc(blockRef, {
          blockerId: currentUserId,
          blockedUserId: selectedUser.uid,
          createdAt: serverTimestamp(),
        });

        setIsBlocked(true);

        showToast(
          `🚫 ${selectedUser.displayName || "User"} has been blocked`,
          "info",
        );
      }
    } catch (error) {
      console.error("Block error:", error);

      showToast(
        isBlocked ? "❌ Failed to unblock user" : "❌ Failed to block user",
        "error",
      );
    } finally {
      setIsLoadingBlock(false);
    }
  };

  return (
    <div className="receiver-sidebar profile-section">
      {/* Profile Header */}
      <div className="profile-header">
        <h3>👤 Contact info</h3>

        <button className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      {/* Profile Photo */}
      <div className="profile-photo-section" style={{ marginBottom: "0px" }}>
        {selectedUser.photoURL ? (
          <img
            src={selectedUser.photoURL}
            className="profile-large-photo"
            alt={selectedUser.displayName}
          />
        ) : (
          <div className="profile-large-placeholder">
            {selectedUser.displayName?.[0]?.toUpperCase() || "👤"}
          </div>
        )}
      </div>

      {/* User Information */}
      <div className="receiver-info">
        <h3 className="receiver-name">
          {selectedUser.displayName || "Unknown User"}
        </h3>

        <p className="receiver-email">
          {selectedUser.email || "No email available"}
        </p>
      </div>

      <hr style={{ color: "#606060" }} />

      {/* Details */}
      <div className="receiver-details">
        <div style={{ marginBottom: "10px" }}>
          <h4>About</h4>

          <p>{selectedUser.bio || "Hey there! I am using WhatsApp"}</p>
        </div>

        <div style={{ marginBottom: "5px" }}>
          <h4>Phone number</h4>

          <p>{selectedUser.number || "Not available"}</p>
        </div>
      </div>

      <hr style={{ color: "#606060", marginTop: "10px" }} />

      {/* Groups */}
      <div className="receiver-details">
        <div>
          <h4>Group in common</h4>

          <div className="common-groups">
            {commonGroups.length === 0 ? (
              <p className="no-common-groups">No groups in common</p>
            ) : (
              commonGroups.map((group) => (
                <div
                  key={group.id}
                  className="common-group-item"
                  onClick={() => handleGroupClick(group)}
                >
                  <div className="common-group-avatar">
                    {group.photoURL ? (
                      <img src={group.photoURL} alt={group.name} />
                    ) : (
                      <span>👥</span>
                    )}
                  </div>

                  <div className="common-group-info">
                    <div className="common-group-name">{group.name}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Block / Unblock */}
      <div
        style={{
          marginTop: "auto",
          width: "100%",
          padding: "10px 0",
        }}
      >
        <button
          className="block-user-btn"
          onClick={handleBlockToggle}
          disabled={isLoadingBlock}
          style={{
            width: "100%",
            padding: "10px",
            backgroundColor:
              //  isBlocked
              //   ? "#4caf50":
              "#d45555",
            color: "#0f0f0f",
            border: "none",
            borderRadius: "5px",
            cursor: isLoadingBlock ? "not-allowed" : "pointer",
            fontWeight: "bold",
            opacity: isLoadingBlock ? 0.7 : 1,
          }}
        >
          {isLoadingBlock
            ? "⏳ Please wait..."
            : isBlocked
              ? "✅ Unblock User"
              : "🚫 Block User"}
        </button>
      </div>
    </div>
  );
};

export default ReceiverSidebar;
