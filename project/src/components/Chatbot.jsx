import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import "../style/Chatbot.css";
import API from "../api.js";
import { useTranslation } from "react-i18next";

export default function ChatBox() {
  const { t } = useTranslation();
  const detectMobile = () => {
    return (
      window.innerWidth <= 768 ||
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    );
  };

  // Initialize based on device type (Open on Desktop, Closed on Mobile)
  // const [isOpen, setIsOpen] = useState(!detectMobile()); // REMOVED for embedded

  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const msgsRef = useRef(null);
  const location = useLocation();

  // Scroll to bottom
  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [chatHistory, error]); // Removed isOpen dependency

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    const text = message;

    setChatHistory((prev) => [...prev, { sender: "user", text }]);
    setMessage("");
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API}/chatbot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = await res.json();

      if (res.ok) {
        setChatHistory((prev) => [...prev, { sender: "bot", text: data.reply }]);
      } else {
        setError(data.error || t("chatbot.serverError"));
      }
    } catch {
      setError(t("chatbot.serverUnreachable"));
    }

    setLoading(false);
  };

  return (
    <div className="chatbot">
      <div className="chat-header">
        <div className="chat-title">{t("chatbot.title")}</div>
        {/* Close button removed for embedded widget */}
      </div>

      <div className="msgs" ref={msgsRef}>
        {chatHistory.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.sender}-bubble`}>
            {m.text}
          </div>
        ))}

        {error && <p className="error-msg">{error}</p>}
      </div>

      {/* Restore your FULL styled send button */}
      <div className="msg-box">
        <form onSubmit={handleSend}>
          <input
            type="text"
            className="chat-input"
            placeholder={t("chatbot.placeholder")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          <button type="submit" disabled={loading}>
            {loading ? "..." : t("chatbot.send")}
          </button>
        </form>
      </div>
    </div>
  );
}
