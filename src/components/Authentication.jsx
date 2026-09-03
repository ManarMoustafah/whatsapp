import { useState } from "react";

import { auth, googleProvider, db } from "../config/firebase";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";

import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

import img from "../assets/icon.png";
import pin from "../assets/add.png";
import passwordicon from "../assets/password.png";
import gmailicon from "../assets/gmail.png";

const DEFAULT_BIO = "Hey there! I am using WhatsApp";

const Authentication = ({ showToast }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [photoFile, setPhotoFile] = useState(null);
  const [photoURL, setPhotoURL] = useState("");

  const [isRegister, setIsRegister] = useState(false);

  // =========================================
  // Save / create user in Firestore
  // =========================================

 const saveUserToFirestore = async (firebaseUser, uploadedPhotoURL = "") => {
  if (!firebaseUser?.uid) return;

  try {
    const userRef = doc(db, "users", firebaseUser.uid);

    const userSnapshot = await getDoc(userRef);

    // =========================================
    // Existing user
    // =========================================

    if (userSnapshot.exists()) {
      const oldData = userSnapshot.data();

      await updateDoc(userRef, {
        uid: firebaseUser.uid,

        displayName:
          oldData.displayName ||
          firebaseUser.displayName ||
          firebaseUser.email?.split("@")[0] ||
          "User",

        email:
          oldData.email ||
          firebaseUser.email ||
          "",

        photoURL:
          oldData.photoURL ||
          uploadedPhotoURL ||
          firebaseUser.photoURL ||
          "",

        // مهم جدًا
        // إذا كان عنده Bio محفوظة نحافظ عليها
        // وإذا لم تكن موجودة نضيف القيمة الافتراضية
        bio:
          oldData.bio !== undefined
            ? oldData.bio
            : DEFAULT_BIO,

        online: true,

        showOnlineStatus:
          oldData.showOnlineStatus !== undefined
            ? oldData.showOnlineStatus
            : true,

        lastSeen: new Date(),
      });

      return;
    }

    // =========================================
    // New user
    // =========================================

    await setDoc(userRef, {
      uid: firebaseUser.uid,

      displayName:
        firebaseUser.displayName ||
        firebaseUser.email?.split("@")[0] ||
        "User",

      email: firebaseUser.email || "",

      photoURL:
        uploadedPhotoURL ||
        firebaseUser.photoURL ||
        "",

      bio: DEFAULT_BIO,

      online: true,

      showOnlineStatus: true,

      lastSeen: new Date(),
    });
  } catch (error) {
    console.error("Error saving user to Firestore:", error);
  }
};

  // =========================================
  // Upload profile image
  // =========================================

  const uploadImageToCloudinary = async () => {
    if (!photoFile) return "";

    const formData = new FormData();

    formData.append("file", photoFile);
    formData.append("upload_preset", "profile_images");

    const response = await fetch(
      "https://api.cloudinary.com/v1_1/dcmadldlg/image/upload",
      {
        method: "POST",
        body: formData,
      },
    );

    if (!response.ok) {
      throw new Error("Failed to upload image");
    }

    const data = await response.json();

    return data.secure_url;
  };

  // =========================================
  // Email authentication
  // =========================================

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      showToast("Please enter your email and password", "error");

      return;
    }

    try {
      // =========================================
      // Register
      // =========================================

      if (isRegister) {
        const imageURL = await uploadImageToCloudinary();

        const result = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );

        const displayName = email.trim().split("@")[0];

        await updateProfile(result.user, {
          displayName,
          photoURL: imageURL,
        });

        await saveUserToFirestore(result.user, imageURL);

        showToast("🎉 Account created successfully!", "success");

        return;
      }

      // =========================================
      // Login
      // =========================================

      const result = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );

      await saveUserToFirestore(result.user);

      showToast("✅ Logged in successfully!", "success");
    } catch (error) {
      console.error("Authentication error:", error);

      let errorMessage = "An error occurred, please try again";

      if (
        error.code === "auth/user-not-found" ||
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password"
      ) {
        errorMessage = "❌ Invalid email or password";
      }

      if (error.code === "auth/email-already-in-use") {
        errorMessage = "❌ This email is already in use";
      }

      showToast(errorMessage, "error");
    }
  };

  // =========================================
  // Google authentication
  // =========================================

  const handleGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);

      await saveUserToFirestore(result.user);

      showToast("✅ Signed in with Google successfully!", "success");
    } catch (error) {
      console.error("Google sign-in error:", error);

      showToast("❌ Google sign-in failed", "error");
    }
  };

  // =========================================
  // Profile image selection
  // =========================================

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];

    if (!file) return;

    setPhotoFile(file);
    setPhotoURL(URL.createObjectURL(file));
  };

  // =========================================
  // Render
  // =========================================

  return (
    <div className="auth-container">
      {/* Profile Image */}

      <div className="profile-container">
        <img className="prfilePic" src={photoURL || img} alt="profile" />

        {isRegister && (
          <label htmlFor="file-upload" className="edit-badge">
            <img src={pin} alt="edit" />
          </label>
        )}

        <input
          id="file-upload"
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handlePhotoChange}
        />
      </div>

      <h2>{isRegister ? "Create New Account" : "Sign In"}</h2>

      {/* Email */}

      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
        }}
      >
        <img className="icon" src={gmailicon} alt="email" />

        <input
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </span>

      {/* Password */}

      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
        }}
      >
        <img className="icon" src={passwordicon} alt="password" />

        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </span>

      {/* Sign In / Sign Up */}

      <button
        style={{ marginTop: "30px" }}
        className="SignIn"
        onClick={handleEmailAuth}
      >
        {isRegister ? "Sign Up" : "Sign In"}
      </button>

      {/* Google */}

      <button className="google-btn" onClick={handleGoogle}>
        Sign in with Google
      </button>

      {/* Switch */}

      <button className="switch-btn" onClick={() => setIsRegister(!isRegister)}>
        {isRegister ? "Already have an account?" : "Create an account"}
      </button>
    </div>
  );
};

