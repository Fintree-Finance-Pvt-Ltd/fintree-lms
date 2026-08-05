import React, { useRef, useState } from "react";

import api from "../../api/api";

const COLLECTION_UPLOAD_ENDPOINT =
  "/sterlion-mexon-dexon/upload/sterlion-mexon-dexon-collections";

const REQUIRED_HEADERS = [
  "LAN",
  "Collection UTR",
  "Collection Date",
  "Collection Amount",
];

/* ==========================================================================
   Internal CSS — injected via <style> so this component is self-contained
   ========================================================================== */
const STYLES = `
.smd-collection-page {
  --smd-ink: #101828;
  --smd-ink-soft: #475467;
  --smd-ink-faint: #98a2b3;
  --smd-border: #e4e7ec;
  --smd-surface: #ffffff;
  --smd-canvas: #f8f9fb;
  --smd-primary: #1d4ed8;
  --smd-primary-dark: #1e3a8a;
  --smd-primary-soft: #eff4ff;
  --smd-success: #027a48;
  --smd-success-bg: #ecfdf3;
  --smd-success-border: #abefc6;
  --smd-warning: #b54708;
  --smd-warning-bg: #fffaeb;
  --smd-warning-border: #fedf89;
  --smd-danger: #b42318;
  --smd-danger-bg: #fef3f2;
  --smd-danger-border: #fecdca;
  --smd-neutral-bg: #f2f4f7;
  --smd-neutral-text: #344054;
  --smd-radius: 10px;
  --smd-radius-sm: 6px;
  --smd-shadow: 0 1px 2px rgba(16, 24, 40, 0.05);
  --smd-shadow-md: 0 4px 12px rgba(16, 24, 40, 0.06);

  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 24px 64px;
  color: var(--smd-ink);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  background: var(--smd-canvas);
}

.smd-collection-page * {
  box-sizing: border-box;
}

/* ---------- Page header ---------- */

.smd-collection-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--smd-border);
}

.smd-collection-page-header h2 {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--smd-ink);
}

.smd-collection-page-header p {
  margin: 0;
  max-width: 640px;
  color: var(--smd-ink-soft);
  font-size: 13.5px;
}

/* ---------- Cards ---------- */

.smd-collection-card {
  background: var(--smd-surface);
  border: 1px solid var(--smd-border);
  border-radius: var(--smd-radius);
  box-shadow: var(--smd-shadow);
  padding: 22px 24px;
  margin-bottom: 20px;
}

.smd-collection-card h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 650;
  color: var(--smd-ink);
}

/* ---------- Required headers list ---------- */

.smd-collection-header-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
}

.smd-collection-header-list li {
  background: var(--smd-primary-soft);
  border: 1px solid #d1e0ff;
  border-radius: 999px;
  padding: 5px 12px;
}

.smd-collection-mono {
  font-family: "SFMono-Regular", ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: var(--smd-primary-dark);
  letter-spacing: -0.01em;
}

.smd-collection-info-box {
  background: var(--smd-canvas);
  border: 1px solid var(--smd-border);
  border-left: 3px solid var(--smd-primary);
  border-radius: var(--smd-radius-sm);
  padding: 14px 16px;
}

.smd-collection-info-box strong {
  display: block;
  font-size: 13px;
  font-weight: 650;
  color: var(--smd-ink);
  margin-bottom: 4px;
}

.smd-collection-info-box p {
  margin: 0;
  color: var(--smd-ink-soft);
  font-size: 13px;
}

/* ---------- Upload form ---------- */

.smd-collection-upload-form {
  background: var(--smd-surface);
  border: 1px solid var(--smd-border);
  border-radius: var(--smd-radius);
  box-shadow: var(--smd-shadow);
  padding: 22px 24px;
  margin-bottom: 16px;
}

.smd-collection-upload-form label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--smd-ink);
  margin-bottom: 10px;
}

.smd-collection-file-dropzone {
  border: 1.5px dashed #c7d0dc;
  border-radius: var(--smd-radius-sm);
  background: var(--smd-canvas);
  padding: 16px;
  margin-bottom: 18px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.smd-collection-file-dropzone:focus-within {
  border-color: var(--smd-primary);
  background: var(--smd-primary-soft);
}

.smd-collection-file-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.smd-collection-hidden-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.smd-collection-selected-file {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--smd-ink-soft);
}

.smd-collection-action-row {
  display: flex;
  gap: 10px;
}

/* ---------- Buttons ---------- */

.smd-collection-primary-button,
.smd-collection-secondary-button {
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: var(--smd-radius-sm);
  padding: 9px 18px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.05s ease;
  border: 1px solid transparent;
}

.smd-collection-primary-button {
  background: var(--smd-primary);
  color: #fff;
  border-color: var(--smd-primary);
}

.smd-collection-primary-button:hover:not(:disabled) {
  background: var(--smd-primary-dark);
  border-color: var(--smd-primary-dark);
}

.smd-collection-primary-button:active:not(:disabled) {
  transform: translateY(1px);
}

.smd-collection-primary-button:disabled {
  background: #d0d5dd;
  border-color: #d0d5dd;
  color: #f9fafb;
  cursor: not-allowed;
}

.smd-collection-secondary-button {
  background: var(--smd-surface);
  color: var(--smd-ink);
  border-color: var(--smd-border);
}

.smd-collection-secondary-button:hover:not(:disabled) {
  background: var(--smd-canvas);
  border-color: #c7d0dc;
}

.smd-collection-secondary-button:disabled {
  color: var(--smd-ink-faint);
  cursor: not-allowed;
}

.smd-collection-primary-button:focus-visible,
.smd-collection-secondary-button:focus-visible {
  outline: 2px solid var(--smd-primary);
  outline-offset: 2px;
}

/* ---------- Progress bar ---------- */

.smd-collection-progress-bar {
  position: relative;
  height: 8px;
  background: var(--smd-border);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 16px;
}

.smd-collection-progress-value {
  height: 100%;
  background: linear-gradient(90deg, var(--smd-primary), #4f7dfa);
  border-radius: 999px;
  transition: width 0.2s ease;
}

.smd-collection-progress-bar span {
  position: absolute;
  right: 0;
  top: -20px;
  font-size: 12px;
  font-weight: 600;
  color: var(--smd-ink-soft);
}

/* ---------- Messages ---------- */

.smd-collection-message {
  border-radius: var(--smd-radius-sm);
  padding: 12px 16px;
  font-size: 13.5px;
  font-weight: 500;
  margin-bottom: 16px;
  border: 1px solid transparent;
}

.smd-collection-message-success {
  background: var(--smd-success-bg);
  border-color: var(--smd-success-border);
  color: var(--smd-success);
}

.smd-collection-message-error {
  background: var(--smd-danger-bg);
  border-color: var(--smd-danger-border);
  color: var(--smd-danger);
}

.smd-collection-message-warning {
  background: var(--smd-warning-bg);
  border-color: var(--smd-warning-border);
  color: var(--smd-warning);
}

/* ---------- Summary grid ---------- */

.smd-collection-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.smd-collection-summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--smd-canvas);
  border: 1px solid var(--smd-border);
  border-radius: var(--smd-radius-sm);
  padding: 12px 14px;
}

.smd-collection-summary-label {
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--smd-ink-faint);
}

.smd-collection-summary-value {
  font-size: 18px;
  font-weight: 650;
  color: var(--smd-ink);
}

.smd-collection-success-text {
  color: var(--smd-success);
}

.smd-collection-error-text {
  color: var(--smd-danger);
}

/* ---------- Table titles ---------- */

.smd-collection-table-title {
  font-size: 14px;
  font-weight: 650;
  color: var(--smd-ink);
  margin: 24px 0 12px;
}

/* ---------- Tables ---------- */

.smd-collection-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--smd-border);
  border-radius: var(--smd-radius-sm);
}

.smd-collection-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  white-space: nowrap;
}

.smd-collection-table thead th {
  position: sticky;
  top: 0;
  background: var(--smd-canvas);
  color: var(--smd-ink-soft);
  font-weight: 600;
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  text-align: left;
  padding: 10px 14px;
  border-bottom: 1px solid var(--smd-border);
}

.smd-collection-table tbody td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--smd-border);
  color: var(--smd-ink);
}

.smd-collection-table tbody tr:last-child td {
  border-bottom: none;
}

.smd-collection-table tbody tr:hover {
  background: var(--smd-primary-soft);
}

.smd-collection-error-table tbody tr:hover {
  background: var(--smd-danger-bg);
}

/* ---------- Status pills ---------- */

.smd-collection-status-pill,
.smd-collection-stage-pill {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}

.smd-collection-status-success {
  background: var(--smd-success-bg);
  color: var(--smd-success);
  border: 1px solid var(--smd-success-border);
}

.smd-collection-status-warning {
  background: var(--smd-warning-bg);
  color: var(--smd-warning);
  border: 1px solid var(--smd-warning-border);
}

.smd-collection-status-danger {
  background: var(--smd-danger-bg);
  color: var(--smd-danger);
  border: 1px solid var(--smd-danger-border);
}

.smd-collection-status-neutral {
  background: var(--smd-neutral-bg);
  color: var(--smd-neutral-text);
  border: 1px solid var(--smd-border);
}

.smd-collection-stage-pill {
  background: var(--smd-neutral-bg);
  color: var(--smd-neutral-text);
  border: 1px solid var(--smd-border);
}

.smd-collection-error-reason {
  white-space: normal;
  min-width: 220px;
  color: var(--smd-danger);
}

/* ---------- Allocation cards ---------- */

.smd-collection-allocation-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.smd-collection-allocation-card {
  border: 1px solid var(--smd-border);
  border-radius: var(--smd-radius-sm);
  padding: 16px;
  background: var(--smd-canvas);
}

.smd-collection-allocation-header {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--smd-border);
}

.smd-collection-allocation-header > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.smd-collection-allocation-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--smd-ink-faint);
}

.smd-collection-allocation-header strong {
  font-size: 13.5px;
  color: var(--smd-ink);
}

.smd-collection-allocation-table thead th {
  background: var(--smd-surface);
}

/* ---------- Responsive ---------- */

@media (max-width: 768px) {
  .smd-collection-page {
    padding: 20px 16px 48px;
  }

  .smd-collection-page-header {
    flex-direction: column;
  }

  .smd-collection-summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .smd-collection-file-row {
    flex-wrap: wrap;
  }

  .smd-collection-action-row {
    flex-direction: column;
  }

  .smd-collection-primary-button,
  .smd-collection-secondary-button {
    width: 100%;
  }
}
`;

