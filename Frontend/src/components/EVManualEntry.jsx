import React, { useState, useEffect } from "react";
import api from "../api/api";
import axios from "axios";

const EVManualEntry = () => {
  const [formData, setFormData] = useState({
    lenderType: "EV Loan",
    LOGIN_DATE: "",
    Customer_Name: "",
    Borrower_DOB: "",
    Father_Name: "",
    Address_Line_1: "",
    Address_Line_2: "",
    Village: "",
    District: "",
    State: "",
    Pincode: "",
    Mobile_Number: "",
    Email: "",
    Loan_Amount: "",
    Interest_Rate: "",
    Tenure: "",
    EMI_Amount: "",
    GURANTOR: "",
    GURANTOR_DOB: "",
    GURANTOR_ADHAR: "",
    GURANTOR_PAN: "",
    DEALER_NAME: "",
    Name_in_Bank: "",
    Bank_name: "",
    Account_Number: "",
    IFSC: "",
    Aadhar_Number: "",
    Pan_Card: "",
    Product: "Monthly Loan",
    lender: "EV Loan",
    status: "Login",
    Disbursal_Amount: "",
    Processing_Fee: "",
    CIBIL_Score: "",
    GURANTOR_CIBIL_Score: "",
    Relationship_with_Borrower: "",
    Co_Applicant: "",
    Co_Applicant_DOB: "",
    Co_Applicant_AADHAR: "",
    Co_Applicant_PAN: "",
    Co_Applicant_CIBIL_Score: "",
    APR: "",
    Battery_Name: "",
    Battery_Type: "",
    Battery_Serial_no_1: "",
    Battery_Serial_no_2: "",
    E_Rikshaw_model: "",
    Chassis_no: "",
  });

  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
  if (formData.Pincode.length === 6) handlePincodeBlur();
}, [formData.Pincode]);


  // Required fields (frontend validation)
  const requiredFields = [
    "LOGIN_DATE",
    "Customer_Name",
    "Borrower_DOB",
    "Father_Name",
    "Mobile_Number",
    "Address_Line_1",
    "Village",
    "District",
    "State",
    "Pincode",
    "Loan_Amount",
    "Interest_Rate",
    "Tenure",
    "dealer_name",
    "GURANTOR",
    "GURANTOR_DOB",
    "GURANTOR_ADHAR",
    "GURANTOR_PAN",
    "name_in_bank",
    "bank_name",
    "account_number",
    "ifsc",
    "gst_no",
    "Aadhar_Number",
    "Pan_Card",
    "CIBIL_Score",
    "GURANTOR_CIBIL_Score",
    "Relationship_with_Borrower",
    "Battery_Name",
    "Battery_Type",
    "Battery_Serial_no_1",
    "E_Rikshaw_model",
    "Chassis_no",
    "customer_name_as_per_bank",
    "customer_bank_name",
    "customer_account_number",
    "bank_ifsc_code",
  ];

  // Handle input change
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error dynamically
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // Validate before submission
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

  const handlePincodeBlur = async () => {
  const pin = formData.Pincode?.trim();
  if (!pin || pin.length !== 6) return; // basic check

  try {
    const res = await axios.get(`https://api.postalpincode.in/pincode/${pin}`);
    const data = res.data[0];

    if (data.Status === "Success" && data.PostOffice?.length > 0) {
      const office = data.PostOffice[0];

      setFormData((prev) => ({
        ...prev,
        State: office.State || prev.State,
        District: office.District || prev.District,
      }));

      setMessage(`✅ Pincode matched: ${office.District}, ${office.State}`);
    } else {
      setMessage("⚠️ Invalid or not found pincode.");
    }
  } catch (err) {
    console.error("Error fetching pincode details:", err);
    setMessage("⚠️ Could not fetch pincode details. Please fill manually.");
  }
};


  // Submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!validateForm()) {
      setMessage("❌ Please fill all required fields.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("loan-booking/upload/ev-manual", formData);
      setMessage(`✅ ${res.data.message} | LAN: ${res.data.lan}`);

      // reset after success
      setFormData((prev) => ({
        ...prev,
        LOGIN_DATE: "",
    Customer_Name: "",
    Borrower_DOB: "",
    Father_Name: "",
    Address_Line_1: "",
    Address_Line_2: "",
    Village: "",
    District: "",
    State: "",
    trade_name: "",
    Pincode: "",
    Mobile_Number: "",
    Email: "",
    Loan_Amount: "",
    Interest_Rate: "",
    Tenure: "",
    EMI_Amount: "",
    GURANTOR: "",
    GURANTOR_DOB: "",
    GURANTOR_ADHAR: "",
    GURANTOR_PAN: "",
    customer_name_as_per_bank: "",
    customer_bank_name: "",
    customer_account_number: "",
    bank_ifsc_code: "",
    name_in_bank: "",
    bank_name: "",
    account_number: "",
    ifsc: "",
    Aadhar_Number: "",
    Pan_Card: "",
    gst_no: "",
    Disbursal_Amount: "",
    Processing_Fee: "",
    CIBIL_Score: "",
    GURANTOR_CIBIL_Score: "",
    Relationship_with_Borrower: "",
    Co_Applicant: "",
    Co_Applicant_DOB: "",
    Co_Applicant_AADHAR: "",
    Co_Applicant_PAN: "",
    Co_Applicant_CIBIL_Score: "",
    APR: "",
    Battery_Name: "",
    Battery_Type: "",
    Battery_Serial_no_1: "",
    Battery_Serial_no_2: "",
    E_Rikshaw_model: "",
    Chassis_no: "",
    dealer_name: "",
    dealer_contact: "",
    dealer_address: "",
    }));
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

  // Render input field with error
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
      <h2>EV Loan Manual Entry Form</h2>
      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>Borrower Details</legend>
          {renderInput("Login Date", "LOGIN_DATE", "date")}
          {renderInput("Customer Name", "Customer_Name")}
          {renderInput("Borrower DOB", "Borrower_DOB", "date")}
          {renderInput("Father Name", "Father_Name")}
          {renderInput("Mobile Number", "Mobile_Number", "number")}
          {renderInput("Email", "Email", "email")}
          {renderInput("Aadhar Number", "Aadhar_Number", "number")}
          {renderInput("Pan Card", "Pan_Card")}
        </fieldset>

        <fieldset>
          <legend>Address (Customer)</legend>
          {renderInput("Address Line 1", "Address_Line_1")}
          {renderInput("Address Line 2", "Address_Line_2")}
          {renderInput("Village", "Village")}
          <div className="form-group">
  <label>
    Pincode <span className="req">*</span>
  </label>
  <input
    type="number"
    name="Pincode"
    value={formData.Pincode}
    onChange={handleChange}
    onBlur={handlePincodeBlur}  // ✅ triggers auto-fill when user leaves field
    className={errors.Pincode ? "error-input" : ""}
  />
  {errors.Pincode && <p className="error-text">{errors.Pincode}</p>}
</div>

    {/* ✅ Read-only auto-filled fields */}
  <div className="form-group">
    <label>District</label>
    <input
      type="text"
      name="District"
      value={formData.District}
      readOnly
      style={{ backgroundColor: "#f9f9f9" }}
    />
  </div>

  <div className="form-group">
    <label>State</label>
    <input
      type="text"
      name="State"
      value={formData.State}
      readOnly
      style={{ backgroundColor: "#f9f9f9" }}
    />
  </div>

        </fieldset>

        <fieldset>
          <legend>Loan Details</legend>
          {renderInput("Loan Amount", "Loan_Amount", "number")}
          {renderInput("Interest Rate (%)", "Interest_Rate", "number")}
          {renderInput("Tenure (months)", "Tenure", "number")}
          {renderInput("EMI Amount", "EMI_Amount", "number")}
          {renderInput("CIBIL Score", "CIBIL_Score", "number")}
        </fieldset>

        <fieldset>
          <legend>Guarantor Details</legend>
          {renderInput("Guarantor Name", "GURANTOR")}
          {renderInput("Guarantor DOB", "GURANTOR_DOB", "date")}
          {renderInput("Guarantor Aadhar", "GURANTOR_ADHAR", "number")}
          {renderInput("Guarantor PAN", "GURANTOR_PAN")}
          {renderInput("Guarantor CIBIL", "GURANTOR_CIBIL_Score", "number")}
          {renderInput(
            "Relationship with Borrower",
            "Relationship_with_Borrower"
          )}
        </fieldset>

        <fieldset>
          <legend>Co-Applicant Details</legend>
          {renderInput("Co-Applicant Name", "Co_Applicant")}
          {renderInput("Co-Applicant DOB", "Co_Applicant_DOB", "date")}
          {renderInput("Co-Applicant Aadhar", "Co_Applicant_AADHAR", "number")}
          {renderInput("Co-Applicant PAN", "Co_Applicant_PAN")}
          {renderInput(
            "Co-Applicant CIBIL Score",
            "Co_Applicant_CIBIL_Score",
            "number"
          )}
        </fieldset>

        <fieldset>
          <legend>Bank Details (Customer)</legend>
          {renderInput("Customer Name", "customer_name_as_per_bank")}
          {renderInput("Bank Name", "customer_bank_name")}
          {renderInput("Account Number", "customer_account_number", "number")}
          {renderInput("IFSC Code", "bank_ifsc_code")}
        </fieldset>

        <fieldset>
          <legend>Dealer Details</legend>
          {renderInput("Trade Name", "trade_name")}
          {renderInput("Dealer Name", "dealer_name")}
          {renderInput("Contact No.", "dealer_contact", "number")}
          {renderInput("GST No.", "gst_no")}
          {renderInput("Dealer Address", "dealer_address")}
          {renderInput("Name in Bank", "name_in_bank")}
          {renderInput("Bank Name", "bank_name")}
          {renderInput("Account Number", "account_number", "number")}
          {renderInput("IFSC Code", "ifsc")}
        </fieldset>

        <fieldset>
          <legend>Product Details</legend>
          {renderInput("Battery Name", "Battery_Name")}
          {renderInput("Battery Type", "Battery_Type")}
          {renderInput("Battery Serial no 1", "Battery_Serial_no_1")}
          {renderInput("Battery Serial no 2", "Battery_Serial_no_2")}
          {renderInput("E-Rikshaw Model", "E_Rikshaw_model")}
          {renderInput("Chassis No", "Chassis_no")}
        </fieldset>

        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Submit Loan"}
        </button>
      </form>

      {message && <div className="message">{message}</div>}

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

export default EVManualEntry;
