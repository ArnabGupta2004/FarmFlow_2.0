import React, { useState, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import { Toaster, toast } from "react-hot-toast";
import { predictDisease, translateText } from "../api";
import { useTranslation } from "react-i18next";
import { FaCloudUploadAlt, FaCamera, FaLeaf, FaTimes, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import "../style/DiseaseDetection.css"; // We'll create this CSS next

export default function DiseaseDetection() {
    const { t, i18n } = useTranslation();
    const [activeTab, setActiveTab] = useState("upload"); // 'upload' or 'camera'
    const [image, setImage] = useState(null);
    const [preview, setPreview] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [translatedDisease, setTranslatedDisease] = useState("");

    const webcamRef = useRef(null);

    // Handle File Upload
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImage(file);
            setPreview(URL.createObjectURL(file));
            setResult(null);
        }
    };

    // Handle Drop
    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) {
            setImage(file);
            setPreview(URL.createObjectURL(file));
            setResult(null);
        }
    };

    // Handle Camera Capture
    const capture = useCallback(() => {
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
            // Convert base64 to blob
            fetch(imageSrc)
                .then(res => res.blob())
                .then(blob => {
                    const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });
                    setImage(file);
                    setPreview(imageSrc);
                    setResult(null);
                });
        }
    }, [webcamRef]);

    // Handle Predict
    const handlePredict = async () => {
        if (!image) return toast.error(t("farmers.uploadImage") || "Please upload an image first");

        setLoading(true);
        const formData = new FormData();
        formData.append("image", image);

        try {
            const data = await predictDisease(formData);
            setResult(data);

            // Translate disease name
            const cleanName = data.disease.replace(/_/g, " ");
            const translated = await translateText(cleanName);
            setTranslatedDisease(translated);

            toast.success(t("farmers.success") || "Prediction Complete!");
        } catch (e) {
            console.error(e);
            toast.error(t("farmers.error") || "Prediction failed");
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setImage(null);
        setPreview(null);
        setResult(null);
        setTranslatedDisease("");
    };

    return (
        <div className="disease-detection-container">
            <div className="dd-page-background"></div>
            <Toaster />
            <div className="dd-header">
                <h1>{t("disease_detection.title") || "Disease Detection"}</h1>
                <p>{t("disease_detection.subtitle") || "Detect crop diseases instantly with AI"}</p>
            </div>

            <div className="layout-grid-7col">
                {/* LEFT PANEL: INPUTS */}
                <div className="left-panel">
                    <div className="dd-card input-section">
                        <div className="tab-header">
                            <button
                                className={`tab-btn ${activeTab === "upload" ? "active" : ""}`}
                                onClick={() => setActiveTab("upload")}
                            >
                                <FaCloudUploadAlt /> {t("disease_detection.upload")}
                            </button>
                            <button
                                className={`tab-btn ${activeTab === "camera" ? "active" : ""}`}
                                onClick={() => setActiveTab("camera")}
                            >
                                <FaCamera /> {t("disease_detection.camera")}
                            </button>
                        </div>

                        <div className="tab-content" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
                            {!preview ? (
                                activeTab === "upload" ? (
                                    <div className="upload-box">
                                        <input type="file" accept="image/*" id="file-upload" hidden onChange={handleFileChange} />
                                        <label htmlFor="file-upload" className="upload-label">
                                            <FaCloudUploadAlt className="upload-icon" />
                                            <p>{t("disease_detection.clickOrDrag")}</p>
                                        </label>
                                    </div>
                                ) : (
                                    <div className="camera-box">
                                        <Webcam
                                            audio={false}
                                            ref={webcamRef}
                                            screenshotFormat="image/jpeg"
                                            className="webcam-view"
                                            videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
                                        />
                                        <button className="capture-btn" onClick={capture}>
                                            <FaCamera /> {t("disease_detection.capture")}
                                        </button>
                                    </div>
                                )
                            ) : (
                                <div className="preview-box">
                                    <img src={preview} alt="Preview" className="image-preview" />
                                    <button className="remove-btn" onClick={reset}><FaTimes /></button>
                                </div>
                            )}
                        </div>

                        <button
                            className="predict-btn"
                            onClick={handlePredict}
                            disabled={!image || loading}
                        >
                            {loading ? t("disease_detection.analyzing") : t("disease_detection.predict")}
                        </button>
                    </div>
                </div>

                {/* RIGHT PANEL: OUTPUT */}
                <div className="right-panel">
                    <div className="dd-card result-section glass-highlight result-card-fixed">
                        {result ? (
                            <div className="result-content-wrapper">
                                <div className="result-header">
                                    <h2>Diagnosis Result</h2>
                                </div>

                                <div className="result-body">
                                    <div className={`status-icon ${result.disease.includes("healthy") ? "healthy" : "danger"}`}>
                                        {result.disease.includes("healthy") ? <FaCheckCircle /> : <FaExclamationTriangle />}
                                    </div>

                                    <h1 className={`disease-name ${result.disease.includes("healthy") ? "text-green" : "text-red"}`}>
                                        {translatedDisease || result.disease.replace(/_/g, " ")}
                                    </h1>

                                    <div className="confidence-meter">
                                        <span>Confidence:</span>
                                        <div className="progress-bar-bg">
                                            <div
                                                className={`progress-fill ${result.confidence * 10 > 80 ? "high" : "med"}`}
                                                style={{ width: `${Math.min(result.confidence * 10, 100)}%` }}
                                            ></div>
                                        </div>
                                        <span className="conf-val">{(result.confidence * 10).toFixed(1)}%</span>
                                    </div>

                                    <p className="recommendation-text">
                                        {result.disease.includes("healthy")
                                            ? "Your crop looks healthy! Keep up the good work."
                                            : "Disease detected. Please consult an expert or apply recommended fungicides."}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="placeholder-result">
                                <FaLeaf className="placeholder-icon" />
                                <p>{t("disease_detection.placeholder")}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
