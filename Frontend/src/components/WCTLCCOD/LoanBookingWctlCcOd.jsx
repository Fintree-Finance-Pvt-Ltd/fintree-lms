import React, {useState, useEffect} from 'react'
import api from '../../api/api';

const LoanBookingWctlCcOd = () => {
    const [formData, setFormData] = useState({
         customer_name: "",
    mobile_number: "",
    alternate_mobile: "",
    email: "",

    business_type: "",
    business_category: "",
    gst_number: "",
    business_address_line1: "",
    business_address_line2: "",
    business_pincode: "",
    business_city: "",
    business_state: "",
    business_vintage_years: "",
});
const [ errors, setErrors] = useState({});
const [message, setMessage] = useState("");
const [loading, setLoading] = useState(false);

const requiredFields = [
    "customer_name",
    "mobile_number",
    "business_type",
    "business_category",
    "business_address_line1",
    "business_pincode",
    "business_city",
    "business_state",
]

const handleChange = (e) => {
    const {name, value} = e.target;

    setFormData((prev) => ({ ...prev, [name]: value}));

    if(errors[name]){
        setErrors((prev) => ({ ...prev, [name]: ""}));
    }
}

const validateForm = () => {
    const newErrors = {};

    requiredFields.forEach((field) => {
        if(!formData[field] || String(formData[field]).trim() === "") {
            newErrors[field] = "This field is required";
        }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
};

const handleSubmit = async (e) => {
    e.preventDefault();

    setMessage("");

    if(!validateForm()){
        setMessage("❌ Please fill all required fields.");
        return;
    }

    setLoading(true);
    try{
        const res = await api.post("/wctl-ccod/wctl-cc-od-upload", formData);

        setMessage("✅ Form submitted successfully!");

        setFormData({
        customer_name: "",
        mobile_number: "",
        alternate_mobile: "",
        email: "",
        business_type: "",
        business_category: "",
        gst_number: "",
        business_address_line1: "",
        business_address_line2: "",
        business_pincode: "",
        business_city: "",
        business_state: "",
        business_vintage_years: "",
        })
    } catch (error) {
        setMessage("❌ An error occurred while submitting the form. Please try again.");
    } finally {
        setLoading(false);
    }
}

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
    )

  return (
     <div className="manual-entry-container">
      <h2>Business Customer OnBoarding</h2>

      <form onSubmit={handleSubmit}>
        
        {/* -------------------- BASIC DETAILS ---------------------- */}
        <fieldset>
          <legend>Basic Customer Details</legend>

          {renderInput("Customer Name", "customer_name")}
          {renderInput("Mobile Number", "mobile_number")}
          {renderInput("Alternate Mobile", "alternate_mobile")}
          {renderInput("Email", "email", "email")}
        </fieldset>

        {/* -------------------- BUSINESS DETAILS ---------------------- */}
        <fieldset>
          <legend>Business Details</legend>

          <div className="form-group">
            <label>Business Type *</label>
            <select
              name="business_type"
              value={formData.business_type}
              onChange={handleChange}
              className={errors.business_type ? "error-input" : ""}
            >
              <option value="">Select</option>
              <option value="Proprietorship">Proprietorship</option>
              <option value="Partnership">Partnership</option>
              <option value="Pvt Ltd">Pvt Ltd</option>
              <option value="LLP">LLP</option>
            </select>
            {errors.business_type && (
              <p className="error-text">{errors.business_type}</p>
            )}
          </div>

          <div className="form-group">
            <label>Business Category *</label>
            <select
              name="business_category"
              value={formData.business_category}
              onChange={handleChange}
              className={errors.business_category ? "error-input" : ""}
            >
              <option value="">Select</option>
              <option value="Dealer">Dealer</option>
              <option value="Distributor">Distributor</option>
              <option value="Retailer">Retailer</option>
              <option value="Wholesaler">Wholesaler</option>
            </select>
            {errors.business_category && (
              <p className="error-text">{errors.business_category}</p>
            )}
          </div>

          {renderInput("GST Number", "gst_number")}
          {renderInput("Address Line 1", "business_address_line1")}
          {renderInput("Address Line 2", "business_address_line2")}
          {renderInput("Pincode", "business_pincode")}
          {renderInput("City", "business_city")}
          {renderInput("State", "business_state")}
          {renderInput("Business Vintage (Years)", "business_vintage_years", "number")}
        </fieldset>

        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Save Customer"}
        </button>
      </form>

      {message && <div className="message">{message}</div>}

      <style>{`
        .manual-entry-container {
          max-width: 850px;
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
      `}</style>
    </div>
  );
};

export default LoanBookingWctlCcOd;