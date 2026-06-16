import React, { useState, useRef } from "react";
import axios from "axios";
import api from "../../api/api";

const SRBHDealerEntry = () => {
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
        price: "",
      },
    ],

    cheque_file_path: "",
    cheque_ocr_bank_name: null,
    cheque_ocr_branch_name: null,
    cheque_ocr_account_holder_name: null,
    cheque_ocr_account_number: null,
    cheque_ocr_ifsc_code: null,
    cheque_ocr_response: {},
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
  const validatePAN = (pan) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan);

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
        },
      );

      const result = res.data.data.result?.[0]?.details;
      if (!result) return;

      setFormData((prev) => ({
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
        ifsc_code: result.ifsc_code?.value || prev.ifsc_code,
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

    setFormData((prev) => ({
      ...prev,
      products: updated,
    }));

    setErrors((prev) => {
      const updatedErrors = { ...prev };
      delete updatedErrors[`${field}_${index}`];
      return updatedErrors;
    });

    setMessage("");
  };

  const addProduct = () => {
    setFormData((prev) => ({
      ...prev,
      products: [
        ...prev.products,
        {
          battery_type: "",
          battery_name: "",
          e_rickshaw_model: "",
          price: "",
        },
      ],
    }));
  };

  const removeProduct = (index) => {
    const updated = formData.products.filter((_, i) => i !== index);
    setFormData((prev) => ({
      ...prev,
      products: updated,
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

 

  const handleSubmit = async (e) => {
    e.preventDefault();

    const requiredFields = [
      "business_name",
      "trade_name",
      "business_type",
      "pan_number",
      "gst_number",

      "owner_name",
      "owner_mobile",
      "owner_email",

      "showroom_address",
      "city",
      "state",
      "pincode",

      // Bank Fields
      "bank_name",
      "branch_name",
      "account_holder_name",
      "account_number",
      "ifsc_code",
    ];

    const validationErrors = {};

    // Validate required fields
    requiredFields.forEach((field) => {
      if (!formData[field] || String(formData[field]).trim() === "") {
        validationErrors[field] = `${field.replaceAll("_", " ")} is required`;
      }
    });

    // Product validation
    formData.products.forEach((p, index) => {
      if (!p.battery_type || String(p.battery_type).trim() === "") {
        validationErrors[`battery_type_${index}`] = "Battery type required";
      }

      if (!p.battery_name || String(p.battery_name).trim() === "") {
        validationErrors[`battery_name_${index}`] = "Battery name required";
      }

      if (!p.e_rickshaw_model || String(p.e_rickshaw_model).trim() === "") {
        validationErrors[`e_rickshaw_model_${index}`] =
          "E-Rickshaw model required";
      }

      if (!p.price || String(p.price).trim() === "") {
        validationErrors[`price_${index}`] = "Price required";
      }
    });

    // PAN validation
    if (
      formData.pan_number &&
      !validatePAN(formData.pan_number.trim().toUpperCase())
    ) {
      validationErrors.pan_number = "Invalid PAN format";
    }

    // GST validation
    if (
      formData.gst_number &&
      !validateGST(formData.gst_number.trim().toUpperCase())
    ) {
      validationErrors.gst_number = "Invalid GST format";
    }

    // IFSC validation
    if (
      formData.ifsc_code &&
      !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.ifsc_code.trim().toUpperCase())
    ) {
      validationErrors.ifsc_code = "Invalid IFSC code";
    }

    // Stop submit if validation failed
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setMessage("❌ Please fill all required fields");
      return;
    }

    // Important: clear old errors after all fields are valid
    setErrors({});
    setMessage("");

    const payload = {
      ...formData,

      business_name: formData.business_name?.trim() || null,
      trade_name: formData.trade_name?.trim() || null,
      business_type: formData.business_type || null,
      pan_number: formData.pan_number?.trim().toUpperCase() || null,
      gst_number: formData.gst_number?.trim().toUpperCase() || null,

      owner_name: formData.owner_name?.trim() || null,
      owner_mobile: formData.owner_mobile?.toString().trim() || null,
      owner_email: formData.owner_email?.trim() || null,

      showroom_address: formData.showroom_address?.trim() || null,
      city: formData.city?.trim() || null,
      state: formData.state?.trim() || null,
      pincode: formData.pincode?.toString().trim() || null,

      products: formData.products.map((p) => ({
        battery_type: p.battery_type || null,
        battery_name: p.battery_name || null,
        e_rickshaw_model: p.e_rickshaw_model || null,
        price: p.price || null,
      })),

      bank_name: formData.bank_name?.trim() || null,
      branch_name: formData.branch_name?.trim() || null,
      account_holder_name: formData.account_holder_name?.trim() || null,
      account_number: formData.account_number?.toString().trim() || null,
      ifsc_code: formData.ifsc_code?.trim().toUpperCase() || null,
    };

    setLoading(true);

    try {
      const res = await api.post("/srbh/dealer/create", payload);

      setMessage(`✅ Dealer created successfully | LAN: ${res.data.lan}`);

      // reset form
      setFormData(initialState);
      setErrors({});

      // reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
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
          setErrors((prev) => ({
            ...prev,
            [fieldKey]: backendMsg,
          }));
        }
      }
    } finally {
      setLoading(false);
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
          borderWidth: "2px",
        }}
      />
      {errors[name] && <span className="inline-error">{errors[name]}</span>}
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
          borderWidth: "2px",
        }}
      >
        <option value="">Select {label}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {errors[name] && <span className="inline-error">{errors[name]}</span>}
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
    --bg-main: #f8fafc;
    --bg-card: #ffffff;
    --primary: #0284c7;
    --primary-light: #e0f2fe;
    --accent: #0ea5e9;
    --text-main: #0f172a;
    --text-muted: #64748b;
    --border-color: #e2e8f0;
    --border-hover: #cbd5e1;
    --border-focus: #0284c7;
    --error-red: #ef4444;
    --error-bg: #fef2f2;
    --success-green: #10b981;
    --success-bg: #ecfdf5;
    
    background: var(--bg-main);
    min-height: 100vh;
    padding-bottom: 60px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--text-main);
    /* Subtle geometric grid background pattern for a tech-forward look */
    background-image: 
      radial-gradient(#e2e8f0 1.5px, transparent 1.5px), 
      radial-gradient(#e2e8f0 1.5px, var(--bg-main) 1.5px);
    background-size: 30px 30px;
    background-position: 0 0, 15px 15px;
  }

  .header-banner {
    background: #ffffff;
    border-bottom: 1px solid var(--border-color);
    padding: 50px 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 40px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  }

  .header-banner h1 { 
    font-size: 34px; 
    font-weight: 800; 
    margin: 0; 
    letter-spacing: -0.75px;
    color: var(--text-main);
  }

  .header-banner p { 
    margin: 8px 0 0; 
    color: var(--text-muted);
    font-size: 15px;
    font-weight: 400;
  }

  .date-badge { 
    background: var(--primary-light); 
    padding: 8px 18px; 
    border-radius: 30px; 
    font-size: 13px;
    font-weight: 600;
    color: var(--primary);
    border: 1px solid rgba(2, 132, 199, 0.15);
    letter-spacing: 0.3px;
  }

  .modern-form-grid {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr;
    gap: 30px;
    padding: 0 30px;
  }

  .ui-card {
    background: var(--bg-card);
    border-radius: 20px;
    padding: 40px;
    border: 1px solid var(--border-color);
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.02), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .ui-card:hover {
    transform: translateY(-2px);
    border-color: var(--border-hover);
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02);
  }

  .card-header { 
    display: flex; 
    align-items: center; 
    gap: 16px; 
    margin-bottom: 35px; 
    border-bottom: 1px solid var(--border-color); 
    padding-bottom: 20px; 
  }

  .card-header h3 { 
    font-size: 20px; 
    font-weight: 700; 
    margin: 0; 
    color: var(--text-main);
    letter-spacing: -0.3px;
  }

  .card-header .icon { 
    font-size: 22px;
    color: var(--primary);
    background: var(--primary-light);
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .grid-2 { 
    display: grid; 
    grid-template-columns: 1fr 1fr; 
    gap: 30px; 
    margin-bottom: 20px; 
  }

  .grid-3 { 
    display: grid; 
    grid-template-columns: 1fr 1fr 1fr; 
    gap: 30px; 
    margin-bottom: 20px; 
  }

  .modern-field { 
    display: flex; 
    flex-direction: column; 
    gap: 8px; 
  }

  .modern-field label { 
    font-size: 11px; 
    font-weight: 700; 
    color: var(--text-muted); 
    text-transform: uppercase; 
    letter-spacing: 1px;
  }

  input, select {
    padding: 14px 18px;
    border-radius: 12px;
    border: 1px solid var(--border-color);
    font-size: 15px;
    font-weight: 500;
    transition: all 0.2s ease;
    background: #ffffff;
    width: 100%;
    box-sizing: border-box;
    color: var(--text-main);
  }

  input::placeholder, select::placeholder {
    color: #94a3b8;
  }

  input:focus, select:focus { 
    outline: none; 
    border-color: var(--border-focus);
    background: #ffffff;
    box-shadow: 0 0 0 4px rgba(2, 132, 199, 0.1);
  }

  input:hover, select:hover {
    border-color: var(--border-hover);
  }

  /* Structural fixes for dynamic form arrows */
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type=number] {
    -moz-appearance: textfield;
  }

  input[type="file"] {
    padding: 12px 14px;
    cursor: pointer;
    background: #f1f5f9;
    border: 1px dashed var(--border-hover);
  }

  input[type="file"]::file-selector-button {
    background: var(--primary);
    color: #ffffff;
    border: none;
    padding: 8px 18px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
    margin-right: 12px;
    transition: all 0.2s ease;
  }

  input[type="file"]::file-selector-button:hover {
    background: var(--accent);
  }

  .inline-error { 
    color: var(--error-red); 
    font-size: 12px; 
    font-weight: 600; 
    margin-top: 6px;
    display: block;
  }

  .main-submit-btn {
    width: 100%;
    padding: 18px 24px;
    background: var(--text-main); /* Tech-forward bold dark button on a crisp light UI */
    color: #ffffff;
    border: none;
    border-radius: 14px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    margin-top: 20px;
    transition: all 0.2s ease;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
  }

  .main-submit-btn:hover:not(:disabled) { 
    background: var(--primary);
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(2, 132, 199, 0.2);
  }

  .main-submit-btn:active:not(:disabled) {
    transform: translateY(-1px);
  }

  .main-submit-btn:disabled { 
    background: #e2e8f0;
    color: #94a3b8;
    cursor: not-allowed; 
    transform: none;
    box-shadow: none;
  }

  .message {
    max-width: 1100px;
    margin: 30px auto;
    padding: 18px 24px;
    border-radius: 14px;
    font-weight: 600;
    text-align: center;
    font-size: 15px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  }

  .message.success {
    color: var(--success-green);
    border: 1px solid rgba(16, 185, 129, 0.2);
    background: var(--success-bg);
  }

  .message.error {
    color: var(--error-red);
    border: 1px solid rgba(239, 68, 68, 0.2);
    background: var(--error-bg);
  }

  @media (max-width: 768px) {
    .grid-2, .grid-3 {
      grid-template-columns: 1fr;
      gap: 20px;
    }
    .header-banner {
      flex-direction: column;
      align-items: flex-start;
      gap: 20px;
      padding: 35px 24px;
    }

    .header-banner h1 {
      font-size: 28px;
    }
    .modern-form-grid {
      padding: 0 20px;
      gap: 24px;
    }
    .ui-card {
      padding: 30px 24px;
    }
    .card-header h3 {
      font-size: 18px;
    }
  }

  @media (max-width: 480px) {
    .header-banner {
      padding: 30px 16px;
    }
    .header-banner h1 {
      font-size: 24px;
    }
    .ui-card {
      padding: 24px 16px;
      border-radius: 16px;
    }
    input, select {
      padding: 12px 14px;
      font-size: 14px;
    }
    .main-submit-btn {
      padding: 16px;
      font-size: 14px;
    }
  }
`}</style>

      <div className="header-banner">
        <div>
          <h1>SRBH Dealer Registration</h1>
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
              "LLP",
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
          <div className="grid-2">{renderInput("IFSC Code", "ifsc_code")}</div>
        </div>

        {/* EV Details */}
        <div className="ui-card">
          <div className="card-header">
            <span className="icon">🔋</span>
            <h3>E-Vehicle Details</h3>
          </div>

          {formData.products.map((p, index) => (
            <div
              key={index}
              className="grid-3"
              style={{ marginBottom: "15px" }}
            >
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
                    padding: "8px",
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
              background: "#3f8bbd",
              color: "white",
              border: "none",
              borderRadius: "8px",
            }}
          >
             Add Model
          </button>
        </div>

        <button type="submit" className="main-submit-btn" disabled={loading}>
          {loading ? "Creating Dealer..." : "Create Dealer"}
        </button>
      </form>

      {message && (
        <div
          className={`message ${message.includes("❌") ? "error" : "success"}`}
        >
          {message}
        </div>
      )}
    </div>
  );
};

export default SRBHDealerEntry;
