// import React, { useState, useEffect } from "react";
// import axios from "axios";
// import api from "../../api/api";

// const HospitalEntry = () => {
//   const [formData, setFormData] = useState({
//     hospital_legal_name: "",
//     brand_name: "",
//     branch_locations: "",
//     hospital_registration_number: "",
//     year_of_establishment: "",
//     hospital_type: "",
//     bed_capacity: "",
//     key_specialties: "",
//     registered_address: "",
//     registered_city: "",
//     registered_district: "",
//     registered_state: "",
//     registered_pincode: "",
//     avg_monthly_patient_footfall: "",
//     avg_ticket_size: "",
//     major_procedures: "",
//     departments: "",
//     hospital_email: "",
//     hospital_phone: "",
//     owner_email: "",
//     owner_phone: "",
//     owner_name: "",
//   });

//   const [loading, setLoading] = useState(false);
//   const [message, setMessage] = useState("");

//   const handleChange = (e) => {
//     const { name, value } = e.target;
//     let newValue = value;

//     // ✅ Fix pincode
//     if (name === "registered_pincode") {
//       newValue = value.replace(/\D/g, "").slice(0, 6);
//     }

//     if (name === "hospital_phone" || name === "owner_phone") {
//   newValue = value.replace(/\D/g, "").slice(0, 10);
// }

//     setFormData((prev) => ({
//       ...prev,
//       [name]: newValue,
//     }));
//   };

//   // ✅ UPDATED SUBMIT (JSON instead of FormData)
//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setLoading(true);
//     setMessage("");

//     try {
//       const res = await api.post("/clayyo-loans/hospitals/create", formData);

//       setMessage(`✅ ${res.data.message}`);

//       // ✅ Optional: Reset form after success
//       setFormData({
//         hospital_legal_name: "",
//         brand_name: "",
//         branch_locations: "",
//         hospital_registration_number: "",
//         year_of_establishment: "",
//         hospital_type: "",
//         bed_capacity: "",
//         key_specialties: "",
//         registered_address: "",
//         registered_city: "",
//         registered_district: "",
//         registered_state: "",
//         registered_pincode: "",
//         avg_monthly_patient_footfall: "",
//         avg_ticket_size: "",
//         major_procedures: "",
//         departments: "",
//         hospital_email: "",
//         hospital_phone: "",
//         owner_email: "",
//         owner_phone: "",
//         owner_name: "",
//       });

//     } catch (err) {
//       setMessage(
//         err?.response?.data?.message || "❌ Something went wrong"
//       );
//     } finally {
//       setLoading(false);
//     }
//   };

//   const renderInput = (label, name, type = "text") => (
//     <div className="form-group">
//       <label>{label}</label>

//       <input
//         type={type}
//         name={name}
//         value={formData[name]}
//         onChange={handleChange}
//       />
//     </div>
//   );

//   const handleRegisteredPincodeLookup = async (pin) => {
//     if (pin.length !== 6) return;

//     try {
//       const res = await axios.get(
//         `https://api.postalpincode.in/pincode/${pin}`
//       );

//       const data = res.data[0];

//       if (data.Status === "Success") {
//         const office = data.PostOffice[0];

//         setFormData((prev) => ({
//           ...prev,
//           registered_city: office.Name || office.Block ,
//           registered_district: office.District,
//           registered_state: office.State,
//         }));
//       }
//     } catch (err) {
//       console.log(err);
//     }
//   };

//   useEffect(() => {
//     if (formData.registered_pincode.length === 6) {
//       handleRegisteredPincodeLookup(formData.registered_pincode);
//     }
//   }, [formData.registered_pincode]);

//   const renderSelect = (label, name, options) => (
//     <div className="form-group">
//       <label>{label}</label>

//       <select name={name} value={formData[name]} onChange={handleChange}>
//         <option value="">Select</option>

//         {options.map((opt) => (
//           <option key={opt} value={opt}>
//             {opt}
//           </option>
//         ))}
//       </select>
//     </div>
//   );

//   return (
//     <div className="manual-entry-container">
//       <h2>Hospital Entry</h2>

//       <form onSubmit={handleSubmit}>
//         <fieldset>
//           <legend>Hospital Details</legend>

//           {renderInput("Hospital Legal Name", "hospital_legal_name")}
//           {renderInput("Brand / Trade Name", "brand_name")}

//           {renderInput("Address", "registered_address")}
//           {renderInput("Pincode", "registered_pincode")}
//           {renderInput("City", "registered_city")}
//           {renderInput("District", "registered_district")}
//           {renderInput("State", "registered_state")}

