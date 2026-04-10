// import React, { useState, useEffect } from "react";
// import api from "../../api/api";

// const SupplyChainInvoiceEntry = () => {
//   const [formData, setFormData] = useState({
//     partner_loan_id: "",
//     lan: "",
//     roi_percentage: "",
//     supplier_name: "",
//     bank_account_number: "",
//     ifsc_code: "",
//     bank_name: "",
//     account_holder_name: "",
//     invoice_number: "",
//     invoice_date: "",
//     invoice_amount: "",
//     tenure_days: 90,

//     disbursement_amount: "",
//     disbursement_date: "",
//     invoice_due_date: "",

//     total_roi_amount: "",
//     emi_amount: "",

//     disbursement_utr: "",
//   });

//   const [lanList, setLanList] = useState([]);
//   const [message, setMessage] = useState("");
//   const [messageType, setMessageType] = useState("info");
//   const [errors, setErrors] = useState({});
//   const [loading, setLoading] = useState(false);
//   const [suppliers, setSuppliers] = useState([]);
//   const [selectedSupplier, setSelectedSupplier] = useState("");

//   /* ---------------- FETCH CUSTOMER LANs ---------------- */

// //   useEffect(() => {
// //     if (
// //       !formData.invoice_date ||
// //       !formData.disbursement_amount ||
// //       !formData.roi_percentage
// //     )
// //       return;

// //     const invoiceDate = new Date(formData.invoice_date);

// //     const dueDate = new Date(invoiceDate);
// //     dueDate.setDate(dueDate.getDate() + 90);

// //     const formattedDueDate = dueDate.toISOString().split("T")[0];

// //     const roiAmount =
// //       (Number(formData.disbursement_amount) *
// //         Number(formData.roi_percentage) *
// //         90) /
// //       365;

// //     const emiAmount = Number(formData.disbursement_amount) + roiAmount;

// //     setFormData((prev) => ({
// //       ...prev,
// //       invoice_due_date: formattedDueDate,
// //       total_roi_amount: roiAmount.toFixed(2),
// //       emi_amount: emiAmount.toFixed(2),
// //     }));
// //   }, [
// //     formData.invoice_date,
// //     formData.disbursement_amount,
// //     formData.roi_percentage,
// //   ]);

// useEffect(() => {
//   const disbAmount = Number(formData.disbursement_amount);
//   const roiPercent = Number(formData.roi_percentage);
//   const tenureDays = Number(formData.tenure_days || 90);

//   if (
//     !formData.disbursement_date ||
//     !disbAmount ||
//     !roiPercent ||
//     !tenureDays
//   ) {
//     setFormData((prev) => ({
//       ...prev,
//       invoice_due_date: "",
//       total_roi_amount: "",
//       emi_amount: "",
//     }));
//     return;
//   }
//   // ✅ FIX: timezone-safe parsing
//   const [year, month, day] =
//     formData.disbursement_date.split("-").map(Number);

//   const disbDate = new Date(year, month - 1, day);
//   if (isNaN(disbDate.getTime())) return;

//   const dueDate = new Date(disbDate);
//   dueDate.setDate(dueDate.getDate() + tenureDays);

//   const yyyy = dueDate.getFullYear();
//   const mm = String(dueDate.getMonth() + 1).padStart(2, "0");
//   const dd = String(dueDate.getDate()).padStart(2, "0");
//   const formattedDueDate = `${yyyy}-${mm}-${dd}`;

//   // ROI = amount * (roi/100) * days / 365
//   const roiAmount = (disbAmount * (roiPercent / 100) * tenureDays) / 365;
//   const emiAmount = disbAmount + roiAmount;

//   setFormData((prev) => ({
//     ...prev,
//     invoice_due_date: formattedDueDate,
//     total_roi_amount: roiAmount.toFixed(5),
//     emi_amount: emiAmount.toFixed(3),
//   }));
// }, [
//   formData.disbursement_date,
//   formData.disbursement_amount,
//   formData.roi_percentage,
//   formData.tenure_days,
// ]);

//   const fetchCustomerDetails = async () => {
//     if (!formData.partner_loan_id) {
//       setMessage("❌ Enter Partner Loan ID first");
//       return;
//     }

