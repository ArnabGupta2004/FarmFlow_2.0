import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getUser } from "../api";
import API from "../api";
import "../style/Profile.css";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";

const Profile = () => {
    const { t } = useTranslation();
    const userID = localStorage.getItem("uniqueID");
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // History State
    const [history, setHistory] = useState([]);
    const [historyOpen, setHistoryOpen] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            if (!userID) {
                setError(t("profile.notLoggedIn"));
                setLoading(false);
                return;
            }
            try {
                // Fetch User Details
                const userData = await getUser(userID);
                setUser(userData);

                // Fetch Crop History
                const historyRes = await fetch(`${API}/api/crops/history?userID=${userID}`);
                const historyData = await historyRes.json();
                if (historyRes.ok && Array.isArray(historyData)) {
                    setHistory(historyData);
                }

            } catch (err) {
                console.error("Error fetching profile data:", err);
                setError("Failed to load profile data.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [userID, t]);

    const toggleHistory = () => setHistoryOpen(!historyOpen);

    if (loading) return <div className="profile-loading">{t("dashboard.fetching")}...</div>;
    if (error) return <div className="profile-container"><div className="profile-error">{error}</div></div>;
    if (!user) return <div className="profile-container"><div className="profile-error">User not found</div></div>;

    // Use Username (userID) for initial
    const username = user.name || userID || "User";
    const initial = username.charAt(0).toUpperCase();

    return (
        <div className="profile-container">
            <div className="profile-card">
                <div className="profile-avatar">
                    {initial}
                </div>

                <h2 className="profile-name">{username}</h2>
                <span className="profile-role">{user.role || "User"}</span>

                <div className="profile-details">
                    <div className="detail-row">
                        <span className="detail-label">Username</span>
                        <span className="detail-value">{userID}</span>
                    </div>

                    <div className="detail-row">
                        <span className="detail-label">Email</span>
                        <span className="detail-value">{user.email || "N/A"}</span>
                    </div>

                    <div className="detail-row">
                        <span className="detail-label">Location</span>
                        <span className="detail-value">
                            {user.district && user.state
                                ? `${user.district}, ${user.state}`
                                : (user.state || "Not specified")}
                        </span>
                    </div>
                </div>

                {/* Expandable Harvest History */}
                <div className="history-section">
                    <button className="history-toggle" onClick={toggleHistory}>
                        <span>Your Harvests</span>
                        {historyOpen ? <FaChevronUp /> : <FaChevronDown />}
                    </button>

                    {historyOpen && (
                        <div className="history-list">
                            {history.length === 0 ? (
                                <p className="history-empty">No harvest history yet.</p>
                            ) : (
                                history.map((item, index) => (
                                    <div key={index} className="history-item">
                                        <span className="history-crop">{item.text}</span>
                                        <span className="history-date">Completed: {item.date}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default Profile;