//           {renderInput("Branch Locations", "branch_locations")}
//           {renderInput("Registration Number", "hospital_registration_number")}
//           {renderInput("Year of Establishment", "year_of_establishment", "number")}

//           {renderSelect("Type of Hospital", "hospital_type", [
//             "Multi-speciality",
//             "Single speciality",
//             "Clinic",
//             "Nursing home",
//           ])}

//           {renderInput("Bed Capacity", "bed_capacity", "number")}
//           {renderInput("Key Specialties Offered", "key_specialties")}
//           {renderInput(
//             "Average Ticket Size (Treatment Cost)",
//             "avg_ticket_size",
//             "number",
//           )}
//           {renderInput("Major Procedures Offered", "major_procedures")}
//           {renderInput("Departments / Specialties", "departments")}
//           {renderInput("Monthly Footfall", "avg_monthly_patient_footfall", "number")}
//         </fieldset>

//         <fieldset>
//           <legend>Contact Details</legend>

//           {renderInput("Hospital Email", "hospital_email", "email")}
//           {renderInput("Hospital Phone", "hospital_phone")}
//           {renderInput("Owner Email", "owner_email", "email")}
//           {renderInput("Owner Phone", "owner_phone")}
//           {renderInput("Owner Name", "owner_name")}
//         </fieldset>

//         <button type="submit" disabled={loading}>
//           {loading ? "Submitting..." : "Create Hospital"}
//         </button>
//       </form>

//       {message && <div className="message">{message}</div>}

//       <style>{`
// .manual-entry-container{
//   max-width:900px;
//   margin:2rem auto;
//   background:#fafafa;
//   padding:2rem;
//   border-radius:10px;
//   box-shadow:0 0 10px rgba(0,0,0,0.1);
// }
// h2{
//   text-align:center;
//   margin-bottom:1.5rem;
// }
// fieldset{
//   border:1px solid #ddd;
//   border-radius:8px;
//   padding:1rem 1.5rem;
//   margin-bottom:1.5rem;
// }
// legend{
//   padding:0 10px;
//   font-weight:bold;
// }
// .form-group{
//   display:flex;
//   flex-direction:column;
//   margin-bottom:0.8rem;
// }
// label{
//   font-weight:600;
//   margin-bottom:4px;
// }
// input,select{
//   padding:8px;
//   border:1px solid #ccc;
//   border-radius:4px;
// }
// button{
//   background-color:#007bff;
//   color:white;
//   border:none;
//   padding:10px 20px;
//   font-size:16px;
//   cursor:pointer;
//   border-radius:6px;
// }
// button:disabled{
//   background-color:#999;
// }
// .message{
//   margin-top:1rem;
//   padding:0.8rem;
//   border-radius:6px;
//   background:#f0f0f0;
//   font-weight:600;
//   text-align:center;
// }
// `}</style>
//     </div>
//   );
// };

// export default HospitalEntry;

import React, { useState, useEffect } from "react";
import axios from "axios";
import api from "../../api/api";