//     setLoading(true);
//     setMessage("");

//     try {
//       const res = await api.get(
//         `supply-chain/customers-lan/${formData.partner_loan_id}`,
//       );

//       if (!res.data) {
//         setMessage("❌ No LAN found for this Partner Loan ID");
//         return;
//       }

//       setLanList(Array.isArray(res.data) ? res.data : [res.data]);

//       setMessage("✅ LANs fetched successfully");
//     } catch (err) {
//       setMessage(
//         err.response?.data?.message || "❌ Failed to fetch LAN details",
//       );
//     } finally {
//       setLoading(false);
//     }
//   };

//   /* ---------------- HANDLE CHANGE ---------------- */

//   const handleChange = (e) => {
//     const { name, value } = e.target;

//     setFormData((prev) => ({
//       ...prev,
//       [name]: value,
//     }));
//   };

//   /* ---------------- HANDLE LAN SELECT ---------------- */

//   const handleLanSelect = async (e) => {
//     const selectedLan = e.target.value;

//     const selectedRecord = lanList.find((item) => item.lan === selectedLan);

//     setFormData((prev) => ({
//       ...prev,
//       lan: selectedLan,
//       roi_percentage: selectedRecord?.interest_rate || "",
//     }));

//     try {
//       const res = await api.get(
//         `supply-chain/customers/${formData.partner_loan_id}/suppliers`,
//       );

//       setSuppliers(res.data || []);
//     } catch (err) {
//       setMessage("❌ Failed to fetch suppliers");
//     }
//   };

//   const handleSupplierSelect = (e) => {
//     const accountNumber = e.target.value;

//     const supplier = suppliers.find((s) => s.bank_account_number === accountNumber);

//     if (!supplier) return;

//     setFormData((prev) => ({
//       ...prev,
//     supplier_name: supplier.supplier_name,
//     bank_account_number: supplier.bank_account_number,
//     ifsc_code: supplier.ifsc_code,
//     bank_name: supplier.bank_name,
//     account_holder_name: supplier.account_holder_name,
//     }));
//   };

//   const handleSubmit = async (e) => {
//   e.preventDefault();

//   setMessage("");

//   if (!validateForm()) {
//     setMessage("❌ Please fix highlighted fields");
//     return;
//   }

//   setLoading(true);

//   try {
//     const payload = [
//       {
//         partner_loan_id: formData.partner_loan_id,
//         lan: formData.lan,

//         invoice_number: formData.invoice_number,
//         invoice_date: formData.invoice_date,
//         invoice_amount: Number(formData.invoice_amount),

//         tenure_days: 90,

//         supplier_name: formData.supplier_name,

//         supplier_bank_details: {
//           bank_account_number:
//             formData.bank_account_number,
//           ifsc_code: formData.ifsc_code,
//           bank_name: formData.bank_name,
//           account_holder_name:
//             formData.account_holder_name,
//         },

//         disbursement_amount: Number(
//           formData.disbursement_amount
//         ),

//         disbursement_date:
//           formData.disbursement_date,

//         invoice_due_date: formData.invoice_due_date,

//         disbursement_utr:
//           formData.disbursement_utr,

//         roi_percentage:
//           Number(formData.roi_percentage),

//         total_roi_amount:
//           Number(formData.total_roi_amount),

//         emi_amount:
//           Number(formData.emi_amount),
//       },
//     ];

//     const res = await api.post(
//       "loan-booking/v1/invoice-disbursement/validate",
//       payload
//     );

//     const results = res.data.results || [];

//     const failed = results.filter(r => r.status === "failed");
//     const success = results.filter(r => r.status === "success");

//      /* ---------- HANDLE FAILED CASE ---------- */

//     if (failed.length > 0 && success.length === 0) {
//         setMessageType("error");
//       setMessage(
//         `❌ ${failed
//           .map(f => `${f.invoice_number}: ${f.message}`)
//           .join(", ")}`
//       );
//       return;
//     }

//     /* ---------- HANDLE PARTIAL SUCCESS ---------- */

