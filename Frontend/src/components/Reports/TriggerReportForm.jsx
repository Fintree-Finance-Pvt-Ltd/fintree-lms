// // import React, { useState } from "react";
// // import { useParams, useNavigate } from "react-router-dom";
// // import DatePicker from "react-datepicker";
// // import "react-datepicker/dist/react-datepicker.css";
// // import Select from "react-select";
// // import api from "../../api/api";
// // import "../../styles/TriggerReportForm.css"; // Import your CSS here

// // const TriggerReportForm = () => {
// //   const { reportId } = useParams();
// //   const navigate = useNavigate();

// //   const [startDate, setStartDate] = useState(null);
// //   const [endDate, setEndDate] = useState(null);
// //   const [product, setProduct] = useState(null);
// //   const [description, setDescription] = useState("");
// //   const [isSubmitting, setIsSubmitting] = useState(false);

// //   const productOptions = [
// //     { label: "EV Loan", value: "EV Loan" },
// //     { label: "Healthcare", value: "Healthcare" },
// //     { label: "BL Loan", value: "BL Loan" },
// //     { label: "GQ FSF", value: "GQ FSF" },
// //     { label: "GQ Non-FSF", value: "GQ Non-FSF" },
// //     { label: "Adikosh", value: "Adikosh" },

// //   ];

// //   const handleSubmit = async (e) => {
// //     e.preventDefault();

// //     if (!startDate || !endDate || !product) {
// //       alert("Please fill in all required fields.");
// //       return;
// //     }

// //     setIsSubmitting(true);

// //     const payload = {
// //       reportId,
// //       startDate: startDate.toISOString().split("T")[0],
// //       endDate: endDate.toISOString().split("T")[0],
// //       product: product.value,
// //       description,
// //     };
    

// //     try {
// //       const res = await api.post(`/reports/trigger`, payload);
// //       alert("✅ Report triggered successfully!");
// //       setStartDate(null);
// //       setEndDate(null);
// //       setProduct(null);
// //       setDescription("");
// //       navigate(`/mis-reports/listing`);
// //       setIsSubmitting(false);
// //     } catch (error) {
// //       console.error("Error triggering report:", error);
// //       alert("❌ Failed to trigger report.");
// //       setIsSubmitting(false);
// //     }
// //   };

// //   return (
// //     <div className="trigger-report-container">
// //       <h4 className="trigger-title">Run Report - {reportId}</h4>

// //       <form onSubmit={handleSubmit} className="trigger-form">
// //         <div className="form-row">
// //           <div className="form-group">
// //             <label className="form-label">* EMI Due Date Start Date</label>
// //             <DatePicker
// //               selected={startDate}
// //               onChange={(date) => setStartDate(date)}
// //               placeholderText="Select date"
// //               className="form-control"
// //               required
// //             />
// //           </div>

// //           <div className="form-group">
// //             <label className="form-label">* EMI Due Date End Date</label>
// //             <DatePicker
// //               selected={endDate}
// //               onChange={(date) => setEndDate(date)}
// //               placeholderText="Select date"
// //               className="form-control"
// //               required
// //             />
// //           </div>
// //         </div>

// //         <div className="form-group">
// //           <label className="form-label">* Product</label>
// //           <Select
// //             options={productOptions}
// //             value={product}
// //             onChange={setProduct}
// //             placeholder="Search For Choices"
// //           />
// //         </div>

// //         <div className="form-group">
// //           <label className="form-label">Description</label>
// //           <textarea
// //             className="form-control"
// //             placeholder="Add description for your report"
// //             value={description}
// //             onChange={(e) => setDescription(e.target.value)}
// //           />
// //         </div>

// //         <div className="submit-button-wrapper">
// //         <button type="submit" className="btn btn-danger" disabled={isSubmitting}>
// //   {isSubmitting ? "Triggering..." : "Trigger Report"}
// // </button>

// //         </div>
// //       </form>
// //     </div>
// //   );
// // };

// // export default TriggerReportForm;

// //////////////////////////////
// import React, { useState } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import DatePicker from "react-datepicker";
// import "react-datepicker/dist/react-datepicker.css";
// import Select from "react-select";
// import api from "../../api/api";
// import "../../styles/TriggerReportForm.css"; // Import your CSS here

