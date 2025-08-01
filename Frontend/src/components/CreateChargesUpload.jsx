import React, { useState } from "react";
import api from "../api/api";
import "../styles/CreateChargesUpload.css";

const CreateChargesUpload = () => {
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
            setMessage("❌ Please select a file to upload.");
            setIsError(true);
            return;
        }

        const formData = new FormData();
        formData.append("file", file);
        setLoading(true);

        try {
            const response = await api.post(
                `/loan-charges/upload`,
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
            setFile(null);
        } catch (error) {
            setMessage("❌ Error uploading file. Please try again.");
            setIsError(true);
            setUploadPercentage(0);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="charges-upload">
            <h2>📂 Upload Loan Charges</h2>

            <input type="file" onChange={handleFileChange} accept=".xlsx,.csv,.pdf" />

            <button onClick={handleUpload} disabled={loading}>
                {loading ? "Uploading..." : "Upload"}
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

            {message && (
                <p className={isError ? "error-message" : "success-message"}>
                    {message}
                </p>
            )}
        </div>
    );
};

export default CreateChargesUpload;
