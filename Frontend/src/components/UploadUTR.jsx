// import React, { useState } from "react";
// import api from "../api/api";
// import "../styles/UploadUTR.css";

// const UploadUTR = () => {
//   const [file, setFile] = useState(null);
//   const [message, setMessage] = useState("");
//   const [isError, setIsError] = useState(false);
//   const [uploadPercentage, setUploadPercentage] = useState(0);
//   const [isSubmitting, setIsSubmitting] = useState(false);

//   const handleFileChange = (event) => {
//     setFile(event.target.files[0]);
//     setMessage("");
//     setIsError(false);
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
//       const response = await api.post(
//         `/loan-booking/upload-utr`,
//         formData,
//         {
//           headers: { "Content-Type": "multipart/form-data" },
//           onUploadProgress: (progressEvent) => {
//             const percent = Math.round(
//               (progressEvent.loaded * 100) / progressEvent.total
//             );
//             setUploadPercentage(percent);
//           },
//         }
//       );

//       setMessage(`✅ ${response.data.message}`);
//       setIsError(false);
//     } catch (error) {
//       setMessage("❌ Error uploading file.");
//       setIsError(true);
//       setUploadPercentage(0);
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   return (
//     <div className="utr-upload-container">
//       <h2>Upload Loan Booking - Disbursement UTRs</h2>
//       <input type="file" onChange={handleFileChange} accept=".xlsx,.csv" />

//       <button onClick={handleUpload} disabled={isSubmitting}>
//         {isSubmitting ? "Uploading..." : "Upload"}
//       </button>

//       {uploadPercentage > 0 && (
//         <div className="progress-bar">
//           <div
//             className="progress"
//             style={{ width: `${uploadPercentage}%` }}
//           ></div>
//           <span>{uploadPercentage}%</span>
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
import "../styles/UploadUTR.css"; // If you're using your own styles

const UploadUTR = () => {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [uploadPercentage, setUploadPercentage] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setMessage("");
    setIsError(false);
    setUploadPercentage(0);
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
          const percent = Math.round((event.loaded * 100) / event.total);
          setUploadPercentage(percent);
        },
      });

      setMessage(`✅ ${response.data.message}`);
      setIsError(false);
    } catch (err) {
      const serverMsg = err?.response?.data?.message || "Error uploading file.";
      setMessage(`❌ ${serverMsg}`);
      setIsError(true);
      setUploadPercentage(0);
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

      <button
        className="upload-button"
        onClick={handleUpload}
        disabled={isSubmitting}
      >
        {isSubmitting ? "Uploading..." : "Upload"}
      </button>

      {uploadPercentage > 0 && (
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${uploadPercentage}%` }}
          />
          <span className="progress-text">{uploadPercentage}%</span>
        </div>
      )}

      {message && (
        <p className={`upload-message ${isError ? "error" : "success"}`}>
          {message}
        </p>
      )}
    </div>
  );
};

export default UploadUTR;
