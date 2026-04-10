// import React, { useState, useEffect } from "react";
// import api from "../../api/api";
// import axios from "axios";

// const HeliumManualEntry = () => {
//   const [formData, setFormData] = useState({
//     login_date: "",
//     app_id: "",
//     // new split fields
//     first_name: "",
//     last_name: "",
//     customer_name: "",
//     gender: "",
//     dob: "",
//     father_name: "",
//     mother_name: "",
//     mobile_number: "",
//     email_id: "",
//     pan_number: "",
//     aadhar_number: "",
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
//     loan_amount: "",
//     interest_rate: "",
//     loan_tenure: "",
//     pre_emi: "",
//     processing_fee: "",
//     // NEW fields for BRE / policy
//     customer_type: "",        // e.g. "Family" / "Individual"
//     employment_type: "",      // e.g. "Salaried" / "Business" / "Others"
//     net_monthly_income: "",
//     avg_monthly_rent: "",
//     residence_type: "",       // optional, if you want to use it later
//     // backend auto:
//     status: "Login",
//     product: "HELIUM",
//     lender: "FINTREE",
//   });

//   const [errors, setErrors] = useState({});
//   const [message, setMessage] = useState("");
//   const [loading, setLoading] = useState(false);

//   // Required fields
//   const requiredFields = [
//     "login_date",
//     "app_id",
//     "first_name",
//     "last_name",
//     "customer_name",
//     "gender",
//     "dob",
//     "father_name",
//     "mobile_number",
//     "pan_number",
//     "aadhar_number",
//     "current_address",
//     "current_village_city",
//     "current_district",
//     "current_state",
//     "current_pincode",
//     "loan_amount",
//     "interest_rate",
//     "loan_tenure",
//     // BRE-critical
//     "customer_type",
//     "employment_type",
//     "net_monthly_income",
//     "avg_monthly_rent",
//   ];

//   // Auto-fill pincode
//   useEffect(() => {
//     if (formData.current_pincode.length === 6) handlePincodeBlur();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [formData.current_pincode]);

//   const handlePincodeBlur = async () => {
//     const pin = formData.current_pincode?.trim();
//     if (!pin || pin.length !== 6) return;

//     try {
//       const res = await axios.get(
//         `https://api.postalpincode.in/pincode/${pin}`
//       );
//       const data = res.data[0];

//       if (data.Status === "Success" && data.PostOffice?.length > 0) {
//         const office = data.PostOffice[0];

//         setFormData((prev) => ({
//           ...prev,
//           current_state: office.State || prev.current_state,
//           current_district: office.District || prev.current_district,
//         }));

//         setMessage(`✅ Pincode matched: ${office.District}, ${office.State}`);
//       } else {
//         setMessage("⚠️ Invalid or not found pincode.");
//       }
//     } catch (err) {
//       setMessage("⚠️ Could not fetch pincode details. Please fill manually.");
//     }
//   };

//   // Input change handler
//   const handleChange = (e) => {
//     const { name, value } = e.target;

//     setFormData((prev) => {
//       const updated = { ...prev, [name]: value };

//       // Optional: auto-build customer_name from first + last
//       if (name === "first_name" || name === "last_name") {
//         const first = name === "first_name" ? value : updated.first_name;
//         const last = name === "last_name" ? value : updated.last_name;
//         updated.customer_name = `${first || ""} ${last || ""}`.trim();
//       }

//       return updated;
//     });

//     if (errors[name]) {
//       setErrors((prev) => ({ ...prev, [name]: "" }));
//     }
//   };

//   // Validate before submit
//   const validateForm = () => {
//     const newErrors = {};
//     requiredFields.forEach((field) => {
//       if (!formData[field] || String(formData[field]).trim() === "") {
//         newErrors[field] = "This field is required.";
//       }
//     });
//     setErrors(newErrors);
//     return Object.keys(newErrors).length === 0;
//   };

//   // Submit form
//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setMessage("");

