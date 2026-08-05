import React, { useRef, useState } from "react";
import api from "../../api/api";

const INVOICE_UPLOAD_ENDPOINT =
  "/sterlion-mexon-dexon/upload/sterlion-mexon-dexon-invoices";

const REQUIRED_HEADERS = [
  "LAN",
  "Invoice Number",
  "Invoice Amount",
  "Disbursement Amount",
  "Disbursement Date",
  "Disbursement UTR",
];

const componentStyles = `
  .smd-invoice-page {
    width: min(100%, 1450px);
    min-height: calc(100vh - 90px);
    margin: 0 auto;
    padding: 28px;
    box-sizing: border-box;
    color: #1f2937;
    background: #f8fafc;
  }

  .smd-invoice-page *,
  .smd-invoice-page *::before,
  .smd-invoice-page *::after {
    box-sizing: border-box;
  }

  .smd-page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 22px;
  }

  .smd-page-header h2 {
    margin: 0;
    color: #172554;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.3;
  }

  .smd-page-description {
    max-width: 760px;
    margin: 8px 0 0;
    color: #64748b;
    font-size: 14px;
    line-height: 1.6;
  }

  .smd-card {
    margin-bottom: 22px;
    padding: 22px;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    background: #ffffff;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
  }

  .smd-card h3 {
    margin: 0 0 14px;
    color: #1e3a8a;
    font-size: 17px;
    font-weight: 700;
  }

  .smd-card p {
    margin: 14px 0 0;
    color: #64748b;
    font-size: 14px;
    line-height: 1.6;
  }

  .smd-header-list {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
  }

  .smd-header-list li {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 6px 11px;
    border: 1px solid #bfdbfe;
    border-radius: 999px;
    color: #1d4ed8;
    background: #eff6ff;
    font-size: 13px;
    font-weight: 600;
  }

  .smd-upload-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 22px;
    padding: 24px;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    background: #ffffff;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
  }

  .smd-upload-form label {
    display: block;
    margin: 0;
    color: #334155;
    font-size: 14px;
    font-weight: 600;
  }

  .smd-file-dropzone {
    width: 100%;
    padding: 18px;
    border: 1.5px dashed #94a3b8;
    border-radius: 12px;
    background: #f8fafc;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease;
  }

  .smd-file-dropzone:hover {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .smd-file-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
  }

  .smd-hidden-file-input {
    display: none;
  }

  .smd-selected-file {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    display: flex;
    align-items: center;
    padding: 10px 14px;
    overflow: hidden;
    border: 1px solid #dbe3ee;
    border-radius: 8px;
    color: #475569;
    background: #ffffff;
    font-size: 14px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .smd-action-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 6px;
  }

  .smd-primary-button,
  .smd-secondary-button {
    min-height: 44px;
    padding: 10px 20px;
    border-radius: 8px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      color 0.2s ease,
      box-shadow 0.2s ease,
      transform 0.15s ease;
  }

  .smd-primary-button {
    min-width: 190px;
    border: none;
    color: #ffffff;
    background: #2563eb;
    box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);
  }

  .smd-primary-button:hover:not(:disabled) {
    background: #1d4ed8;
    transform: translateY(-1px);
  }

  .smd-secondary-button {
    flex-shrink: 0;
    border: 1px solid #cbd5e1;
    color: #334155;
    background: #ffffff;
  }

  .smd-secondary-button:hover:not(:disabled) {
    border-color: #2563eb;
    color: #1d4ed8;
    background: #eff6ff;
  }

  .smd-primary-button:disabled,
  .smd-secondary-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
    transform: none;
    box-shadow: none;
  }

  .smd-primary-button:focus-visible,
  .smd-secondary-button:focus-visible {
    outline: 3px solid rgba(37, 99, 235, 0.2);
    outline-offset: 2px;
  }

  .smd-progress-bar {
    position: relative;
    width: 100%;
    height: 30px;
    margin: 16px 0;
    overflow: hidden;
    border: 1px solid #dbe3ee;
    border-radius: 999px;
    background: #e2e8f0;
    box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.08);
  }

  .smd-progress-value {
    height: 100%;
    min-width: 0;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      #2563eb 0%,
      #0ea5e9 100%
    );
    transition: width 0.25s ease;
  }

  .smd-progress-bar span {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 2;
    color: #0f172a;
    font-size: 12px;
    font-weight: 700;
    transform: translate(-50%, -50%);
  }

  .smd-message {
    margin: 14px 0;
    padding: 13px 16px;
    border: 1px solid transparent;
    border-radius: 9px;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.5;
  }

  .smd-message-success {
    border-color: #86efac;
    color: #166534;
    background: #f0fdf4;
  }

  .smd-message-error {
    border-color: #fecaca;
    color: #b91c1c;
    background: #fef2f2;
  }

  .smd-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 12px;
    margin-top: 14px;
  }

  .smd-summary-item {
    padding: 14px;
    border: 1px solid #e2e8f0;
    border-radius: 9px;
    background: #f8fafc;
  }

  .smd-summary-label {
    display: block;
    margin-bottom: 5px;
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .smd-summary-value {
    color: #1e293b;
    font-size: 16px;
    font-weight: 700;
    word-break: break-word;
  }

  .smd-table-title {
    margin: 24px 0 12px;
    color: #1e293b;
    font-size: 16px;
    font-weight: 700;
  }

  .smd-table-wrap {
    width: 100%;
    margin-top: 10px;
    overflow-x: auto;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #ffffff;
    scrollbar-width: thin;
    scrollbar-color: #94a3b8 #e2e8f0;
  }

  .smd-table-wrap::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .smd-table-wrap::-webkit-scrollbar-track {
    background: #e2e8f0;
  }

  .smd-table-wrap::-webkit-scrollbar-thumb {
    border-radius: 10px;
    background: #94a3b8;
  }

  .smd-table {
    width: 100%;
    min-width: 1100px;
    border-collapse: collapse;
    color: #334155;
    background: #ffffff;
    font-size: 13px;
  }

  .smd-table thead {
    background: #f1f5f9;
  }

  .smd-table th {
    padding: 12px 14px;
    border-bottom: 1px solid #cbd5e1;
    color: #334155;
    font-size: 12px;
    font-weight: 700;
    text-align: left;
    text-transform: uppercase;
    white-space: nowrap;
    letter-spacing: 0.03em;
  }

  .smd-table td {
    padding: 12px 14px;
    border-bottom: 1px solid #e2e8f0;
    color: #475569;
    vertical-align: top;
    white-space: nowrap;
  }

  .smd-table tbody tr:last-child td {
    border-bottom: none;
  }

  .smd-table tbody tr:hover {
    background: #f8fafc;
  }

  .smd-error-reason {
    min-width: 280px;
    max-width: 500px;
    white-space: normal !important;
    line-height: 1.5;
  }

  .smd-stage-pill {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 4px 9px;
    border: 1px solid #fed7aa;
    border-radius: 999px;
    color: #c2410c;
    background: #fff7ed;
    font-size: 11px;
    font-weight: 700;
    text-transform: capitalize;
    white-space: nowrap;
  }

  .smd-mono {
    font-family:
      "SFMono-Regular",
      Consolas,
      "Liberation Mono",
      Menlo,
      monospace;
    font-size: 12px;
    font-weight: 600;
  }

  @media (max-width: 1024px) {
    .smd-invoice-page {
      padding: 22px;
    }

    .smd-page-header h2 {
      font-size: 23px;
    }

    .smd-summary-grid {
      grid-template-columns: repeat(2, minmax(150px, 1fr));
    }
  }

  @media (max-width: 768px) {
    .smd-invoice-page {
      min-height: auto;
      padding: 16px;
    }

    .smd-page-header {
      flex-direction: column;
      gap: 10px;
    }

    .smd-page-header h2 {
      font-size: 21px;
    }

    .smd-page-description {
      font-size: 13px;
    }

    .smd-card,
    .smd-upload-form {
      padding: 16px;
      border-radius: 11px;
    }

    .smd-file-row {
      flex-direction: column;
      align-items: stretch;
    }

    .smd-selected-file,
    .smd-secondary-button {
      width: 100%;
    }

    .smd-action-row {
      flex-direction: column;
      align-items: stretch;
    }

    .smd-action-row .smd-primary-button,
    .smd-action-row .smd-secondary-button {
      width: 100%;
    }

    .smd-summary-grid {
      grid-template-columns: 1fr;
    }

    .smd-table th,
    .smd-table td {
      padding: 10px 12px;
    }
  }

  @media (max-width: 480px) {
    .smd-invoice-page {
      padding: 12px;
    }

    .smd-card,
    .smd-upload-form {
      padding: 14px;
    }

    .smd-file-dropzone {
      padding: 12px;
    }

    .smd-primary-button,
    .smd-secondary-button {
      min-height: 42px;
      padding: 9px 14px;
    }

    .smd-message {
      padding: 11px 13px;
      font-size: 13px;
    }
  }
`;

