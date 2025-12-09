// import React, { useState } from "react";
// import api from "../api/api"; // ✅ use your JWT Axios instance
// import "../styles/CreateLoanBooking.css"; // same styles

// const CreateLoanBooking = () => {
//   const [skippedRows, setSkippedRows] = useState([]);
//   const [file, setFile] = useState(null);
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [fileName, setFileName] = useState("");
//   const [uploadType, setUploadType] = useState("");
//   const [message, setMessage] = useState("");
//   const [error, setError] = useState("");
//   const [uploadPercentage, setUploadPercentage] = useState(0);

//   const handleFileChange = (event) => {
//     setFile(event.target.files[0]);
//     setMessage("");
//     setError("");
//   };

//   function getApiEndpoint(type) {
//     switch (type) {
//       case "Health Care":
//         return `/loan-booking/hc-upload`;
//       case "BL Loan":
//         return `/loan-booking/bl-upload`;
//       case "EV Loan":
//         return `/loan-booking/upload`;
//       case "GQ FSF":
//         return `/loan-booking/gq-fsf-upload`;
//       case "GQ Non-FSF":
//         return `/loan-booking/gq-non-fsf-upload`;
//       case "Adikosh":
//         return `/loan-booking/adikosh-upload`;
//       case "Aldun":
//         return `/loan-booking/aldun-upload`;
//          case "Embifi":
//         return `/loan-booking/upload-embifi`;
//       default:
//         return "";
//     }
//   }

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     if (!file) {
//       setError("⚠️ Please select a file to upload.");
//       return;
//     }
//     if (!uploadType) {
//       setError("⚠️ Please select the type of loan.");
//       return;
//     }

//     setIsSubmitting(true);

//     const formData = new FormData();
//     formData.append("file", file);
//     formData.append("fileName", fileName);
//     formData.append("lenderType", uploadType);

//     try {
//       const res = await api.post(getApiEndpoint(uploadType), formData, {
//         headers: { "Content-Type": "multipart/form-data" },
//         onUploadProgress: (progressEvent) => {
//           const percent = Math.round(
//             (progressEvent.loaded * 100) / progressEvent.total
//           );
//           setUploadPercentage(percent);
//         },
//       });

//       setMessage(`✅ ${res.data.message}`);
//       setError("");
//       setSkippedRows(res.data.skippedDueToCIBIL || []);
//     } catch (err) {
//       console.error("❌ Upload error:", err.response?.data?.message || err.message);
//       setError(
//         `❌ ${err.response?.data?.message || "Upload failed. Please try again."}`
//       );
//       setMessage("");
//       setUploadPercentage(0);
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   return (
//     <div className="loan-booking-container">
//       <h2>Upload Loan Booking Excel</h2>
//       <form onSubmit={handleSubmit}>
//         <label>File Name</label>
//         <input
//           type="text"
//           placeholder="Enter file name"
//           value={fileName}
//           onChange={(e) => setFileName(e.target.value)}
//           required
//         />

//         <label>Select Excel File</label>
//         <input
//           type="file"
//           accept=".xlsx"
//           onChange={handleFileChange}
//           required
//         />

//         <label>Loan Type</label>
//         <select
//           value={uploadType}
//           onChange={(e) => setUploadType(e.target.value)}
//           required
//         >
//           <option value="">Select Type</option>
//           <option value="EV Loan">EV Loan</option>
//           <option value="Health Care">Health Care</option>
//           <option value="BL Loan">BL Loan</option>
//           <option value="GQ FSF">GQ FSF</option>
//           <option value="GQ Non-FSF">GQ Non-FSF</option>
//           <option value="Adikosh">Adikosh</option>
//           {/* <option value="Aldun">Aldun</option> */}
//           <option value="Embifi">Embifi</option>
//         </select>

//         <button type="submit" className="submit-btn" disabled={isSubmitting}>
//           {isSubmitting ? "Submitting..." : "Submit"}
//         </button>
//       </form>

//       {message && <p className="upload-message success">{message}</p>}
//       {error && <p className="upload-message error">{error}</p>}

//       {uploadPercentage > 0 && (
//         <div className="progress-bar">
//           <div
//             className="progress"
//             style={{ width: `${uploadPercentage}%` }}
//           ></div>
//           <span>{uploadPercentage}%</span>
//         </div>
//       )}

//       {skippedRows.length > 0 && (
//         <div className="skipped-section">
//           <h3>⚠️ Skipped Records (Low CIBIL)</h3>
//           <table className="skipped-table">
//             <thead>
//               <tr>
//                 <th>Customer Name</th>
//                 <th>PAN</th>
//                 <th>Aadhaar</th>
//                 <th>CIBIL Score</th>
//               </tr>
//             </thead>
//             <tbody>
//               {skippedRows.map((row, i) => (
//                 <tr key={i}>
//                   <td>{row["Customer Name"]}</td>
//                   <td>{row["PAN Number"]}</td>
//                   <td>{row["Aadhaar Number"]}</td>
//                   <td>{row["Credit Score"]}</td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       )}
//     </div>
//   );
// };

// export default CreateLoanBooking;

import React, { useState } from "react";
import api from "../api/api";
import "../styles/CreateLoanBooking.css";

const CreateLoanBooking = () => {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [uploadType, setUploadType] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadPercentage, setUploadPercentage] = useState(0);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [summary, setSummary] = useState(null); // server payload
  const [skippedRows, setSkippedRows] = useState([]); // for GQ FSF CIBIL

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setMessage("");
    setError("");
    setUploadPercentage(0);
    setSummary(null);
    setSkippedRows([]);
  };

  function getApiEndpoint(type) {
    switch (type) {
      // case "Health Care": return `/loan-booking/hc-upload`;
      case "BL Loan":
        return `/loan-booking/bl-upload`;
      case "HEY EV Loan":
        return `/loan-booking/hey-ev-upload`;
        case "HeyEV Battery":
        return `/loan-booking/hey-ev-battery-upload`;
      case "EV Loan":
        return `/loan-booking/upload`;
      case "GQ FSF":
        return `/loan-booking/gq-fsf-upload`;
      case "GQ Non-FSF":
        return `/loan-booking/gq-non-fsf-upload`;
      case "Adikosh":
        return `/loan-booking/adikosh-upload`;
      case "Aldun":
        return `/loan-booking/aldun-upload`;
      case "Embifi":
        return `/loan-booking/upload-embifi`;
      case "CirclePE":
        return `/loan-booking/circle-pe-upload`;
      case "WCTL":
        return `/loan-booking/wctl-upload`;
      default:
        return "";
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return setError("⚠️ Please select a file to upload.");
    if (!uploadType) return setError("⚠️ Please select the type of loan.");

    setIsSubmitting(true);
    setMessage("");
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileName", fileName);
    formData.append("lenderType", uploadType);

    try {
      const res = await api.post(getApiEndpoint(uploadType), formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total)
            setUploadPercentage(Math.round((e.loaded * 100) / e.total));
        },
      });

      setMessage(`✅ ${res.data.message}`);
      setSummary(res.data);
      setSkippedRows(res.data.skippedDueToCIBIL || []);
    } catch (err) {
      const server = err?.response?.data;
      setError(`❌ ${server?.message || "Upload failed. Please try again."}`);
      setSummary(server || null); // show any row_errors we got
      setUploadPercentage(0);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="loan-booking-container">
      <h2>Upload Loan Booking Excel</h2>

      <form onSubmit={handleSubmit} className="upload-form">
        <label>File Name</label>
        <input
          type="text"
          placeholder="Enter file name"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          required
        />

        <label>Select Excel File</label>
        <input
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          required
        />

        <label>Loan Type</label>
        <select
          value={uploadType}
          onChange={(e) => setUploadType(e.target.value)}
          required
        >
          <option value="">Select Type</option>
          <option value="EV Loan">EV Loan</option>
          <option value="HEY EV Loan">HEY EV Loan</option>
          <option value="BL Loan">BL Loan</option>
          <option value="GQ FSF">GQ FSF</option>
          <option value="GQ Non-FSF">GQ Non-FSF</option>
          <option value="Adikosh">Adikosh</option>
          <option value="Embifi">Embifi</option>
          <option value="CirclePE">Circle PE</option>
          <option value="WCTL">WCTL</option>
          <option value="HeyEV Battery">Hey EV Battery</option>

        </select>

        <button type="submit" className="submit-btn" disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit"}
        </button>
      </form>

      {uploadPercentage > 0 && (
        <div className="progress-bar pretty">
          <div className="progress" style={{ width: `${uploadPercentage}%` }} />
          <span>{uploadPercentage}%</span>
        </div>
      )}

      {message && <p className="upload-message success">{message}</p>}
      {error && <p className="upload-message error">{error}</p>}

      {/* Summary (works for all routes) */}
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
                          <th>Stage</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.row_errors.map((e, i) => (
                          <tr key={`${e.row}-${e.stage}-${i}`}>
                            <td>{i + 1}</td>
                            <td className="mono">{e.row ?? "-"}</td>
                            <td>
                              <span className="stage-pill">
                                {e.stage ?? "-"}
                              </span>
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

          {/* GQ FSF specific info (skipped CIBIL) */}
          {skippedRows.length > 0 && (
            <div className="skipped-section">
              <h3>⚠️ Skipped Records (CIBIL)</h3>
              <table className="skipped-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>PAN</th>
                    <th>Aadhaar</th>
                    <th>CIBIL Score</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {skippedRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r["Customer Name"]}</td>
                      <td>{r["PAN Number"]}</td>
                      <td>{r["Aadhaar Number"]}</td>
                      <td>{r["Credit Score"] ?? r["CIBIL Score"]}</td>
                      <td>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

export default CreateLoanBooking;
