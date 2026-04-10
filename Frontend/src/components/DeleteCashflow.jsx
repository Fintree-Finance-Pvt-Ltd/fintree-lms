import React, { useState } from "react";
import api from "../api/api";
import "../styles/CreateLoanBooking.css"; // same styles

const DeleteCashflow = () => {
  const [file, setFile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [message, setMessage] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
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
    <div className="repayments-page">

      <div className="upload-card upload-card--modern">

        <h2 className="upload-card__title">
          📊 Upload Delete Cashflow Excel File
        </h2>

        <label className="dropzone">

          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              handleFileChange(e);
              setSelectedFileName(e.target.files?.[0]?.name || "");
            }}
            required
          />

          <div className="dropzone-inner">
            <span className="drop-icon">⬆</span>

            {selectedFileName ? (
              <p>
                Selected file:<br />
                <strong>{selectedFileName}</strong>
              </p>
            ) : (
              <p>
                Drag & drop your Excel file here<br />
                <strong>or click to browse</strong>
              </p>
            )}

          </div>

        </label>

        <button
          className="upload-button upload-button--dark"
          onClick={handleSubmit}
        >
          Submit
        </button>

        {message && (
          <div className="flash-modern success">
            {message}
          </div>
        )}

      </div>

    </div>
  );
  // return (
  //     <div className="loan-booking-container">
  //         <h2>Upload Delete Cashflow Excel File</h2>
  //         <form onSubmit={handleSubmit}>
  //             <label>Select Excel (.xlsx) File</label>
  //             <input type="file" accept=".xlsx" onChange={handleFileChange} required />
  //             <button type="submit" className="submit-btn">Submit</button>
  //         </form>
  //         {message && <p className="upload-message">{message}</p>}
  //     </div>
  // );
};

export default DeleteCashflow;