export default Authentication;











// import { useState } from "react";
// import { useNavigate } from "react-router-dom"; // استيراد التوجيه

// import { auth, googleProvider, db } from "../config/firebase";

// import {
//   createUserWithEmailAndPassword,
//   signInWithEmailAndPassword,
//   signInWithPopup,
//   updateProfile,
// } from "firebase/auth";

// import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

// import img from "../assets/icon.png";
// import pin from "../assets/add.png";
// import passwordicon from "../assets/password.png";
// import gmailicon from "../assets/gmail.png";

// const DEFAULT_BIO = "Hey there! I am using WhatsApp";

// const Authentication = ({ showToast }) => {
//   const navigate = useNavigate(); // تهيئة الـ Navigate للانتقال بعد تسجيل الدخول
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");

//   const [photoFile, setPhotoFile] = useState(null);
//   const [photoURL, setPhotoURL] = useState("");

//   const [isRegister, setIsRegister] = useState(false);

//   // =========================================
//   // Save / create user in Firestore
//   // =========================================

//   const saveUserToFirestore = async (firebaseUser, uploadedPhotoURL = "") => {
//     if (!firebaseUser?.uid) return;

//     try {
//       const userRef = doc(db, "users", firebaseUser.uid);
//       const userSnapshot = await getDoc(userRef);

//       // Existing user
//       if (userSnapshot.exists()) {
//         const oldData = userSnapshot.data();

//         await updateDoc(userRef, {
//           uid: firebaseUser.uid,
//           displayName:
//             oldData.displayName ||
//             firebaseUser.displayName ||
//             firebaseUser.email?.split("@")[0] ||
//             "User",
//           email: oldData.email || firebaseUser.email || "",
//           photoURL:
//             oldData.photoURL ||
//             uploadedPhotoURL ||
//             firebaseUser.photoURL ||
//             "",
//           bio: oldData.bio !== undefined ? oldData.bio : DEFAULT_BIO,
//           online: true,
//           showOnlineStatus:
//             oldData.showOnlineStatus !== undefined
//               ? oldData.showOnlineStatus
//               : true,
//           lastSeen: new Date(),
//         });

//         return;
//       }

//       // New user
//       await setDoc(userRef, {
//         uid: firebaseUser.uid,
//         displayName:
//           firebaseUser.displayName ||
//           firebaseUser.email?.split("@")[0] ||
//           "User",
//         email: firebaseUser.email || "",
//         photoURL: uploadedPhotoURL || firebaseUser.photoURL || "",
//         bio: DEFAULT_BIO,
//         online: true,
//         showOnlineStatus: true,
//         lastSeen: new Date(),
//       });
//     } catch (error) {
//       console.error("Error saving user to Firestore:", error);
//     }
//   };

//   // =========================================
//   // Upload profile image
//   // =========================================

//   const uploadImageToCloudinary = async () => {
//     if (!photoFile) return "";

//     const formData = new FormData();
//     formData.append("file", photoFile);
//     formData.append("upload_preset", "profile_images");

