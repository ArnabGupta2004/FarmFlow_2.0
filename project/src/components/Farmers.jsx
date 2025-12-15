import React, { useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { recommend, createRequest, listRequests, translateText } from "../api";
import API from "../api";
import BuyerSellerChat from "./BuyerSellerChat";
import { FaStar, FaCalendarAlt, FaBullseye, FaPhone, FaMapMarkerAlt, FaHandshake, FaCommentDots, FaTimes } from "react-icons/fa";
import "../style/Farmers.css";
import { useTranslation } from "react-i18next";

export default function Farmer() {
  const { t, i18n } = useTranslation();
  const [crop, setCrop] = useState("");
  const [region, setRegion] = useState("");
  const [sellers, setSellers] = useState([]);
  const [translatedSellers, setTranslatedSellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [acceptedDeals, setAcceptedDeals] = useState([]);
  const [currentChatDeal, setCurrentChatDeal] = useState(null);
  const [showChatList, setShowChatList] = useState(false); // Toggle for chat list

  const farmer_id = localStorage.getItem("uniqueID");
  const farmer_name = localStorage.getItem("username");

  const handleSearch = async () => {
    if (!crop || !region) return toast.error(t("farmers.enterCropRegion"));

    setLoading(true);
    setSellers([]); // Clear previous results immediately

    try {
      const data = await recommend({ crop, region });

      // Simulate network delay for effect
      setTimeout(() => {
        setSellers(Array.isArray(data) ? data : []);
        setLoading(false);
      }, 1500);

    } catch (e) {
      setSellers([]);
      setLoading(false);
    }
  };

  const sendReq = async (s) => {
    const price = prompt(t("farmers.enterPrice"));
    if (!price || isNaN(price)) return toast.error(t("farmers.invalidPrice"));
    try {
      const payload = {
        farmer_id,
        farmer_name,
        crop: crop, // Use the crop from search input
        region: region, // Use the region from search input
        price,
        fpc_name: (s.fpc_name || s.FPC_Name || "").toString().toLowerCase(),
        fpc_id: s.fpc_id || ""
      };
      const j = await createRequest(payload);
      if (j && j.ok) toast.success(t("farmers.requestSent"));
      else toast.error(t("farmers.requestFailed"));
    } catch (e) {
      toast.error(t("farmers.requestFailed"));
    }
  };

  const loadAccepted = async () => {
    try {
      const data = await listRequests({ farmer_id });
      setAcceptedDeals(Array.isArray(data) ? data.filter((r) => r.status === "accepted") : []);
    } catch {
      setAcceptedDeals([]);
    }
  };

  // Translate seller data when sellers or language changes
  useEffect(() => {
    const translateSellers = async () => {
      if (sellers.length === 0) {
        setTranslatedSellers([]);
        return;
      }

      const translated = await Promise.all(
        sellers.map(async (seller) => {
          const [translatedName, translatedDistrict, translatedCommodities] = await Promise.all([
            translateText(seller.FPC_Name || seller.fpc_name || ""),
            translateText(seller.District || ""),
            translateText(seller.Commodities || "")
          ]);

          return {
            ...seller,
            translatedName,
            translatedDistrict,
            translatedCommodities
          };
        })
      );

      setTranslatedSellers(translated);
    };

    translateSellers();
  }, [sellers, i18n.language]);

  useEffect(() => {
    loadAccepted();
    const iv = setInterval(loadAccepted, 3000);
    return () => clearInterval(iv);
  }, []);

  const deleteReq = async (rid) => {
    if (!window.confirm(t("farmers.deleteConfirm"))) return;
    try {
      await fetch(`${API}/api/request/delete/${rid}`, { method: "POST" });
      await loadAccepted();
    } catch { }
  };

  const handleOpenChat = (deal) => {
    const fpc_id = String(deal.fpc_id || "").trim();

    if (!fpc_id || !farmer_id) {
      toast.error(t("farmers.missingIds"));
      return;
    }

    setCurrentChatDeal(deal);
  };

  const handleCloseChat = () => {
    setCurrentChatDeal(null);
  }

  // FIX: UseEffect to toggle the global body class for scrolling
  useEffect(() => {
    if (currentChatDeal) {
      document.body.classList.add('chat-mode-active');
    } else {
      document.body.classList.remove('chat-mode-active');
    }
    return () => {
      document.body.classList.remove('chat-mode-active');
    };
  }, [currentChatDeal]);

  // Toggle background blur for marketplace
  useEffect(() => {
    document.body.classList.add('marketplace-active');
    return () => {
      document.body.classList.remove('marketplace-active');
    };
  }, []);

  // Conditional Rendering: If a chat deal is active, show the chat window
  if (currentChatDeal) {
    const deal = currentChatDeal;
    const partnerId = String(deal.fpc_id).trim();
    const partnerName = deal.fpc_name;

    const farmerIdStr = String(farmer_id).toLowerCase();
    const fpcIdStr = String(partnerId).toLowerCase();

    const room = farmerIdStr < fpcIdStr
      ? `${farmerIdStr}_${fpcIdStr}`
      : `${fpcIdStr}_${farmerIdStr}`;

    return (
      <div className="farmer-panel">
        <Toaster />
        <BuyerSellerChat
          user={farmer_id}
          partnerId={partnerId}
          partnerName={partnerName}
          room={room}
          onCloseChat={handleCloseChat}
        />
      </div>
    );
  }

  // Default rendering (Marketplace)
  return (
    <div className="farmer-panel">
      <Toaster />
      {/* Hero Section */}
      <div className="hero-section">
        <div className="hero-content">

          <h2 className="hero-headline">
            Find the perfect dealer <br /> for your crops
          </h2>

          <div className="hero-search-bar">
            <div className="search-field">
              {/* <i className="fa-search-icon">🔍</i> */}
              <input
                value={crop}
                onChange={(e) => setCrop(e.target.value)}
                placeholder={t("farmers.cropPlaceholder") || "Crop"}
              />
            </div>
            <div className="search-divider"></div>
            <div className="search-field">
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder={t("farmers.regionPlaceholder") || "Region"}
              />
            </div>
            <button className="hero-search-btn" onClick={handleSearch}>
              {t("farmers.search") || "Search"}
            </button>
          </div>
        </div>
      </div>

      {loading && <p style={{ textAlign: 'center', marginTop: '20px' }}>{t("farmers.loading") || "Loading results..."}</p>}

      <div className="seller-list">
        {translatedSellers.map((s, i) => (
          <div
            key={i}
            className="seller-card"
            style={{ animationDelay: `${i * 0.15}s` }}
          >
            <div className="card-header">
              <div className="card-logo">{(s.translatedName || s.FPC_Name || s.fpc_name || "F").charAt(0)}</div>
              <div className="card-header-text">
                <h3>{s.translatedName || s.FPC_Name || s.fpc_name}</h3>
                <div className="card-location">
                  <FaMapMarkerAlt className="location-icon" />
                  <span>{s.translatedDistrict || s.District}</span>
                </div>
              </div>
            </div>
            <p className="commodities">{t("farmers.dealsIn")}: {s.translatedCommodities || s.Commodities}</p>

            <div className="card-stats">
              <div className="stat-item">
                <FaStar className="stat-icon star-icon" />
                <span className="stat-value">{s.Rating || 5}/10</span>
              </div>
              <div className="stat-item">
                <FaCalendarAlt className="stat-icon calendar-icon" />
                <span className="stat-value">{s.Years_of_Experience || 0} {t("farmers.years")}</span>
              </div>
              <div className="stat-item">
                <FaBullseye className="stat-icon match-icon" />
                <span className="stat-value">
                  {s.match_percentage ? Number(s.match_percentage).toFixed(1) : "0.0"}%
                </span>
              </div>
            </div>

            {s.Contact_Phone && (
              <div className="card-phone">
                <FaPhone className="phone-icon" />
                <span>{s.Contact_Phone}</span>
              </div>
            )}

            <button className="send-request-btn" onClick={() => sendReq(s)}>
              {/* <FaHandshake className="btn-icon" /> */}
              {t("farmers.sendRequest")}
            </button>
          </div>
        ))}
      </div>

      {/* FLOATING CHAT BUBBLE */}
      <div className="floating-chat-container">

        {/* Popup List */}
        {/* Popup List */}
        <div className={`chat-popup ${showChatList ? 'show' : ''}`}>
          <div className="chat-popup-header">
            <h3>Messages ({acceptedDeals.length})</h3>
            <button onClick={() => setShowChatList(false)}><FaTimes /></button>
          </div>

          <div className="chat-popup-body">
            {acceptedDeals.length === 0 ? (
              <p className="no-chats">No Active Chats</p>
            ) : (
              acceptedDeals.map((d) => (
                <div key={d.id} className="chat-item">
                  <div className="chat-item-info">
                    <strong>{d.fpc_name}</strong>
                    <span>{d.crop} • {d.region}</span>
                  </div>
                  <div className="chat-item-actions">
                    <button className="icon-btn chat-btn" onClick={() => handleOpenChat(d)} title={t("farmers.openChat")}>
                      <FaCommentDots />
                    </button>
                    <button className="icon-btn delete-btn-sm" onClick={() => deleteReq(d.id)} title={t("farmers.delete")}>
                      <FaTimes />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* FAB Button */}
      <button className="chat-fab" onClick={() => setShowChatList(!showChatList)}>
        <FaCommentDots size={30} />
        <span className="chat-badge">{acceptedDeals.length}</span>
      </button>
    </div>

  );
}