// const TriggerReportForm = () => {
//   const { reportId } = useParams();
//   const navigate = useNavigate();

//   const [startDate, setStartDate] = useState(null);
//   const [endDate, setEndDate] = useState(null);
//   const [product, setProduct] = useState(null);
//   const [description, setDescription] = useState("");
//   const [isSubmitting, setIsSubmitting] = useState(false);

//   const productOptions = [
//     { label: "EV Loan", value: "EV Loan" },
//     { label: "Healthcare", value: "Healthcare" },
//     { label: "BL Loan", value: "BL Loan" },
//     { label: "WCTL-BL Loan", value: "WCTL" },
//     { label: "GQ FSF", value: "GQ FSF" },
//     { label: "GQ Non-FSF", value: "GQ Non-FSF" },
//     { label: "Adikosh", value: "Adikosh" },

//   ];

//   const handleSubmit = async (e) => {
//     e.preventDefault();

//     if (!startDate || !endDate || !product) {
//       alert("Please fill in all required fields.");
//       return;
//     }

//     setIsSubmitting(true);

//     const formatDate = (date) => {
//       const year = date.getFullYear();
//       const month = String(date.getMonth() + 1).padStart(2, "0");
//       const day = String(date.getDate()).padStart(2, "0");
//       return `${year}-${month}-${day}`;
//     };

//     const payload = {
//       reportId,
//       startDate: formatDate(startDate),
//       endDate: formatDate(endDate),
//       product: product.value,
//       description,
//     };
    

//     try {
//       const res = await api.post(`/reports/trigger`, payload);
//       alert("✅ Report triggered successfully!");
//       setStartDate(null);
//       setEndDate(null);
//       setProduct(null);
//       setDescription("");
//       navigate(`/mis-reports/listing`);
//       setIsSubmitting(false);
//     } catch (error) {
//       console.error("Error triggering report:", error);
//       alert("❌ Failed to trigger report.");
//       setIsSubmitting(false);
//     }
//   };

//   return (
//     <div className="trigger-report-container">
//       <h4 className="trigger-title">Run Report - {reportId}</h4>

//       <form onSubmit={handleSubmit} className="trigger-form">
//         <div className="form-row">
//           <div className="form-group">
//             <label className="form-label">* EMI Due Date Start Date</label>
//             <DatePicker
//               selected={startDate}
//               onChange={(date) => setStartDate(date)}
//               placeholderText="Select date"
//               className="form-control"
//               required
//             />
//           </div>

//           <div className="form-group">
//             <label className="form-label">* EMI Due Date End Date</label>
//             <DatePicker
//               selected={endDate}
//               onChange={(date) => setEndDate(date)}
//               placeholderText="Select date"
//               className="form-control"
//               required
//             />
//           </div>
//         </div>

//         <div className="form-group">
//           <label className="form-label">* Product</label>
//           <Select
//             options={productOptions}
//             value={product}
//             onChange={setProduct}
//             placeholder="Search For Choices"
//           />
//         </div>

//         <div className="form-group">
//           <label className="form-label">Description</label>
//           <textarea
//             className="form-control"
//             placeholder="Add description for your report"
//             value={description}
//             onChange={(e) => setDescription(e.target.value)}
//           />
//         </div>

//         <div className="submit-button-wrapper">
//         <button type="submit" className="btn btn-danger" disabled={isSubmitting}>
//   {isSubmitting ? "Triggering..." : "Trigger Report"}
// </button>

//         </div>
//       </form>
//     </div>
//   );
// };

// export default TriggerReportForm;

