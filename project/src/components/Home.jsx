import React from "react";
import Dashboard from "./Dashboard";
import Chatbot from "./Chatbot";
import "../style/Home.css";

export default function Home() {
  return (
    <div className="home-layout">
      <div className="left-panel">
        <Dashboard />
      </div>

      <div className="right-panel">
        <Chatbot />
      </div>
    </div>
  );
}
