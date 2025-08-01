import React, { useState } from "react";
import api from "../api/api";
import "../styles/CreateLoanBooking.css"; // same styles

const DeleteCashflow = () => {
    const [file, setFile] = useState(null);
    const [logs, setLogs] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [message, setMessage] = useState("");

    const handleFileChange = (event) => {
        setFile(event.target.files[0]);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!file) {
            setMessage("Please select a file.");
            return;
        }

        const formData = new FormData();
        formData.append("file", file);

        try {
            setMessage("Uploading...");
            setLogs([]);
            setWarnings([]);
            const response = await api.post(`/delete-cashflow/upload-delete-cashflow`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            setMessage(response.data.message);
            setLogs(response.data.logs || []);
            setWarnings(response.data.warnings || []);
        } catch (error) {
            setMessage("Upload failed. Please try again.");
            console.error("❌ Upload failed:", error);
        }
    };

    return (
        <div className="loan-booking-container">
            <h2>Upload Delete Cashflow Excel File</h2>
            <form onSubmit={handleSubmit}>
                <label>Select Excel (.xlsx) File</label>
                <input type="file" accept=".xlsx" onChange={handleFileChange} required />
                <button type="submit" className="submit-btn">Submit</button>
            </form>
            {message && <p className="upload-message">{message}</p>}
        </div>
    );
};

export default DeleteCashflow;
