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

    battery_type: "",
    battery_name: "",
    e_rickshaw_model: "",

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

        setLoading(false); // ✅ FIX
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
  const renderInput = (label, name) => (
    <div style={{ marginBottom: "10px" }}>
      <label>{label}</label>

      <input
        name={name}
        value={formData[name] || ""}
        onChange={handleChange}
        style={{
          border: errors[name]
            ? "2px solid red"
            : "1px solid #ccc",
          padding: "6px",
          width: "100%"
        }}
      />

      {errors[name] && (
        <p style={{ color: "red", margin: 0 }}>
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <div>
      <h2>Motion Corp Dealer Registration</h2>

      <form onSubmit={handleSubmit}>

        <h3>Business</h3>
        {renderInput("Business Name", "business_name")}
        {renderInput("Trade Name", "trade_name")}

        <select
          name="business_type"
          value={formData.business_type}
          onChange={handleChange}
        >
          <option value="">Select Business Type</option>
          <option>Proprietorship</option>
          <option>Partnership</option>
          <option>Private Limited</option>
          <option>LLP</option>
        </select>

        {renderInput("PAN Number", "pan_number")}
        {renderInput("GST Number", "gst_number")}

        <h3>Owner</h3>
        {renderInput("Owner Name", "owner_name")}
        {renderInput("Owner Mobile", "owner_mobile")}
        {renderInput("Owner Email", "owner_email")}

        <h3>Location</h3>
        {renderInput("Address", "showroom_address")}
        {renderInput("City", "city")}
        {renderInput("State", "state")}
        {renderInput("Pincode", "pincode")}

        <h3>Bank (OCR)</h3>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleChequeUpload}
        />

        {renderInput("Bank Name", "bank_name")}
        {renderInput("Branch Name", "branch_name")}
        {renderInput("Account Holder", "account_holder_name")}
        {renderInput("Account Number", "account_number")}
        {renderInput("IFSC", "ifsc_code")}

        <h3>EV Details</h3>
        {renderInput("Battery Type", "battery_type")}
        {renderInput("Battery Name", "battery_name")}
        {renderInput("Model", "e_rickshaw_model")}

        <button
  type="submit"
  disabled={loading || Object.keys(errors).length > 0}
>
  {loading ? "Creating Dealer..." : "Create Dealer"}
</button>

      </form>

      {message && (
  <p style={{
    color: message.includes("❌") ? "red" : "green",
    fontWeight: "bold"
  }}>
    {message}
  </p>
)}
    </div>
  );
};

export default MotionCorpDealerEntry;