///////////////////////////////////////////// NEW CODE Below /////////////////////////////
import React, { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Select from "react-select";
import api from "../../api/api";
import "../../styles/TriggerReportForm.css";

const productOptions = [
  { label: "EV Loan", value: "EV Loan" },
  { label: "Healthcare", value: "Healthcare" },
  { label: "BL Loan", value: "BL Loan" },
  { label: "WCTL-BL Loan", value: "WCTL" },
  { label: "GQ FSF", value: "GQ FSF" },
  { label: "GQ Non-FSF", value: "GQ Non-FSF" },
  { label: "Adikosh", value: "Adikosh" },
  { label: "CCOD", value: "CC-OD" },
  { label: "Embifi", value: "Embifi" },
  { lable: "EMI CLUB", value: "EMICLUB"}
];

const formatDate = (date) => {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const TriggerReportForm = () => {
  const { reportId } = useParams();
  const navigate = useNavigate();

  // form state
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [product, setProduct] = useState(null);
  const [description, setDescription] = useState("");
  const [lan, setLan] = useState("");
  const [outputFormat, setOutputFormat] = useState("excel");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // treat this route as the single-LAN CAM print (PDF) report
  const isCamPrint = useMemo(
    () => (reportId || "").toLowerCase() === "adikosh-cam-report-print",
    [reportId]
  );

  useEffect(() => {
    if (isCamPrint) setOutputFormat("pdf");
  }, [isCamPrint]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate by mode
    if (isCamPrint) {
      if (!lan.trim()) {
        alert("Please enter LAN for CAM print.");
        return;
      }
      if (!product) {
        alert("Please select Product (e.g., Adikosh).");
        return;
      }
    } else {
      if (!startDate || !endDate || !product) {
        alert("Please fill in Start Date, End Date, and Product.");
        return;
      }
      if (endDate < startDate) {
        alert("End Date cannot be earlier than Start Date.");
        return;
      }
    }

    setIsSubmitting(true);

    const payload = {
      reportId,
      product: product?.value,
      description,
      outputFormat, // "excel" | "pdf"
    };

    if (isCamPrint) {
      payload.lan = lan.trim();
    } else {
      payload.startDate = formatDate(startDate);
      payload.endDate = formatDate(endDate);
    }

    try {
      const res = await api.post(`/reports/trigger`, payload);
      alert(`✅ Report triggered: ${res.data?.fileName || "success"}`);

      // reset
      setStartDate(null);
      setEndDate(null);
      setProduct(null);
      setDescription("");
      setLan("");

      navigate(`/mis-reports/listing`);
    } catch (error) {
      console.error("Error triggering report:", error);
      const status = error?.response?.status;
      const data = error?.response?.data;
      const msg =
        (data && (data.error || data.message)) ||
        error?.message ||
        "Failed to trigger report.";
      alert(`❌ ${msg}${status ? ` [${status}]` : ""}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="trigger-report-container">
      <h4 className="trigger-title">Run Report - {reportId}</h4>

      <form onSubmit={handleSubmit} className="trigger-form">
        {!isCamPrint && (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">* EMI Due Date Start Date</label>
              <DatePicker
                selected={startDate}
                onChange={(date) => setStartDate(date)}
                placeholderText="Select date"
                className="form-control"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">* EMI Due Date End Date</label>
              <DatePicker
                selected={endDate}
                onChange={(date) => setEndDate(date)}
                placeholderText="Select date"
                className="form-control"
                required
                minDate={startDate || undefined}
              />
            </div>
          </div>
        )}

        {isCamPrint && (
          <div className="form-group">
            <label className="form-label">* LAN (single applicant)</label>
            <input
              className="form-control"
              value={lan}
              onChange={(e) => setLan(e.target.value)}
              placeholder="e.g., ADKF111001"
              required
            />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">* Product</label>
          <Select
            options={productOptions}
            value={product}
            onChange={(opt) => setProduct(opt)}
            isClearable
            placeholder="Search For Choices"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Output Format</label>
          <select
            className="form-control"
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value)}
            disabled={isCamPrint} // print is always PDF
          >
            <option value="excel">Excel (.xlsx)</option>
            <option value="pdf">PDF (.pdf)</option>
          </select>
          {isCamPrint && (
            <small style={{ color: "#666" }}>CAM Print always generates PDF.</small>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea
            className="form-control"
            placeholder="Add description for your report"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="submit-button-wrapper">
          <button type="submit" className="btn btn-danger" disabled={isSubmitting}>
            {isSubmitting ? "Triggering..." : "Trigger Report"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TriggerReportForm;