//     if (!validateForm()) {
//       setMessage("❌ Please fill all required fields.");
//       return;
//     }

//     setLoading(true);
//     try {
//       const res = await api.post("helium-loans/manual-entry", formData);

//       setMessage(`✅ ${res.data.message} | LAN: ${res.data.lan}`);

//       // Reset form after submission
//       setFormData({
//         login_date: "",
//         app_id: "",
//         first_name: "",
//         last_name: "",
//         customer_name: "",
//         gender: "",
//         dob: "",
//         father_name: "",
//         mother_name: "",
//         mobile_number: "",
//         email_id: "",
//         pan_number: "",
//         aadhar_number: "",
//         current_address: "",
//         current_village_city: "",
//         current_district: "",
//         current_state: "",
//         current_pincode: "",
//         permanent_address: "",
//         permanent_village_city: "",
//         permanent_district: "",
//         permanent_state: "",
//         permanent_pincode: "",
//         loan_amount: "",
//         interest_rate: "",
//         loan_tenure: "",
//         pre_emi: "",
//         processing_fee: "",
//         customer_type: "",
//         employment_type: "",
//         net_monthly_income: "",
//         avg_monthly_rent: "",
//         residence_type: "",
//         status: "Login",
//         product: "HELIUM",
//         lender: "FINTREE",
//       });
//     } catch (err) {
//       setMessage(
//         `❌ ${
//           err.response?.data?.message ||
//           "Something went wrong. Please try again."
//         }`
//       );
//     } finally {
//       setLoading(false);
//     }
//   };

//   // Render input control
//   const renderInput = (label, name, type = "text") => (
//     <div className="form-group">
//       <label>
//         {label}{" "}
//         {requiredFields.includes(name) && <span className="req">*</span>}
//       </label>
//       <input
//         type={type}
//         name={name}
//         value={formData[name]}
//         onChange={handleChange}
//         className={errors[name] ? "error-input" : ""}
//       />
//       {errors[name] && <p className="error-text">{errors[name]}</p>}
//     </div>
//   );

//   return (
//     <div className="manual-entry-container">
//       <h2>HELIUM Loan Manual Entry</h2>

//       <form onSubmit={handleSubmit}>
//         {/* Borrower Details */}
//         <fieldset>
//           <legend>Borrower Details</legend>

//           {renderInput("Login Date", "login_date", "date")}
//           {renderInput("Application ID", "app_id")}
//           {renderInput("First Name", "first_name")}
//           {renderInput("Last Name", "last_name")}
//           {renderInput("Customer Full Name", "customer_name")}
//           {renderInput("Gender", "gender")}
//           {renderInput("Date of Birth", "dob", "date")}
//           {renderInput("Father Name", "father_name")}
//           {renderInput("Mother Name", "mother_name")}
//           {renderInput("Mobile Number", "mobile_number", "number")}
//           {renderInput("Email ID", "email_id", "email")}
//           {renderInput("PAN Number", "pan_number")}
//           {renderInput("Aadhar Number", "aadhar_number", "number")}
//         </fieldset>

//         {/* Current Address */}
//         <fieldset>
//           <legend>Current Address</legend>

//           {renderInput("Address", "current_address")}
//           {renderInput("Village / City", "current_village_city")}
//           {renderInput("Pincode", "current_pincode", "number")}
//           {renderInput("District", "current_district")}
//           {renderInput("State", "current_state")}
//         </fieldset>

//         {/* Permanent Address */}
//         <fieldset>
//           <legend>Permanent Address</legend>

//           {renderInput("Address", "permanent_address")}
//           {renderInput("Village / City", "permanent_village_city")}
//           {renderInput("Pincode", "permanent_pincode", "number")}
//           {renderInput("District", "permanent_district")}
//           {renderInput("State", "permanent_state")}
//         </fieldset>

//         {/* Profile / Income Details (for BRE) */}
//         <fieldset>
//           <legend>Profile & Income Details</legend>

