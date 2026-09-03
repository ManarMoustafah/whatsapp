// import { signOut } from "firebase/auth";
// import { auth, db } from "../../config/firebase";
// import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
// import { doc, updateDoc, onSnapshot } from "firebase/firestore";
// import { useNavigate } from "react-router-dom"; // استيراد التوجيه

// import logoutIcon from "../../assets/logout.png";
// import chatIcon from "../../assets/chat.png";
// import groupIcon from "../../assets/group.png";

// import Profile from "./sideBar/ProfileInfo";
// import ChatsList from "./sideBar/ChatsList";
// import GroupsList from "./sideBar/GroupsList";

// const Sidebar = forwardRef(({
//   chats,
//   onSelectUser,
//   currentUserId,
//   onOpenUsersList,
//   showToast,
//   onSelectGroup,
// }, ref) => {
//   const navigate = useNavigate(); // تهيئة الـ Navigate للذهاب لصفحة تسجيل الدخول بعد الخروج

//   // =========================================
//   // States
//   // =========================================

//   const [showProfile, setShowProfile] = useState(false);
//   const [showGroups, setShowGroups] = useState(false);
//   const [profileData, setProfileData] = useState({
//     displayName: "",
//     email: "",
//     photoURL: "",
//     bio: "Hey there! I am using WhatsApp",
//     online: true,
//     showOnlineStatus: true,
//   });

//   // =========================================
//   // Get User Data
//   // =========================================

//   useEffect(() => {
//     const user = auth.currentUser;

//     if (!user?.uid) {
//       console.log("❌ No authenticated user");
//       return;
//     }

//     const userRef = doc(db, "users", user.uid);

//     const unsubscribe = onSnapshot(
//       userRef,
//       (snapshot) => {
//         if (!snapshot.exists()) {
//           console.error("❌ User document does not exist:", user.uid);
//           return;
//         }

//         const data = snapshot.data();

//         const userData = {
//           displayName: data.displayName || "",
//           email: data.email || "",
//           photoURL: data.photoURL || "",
//           bio:
//             data.bio !== undefined
//               ? data.bio
//               : "Hey there! I am using WhatsApp",
//           online: data.online ?? true,
//           showOnlineStatus: data.showOnlineStatus ?? true,
//         };

//         setProfileData(userData);
//       },
//       (error) => {
//         console.error("❌ Error fetching user data:", error);
//       },
//     );

//     return unsubscribe;
//   }, []);

//   // مراقبة التغييرات
//   useEffect(() => {
//   }, [showGroups]);

//   // =========================================
//   // Open Profile
//   // =========================================

//   const openProfile = () => {
//     setShowProfile(true);
//     setShowGroups(false);
//   };

//   // =========================================
//   // Open Chats
//   // =========================================

//   const openChats = () => {
//     setShowProfile(false);
//     setShowGroups(false);
//   };

//   // =========================================
//   // Open Groups
//   // =========================================

//   const openGroups = () => {
//     setShowGroups(true);
//     setShowProfile(false);
//   };

//   // =========================================
//   // Switch to Groups
//   // =========================================

//   const switchToGroups = () => {
//     setShowGroups(true);
//     setShowProfile(false);
//   };

//   // =========================================
//   // Switch to Chats
//   // =========================================

//   const switchToChats = () => {
//     setShowGroups(false);
//     setShowProfile(false);
//   };

//   // جعل الدوال متاحة من خلال ref
//   useImperativeHandle(ref, () => ({
//     switchToGroups,
//     switchToChats,
//   }));

//   // =========================================
//   // Logout
//   // =========================================

//   const handleLogout = async () => {
//     try {
//       if (currentUserId) {
//         const userRef = doc(db, "users", currentUserId);

//         await updateDoc(userRef, {
//           online: false,
//           lastSeen: new Date(),
//         });
//       }

//       await signOut(auth);
//       showToast("👋 Logged out successfully", "info");
//       navigate("/login"); // التوجيه برمجياً إلى رابط تسجيل الدخول فوراً
//     } catch (error) {
//       console.error("Logout error:", error);
//     }
//   };

//   // =========================================
//   // Render
//   // =========================================

