import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";

const HospitalLoginActions = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let off = false;

    api
      .get("clayyo-loans/hospitals-login-loans")
      .then((res) => {
        if (!off) setRows(res.data || []);
      })
      .catch(() => {
        if (!off) setErr("Failed to fetch hospitals");
      })
      .finally(() => {
        if (!off) setLoading(false);
      });

    return () => (off = true);
  }, []);

  if (loading) return <p>Loading…</p>;
  if (err) return <p style={{ color: "red" }}>{err}</p>;

  const handleStatusChange = async (lan, status) => {
  try {
    await api.patch(`/clayyo-loans/hospitals/status/${lan}`, {
      
      status: status.toUpperCase(),
    });

    // ✅ Update UI instantly (no reload)
    setRows((prev) =>
      prev.map((row) =>
        row.lan === lan ? { ...row, status: status.toUpperCase() } : row
      )
    );

  } catch (err) {
    console.error(err);
    alert("Failed to update status");
  }
};

const actionBtn = (type) => ({
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid transparent",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    background: type === "approve" ? "#10b981" : "#ef4444",
    borderColor: type === "approve" ? "#059669" : "#dc2626",
    color: "#fff",
  });

const statusPillStyle = (status) => {
  const map = {
    ACTIVE: { bg: "rgba(16,185,129,.12)", fg: "#065f46" },
    INACTIVE: { bg: "rgba(239,68,68,.12)", fg: "#7f1d1d" },
    APPROVED: { bg: "rgba(59,130,246,.12)", fg: "#1e3a8a" },
    REJECTED: { bg: "rgba(239,68,68,.2)", fg: "#991b1b" },
  };

  return {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background: map[status]?.bg || "#eee",
    color: map[status]?.fg || "#333",
  };
};

  const columns = [
    {
      key: "hospital_legal_name",
      header: "Hospital Name",
      
      sortable: true,
      render: (r) => (
          <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/approved-loan-details-clayoo-hospital/${r.lan}`)}
          title="View loan details"
        > 
         {r.hospital_legal_name}
        </span>
      ),
      width: 220,
    },
    {
      key: "brand_name",
      header: "Brand",
      sortable: true,
      width: 160,
    },
    {
      key: "hospital_type",
      header: "Type",
      sortable: true,
      width: 160,
    },
    {
      key: "bed_capacity",
      header: "Beds",
      sortable: true,
      width: 100,
    },
    {
      key: "location",
      header: "Location",
      render: (r) =>
        `${r.registered_city}, ${r.registered_district}`,
      width: 220,
    },
    {
      key: "state",
      header: "State",
      render: (r) => r.registered_state,
      width: 160,
    },
    {
      key: "hospital_phone",
      header: "Phone",
      render: (r) =>
        r.hospital_phone ? (
          <a href={`tel:${r.hospital_phone}`} style={{ color: "#2563eb" }}>
            {r.hospital_phone}
          </a>
        ) : "—",
      width: 150,
    },
    {
      key: "owner_name",
      header: "Owner",
      sortable: true,
      width: 180,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span style={statusPillStyle(r.status)}>
          {r.status}
        </span>
      ),
      width: 120,
    },
    {
      key: "created_at",
      header: "Created At",
      render: (r) =>
        r.created_at
          ? new Date(r.created_at).toLocaleDateString()
          : "—",
      width: 140,
    },
    {
      key: "docs",
      header: "Documents",
      render: (r) => (
        <button
          onClick={() => navigate(`/documents/${r.lan}`)}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #93c5fd",
            color: "#1d4ed8",
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
          title="Open documents"
        >
          📂 Docs
        </button>
      ),
      csvAccessor: () => "",
      width: 120,
    },
    {
  key: "actions",
  header: "Actions",
  render: (r) => (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        style={actionBtn("approve")}
        onClick={() => handleStatusChange(r.lan, "APPROVED")}
      >
        ✅ Approve
      </button>

      <button
        style={actionBtn("reject")}
        onClick={() => handleStatusChange(r.lan, "REJECTED")}
      >
        ❌ Reject
      </button>
    </div>
  ),
  csvAccessor: () => "",
  width: 210,
}
  ];

  return (
    <DataTable
      title="Clayyo Hospital Credit Approval Lists"
      rows={rows}
      columns={columns}
      globalSearchKeys={[
        "hospital_legal_name",
        "brand_name",
        "registered_city",
        "registered_district",
        "registered_state",
        "owner_name",
      ]}
      exportFileName="hospitals"
    />
  );
};

export default HospitalLoginActions;



// import React, { useState, useEffect } from "react";
// import api from "../../api/api";
// import axios from "axios";
 
// const getTodayDateString = () => {
//   const d = new Date();
//   return d.toISOString().split("T")[0];
// };
 
// const ClayooManualEntry = () => {
//   const [hospitals, setHospitals] = useState([]);
//   const [sameAddress, setSameAddress] = useState(false);
//   const [ageError, setAgeError] = useState("");
//   const [showConsentDialog, setShowConsentDialog] = useState(false);
//   const [consentChecked, setConsentChecked] = useState(false);
//   const [otp, setOtp] = useState("");
//   const [otpVerified, setOtpVerified] = useState(false);
//   const [otpLoading, setOtpLoading] = useState(false);
//   const [resendTimer, setResendTimer] = useState(0);
 
//   const CONSENT_TEXT = `I/We hereby authorise Fintree Finance Private Limited(FFPL) (hereinafter referred to as “Lender”) or its associates/subsidiaries/affiliates to obtain, verify, exchange, share or part with all the information or otherwise, regarding my/our office/ residence and/or contact me/us or my/our family/ employer/Banker/Credit Bureau/ RBI or any third parties as deemed necessary and/or do any such acts till such period as they deem necessary and/or disclose to Reserve bank of India, Credit Information Companies, Banks/NBFCs, or any other authority and institution, including but not limited to current balance, payment history, default, if any, etc...`;
 
//   const [formData, setFormData] = useState({
//     login_date: getTodayDateString(),
//     hospital_id: "",
//     first_name: "",
//     middle_name: "",
//     last_name: "",
//     customer_name: "",
//     gender: "",
//     dob: "",
//     age: "",
//     mobile_number: "",
//     email_id: "",
//     pan_number: "",
//     current_address: "",
//     current_village_city: "",
//     current_district: "",
//     current_state: "",
//     current_pincode: "",
//     permanent_address: "",
//     permanent_village_city: "",
//     permanent_district: "",
//     permanent_state: "",
//     permanent_pincode: "",
//     policy_type: "",
//     employment_type: "",
//     net_monthly_income: "",
//     bank_name: "",
//     bank_branch: "",
//     name_in_bank: "",
//     account_number: "",
//     ifsc: "",
//     patient_name: "",
//     father_name: "",
//     mother_name: "",
//     subvention_percent: "",
//     insurance_company_name: "",
//     insurance_policy_holder_name: "",
//     insurance_policy_number: "",
//     relation_with_policy_holder: "",
//     loan_amount: "",
//     product: "CLAYOO",
//     lender: "CLAYOO",
//     status: "Login",
//   });
 
//   const [message, setMessage] = useState("");
//   const [loading, setLoading] = useState(false);
 
//   // Logic preservation: Fetch hospitals
//   useEffect(() => {
//     const fetchHospitals = async () => {
//       try {
//         const res = await api.get("clayyo-loans/hospitals-list");
//         setHospitals(res.data);
//       } catch (err) { console.log(err); }
//     };
//     fetchHospitals();
//   }, []);
 
//   // Logic preservation: Pincode Lookup
//   const handlePincodeLookup = async (pin, type) => {
//     if (pin.length !== 6) return;
//     try {
//       const res = await axios.get(`https://api.postalpincode.in/pincode/${pin}`);
//       const data = res.data[0];
//       if (data.Status === "Success" && data.PostOffice?.length > 0) {
//         const office = data.PostOffice[0];
//         const prefix = type === "current" ? "current" : "permanent";
//         setFormData((prev) => ({
//           ...prev,
//           [`${prefix}_district`]: office.District || "",
//           [`${prefix}_state`]: office.State || "",
//         }));
//       }
//     } catch (err) { console.log(err); }
//   };
 
//   useEffect(() => { if (formData.current_pincode.length === 6) handlePincodeLookup(formData.current_pincode, "current"); }, [formData.current_pincode]);
//   useEffect(() => { if (formData.permanent_pincode.length === 6) handlePincodeLookup(formData.permanent_pincode, "permanent"); }, [formData.permanent_pincode]);
 
//   // Logic preservation: Address Sync
//   useEffect(() => {
//     if (sameAddress) {
//       setFormData((prev) => ({
//         ...prev,
//         permanent_address: prev.current_address,
//         permanent_village_city: prev.current_village_city,
//         permanent_district: prev.current_district,
//         permanent_state: prev.current_state,
//         permanent_pincode: prev.current_pincode,
//       }));
//     }
//   }, [sameAddress, formData.current_address, formData.current_village_city, formData.current_district, formData.current_state, formData.current_pincode]);
 
//   const validateAge = (age, policyType) => {
//     if (!age) return "";
//     if (age > 60) return "Maximum age is 60";
//     if (policyType === "Corporate Policy") {
//       if (age < 22) return "Minimum age is 22 for Corporate Policy";
//     } else {
//       if (age < 25) return "Minimum age is 25 for Individual Policy";
//     }
//     return "";
//   };
 
//   const handleChequeUpload = async (e) => {
//     const file = e.target.files[0];
//     if (!file) return;
//     try {
//       const uploadData = new FormData();
//       uploadData.append("imageUrl", file);
//       const res = await axios.post("https://sandbox.fintreelms.com/ocr/v1/cheque", uploadData, {
//         headers: { "Content-Type": "multipart/form-data", "X-API-Key": "Fintree@2026" },
//       });
//       const result = res.data.data.result?.[0]?.details;
//       if (!result) return;
//       setFormData((prev) => ({
//         ...prev,
//         account_number: result.account_number?.value || prev.account_number,
//         ifsc: result.ifsc_code?.value || prev.ifsc,
//         name_in_bank: result.name?.value || prev.name_in_bank,
//         bank_name: result.bank_name?.value || prev.bank_name,
//       }));
//       if (result.ifsc_code?.value) fetchBankFromIFSC(result.ifsc_code.value);
//     } catch (err) { console.log("Cheque OCR failed:", err); }
//   };
 
//   const handleSameAddress = (e) => {
//     const checked = e.target.checked;
//     setSameAddress(checked);
//     if (!checked) {
//       setFormData(prev => ({ ...prev, permanent_address: "", permanent_village_city: "", permanent_district: "", permanent_state: "", permanent_pincode: "" }));
//     }
//   };
 
//   const sendOtp = async () => {
//     try {
//       setOtpLoading(true);
//       const res = await api.post("clayyo-loans/send-otp", { mobile: formData.mobile_number });
//       if (res.data.success) {
//         setResendTimer(60);
//         const timer = setInterval(() => {
//           setResendTimer((prev) => {
//             if (prev <= 1) { clearInterval(timer); return 0; }
//             return prev - 1;
//           });
//         }, 1000);
//       }
//     } catch (err) { alert("Failed to send OTP"); } finally { setOtpLoading(false); }
//   };
 
//   const verifyOtpHandler = async () => {
//     if (!otp || !consentChecked) { alert("Complete OTP and Consent"); return; }
//     try {
//       setOtpLoading(true);
//       const res = await api.post("clayyo-loans/verify-otp", { mobile: formData.mobile_number, otp, consentText: CONSENT_TEXT });
//       if (res.data.success) { setOtpVerified(true); setShowConsentDialog(false); }
//     } catch (err) { alert("Invalid OTP"); } finally { setOtpLoading(false); }
//   };
 
//   const handleOpenConsentDialog = () => {
//     if (!formData.mobile_number || formData.mobile_number.length !== 10) { alert("Enter valid mobile number"); return; }
//     setShowConsentDialog(true);
//     sendOtp();
//   };
 
//   const fetchBankFromIFSC = async (ifsc) => {
//     if (ifsc.length !== 11) return;
//     try {
//       const res = await axios.get(`https://ifsc.razorpay.com/${ifsc}`);
//       setFormData(prev => ({ ...prev, bank_name: res.data.BANK || "", bank_branch: res.data.BRANCH || "" }));
//     } catch (err) { console.log("IFSC API failed"); }
//   };
 
//   const handleChange = (e) => {
//     const { name, value } = e.target;
//     let newValue = value;
//     if (name === "hospital_id") newValue = Number(value);
//     if (name === "mobile_number") newValue = value.replace(/\D/g, "").slice(0, 10);
//     if (name === "pan_number") newValue = value.toUpperCase().slice(0, 10);
//     if (name === "email_id") newValue = value.toLowerCase().replace(/\s/g, "");
//     if (name === "current_pincode" || name === "permanent_pincode") newValue = value.replace(/\D/g, "").slice(0, 6);
//     if (name === "ifsc") {
//       newValue = value.toUpperCase().replace(/\s/g, "").slice(0, 11);
//       if (newValue.length === 11) fetchBankFromIFSC(newValue);
//     }
//     if (name === "dob") {
//       const today = new Date();
//       const birthDate = new Date(value);
//       let age = today.getFullYear() - birthDate.getFullYear();
//       const m = today.getMonth() - birthDate.getMonth();
//       if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
//       setAgeError(validateAge(age, formData.policy_type));
//       setFormData(prev => ({ ...prev, dob: value, age: age }));
//       return;
//     }
//     if (name === "policy_type") setAgeError(validateAge(Number(formData.age), newValue));
//     setFormData(prev => {
//       const updated = { ...prev, [name]: newValue };
//       if (name === "first_name" || name === "last_name") updated.customer_name = `${updated.first_name} ${updated.last_name}`.trim();
//       return updated;
//     });
//   };
 
//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     if (!otpVerified) { setMessage("❌ Please verify mobile number first"); return; }
//     setLoading(true);
//     setMessage("");
//     try {
//       const res = await api.post("clayyo-loans/manual-entry", formData);
//       setMessage(`✅ ${res.data.message} | LAN: ${res.data.lan}`);
//     } catch (err) { setMessage(err.response?.data?.message || "❌ Something went wrong"); } finally { setLoading(false); }
//   };
 
//   return (
//     <div className="hospital-ui-wrapper">
//       <style>{`
//         .hospital-ui-wrapper {
//           --primary: #0d9488;
//           --secondary: #0f766e;
//           --bg-slate: #f8fafc;
//           --text-dark: #1e293b;
//           --text-light: #64748b;
//           --white: #ffffff;
//           --border: #e2e8f0;
//           background: var(--bg-slate);
//           min-height: 100vh;
//           padding-bottom: 50px;
//           font-family: 'Inter', -apple-system, sans-serif;
//           color: var(--text-dark);
//         }
//         .header-banner {
//           background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
//           padding: 40px 20px;
//           display: flex;
//           justify-content: space-between;
//           align-items: center;
//           color: white;
//           margin-bottom: 20px;
//         }
//         .header-banner h1 { font-size: 24px; font-weight: 700; margin: 0; }
//         .date-badge { background: rgba(255,255,255,0.2); padding: 8px 15px; border-radius: 20px; font-size: 13px; }
//         .modern-form-grid { max-width: 1000px; margin: 0 auto; display: grid; gap: 20px; padding: 0 20px; }
//         .ui-card { background: var(--white); border-radius: 12px; padding: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid var(--border); }
//         .card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
//         .card-header h3 { font-size: 18px; font-weight: 600; margin: 0; color: var(--primary); }
//         .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
//         .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
//         .modern-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px; }
//         .modern-field label { font-size: 11px; font-weight: 700; color: var(--text-light); text-transform: uppercase; }
//         input, select { padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); font-size: 14px; background: #fcfcfd; width: 100%; box-sizing: border-box; }
//         input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(13,148,136,0.1); }
//         .input-with-action { display: flex; gap: 10px; }
//         .otp-btn { background: var(--primary); color: white; border: none; padding: 0 15px; border-radius: 8px; font-weight: 600; cursor: pointer; }
//         .main-submit-btn { width: 100%; padding: 18px; background: var(--primary); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 20px; }
//         .modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(4px); z-index: 2000; display: flex; align-items: center; justify-content: center; }
//         .modal-card { background: white; width: 90%; max-width: 600px; padding: 30px; border-radius: 20px; max-height: 90vh; overflow-y: auto; }
//         .consent-scroll { height: 200px; overflow-y: auto; border: 1px solid #eee; padding: 15px; font-size: 12px; background: #fafafa; margin: 15px 0; }
//         .inline-error { color: #e11d48; font-size: 11px; font-weight: 600; margin-top: 4px; }
//       `}</style>
 
//       <div className="header-banner">
//         <div>
//           <h1>CLAYYO Loan Application</h1>
//           <p>Manual Entry Portal - Digital Medical Financing</p>
//         </div>
//         <div className="date-badge">Logged: {formData.login_date}</div>
//       </div>
 
//       <form onSubmit={handleSubmit} className="modern-form-grid">
//         {/* Hospital Selection */}
//         <div className="ui-card">
//           <div className="card-header">
//             <span className="icon">🏥</span>
//             <h3>Select Medical Facility</h3>
//           </div>
//           <div className="modern-field">
//             <label>Facility Name</label>
//             <select name="hospital_id" value={formData.hospital_id} onChange={handleChange}>
//               <option value="">Choose Hospital</option>
//               {hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
//             </select>
//           </div>
//         </div>
 
//         {/* Policy Details */}
//         <div className="ui-card">
//           <div className="card-header"><span className="icon">📄</span><h3>Policy & Patient Details</h3></div>
//           <div className="grid-3">
//             <div className="modern-field">
//               <label>Policy Type</label>
//               <select name="policy_type" value={formData.policy_type} onChange={handleChange}>
//                 <option value="">Select</option>
//                 <option value="Corporate Policy">Corporate Policy</option>
//                 <option value="Individual Policy">Individual Policy</option>
//               </select>
//             </div>
//             <div className="modern-field">
//               <label>Employment</label>
//               <select name="employment_type" value={formData.employment_type} onChange={handleChange}>
//                 <option value="">Select</option>
//                 <option value="Salaried">Salaried</option>
//                 <option value="Self-Employed">Self-Employed</option>
//               </select>
//             </div>
//             <div className="modern-field">
//               <label>Monthly Income</label>
//               <input type="number" name="net_monthly_income" value={formData.net_monthly_income} onChange={handleChange} />
//             </div>
//           </div>
//           <div className="grid-2">
//             <div className="modern-field"><label>Patient Name</label><input type="text" name="patient_name" value={formData.patient_name} onChange={handleChange} /></div>
//             <div className="modern-field">
//                 <label>Relation with Policy Holder</label>
//                 <select name="relation_with_policy_holder" value={formData.relation_with_policy_holder} onChange={handleChange}>
//                     <option value="">Select</option>
//                     {["Self", "Spouse", "Father", "Mother", "Son", "Daughter", "Brother", "Sister"].map(r => <option key={r} value={r}>{r}</option>)}
//                 </select>
//             </div>
//           </div>
//         </div>
 
//         {/* Borrower Details */}
//         <div className="ui-card">
//           <div className="card-header"><span className="icon">👤</span><h3>Borrower Information</h3></div>
//           <div className="grid-3">
//             <div className="modern-field"><label>First Name</label><input type="text" name="first_name" value={formData.first_name} onChange={handleChange} /></div>
//             <div className="modern-field"><label>Middle Name</label><input type="text" name="middle_name" value={formData.middle_name} onChange={handleChange} /></div>
//             <div className="modern-field"><label>Last Name</label><input type="text" name="last_name" value={formData.last_name} onChange={handleChange} /></div>
//           </div>
//           <div className="grid-3">
//             <div className="modern-field"><label>Gender</label><select name="gender" value={formData.gender} onChange={handleChange}><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option></select></div>
//             <div className="modern-field"><label>DOB</label><input type="date" name="dob" value={formData.dob} onChange={handleChange} /></div>
//             <div className="modern-field">
//               <label>Age</label>
//               <input type="number" name="age" value={formData.age} readOnly style={{ borderColor: ageError ? 'red' : '' }} />
//               {ageError && <span className="inline-error">{ageError}</span>}
//             </div>
//           </div>
//           <div className="grid-2">
//             <div className="modern-field">
//               <label>Mobile (Aadhaar Linked)</label>
//               <div className="input-with-action">
//                 <input type="text" name="mobile_number" value={formData.mobile_number} onChange={handleChange} disabled={otpVerified} />
//                 {!otpVerified ?
//                   <button type="button" className="otp-btn" onClick={handleOpenConsentDialog}>Verify</button> :
//                   <button type="button" className="otp-btn verified" disabled>Verified ✅</button>}
//               </div>
//             </div>
//             <div className="modern-field"><label>PAN</label><input type="text" name="pan_number" value={formData.pan_number} onChange={handleChange} /></div>
//           </div>
//         </div>
 
//         {/* Address Cards */}
//         <div className="grid-2">
//             <div className="ui-card">
//                 <div className="card-header"><h3>Current Address</h3></div>
//                 <div className="modern-field"><label>Address</label><input type="text" name="current_address" value={formData.current_address} onChange={handleChange} /></div>
//                 <div className="grid-2">
//                     <div className="modern-field"><label>Pincode</label><input type="text" name="current_pincode" value={formData.current_pincode} onChange={handleChange} /></div>
//                     <div className="modern-field"><label>District</label><input type="text" name="current_district" value={formData.current_district} onChange={handleChange} /></div>
//                 </div>
//             </div>
//             <div className="ui-card">
//                 <div className="card-header"><h3>Permanent Address</h3></div>
//                 <label className="checkbox-container">
//                     <input type="checkbox" checked={sameAddress} onChange={handleSameAddress} /> Same as Current
//                 </label>
//                 <div className="modern-field"><label>Address</label><input type="text" name="permanent_address" value={formData.permanent_address} onChange={handleChange} disabled={sameAddress} /></div>
//                 <div className="grid-2">
//                     <div className="modern-field"><label>Pincode</label><input type="text" name="permanent_pincode" value={formData.permanent_pincode} onChange={handleChange} disabled={sameAddress} /></div>
//                     <div className="modern-field"><label>District</label><input type="text" name="permanent_district" value={formData.permanent_district} onChange={handleChange} disabled={sameAddress} /></div>
//                 </div>
//             </div>
//         </div>
 
//         {/* Bank Details */}
//         <div className="ui-card">
//           <div className="card-header"><span className="icon">🏦</span><h3>Bank & Loan Request</h3></div>
//           <div className="grid-2">
//             <div className="modern-field"><label>OCR: Upload Cheque</label><input type="file" onChange={handleChequeUpload} /></div>
//             <div className="modern-field"><label>IFSC Code</label><input type="text" name="ifsc" value={formData.ifsc} onChange={handleChange} /></div>
//           </div>
//           <div className="grid-2">
//             <div className="modern-field"><label>Account Number</label><input type="text" name="account_number" value={formData.account_number} onChange={handleChange} /></div>
//             <div className="modern-field"><label>Bank Name</label><input type="text" name="bank_name" value={formData.bank_name} onChange={handleChange} /></div>
//           </div>
//           <div className="grid-2" style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
//             <div className="modern-field"><label>Requested Loan Amount</label><input type="number" name="loan_amount" value={formData.loan_amount} onChange={handleChange} /></div>
//             <div className="modern-field"><label>Subvention %</label><input type="number" name="subvention_percent" value={formData.subvention_percent} onChange={handleChange} /></div>
//           </div>
//         </div>
 
//         <button type="submit" className="main-submit-btn" disabled={loading}>
//           {loading ? "Processing Application..." : "Submit Loan Application"}
//         </button>
//       </form>
 
//       {message && <div className="message" style={{ color: message.includes('✅') ? '#059669' : '#e11d48' }}>{message}</div>}
 
//       {/* Consent Dialog */}
//       {showConsentDialog && (
//         <div className="modal-overlay">
//           <div className="modal-card">
//             <h3>Consent Agreement</h3>
//             <div className="consent-scroll">{CONSENT_TEXT}</div>
//             <label className="checkbox-container">
//               <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
//               I agree to the terms and authorize verification.
//             </label>
//             <div className="modern-field">
//               <input type="text" placeholder="Enter 6-Digit OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={!consentChecked} />
//             </div>
//             <div style={{ display: 'flex', gap: '10px' }}>
//               <button className="otp-btn" style={{ padding: '12px 25px' }} onClick={verifyOtpHandler} disabled={!consentChecked || otpLoading}>
//                 {otpLoading ? "Verifying..." : "Confirm & Verify"}
//               </button>
//               <button className="otp-btn" style={{ background: '#94a3b8' }} onClick={() => setShowConsentDialog(false)}>Cancel</button>
//             </div>
//             {resendTimer > 0 ? <p style={{ fontSize: '12px', marginTop: '10px' }}>Resend available in {resendTimer}s</p> :
//             <button className="medical-link" style={{ background: 'none', border: 'none', cursor: 'pointer', marginTop: '10px' }} onClick={sendOtp}>Resend OTP</button>}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };
 
// export default ClayooManualEntry;
 