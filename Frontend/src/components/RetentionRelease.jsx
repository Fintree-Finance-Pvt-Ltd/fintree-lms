import React, { useState } from "react";
import api from "../api/api";

const RetentionReleaseUpload = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      alert("Select file first");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setLoading(true);

      const res = await api.post(
        "repayments/upload-retention-release",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      alert(
        `Upload complete\nInserted: ${res.data.inserted_rows}\nFailed: ${res.data.failed_rows}`
      );
    } catch (err) {
      alert(
        err.response?.data?.message ||
          "Upload failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="partner-page">
      <div className="partner-container">

        <div className="page-header">
          <div className="page-header-left">
            <div className="page-badge">
              Retention Management
            </div>

            <h1>Bulk Retention Release Upload</h1>

            <p>
              Upload Excel with LAN, UTR and payment_date
            </p>
          </div>
        </div>

        <div className="card form-card">

          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) =>
              setFile(e.target.files[0])
            }
          />

          <br /><br />

          <button
            className="btn btn-success"
            onClick={handleUpload}
            disabled={loading}
          >
            {loading ? "Uploading..." : "Upload Excel"}
          </button>

        </div>
      </div>
    </div>
  );
};

export default RetentionReleaseUpload;