import React, { useState, useEffect } from "react";
import api from "../../api/api";
import axios from "axios";

const getTodayDateString = () => {
  const d = new Date();
  return d.toISOString().split("T")[0];
};

const ClayooManualEntry = () => {
  const [hospitals, setHospitals] = useState([]);
  const [sameAddress, setSameAddress] = useState(false);

  const [formData, setFormData] = useState({
    login_date: getTodayDateString(),
    hospital_name: "",
    first_name: "",
    last_name: "",
    gender: "",
    dob: "",
    age: "",
   

    mobile_number: "",
    email_id: "",
    pan_number: "",


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


  





    
    policy_type: "",
    employment_type: "",
    net_monthly_income: "",

    bank_name: "",
    name_in_bank: "",
    account_number: "",
    ifsc: "",

    loan_amount: "",
   

    

    product: "CLAYOO",
    lender: "CLAYOO",
    status: "Login",
  });

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch hospitals
  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        const res = await api.get("hospitals");
        setHospitals(res.data);
      } catch (err) {
        console.log(err);
      }
    };
    fetchHospitals();
  }, []);

  // Pincode Lookup
  const handlePincodeLookup = async (pin, type) => {
    if (pin.length !== 6) return;

    try {
      const res = await axios.get(
        `https://api.postalpincode.in/pincode/${pin}`,
      );
      const data = res.data[0];

      if (data.Status === "Success") {
        const office = data.PostOffice[0];
        const prefix = type === "current" ? "current" : "permanent";

        setFormData((prev) => ({
          ...prev,
          [`${prefix}_district`]: office.District,
          [`${prefix}_state`]: office.State,
        }));
      }
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    if (formData.current_pincode.length === 6)
      handlePincodeLookup(formData.current_pincode, "current");
  }, [formData.current_pincode]);

  useEffect(() => {
    if (formData.permanent_pincode.length === 6)
      handlePincodeLookup(formData.permanent_pincode, "permanent");
  }, [formData.permanent_pincode]);

   const handleSameAddress = (e) => {
      const checked = e.target.checked;
      setSameAddress(checked);

      if (checked) {
        setFormData((prev) => ({
          ...prev,
          permanent_address: prev.current_address,
          permanent_village_city: prev.current_village_city,
          permanent_district: prev.current_district,
          permanent_state: prev.current_state,
          permanent_pincode: prev.current_pincode,
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          permanent_address: "",
          permanent_village_city: "",
          permanent_district: "",
          permanent_state: "",
          permanent_pincode: "",
        }));
      }
    };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;

    if (name === "mobile_number")
      newValue = value.replace(/\D/g, "").slice(0, 10);


    if (name === "pan_number") newValue = value.toUpperCase().slice(0, 10);

    if (name === "email_id") {
      newValue = value.toLowerCase().replace(/\s/g, "");
    }

    if (name === "dob") {
      const today = new Date();
      const birthDate = new Date(value);

      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();

      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      setFormData((prev) => ({
        ...prev,
        dob: value,
        age: age,
      }));

      return;
    }

    if (name === "current_pincode" || name === "permanent_pincode")
      newValue = value.replace(/\D/g, "").slice(0, 6);

    setFormData((prev) => {
      const updated = { ...prev, [name]: newValue };

      if (name === "first_name" || name === "last_name") {
        updated.customer_name =
          `${updated.first_name} ${updated.last_name}`.trim();
      }

      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

   

    if (formData.email_id && !emailRegex.test(formData.email_id)) {
      setMessage("❌ Invalid email format");
      setLoading(false);
      return;
    }

    try {
      const res = await api.post("clayoo-loans/manual-entry", formData);
      setMessage(`✅ ${res.data.message} | LAN: ${res.data.lan}`);
    } catch (err) {
      setMessage("❌ Something went wrong");
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
      disabled={sameAddress && name.startsWith("permanent")}
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
      <h2>Clayoo Loan Manual Entry</h2>

      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>Borrower Details</legend>

          <div className="form-group">
            <label>Login Date</label>
            <input
              type="date"
              name="login_date"
              value={formData.login_date}
              readOnly
              disabled
            />
          </div>

          <div className="form-group">
            <label>Hospital</label>
            <select
              name="hospital_name"
              value={formData.hospital_name}
              onChange={handleChange}
            >
              <option value="">Select Hospital</option>
              {hospitals.map((h) => (
                <option key={h.id} value={h.name}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          {renderInput("First Name", "first_name")}
          {renderInput("Last Name", "last_name")}
          {renderSelect("Gender", "gender", ["Male", "Female"])}
          {renderInput("DOB", "dob", "date")}

          <div className="form-group">
            <label>Age</label>
            <input type="number" name="age" value={formData.age} readOnly />
          </div>
          {renderInput("Mobile Number", "mobile_number")}
          <div className="form-group">
            <label>Email ID</label>
            <input
              type="email"
              name="email_id"
              value={formData.email_id}
              onChange={handleChange}
            />
          </div>

          {renderInput("PAN", "pan_number")}
        </fieldset>

        <fieldset>
          <legend>Current Address</legend>

          {renderInput("Address", "current_address")}
          {renderInput("Village / City", "current_village_city")}
          {renderInput("Pincode", "current_pincode")}
          {renderInput("District", "current_district")}
          {renderInput("State", "current_state")}
        </fieldset>

            <fieldset>

          <legend>Permanent Address</legend>

          <div className="checkbox-row">
            <input
              type="checkbox"
              checked={sameAddress}
              onChange={handleSameAddress}
            />
            <label>Same as Current Address</label>
          </div>

          {renderInput("Address","permanent_address")}
          {renderInput("Village / City","permanent_village_city")}
          {renderInput("Pincode","permanent_pincode")}
          {renderInput("District","permanent_district")}
          {renderInput("State","permanent_state")}

        </fieldset>

        

        {/* <fieldset>
          <legend>Loan Details</legend>
          {renderInput("Loan Limit", "loan_limit", "number")}
          {renderInput("Interest Rate", "interest_rate", "number")}
          {renderInput("Loan Tenure", "loan_tenure", "number")}
          {renderInput("CIBIL Score", "cibil_score", "number")}
        </fieldset> */}

        

        <fieldset>
          <legend>Policy Details</legend>
          {renderSelect("Policy Type", "policy_type", [
            "Corporate Policy",
            "Individual Policy",
          ])}
          {renderSelect("Employment Type", "employment_type", [
            "Salaried",
            "Business",
            "Others",
          ])}
          {renderInput("Net Monthly Income", "net_monthly_income", "number")}
         
        </fieldset>

        <fieldset>
          <legend>Bank Details</legend>
          {renderInput("Bank Name", "bank_name")}
          {renderInput("Name in Bank", "name_in_bank")}
          {renderInput("Account Number", "account_number")}
          {renderInput("IFSC", "ifsc")}
        </fieldset>

        <fieldset>
          <legend>Disbursement</legend>
          {renderInput("Loan Amount", "loan_amount", "number")}
        
          
         
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

        input, select {
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
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

export default ClayooManualEntry;
