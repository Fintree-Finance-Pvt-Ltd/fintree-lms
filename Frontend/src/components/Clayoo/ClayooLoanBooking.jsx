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
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const CONSENT_TEXT = `I/We hereby authorise Fintree Finance Private Limited(FFPL) (hereinafter referred to as “Lender”) or its associates/subsidiaries/affiliates to obtain, verify, exchange, share or part with all the information or otherwise, regarding my/our office/ residence and/or contact me/us or my/our family/ employer/Banker/Credit Bureau/ RBI or any third parties as deemed necessary and/or do any such acts till such period as they deem necessary and/or disclose to Reserve bank of India, Credit Information Companies, Banks/NBFCs, or any other authority and institution, including but not limited to current balance, payment history, default, if any, etc.
 
I/We hereby authorise Lender’s employees/agents to access my/our premises during normal office hours for carrying out any verification/investigation which includes taking photographs and post disbursement scrutiny.
 
I/We hereby authorise Lender to approach my/our existing bankers or any other prospective lender for any relevant information for consideration of loan and thereafter.
 
I/We hereby provide my/our consent to receive information/services etc for marketing purpose through telephone/mobile/SMS/Email.
 
I/We hereby authorise Lender to market/sell/promote/endorse any other product or service beneficial to me/us.
 
I/We hereby authorise Lender to purge the documents submitted by me/us, if the case is not disbursed/approved for whatever reason within 3 months of application.
 
I/We hereby provide my/our consent to avail information on products and services of other Companies and authorise to cross sell other company’s product and services.
 
I/We hereby authorise Fintree Finance Private Limited(FFPL) or its associates/subsidiaries/affiliates to obtain, verify, exchange, share or part with all the information or otherwise, regarding my/our office/ residence and/or contact me/us or my/our family/ employer/Banker/Credit Bureau/ RBI or any third parties as deemed necessary and/or do any such acts till such period as they deem necessary and/or disclose to Reserve bank of India, Credit Information Companies, Banks/NBFCs, or any other authority and institution, including but not limited to  current balance, payment history, default, if any, etc.
 
I/We hereby agree to give my/our express consent to Lender to disclose all the information and data furnished by me/us and/or to receive information from Central KYC Registry/third parties including but not limited to vendors, outsourcing agencies, business correspondents for analysing, processing, report generation, storing, record keeping or to various credit information companies/ credit bureaus e.g. Credit Information Bureaus (India) Limited (CIBIL), or to information utilities under the Insolvency Bankruptcy Code 2016 through physical or SMS or email or any other mode.`;

  const [formData, setFormData] = useState({
    login_date: getTodayDateString(),
    hospital_id: "",
    first_name: "",
    middle_name: "",
    last_name: "",
    customer_name: "",
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
    relation_with_policy_holder:"",
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

  const handleChequeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const uploadData = new FormData();

      uploadData.append("imageUrl", file);
      uploadData.append("clientRefId", "CLAYOO_" + Date.now());
      uploadData.append("accountHolderName", "CLAYOO_");

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

      // correct extraction path
      const result = res.data.data.result?.[0]?.details;

      if (!result) return;

      setFormData((prev) => ({
        ...prev,
        account_number: result.account_number?.value || prev.account_number,

        ifsc: result.ifsc_code?.value || prev.ifsc,

        name_in_bank: result.name?.value || prev.name_in_bank,

        bank_name: result.bank_name?.value || prev.bank_name,
      }));

      // trigger IFSC lookup after OCR
      if (result.ifsc_code?.value) {
        fetchBankFromIFSC(result.ifsc_code.value);
      }
    } catch (err) {
      console.log("Cheque OCR failed:", err);
    }
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

  const sendOtp = async () => {
    try {
      setOtpLoading(true);

      const res = await api.post("clayyo-loans/send-otp", {
        mobile: formData.mobile_number,
      });

      if (res.data.success) {
        setResendTimer(60);

        const timer = setInterval(() => {
          setResendTimer((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }

            return prev - 1;
          });
        }, 1000);
      }
    } catch (err) {
      alert("Failed to send OTP");
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtpHandler = async () => {
    if (!otp) {
      alert("Enter OTP");
      return;
    }

    if (!consentChecked) {
      alert("Please accept consent");
      return;
    }

    try {
      setOtpLoading(true);

      const res = await api.post("clayyo-loans/verify-otp", {
        mobile: formData.mobile_number,
        otp,
        consentText: CONSENT_TEXT,
      });

      if (res.data.success) {
        setOtpVerified(true);
        setShowConsentDialog(false);
      }
    } catch (err) {
      alert(err.response?.data?.message || "Invalid OTP");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOpenConsentDialog = async () => {
    if (!formData.mobile_number || formData.mobile_number.length !== 10) {
      alert("Enter valid mobile number");
      return;
    }

    setShowConsentDialog(true);
    sendOtp();
  };

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

    if (!otpVerified) {
      setMessage("❌ Please verify mobile number first");
      setLoading(false);
      return;
    }

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

    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

if (formData.pan_number && !panRegex.test(formData.pan_number)) {
  setMessage("❌ Invalid PAN format");
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
        value={type !== "file" ? formData[name] : undefined}
        onChange={type === "file" ? handleChequeUpload : handleChange}
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
          )}
          {renderInput(
            "Insurance Policy Holder Name ",
            "insurance_policy_holder_name",
          )}
          {renderSelect(
  "Relation with Policy Holder Person",
  "relation_with_policy_holder",
 [
  "Self",
  "Spouse",
  "Father",
  "Mother",
  "Son",
  "Daughter",
  "Brother",
  "Sister",
  "Father-in-law",
  "Mother-in-law",
  "Grandfather",
  "Grandmother",
  "Guardian",
  "Other",
]
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

          <div className="form-group">
            <label>Mobile Number (linked to Aadhaar)</label>

            <div style={{ display: "flex", gap: "10px" }}>
              <input
                type="text"
                name="mobile_number"
                value={formData.mobile_number}
                onChange={handleChange}
                disabled={otpVerified}
              />

              {!otpVerified ? (
                <button type="button" onClick={handleOpenConsentDialog}>
                  Send OTP
                </button>
              ) : (
                <button type="button" style={{ background: "green" }}>
                  Verified ✅
                </button>
              )}
            </div>
          </div>
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
          {renderInput("Pincode", "current_pincode")}
          {renderInput("Village / City", "current_village_city")}
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
          {renderInput("Pincode", "permanent_pincode")}
          {renderInput("Village / City", "permanent_village_city")}
          {renderInput("District", "permanent_district")}
          {renderInput("State", "permanent_state")}
        </fieldset>

        <fieldset>
          <legend>Bank Details</legend>
          {renderInput("Upload Cheque", "cheque_ocr", "file")}
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

      {showConsentDialog && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h3>Consent Agreement</h3>

            <div className="consent-scroll">{CONSENT_TEXT}</div>

            <div className="checkbox-row">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
              />

              <label>
                I have read, understood and agree to the above terms & consent
              </label>
            </div>

            <input
              type="text"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              disabled={!consentChecked}
            />

            <div style={{ marginTop: "15px" }}>
              <button
                disabled={!consentChecked || otpLoading}
                onClick={verifyOtpHandler}
              >
                {otpLoading ? "Verifying..." : "Verify OTP"}
              </button>

              {resendTimer > 0 ? (
                <span style={{ marginLeft: "15px" }}>
                  Resend OTP in {resendTimer}s
                </span>
              ) : (
                <button style={{ marginLeft: "15px" }} onClick={sendOtp}>
                  Resend OTP
                </button>
              )}

              <button
                style={{ marginLeft: "15px", background: "#999" }}
                onClick={() => setShowConsentDialog(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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

.dialog-overlay {
  position: fixed;
  inset: 0;              /* replaces top/left/width/height */
  background: rgba(0,0,0,0.5);

  display: flex;
  align-items: center;
  justify-content: center;

  z-index: 9999;         /* ensures it floats above sidebar */
  padding: 15px;
}

.dialog-box {
  background: white;
  padding: 20px;
  width: 100%;
  max-width: 600px;

  max-height: 90vh;
  overflow-y: auto;

  border-radius: 8px;
}

.consent-scroll {
  max-height: 250px;
  overflow-y: auto;
  border: 1px solid #ddd;
  padding: 10px;
  margin-bottom: 10px;
}
      `}</style>
    </div>
  );
};

export default ClayooManualEntry;
