import { useState, useEffect, lazy, Suspense } from "react"; // 1. استيراد lazy و Suspense
import { Routes, Route, Navigate } from "react-router-dom";
import { auth } from "./config/firebase";
import Toast from "./components/Toast";
import Spinner from "./components/whatsapp/looding"; // أو المسار الصحيح للملف لديك

import "./App.css";

// 2. تحميل المكونات بشكل كسول (Lazy Loading)
const Authentication = lazy(() => import("./components/Authentication"));
const ChatApp = lazy(() => import("./components/ChatApp"));

function App() {
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ message: "", type: "" });

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  const hideToast = () => {
    setToast({ message: "", type: "" });
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUser(user);
        setIsLoggedIn(true);
      } else {
        setUser(null);
        setIsLoggedIn(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <Spinner text=" جاري التحقق من الهوية..." />;
  }

  return (
    <div className="App">
      <div className="toast-container">
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      </div>

      {/* 3. تغليف المسارات بـ Suspense لعرض شاشة انتظار مؤقتة أثناء تحميل المكونات خلف الكواليس */}
      <Suspense
        fallback={
          <Spinner
            text="جاري فتح الصفحة... ⏳"/>
        }
      >
        <Routes>
          {/* صفحة تسجيل الدخول */}
          <Route
            path="/login"
            element={
              !isLoggedIn ? (
                <Authentication showToast={showToast} />
              ) : (
                <Navigate to="/chat" />
              )
            }
          />

          {/* الصفحة الرئيسية للتطبيق (بدون محادثة مفتوحة) */}
          <Route
            path="/chat"
            element={
              isLoggedIn ? (
                <ChatApp user={user} showToast={showToast} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />

          {/* فتح محادثة فردية معينة عبر الرابط: /chat/USER_ID */}
          <Route
            path="/chat/:userId"
            element={
              isLoggedIn ? (
                <ChatApp user={user} showToast={showToast} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />

          {/* قائمة الجروبات (بدون جروب مفتوح) */}
          <Route
            path="/groups"
            element={
              isLoggedIn ? (
                <ChatApp user={user} showToast={showToast} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />

          {/* فتح جروب معين عبر الرابط: /group/GROUP_ID */}
          <Route
            path="/group/:groupId"
            element={
              isLoggedIn ? (
                <ChatApp user={user} showToast={showToast} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />

          {/* إعادة توجيه ذكية */}
          <Route
            path="*"
            element={<Navigate to={isLoggedIn ? "/chat" : "/login"} />}
          />
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;