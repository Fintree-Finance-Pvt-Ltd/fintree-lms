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
  const sections = [
    "Borrower Details",
    "Address",
    "Loan Details",
    "Guarantor Details",
    "Co-Applicant Details",
    "Bank Details",
    "Dealer Details",
    "Product Details",
  ];

  const [activeSection, setActiveSection] = useState(0);

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
        `❌ ${err.response?.data?.message ||
        "Something went wrong. Please try again."
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  //   // Render input field with error
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
  //       <h2>EV Loan Manual Entry Form</h2>
  //       <form onSubmit={handleSubmit}>
  //         <fieldset>
  //           <legend>Borrower Details</legend>
  //           {renderInput("Login Date", "LOGIN_DATE", "date")}
  //           {renderInput("Customer Name", "Customer_Name")}
  //           {renderInput("Borrower DOB", "Borrower_DOB", "date")}
  //           {renderInput("Father Name", "Father_Name")}
  //           {renderInput("Mobile Number", "Mobile_Number", "number")}
  //           {renderInput("Email", "Email", "email")}
  //           {renderInput("Aadhar Number", "Aadhar_Number", "number")}
  //           {renderInput("Pan Card", "Pan_Card")}
  //         </fieldset>

  //         <fieldset>
  //           <legend>Address (Customer)</legend>
  //           {renderInput("Address Line 1", "Address_Line_1")}
  //           {renderInput("Address Line 2", "Address_Line_2")}
  //           {renderInput("Village", "Village")}
  //           <div className="form-group">
  //   <label>
  //     Pincode <span className="req">*</span>
  //   </label>
  //   <input
  //     type="number"
  //     name="Pincode"
  //     value={formData.Pincode}
  //     onChange={handleChange}
  //     onBlur={handlePincodeBlur}  // ✅ triggers auto-fill when user leaves field
  //     className={errors.Pincode ? "error-input" : ""}
  //   />
  //   {errors.Pincode && <p className="error-text">{errors.Pincode}</p>}
  // </div>

  //     {/* ✅ Read-only auto-filled fields */}
  //   <div className="form-group">
  //     <label>District</label>
  //     <input
  //       type="text"
  //       name="District"
  //       onChange={handleChange}
  //       value={formData.District}
  //       style={{ backgroundColor: "#f9f9f9" }}
  //     />
  //   </div>

  //   <div className="form-group">
  //     <label>State</label>
  //     <input
  //       type="text"
  //       name="State"
  //       value={formData.State}
  //       onChange={handleChange}
  //       style={{ backgroundColor: "#f9f9f9" }}
  //     />
  //   </div>

  //         </fieldset>

  //         <fieldset>
  //           <legend>Loan Details</legend>
  //           {renderInput("Loan Amount", "Loan_Amount", "number")}
  //           {renderInput("Interest Rate (%)", "Interest_Rate", "number")}
  //           {renderInput("Tenure (months)", "Tenure", "number")}
  //           {renderInput("EMI Amount", "EMI_Amount", "number")}
  //           {renderInput("CIBIL Score", "CIBIL_Score", "number")}
  //         </fieldset>

  //         <fieldset>
  //           <legend>Guarantor Details</legend>
  //           {renderInput("Guarantor Name", "GURANTOR")}
  //           {renderInput("Guarantor DOB", "GURANTOR_DOB", "date")}
  //           {renderInput("Guarantor Aadhar", "GURANTOR_ADHAR", "number")}
  //           {renderInput("Guarantor PAN", "GURANTOR_PAN")}
  //           {renderInput("Guarantor CIBIL", "GURANTOR_CIBIL_Score", "number")}
  //           {renderInput(
  //             "Relationship with Borrower",
  //             "Relationship_with_Borrower"
  //           )}
  //         </fieldset>

  //         <fieldset>
  //           <legend>Co-Applicant Details</legend>
  //           {renderInput("Co-Applicant Name", "Co_Applicant")}
  //           {renderInput("Co-Applicant DOB", "Co_Applicant_DOB", "date")}
  //           {renderInput("Co-Applicant Aadhar", "Co_Applicant_AADHAR", "number")}
  //           {renderInput("Co-Applicant PAN", "Co_Applicant_PAN")}
  //           {renderInput(
  //             "Co-Applicant CIBIL Score",
  //             "Co_Applicant_CIBIL_Score",
  //             "number"
  //           )}
  //         </fieldset>

  //         <fieldset>
  //           <legend>Bank Details (Customer)</legend>
  //           {renderInput("Customer Name", "customer_name_as_per_bank")}
  //           {renderInput("Bank Name", "customer_bank_name")}
  //           {renderInput("Account Number", "customer_account_number", "number")}
  //           {renderInput("IFSC Code", "bank_ifsc_code")}
  //         </fieldset>

  //         <fieldset>
  //           <legend>Dealer Details</legend>
  //           {renderInput("Trade Name", "trade_name")}
  //           {renderInput("Dealer Name", "dealer_name")}
  //           {renderInput("Contact No.", "dealer_contact", "number")}
  //           {renderInput("GST No.", "gst_no")}
  //           {renderInput("Dealer Address", "dealer_address")}
  //           {renderInput("Name in Bank", "name_in_bank")}
  //           {renderInput("Bank Name", "bank_name")}
  //           {renderInput("Account Number", "account_number", "number")}
  //           {renderInput("IFSC Code", "ifsc")}
  //         </fieldset>

  //         <fieldset>
  //           <legend>Product Details</legend>
  //           {renderInput("Battery Name", "Battery_Name")}
  //           {renderInput("Battery Type", "Battery_Type")}
  //           {renderInput("Battery Serial no 1", "Battery_Serial_no_1")}
  //           {renderInput("Battery Serial no 2", "Battery_Serial_no_2")}
  //           {renderInput("E-Rikshaw Model", "E_Rikshaw_model")}
  //           {renderInput("Chassis No", "Chassis_no")}
  //         </fieldset>

  //         <button type="submit" disabled={loading}>
  //           {loading ? "Submitting..." : "Submit Loan"}
  //         </button>
  //       </form>

  //       {message && <div className="message">{message}</div>}

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

  // export default EVManualEntry;



  // import React, { useState, useEffect } from "react";
  // import api from "../api/api";
  // import axios from "axios";

  // const EVManualEntry = () => {
  //   const sections = [
  //     "Borrower Details",
  //     "Address",
  //     "Loan Details",
  //     "Guarantor Details",
  //     "Co-Applicant Details",
  //     "Bank Details",
  //     "Dealer Details",
  //     "Product Details",
  //   ];

  //   const [activeSection, setActiveSection] = useState(0);

  //   const [formData, setFormData] = useState({
  //     lenderType: "EV Loan",
  //     LOGIN_DATE: "",
  //     Customer_Name: "",
  //     Borrower_DOB: "",
  //     Father_Name: "",
  //     Address_Line_1: "",
  //     Address_Line_2: "",
  //     Village: "",
  //     District: "",
  //     State: "",
  //     Pincode: "",
  //     Mobile_Number: "",
  //     Email: "",
  //     Loan_Amount: "",
  //     Interest_Rate: "",
  //     Tenure: "",
  //     EMI_Amount: "",
  //     GURANTOR: "",
  //     GURANTOR_DOB: "",
  //     GURANTOR_ADHAR: "",
  //     GURANTOR_PAN: "",
  //     DEALER_NAME: "",
  //     Name_in_Bank: "",
  //     Bank_name: "",
  //     Account_Number: "",
  //     IFSC: "",
  //     Aadhar_Number: "",
  //     Pan_Card: "",
  //     Product: "Monthly Loan",
  //     lender: "EV Loan",
  //     status: "Login",
  //     Disbursal_Amount: "",
  //     Processing_Fee: "",
  //     CIBIL_Score: "",
  //     GURANTOR_CIBIL_Score: "",
  //     Relationship_with_Borrower: "",
  //     Co_Applicant: "",
  //     Co_Applicant_DOB: "",
  //     Co_Applicant_AADHAR: "",
  //     Co_Applicant_PAN: "",
  //     Co_Applicant_CIBIL_Score: "",
  //     APR: "",
  //     Battery_Name: "",
  //     Battery_Type: "",
  //     Battery_Serial_no_1: "",
  //     Battery_Serial_no_2: "",
  //     E_Rikshaw_model: "",
  //     Chassis_no: "",
  //   });

  //   const [errors, setErrors] = useState({});
  //   const [message, setMessage] = useState("");
  //   const [loading, setLoading] = useState(false);

  //   const requiredFields = [
  //     "LOGIN_DATE",
  //     "Customer_Name",
  //     "Borrower_DOB",
  //     "Father_Name",
  //     "Mobile_Number",
  //     "Address_Line_1",
  //     "Village",
  //     "District",
  //     "State",
  //     "Pincode",
  //     "Loan_Amount",
  //     "Interest_Rate",
  //     "Tenure",
  //     "dealer_name",
  //     "GURANTOR",
  //     "GURANTOR_DOB",
  //     "GURANTOR_ADHAR",
  //     "GURANTOR_PAN",
  //     "name_in_bank",
  //     "bank_name",
  //     "account_number",
  //     "ifsc",
  //     "gst_no",
  //     "Aadhar_Number",
  //     "Pan_Card",
  //     "CIBIL_Score",
  //     "GURANTOR_CIBIL_Score",
  //     "Relationship_with_Borrower",
  //     "Battery_Name",
  //     "Battery_Type",
  //     "Battery_Serial_no_1",
  //     "E_Rikshaw_model",
  //     "Chassis_no",
  //     "customer_name_as_per_bank",
  //     "customer_bank_name",
  //     "customer_account_number",
  //     "bank_ifsc_code",
  //   ];

  //   useEffect(() => {
  //     if (formData.Pincode.length === 6) handlePincodeBlur();
  //   }, [formData.Pincode]);

  //   const handleChange = (e) => {
  //     const { name, value } = e.target;

  //     setFormData((prev) => ({
  //       ...prev,
  //       [name]: value,
  //     }));

  //     if (errors[name]) {
  //       setErrors((prev) => ({
  //         ...prev,
  //         [name]: "",
  //       }));
  //     }
  //   };

  //   const validateForm = () => {
  //     const newErrors = {};

  //     requiredFields.forEach((field) => {
  //       if (!formData[field]) {
  //         newErrors[field] = "This field is required";
  //       }
  //     });

  //     setErrors(newErrors);
  //     return Object.keys(newErrors).length === 0;
  //   };

  //   const handlePincodeBlur = async () => {
  //     const pin = formData.Pincode?.trim();

  //     if (!pin || pin.length !== 6) return;

  //     try {
  //       const res = await axios.get(
  //         `https://api.postalpincode.in/pincode/${pin}`
  //       );

  //       const data = res.data[0];

  //       if (data.Status === "Success") {
  //         const office = data.PostOffice[0];

  //         setFormData((prev) => ({
  //           ...prev,
  //           District: office.District,
  //           State: office.State,
  //         }));
  //       }
  //     } catch {
  //       setMessage("Unable to fetch pincode details");
  //     }
  //   };

  //   const handleSubmit = async (e) => {
  //     e.preventDefault();

  //     if (!validateForm()) {
  //       setMessage("Please fill required fields");
  //       return;
  //     }

  //     setLoading(true);

  //     try {
  //       const res = await api.post(
  //         "loan-booking/upload/ev-manual",
  //         formData
  //       );

  //       setMessage(
  //         `Success: ${res.data.message} | LAN: ${res.data.lan}`
  //       );
  //     } catch {
  //       setMessage("Submission failed");
  //     }

  //     setLoading(false);
  //   };


  const renderInput = (label, name, type = "text") => (
    <div className="form-group">
      <label>
        {label}  {" "}
        {requiredFields.includes(name) &&
        <span className="req">*</span>}
      </label>

      <input
        type={type}
        name={name}
        value={formData[name] || ""}
        onChange={handleChange}
        placeholder={
          type === "date"
            ? "Select date"
            : `Enter ${label}`
        }
        className="styled-input"
      />
    </div>
  );


  return (
    <div className="manual-entry-container">
      <h2>EV Loan Manual Entry</h2>

      <div className="section-tabs">
        {sections.map((sec, index) => (
          <div
            key={index}
            className={`tab ${activeSection === index ? "active" : ""
              }`}
            onClick={() => setActiveSection(index)}
          >
            {sec}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {activeSection === 0 && (

          <div className="form-grid">
            {renderInput("Login Date", "LOGIN_DATE", "date")}
            {renderInput("Customer Name", "Customer_Name")}
            {renderInput("Borrower DOB", "Borrower_DOB", "date")}
            {renderInput("Father Name", "Father_Name")}
            {renderInput("Mobile Number", "Mobile_Number")}
            {renderInput("Email", "Email")}
            {renderInput("Aadhar Number", "Aadhar_Number")}
            {renderInput("Pan Card", "Pan_Card")}
          </div>
        )}

        {activeSection === 1 && (
          <div className="form-grid">
            {renderInput("Address Line 1", "Address_Line_1")}
            {renderInput("Address Line 2", "Address_Line_2")}
            {renderInput("Village", "Village")}
            {renderInput("Pincode", "Pincode")}
            {renderInput("District", "District")}
            {renderInput("State", "State")}
          </div>
        )}

        {activeSection === 2 && (
          <div className="form-grid">
            {renderInput("Loan Amount", "Loan_Amount")}
            {renderInput("Interest Rate", "Interest_Rate")}
            {renderInput("Tenure", "Tenure")}
            {renderInput("EMI Amount", "EMI_Amount")}
            {renderInput("Disbursal Amount", "Disbursal_Amount")}
            {renderInput("Processing Fee", "Processing_Fee")}
            {renderInput("APR", "APR")}
            {renderInput("CIBIL Score", "CIBIL_Score")}
          </div>
        )}

        {activeSection === 3 && (
          <div className="form-grid">
            {renderInput("Guarantor Name", "GURANTOR")}
            {renderInput("Guarantor DOB", "GURANTOR_DOB", "date")}
            {renderInput("Guarantor Aadhar", "GURANTOR_ADHAR")}
            {renderInput("Guarantor PAN", "GURANTOR_PAN")}
            {renderInput("Guarantor CIBIL Score", "GURANTOR_CIBIL_Score")}
            {renderInput(
              "Relationship with Borrower",
              "Relationship_with_Borrower"
            )}
          </div>
        )}

        {activeSection === 4 && (
          <div className="form-grid">
            {renderInput("Co Applicant Name", "Co_Applicant")}
            {renderInput("Co Applicant DOB", "Co_Applicant_DOB", "date")}
            {renderInput("Co Applicant Aadhar", "Co_Applicant_AADHAR")}
            {renderInput("Co Applicant PAN", "Co_Applicant_PAN")}
            {renderInput(
              "Co Applicant CIBIL Score",
              "Co_Applicant_CIBIL_Score"
            )}
          </div>
        )}

        {activeSection === 5 && (
          <div className="form-grid">
            {renderInput(
              "Customer Name (Bank)",
              "customer_name_as_per_bank"
            )}
            {renderInput("Bank Name", "customer_bank_name")}
            {renderInput(
              "Account Number",
              "customer_account_number"
            )}
            {renderInput("IFSC Code", "bank_ifsc_code")}
          </div>
        )}

        {activeSection === 6 && (
          <div className="form-grid">
            {renderInput("Trade Name", "trade_name")}
            {renderInput("Dealer Name", "dealer_name")}
            {renderInput("Dealer Contact", "dealer_contact")}
            {renderInput("GST Number", "gst_no")}
            {renderInput("Dealer Address", "dealer_address")}
            {renderInput("Dealer Bank Name", "bank_name")}
            {renderInput("Dealer Account Number", "account_number")}
            {renderInput("Dealer IFSC Code", "ifsc")}
            {renderInput("Name in Bank", "name_in_bank")}
          </div>
        )}

        {activeSection === 7 && (
          <div className="form-grid">
            {renderInput("Battery Name", "Battery_Name")}
            {renderInput("Battery Type", "Battery_Type")}
            {renderInput("Battery Serial No 1", "Battery_Serial_no_1")}
            {renderInput("Battery Serial No 2", "Battery_Serial_no_2")}
            {renderInput("E-Rikshaw Model", "E_Rikshaw_model")}
            {renderInput("Chassis No", "Chassis_no")}
          </div>
        )}

        <div className="step-buttons">
          {activeSection > 0 && (
            <button
              type="button"
              onClick={() =>
                setActiveSection(activeSection - 1)
              }
            >
              Back
            </button>
          )}

          {activeSection < sections.length - 1 ? (
            <button
              type="button"
              onClick={() =>
                setActiveSection(activeSection + 1)
              }
            >
              Next
            </button>
          ) : (
            <button type="submit">
              {loading
                ? "Submitting..."
                : "Submit Loan"}
            </button>
          )}
        </div>
      </form>

      {message && (
        <div className="message">{message}</div>
      )}

      <style>{`
.styled-input {
  width: 100%;
  height: 44px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  padding: 8px 12px;
  font-size: 14px;
  transition: 0.2s ease;
}

.styled-input:focus {
  border-color: #2563eb;
  outline: none;
  box-shadow: 0 0 0 2px rgba(37,99,235,0.15);
}
.manual-entry-container {
  background: #ffffff;
  margin: 30px auto;
  padding: 40px 50px;
  border-radius: 14px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.08);
  max-width: 1200px;
}

/* PAGE TITLE */

.manual-entry-container h2 {
  font-size: 28px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 25px;
}

/* TABS */

.section-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 35px;
}

.tab {
  padding: 10px 20px;
  border-radius: 8px;
  background: #e2e8f0;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: 0.25s ease;
}


.tab:hover {
  background: linear-gradient(90deg, #1e293b, #334155);
  color: white;
}
  .tab.active {
  background: linear-gradient(
    90deg,
    rgba(56,189,248,0.18),
    rgba(56,189,248,0.05)
  );
  color: #0f172a;
  font-weight: 600;
  border-left: 4px solid #38bdf8;
}
// .tab.active {
//   background: linear-gradient(90deg, #0f172a, #1e293b);
  
//   color: white;
//   font-weight: 600;
//   border-left: 4px solid #38bdf8;
// }

/* FORM GRID (2 COLUMN LAYOUT) */

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 26px 40px;
}

/* FORM GROUP */

.form-group {
  display: flex;
  flex-direction: column;
}

/* LABEL */

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
  letter-spacing: 0.01em;
  }

/* INPUT */

// .form-group input {
//   height: 42px;
//   border-radius: 6px;
//   border: 1px solid #cbd5e1;
//   padding: 8px 12px;
//   font-size: 14px;
//   transition: 0.2s ease;
// }

// .form-group input:focus {
//   border-color: #2563eb;
//   outline: none;
//   box-shadow: 0 0 0 2px rgba(37,99,235,0.15);
// }

.styled-input,
.form-group input {
  width: 100%;
  height: 52px;
  border-radius: 14px;
  border: 1px solid #d8e2ee;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  padding: 0 16px;
  font-size: 15px;
  font-weight: 500;
  color: #0f172a;
  transition: all 0.22s ease;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.03);
}

.styled-input::placeholder,
.form-group input::placeholder {
  color: #94a3b8;
  font-weight: 400;
}

.styled-input:hover,
.form-group input:hover {
  border-color: #bfd0e2;
  background: #ffffff;
}

.styled-input:focus,
.form-group input:focus {
  border-color: #38bdf8;
  background: #ffffff;
  outline: none;
  box-shadow:
    0 0 0 4px rgba(56, 189, 248, 0.12),
    0 8px 20px rgba(37, 99, 235, 0.06);
  transform: translateY(-1px);
}

/* REQUIRED STAR */

.req {
  color: red;
  margin-left: 3px;
}

/* BUTTON ROW */

.step-buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 40px;
}

/* BUTTONS */

.step-buttons button {
  background: #0f172a; /* matches dark sidebar/nav tone */
  border: none;
  color: white;
  padding: 10px 28px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: 0.2s ease;
}

.step-buttons button:hover {
  background: #1e293b;

  transform: translateY(-1px);
}

/* DISABLED BUTTON */

.step-buttons button:disabled {
  background: #94a3b8;
    cursor: not-allowed;

}

/* MESSAGE BOX */

.message {
  margin-top: 20px;
  padding: 12px;
  border-radius: 6px;
  background: #ecfdf5;
  color: #065f46;
  font-weight: 600;
}

/* MOBILE RESPONSIVE */

@media (max-width: 768px) {

  .form-grid {
    grid-template-columns: 1fr;
  }

  .manual-entry-container {
    padding: 25px;
  }

}

`}</style>
    </div>
  );
};

export default EVManualEntry;