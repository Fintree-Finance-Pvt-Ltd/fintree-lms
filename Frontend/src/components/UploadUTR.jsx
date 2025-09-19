// import React, { useState } from "react";
// import api from "../api/api";
// import "../styles/UploadUTR.css"; // If you're using your own styles

// const UploadUTR = () => {
//   const [file, setFile] = useState(null);
//   const [message, setMessage] = useState("");
//   const [isError, setIsError] = useState(false);
//   const [uploadPercentage, setUploadPercentage] = useState(0);
//   const [isSubmitting, setIsSubmitting] = useState(false);

//   const handleFileChange = (e) => {
//     setFile(e.target.files[0]);
//     setMessage("");
//     setIsError(false);
//     setUploadPercentage(0);
//   };

//   const handleUpload = async () => {
//     if (!file) {
//       setMessage("⚠️ Please select a file to upload.");
//       setIsError(true);
//       return;
//     }

//     const formData = new FormData();
//     formData.append("file", file);
//     setIsSubmitting(true);

//     try {
//       const response = await api.post("/loan-booking/upload-utr", formData, {
//         headers: { "Content-Type": "multipart/form-data" },
//         onUploadProgress: (event) => {
//           const percent = Math.round((event.loaded * 100) / event.total);
//           setUploadPercentage(percent);
//         },
//       });

//       setMessage(`✅ ${response.data.message}`);
//       setIsError(false);
//     } catch (err) {
//       const serverMsg = err?.response?.data?.message || "Error uploading file.";
//       setMessage(`❌ ${serverMsg}`);
//       setIsError(true);
//       setUploadPercentage(0);
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   return (
//     <div className="utr-upload-container">
//       <h2 className="upload-heading">Upload Disbursement UTRs</h2>

//       <input
//         type="file"
//         accept=".xlsx,.xls,.csv"
//         onChange={handleFileChange}
//         disabled={isSubmitting}
//         className="file-input"
//       />

//       <button
//         className="upload-button"
//         onClick={handleUpload}
//         disabled={isSubmitting}
//       >
//         {isSubmitting ? "Uploading..." : "Upload"}
//       </button>

//       {uploadPercentage > 0 && (
//         <div className="progress-bar">
//           <div
//             className="progress-fill"
//             style={{ width: `${uploadPercentage}%` }}
//           />
//           <span className="progress-text">{uploadPercentage}%</span>
//         </div>
//       )}

//       {message && (
//         <p className={`upload-message ${isError ? "error" : "success"}`}>
//           {message}
//         </p>
//       )}
//     </div>
//   );
// };

// export default UploadUTR;


import React, { useState } from "react";
import api from "../api/api";
import "../styles/UploadUTR.css";

const UploadUTR = () => {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [uploadPercentage, setUploadPercentage] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // NEW: hold server details
  const [summary, setSummary] = useState(null); // { processed_count, duplicate_utr, missing_lans, row_errors, details? }

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setMessage("");
    setIsError(false);
    setUploadPercentage(0);
    setSummary(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage("⚠️ Please select a file to upload.");
      setIsError(true);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setIsSubmitting(true);

    try {
      const response = await api.post("/loan-booking/upload-utr", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (event.total) {
            const percent = Math.round((event.loaded * 100) / event.total);
            setUploadPercentage(percent);
          }
        },
      });

      setMessage(`✅ ${response.data.message}`);
      setIsError(false);
      setSummary(response.data);

    } catch (err) {
      const serverMsg = err?.response?.data?.message || "Error uploading file.";
      const details = err?.response?.data?.details;
      setMessage(`❌ ${serverMsg}`);
      setIsError(true);
      setUploadPercentage(0);
      setSummary(details ? { details } : null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="utr-upload-container">
      <h2 className="upload-heading">Upload Disbursement UTRs</h2>

      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileChange}
        disabled={isSubmitting}
        className="file-input"
      />

      <button className="upload-button" onClick={handleUpload} disabled={isSubmitting}>
        {isSubmitting ? "Uploading..." : "Upload"}
      </button>

      {uploadPercentage > 0 && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${uploadPercentage}%` }} />
          <span className="progress-text">{uploadPercentage}%</span>
        </div>
      )}

      {message && (
        <p className={`upload-message ${isError ? "error" : "success"}`}>
          {message}
        </p>
      )}

      {/* NEW: summary / errors */}
      {summary && (
        <div className="upload-summary">
          {"processed_count" in summary && (
            <>
              <div className="summary-row">
                <strong>Processed:</strong> {summary.processed_count}
              </div>

              {summary.duplicate_utr?.length > 0 && (
                <div className="summary-list">
                  <strong>Duplicate UTRs:</strong>
                  <ul>
                    {summary.duplicate_utr.map((u) => <li key={u}>{u}</li>)}
                  </ul>
                </div>
              )}

              {summary.missing_lans?.length > 0 && (
                <div className="summary-list">
                  <strong>Missing LANs:</strong>
                  <ul>
                    {summary.missing_lans.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                </div>
              )}

              {summary.row_errors?.length > 0 && (
                <>
                  <h3 style={{ marginTop: 12 }}>Row Errors</h3>
                  <div className="table-scroll">
                    <table className="error-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>LAN</th>
                          <th>UTR</th>
                          <th>Stage</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.row_errors.map((e, idx) => (
                          <tr key={`${e.lan}-${e.utr}-${idx}`}>
                            <td>{idx + 1}</td>
                            <td>{e.lan || "-"}</td>
                            <td>{e.utr || "-"}</td>
                            <td>{e.stage || "-"}</td>
                            <td>{e.reason || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* Top-level crash details (e.g., invalid Excel) */}
          {"details" in summary && summary.details && (
            <div className="summary-list">
              <strong>Error Details:</strong>
              <ul>
                <li><b>Message:</b> {summary.details.message}</li>
                {summary.details.code && <li><b>Code:</b> {summary.details.code}</li>}
                {summary.details.errno && <li><b>Errno:</b> {summary.details.errno}</li>}
                {summary.details.sqlState && <li><b>SQL State:</b> {summary.details.sqlState}</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UploadUTR;
