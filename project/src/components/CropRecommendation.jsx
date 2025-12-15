import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Toaster, toast } from "react-hot-toast";
import { FaSeedling, FaLeaf, FaTint, FaThermometerHalf, FaCloudRain, FaFlask } from "react-icons/fa";
import "../style/CropRecommendation.css";
import { translateText } from "../api";
import axios from "axios";

const API_URL = `http://${window.location.hostname}:5000/api`;

export default function CropRecommendation() {
    const { t } = useTranslation();
    const [autoMode, setAutoMode] = useState(false);
    const [states, setStates] = useState([]);
    const [selectedState, setSelectedState] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    // Form Data
    const [formData, setFormData] = useState({
        N: "",
        P: "",
        K: "",
        ph: "",
        temperature: "",
        humidity: "",
        rainfall: ""
    });

    // Fetch States on Mount
    useEffect(() => {
        axios.get(`${API_URL}/recommender/states`)
            .then(res => setStates(res.data))
            .catch(err => console.error("Error fetching states:", err));
    }, []);

    // Handle Auto Mode Toggle
    const handleAutoModeToggle = async (e) => {
        const isChecked = e.target.checked;
        setAutoMode(isChecked);

        if (isChecked) {
            // Fetch User State from Profile
            const userID = localStorage.getItem("uniqueID");
            if (userID) {
                try {
                    setLoading(true);
                    const userRes = await axios.get(`${API_URL}/user?id=${userID}`);
                    const userState = userRes.data.state;

                    if (userState) {
                        setSelectedState(userState);
                        toast.success(`Location set to ${userState}`);
                    } else {
                        toast("State not found in profile. Please select manually.", { icon: "ℹ️" });
                    }
                } catch (err) {
                    console.error("User fetch error:", err);
                    toast.error("Could not fetch user profile used for location auto-detect.");
                } finally {
                    setLoading(false);
                }
            } else {
                toast("Please log in to auto-detect location", { icon: "🔒" });
            }
        }
    };

    // Handle Data Fetch when State Changes (Auto Mode)
    useEffect(() => {
        if (autoMode && selectedState) {
            setLoading(true);
            axios.get(`${API_URL}/recommender/data?state=${selectedState}`)
                .then(res => {
                    setFormData(prev => ({
                        ...prev,
                        ...res.data
                    }));
                    toast.success(`Data fetched for ${selectedState}`);
                })
                .catch(err => {
                    console.error(err);
                    toast.error("Failed to fetch data for state");
                })
                .finally(() => setLoading(false));
        }
    }, [autoMode, selectedState]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleRecommend = async () => {
        // Validate - Allow 0
        const required = ['N', 'P', 'K', 'ph', 'temperature', 'humidity', 'rainfall'];
        // Check for empty string, null, or undefined. 0 is valid.
        const missing = required.filter(k => formData[k] === "" || formData[k] === null || formData[k] === undefined);

        if (missing.length > 0) {
            toast.error(t("login.fillAllFields") || "Please fill all fields");
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            // Convert inputs to numbers
            const payload = {
                N: parseFloat(formData.N),
                P: parseFloat(formData.P),
                K: parseFloat(formData.K),
                ph: parseFloat(formData.ph),
                temperature: parseFloat(formData.temperature),
                humidity: parseFloat(formData.humidity),
                rainfall: parseFloat(formData.rainfall)
            };

            const res = await axios.post(`${API_URL}/recommender/predict`, payload);

            // Expected Response: { "top_crop": "Rice", "alternatives": ["Maize", "Jute", "Cotton"] }
            // but handle legacy single response just in case

            const topCropRaw = res.data.top_crop || res.data.crop;
            const alternativesRaw = res.data.alternatives || [];

            // Translate Main Crop
            const topCropTranslated = await translateText(topCropRaw);

            // Translate Alternatives
            const alternativesTranslated = await Promise.all(
                alternativesRaw.map(async (crop) => await translateText(crop))
            );

            setResult({
                top: topCropTranslated || topCropRaw,
                others: alternativesTranslated
            });

            toast.success("Recommendation Ready!");

        } catch (error) {
            console.error(error);
            toast.error("Recommendation failed. Try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="crop-rec-container">
            <Toaster />
            <div className="cr-header">
                <h1>🌱 {t("crop_recommendation.title") || "Crop Recommendation"}</h1>
                <p>{t("crop_recommendation.subtitle") || "Find the perfect crop for your soil & climate"}</p>
            </div>

            <div className="layout-grid-7col">
                {/* LEFT PANEL (4 Columns) - INPUTS */}
                <div className="left-panel">
                    <div className="cr-card input-card">
                        <div className="form-grid">
                            {/* Soil Nutrients */}
                            <div className="form-group">
                                <label><FaFlask /> Nitrogen (N)</label>
                                <input
                                    type="number" name="N"
                                    value={formData.N} onChange={handleInputChange}
                                    readOnly={autoMode}
                                    placeholder="e.g. 90"
                                />
                            </div>
                            <div className="form-group">
                                <label><FaFlask /> Phosphorus (P)</label>
                                <input
                                    type="number" name="P"
                                    value={formData.P} onChange={handleInputChange}
                                    readOnly={autoMode}
                                    placeholder="e.g. 42"
                                />
                            </div>
                            <div className="form-group">
                                <label><FaFlask /> Potassium (K)</label>
                                <input
                                    type="number" name="K"
                                    value={formData.K} onChange={handleInputChange}
                                    readOnly={autoMode}
                                    placeholder="e.g. 43"
                                />
                            </div>
                            <div className="form-group">
                                <label><FaTint /> pH Level</label>
                                <input
                                    type="number" name="ph" step="0.1"
                                    value={formData.ph} onChange={handleInputChange}
                                    readOnly={autoMode}
                                    placeholder="e.g. 6.5"
                                />
                            </div>

                            {/* Weather */}
                            <div className="form-group">
                                <label><FaThermometerHalf /> Temperature (°C)</label>
                                <input
                                    type="number" name="temperature" step="0.1"
                                    value={formData.temperature} onChange={handleInputChange}
                                    readOnly={autoMode}
                                    placeholder="e.g. 20.5"
                                />
                            </div>
                            <div className="form-group">
                                <label><FaTint /> Humidity (%)</label>
                                <input
                                    type="number" name="humidity" step="0.1"
                                    value={formData.humidity} onChange={handleInputChange}
                                    readOnly={autoMode}
                                    placeholder="e.g. 80"
                                />
                            </div>
                            <div className="form-group">
                                <label><FaCloudRain /> Rainfall (mm)</label>
                                <input
                                    type="number" name="rainfall" step="0.1"
                                    value={formData.rainfall} onChange={handleInputChange}
                                    readOnly={autoMode}
                                    placeholder="e.g. 200"
                                />
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="controls-section-bottom">
                            <label className="mode-toggle round-checkbox-wrapper">
                                <input
                                    type="checkbox"
                                    checked={autoMode}
                                    onChange={handleAutoModeToggle}
                                />
                                <span className="round-checkbox-visual"></span>
                                <span className="toggle-label">{t("crop_recommendation.autoMode") || "Recommend based on location and weather"}</span>
                            </label>

                            {autoMode && selectedState && (
                                <div className="detected-state-text">
                                    📍 Location detected: <strong>{selectedState}</strong>
                                </div>
                            )}
                        </div>

                        <button
                            className="recommend-btn"
                            onClick={handleRecommend}
                            disabled={loading || (autoMode && !selectedState)}
                        >
                            {loading ? "Analyzing..." : (t("crop_recommendation.getButton") || "Get Crop Recommendation")}
                        </button>
                    </div>
                </div>

                {/* RIGHT PANEL (3 Columns) - OUTPUT */}
                <div className="right-panel">
                    <div className="cr-card result-card">
                        {result ? (
                            <div className="result-content-wrapper">
                                <div className="result-icon"><FaSeedling /></div>

                                <h3>Best Crop according to data:</h3>
                                <div className="recommended-crop">{result.top}</div>

                                {result.others && result.others.length > 0 && (
                                    <div className="alternatives-section">
                                        <h4>Other crops to consider:</h4>
                                        <ol className="alternatives-list">
                                            {result.others.map((crop, index) => (
                                                <li key={index}>{crop}</li>
                                            ))}
                                        </ol>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="placeholder-result">
                                <FaLeaf className="placeholder-icon" />
                                <p>Enter soil details or auto-detect location to get a recommendation.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