const HospitalEntry = () => {
  const [formData, setFormData] = useState({
    hospital_legal_name: "",
    brand_name: "",
    branch_locations: "",
    hospital_registration_number: "",
    year_of_establishment: "",
    hospital_type: "",
    bed_capacity: "",
    key_specialties: "",
    registered_address: "",
    registered_city: "",
    registered_district: "",
    registered_state: "",
    registered_pincode: "",
    avg_monthly_patient_footfall: "",
    avg_ticket_size: "",
    major_procedures: "",
    departments: "",
    ifsc: "",
    bank_name: "",
    bank_branch: "",
    account_number: "",
    name_in_bank: "",
    hospital_email: "",
    hospital_phone: "",
    owner_email: "",
    owner_phone: "",
    owner_name: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const fetchBankFromIFSC = async (ifsc) => {
    if (ifsc.length !== 11) return;

    try {
      const res = await axios.get(`https://ifsc.razorpay.com/${ifsc}`);
      const data = res.data;

      setFormData((prev) => ({
        ...prev,
        bank_name: data.BANK || "",
        bank_branch: data.BRANCH || "",
      }));
    } catch (err) {
      try {
        const res2 = await axios.get(`https://ifsc.bankifsccode.com/${ifsc}`);
        const data2 = res2.data;

        setFormData((prev) => ({
          ...prev,
          bank_name: data2.BANK || "",
          bank_branch: data2.BRANCH || "",
        }));
      } catch (err2) {
        console.log("Both IFSC APIs failed");
        setFormData((prev) => ({
          ...prev,
          bank_name: "",
          bank_branch: "",
        }));
      }
    }
  };

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
        account_number: result.account_number?.value || prev.account_number,
        ifsc: result.ifsc_code?.value || prev.ifsc,
        name_in_bank: result.name?.value || prev.name_in_bank,
        bank_name: result.bank_name?.value || prev.bank_name,
      }));

      if (result.ifsc_code?.value) {
        fetchBankFromIFSC(result.ifsc_code.value);
      }
    } catch (err) {
      console.log("Cheque OCR failed:", err);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;

    if (name === "registered_pincode") {
      newValue = value.replace(/\D/g, "").slice(0, 6);
    }

    if (name === "hospital_phone" || name === "owner_phone") {
      newValue = value.replace(/\D/g, "").slice(0, 10);
    }

    if (name === "ifsc") {
      newValue = value.toUpperCase().replace(/\s/g, "").slice(0, 11);

      if (newValue.length === 11) {
        fetchBankFromIFSC(newValue);
      }
    }

    setFormData((prev) => ({
      ...prev,
      [name]: newValue,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await api.post("/clayyo-loans/hospitals/create", formData);

      setMessage(`✅ ${res.data.message}`);

      setFormData({
        hospital_legal_name: "",
        brand_name: "",
        branch_locations: "",
        hospital_registration_number: "",
        year_of_establishment: "",
        hospital_type: "",
        bed_capacity: "",
        key_specialties: "",
        registered_address: "",
        registered_city: "",
        registered_district: "",
        registered_state: "",
        registered_pincode: "",
        avg_monthly_patient_footfall: "",
        avg_ticket_size: "",
        major_procedures: "",
        departments: "",
        ifsc: "",
        bank_name: "",
        bank_branch: "",
        account_number: "",
        name_in_bank: "",
        hospital_email: "",
        hospital_phone: "",
        owner_email: "",
        owner_phone: "",
        owner_name: "",
      });
    } catch (err) {
      setMessage(err?.response?.data?.message || "❌ Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const renderInput = (label, name, type = "text") => (
    <div className="form-group">
      <label>{label}</label>
      <input
        type={type}
        name={name}
        value={formData[name]}
        onChange={handleChange}
        onWheel={(e) => type === "number" && e.target.blur()}
      />
    </div>
  );

  const handleRegisteredPincodeLookup = async (pin) => {
    if (pin.length !== 6) return;

    try {
      const res = await axios.get(
        `https://api.postalpincode.in/pincode/${pin}`,
      );

      const data = res.data[0];

      if (data.Status === "Success") {
        const office = data.PostOffice[0];

        setFormData((prev) => ({
          ...prev,
          registered_city: office.Name || office.Block,
          registered_district: office.District,
          registered_state: office.State,
        }));
      }
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    if (formData.registered_pincode.length === 6) {
      handleRegisteredPincodeLookup(formData.registered_pincode);
    }
  }, [formData.registered_pincode]);

  const renderSelect = (label, name, options) => (
    <div className="form-group">
      <label>{label}</label>

      <select name={name} value={formData[name]} onChange={handleChange}>
        <option value="">Select</option>

        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="manual-entry-container">
      <div className="entry-header">
        <div className="header-icon">🏥</div>
        <div>
          <h2>Hospital Registration</h2>
          <p>Onboard new medical facilities to the Clayyo Network</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="modern-form">
        <fieldset>
          <legend>Facility Information</legend>
          <div className="form-grid">
            {renderInput("Hospital Legal Name", "hospital_legal_name")}
            {renderInput("Brand / Trade Name", "brand_name")}
          </div>

          <div className="form-grid">
            {renderInput("Registration Number", "hospital_registration_number")}
            {renderInput(
              "Year of Establishment",
              "year_of_establishment",
              "number",
            )}
          </div>

          <div className="form-grid">
            {renderSelect("Type of Hospital", "hospital_type", [
              "Multi-speciality",
              "Single speciality",
              "Clinic",
              "Nursing home",
            ])}
            {renderInput("Bed Capacity", "bed_capacity", "number")}
          </div>
        </fieldset>

        <fieldset>
          <legend>Location Details</legend>
          {renderInput("Full Registered Address", "registered_address")}
          <div className="form-grid tri">
            {renderInput("Pincode", "registered_pincode")}
            {renderInput("City", "registered_city")}
            {renderInput("District", "registered_district")}
          </div>
          <div className="form-grid tri">
            {renderInput("State", "registered_state")}
            {renderInput("Branch Locations", "branch_locations")}
            <div className="spacer"></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Operational Statistics</legend>
          <div className="form-grid">
            {renderInput(
              "Avg. Monthly Footfall",
              "avg_monthly_patient_footfall",
              "number",
            )}
            {renderInput("Avg. Treatment Cost", "avg_ticket_size", "number")}
          </div>
          <div className="form-grid">
            {renderInput("Key Specialties Offered", "key_specialties")}
            {renderInput("Major Procedures", "major_procedures")}
          </div>
          {renderInput("Departments", "departments")}
        </fieldset>

        <fieldset>
          <legend>Point of Contact</legend>
          <div className="form-grid">
            {renderInput("Hospital Phone", "hospital_phone")}
            {renderInput("Hospital Email", "hospital_email", "email")}
          </div>
          <div className="form-grid tri">
            {renderInput("Owner Name", "owner_name")}
            {renderInput("Owner Phone", "owner_phone")}
            {renderInput("Owner Email", "owner_email", "email")}
          </div>
        </fieldset>

        <fieldset>
          <legend>Banking &amp; Financials</legend>

          <div className="form-grid">
            <div className="form-group">
              <label>Upload Cheque (OCR)</label>
              <input type="file" onChange={handleChequeUpload} />
            </div>

            {renderInput("IFSC Code", "ifsc")}
          </div>

          <div className="form-grid">
            {renderInput("Bank Name", "bank_name")}
            {renderInput("Branch Name", "bank_branch")}
          </div>

          <div className="form-grid">
            {renderInput("Account Holder Name", "name_in_bank")}
            {renderInput("Account Number", "account_number")}
          </div>
        </fieldset>

        <button type="submit" className="submit-btn" disabled={loading}>
          {loading ? "Registering Facility..." : "Create Hospital Profile"}
        </button>
      </form>

      {message && (
        <div
          className={`message ${message.includes("✅") ? "success" : "error"}`}
        >
          {message}
        </div>
      )}

      <style>{`
        .manual-entry-container {
          max-width: 1000px;
          margin: 2rem auto;
          background: #ffffff;
          padding: 2.5rem;
          border-radius: 16px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.05);
          font-family: 'Inter', -apple-system, sans-serif;
          color: #1e293b;
        }
 
        .entry-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 2rem;
          border-bottom: 2px solid #f1f5f9;
          padding-bottom: 1.5rem;
        }
 
        .header-icon {
          font-size: 2.5rem;
          background: #f0fdfa;
          padding: 0.75rem;
          border-radius: 12px;
        }
 
        .entry-header h2 {
          margin: 0;
          font-size: 1.75rem;
          color: #0f172a;
          font-weight: 800;
        }
 
        .entry-header p {
          margin: 0.25rem 0 0;
          color: #64748b;
          font-size: 0.95rem;
        }
 
        .modern-form fieldset {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 2rem;
          background: #fcfcfd;
        }
 
        .modern-form legend {
          padding: 0 12px;
          font-weight: 700;
          color: #0d9488;
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
 
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.25rem;
          margin-bottom: 1rem;
        }
 
        .form-grid.tri {
          grid-template-columns: 1fr 1fr 1fr;
        }
 
        .form-group {
          display: flex;
          flex-direction: column;
          margin-bottom: 1rem;
        }
 
        .form-group label {
          font-weight: 600;
          margin-bottom: 6px;
          font-size: 0.85rem;
          color: #475569;
        }
 
        .form-group input,
        .form-group select {
          padding: 10px 14px;
          border: 1.5px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.95rem;
          transition: all 0.2s ease;
          background: #ffffff;
        }
 
        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: #0d9488;
          box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.1);
        }
 
        /* Hide number spinners */
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
 
        .submit-btn {
          width: 100%;
          background-color: #0d9488;
          color: white;
          border: none;
          padding: 14px;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          border-radius: 10px;
          transition: all 0.3s ease;
          box-shadow: 0 4px 6px rgba(13, 148, 136, 0.2);
        }
 
        .submit-btn:hover {
          background-color: #0f766e;
          transform: translateY(-1px);
          box-shadow: 0 6px 12px rgba(13, 148, 136, 0.25);
        }
 
        .submit-btn:disabled {
          background-color: #94a3b8;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }
 
        .message {
          margin-top: 1.5rem;
          padding: 1rem;
          border-radius: 10px;
          font-weight: 600;
          text-align: center;
          font-size: 0.95rem;
        }
 
        .message.success {
          background: #f0fdf4;
          color: #166534;
          border: 1px solid #bbf7d0;
        }
 
        .message.error {
          background: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }
 
        @media (max-width: 768px) {
          .form-grid, .form-grid.tri {
            grid-template-columns: 1fr;
          }
          .manual-entry-container {
            padding: 1.5rem;
            margin: 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default HospitalEntry;
