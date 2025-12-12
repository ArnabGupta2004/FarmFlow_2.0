import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../style/Login.css";
import API from "../api.js";
import { useTranslation } from "react-i18next";

export default function Login() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    uniqueID: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const { uniqueID, password } = formData;

    if (!uniqueID || !password) {
      setError(t("login.fillAllFields"));
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniqueID, password }),
      });

      const result = await response.json();

      if (response.ok) {
        localStorage.setItem("uniqueID", uniqueID);
        localStorage.setItem("userRole", result.role || "");

        navigate("/home", { replace: true });
      } else {
        setError(result.error || t("login.invalidCredentials"));
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(t("login.serverError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="loginPage">
      <h1 className="login-title">{t("login.title")}</h1>

      <form className="login-form" onSubmit={handleSubmit}>
        <div>
          <input
            type="text"
            name="uniqueID"
            className="form-input"
            value={formData.uniqueID}
            onChange={handleChange}
            placeholder={t("login.uniqueID")}
            autoComplete="username"
          />
        </div>

        <div>
          <input
            type="password"
            name="password"
            className="form-input"
            value={formData.password}
            onChange={handleChange}
            placeholder={t("login.password")}
            autoComplete="current-password"
          />
        </div>

        {error && <p className="error-message">{error}</p>}

        <button type="submit" className="login-button" disabled={loading}>
          {loading ? t("login.loggingIn") : t("login.loginButton")}
        </button>
      </form>

      <p className="signup-text">
        {t("login.noAccount")}{" "}
        <Link to="/signUp" className="signup-link">
          {t("login.signUpLink")}
        </Link>
      </p>
    </div>
  );
}
