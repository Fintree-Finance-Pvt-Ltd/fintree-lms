import React, { useState, useEffect } from "react";
import axios from "axios";
import api from "../../api/api";

const ClaimBuddyHospitalEntry = () => {
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

    ifsc_code: "",
    bank_name: "",
    branch_name: "",

    account_number: "",
    account_holder_name: "",

    hospital_email: "",
    hospital_phone: "",

    owner_email: "",
    owner_phone: "",
    owner_name: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // ============================
  // IFSC LOOKUP
  // ============================

  const fetchBankFromIFSC = async (ifsc) => {
    if (ifsc.length !== 11) return;

    try {
      const res = await axios.get(`https://ifsc.razorpay.com/${ifsc}`);

      const data = res.data;

      setFormData((prev) => ({
        ...prev,

        bank_name: data.BANK || "",
        branch_name: data.BRANCH || "",
      }));
    } catch (err) {
      console.log("IFSC failed", err);

      setFormData((prev) => ({
        ...prev,

        bank_name: "",
        branch_name: "",
      }));
    }
  };

  // ============================
  // HANDLE CHANGE
  // ============================

  const handleChange = (e) => {
    const { name, value } = e.target;

    let newValue = value;

    if (name === "registered_pincode") {
      newValue = value.replace(/\D/g, "").slice(0, 6);
    }

    if (name === "hospital_phone" || name === "owner_phone") {
      newValue = value.replace(/\D/g, "").slice(0, 10);
    }

    if (name === "ifsc_code") {
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

  // ============================
  // PINCODE LOOKUP
  // ============================

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

  // ============================
  // SUBMIT
  // ============================

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const res = await api.post(
        "/claim-buddy/hospitals/create",

        formData,
      );

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

        ifsc_code: "",
        bank_name: "",
        branch_name: "",

        account_number: "",
        account_holder_name: "",

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
      />
    </div>
  );

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
          <h2>Claim Buddy Hospital Registration</h2>

          <p>Onboard new hospitals to Claim Buddy Network</p>
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

          <div className="form-grid">
            {renderInput("Pincode", "registered_pincode")}

            {renderInput("City", "registered_city")}
          </div>

          <div className="form-grid">
            {renderInput("District", "registered_district")}

            {renderInput("State", "registered_state")}
          </div>
        </fieldset>

        <fieldset>
          <legend>Operational Details</legend>

          <div className="form-grid">
            {renderInput(
              "Monthly Patient Footfall",
              "avg_monthly_patient_footfall",
              "number",
            )}

            {renderInput("Average Treatment Cost", "avg_ticket_size", "number")}
          </div>

          {renderInput("Key Specialties", "key_specialties")}

          {renderInput("Major Procedures", "major_procedures")}

          {renderInput("Departments", "departments")}
        </fieldset>

        <fieldset>
          <legend>Contact Details</legend>

          <div className="form-grid">
            {renderInput("Hospital Phone", "hospital_phone")}

            {renderInput("Hospital Email", "hospital_email", "email")}
          </div>

          <div className="form-grid">
            {renderInput("Owner Name", "owner_name")}

            {renderInput("Owner Phone", "owner_phone")}

            {renderInput("Owner Email", "owner_email", "email")}
          </div>
        </fieldset>

        <fieldset>
          <legend>Bank Details</legend>

          <div className="form-grid">
            {renderInput("IFSC Code", "ifsc_code")}
          </div>

          <div className="form-grid">
            {renderInput("Bank Name", "bank_name")}

            {renderInput("Branch Name", "branch_name")}
          </div>

          <div className="form-grid">
            {renderInput("Account Holder Name", "account_holder_name")}

            {renderInput("Account Number", "account_number")}
          </div>
        </fieldset>

        <button className="submit-btn" disabled={loading}>
          {loading ? "Creating Hospital..." : "Create Hospital Profile"}
        </button>
      </form>

      {message && <div className="message">{message}</div>}

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

export default ClaimBuddyHospitalEntry;