const formatAmount = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
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

const SterlionMexonDexonInvoiceUpload = () => {
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);

  const [
    selectedFileName,
    setSelectedFileName,
  ] = useState("No file selected");

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    uploadPercentage,
    setUploadPercentage,
  ] = useState(0);

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
    const selectedFile =
      event.target.files?.[0] || null;

    resetResultState();

    if (!selectedFile) {
      setFile(null);
      setSelectedFileName("No file selected");
      return;
    }

    const extension = selectedFile.name
      .split(".")
      .pop()
      ?.toLowerCase();

    if (!["xlsx", "xls"].includes(extension)) {
      setFile(null);
      setSelectedFileName("No file selected");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setError(
        "Only .xlsx and .xls Excel files are supported.",
      );

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
      setError(
        "Please select an invoice Excel file.",
      );

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
      const response = await api.post(
        INVOICE_UPLOAD_ENDPOINT,
        formData,
        {
          onUploadProgress: (progressEvent) => {
            if (!progressEvent.total) {
              return;
            }

            const percentage = Math.round(
              (progressEvent.loaded * 100) /
                progressEvent.total,
            );

            setUploadPercentage(percentage);
          },
        },
      );

      const responseData = response.data;

      setSummary(responseData);

      setMessage(
        responseData.message ||
          "Invoice upload completed successfully.",
      );

      setError("");
      setUploadPercentage(100);
    } catch (requestError) {
      const serverResponse =
        requestError?.response?.data;

      console.error(
        "Sterlion/Mexon/Dexon invoice upload failed:",
        serverResponse || requestError,
      );

      setSummary(serverResponse || null);

      setError(
        serverResponse?.message ||
          "Invoice upload failed. Please try again.",
      );

      setMessage("");
      setUploadPercentage(0);
    } finally {
      setIsSubmitting(false);
    }
  };

  const successRows =
    summary?.success_rows || [];

  const rowErrors =
    summary?.row_errors || [];

  return (
    <>
      <style>{componentStyles}</style>

      <div className="smd-invoice-page">
        <div className="smd-page-header">
          <div>
            <h2>
              Upload Sterlion / Mexon / Dexon
              Invoices
            </h2>

            <p className="smd-page-description">
              Upload invoice and disbursement
              details using the LAN generated
              during the loan booking upload.
            </p>
          </div>
        </div>

        <div className="smd-card">
          <h3>Required Excel Headers</h3>

          <ul className="smd-header-list">
            {REQUIRED_HEADERS.map((header) => (
              <li key={header}>
                <span className="smd-mono">
                  {header}
                </span>
              </li>
            ))}
          </ul>

          <p>
            The Disbursement Amount will increase
            the Utilized Amount. The row will be
            rejected when the disbursement exceeds
            the available Loan Limit.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="smd-upload-form"
        >
          <label htmlFor="smdInvoiceExcelInput">
            Select Invoice Excel File
          </label>

          <div className="smd-file-dropzone">
            <div className="smd-file-row">
              <input
                ref={fileInputRef}
                id="smdInvoiceExcelInput"
                className="smd-hidden-file-input"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                disabled={isSubmitting}
              />

              <button
                type="button"
                className="smd-secondary-button"
                disabled={isSubmitting}
                onClick={() =>
                  fileInputRef.current?.click()
                }
              >
                Choose File
              </button>

              <div
                className="smd-selected-file"
                title={selectedFileName}
              >
                {selectedFileName}
              </div>
            </div>
          </div>

          <div className="smd-action-row">
            <button
              type="submit"
              className="smd-primary-button"
              disabled={isSubmitting || !file}
            >
              {isSubmitting
                ? "Uploading..."
                : "Upload Invoice Excel"}
            </button>

            <button
              type="button"
              className="smd-secondary-button"
              disabled={isSubmitting}
              onClick={handleReset}
            >
              Reset
            </button>
          </div>
        </form>

        {uploadPercentage > 0 && (
          <div className="smd-progress-bar">
            <div
              className="smd-progress-value"
              style={{
                width: `${uploadPercentage}%`,
              }}
            />

            <span>
              {uploadPercentage}%
            </span>
          </div>
        )}

        {message && (
          <div className="smd-message smd-message-success">
            {message}
          </div>
        )}

        {error && (
          <div className="smd-message smd-message-error">
            {error}
          </div>
        )}

        {summary && (
          <div className="smd-card">
            <h3>Invoice Upload Summary</h3>

            <div className="smd-summary-grid">
              <div className="smd-summary-item">
                <span className="smd-summary-label">
                  Source
                </span>

                <span className="smd-summary-value">
                  {summary.source || "-"}
                </span>
              </div>

              <div className="smd-summary-item">
                <span className="smd-summary-label">
                  Total Rows
                </span>

                <span className="smd-summary-value">
                  {summary.total_rows ?? 0}
                </span>
              </div>

              <div className="smd-summary-item">
                <span className="smd-summary-label">
                  Inserted
                </span>

                <span className="smd-summary-value">
                  {summary.inserted_rows ?? 0}
                </span>
              </div>

              <div className="smd-summary-item">
                <span className="smd-summary-label">
                  Failed
                </span>

                <span className="smd-summary-value">
                  {summary.failed_rows ?? 0}
                </span>
              </div>
            </div>

            {summary.partial_success && (
              <div className="smd-message smd-message-error">
                Some invoice rows were inserted and
                some rows failed. Review the row
                errors below.
              </div>
            )}

            {successRows.length > 0 && (
              <>
                <h3 className="smd-table-title">
                  Successfully Uploaded Invoices
                </h3>

                <div className="smd-table-wrap">
                  <table className="smd-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Row</th>
                        <th>LAN</th>
                        <th>Product</th>
                        <th>Invoice Number</th>
                        <th>Invoice Amount</th>
                        <th>
                          Disbursement Amount
                        </th>
                        <th>Loan Limit</th>
                        <th>Utilized</th>
                        <th>Unutilized</th>
                      </tr>
                    </thead>

                    <tbody>
                      {successRows.map(
                        (row, index) => (
                          <tr
                            key={
                              row.invoice_id ||
                              `${row.lan}-${row.invoice_number}-${index}`
                            }
                          >
                            <td>{index + 1}</td>

                            <td className="smd-mono">
                              {row.row ?? "-"}
                            </td>

                            <td className="smd-mono">
                              {row.lan || "-"}
                            </td>

                            <td>
                              {row.product || "-"}
                            </td>

                            <td className="smd-mono">
                              {row.invoice_number ||
                                "-"}
                            </td>

                            <td>
                              {formatAmount(
                                row.invoice_amount,
                              )}
                            </td>

                            <td>
                              {formatAmount(
                                row.disbursement_amount,
                              )}
                            </td>

                            <td>
                              {formatAmount(
                                row.loan_limit,
                              )}
                            </td>

                            <td>
                              {formatAmount(
                                row.utilized_amount,
                              )}
                            </td>

                            <td>
                              {formatAmount(
                                row.unutilized_amount,
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {rowErrors.length > 0 && (
              <>
                <h3 className="smd-table-title">
                  Invoice Row Errors
                </h3>

                <div className="smd-table-wrap">
                  <table className="smd-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Excel Row</th>
                        <th>LAN</th>
                        <th>Stage</th>
                        <th>Reason</th>
                        <th>Loan Limit</th>
                        <th>
                          Currently Utilized
                        </th>
                        <th>
                          Available Amount
                        </th>
                        <th>
                          Requested Amount
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {rowErrors.map(
                        (rowError, index) => (
                          <tr
                            key={`${rowError.row}-${rowError.lan}-${rowError.stage}-${index}`}
                          >
                            <td>{index + 1}</td>

                            <td className="smd-mono">
                              {rowError.row ?? "-"}
                            </td>

                            <td className="smd-mono">
                              {rowError.lan || "-"}
                            </td>

                            <td>
                              <span className="smd-stage-pill">
                                {rowError.stage ||
                                  "-"}
                              </span>
                            </td>

                            <td className="smd-error-reason">
                              {rowError.reason ||
                                "-"}
                            </td>

                            <td>
                              {rowError.loan_limit !==
                              undefined
                                ? formatAmount(
                                    rowError.loan_limit,
                                  )
                                : "-"}
                            </td>

                            <td>
                              {rowError.currently_utilized !==
                              undefined
                                ? formatAmount(
                                    rowError.currently_utilized,
                                  )
                                : "-"}
                            </td>

                            <td>
                              {rowError.available_amount !==
                              undefined
                                ? formatAmount(
                                    rowError.available_amount,
                                  )
                                : "-"}
                            </td>

                            <td>
                              {rowError.requested_disbursement !==
                              undefined
                                ? formatAmount(
                                    rowError.requested_disbursement,
                                  )
                                : "-"}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default SterlionMexonDexonInvoiceUpload;