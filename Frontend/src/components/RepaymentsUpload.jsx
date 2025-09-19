// import React, { useState } from "react";
// import api from "../api/api";
// import "../styles/RepaymentsUpload.css";

// const RepaymentsUpload = () => {
//     const [file, setFile] = useState(null);
//     const [message, setMessage] = useState("");
//     const [isError, setIsError] = useState(false);
//     const [uploadPercentage, setUploadPercentage] = useState(0);
//     const [loading, setLoading] = useState(false);

//     const handleFileChange = (e) => {
//         setFile(e.target.files[0]);
//         setMessage("");
//         setIsError(false);
//     };

//     const handleUpload = async () => {
//         if (!file) {
//             setMessage("⚠️ Please select a file.");
//             setIsError(true);
//             return;
//         }

//         const formData = new FormData();
//         formData.append("file", file);

//         setLoading(true);

//         try {
//             const response = await api.post(
//                 `/repayments/upload`,
//                 formData,
//                 {
//                     headers: { "Content-Type": "multipart/form-data" },
//                     onUploadProgress: (progressEvent) => {
//                         const percent = Math.round(
//                             (progressEvent.loaded * 100) / progressEvent.total
//                         );
//                         setUploadPercentage(percent);
//                     },
//                 }
//             );

//             setMessage(`✅ ${response.data.message}`);
//             setIsError(false);
//             setFile(null); // Clear input
//         } catch (error) {
//             setMessage("❌ Error uploading file.");
//             setIsError(true);
//             setUploadPercentage(0);
//         } finally {
//             setLoading(false);
//         }
//     };

//     return (
//         <div className="repayments-upload">
//             <h2>Repayments Upload</h2>

//             <input type="file" onChange={handleFileChange} />

//             <button onClick={handleUpload} disabled={loading}>
//                 {loading ? "Uploading..." : "Upload"}
//             </button>

//             {/* Progress Bar */}
//             {uploadPercentage > 0 && (
//                 <div className="progress-bar">
//                     <div className="progress" style={{ width: `${uploadPercentage}%` }}></div>
//                     <span>{uploadPercentage}%</span>
//                 </div>
//             )}

//             {message && (
//                 <p className={isError ? "error-message" : "success-message"}>
//                     {message}
//                 </p>
//             )}
//         </div>
//     );
// };

// export default RepaymentsUpload;


import React, { useState } from "react";
import api from "../api/api";
import "../styles/RepaymentsUpload.css";

const RepaymentsUpload = () => {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [uploadPercentage, setUploadPercentage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null); // server response

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setMessage("");
    setIsError(false);
    setUploadPercentage(0);
    setSummary(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage("⚠️ Please select a file.");
      setIsError(true);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setLoading(true);

    try {
      const res = await api.post("/repayments/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (evt) => {
          if (evt.total) {
            const pct = Math.round((evt.loaded * 100) / evt.total);
            setUploadPercentage(pct);
          }
        },
      });

      setMessage(`✅ ${res.data.message}`);
      setIsError(false);
      setSummary(res.data);
      setFile(null);
    } catch (err) {
      const msg = err?.response?.data?.message || "❌ Error uploading file.";
      setMessage(msg);
      setIsError(true);
      setUploadPercentage(0);

      // still show any structured info we got
      setSummary(err?.response?.data || null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="repayments-page">
      {/* CARD */}
      <div className="upload-card">
        <h2 className="upload-card__title">Repayments Upload</h2>

        <div className="upload-card__body">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            disabled={loading}
            className="file-input file-input--full"
          />

          <button
            className="upload-button upload-button--primary"
            onClick={handleUpload}
            disabled={loading}
          >
            {loading ? "Uploading…" : "Upload"}
          </button>
        </div>

        {uploadPercentage > 0 && (
          <div className="progress-bar progress-bar--blue">
            <div
              className="progress-fill"
              style={{ width: `${uploadPercentage}%` }}
            />
          </div>
        )}
      </div>

      {/* STATUS */}
      {message && (
        <p className={`flash ${isError ? "flash--error" : "flash--success"}`}>
          {message}
        </p>
      )}

      {/* SUMMARY + ROW ERRORS */}
      {summary && (
        <div className="summary-card">
          {"inserted_rows" in summary && (
            <>
              <div className="summary-line">
                <strong>Inserted:</strong> {summary.inserted_rows ?? 0}
              </div>
              <div className="summary-line">
                <strong>Failed:</strong> {summary.failed_rows ?? 0}
              </div>

              {summary.duplicate_utrs?.length > 0 && (
                <div className="chip-list">
                  <strong>Duplicate UTRs:</strong>
                  <ul>
                    {summary.duplicate_utrs.map((u) => (
                      <li key={u} className="mono">
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.missing_lans?.length > 0 && (
                <div className="chip-list">
                  <strong>Missing LANs:</strong>
                  <ul>
                    {summary.missing_lans.map((l) => (
                      <li key={l} className="mono">
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.row_errors?.length > 0 && (
                <>
                  <h3 className="table-title">Row Errors</h3>
                  <div className="table-wrap">
                    <table className="errors-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Row</th>
                          <th>LAN</th>
                          <th>UTR</th>
                          <th>Stage</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.row_errors.map((e, i) => (
                          <tr key={`${e.row}-${e.lan}-${e.utr}-${i}`}>
                            <td>{i + 1}</td>
                            <td className="mono">{e.row ?? "-"}</td>
                            <td className="mono">{e.lan ?? "-"}</td>
                            <td className="mono">{e.utr ?? "-"}</td>
                            <td>
                              <span className="stage-pill">{e.stage ?? "-"}</span>
                            </td>
                            <td>{e.reason ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {"error" in summary && summary.error && (
            <div className="chip-list">
              <strong>Top-level Error:</strong>
              <ul>
                <li>{summary.error.message || String(summary.error)}</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RepaymentsUpload;
