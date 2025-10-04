import React, { useState } from "react";
import * as XLSX from "xlsx";
import api from "../api/api";
import "../styles/CreateLoanBooking.css";

const ForecloserUpload = () => {
  const [file, setFile] = useState(null);
  const [uploadType, setUploadType] = useState("");
  const [previewData, setPreviewData] = useState([]);
  const [uploadPercentage, setUploadPercentage] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const handleFile = (e) => {
    const file = e.target.files[0];
    setFile(file);
    setMessage("");
    setIsError(false);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws);
      setPreviewData(data);
    };
    reader.readAsBinaryString(file);
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage("❌ Please select a file.");
      setIsError(true);
      return;
    }
    if (!uploadType) {
      setMessage("❌ Please select a charge type.");
      setIsError(true);
      return;
    }

    const formData = new FormData();
    formData.append("file", file); // ✅ backend expects "file"
    formData.append("type", uploadType);

    setIsUploading(true);
    setUploadPercentage(0);
    setMessage("");

    let apiEndpoint = "";
    if (uploadType === "foreclosure-upload") {
      apiEndpoint = "/forecloser/upload";
    } else if (uploadType === "20percent-amount") {
      apiEndpoint = "/forecloser/upload-20percent";
    }

    try {
      await api.post(apiEndpoint, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadPercentage(percent);
        },
      });

      setMessage("✅ Upload successful");
      setIsError(false);
      setFile(null);
      setUploadType("");
      setPreviewData([]);
    } catch (err) {
      console.error("❌ Upload failed", err);
      setMessage("❌ Upload failed. Please try again.");
      setIsError(true);
      setUploadPercentage(0);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="loan-booking-container">
      <h4>📤 Foreclosure & Charge Collection Upload</h4>

      <label>Select Excel File</label>
      <input
        key={file ? file.name : "empty"} // ✅ reset file input
        type="file"
        accept=".xlsx"
        onChange={handleFile}
        required
      />

      <label>Charge Type</label>
      <select
        value={uploadType}
        onChange={(e) => setUploadType(e.target.value)}
        required
      >
        <option value="">Select Type</option>
        <option value="foreclosure-upload">Foreclosure Upload</option>
        <option value="20percent-amount">20% Amount Upload</option>
      </select>

      <button
        className="submit-btn"
        onClick={handleUpload}
        disabled={isUploading}
      >
        {isUploading ? "Uploading..." : "Upload"}
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

export default ForecloserUpload;