//   return (
//     <div className="sidebar">
//       <div className="sidebar-content">
//         {showProfile ? (
//           <Profile
//             profileData={profileData}
//             setProfileData={setProfileData}
//             onClose={openChats}
//             showToast={showToast}
//           />
//         ) : showGroups ? (
//           <GroupsList
//             currentUserId={currentUserId}
//             showToast={showToast}
//             onSelectGroup={onSelectGroup}
//             onSwitchToChats={switchToChats}
//           />
//         ) : (
//           <ChatsList
//             chats={chats}
//             onSelectUser={onSelectUser}
//             onOpenUsersList={onOpenUsersList}
//           />
//         )}
//       </div>

//       {/* =========================================
//           FOOTER
//       ========================================= */}

//       <div className="sidebar-footer-container">
//         <div className="sidebar-footer">
//           {/* Profile */}
//           <button
//             className={`setting ${showProfile ? "active" : ""}`}
//             onClick={openProfile}
//           >
//             {profileData.photoURL && profileData.photoURL.trim() !== "" ? (
//               <img
//                 src={profileData.photoURL}
//                 alt="My Profile"
//                 style={{
//                   width: "30px",
//                   height: "30px",
//                   borderRadius: "50%",
//                   marginTop: "5px",
//                 }}
//               />
//             ) : (
//               <div
//                 style={{
//                   width: "32px",
//                   height: "32px",
//                   borderRadius: "50%",
//                   background: "#ccc",
//                   display: "flex",
//                   alignItems: "center",
//                   justifyContent: "center",
//                   fontSize: "14px",
//                   fontWeight: "bold",
//                 }}
//               >
//                 {profileData.displayName?.[0]?.toUpperCase() || "👤"}
//               </div>
//             )}
//           </button>

//           {/* Chats */}
//           <button
//             className={`setting ${!showProfile && !showGroups ? "active" : ""}`}
//             onClick={openChats}
//           >
//             <img
//               src={chatIcon}
//               alt="Chats"
//               style={{
//                 width: "32px",
//                 height: "32px",
//                 borderRadius: "50%",
//                 marginTop: "5px",
//               }}
//             />
//           </button>

//           {/* Groups */}
//           <button
//             className={`setting ${showGroups ? "active" : ""}`}
//             onClick={openGroups}
//           >
//             <img
//               src={groupIcon}
//               alt="Groups"
//               style={{
//                 width: "32px",
//                 height: "32px",
//                 borderRadius: "50%",
//                 marginTop: "5px",
//               }}
//             />
//           </button>

//           {/* Logout */}
//           <button className="setting" onClick={handleLogout}>
//             <img
//               src={logoutIcon}
//               alt="Logout"
//               style={{
//                 width: "30px",
//                 height: "26px",
//                 marginRight: "5px",
//                 marginTop: "5px",
//               }}
//             />
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// });

// export default Sidebar;

import { signOut } from "firebase/auth";
import { auth, db } from "../../config/firebase";
import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { doc, updateDoc, onSnapshot, setDoc, getDoc } from "firebase/firestore"; // أضفنا setDoc و getDoc للتحقق والإنشاء التلقائي
import { useNavigate } from "react-router-dom";

import logoutIcon from "../../assets/logout.png";
import chatIcon from "../../assets/chat.png";
import groupIcon from "../../assets/group.png";

import Profile from "./sideBar/ProfileInfo";
import ChatsList from "./sideBar/ChatsList";
import GroupsList from "./sideBar/GroupsList";

