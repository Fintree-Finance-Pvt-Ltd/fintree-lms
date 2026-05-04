import React, { useState, useRef } from "react";
import axios from "axios";
import api from "../../api/api";
 
const MotionCorpDealerEntry = () => {
 
  /*
  ==========================
  INITIAL STATE
  ==========================
  */
  const initialState = {
    business_name: "",
    trade_name: "",
    business_type: "",
    pan_number: "",
    gst_number: "",
 
    owner_name: "",
    owner_mobile: "",
    owner_email: "",
 
    showroom_address: "",
    city: "",
    state: "",
    pincode: "",
 
    bank_name: "",
    branch_name: "",
    account_holder_name: "",
    account_number: "",
    ifsc_code: "",
 
    products: [
  {
    battery_type: "",
    battery_name: "",
    e_rickshaw_model: "",
    price: ""
  }
],
 
    cheque_file_path: "",
    cheque_ocr_bank_name: null,
    cheque_ocr_branch_name: null,
    cheque_ocr_account_holder_name: null,
    cheque_ocr_account_number: null,
    cheque_ocr_ifsc_code: null,
    cheque_ocr_response: {}
  };
 
  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
 
  const fileInputRef = useRef(null);
 
  /*
  ==========================
  VALIDATIONS
  ==========================
  */
  const validatePAN = (pan) =>
    /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan);
 
  const validateGST = (gst) =>
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst);
 
  /*
  ==========================
  OCR UPLOAD
  ==========================
  */
  const handleChequeUpload = async (e) => {
 
    const file = e.target.files[0];
    if (!file) return;
 
    try {
 
      const uploadData = new FormData();
      uploadData.append("imageUrl", file);
 
      const res = await axios.post(
        "https://sandbox.fintreelms.com/ocr/v1/cheque",
        uploadData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            "X-API-Key": "Fintree@2026",
          },
        }
      );
 
      const result = res.data.data.result?.[0]?.details;
      if (!result) return;
 
      setFormData(prev => ({
        ...prev,
 
        cheque_file_path: file.name,
 
        cheque_ocr_bank_name: result.bank_name?.value ?? null,
        cheque_ocr_branch_name: result.branch_name?.value ?? null,
        cheque_ocr_account_holder_name: result.name?.value ?? null,
        cheque_ocr_account_number: result.account_number?.value ?? null,
        cheque_ocr_ifsc_code: result.ifsc_code?.value ?? null,
        cheque_ocr_response: result,
 
        // Autofill but allow manual edit
        bank_name: result.bank_name?.value || prev.bank_name,
        branch_name: result.branch_name?.value || prev.branch_name,
        account_holder_name: result.name?.value || prev.account_holder_name,
        account_number: result.account_number?.value || prev.account_number,
        ifsc_code: result.ifsc_code?.value || prev.ifsc_code
      }));
 
      alert("OCR Data Captured Successfully");
 
    } catch (err) {
      console.error(err);
      alert("Cheque OCR failed");
    }
  };
 
  const handleProductChange = (index, field, value) => {
  const updated = [...formData.products];
  updated[index][field] = value;

  setFormData(prev => ({
    ...prev,
    products: updated
  }));
};

const addProduct = () => {
  setFormData(prev => ({
    ...prev,
    products: [
      ...prev.products,
      {
        battery_type: "",
        battery_name: "",
        e_rickshaw_model: "",
        price: ""
      }
    ]
  }));
};