//           {renderInput("Customer Type (Family / Individual)", "customer_type")}
//           {renderInput(
//             "Employment Type (Salaried / Business / Others)",
//             "employment_type"
//           )}
//           {renderInput(
//             "Net Monthly Income",
//             "net_monthly_income",
//             "number"
//           )}
//           {renderInput(
//             "Average Monthly Rent",
//             "avg_monthly_rent",
//             "number"
//           )}
//           {renderInput("Residence Type (Owned / Rented)", "residence_type")}
//         </fieldset>

//         {/* Loan Details */}
//         <fieldset>
//           <legend>Loan Details</legend>

//           {renderInput("Loan Amount", "loan_amount", "number")}
//           {renderInput("Interest Rate (%)", "interest_rate", "number")}
//           {renderInput("Loan Tenure (months)", "loan_tenure", "number")}
//         </fieldset>

//         {/* Charges */}
//         <fieldset>
//           <legend>Charges</legend>

//           {renderInput("Pre EMI", "pre_emi", "number")}
//           {renderInput("Processing Fee", "processing_fee", "number")}
//         </fieldset>

//         <button type="submit" disabled={loading}>
//           {loading ? "Submitting..." : "Submit Loan"}
//         </button>
//       </form>

//       {message && <div className="message">{message}</div>}

//       {/* Styling same as EV form */}
//       <style>{`
//         .manual-entry-container {
//           max-width: 900px;
//           margin: 2rem auto;
//           background: #fafafa;
//           padding: 2rem;
//           border-radius: 10px;
//           box-shadow: 0 0 10px rgba(0,0,0,0.1);
//         }
//         h2 {
//           text-align: center;
//           margin-bottom: 1.5rem;
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
//         input {
//           padding: 8px;
//           border: 1px solid #ccc;
//           border-radius: 4px;
//         }
//         .req {
//           color: red;
//         }
//         .error-input {
//           border-color: red;
//           background-color: #fff0f0;
//         }
//         .error-text {
//           color: red;
//           font-size: 0.85rem;
//           margin-top: 3px;
//         }
//         button {
//           background-color: #007bff;
//           color: white;
//           border: none;
//           padding: 10px 20px;
//           font-size: 16px;
//           cursor: pointer;
//           border-radius: 6px;
//         }
//         button:disabled {
//           background-color: #999;
//         }
//         .message {
//           margin-top: 1rem;
//           padding: 0.8rem;
//           border-radius: 6px;
//           background: #f0f0f0;
//           font-weight: 600;
//           text-align: center;
//         }
//       `}</style>
//     </div>
//   );
// };

// export default HeliumManualEntry;


///////////////////////

import React, { useState, useEffect } from "react";
import api from "../../api/api";
import axios from "axios";

