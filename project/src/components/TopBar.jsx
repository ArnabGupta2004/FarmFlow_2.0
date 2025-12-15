import "../style/TopBar.css";
import icon from "../icon/logo.png";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import {
  FaChevronDown,
  FaChevronUp,
  FaBars,
  FaTimes,
  FaSun,
  FaMoon,
  FaBell,
  FaGlobe,
  FaUser,
} from "react-icons/fa";
import { useTheme } from "../context/ThemeContext";
import API from "../api.js";
import { useTranslation } from "react-i18next";
import { languages, changeLanguage } from "../i18n";

function TopBar() {
  const navigate = useNavigate();
  const userID = localStorage.getItem("uniqueID");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Notification State
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [dismissedIds, setDismissedIds] = useState(() => {
    const saved = localStorage.getItem("dismissed_notifications");
    return saved ? JSON.parse(saved) : [];
  });
  const notifRef = useRef(null);

  const dropdownRef = useRef(null);
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const langRef = useRef(null);

  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const profileRef = useRef(null);

  // Fetch Crops for Notifications
  useEffect(() => {
    if (!userID) return;

    const fetchCrops = async () => {
      try {
        // 1. Trigger migration of expired crops by calling get
        await fetch(`${API}/api/crops/get?userID=${userID}`);

        // 2. Fetch history for notifications (completed crops)
        const resHistory = await fetch(`${API}/api/crops/history?userID=${userID}`);
        const historyData = await resHistory.json();

        if (resHistory.ok && Array.isArray(historyData)) {
          // Filter out dismissed notifications
          const alerts = historyData.filter((item) => {
            const uniqueId = `${item.text}_${item.date}`;
            return !dismissedIds.includes(uniqueId);
          });
          setNotifications(alerts);
        }
      } catch (err) {
        console.log("Notification fetch error:", err);
      }
    };

    fetchCrops();
    // Poll every minute to update status
    const interval = setInterval(fetchCrops, 60000);
    return () => clearInterval(interval);
  }, [userID, dismissedIds]);

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
    setMenuOpen(false); // Close other menus
  };

  const handleDismiss = (e, item) => {
    e.stopPropagation();
    const uniqueId = `${item.text}_${item.date}`;
    const newDismissed = [...dismissedIds, uniqueId];
    setDismissedIds(newDismissed);
    localStorage.setItem("dismissed_notifications", JSON.stringify(newDismissed));
  };

  const goToLogin = () => navigate("/login");
  const handleLogout = () => {
    localStorage.removeItem("uniqueID");
    localStorage.removeItem("userRole");
    goToHome();
    window.location.reload();
  };
  const goToHome = () => navigate("/home");
  const goToMarket = () => {
    const userID = localStorage.getItem("uniqueID");
    const role = (localStorage.getItem("userRole") || "").toLowerCase();

    if (!userID) {
      navigate("/login");
      return;
    }

    if (role === "farmer") {
      navigate("/farmer");
    } else if (role === "seller") {
      navigate("/seller");
    } else {
      navigate("/farmer");
    }
  };

  const handleNavigation = (path) => {
    navigate(`/${path}`);
    setMenuOpen(false);
    setMobileMenuOpen(false);
  };

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
    setShowNotifications(false);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMenuOpen(false);
        setMobileMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div className="topbar">
      {/* LEFT: Logo */}
      <div className="name" onClick={goToHome}>
        <img src={icon} alt="icon" />
      </div>

      {/* CENTER: Market + More Options (desktop only) */}
      <div className="center-section">
        <p className="marketLink" onClick={goToMarket}>
          {t("topbar.market")}
        </p>

        <div className="menu-container" ref={dropdownRef}>
          <button className="menu-button" onClick={toggleMenu}>
            <p>{t("topbar.moreOptions")} </p>
            <span className="menu-icon">
              {menuOpen ? (
                <FaChevronUp size={14} />
              ) : (
                <FaChevronDown size={14} />
              )}
            </span>
          </button>

          {menuOpen && (
            <div className="menu-dropdown">
              <p onClick={() => handleNavigation("crop_recommendation")}>
                {t("topbar.cropRecommendation")}
              </p>
              <p onClick={() => handleNavigation("disease_detection")}>
                {t("topbar.diseaseDetection")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Theme Toggle + Login + Mobile Hamburger */}
      <div className="right-section">
        {/* Notification Icon */}
        {userID && (
          <div className="notification-wrapper" ref={notifRef}>
            <button className="notification-icon" onClick={toggleNotifications}>
              <FaBell size={18} />
              {notifications.length > 0 && (
                <span className="notification-badge">{notifications.length}</span>
              )}
            </button>

            {showNotifications && (
              <div className="notification-dropdown">
                <div className="notification-header">{t("topbar.harvestAlerts")}</div>
                {notifications.length === 0 ? (
                  <div className="notification-empty">{t("topbar.noAlerts")}</div>
                ) : (
                  notifications.map((n, i) => (
                    <div key={i} className="notification-item">
                      <div style={{ flex: 1 }}>
                        {t("topbar.readyToHarvest", { crop: n.text })} <br />
                        <span style={{ fontSize: "0.75rem", color: "#666" }}>
                          [{n.date}]
                        </span>
                      </div>
                      <button
                        className="notif-close-btn"
                        onClick={(e) => handleDismiss(e, n)}
                        title="Dismiss"
                      >
                        <FaTimes size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Profile Dropdown or Login */}
        {userID ? (
          <div className="profile-wrapper" ref={profileRef}>
            <button
              className="profile-btn"
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            >
              <FaUser />
            </button>

            {/* Profile Dropdown */}
            <div className={`profile-dropdown ${showProfileDropdown ? 'show' : ''}`}>
              {/* Profile Link */}
              <div
                className="profile-dropdown-item"
                onClick={() => handleNavigation("profile")}
              >
                <FaUser size={14} />
                <span>{t("topbar.profile")}</span>
              </div>
              <div className="profile-dropdown-divider" />

              {/* Language Selector nested in Profile Dropdown */}
              <div
                className="profile-dropdown-item theme-row"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLangMenu(!showLangMenu);
                }}
                style={{ position: 'relative' }}
              >
                <span>{t("topbar.language")}</span>
                <div className="lang-mini-display">
                  <FaGlobe size={14} />
                  <span style={{ marginLeft: "6px", fontSize: "0.8rem", fontWeight: "600" }}>
                    {i18n.language?.toUpperCase() || 'EN'}
                  </span>
                </div>

                {/* Nested Language Menu - positioned absolutely relative to this item or the dropdown */}
                {showLangMenu && (
                  <div className="lang-dropdown-nested">
                    {Object.entries(languages).map(([code, { name, flag }]) => (
                      <div
                        key={code}
                        className={`lang-option ${i18n.language === code ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          changeLanguage(code);
                          setShowLangMenu(false);
                        }}
                      >
                        <span className="lang-flag">{flag}</span>
                        <span className="lang-name">{name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Theme Toggle in Dropdown */}
              <div
                className="profile-dropdown-item theme-row"
                onClick={(e) => e.stopPropagation()}
              >
                <span>{t("topbar.theme")}</span>

                {/* Sliding Toggle Switch */}
                <div
                  className={`theme-slider ${theme === 'dark' ? 'dark-mode' : ''}`}
                  onClick={toggleTheme}
                >
                  <div className="slider-thumb">
                    {theme === "dark" ? <FaMoon size={10} /> : <FaSun size={10} />}
                  </div>
                </div>
              </div>
              <div className="profile-dropdown-divider" />

              {/* Logout */}
              <div className="profile-dropdown-item logout-item" onClick={handleLogout}>
                <span>{t("topbar.logout")}</span>
              </div>
            </div>
          </div>

        ) : (
          <button className="loginBtn" onClick={goToLogin}>
            {t("topbar.login")}
          </button>
        )}

        {/* Mobile Hamburger */}
        <div className="hamburger" onClick={toggleMobileMenu}>
          {mobileMenuOpen ? <FaTimes size={22} /> : <FaBars size={22} />}
        </div>

        {mobileMenuOpen && (
          <div className="mobile-menu">
            <p onClick={goToMarket}>{t("topbar.market")}</p>
            <p onClick={() => handleNavigation("crop_recommendation")}>
              {t("topbar.cropRecommendation")}
            </p>
            <p onClick={() => handleNavigation("disease_detection")}>
              {t("topbar.diseaseDetection")}
            </p>
            <p onClick={() => handleNavigation("fertilizer_pesticide_advice")}>
              {t("topbar.fertilizerAdvice")}
            </p>
            <p onClick={() => handleNavigation("soil_health")}>{t("topbar.soilHealth")}</p>
            <p onClick={() => handleNavigation("weather_query")}>
              {t("topbar.weatherQuery")}
            </p>
            <p onClick={() => handleNavigation("market_price_info")}>
              {t("topbar.marketPriceInfo")}
            </p>
          </div>
        )}
      </div>
    </div >
  );
}

export default TopBar;