const removeProduct = (index) => {
  const updated = formData.products.filter((_, i) => i !== index);
  setFormData(prev => ({
    ...prev,
    products: updated
  }));
};



  /*
  ==========================
  INPUT CHANGE
  ==========================
  */
  const handleChange = (e) => {
    setLoading(false);
    setMessage("");
 
    let { name, value } = e.target;
 
    if (name === "owner_mobile") {
      value = value.replace(/\D/g, "").slice(0, 10);
    }
 
    if (name === "pincode") {
      value = value.replace(/\D/g, "").slice(0, 6);
    }
 
    if (name === "account_number") {
      value = value.replace(/\D/g, "");
    }
 
    if (name === "pan_number" || name === "gst_number") {
      value = value.toUpperCase();
    }
 
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
 
    setErrors((prev) => {
      const updated = { ...prev };
 
      // ✅ remove current field error when user edits
      delete updated[name];
 
      // ✅ PAN live validation
      if (name === "pan_number" && value && !validatePAN(value)) {
        updated.pan_number = "Invalid PAN (ABCDE1234F)";
      }
 
      // ✅ GST live validation
      if (name === "gst_number" && value && !validateGST(value)) {
        updated.gst_number = "Invalid GST format";
      }
 
      return updated;
    });
  };
 
  /*

  

  ==========================
  SUBMIT
  ==========================
  */
  const handleSubmit = async (e) => {
    e.preventDefault();
 
    const payload = {
      ...formData,

        products: formData.products.map(p => ({
    battery_type: p.battery_type || null,
    battery_name: p.battery_name || null,
    e_rickshaw_model: p.e_rickshaw_model || null,
    price: p.price || null
  })),
      bank_name: formData.bank_name?.trim() || null,
      branch_name: formData.branch_name?.trim() || null,
      account_holder_name: formData.account_holder_name?.trim() || null,
      account_number: formData.account_number?.toString().trim() || null,
      ifsc_code: formData.ifsc_code?.toUpperCase().trim() || null,
    };
 
    if (!payload.business_type) {
      setMessage("❌ Please select Business Type");
      return;
    }
 
    if (Object.keys(errors).length > 0) {
      setMessage("❌ Please fix validation errors");
      return;
    }
 
    if (!validatePAN(payload.pan_number)) {
      setMessage("❌ Invalid PAN format");
      return;
    }
 
    if (payload.gst_number && !validateGST(payload.gst_number)) {
      setMessage("❌ Invalid GST format");
      return;
    }
 
    setLoading(true);
    setMessage("");
 
    try {
 
      const res = await api.post(
        "/motion-corp/dealer/create",
        payload
      );
 
      setMessage(`✅ Dealer created successfully | LAN: ${res.data.lan}`);
 
      // reset form
      setFormData(initialState);
 
      // reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
 
    } catch (err) {
 
      setLoading(false);
      const backendMsg = err?.response?.data?.message;
      const field = err?.response?.data?.field;
 
      setMessage(backendMsg || "❌ Dealer creation failed");
 
      // highlight field
      if (field) {
 
        let fieldKey = "";
 
        if (field.includes("PAN")) fieldKey = "pan_number";
        if (field.includes("GST")) fieldKey = "gst_number";
        if (field.includes("Account")) fieldKey = "account_number";
 
        if (fieldKey) {
          setErrors(prev => ({
            ...prev,
            [fieldKey]: backendMsg
          }));
        }
      }
    }
  };
 
  /*
  ==========================
  INPUT RENDER
  ==========================
  */
  const renderInput = (label, name, type = "text") => (
<div className="modern-field">
<label>{label}</label>
<input
        type={type}
        name={name}
        value={formData[name] || ""}
        onChange={handleChange}
        onWheel={(e) => e.target.blur()}
        placeholder={`Enter ${label.toLowerCase()}`}
        style={{
          borderColor: errors[name] ? "#d91c3e" : "#d4d4d4",
          borderWidth: "2px"
        }}
      />
      {errors[name] && (
<span className="inline-error">{errors[name]}</span>
      )}
</div>
  );
 
  const renderSelect = (label, name, options) => (
<div className="modern-field">
<label>{label}</label>
<select
        name={name}
        value={formData[name]}
        onChange={handleChange}
        style={{
          borderColor: errors[name] ? "#d91c3e" : "#d4d4d4",
          borderWidth: "2px"
        }}
>
<option value="">Select {label}</option>
        {options.map((opt) => (
<option key={opt} value={opt}>
            {opt}
</option>
        ))}
</select>
      {errors[name] && (
<span className="inline-error">{errors[name]}</span>
      )}
</div>
  );
 
  return (
<div className="motion-corp-wrapper">
<style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
 
        .motion-corp-wrapper {
          --primary: #16a34a;
          --secondary: #15803d;
          --accent: #059669;
          --bg-slate: #f5f5f5;
          --text-dark: #1a1a1a;
          --text-light: #5a5a5a;
          --white: #ffffff;
          --border: #d4d4d4;
          --shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
          background: var(--bg-slate);
          min-height: 100vh;
          padding-bottom: 50px;
          font-family: 'Segoe UI', 'Roboto', -apple-system, sans-serif;
          color: var(--text-dark);
        }
        .header-banner {
          background: linear-gradient(135deg, #1a6847 0%, #16a34a 100%);
          padding: 50px 30px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: white;
          margin-bottom: 30px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }
        .header-banner h1 { 
          font-size: 32px; 
          font-weight: 800; 
          margin: 0; 
          letter-spacing: -0.5px;
        }
        .header-banner p { 
          margin: 10px 0 0; 
          opacity: 0.95; 
          font-size: 15px;
          font-weight: 500;
        }
        .date-badge { 
          background: rgba(255,255,255,0.25); 
          padding: 10px 18px; 
          border-radius: 25px; 
          font-size: 13px;
          font-weight: 600;
          backdrop-filter: blur(10px);
        }
        .modern-form-grid {
          max-width: 1050px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr;
          gap: 25px;
          padding: 0 30px;
        }
        .ui-card {
          background: var(--white);
          border-radius: 14px;
          padding: 35px;
          box-shadow: 0 6px 20px rgba(0,0,0,0.08);
          border: 2px solid #e8e8e8;
          transition: all 0.3s ease;
        }
 
        .ui-card:hover {
          box-shadow: 0 10px 30px rgba(0,0,0,0.12);
          border-color: #d0d0d0;
        }
        .card-header { 
          display: flex; 
          align-items: center; 
          gap: 15px; 
          margin-bottom: 25px; 
          border-bottom: 3px solid var(--primary); 
          padding-bottom: 15px; 
        }
        .card-header h3 { 
          font-size: 22px; 
          font-weight: 700; 
          margin: 0; 
          color: var(--primary);
          letter-spacing: -0.3px;
        }
        .card-header .icon { 
          font-size: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .grid-2 { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 25px; 
          margin-bottom: 15px; 
        }
        .grid-3 { 
          display: grid; 
          grid-template-columns: 1fr 1fr 1fr; 
          gap: 25px; 
          margin-bottom: 15px; 
        }
        .modern-field { 
          display: flex; 
          flex-direction: column; 
          gap: 8px; 
        }
        .modern-field label { 
          font-size: 12px; 
          font-weight: 800; 
          color: #2a2a2a; 
          text-transform: uppercase; 
          letter-spacing: 0.8px;
          display: block;
        }
        input, select {
          padding: 13px 16px;
          border-radius: 10px;
          border: 2px solid #d4d4d4;
          font-size: 15px;
          font-weight: 500;
          transition: all 0.3s ease;
          background: #fafafa;
          width: 100%;
          box-sizing: border-box;
          color: var(--text-dark);
        }
 
        input::placeholder, select::placeholder {
          color: #a0a0a0;
        }
        input:focus, select:focus { 
          outline: none; 
          border-color: var(--primary);
          background: var(--white);
          box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.15);
        }
 
        input:hover, select:hover {
          border-color: #b0b0b0;
        }
 
        /* Chrome, Safari, Edge, Opera: Remove Arrows */
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        /* Firefox: Remove Arrows */
        input[type=number] {
          -moz-appearance: textfield;
        }
 
        input[type="file"] {
          padding: 12px 14px;
          cursor: pointer;
        }
 
        input[type="file"]::file-selector-button {
          background: var(--primary);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          margin-right: 10px;
          transition: background 0.2s;
        }
 
        input[type="file"]::file-selector-button:hover {
          background: var(--secondary);
        }
        .inline-error { 
          color: #d91c3e; 
          font-size: 12px; 
          font-weight: 700; 
          margin-top: 4px;
          display: block;
        }
        .main-submit-btn {
          width: 100%;
          padding: 16px 20px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 800;
          cursor: pointer;
          margin-top: 15px;
          transition: all 0.3s ease;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          box-shadow: 0 6px 15px rgba(22, 163, 74, 0.3);
        }
        .main-submit-btn:hover:not(:disabled) { 
          transform: translateY(-3px);
          box-shadow: 0 10px 25px rgba(22, 163, 74, 0.4);
        }
 
        .main-submit-btn:active:not(:disabled) {
          transform: translateY(-1px);
        }
        .main-submit-btn:disabled { 
          background: #b0b0b0;
          cursor: not-allowed; 
          transform: none;
          opacity: 0.7;
        }
        .message {
          max-width: 1050px;
          margin: 25px auto;
          padding: 18px 20px;
          border-radius: 12px;
          font-weight: 700;
          text-align: center;
          background: white;
          border: 3px solid;
          font-size: 16px;
          box-shadow: 0 6px 20px rgba(0,0,0,0.1);
        }
 
        .message.success {
          color: #059669;
          border-color: #059669;
          background: #f0fdf4;
        }
 
        .message.error {
          color: #d91c3e;
          border-color: #d91c3e;
          background: #ffe0e6;
        }
        @media (max-width: 768px) {
          .grid-2, .grid-3 {
            grid-template-columns: 1fr;
            gap: 15px;
          }
          .header-banner {
            flex-direction: column;
            align-items: flex-start;
            gap: 15px;
            padding: 30px 20px;
          }
 
          .header-banner h1 {
            font-size: 26px;
          }
          .modern-form-grid {
            padding: 0 15px;
            gap: 18px;
          }
          .ui-card {
            padding: 25px;
          }
 
          .card-header {
            gap: 12px;
            margin-bottom: 20px;
          }
 
          .card-header h3 {
            font-size: 18px;
          }
 
          .card-header .icon {
            font-size: 24px;
          }
        }
 
        @media (max-width: 480px) {
          .header-banner {
            padding: 25px 15px;
          }
 
          .header-banner h1 {
            font-size: 22px;
          }
 
          .ui-card {
            padding: 20px 15px;
            border-radius: 12px;
          }
 
          input, select {
            padding: 11px 13px;
            font-size: 14px;
          }
 
          .modern-field label {
            font-size: 11px;
          }
 
          .main-submit-btn {
            padding: 14px 16px;
            font-size: 14px;
          }
        }
      `}</style>
 
      <div className="header-banner">
<div>
<h1>Motion Corp Dealer Registration</h1>
<p>Complete all dealer and vehicle details to initiate the process</p>
</div>
</div>
 
      <form onSubmit={handleSubmit} className="modern-form-grid">
 
        {/* Business Information */}
<div className="ui-card">
<div className="card-header">
<span className="icon">🏢</span>
<h3>Business Information</h3>
</div>
<div className="grid-2">
            {renderInput("Business Name", "business_name")}
            {renderInput("Trade Name", "trade_name")}
</div>
<div className="grid-2">
            {renderSelect("Business Type", "business_type", [
              "Proprietorship",
              "Partnership",
              "Private Limited",
              "LLP"
            ])}
            {renderInput("PAN Number", "pan_number")}
</div>
<div className="grid-2">
            {renderInput("GST Number", "gst_number")}
</div>
</div>
 
        {/* Owner Information */}
<div className="ui-card">
<div className="card-header">
<span className="icon">👤</span>
<h3>Owner Information</h3>
</div>
<div className="grid-2">
            {renderInput("Owner Name", "owner_name")}
            {renderInput("Owner Mobile", "owner_mobile")}
</div>
<div className="grid-2">
            {renderInput("Owner Email", "owner_email")}
</div>
</div>
 
        {/* Location Information */}
<div className="ui-card">
<div className="card-header">
<span className="icon">📍</span>
<h3>Showroom Location</h3>
</div>
<div className="grid-2">
            {renderInput("Address", "showroom_address")}
</div>
<div className="grid-3">
            {renderInput("City", "city")}
            {renderInput("State", "state")}
            {renderInput("Pincode", "pincode")}
</div>
</div>
 
        {/* Bank Information */}
<div className="ui-card">
<div className="card-header">
<span className="icon">🏦</span>
<h3>Bank Information (OCR)</h3>
</div>
<div className="grid-2">
<div className="modern-field">
<label>Upload Cheque Image</label>
<input
                type="file"
                ref={fileInputRef}
                onChange={handleChequeUpload}
                accept="image/*"
                style={{ borderWidth: "2px" }}
              />
</div>
</div>
<div className="grid-2">
            {renderInput("Bank Name", "bank_name")}
            {renderInput("Branch Name", "branch_name")}
</div>
<div className="grid-2">
            {renderInput("Account Holder Name", "account_holder_name")}
            {renderInput("Account Number", "account_number")}
</div>
<div className="grid-2">
            {renderInput("IFSC Code", "ifsc_code")}
</div>
</div>
 
       {/* EV Details */}
<div className="ui-card">

  <div className="card-header">
    <span className="icon">🔋</span>
    <h3>E-Vehicle Details</h3>
  </div>

  {formData.products.map((p, index) => (
    <div key={index} className="grid-3" style={{ marginBottom: "15px" }}>

      <input
        placeholder="Battery Type"
        value={p.battery_type}
        onChange={(e) =>
          handleProductChange(index, "battery_type", e.target.value)
        }
      />

      <input
        placeholder="Battery Name"
        value={p.battery_name}
        onChange={(e) =>
          handleProductChange(index, "battery_name", e.target.value)
        }
      />

      <input
        placeholder="E-Rickshaw Model"
        value={p.e_rickshaw_model}
        onChange={(e) =>
          handleProductChange(index, "e_rickshaw_model", e.target.value)
        }
      />

      <input
        type="number"
        placeholder="Price"
        value={p.price}
        onChange={(e) =>
          handleProductChange(index, "price", e.target.value)
        }
      />

      {formData.products.length > 1 && (
        <button
          type="button"
          onClick={() => removeProduct(index)}
          style={{
            background: "#d91c3e",
            color: "white",
            border: "none",
            borderRadius: "6px",
            padding: "8px"
          }}
        >
          ❌ Remove
        </button>
      )}

    </div>
  ))}

  <button
    type="button"
    onClick={addProduct}
    style={{
      marginTop: "10px",
      padding: "10px",
      background: "#16a34a",
      color: "white",
      border: "none",
      borderRadius: "8px"
    }}
  >
    ➕ Add Model
  </button>

</div>
 
        <button
          type="submit"
          className="main-submit-btn"
          disabled={loading || Object.keys(errors).length > 0}
>
          {loading ? "Creating Dealer..." : "Create Dealer"}
</button>
 
      </form>
 
      {message && (
<div className={`message ${message.includes("❌") ? "error" : "success"}`}>
          {message}
</div>
      )}
</div>
  );
};
 
export default MotionCorpDealerEntry;