//     if (failed.length > 0 && success.length > 0) {
//         setMessageType("warning");
//       setMessage(
//         `⚠️ ${success.length} success, ${failed.length} failed → ` +
//         failed.map(f => `${f.invoice_number}: ${f.message}`).join(", ")
//       );
//     }

//     /* ---------- HANDLE FULL SUCCESS ---------- */

//     if (success.length > 0 && failed.length === 0) {
//         setMessageType("success");
//       setMessage(`✅ ${success.length} invoice uploaded successfully`);
//     }


// /* RESET ONLY INVOICE FIELDS */

// setFormData((prev) => ({
//   ...prev,
//   invoice_number: "",
//   invoice_date: "",
//   invoice_amount: "",
//   disbursement_amount: "",
//   disbursement_date: "",
//   invoice_due_date: "",
//   total_roi_amount: "",
//   emi_amount: "",
//   disbursement_utr: "",
// }));

//   } catch (err) {
//     setMessageType("error");
//     setMessage(
//       err.response?.data?.message ||
//         "❌ Invoice submission failed"
//     );
//   } finally {
//     setLoading(false);
//   }
// };

//   const requiredFields = [
//   "partner_loan_id",
//   "lan",
//   "supplier_name",
//   "invoice_number",
//   "invoice_date",
//   "invoice_amount",
//   "disbursement_amount",
//   "disbursement_date",
//   "disbursement_utr",
// ];


// const validateForm = () => {
//   const newErrors = {};

//   requiredFields.forEach((field) => {
//     if (!formData[field]) {
//       newErrors[field] = "This field is required";
//     }
//   });

//   if (
//     Number(formData.disbursement_amount) >
//     Number(formData.invoice_amount)
//   ) {
//     newErrors.disbursement_amount =
//       "Cannot exceed invoice amount";
//   }

//   setErrors(newErrors);

//   return Object.keys(newErrors).length === 0;
// };

//   /* ---------------- RENDER INPUT ---------------- */

//   const renderInput = (label, name, type = "text", extra = {}) => (
//     <div className="form-group">
//       <label>{label}</label>

//       <input
//         type={type}
//         name={name}
//         value={formData[name]}
//         onChange={handleChange}
//         {...extra}
//       />
//     </div>
//   );

//   /* ---------------- RENDER SELECT ---------------- */

//   const renderSelect = (label, name, options) => (
//     <div className="form-group">
//       <label>{label}</label>

//       <select name={name} value={formData[name]} onChange={handleLanSelect}>
//         <option value="">-- Select LAN --</option>

//         {options.map((item) => (
//           <option key={item.lan} value={item.lan}>
//             {item.lender} — {item.lan}
//           </option>
//         ))}
//       </select>
//     </div>
//   );

//   return (
//     <div className="manual-entry-container">
//       <h2>Supply Chain Invoice Disbursement</h2>

//       <fieldset>
//         <legend>Partner Loan Selection</legend>

//         {renderInput("Partner Loan ID", "partner_loan_id")}

//         <button type="button" onClick={fetchCustomerDetails} disabled={loading}>
//           {loading ? "Fetching..." : "Fetch LAN"}
//         </button>

//         {lanList.length > 0 && renderSelect("Select LAN", "lan", lanList)}

//         {formData.roi_percentage && (
//           <div className="form-group">
//             <label>ROI (%)</label>

//             <input type="number" value={formData.roi_percentage} readOnly />
//           </div>
//         )}
//       </fieldset>

//       {suppliers.length > 0 && (
//         <fieldset>
//           <legend>Supplier Selection</legend>

//           <div className="form-group">
//             <label>Select Supplier</label>

//             <select
//               value={formData.bank_account_number}
//               onChange={handleSupplierSelect}
//             >
//               <option value="">-- Select Supplier --</option>

//               {suppliers.map((s) => (
//                 <option key={s.bank_account_number} value={s.bank_account_number}>
//                   {s.supplier_name} — {s.bank_account_number}
//                 </option>
//               ))}
//             </select>
//           </div>

//           <div className="form-group">
//             <label>Bank Account Number</label>
//             <input value={formData.bank_account_number} readOnly />
//           </div>

