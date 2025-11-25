import React, { useState, useEffect } from "react";
import api from "../../api/api";
import axios from "axios";

const HeliumManualEntry = () => {
  const [formData, setFormData] = useState({
    login_date: "",
    app_id: "",
    // new split fields
    first_name: "",
    last_name: "",
    customer_name: "",
    gender: "",
    dob: "",
    father_name: "",
    mother_name: "",
    mobile_number: "",
    email_id: "",
    pan_number: "",
    aadhar_number: "",
    current_address: "",
    current_village_city: "",
    current_district: "",
    current_state: "",
    current_pincode: "",
    permanent_address: "",
    permanent_village_city: "",
    permanent_district: "",
    permanent_state: "",
    permanent_pincode: "",
    loan_amount: "",
    interest_rate: "",
    loan_tenure: "",
    pre_emi: "",
    processing_fee: "",
    // NEW fields for BRE / policy
    customer_type: "",        // e.g. "Family" / "Individual"
    employment_type: "",      // e.g. "Salaried" / "Business" / "Others"
    net_monthly_income: "",
    avg_monthly_rent: "",
    residence_type: "",       // optional, if you want to use it later
    // backend auto:
    status: "Login",
    product: "HELIUM",
    lender: "FINTREE",
  });

  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Required fields
  const requiredFields = [
    "login_date",
    "app_id",
    "first_name",
    "last_name",
    "customer_name",
    "gender",
    "dob",
    "father_name",
    "mobile_number",
    "pan_number",
    "aadhar_number",
    "current_address",
    "current_village_city",
    "current_district",
    "current_state",
    "current_pincode",
    "loan_amount",
    "interest_rate",
    "loan_tenure",
    // BRE-critical
    "customer_type",
    "employment_type",
    "net_monthly_income",
    "avg_monthly_rent",
  ];

  // Auto-fill pincode
  useEffect(() => {
    if (formData.current_pincode.length === 6) handlePincodeBlur();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.current_pincode]);

  const handlePincodeBlur = async () => {
    const pin = formData.current_pincode?.trim();
    if (!pin || pin.length !== 6) return;

    try {
      const res = await axios.get(
        `https://api.postalpincode.in/pincode/${pin}`
      );
      const data = res.data[0];

      if (data.Status === "Success" && data.PostOffice?.length > 0) {
        const office = data.PostOffice[0];

        setFormData((prev) => ({
          ...prev,
          current_state: office.State || prev.current_state,
          current_district: office.District || prev.current_district,
        }));

        setMessage(`✅ Pincode matched: ${office.District}, ${office.State}`);
      } else {
        setMessage("⚠️ Invalid or not found pincode.");
      }
    } catch (err) {
      setMessage("⚠️ Could not fetch pincode details. Please fill manually.");
    }
  };

  // Input change handler
  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      const updated = { ...prev, [name]: value };

      // Optional: auto-build customer_name from first + last
      if (name === "first_name" || name === "last_name") {
        const first = name === "first_name" ? value : updated.first_name;
        const last = name === "last_name" ? value : updated.last_name;
        updated.customer_name = `${first || ""} ${last || ""}`.trim();
      }

      return updated;
    });

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // Validate before submit
  const validateForm = () => {
    const newErrors = {};
    requiredFields.forEach((field) => {
      if (!formData[field] || String(formData[field]).trim() === "") {
        newErrors[field] = "This field is required.";
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!validateForm()) {
      setMessage("❌ Please fill all required fields.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("helium-loans/manual-entry", formData);

      setMessage(`✅ ${res.data.message} | LAN: ${res.data.lan}`);

      // Reset form after submission
      setFormData({
        login_date: "",
        app_id: "",
        first_name: "",
        last_name: "",
        customer_name: "",
        gender: "",
        dob: "",
        father_name: "",
        mother_name: "",
        mobile_number: "",
        email_id: "",
        pan_number: "",
        aadhar_number: "",
        current_address: "",
        current_village_city: "",
        current_district: "",
        current_state: "",
        current_pincode: "",
        permanent_address: "",
        permanent_village_city: "",
        permanent_district: "",
        permanent_state: "",
        permanent_pincode: "",
        loan_amount: "",
        interest_rate: "",
        loan_tenure: "",
        pre_emi: "",
        processing_fee: "",
        customer_type: "",
        employment_type: "",
        net_monthly_income: "",
        avg_monthly_rent: "",
        residence_type: "",
        status: "Login",
        product: "HELIUM",
        lender: "FINTREE",
      });
    } catch (err) {
      setMessage(
        `❌ ${
          err.response?.data?.message ||
          "Something went wrong. Please try again."
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  // Render input control
  const renderInput = (label, name, type = "text") => (
    <div className="form-group">
      <label>
        {label}{" "}
        {requiredFields.includes(name) && <span className="req">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={formData[name]}
        onChange={handleChange}
        className={errors[name] ? "error-input" : ""}
      />
      {errors[name] && <p className="error-text">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="manual-entry-container">
      <h2>HELIUM Loan Manual Entry</h2>

      <form onSubmit={handleSubmit}>
        {/* Borrower Details */}
        <fieldset>
          <legend>Borrower Details</legend>

          {renderInput("Login Date", "login_date", "date")}
          {renderInput("Application ID", "app_id")}
          {renderInput("First Name", "first_name")}
          {renderInput("Last Name", "last_name")}
          {renderInput("Customer Full Name", "customer_name")}
          {renderInput("Gender", "gender")}
          {renderInput("Date of Birth", "dob", "date")}
          {renderInput("Father Name", "father_name")}
          {renderInput("Mother Name", "mother_name")}
          {renderInput("Mobile Number", "mobile_number", "number")}
          {renderInput("Email ID", "email_id", "email")}
          {renderInput("PAN Number", "pan_number")}
          {renderInput("Aadhar Number", "aadhar_number", "number")}
        </fieldset>

        {/* Current Address */}
        <fieldset>
          <legend>Current Address</legend>

          {renderInput("Address", "current_address")}
          {renderInput("Village / City", "current_village_city")}
          {renderInput("Pincode", "current_pincode", "number")}
          {renderInput("District", "current_district")}
          {renderInput("State", "current_state")}
        </fieldset>

        {/* Permanent Address */}
        <fieldset>
          <legend>Permanent Address</legend>

          {renderInput("Address", "permanent_address")}
          {renderInput("Village / City", "permanent_village_city")}
          {renderInput("Pincode", "permanent_pincode", "number")}
          {renderInput("District", "permanent_district")}
          {renderInput("State", "permanent_state")}
        </fieldset>

        {/* Profile / Income Details (for BRE) */}
        <fieldset>
          <legend>Profile & Income Details</legend>

          {renderInput("Customer Type (Family / Individual)", "customer_type")}
          {renderInput(
            "Employment Type (Salaried / Business / Others)",
            "employment_type"
          )}
          {renderInput(
            "Net Monthly Income",
            "net_monthly_income",
            "number"
          )}
          {renderInput(
            "Average Monthly Rent",
            "avg_monthly_rent",
            "number"
          )}
          {renderInput("Residence Type (Owned / Rented)", "residence_type")}
        </fieldset>

        {/* Loan Details */}
        <fieldset>
          <legend>Loan Details</legend>

          {renderInput("Loan Amount", "loan_amount", "number")}
          {renderInput("Interest Rate (%)", "interest_rate", "number")}
          {renderInput("Loan Tenure (months)", "loan_tenure", "number")}
        </fieldset>

        {/* Charges */}
        <fieldset>
          <legend>Charges</legend>

          {renderInput("Pre EMI", "pre_emi", "number")}
          {renderInput("Processing Fee", "processing_fee", "number")}
        </fieldset>

        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Submit Loan"}
        </button>
      </form>

      {message && <div className="message">{message}</div>}

      {/* Styling same as EV form */}
      <style>{`
        .manual-entry-container {
          max-width: 900px;
          margin: 2rem auto;
          background: #fafafa;
          padding: 2rem;
          border-radius: 10px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        h2 {
          text-align: center;
          margin-bottom: 1.5rem;
        }
        fieldset {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 1rem 1.5rem;
          margin-bottom: 1.5rem;
        }
        legend {
          padding: 0 10px;
          font-weight: bold;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          margin-bottom: 0.8rem;
        }
        label {
          font-weight: 600;
          margin-bottom: 4px;
        }
        input {
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        .req {
          color: red;
        }
        .error-input {
          border-color: red;
          background-color: #fff0f0;
        }
        .error-text {
          color: red;
          font-size: 0.85rem;
          margin-top: 3px;
        }
        button {
          background-color: #007bff;
          color: white;
          border: none;
          padding: 10px 20px;
          font-size: 16px;
          cursor: pointer;
          border-radius: 6px;
        }
        button:disabled {
          background-color: #999;
        }
        .message {
          margin-top: 1rem;
          padding: 0.8rem;
          border-radius: 6px;
          background: #f0f0f0;
          font-weight: 600;
          text-align: center;
        }
      `}</style>
    </div>
  );
};

export default HeliumManualEntry;