//     const response = await fetch(
//       "https://cloudinary.com",
//       {
//         method: "POST",
//         body: formData,
//       },
//     );

//     if (!response.ok) {
//       throw new Error("Failed to upload image");
//     }

//     const data = await response.json();
//     return data.secure_url;
//   };

//   // =========================================
//   // Email authentication
//   // =========================================

//   const handleEmailAuth = async () => {
//     if (!email.trim() || !password.trim()) {
//       showToast("Please enter your email and password", "error");
//       return;
//     }

//     try {
//       // Register
//       if (isRegister) {
//         const imageURL = await uploadImageToCloudinary();
//         const result = await createUserWithEmailAndPassword(
//           auth,
//           email.trim(),
//           password,
//         );

//         const displayName = email.trim().split("@")[0];

//         await updateProfile(result.user, {
//           displayName,
//           photoURL: imageURL,
//         });

//         await saveUserToFirestore(result.user, imageURL);
//         showToast("🎉 Account created successfully!", "success");
//         navigate("/chat"); // التوجيه برمجياً إلى الشات بعد التسجيل
//         return;
//       }

//       // Login
//       const result = await signInWithEmailAndPassword(
//         auth,
//         email.trim(),
//         password,
//       );

//       await saveUserToFirestore(result.user);
//       showToast("✅ Logged in successfully!", "success");
//       navigate("/chat"); // التوجيه برمجياً إلى الشات بعد الدخول
//     } catch (error) {
//       console.error("Authentication error:", error);

//       let errorMessage = "An error occurred, please try again";

//       if (
//         error.code === "auth/user-not-found" ||
//         error.code === "auth/invalid-credential" ||
//         error.code === "auth/wrong-password"
//       ) {
//         errorMessage = "❌ Invalid email or password";
//       }

//       if (error.code === "auth/email-already-in-use") {
//         errorMessage = "❌ This email is already in use";
//       }

//       showToast(errorMessage, "error");
//     }
//   };

//   // =========================================
//   // Google authentication
//   // =========================================

//   const handleGoogle = async () => {
//     try {
//       const result = await signInWithPopup(auth, googleProvider);
//       await saveUserToFirestore(result.user);
//       showToast("✅ Signed in with Google successfully!", "success");
//       navigate("/chat"); // التوجيه برمجياً إلى الشات بعد دخول جوجل
//     } catch (error) {
//       console.error("Google sign-in error:", error);
//       showToast("❌ Google sign-in failed", "error");
//     }
//   };

//   // =========================================
//   // Profile image selection
//   // =========================================

//   const handlePhotoChange = (e) => {
//     const file = e.target.files[0];
//     if (!file) return;

//     setPhotoFile(file);
//     setPhotoURL(URL.createObjectURL(file));
//   };

//   // =========================================
//   // Render
//   // =========================================

//   return (
//     <div className="auth-container">
//       {/* Profile Image */}
//       <div className="profile-container">
//         <img className="prfilePic" src={photoURL || img} alt="profile" />

//         {isRegister && (
//           <label htmlFor="file-upload" className="edit-badge">
//             <img src={pin} alt="edit" />
//           </label>
//         )}

//         <input
//           id="file-upload"
//           type="file"
//           accept="image/*"
//           style={{ display: "none" }}
//           onChange={handlePhotoChange}
//         />
//       </div>

//       <h2>{isRegister ? "Create New Account" : "Sign In"}</h2>

//       {/* Email */}
//       <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
//         <img className="icon" src={gmailicon} alt="email" />
//         <input
//           placeholder="Email Address"
//           value={email}
//           onChange={(e) => setEmail(e.target.value)}
//         />
//       </span>

//       {/* Password */}
//       <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
//         <img className="icon" src={passwordicon} alt="password" />
//         <input
//           placeholder="Password"
//           type="password"
//           value={password}
//           onChange={(e) => setPassword(e.target.value)}
//         />
//       </span>

//       {/* Sign In / Sign Up */}
//       <button
//         style={{ marginTop: "30px" }}
//         className="SignIn"
//         onClick={handleEmailAuth}
//       >
//         {isRegister ? "Sign Up" : "Sign In"}
//       </button>

//       {/* Google */}
//       <button className="google-btn" onClick={handleGoogle}>
//         Sign in with Google
//       </button>

//       {/* Switch */}
//       <button className="switch-btn" onClick={() => setIsRegister(!isRegister)}>
//         {isRegister ? "Already have an account?" : "Create an account"}
//       </button>
//     </div>
//   );
// };

// export default Authentication;