//           <div className="form-group">
//             <label>IFSC Code</label>
//             <input value={formData.ifsc_code} readOnly />
//           </div>

//           <div className="form-group">
//             <label>Bank Name</label>
//             <input value={formData.bank_name} readOnly />
//           </div>

//           <div className="form-group">
//             <label>Account Holder Name</label>
//             <input value={formData.account_holder_name} readOnly />
//           </div>
//         </fieldset>
//       )}

//       {formData.supplier_name && (
//         <fieldset>
//           <legend>Invoice Details</legend>

//           {renderInput("Invoice Number", "invoice_number")}

//           {renderInput("Invoice Date", "invoice_date", "date")}

//           {renderInput("Invoice Amount", "invoice_amount", "number")}

//           {renderInput("Tenure Days", "tenure_days", "number", {
//             readOnly: true,
//           })}

//           {renderInput("Disbursement Amount", "disbursement_amount", "number")}

//           {renderInput("Disbursement Date", "disbursement_date", "date")}

//           {renderInput("Invoice Due Date", "invoice_due_date", "date", {
//             readOnly: true,
//           })}

//           {renderInput("Total ROI Amount", "total_roi_amount", "number", {
//             readOnly: true,
//           })}

//           {renderInput("EMI Amount", "emi_amount", "number", {
//             readOnly: true,
//           })}

//           {renderInput("Disbursement UTR", "disbursement_utr")}

//           <button
//   type="button"
//   onClick={handleSubmit}
//   disabled={loading}
// >
//   {loading ? "Submitting..." : "Submit Invoice"}
// </button>
//         </fieldset>

        
//       )}

//       {message && (
//   <div className={`message ${messageType}`}>
//     {message}
//   </div>
// )}

//       {/* Same styling as your Helium screen */}
//       <style>{`
//         .manual-entry-container {
//           max-width: 900px;
//           margin: 2rem auto;
//           background: #fafafa;
//           padding: 2rem;
//           border-radius: 10px;
//           box-shadow: 0 0 10px rgba(0,0,0,0.1);
//         }

//         fieldset {
//           border: 1px solid #ddd;
//           border-radius: 8px;
//           padding: 1rem 1.5rem;
//           margin-bottom: 1.5rem;
//         }

//         legend {
//           padding: 0 10px;
//           font-weight: bold;
//         }

//         .form-group {
//           display: flex;
//           flex-direction: column;
//           margin-bottom: 0.8rem;
//         }

//         label {
//           font-weight: 600;
//           margin-bottom: 4px;
//         }

//         input, select {
//           padding: 8px;
//           border: 1px solid #ccc;
//           border-radius: 4px;
//         }

//         button {
//           background-color: #007bff;
//           color: white;
//           border: none;
//           padding: 10px 20px;
//           font-size: 16px;
//           cursor: pointer;
//           border-radius: 6px;
//           margin-top: 10px;
//         }

//         .message {
//   margin-top: 1rem;
//   padding: 0.9rem;
//   border-radius: 6px;
//   font-weight: 600;
//   text-align: center;
// }

// .message.success {
//   background: #e6f9ed;
//   color: #1b7f3a;
//   border: 1px solid #b7ebc6;
// }

// .message.error {
//   background: #fdecea;
//   color: #b42318;
//   border: 1px solid #f5c2c0;
// }

// .message.warning {
//   background: #fff4e5;
//   color: #b26a00;
//   border: 1px solid #ffd8a8;
// }

// .message.info {
//   background: #eef6ff;
//   color: #1e60c2;
//   border: 1px solid #c7ddff;
// }
//       `}</style>
//     </div>
//   );
// };

// export default SupplyChainInvoiceEntry;

import React, { useState, useEffect } from "react";
import api from "../../api/api";
 