const formatAmount = (value) => {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "-";
  }

  return numericValue.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  const dateValue = String(value).substring(0, 10);
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return dateValue;
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
};

const formatStatus = (value) => {
  if (!value) {
    return "-";
  }

  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getStatusClass = (status) => {
  const normalizedStatus = String(status || "").toUpperCase();

  if (normalizedStatus === "FULLY_ALLOCATED") {
    return "smd-collection-status-success";
  }

  if (normalizedStatus === "PARTIALLY_ALLOCATED") {
    return "smd-collection-status-warning";
  }

  if (normalizedStatus === "NOT_ALLOCATED") {
    return "smd-collection-status-danger";
  }

  return "smd-collection-status-neutral";
};

const SterlionMexonDexonCollectionUpload = () => {
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState("No file selected");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadPercentage, setUploadPercentage] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);

  const resetResultState = () => {
    setMessage("");
    setError("");
    setSummary(null);
    setUploadPercentage(0);
  };

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;

    resetResultState();

    if (!selectedFile) {
      setFile(null);
      setSelectedFileName("No file selected");
      return;
    }

    const extension = selectedFile.name.split(".").pop()?.toLowerCase();

    if (!["xlsx", "xls"].includes(extension)) {
      setFile(null);
      setSelectedFileName("No file selected");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setError("Only .xlsx and .xls Excel files are supported.");
      return;
    }

    setFile(selectedFile);
    setSelectedFileName(selectedFile.name);
  };

  const handleReset = () => {
    setFile(null);
    setSelectedFileName("No file selected");
    setMessage("");
    setError("");
    setSummary(null);
    setUploadPercentage(0);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!file) {
      setError("Please select a collection Excel file.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    setError("");
    setSummary(null);
    setUploadPercentage(0);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await api.post(COLLECTION_UPLOAD_ENDPOINT, formData, {
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) {
            return;
          }

          const percentage = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );

          setUploadPercentage(percentage);
        },
      });

      const responseData = response.data;

      setSummary(responseData);
      setMessage(
        responseData.message ||
          "Collection upload and FIFO allocation completed successfully."
      );
      setError("");
      setUploadPercentage(100);
    } catch (requestError) {
      const serverResponse = requestError?.response?.data;

      console.error(
        "Sterlion/Mexon/Dexon collection upload failed:",
        serverResponse || requestError
      );

      setSummary(serverResponse || null);
      setError(
        serverResponse?.message || "Collection upload failed. Please try again."
      );
      setMessage("");
      setUploadPercentage(0);
    } finally {
      setIsSubmitting(false);
    }
  };

  const successRows = summary?.success_rows || [];
  const rowErrors = summary?.row_errors || [];

  return (
    <div className="smd-collection-page">
      <style>{STYLES}</style>

      <div className="smd-collection-page-header">
        <div>
          <h2>Upload Sterlion / Mexon / Dexon Collections</h2>
          <p>
            Upload collection details against an existing LAN. The collection
            will be allocated to outstanding invoices using FIFO.
          </p>
        </div>
      </div>

      <div className="smd-collection-card">
        <h3>Required Excel Headers</h3>

        <ul className="smd-collection-header-list">
          {REQUIRED_HEADERS.map((header) => (
            <li key={header}>
              <span className="smd-collection-mono">{header}</span>
            </li>
          ))}
        </ul>

        <div className="smd-collection-info-box">
          <strong>Collection allocation rules</strong>
          <p>
            The uploaded collection will be allocated against the oldest
            outstanding invoice first. Only the principal allocated to an
            invoice will reduce the utilized loan limit.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="smd-collection-upload-form">
        <label htmlFor="smdCollectionExcelInput">
          Select Collection Excel File
        </label>

        <div className="smd-collection-file-dropzone">
          <div className="smd-collection-file-row">
            <input
              ref={fileInputRef}
              id="smdCollectionExcelInput"
              className="smd-collection-hidden-file-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={isSubmitting}
            />

            <button
              type="button"
              className="smd-collection-secondary-button"
              disabled={isSubmitting}
              onClick={() => fileInputRef.current?.click()}
            >
              Choose File
            </button>

            <div className="smd-collection-selected-file" title={selectedFileName}>
              {selectedFileName}
            </div>
          </div>
        </div>

        <div className="smd-collection-action-row">
          <button
            type="submit"
            className="smd-collection-primary-button"
            disabled={isSubmitting || !file}
          >
            {isSubmitting ? "Uploading..." : "Upload Collection Excel"}
          </button>

          <button
            type="button"
            className="smd-collection-secondary-button"
            disabled={isSubmitting}
            onClick={handleReset}
          >
            Reset
          </button>
        </div>
      </form>

      {uploadPercentage > 0 && (
        <div className="smd-collection-progress-bar">
          <div
            className="smd-collection-progress-value"
            style={{ width: `${uploadPercentage}%` }}
          />
          <span>{uploadPercentage}%</span>
        </div>
      )}

      {message && (
        <div className="smd-collection-message smd-collection-message-success">
          {message}
        </div>
      )}

      {error && (
        <div className="smd-collection-message smd-collection-message-error">
          {error}
        </div>
      )}

      {summary && (
        <div className="smd-collection-card">
          <h3>Collection Upload Summary</h3>

          <div className="smd-collection-summary-grid">
            <div className="smd-collection-summary-item">
              <span className="smd-collection-summary-label">Source</span>
              <span className="smd-collection-summary-value">
                {summary.source || "-"}
              </span>
            </div>

            <div className="smd-collection-summary-item">
              <span className="smd-collection-summary-label">Total Rows</span>
              <span className="smd-collection-summary-value">
                {summary.total_rows ?? 0}
              </span>
            </div>

            <div className="smd-collection-summary-item">
              <span className="smd-collection-summary-label">Inserted</span>
              <span className="smd-collection-summary-value smd-collection-success-text">
                {summary.inserted_rows ?? 0}
              </span>
            </div>

            <div className="smd-collection-summary-item">
              <span className="smd-collection-summary-label">Failed</span>
              <span className="smd-collection-summary-value smd-collection-error-text">
                {summary.failed_rows ?? 0}
              </span>
            </div>
          </div>

          {summary.partial_success && (
            <div className="smd-collection-message smd-collection-message-warning">
              Some collection rows were inserted and some rows failed. Review
              the row errors below.
            </div>
          )}

          {successRows.length > 0 && (
            <>
              <h3 className="smd-collection-table-title">
                Successfully Uploaded Collections
              </h3>

              <div className="smd-collection-table-wrap">
                <table className="smd-collection-table smd-collection-main-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Excel Row</th>
                      <th>LAN</th>
                      <th>Product</th>
                      <th>Collection UTR</th>
                      <th>Collection Date</th>
                      <th>Collection Amount</th>
                      <th>Allocated</th>
                      <th>Unallocated</th>
                      <th>Allocation Status</th>
                      <th>Loan Limit</th>
                      <th>Total Disbursement</th>
                      <th>Total Principal Allocated</th>
                      <th>Utilized</th>
                      <th>Unutilized</th>
                    </tr>
                  </thead>

                  <tbody>
                    {successRows.map((row, index) => (
                      <tr
                        key={
                          row.collection_id ||
                          `${row.lan}-${row.collection_utr}-${index}`
                        }
                      >
                        <td>{index + 1}</td>
                        <td className="smd-collection-mono">{row.row ?? "-"}</td>
                        <td className="smd-collection-mono">{row.lan || "-"}</td>
                        <td>{row.product || "-"}</td>
                        <td className="smd-collection-mono">
                          {row.collection_utr || "-"}
                        </td>
                        <td>{formatDate(row.collection_date)}</td>
                        <td>{formatAmount(row.collection_amount)}</td>
                        <td>{formatAmount(row.allocated_amount)}</td>
                        <td>{formatAmount(row.unallocated_amount)}</td>
                        <td>
                          <span
                            className={`smd-collection-status-pill ${getStatusClass(
                              row.allocation_status
                            )}`}
                          >
                            {formatStatus(row.allocation_status)}
                          </span>
                        </td>
                        <td>{formatAmount(row.loan_limit)}</td>
                        <td>{formatAmount(row.total_disbursement_amount)}</td>
                        <td>{formatAmount(row.total_principal_allocated)}</td>
                        <td>{formatAmount(row.utilized_amount)}</td>
                        <td>{formatAmount(row.unutilized_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {successRows.some(
            (row) => Array.isArray(row.allocations) && row.allocations.length > 0
          ) && (
            <>
              <h3 className="smd-collection-table-title">
                FIFO Allocation Details
              </h3>

              <div className="smd-collection-allocation-list">
                {successRows.map((row, rowIndex) => {
                  const allocations = Array.isArray(row.allocations)
                    ? row.allocations
                    : [];

                  if (allocations.length === 0) {
                    return null;
                  }

                  return (
                    <div
                      className="smd-collection-allocation-card"
                      key={row.collection_id || `${row.collection_utr}-${rowIndex}`}
                    >
                      <div className="smd-collection-allocation-header">
                        <div>
                          <span className="smd-collection-allocation-label">LAN</span>
                          <strong className="smd-collection-mono">{row.lan}</strong>
                        </div>

                        <div>
                          <span className="smd-collection-allocation-label">
                            Collection UTR
                          </span>
                          <strong className="smd-collection-mono">
                            {row.collection_utr}
                          </strong>
                        </div>

                        <div>
                          <span className="smd-collection-allocation-label">
                            Allocated
                          </span>
                          <strong>{formatAmount(row.allocated_amount)}</strong>
                        </div>
                      </div>

                      <div className="smd-collection-table-wrap">
                        <table className="smd-collection-table smd-collection-allocation-table">
                          <thead>
                            <tr>
                              <th>FIFO Position</th>
                              <th>Invoice Number</th>
                              <th>Allocated Amount</th>
                              <th>Invoice Outstanding Before</th>
                              <th>Invoice Outstanding After</th>
                              <th>Collection Remaining Before</th>
                              <th>Collection Remaining After</th>
                              <th>Allocation Day</th>
                              <th>DPD</th>
                            </tr>
                          </thead>

                          <tbody>
                            {allocations.map((allocation, allocationIndex) => (
                              <tr
                                key={
                                  allocation.invoiceId ||
                                  `${allocation.invoiceNumber}-${allocationIndex}`
                                }
                              >
                                <td>
                                  {allocation.fifoPosition ?? allocationIndex + 1}
                                </td>
                                <td className="smd-collection-mono">
                                  {allocation.invoiceNumber || "-"}
                                </td>
                                <td>{formatAmount(allocation.allocatedAmount)}</td>
                                <td>
                                  {formatAmount(
                                    allocation.invoiceOutstandingBefore
                                  )}
                                </td>
                                <td>
                                  {formatAmount(allocation.invoiceOutstandingAfter)}
                                </td>
                                <td>
                                  {formatAmount(
                                    allocation.collectionRemainingBefore
                                  )}
                                </td>
                                <td>
                                  {formatAmount(
                                    allocation.collectionRemainingAfter
                                  )}
                                </td>
                                <td>{allocation.principalAllocationDay ?? "-"}</td>
                                <td>{allocation.dpdAtAllocation ?? 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {rowErrors.length > 0 && (
            <>
              <h3 className="smd-collection-table-title">Collection Row Errors</h3>

              <div className="smd-collection-table-wrap">
                <table className="smd-collection-table smd-collection-error-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Excel Row</th>
                      <th>LAN</th>
                      <th>Stage</th>
                      <th>Reason</th>
                      <th>Loan Limit</th>
                      <th>Total Disbursement</th>
                      <th>Principal Allocated</th>
                      <th>Utilized</th>
                      <th>Unutilized</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rowErrors.map((rowError, index) => (
                      <tr key={`${rowError.row}-${rowError.lan}-${rowError.stage}-${index}`}>
                        <td>{index + 1}</td>
                        <td className="smd-collection-mono">{rowError.row ?? "-"}</td>
                        <td className="smd-collection-mono">{rowError.lan || "-"}</td>
                        <td>
                          <span className="smd-collection-stage-pill">
                            {formatStatus(rowError.stage)}
                          </span>
                        </td>
                        <td className="smd-collection-error-reason">
                          {rowError.reason || "-"}
                        </td>
                        <td>
                          {rowError.loan_limit !== undefined
                            ? formatAmount(rowError.loan_limit)
                            : "-"}
                        </td>
                        <td>
                          {rowError.total_disbursement !== undefined
                            ? formatAmount(rowError.total_disbursement)
                            : "-"}
                        </td>
                        <td>
                          {rowError.total_principal_allocated !== undefined
                            ? formatAmount(rowError.total_principal_allocated)
                            : "-"}
                        </td>
                        <td>
                          {rowError.utilized_amount !== undefined
                            ? formatAmount(rowError.utilized_amount)
                            : "-"}
                        </td>
                        <td>
                          {rowError.unutilized_amount !== undefined
                            ? formatAmount(rowError.unutilized_amount)
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SterlionMexonDexonCollectionUpload;