const Sidebar = forwardRef(({
  chats,
  onSelectUser,
  currentUserId,
  onOpenUsersList,
  showToast,
  onSelectGroup,
  onSwitchToGroups,
  onSwitchToChats,
  onOpenProfile,
}, ref) => {
  const navigate = useNavigate();

  // =========================================
  // States
  // =========================================

  const [showProfile, setShowProfile] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [profileData, setProfileData] = useState({
    displayName: "",
    email: "",
    photoURL: "",
    bio: "Hey there! I am using WhatsApp",
    online: true,
    showOnlineStatus: true,
  });

  // =========================================
  // Get User Data
  // =========================================

  useEffect(() => {
    // الاعتماد على currentUserId المُمرر كخاصية لضمان الاستقرار
    const userId = currentUserId || auth.currentUser?.uid;

    if (!userId) {
      console.log("❌ No authenticated user ID available yet");
      return;
    }

    const userRef = doc(db, "users", userId);

    const unsubscribe = onSnapshot(
      userRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          console.warn("⚠️ User document does not exist in Firestore, creating default document for:", userId);
          
          // إنشاء مستند افتراضي لتجنب توقف التطبيق وحل المشكلة جذرياً
          const defaultUserData = {
            uid: userId,
            displayName: auth.currentUser?.displayName || "User",
            email: auth.currentUser?.email || "",
            photoURL: auth.currentUser?.photoURL || "",
            bio: "Hey there! I am using WhatsApp",
            online: true,
            showOnlineStatus: true,
          };

          try {
            await setDoc(userRef, defaultUserData, { merge: true });
          } catch (error) {
            console.error("Error creating missing user document:", error);
          }
          return;
        }

        const data = snapshot.data();

        const userData = {
          displayName: data.displayName || "",
          email: data.email || "",
          photoURL: data.photoURL || "",
          bio:
            data.bio !== undefined
              ? data.bio
              : "Hey there! I am using WhatsApp",
          online: data.online ?? true,
          showOnlineStatus: data.showOnlineStatus ?? true,
        };

        setProfileData(userData);
      },
      (error) => {
        console.error("❌ Error fetching user data:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUserId]);

  // =========================================
  // Open Profile / Chats / Groups Actions
  // =========================================

 const openProfile = () => {
  setShowProfile(true);
  setShowGroups(false);

  onOpenProfile?.();
};

const openChats = () => {
  setShowProfile(false);
  setShowGroups(false);

  onSwitchToChats?.();
};

 const openGroups = () => {
  setShowGroups(true);
  setShowProfile(false);

  onSwitchToGroups?.();
};

  const switchToGroups = () => {
    setShowGroups(true);
    setShowProfile(false);
  };

  const switchToChats = () => {
    setShowGroups(false);
    setShowProfile(false);
  };

  useImperativeHandle(ref, () => ({
    switchToGroups,
    switchToChats,
  }));

  // =========================================
  // Logout
  // =========================================

  const handleLogout = async () => {
    try {
      const userId = currentUserId || auth.currentUser?.uid;
      if (userId) {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
          online: false,
          lastSeen: new Date(),
        });
      }

      await signOut(auth);
      showToast("👋 Logged out successfully", "info");
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // =========================================
  // Render
  // =========================================

  return (
    <div className="sidebar">
      <div className="sidebar-content">
        {showProfile ? (
          <Profile
            profileData={profileData}
            setProfileData={setProfileData}
            onClose={openChats}
            showToast={showToast}
          />
        ) : showGroups ? (
          <GroupsList
            currentUserId={currentUserId}
            showToast={showToast}
            onSelectGroup={onSelectGroup}
            onSwitchToChats={switchToChats}
          />
        ) : (
          <ChatsList
            chats={chats}
            onSelectUser={onSelectUser}
            onOpenUsersList={onOpenUsersList}
          />
        )}
      </div>

      {/* FOOTER */}
      <div className="sidebar-footer-container">
        <div className="sidebar-footer">
          {/* Profile */}
          <button
            className={`setting ${showProfile ? "active" : ""}`}
            onClick={openProfile}
          >
            {profileData.photoURL && profileData.photoURL.trim() !== "" ? (
              <img
                src={profileData.photoURL}
                alt="My Profile"
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  marginTop: "5px",
                }}
              />
            ) : (
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "#ccc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                {profileData.displayName?.[0]?.toUpperCase() || "👤"}
              </div>
            )}
          </button>

          {/* Chats */}
          <button
            className={`setting ${!showProfile && !showGroups ? "active" : ""}`}
            onClick={openChats}
          >
            <img
              src={chatIcon}
              alt="Chats"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                marginTop: "5px",
              }}
            />
          </button>

          {/* Groups */}
          <button
            className={`setting ${showGroups ? "active" : ""}`}
            onClick={openGroups}
          >
            <img
              src={groupIcon}
              alt="Groups"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                marginTop: "5px",
              }}
            />
          </button>

          {/* Logout */}
          <button className="setting" onClick={handleLogout}>
            <img
              src={logoutIcon}
              alt="Logout"
              style={{
                width: "30px",
                height: "26px",
                marginRight: "5px",
                marginTop: "5px",
              }}
            />
          </button>
        </div>
      </div>
    </div>
  );
});

export default Sidebar;