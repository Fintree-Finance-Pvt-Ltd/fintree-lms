import React, { useState } from "react";
import api from "../api/api";
import "../styles/ManualRPSUpload.css"; // ✅ Import CSS

const ManualRPSUpload = () => {
    const [file, setFile] = useState(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [uploadPercentage, setUploadPercentage] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
        setMessage("");
        setError("");
    };

    const handleUpload = async () => {
        if (!file) {
            setError("⚠️ Please select a file to upload.");
            return;
        }

        const formData = new FormData();
        formData.append("file", file);

        setIsSubmitting(true);

        try {
            const response = await api.post(
                `/manual-rps/upload`,
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
            setError("");
        } catch (error) {
            if (error.response && error.response.data.message) {
                setError(`❌ ${error.response.data.message}`);
            } else {
                setError("❌ Error uploading file.");
            }
            setMessage("");
            setUploadPercentage(0);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="manual-rps-container">
            <h2>📂 Manual RPS Upload</h2>

            <input type="file" onChange={handleFileChange} accept=".xlsx,.csv,.pdf" />

            <button onClick={handleUpload} disabled={isSubmitting}>
                {isSubmitting ? "Uploading..." : "Upload"}
            </button>

            {uploadPercentage > 0 && (
                <div className="progress-bar">
                    <div
                        className="progress"
                        style={{ width: `${uploadPercentage}%` }}
                    ></div>
                    <span>{uploadPercentage}%</span>
                </div>
            )}

            {message && <p className="success-message">{message}</p>}
            {error && <p className="error-message">{error}</p>}
        </div>
    );
};

export default ManualRPSUpload;
