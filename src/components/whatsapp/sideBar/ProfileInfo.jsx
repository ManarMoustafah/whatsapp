import { useState } from "react";
import { auth, db } from "../../../config/firebase";
import { doc, updateDoc } from "firebase/firestore";

import pin from "../../../assets/pen.png";
import icon from "../../../assets/icon.png";

const Profile = ({ profileData, setProfileData, onClose, showToast }) => {
  const [displayName, setDisplayName] = useState(profileData.displayName);
  const [photoURL, setPhotoURL] = useState(profileData.photoURL);
  const [photoFile, setPhotoFile] = useState(null);
  const [bio, setBio] = useState(profileData.bio);
  const [showOnlineStatus, setShowOnlineStatus] = useState(
    profileData.showOnlineStatus ?? true,
  );
  const [isSaving, setIsSaving] = useState(false);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setPhotoFile(file);
    setPhotoURL(URL.createObjectURL(file)); // معاينة مؤقتة محلية
  };

  const saveProfile = async () => {
    const user = auth.currentUser;

    if (!user?.uid) {
      showToast("❌ User is not logged in", "error");
      return;
    }

    setIsSaving(true);

    try {
      let finalPhotoURL = profileData.photoURL; // القيمة القديمة افتراضياً

      if (photoFile) {
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

        const data = await response.json();

        if (data.secure_url) {
          finalPhotoURL = data.secure_url; // الرابط الدائم القادم من Cloudinary
        } else {
          throw new Error("Failed to upload image to Cloudinary");
        }
      }

      const userRef = doc(db, "users", user.uid);

      const updatedData = {
        displayName: displayName.trim(),
        photoURL: finalPhotoURL,
        bio: bio.trim(),
        showOnlineStatus: showOnlineStatus,
      };

      await updateDoc(userRef, updatedData);

      setProfileData((prev) => ({
        ...prev,
        ...updatedData,
      }));

      showToast("✅ Profile updated successfully", "success");
      onClose();
    } catch (error) {
      console.error("❌ Error updating profile:", error);
      showToast("❌ Failed to update profile", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="profile-section">
      <div className="profile-header">
        <h3>👤 My Profile</h3>
        <button className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Profile Photo */}
      <div className="profile-photo-section">
        <div className="profile-container">
          <label htmlFor="file-upload" className="edit-badge">
            <img src={pin} alt="edit" />
          </label>

          <img
            className="prfilePic"
            src={photoURL ? photoURL : icon}
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

      {/* Display Name */}
      <div className="profile-field">
        <label>Display Name</label>
        <input
          type="text"
          className="profile-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      {/* Bio */}
      <div className="profile-field">
        <label>Bio</label>
        <input
          type="text"
          className="profile-input"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>

      {/* Email */}
      <div className="profile-field">
        <label>Email</label>
        <input
          type="email"
          className="profile-input"
          value={profileData.email}
          disabled
        />
      </div>

      {/* Online Status */}
      <div className="profile-status">
        <div>
          <strong>Activity Status</strong>
          <p>
            {showOnlineStatus
              ? "Others can see when you are online"
              : "Others cannot see your online status"}
          </p>
        </div>

        <label className="switch">
          <input
            type="checkbox"
            checked={showOnlineStatus}
            onChange={(e) => setShowOnlineStatus(e.target.checked)}
          />
          <span className="slider"></span>
        </label>
      </div>

      {/* Save */}
      <button
        className="save-profile-btn"
        onClick={saveProfile}
        disabled={isSaving}
      >
        {isSaving ? "⏳ Saving..." : "💾 Save Changes"}
      </button>
    </div>
  );
};

export default Profile;
