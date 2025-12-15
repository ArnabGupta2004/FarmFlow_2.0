// project/src/App.jsx
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import React from "react";

import Home from "./components/Home";
import TopBar from "./components/TopBar";
import Login from "./components/Login";
import SignUp from "./components/SignUp";
import Seller from "./components/Seller";
import Farmers from "./components/Farmers";
import ChatBox from "./components/Chatbot";
import Profile from "./components/Profile";
import DiseaseDetection from "./components/DiseaseDetection";
import CropRecommendation from "./components/CropRecommendation";
import { ThemeProvider } from "./context/ThemeContext";

function AppRoutes() {
  const location = useLocation();
  const showChat = location.pathname === "/" || location.pathname === "/home";

  return (
    <>
      <TopBar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Home />} />

        <Route path="/login" element={<Login />} />
        <Route path="/signUp" element={<SignUp />} />

        {/* ✅ FIXED — Correctly assign panels */}
        <Route path="/seller" element={<Seller />} />
        <Route path="/farmer" element={<Farmers />} />
        <Route path="/disease_detection" element={<DiseaseDetection />} />
        <Route path="/crop_recommendation" element={<CropRecommendation />} />

        <Route path="/profile" element={<Profile />} />
      </Routes>

      {showChat && <ChatBox />}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppRoutes />
      </Router>
    </ThemeProvider>
  );
}
