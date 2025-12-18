import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import "../style/Chatbot.css";
import API from "../api.js";
import { useTranslation } from "react-i18next";
import { FaMicrophone, FaStop } from "react-icons/fa";

export default function ChatBox() {
  const { t, i18n } = useTranslation();
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

  // Voice Input Logic
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const location = useLocation();

  // Track language in ref to access inside closures (like onstop)
  const langRef = useRef(i18n.language);
  useEffect(() => {
    langRef.current = i18n.language;
  }, [i18n.language]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    const text = message;

    setChatHistory((prev) => [...prev, { sender: "user", text }]);
    setMessage("");
    setLoading(true);
    setError("");

    try {
      const langCode = (langRef.current || "en").split("-")[0];
      const res = await fetch(`${API}/chatbot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, lang: langCode }),
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

  // Scroll to bottom
  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [chatHistory, error]);

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", blob, "voice.webm");

        // Use ref to get latest language state
        const langCode = (langRef.current || "en").split("-")[0];
        formData.append("lang", langCode);

        setLoading(true);
        try {
          // Pass lang in query param as robust fallback
          const res = await fetch(`${API}/transcribe?lang=${langCode}`, {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.text) {
            setMessage((prev) => (prev ? prev + " " + data.text : data.text));
          } else {
            setError(data.error || "Transcription failed");
          }
        } catch (err) {
          setError("Server unreachable for transcription");
        } finally {
          setLoading(false);
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic Error:", err);
      // Nice to have: a toast or error message in UI
      setError("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
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
            placeholder={isRecording ? "Listening..." : t("chatbot.placeholder")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          <button
            type="button"
            onClick={toggleRecording}
            className={`mic-btn ${isRecording ? "recording" : ""}`}
            title="Voice Input"
            disabled={loading && !isRecording}
            style={{
              minWidth: "50px",
              padding: "10px",
              background: isRecording ? "#ff4d4d" : "var(--color-surface-muted)",
              color: isRecording ? "white" : "var(--color-text)",
              border: "1px solid var(--color-border)"
            }}
          >
            {isRecording ? <FaStop /> : <FaMicrophone />}
          </button>

          <button type="submit" disabled={loading || isRecording}>
            {loading ? "..." : t("chatbot.send")}
          </button>
        </form>
      </div>
    </div>
  );
}
