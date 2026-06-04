import React, { useEffect, useState } from "react";
import axios from "axios";
import api from "../../api/api";

const emptyForm = {
  partner_loan_id: "",
  hospital_legal_name: "",
  brand_name: "",
  branch_locations: "",
  hospital_registration_number: "",
  year_of_establishment: "",
  hospital_type: "",
  bed_capacity: "",
  key_specialties: "",
  major_procedures: "",
  departments: "",
  registered_address: "",
  registered_city: "",
  registered_district: "",
  registered_state: "",
  registered_pincode: "",
  hospital_email: "",
  hospital_phone: "",
  contact_person_name: "",
  contact_person_email: "",
  contact_person_phone: "",
  ifsc_code: "",
  bank_name: "",
  branch_name: "",
  account_holder_name: "",
  account_number: "",
};

const requiredFields = [
  "partner_loan_id",
  "hospital_legal_name",
  "registered_address",
  "registered_city",
  "registered_district",
  "registered_state",
  "registered_pincode",
  "hospital_phone",
  "contact_person_name",
  "contact_person_phone",
  "ifsc_code",
  "bank_name",
  "branch_name",
  "account_holder_name",
  "account_number",
];

const CarePayHospitalEntry = () => {
  const [formData, setFormData] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const requiredSet = new Set(requiredFields);

  const fetchBankFromIFSC = async (ifsc) => {
    if (ifsc.length !== 11) return;

    try {
      const res = await axios.get(`https://ifsc.razorpay.com/${ifsc}`);
      setFormData((prev) => ({
        ...prev,
        bank_name: res.data.BANK || prev.bank_name,
        branch_name: res.data.BRANCH || prev.branch_name,
      }));
    } catch (err) {
      setFormData((prev) => ({
        ...prev,
        bank_name: "",
        branch_name: "",
      }));
    }
  };

  const handlePincodeLookup = async (pin) => {
    if (pin.length !== 6) return;

    try {
      const res = await axios.get(`https://api.postalpincode.in/pincode/${pin}`);
      const data = res.data?.[0];
      const office = data?.Status === "Success" ? data.PostOffice?.[0] : null;

      if (office) {
        setFormData((prev) => ({
          ...prev,
          registered_city: office.Name || office.Block || prev.registered_city,
          registered_district: office.District || prev.registered_district,
          registered_state: office.State || prev.registered_state,
        }));
      }
    } catch (err) {
      console.log("CarePay hospital pincode lookup failed:", err);
    }
  };

  useEffect(() => {
    if (formData.registered_pincode.length === 6) {
      handlePincodeLookup(formData.registered_pincode);
    }
  }, [formData.registered_pincode]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    let newValue = value;

    if (name === "registered_pincode") {
      newValue = value.replace(/\D/g, "").slice(0, 6);
    }

    if (name === "hospital_phone" || name === "contact_person_phone") {
      newValue = value.replace(/\D/g, "").slice(0, 10);
    }

    if (name === "partner_loan_id") {
      newValue = value.toUpperCase().replace(/\s/g, "").slice(0, 40);
    }

    if (name === "ifsc_code") {
      newValue = value.toUpperCase().replace(/\s/g, "").slice(0, 11);
      if (newValue.length === 11) fetchBankFromIFSC(newValue);
    }

    if (name.includes("email")) {
      newValue = value.toLowerCase().replace(/\s/g, "");
    }

    setFormData((prev) => ({
      ...prev,
      [name]: newValue,
    }));
  };

  const validateForm = () => {
    const missing = requiredFields.filter((field) => {
      const value = formData[field];
      return value === undefined || value === null || String(value).trim() === "";
    });

    if (missing.length) {
      setMessage(`Missing required fields: ${missing.join(", ")}`);
      setMessageType("error");
      return false;
    }

    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setMessageType("");

    if (!validateForm()) return;

    try {
      setLoading(true);
      const res = await api.post("/loan-booking/carepay-hospitals/create", formData);

      setMessage(
        `${res.data.message}. LAN: ${res.data.lan}. Status: ${res.data.status || "PENDING"}`,
      );
      setMessageType("success");
      setFormData(emptyForm);
    } catch (err) {
      setMessage(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          "CarePay hospital creation failed",
      );
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const renderInput = (label, name, type = "text") => (
    <div className="carepay-field">
      <label htmlFor={name}>
        {label}
        {requiredSet.has(name) ? <span> *</span> : null}
      </label>
      <input
        id={name}
        type={type}
        name={name}
        value={formData[name]}
        onChange={handleChange}
        onWheel={(event) => type === "number" && event.currentTarget.blur()}
      />
    </div>
  );

  const renderSelect = (label, name, options) => (
    <div className="carepay-field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} value={formData[name]} onChange={handleChange}>
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="carepay-hospital-entry">
      <header className="carepay-entry-header">
        <div>
          <p>CarePay Hospital Onboarding</p>
          <h1>Register hospital profile</h1>
        </div>
        <span className="status-chip">Credit status starts as PENDING</span>
      </header>

      <form onSubmit={handleSubmit} className="carepay-entry-form">
        <section>
          <h2>Application</h2>
          <div className="carepay-grid two">
            {renderInput("Partner Hospital ID", "partner_loan_id")}
            {renderInput("Hospital Legal Name", "hospital_legal_name")}
          </div>
          <div className="carepay-grid two">
            {renderInput("Brand / Trade Name", "brand_name")}
            {renderInput("Registration Number", "hospital_registration_number")}
          </div>
          <div className="carepay-grid two">
            {renderInput("Year of Establishment", "year_of_establishment", "number")}
            {renderSelect("Hospital Type", "hospital_type", [
              "Multi-speciality",
              "Single speciality",
              "Clinic",
              "Nursing home",
            ])}
          </div>
        </section>

        <section>
          <h2>Facility</h2>
          <div className="carepay-grid two">
            {renderInput("Bed Capacity", "bed_capacity", "number")}
            {renderInput("Branch Locations", "branch_locations")}
          </div>
          <div className="carepay-grid two">
            {renderInput("Key Specialties", "key_specialties")}
            {renderInput("Major Procedures", "major_procedures")}
          </div>
          {renderInput("Departments", "departments")}
        </section>

        <section>
          <h2>Registered Address</h2>
          {renderInput("Address", "registered_address")}
          <div className="carepay-grid four">
            {renderInput("Pincode", "registered_pincode")}
            {renderInput("City", "registered_city")}
            {renderInput("District", "registered_district")}
            {renderInput("State", "registered_state")}
          </div>
        </section>

        <section>
          <h2>Contact</h2>
          <div className="carepay-grid two">
            {renderInput("Hospital Phone", "hospital_phone")}
            {renderInput("Hospital Email", "hospital_email", "email")}
          </div>
          <div className="carepay-grid three">
            {renderInput("Contact Person Name", "contact_person_name")}
            {renderInput("Contact Person Phone", "contact_person_phone")}
            {renderInput("Contact Person Email", "contact_person_email", "email")}
          </div>
        </section>

        <section>
          <h2>Banking</h2>
          <div className="carepay-grid two">
            {renderInput("IFSC Code", "ifsc_code")}
            {renderInput("Bank Name", "bank_name")}
          </div>
          <div className="carepay-grid two">
            {renderInput("Branch Name", "branch_name")}
            {renderInput("Account Holder Name", "account_holder_name")}
          </div>
          {renderInput("Account Number", "account_number")}
        </section>

        <button type="submit" className="carepay-submit" disabled={loading}>
          {loading ? "Creating hospital..." : "Create CarePay Hospital"}
        </button>
      </form>

      {message ? <div className={`carepay-message ${messageType}`}>{message}</div> : null}

      <style>{`
        .carepay-hospital-entry {
          min-height: 100vh;
          padding: 36px;
          background: #f6f9fc;
          color: #10233f;
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .carepay-entry-header {
          max-width: 1080px;
          margin: 0 auto 24px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
        }

        .carepay-entry-header p {
          margin: 0 0 6px;
          color: #0f766e;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .carepay-entry-header h1 {
          margin: 0;
          color: #0f2b5b;
          font-size: 30px;
          font-weight: 800;
        }

        .status-chip {
          border: 1px solid #facc15;
          color: #713f12;
          background: #fef9c3;
          border-radius: 999px;
          padding: 9px 14px;
          font-size: 13px;
          font-weight: 800;
          white-space: nowrap;
        }

        .carepay-entry-form {
          max-width: 1080px;
          margin: 0 auto;
          display: grid;
          gap: 18px;
        }

        .carepay-entry-form section {
          background: #ffffff;
          border: 1px solid #e5edf5;
          border-radius: 8px;
          padding: 22px;
          box-shadow: 0 10px 28px rgba(15, 43, 91, 0.06);
        }

        .carepay-entry-form h2 {
          margin: 0 0 18px;
          color: #0f2b5b;
          font-size: 17px;
          font-weight: 800;
        }

        .carepay-grid {
          display: grid;
          gap: 16px;
        }

        .carepay-grid.two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .carepay-grid.three {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .carepay-grid.four {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .carepay-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin-bottom: 14px;
        }

        .carepay-field label {
          color: #52677f;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .carepay-field label span {
          color: #dc2626;
        }

        .carepay-field input,
        .carepay-field select {
          width: 100%;
          box-sizing: border-box;
          height: 44px;
          border: 1px solid #d9e3ee;
          border-radius: 7px;
          padding: 0 12px;
          background: #fbfdff;
          color: #10233f;
          font-size: 14px;
        }

        .carepay-field input:focus,
        .carepay-field select:focus {
          outline: none;
          border-color: #0f766e;
          box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.1);
        }

        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        input[type=number] {
          -moz-appearance: textfield;
        }

        .carepay-submit {
          height: 48px;
          border: 0;
          border-radius: 7px;
          background: #0f766e;
          color: #ffffff;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 12px 24px rgba(15, 118, 110, 0.18);
        }

        .carepay-submit:disabled {
          background: #94a3b8;
          cursor: not-allowed;
          box-shadow: none;
        }

        .carepay-message {
          max-width: 1080px;
          margin: 18px auto 0;
          padding: 13px 16px;
          border-radius: 7px;
          font-size: 14px;
          font-weight: 700;
        }

        .carepay-message.success {
          background: #ecfdf5;
          border: 1px solid #bbf7d0;
          color: #166534;
        }

        .carepay-message.error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
        }

        @media (max-width: 900px) {
          .carepay-hospital-entry {
            padding: 20px;
          }

          .carepay-entry-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .carepay-grid.two,
          .carepay-grid.three,
          .carepay-grid.four {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default CarePayHospitalEntry;
