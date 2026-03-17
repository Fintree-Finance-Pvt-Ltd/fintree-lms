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
    hospital_email: "",
    hospital_phone: "",
    owner_email: "",
    owner_phone: "",
    owner_name:""
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;

    // ✅ Fix pincode
    if (name === "registered_pincode") {
      newValue = value.replace(/\D/g, "").slice(0, 6);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: newValue,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const data = new FormData();

    Object.keys(formData).forEach((key) => {
      data.append(key, formData[key]);
    });

    try {
      const res = await api.post("hospitals/create", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setMessage(`✅ ${res.data.message}`);
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
          registered_city: office.Block || office.Name,
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
      <h2>Hospital Entry</h2>

      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>Hospital Details</legend>

          {renderInput("Hospital Legal Name", "hospital_legal_name")}
          {renderInput("Brand / Trade Name", "brand_name")}

          {renderInput("Address", "registered_address")}
          {renderInput("Pincode", "registered_pincode")}
          {renderInput("City", "registered_city")}
          
          {renderInput("District", "registered_district")}
          {renderInput("State", "registered_state")}
          {renderInput(
            "Branch Locations (if multi-branch)",
            "branch_locations",
          )}
          {renderInput(
            "Hospital Registration Number",
            "hospital_registration_number",
          )}
          {renderInput(
            "Year of Establishment",
            "year_of_establishment",
            "number",
          )}
          {renderSelect("Type of Hospital", "hospital_type", [
            "Multi-speciality",
            "Single speciality",
            "Clinic",
            "Nursing home",
          ])}
          {renderInput("Bed Capacity", "bed_capacity", "number")}
          {renderInput("Key Specialties Offered", "key_specialties")}
          {renderInput(
            "Average Monthly Patient Footfall",
            "avg_monthly_patient_footfall",
            "number",
          )}
          {renderInput(
            "Average Ticket Size (Treatment Cost)",
            "avg_ticket_size",
            "number",
          )}
          {renderInput("Major Procedures Offered", "major_procedures")}
          {renderInput("Departments / Specialties", "departments")}
        </fieldset>

        <fieldset>
          <legend>Contact Details</legend>

          {renderInput("Hospital Email ID", "hospital_email", "email")}
          {renderInput("Hospital Phone", "hospital_phone")}
          {renderInput("Owner Email ID", "owner_email", "email")}
          {renderInput("Owner Phone", "owner_phone")}
          {renderInput("Owner Name", "owner_name")}
        </fieldset>

        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Create Hospital"}
        </button>
      </form>

      {message && <div className="message">{message}</div>}

      <style>{`

.manual-entry-container{
  max-width:900px;
  margin:2rem auto;
  background:#fafafa;
  padding:2rem;
  border-radius:10px;
  box-shadow:0 0 10px rgba(0,0,0,0.1);
}

h2{
  text-align:center;
  margin-bottom:1.5rem;
}

fieldset{
  border:1px solid #ddd;
  border-radius:8px;
  padding:1rem 1.5rem;
  margin-bottom:1.5rem;
}

legend{
  padding:0 10px;
  font-weight:bold;
}

.form-group{
  display:flex;
  flex-direction:column;
  margin-bottom:0.8rem;
}

label{
  font-weight:600;
  margin-bottom:4px;
}

input,select{
  padding:8px;
  border:1px solid #ccc;
  border-radius:4px;
}

button{
  background-color:#007bff;
  color:white;
  border:none;
  padding:10px 20px;
  font-size:16px;
  cursor:pointer;
  border-radius:6px;
}

button:disabled{
  background-color:#999;
}

.message{
  margin-top:1rem;
  padding:0.8rem;
  border-radius:6px;
  background:#f0f0f0;
  font-weight:600;
  text-align:center;
}

`}</style>
    </div>
  );
};

export default HospitalEntry;
