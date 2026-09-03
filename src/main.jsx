
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom"; // استيراد الموجه
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {/* ربط الـ Router مع المسار الفرعي للسيرفر */}
    <BrowserRouter basename="/whatsapp"> 
      <App />
    </BrowserRouter>
  </StrictMode>,
);
