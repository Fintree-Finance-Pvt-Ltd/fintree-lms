import React, { useState } from "react";
import api from "../api/api";

const RetentionReleaseUpload = () => {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [summary, setSummary] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      setMessage("⚠ Please select a file first");
      setIsError(true);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setIsSubmitting(true);

      const res = await api.post(
        "repayments/upload-retention-release",
        formData
      );

      setMessage(`✅ ${res.data.message}`);
      setSummary(res.data);
      setIsError(false);
    } catch (err) {
      setMessage(
        err.response?.data?.message || "Upload failed"
      );
      setSummary(err.response?.data);
      setIsError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f6f8fc",
        padding: "30px",
      }}
    >
      <div
        style={{
          width: "520px",
          background: "#fff",
          borderRadius: "14px",
          padding: "40px",
          boxShadow: "0 8px 28px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            marginBottom: "25px",
            fontWeight: 600,
            color: "#1a2b49",
          }}
        >
          📊 Upload Retention Release Excel
        </h2>

        {/* FILE INPUT */}
        <label
          style={{
            display: "block",
            border: "2px dashed #c9d2e3",
            borderRadius: "10px",
            padding: "25px",
            cursor: "pointer",
            marginBottom: "20px",
            background: "#fafcff",
          }}
        >
          <input
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(e) =>
              setFile(e.target.files[0])
            }
          />

          {file ? (
            <span style={{ color: "#2c3e50" }}>
              📄 {file.name}
            </span>
          ) : (
            <span style={{ color: "#7a8599" }}>
              Drag & drop Excel here or click to browse
            </span>
          )}
        </label>

        {/* BUTTON */}
        <button
          onClick={handleUpload}
          disabled={isSubmitting}
          style={{
            background: "#2e6bff",
            color: "#fff",
            border: "none",
            padding: "12px 28px",
            borderRadius: "8px",
            fontSize: "15px",
            cursor: "pointer",
            transition: "0.2s",
          }}
        >
          {isSubmitting ? "Uploading..." : "Upload File"}
        </button>

        {/* STATUS MESSAGE */}
        {message && (
          <p
            style={{
              marginTop: "20px",
              fontWeight: 500,
              color: isError ? "#e74c3c" : "#2ecc71",
            }}
          >
            {message}
          </p>
        )}

        {/* SUMMARY SECTION */}
        {summary && (
          <div style={{ marginTop: "25px", textAlign: "left" }}>
            {summary.processed_count !== undefined && (
              <p>
                <strong>Processed:</strong>{" "}
                {summary.processed_count}
              </p>
            )}

            {summary.inserted_rows !== undefined && (
              <p>
                <strong>Inserted:</strong>{" "}
                {summary.inserted_rows}
              </p>
            )}

            {/* DUPLICATE UTR */}
            {summary.duplicate_utr?.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <strong style={{ color: "#e67e22" }}>
                  Duplicate UTR:
                </strong>
                <ul>
                  {summary.duplicate_utr.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* MISSING LAN */}
            {summary.missing_lans?.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <strong style={{ color: "#c0392b" }}>
                  Missing LAN:
                </strong>
                <ul>
                  {summary.missing_lans.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* ALREADY RELEASED */}
            {summary.already_released?.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <strong style={{ color: "#8e44ad" }}>
                  Already Released:
                </strong>
                <ul>
                  {summary.already_released.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RetentionReleaseUpload;