const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`; // e.g. 2025-12-02
};




const HeliumManualEntry = () => {
  const [formData, setFormData] = useState({
      login_date: getTodayDateString(), // ✅ auto-fetch current date
    
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
    interest_rate: "17", // ✅ fixed 17
    loan_tenure: "11",   // ✅ fixed 11
    // removed from UI, but kept in payload (backend expects fields)
    pre_emi: "",
    processing_fee: "",
    // NEW fields for BRE / policy
    customer_type: "",        // Dropdown now
    employment_type: "",      // Dropdown now
    net_monthly_income: "",
    avg_monthly_rent: "",
    residence_type: "",       // Dropdown now
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
    "permanent_address",
    "permanent_village_city",
    "permanent_district",
    "permanent_state",
    "permanent_pincode",
    "loan_amount",
    "interest_rate",
    "loan_tenure",
    // BRE-critical
    "customer_type",
    "employment_type",
    "net_monthly_income",
    "avg_monthly_rent",
  ];

  // 🔁 Pincode → District & State for both current and permanent
  useEffect(() => {
    if (formData.current_pincode.length === 6) {
      handlePincodeLookup(formData.current_pincode, "current");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.current_pincode]);

  useEffect(() => {
    if (formData.permanent_pincode.length === 6) {
      handlePincodeLookup(formData.permanent_pincode, "permanent");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.permanent_pincode]);

  const handlePincodeLookup = async (pin, type) => {
    const trimmed = pin?.trim();
    if (!trimmed || trimmed.length !== 6) return;

    try {
      const res = await axios.get(
        `https://api.postalpincode.in/pincode/${trimmed}`
      );
      const data = res.data[0];

      if (data.Status === "Success" && data.PostOffice?.length > 0) {
        const office = data.PostOffice[0];
        const prefix = type === "current" ? "current" : "permanent";

        setFormData((prev) => ({
          ...prev,
          [`${prefix}_state`]: office.State || prev[`${prefix}_state`],
          [`${prefix}_district`]: office.District || prev[`${prefix}_district`],
        }));

        setMessage(
          `✅ ${type === "current" ? "Current" : "Permanent"} pincode matched: ${office.District}, ${office.State}`
        );
      } else {
        setMessage("⚠️ Invalid or not found pincode.");
      }
    } catch (err) {
      setMessage(
        "⚠️ Could not fetch pincode details. Please fill District & State manually."
      );
    }
  };

  // Input change handler with length/format control
  const handleChange = (e) => {
    const { name, value } = e.target;

    let newValue = value;

    // ✅ PAN: max 10 chars, uppercase, alphanumeric
    if (name === "pan_number") {
      newValue = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    }

    // ✅ Mobile: digits only, max 10
    if (name === "mobile_number") {
      newValue = value.replace(/\D/g, "").slice(0, 10);
    }

    // ✅ Aadhaar: digits only, max 12
    if (name === "aadhar_number") {
      newValue = value.replace(/\D/g, "").slice(0, 12);
    }

    // ✅ Pincode: digits only, max 6
    if (name === "current_pincode" || name === "permanent_pincode") {
      newValue = value.replace(/\D/g, "").slice(0, 6);
    }

    // ✅ Numeric-only fields (money)
  if (
    name === "net_monthly_income" ||
    name === "avg_monthly_rent" ||
    name === "loan_amount"
  ) {
    newValue = value.replace(/[^\d]/g, ""); // only digits allowed
  }
  // ✅ Account number digits only (optional length cap)
  if (name === "account_number") {
    newValue = value.replace(/\D/g, "").slice(0, 20); // adjust length as per your policy
  }

  // ✅ IFSC upper-case, alphanumeric, max 11
  if (name === "ifsc") {
    newValue = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
  }

    setFormData((prev) => {
      const updated = { ...prev, [name]: newValue };

      // Auto-build customer_name from first + last
      if (name === "first_name" || name === "last_name") {
        const first = name === "first_name" ? newValue : updated.first_name;
        const last = name === "last_name" ? newValue : updated.last_name;
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

    // Required check
    requiredFields.forEach((field) => {
      if (!formData[field] || String(formData[field]).trim() === "") {
        newErrors[field] = "This field is required.";
      }
    });

    // Extra validations
    if (formData.pan_number && formData.pan_number.length !== 10) {
      newErrors.pan_number = "PAN must be exactly 10 characters.";
    }

    if (formData.mobile_number && formData.mobile_number.length !== 10) {
      newErrors.mobile_number = "Mobile number must be exactly 10 digits.";
    }

    if (formData.aadhar_number && formData.aadhar_number.length !== 12) {
      newErrors.aadhar_number = "Aadhaar number must be exactly 12 digits.";
    }

    if (formData.current_pincode && formData.current_pincode.length !== 6) {
      newErrors.current_pincode = "Pincode must be 6 digits.";
    }

    if (
      formData.permanent_pincode &&
      formData.permanent_pincode.length !== 6
    ) {
      newErrors.permanent_pincode = "Pincode must be 6 digits.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!validateForm()) {
      setMessage("❌ Please fix the highlighted fields.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("helium-loans/manual-entry", formData);

      setMessage(`✅ ${res.data.message} | LAN: ${res.data.lan}`);

      // Reset form after submission
      setFormData({
        login_date: getTodayDateString(), // reset to today's date
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
        interest_rate: "17",
        loan_tenure: "11",
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
  const renderInput = (label, name, type = "text", extraProps = {}) => (
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
        {...extraProps}
      />
      {errors[name] && <p className="error-text">{errors[name]}</p>}
    </div>
  );

  // Render select (dropdown)
  const renderSelect = (label, name, options) => (
    <div className="form-group">
      <label>
        {label}{" "}
        {requiredFields.includes(name) && <span className="req">*</span>}
      </label>
      <select
        name={name}
        value={formData[name]}
        onChange={handleChange}
        className={errors[name] ? "error-input" : ""}
      >
        <option value="">-- Select --</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
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

      <div className="form-group">
        <label>
          Login Date <span className="req">*</span>
        </label>
        <input
          type="date"
          name="login_date"
          value={formData.login_date}
          readOnly
          disabled   // user cannot change it
        />
      </div>

      {renderInput("First Name", "first_name")}
      {renderInput("Last Name", "last_name")}
      {renderInput("Customer Full Name", "customer_name")}
      {renderSelect("Gender", "gender", ["Male", "Female", "Other"])}
      {renderInput("Date of Birth", "dob", "date")}
      {renderInput("Father Name", "father_name")}
      {renderInput("Mother Name", "mother_name")}
      {renderInput("Mobile Number", "mobile_number", "tel")}
      {renderInput("Email ID", "email_id", "email")}
      {renderInput("PAN Number", "pan_number")}
      {renderInput("Aadhaar Number", "aadhar_number", "tel")}
    </fieldset>

    {/* Current / Property Address */}
    <fieldset>
      <legend>Current / Property Address</legend>

      {renderInput("Address", "current_address")}
      {renderInput("Village / City", "current_village_city")}
      {renderInput("Pincode", "current_pincode", "tel")}
      {renderInput("District", "current_district")}
      {renderInput("State", "current_state")}
    </fieldset>

    {/* Permanent Address */}
    <fieldset>
      <legend>Permanent Address</legend>

      {renderInput("Address", "permanent_address")}
      {renderInput("Village / City", "permanent_village_city")}
      {renderInput("Pincode", "permanent_pincode", "tel")}
      {renderInput("District", "permanent_district")}
      {renderInput("State", "permanent_state")}
    </fieldset>

    {/* Profile / Income Details (for BRE) */}
    <fieldset>
      <legend>Profile & Income Details</legend>

      {renderSelect("Customer Type (Family / Individual)", "customer_type", [
        "Family",
        "Individual",
      ])}

      {renderSelect(
        "Employment Type (Salaried / Business / Others)",
        "employment_type",
        ["Salaried", "Business", "Others"]
      )}

      {renderInput("Net Monthly Income", "net_monthly_income", "number")}
      {renderInput("Average Monthly Rent", "avg_monthly_rent", "number")}

      {renderSelect(
        "Residence Type (Owned / Rented)",
        "residence_type",
        ["Owned", "Rented"]
      )}
    </fieldset>

    {/* Bank Details */}
    <fieldset>
      <legend>Bank Details</legend>

      {renderInput("Bank Name", "bank_name")}
      {renderInput("Name as per Bank", "name_in_bank")}
      {renderInput("Account Number", "account_number", "tel")}
      {renderInput("IFSC Code", "ifsc")}
    </fieldset>

    {/* Loan Details */}
    <fieldset>
      <legend>Loan Details</legend>

      {renderInput("Loan Amount", "loan_amount", "number")}
      {renderInput("Interest Rate (%)", "interest_rate", "number", {
        readOnly: true,
      })}
      {renderInput("Loan Tenure (months)", "loan_tenure", "number", {
        readOnly: true,
      })}
    </fieldset>

    {/* Charges removed: pre_emi & processing_fee no longer shown */}

    <button type="submit" disabled={loading}>
      {loading ? "Submitting..." : "Submit Loan"}
    </button>
  </form>

  {message && <div className="message">{message}</div>}

      {/* Styling same as EV form */}
      <style>{`

.manual-entry-container {
  max-width: 1100px;
  margin: 30px auto;
  background: white;
  padding: 36px 42px;
  border-radius: 18px;
  box-shadow: 0 20px 50px rgba(15,23,42,0.08);
  font-family: Inter, system-ui, sans-serif;
}

/* HEADER */

h2 {
  text-align: center;
  font-size: 28px;
  font-weight: 700;
  // color: #0f172a;
    color: #1e3a8a; /* Fintree logo blue */

  margin-bottom: 30px;
}

/* FIELDSET CARD STYLE */

fieldset {
  border: none;
  background: #f8fafc;
  border-radius: 14px;
  padding: 28px 26px;
  margin-bottom: 28px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px 24px;
  position: relative;
}

/* SECTION TITLE */

legend {
  position: relative;
  top: 0;
  left: 0;
  background: transparent;
  border: none;
  padding: 0;
  margin-bottom: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #1e3a8a; /* Fintree logo blue */
}

/* FORM GROUP */

.form-group {
  display: flex;
  flex-direction: column;
}

/* LABEL */

label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 5px;
}

/* INPUTS */

// input,
// select {
//   height: 42px;
//   border-radius: 8px;
//   border: 1px solid #cbd5e1;
//   padding: 0 12px;
//   font-size: 14px;
//   background: white;
//   transition: 0.2s ease;
// }

// input:focus,
// select:focus {
//   outline: none;
//   border-color: #4f46e5;
//   box-shadow: 0 0 0 2px rgba(79,70,229,0.12);
// }
input,
select {
  height: 44px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  padding: 0 14px;
  font-size: 14px;
  background: #f8fafc;
  color: #0f172a;
  transition: all 0.2s ease;
}

/* Hover effect */
input:hover,
select:hover {
  border-color: #1e3a8a;
  background: #ffffff;
}

/* Focus effect (Fintree blue glow) */
input:focus,
select:focus {
  outline: none;
  border-color: #1e3a8a;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(30,58,138,0.15);
}

/* Readonly fields */
input[readonly],
input:disabled {
  background: #eef2f7;
  color: #64748b;
  cursor: not-allowed;
}

/* Error styling */
.error-input {
  border-color: #ef4444;
  background: #fff1f2;
}

.error-input:focus {
  box-shadow: 0 0 0 3px rgba(239,68,68,0.18);
}
/* REQUIRED MARK */

.req {
  color: #ef4444;
}

/* ERROR INPUT */

.error-input {
  border-color: #ef4444;
  background: #fff1f2;
}

/* ERROR MESSAGE */

.error-text {
  font-size: 12px;
  margin-top: 3px;
  color: #ef4444;
}

/* SUBMIT BUTTON */

button {
  margin-top: 10px;
  width: 220px;
  height: 46px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg,#16a34a,#22c55e);
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: 0.25s ease;
}

button:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(34,197,94,0.35);
}

button:disabled {
  background: #94a3b8;
  cursor: not-allowed;
  box-shadow: none;
}

button:disabled {
  background: #94a3b8;
  cursor: not-allowed;
  box-shadow: none;
}

/* SUCCESS MESSAGE */

.message {
  margin-top: 18px;
  padding: 14px;
  border-radius: 10px;
  background: #ecfdf5;
  color: #065f46;
  font-weight: 600;
  text-align: center;
}

/* MOBILE RESPONSIVE */

@media (max-width: 768px) {

  fieldset {
    grid-template-columns: 1fr;
  }

  .manual-entry-container {
    padding: 28px 22px;
  }

  button {
    width: 100%;
  }

}

`}</style>
      {/* <style>{`
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
        input, select {
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
      `}</style> */}
    </div>
  );
};

export default HeliumManualEntry;
