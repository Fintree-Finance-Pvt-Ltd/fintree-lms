import React, { useState } from "react";
import api from "../api/api";
import "../styles/RepaymentsUpload.css";

const RepaymentsUpload = () => {
    const [file, setFile] = useState(null);
    const [message, setMessage] = useState("");
    const [isError, setIsError] = useState(false);
    const [uploadPercentage, setUploadPercentage] = useState(0);
    const [loading, setLoading] = useState(false);

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
        setMessage("");
        setIsError(false);
    };

    const handleUpload = async () => {
        if (!file) {
            setMessage("⚠️ Please select a file.");
            setIsError(true);
            return;
        }

        const formData = new FormData();
        formData.append("file", file);

        setLoading(true);

        try {
            const response = await api.post(
                `/repayments/upload`,
                formData,
                {
                    headers: { "Content-Type": "multipart/form-data" },
                    onUploadProgress: (progressEvent) => {
                        const percent = Math.round(
                            (progressEvent.loaded * 100) / progressEvent.total
                        );
                        setUploadPercentage(percent);
                    },
                }
            );

            setMessage(`✅ ${response.data.message}`);
            setIsError(false);
            setFile(null); // Clear input
        } catch (error) {
            setMessage("❌ Error uploading file.");
            setIsError(true);
            setUploadPercentage(0);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="repayments-upload">
            <h2>Repayments Upload</h2>

            <input type="file" onChange={handleFileChange} />

            <button onClick={handleUpload} disabled={loading}>
                {loading ? "Uploading..." : "Upload"}
            </button>

            {/* Progress Bar */}
            {uploadPercentage > 0 && (
                <div className="progress-bar">
                    <div className="progress" style={{ width: `${uploadPercentage}%` }}></div>
                    <span>{uploadPercentage}%</span>
                </div>
            )}

            {message && (
                <p className={isError ? "error-message" : "success-message"}>
                    {message}
                </p>
            )}
        </div>
    );
};

export default RepaymentsUpload;