const SupplyChainInvoiceEntry = () => {
  const [formData, setFormData] = useState({
    partner_loan_id: "",
    lan: "",
    roi_percentage: "",
    supplier_name: "",
    bank_account_number: "",
    ifsc_code: "",
    bank_name: "",
    account_holder_name: "",
    invoice_number: "",
    invoice_date: "",
    invoice_amount: "",
    tenure_days: 90,
 
    disbursement_amount: "",
    disbursement_date: "",
    invoice_due_date: "",
 
    total_roi_amount: "",
    emi_amount: "",
 
    disbursement_utr: "",
  });
 
  const [lanList, setLanList] = useState([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
 
  /* ---------------- FETCH CUSTOMER LANs ---------------- */
 
//   useEffect(() => {
//     if (
//       !formData.invoice_date ||
//       !formData.disbursement_amount ||
//       !formData.roi_percentage
//     )
//       return;
 
//     const invoiceDate = new Date(formData.invoice_date);
 
//     const dueDate = new Date(invoiceDate);
//     dueDate.setDate(dueDate.getDate() + 90);
 
//     const formattedDueDate = dueDate.toISOString().split("T")[0];
 
//     const roiAmount =
//       (Number(formData.disbursement_amount) *
//         Number(formData.roi_percentage) *
//         90) /
//       365;
 
//     const emiAmount = Number(formData.disbursement_amount) + roiAmount;
 
//     setFormData((prev) => ({
//       ...prev,
//       invoice_due_date: formattedDueDate,
//       total_roi_amount: roiAmount.toFixed(2),
//       emi_amount: emiAmount.toFixed(2),
//     }));
//   }, [
//     formData.invoice_date,
//     formData.disbursement_amount,
//     formData.roi_percentage,
//   ]);
 
useEffect(() => {
  const disbAmount = Number(formData.disbursement_amount);
  const roiPercent = Number(formData.roi_percentage);
  const tenureDays = Number(formData.tenure_days || 90);
 
  if (
    !formData.disbursement_date ||
    !disbAmount ||
    !roiPercent ||
    !tenureDays
  ) {
    setFormData((prev) => ({
      ...prev,
      invoice_due_date: "",
      total_roi_amount: "",
      emi_amount: "",
    }));
    return;
  }
  // ✅ FIX: timezone-safe parsing
  const [year, month, day] =
    formData.disbursement_date.split("-").map(Number);
 
  const disbDate = new Date(year, month - 1, day);
  if (isNaN(disbDate.getTime())) return;
 
  const dueDate = new Date(disbDate);
  dueDate.setDate(dueDate.getDate() + tenureDays);
 
  const yyyy = dueDate.getFullYear();
  const mm = String(dueDate.getMonth() + 1).padStart(2, "0");
  const dd = String(dueDate.getDate()).padStart(2, "0");
  const formattedDueDate = `${yyyy}-${mm}-${dd}`;
 
  // ROI = amount * (roi/100) * days / 365
  const roiAmount = (disbAmount * (roiPercent / 100) * tenureDays) / 365;
  const emiAmount = disbAmount + roiAmount;
 
  setFormData((prev) => ({
    ...prev,
    invoice_due_date: formattedDueDate,
    total_roi_amount: roiAmount.toFixed(5),
    emi_amount: emiAmount.toFixed(3),
  }));
}, [
  formData.disbursement_date,
  formData.disbursement_amount,
  formData.roi_percentage,
  formData.tenure_days,
]);
 
  const fetchCustomerDetails = async () => {
    if (!formData.partner_loan_id) {
      setMessage("❌ Enter Partner Loan ID first");
      return;
    }
 
    setLoading(true);
    setMessage("");
 
    try {
      const res = await api.get(
        `supply-chain/customers-lan/${formData.partner_loan_id}`,
      );
 
      if (!res.data) {
        setMessage("❌ No LAN found for this Partner Loan ID");
        return;
      }
 
      setLanList(Array.isArray(res.data) ? res.data : [res.data]);
 
      setMessage("✅ LANs fetched successfully");
    } catch (err) {
      setMessage(
        err.response?.data?.message || "❌ Failed to fetch LAN details",
      );
    } finally {
      setLoading(false);
    }
  };
 
  /* ---------------- HANDLE CHANGE ---------------- */
 
  const handleChange = (e) => {
    const { name, value } = e.target;
 
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };
 
  /* ---------------- HANDLE LAN SELECT ---------------- */
 
  const handleLanSelect = async (e) => {
    const selectedLan = e.target.value;
 
    const selectedRecord = lanList.find((item) => item.lan === selectedLan);
 
    setFormData((prev) => ({
      ...prev,
      lan: selectedLan,
      roi_percentage: selectedRecord?.interest_rate || "",
    }));
 
    try {
      const res = await api.get(
        `supply-chain/customers/${formData.partner_loan_id}/suppliers`,
      );
 
      setSuppliers(res.data || []);
    } catch (err) {
      setMessage("❌ Failed to fetch suppliers");
    }
  };
 
  const handleSupplierSelect = (e) => {
    const accountNumber = e.target.value;
 
    const supplier = suppliers.find((s) => s.bank_account_number === accountNumber);
 
    if (!supplier) return;
 
    setFormData((prev) => ({
      ...prev,
    supplier_name: supplier.supplier_name,
    bank_account_number: supplier.bank_account_number,
    ifsc_code: supplier.ifsc_code,
    bank_name: supplier.bank_name,
    account_holder_name: supplier.account_holder_name,
    }));
  };
 
  const handleSubmit = async (e) => {
  e.preventDefault();
 
  setMessage("");
 
  if (!validateForm()) {
    setMessage("❌ Please fix highlighted fields");
    return;
  }
 
  setLoading(true);
 
  try {
    const payload = [
      {
        partner_loan_id: formData.partner_loan_id,
        lan: formData.lan,
 
        invoice_number: formData.invoice_number,
        invoice_date: formData.invoice_date,
        invoice_amount: Number(formData.invoice_amount),
 
        tenure_days: 90,
 
        supplier_name: formData.supplier_name,
 
        supplier_bank_details: {
          bank_account_number:
            formData.bank_account_number,
          ifsc_code: formData.ifsc_code,
          bank_name: formData.bank_name,
          account_holder_name:
            formData.account_holder_name,
        },
 
        disbursement_amount: Number(
          formData.disbursement_amount
        ),
 
        disbursement_date:
          formData.disbursement_date,
 
        invoice_due_date: formData.invoice_due_date,
 
        disbursement_utr:
          formData.disbursement_utr,
 
        roi_percentage:
          Number(formData.roi_percentage),
 
        total_roi_amount:
          Number(formData.total_roi_amount),
 
        emi_amount:
          Number(formData.emi_amount),
      },
    ];
 
    const res = await api.post(
      "loan-booking/v1/invoice-disbursement/validate",
      payload
    );
 
    const results = res.data.results || [];
 
    const failed = results.filter(r => r.status === "failed");
    const success = results.filter(r => r.status === "success");
 
     /* ---------- HANDLE FAILED CASE ---------- */
 
    if (failed.length > 0 && success.length === 0) {
        setMessageType("error");
      setMessage(
        `❌ ${failed
          .map(f => `${f.invoice_number}: ${f.message}`)
          .join(", ")}`
      );
      return;
    }
 
    /* ---------- HANDLE PARTIAL SUCCESS ---------- */
 
    if (failed.length > 0 && success.length > 0) {
        setMessageType("warning");
      setMessage(
        `⚠️ ${success.length} success, ${failed.length} failed → ` +
        failed.map(f => `${f.invoice_number}: ${f.message}`).join(", ")
      );
    }
 
    /* ---------- HANDLE FULL SUCCESS ---------- */
 
    if (success.length > 0 && failed.length === 0) {
        setMessageType("success");
      setMessage(`✅ ${success.length} invoice uploaded successfully`);
    }
 
 
/* RESET ONLY INVOICE FIELDS */
 
setFormData((prev) => ({
  ...prev,
  invoice_number: "",
  invoice_date: "",
  invoice_amount: "",
  disbursement_amount: "",
  disbursement_date: "",
  invoice_due_date: "",
  total_roi_amount: "",
  emi_amount: "",
  disbursement_utr: "",
}));
 
  } catch (err) {
    setMessageType("error");
    setMessage(
      err.response?.data?.message ||
        "❌ Invoice submission failed"
    );
  } finally {
    setLoading(false);
  }
};
 
  const requiredFields = [
  "partner_loan_id",
  "lan",
  "supplier_name",
  "invoice_number",
  "invoice_date",
  "invoice_amount",
  "disbursement_amount",
  "disbursement_date",
  "disbursement_utr",
];
 
 
const validateForm = () => {
  const newErrors = {};
 
  requiredFields.forEach((field) => {
    if (!formData[field]) {
      newErrors[field] = "This field is required";
    }
  });
 
  if (
    Number(formData.disbursement_amount) >
    Number(formData.invoice_amount)
  ) {
    newErrors.disbursement_amount =
      "Cannot exceed invoice amount";
  }
 
  setErrors(newErrors);
 
  return Object.keys(newErrors).length === 0;
};
 
  /* ---------------- RENDER INPUT ---------------- */
 
  const renderInput = (label, name, type = "text", extra = {}) => (
    <div className="form-group">
      <label>{label}</label>
 
      <input
        type={type}
        name={name}
        value={formData[name]}
        onChange={handleChange}
        {...extra}
      />
    </div>
  );
 
  /* ---------------- RENDER SELECT ---------------- */
 
  const renderSelect = (label, name, options) => (
    <div className="form-group">
      <label>{label}</label>
 
      <select name={name} value={formData[name]} onChange={handleLanSelect}>
        <option value="">-- Select LAN --</option>
 
        {options.map((item) => (
          <option key={item.lan} value={item.lan}>
            {item.lender} — {item.lan}
          </option>
        ))}
      </select>
    </div>
  );
 
  return (
    <div className="manual-entry-container">
      <h2>Supply Chain Invoice Disbursement</h2>
 
      <fieldset>
        <legend>Partner Loan Selection</legend>
 
        {renderInput("Partner Loan ID", "partner_loan_id")}
 
        <button type="button" onClick={fetchCustomerDetails} disabled={loading}>
          {loading ? "Fetching..." : "Fetch LAN"}
        </button>
 
        {lanList.length > 0 && renderSelect("Select LAN", "lan", lanList)}
 
        {formData.roi_percentage && (
          <div className="form-group">
            <label>ROI (%)</label>
 
            <input type="number" value={formData.roi_percentage} readOnly />
          </div>
        )}
      </fieldset>
 
      {suppliers.length > 0 && (
        <fieldset>
          <legend>Supplier Selection</legend>
 
          <div className="form-group">
            <label>Select Supplier</label>
 
            <select
              value={formData.bank_account_number}
              onChange={handleSupplierSelect}
            >
              <option value="">-- Select Supplier --</option>
 
              {suppliers.map((s) => (
                <option key={s.bank_account_number} value={s.bank_account_number}>
                  {s.supplier_name} — {s.bank_account_number}
                </option>
              ))}
            </select>
          </div>
 
          <div className="form-group">
            <label>Bank Account Number</label>
            <input value={formData.bank_account_number} readOnly />
          </div>
 
          <div className="form-group">
            <label>IFSC Code</label>
            <input value={formData.ifsc_code} readOnly />
          </div>
 
          <div className="form-group">
            <label>Bank Name</label>
            <input value={formData.bank_name} readOnly />
          </div>
 
          <div className="form-group">
            <label>Account Holder Name</label>
            <input value={formData.account_holder_name} readOnly />
          </div>
        </fieldset>
      )}
 
      {formData.supplier_name && (
        <fieldset>
          <legend>Invoice Details</legend>
 
          {renderInput("Invoice Number", "invoice_number")}
 
          {renderInput("Invoice Date", "invoice_date", "date")}
 
          {renderInput("Invoice Amount", "invoice_amount", "number")}
 
          {renderInput("Tenure Days", "tenure_days", "number", {
            readOnly: true,
          })}
 
          {renderInput("Disbursement Amount", "disbursement_amount", "number")}
 
          {renderInput("Disbursement Date", "disbursement_date", "date")}
 
          {renderInput("Invoice Due Date", "invoice_due_date", "date", {
            readOnly: true,
          })}
 
          {renderInput("Total ROI Amount", "total_roi_amount", "number", {
            readOnly: true,
          })}
 
          {renderInput("EMI Amount", "emi_amount", "number", {
            readOnly: true,
          })}
 
          {renderInput("Disbursement UTR", "disbursement_utr")}
 
          <button
  type="button"
  onClick={handleSubmit}
  disabled={loading}
>
  {loading ? "Submitting..." : "Submit Invoice"}
</button>
        </fieldset>
 
       
      )}
 
      {message && (
  <div className={`message ${messageType}`}>
    {message}
  </div>
)}
<style>{`
/* ============================================================
   🚀 FINTREE — PREMIUM FORM UI
============================================================ */
 
.manual-entry-container {
  max-width: 950px;
  margin: 40px auto;
  padding: 30px;
 
  border-radius: 20px;
  background: rgba(255,255,255,0.8);
 
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
 
  border: 1px solid rgba(0,0,0,0.06);
  box-shadow: 0 20px 50px rgba(0,0,0,0.08);
 
  animation: fadeIn 0.5s ease;
}
 
/* Title */
.manual-entry-container h2 {
  font-size: 26px;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 20px;
}
 
/* ============================================================
   📦 CARD SECTIONS (Replace fieldset look)
============================================================ */
fieldset {
  border: none;
  padding: 20px;
  margin-bottom: 20px;
 
  border-radius: 16px;
  background: rgba(255,255,255,0.9);
 
  box-shadow: 0 8px 25px rgba(0,0,0,0.05);
  transition: 0.3s ease;
}
 
fieldset:hover {
  transform: translateY(-2px);
  box-shadow: 0 15px 35px rgba(0,0,0,0.08);
}
 
legend {
  font-size: 14px;
  font-weight: 700;
  color: #332e95;
  padding: 0 10px;
  margin-bottom: 10px;
}
 
/* ============================================================
   🧾 FORM INPUTS
============================================================ */
.form-group {
  display: flex;
  flex-direction: column;
  margin-bottom: 14px;
}
 
label {
  font-weight: 600;
  margin-bottom: 6px;
  font-size: 13px;
  color: #334155;
}
 
/* Inputs */
input, select {
  padding: 12px 14px;
 
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.08);
 
  background: #f8fafc;
  font-size: 14px;
 
  transition: all 0.25s ease;
}
 
/* Focus */
input:focus, select:focus {
  outline: none;
  border-color: #312c94;
  background: #fff;
 
  box-shadow: 0 0 0 4px rgba(79,70,229,0.12);
  transform: translateY(-1px);
}
 
/* Readonly */
input[readonly] {
  background: #eef2f7;
  color: #64748b;
}
 
/* ============================================================
   🔘 BUTTONS
============================================================ */
button {
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: white;
 
  border: none;
  padding: 10px 18px;
 
  font-size: 14px;
  font-weight: 600;
 
  border-radius: 10px;
  cursor: pointer;
 
  transition: all 0.25s ease;
  margin-top: 10px;
}
 
/* Hover */
button:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(79,70,229,0.3);
}
 
/* Disabled */
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
 
/* ============================================================
   💬 MESSAGE (MODERN ALERT)
============================================================ */
.message {
  margin-top: 20px;
  padding: 14px;
 
  border-radius: 12px;
  font-weight: 600;
  text-align: center;
 
  animation: slideUp 0.4s ease;
}
 
.message.success {
  background: rgba(34,197,94,0.1);
  color: #15803d;
  border: 1px solid rgba(34,197,94,0.2);
}
 
.message.error {
  background: rgba(239,68,68,0.1);
  color: #b91c1c;
  border: 1px solid rgba(239,68,68,0.2);
}
 
.message.warning {
  background: rgba(245,158,11,0.1);
  color: #b45309;
  border: 1px solid rgba(245,158,11,0.2);
}
 
.message.info {
  background: rgba(59,130,246,0.1);
  color: #1d4ed8;
  border: 1px solid rgba(59,130,246,0.2);
}
 
/* ============================================================
   🎬 ANIMATIONS
============================================================ */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(15px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
 
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
 
/* ============================================================
   📱 RESPONSIVE
============================================================ */
@media (max-width: 768px) {
  .manual-entry-container {
    margin: 20px;
    padding: 20px;
  }
}
`}</style>
    </div>
  );
};
 
export default SupplyChainInvoiceEntry;
 
 