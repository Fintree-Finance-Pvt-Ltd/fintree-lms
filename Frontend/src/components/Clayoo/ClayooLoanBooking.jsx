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
  const [ageError, setAgeError] = useState("");

  const [formData, setFormData] = useState({
    login_date: getTodayDateString(),
    hospital_id: "",
    first_name: "",
    middle_name: "",
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
    bank_branch: "",
    name_in_bank: "",
    account_number: "",
    ifsc: "",
    patient_name: "",
    father_name: "",
    mother_name: "",
    subvention_percent: "",
    insurance_company_name: "",
    insurance_policy_holder_name: "",
    insurance_policy_number: "",
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
        const res = await api.get("clayyo-loans/hospitals-list");
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

      if (data.Status === "Success" && data.PostOffice?.length > 0) {
        const office = data.PostOffice[0];
        const prefix = type === "current" ? "current" : "permanent";

        setFormData((prev) => ({
          ...prev,
          [`${prefix}_district`]: office.District || "",
          [`${prefix}_state`]: office.State || "",
        }));
      }
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    if (formData.current_pincode.length === 6) {
      handlePincodeLookup(formData.current_pincode, "current");
    }
  }, [formData.current_pincode]);

  useEffect(() => {
    if (formData.permanent_pincode.length === 6) {
      handlePincodeLookup(formData.permanent_pincode, "permanent");
    }
  }, [formData.permanent_pincode]);

  // Keep permanent address synced when checkbox is checked
  useEffect(() => {
    if (sameAddress) {
      setFormData((prev) => ({
        ...prev,
        permanent_address: prev.current_address,
        permanent_village_city: prev.current_village_city,
        permanent_district: prev.current_district,
        permanent_state: prev.current_state,
        permanent_pincode: prev.current_pincode,
      }));
    }
  }, [
    sameAddress,
    formData.current_address,
    formData.current_village_city,
    formData.current_district,
    formData.current_state,
    formData.current_pincode,
  ]);

  const validateAge = (age, policyType) => {
    if (!age) return "";

    if (age > 60) return "Maximum age is 60";

    if (policyType === "Corporate Policy") {
      if (age < 22) return "Minimum age is 22 for Corporate Policy";
    } else {
      if (age < 25) return "Minimum age is 25 for Individual Policy";
    }

    return "";
  };

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

  // const fetchBankFromIFSC = async (ifsc) => {
  //   if (ifsc.length !== 11) return;

  //   try {
  //     const res = await axios.get(`https://ifsc.razorpay.com/${ifsc}`);
  //     const data = res.data;

  //     setFormData((prev) => ({
  //       ...prev,
  //       bank_name: data.BANK || "",
  //       bank_branch: data.BRANCH || "",
  //     }));
  //   } catch (err) {
  //     console.log(err);
  //     setFormData((prev) => ({
  //       ...prev,
  //       bank_name: "",
  //       bank_branch: "",
  //     }));
  //   }
  // };

  const fetchBankFromIFSC = async (ifsc) => {
  if (ifsc.length !== 11) return;

  try {
    // 🔹 Try Razorpay first
    const res = await axios.get(`https://ifsc.razorpay.com/${ifsc}`);
    const data = res.data;

    setFormData((prev) => ({
      ...prev,
      bank_name: data.BANK || "",
      bank_branch: data.BRANCH || "",
    }));

  } catch (err) {
    try {
      // 🔹 Fallback API
      const res2 = await axios.get(
        `https://ifsc.bankifsccode.com/${ifsc}`
      );

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
  const handleChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;

    if (name === "hospital_id") {
  newValue = Number(value); // ✅ convert to number
}

    if (name === "mobile_number") {
      newValue = value.replace(/\D/g, "").slice(0, 10);
    }

    if (name === "pan_number") {
      newValue = value.toUpperCase().slice(0, 10);
    }

    if (name === "email_id") {
      newValue = value.toLowerCase().replace(/\s/g, "");
    }

    if (name === "current_pincode" || name === "permanent_pincode") {
      newValue = value.replace(/\D/g, "").slice(0, 6);
    }

    if (name === "dob") {
      const today = new Date();
      const birthDate = new Date(value);

      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();

      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      const error = validateAge(age, formData.policy_type);
      setAgeError(error);

      setFormData((prev) => ({
        ...prev,
        dob: value,
        age: age,
      }));

      return;
    }

    if (name === "ifsc") {
      newValue = value.toUpperCase().replace(/\s/g, "").slice(0, 11);

      // Call API when IFSC is complete
      if (newValue.length === 11) {
        fetchBankFromIFSC(newValue);
      }
    }

    // Revalidate when policy type changes
    if (name === "policy_type") {
      const error = validateAge(Number(formData.age), newValue);
      setAgeError(error);
    }

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
    setMessage("");

    const age = Number(formData.age);
    const policyType = formData.policy_type;
    const currentAgeError = validateAge(age, policyType);

    if (currentAgeError) {
      setAgeError(currentAgeError);
      setMessage(`❌ ${currentAgeError}`);
      setLoading(false);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (formData.email_id && !emailRegex.test(formData.email_id)) {
      setMessage("❌ Invalid email format");
      setLoading(false);
      return;
    }

    try {
      const res = await api.post("clayyo-loans/manual-entry", formData);
      setMessage(`✅ ${res.data.message} | LAN: ${res.data.lan}`);
    } catch (err) {
      setMessage(err.response?.data?.message || "❌ Something went wrong");
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
      <h2>CLAYYO Loan Manual Entry</h2>

      <form onSubmit={handleSubmit}>
        <fieldset>
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
              name="hospital_id"
              value={formData.hospital_id}
              onChange={handleChange}
            >
              <option value="">Select Hospital</option>
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <legend>Policy Details</legend>
          {renderSelect("Policy Type", "policy_type", [
            "Corporate Policy",
            "Individual Policy",
          ])}
          {renderSelect("Employment Type", "employment_type", [
            "Salaried",
            "Self-Employed",
          ])}
          {renderInput("Net Monthly Income", "net_monthly_income", "number")}
          {renderInput(
            "Insurance Card / Company Name ",
            "insurance_company_name",
          )}
          {renderInput(
            "Insurance Policy Number ",
            "insurance_policy_number",
            "number",
          )}
          {renderInput(
            "Insurance Policy Holder Name ",
            "insurance_policy_holder_name",
          )}
          {renderInput("Patient Name", "patient_name")}
          {renderInput("Father's Name", "father_name")}
          {renderInput("Mother's Name", "mother_name")}
        </fieldset>

        <fieldset>
          <legend>Borrower Details</legend>

          {renderInput("First Name", "first_name")}
          {renderInput("Middle Name", "middle_name")}
          {renderInput("Last Name", "last_name")}
          {renderSelect("Gender", "gender", ["Male", "Female"])}
          {renderInput("DOB", "dob", "date")}

          <div className="form-group">
            <label>Age</label>
            <input
              type="number"
              name="age"
              value={formData.age}
              readOnly
              style={{ border: ageError ? "1px solid red" : "1px solid #ccc" }}
            />
            {ageError && <span className="inline-error">{ageError}</span>}
          </div>

          {renderInput("Mobile Number (linked to aadhaar)", "mobile_number")}
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

          {renderInput("Address", "permanent_address")}
          {renderInput("Village / City", "permanent_village_city")}
          {renderInput("Pincode", "permanent_pincode")}
          {renderInput("District", "permanent_district")}
          {renderInput("State", "permanent_state")}
        </fieldset>

        <fieldset>
          <legend>Bank Details</legend>
          {renderInput("IFSC", "ifsc")}
          <div className="form-group">
            <label>Bank Name</label>
            <input
              type="text"
              name="bank_name"
              value={formData.bank_name}
              onChange={handleChange}  
            />
          </div>
          <div className="form-group">
            <label>Branch Name</label>
            <input
              type="text"
              name="bank_branch"
              value={formData.bank_branch}
              onChange={handleChange}  
            />
          </div>
          {renderInput("Name in Bank", "name_in_bank")}
          {renderInput("Account Number", "account_number")}
        </fieldset>

        <fieldset>
          <legend>Loan Amount</legend>
          {renderInput("Loan Amount Requested", "loan_amount", "number")}
          {renderInput("Subvention (in %)", "subvention_percent", "number")}
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

        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 0.8rem;
        }

        .checkbox-row input {
          width: auto;
        }

        .inline-error {
          color: red;
          font-size: 12px;
          margin-top: 4px;
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
