import React, { useState, useEffect } from "react";
import api from "../../api/api";
import axios from "axios";

const getTodayDateString = () => {
  const d = new Date();
  return d.toISOString().split("T")[0];
};

const ClaimBuddyLoanBooking = () => {
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

I/We hereby authorise Fintree Finance Private Limited(FFPL) or its associates/subsidiaries/affiliates to obtain, verify, exchange, share or part with all the information or otherwise, regarding my/our office/ residence and/or contact me/us or my/our family/ employer/Banker/Credit Bureau/ RBI or any third parties as deemed necessary and/or do any such acts till such period as they deem necessary and/or disclose to Reserve bank of India, Credit Information Companies, Banks/NBFCs, or any other authority and institution, including but not limited to current balance, payment history, default, if any, etc.

I/We hereby agree to give my/our express consent to Lender to disclose all the information and data furnished by me/us and/or to receive information from Central KYC Registry/third parties including but not limited to vendors, outsourcing agencies, business correspondents for analysing, processing, report generation, storing, record keeping or to various credit information companies/ credit bureaus e.g. Credit Information Bureaus (India) Limited (CIBIL), or to information utilities under the Insolvency Bankruptcy Code 2016 through physical or SMS or email or any other mode.`;

  const getInitialFormData = () => ({
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
    relation_with_policy_holder: "",

    loan_amount: "",

    product: "CLAIM BUDDY",
    lender: "CLAIM-BUDDY",
    status: "Login",
  });

  const [formData, setFormData] = useState(getInitialFormData());

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // =====================================================
  // FETCH APPROVED CLAIM BUDDY HOSPITALS
  // =====================================================

  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        const res = await api.get("claim-buddy/hospitals-list");

        setHospitals(res.data || []);
      } catch (err) {
        console.log("Claim Buddy hospitals fetch error:", err);
      }
    };

    fetchHospitals();
  }, []);

  // =====================================================
  // PINCODE LOOKUP
  // =====================================================

  const handlePincodeLookup = async (pin, type) => {
    if (pin.length !== 6) return;

    try {
      const res = await axios.get(
        `https://api.postalpincode.in/pincode/${pin}`
      );

      const data = res.data[0];

      if (
        data.Status === "Success" &&
        data.PostOffice?.length > 0
      ) {
        const office = data.PostOffice[0];

        const prefix =
          type === "current"
            ? "current"
            : "permanent";

        setFormData((prev) => ({
          ...prev,

          [`${prefix}_district`]:
            office.District || "",

          [`${prefix}_state`]:
            office.State || "",
        }));
      }
    } catch (err) {
      console.log("Pincode lookup error:", err);
    }
  };

  useEffect(() => {
    if (formData.current_pincode.length === 6) {
      handlePincodeLookup(
        formData.current_pincode,
        "current"
      );
    }
  }, [formData.current_pincode]);

  useEffect(() => {
    if (formData.permanent_pincode.length === 6) {
      handlePincodeLookup(
        formData.permanent_pincode,
        "permanent"
      );
    }
  }, [formData.permanent_pincode]);

  // =====================================================
  // SAME ADDRESS SYNC
  // =====================================================

  useEffect(() => {
    if (sameAddress) {
      setFormData((prev) => ({
        ...prev,

        permanent_address:
          prev.current_address,

        permanent_village_city:
          prev.current_village_city,

        permanent_district:
          prev.current_district,

        permanent_state:
          prev.current_state,

        permanent_pincode:
          prev.current_pincode,
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

  // =====================================================
  // AGE VALIDATION
  // =====================================================

  const validateAge = (age, policyType) => {
    if (!age) return "";

    if (age > 60) {
      return "Maximum age is 60";
    }

    if (policyType === "Corporate Policy") {
      if (age < 22) {
        return "Minimum age is 22 for Corporate Policy";
      }
    } else {
      if (age < 25) {
        return "Minimum age is 25 for Individual Policy";
      }
    }

    return "";
  };

  // =====================================================
  // SAME ADDRESS CHECKBOX
  // =====================================================

  const handleSameAddress = (e) => {
    const checked = e.target.checked;

    setSameAddress(checked);

    if (checked) {
      setFormData((prev) => ({
        ...prev,

        permanent_address:
          prev.current_address,

        permanent_village_city:
          prev.current_village_city,

        permanent_district:
          prev.current_district,

        permanent_state:
          prev.current_state,

        permanent_pincode:
          prev.current_pincode,
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

  // =====================================================
  // SEND OTP
  // =====================================================

  const sendOtp = async () => {
    try {
      setOtpLoading(true);

      const res = await api.post(
        "claim-buddy/send-otp",
        {
          mobile: formData.mobile_number,
        }
      );

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
      console.log(
        "Claim Buddy OTP error:",
        err
      );

      alert(
        err.response?.data?.message ||
          "Failed to send OTP"
      );
    } finally {
      setOtpLoading(false);
    }
  };

  // =====================================================
  // VERIFY OTP
  // =====================================================

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

      const res = await api.post(
        "claim-buddy/verify-otp",
        {
          mobile: formData.mobile_number,
          otp,
          consentText: CONSENT_TEXT,
        }
      );

      if (res.data.success) {
        setOtpVerified(true);
        setShowConsentDialog(false);
      }
    } catch (err) {
      console.log(
        "Claim Buddy OTP verification error:",
        err
      );

      alert(
        err.response?.data?.message ||
          "Invalid OTP"
      );
    } finally {
      setOtpLoading(false);
    }
  };

  // =====================================================
  // OPEN CONSENT DIALOG
  // =====================================================

  const handleOpenConsentDialog = () => {
    if (
      !formData.mobile_number ||
      formData.mobile_number.length !== 10
    ) {
      alert("Enter valid mobile number");
      return;
    }

    setShowConsentDialog(true);

    sendOtp();
  };

  // =====================================================
  // IFSC LOOKUP
  // =====================================================

  const fetchBankFromIFSC = async (ifsc) => {
    if (ifsc.length !== 11) return;

    try {
      const res = await axios.get(
        `https://ifsc.razorpay.com/${ifsc}`
      );

      const data = res.data;

      setFormData((prev) => ({
        ...prev,
        bank_name: data.BANK || "",
        bank_branch: data.BRANCH || "",
      }));
    } catch (err) {
      try {
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
        console.log(
          "Both IFSC APIs failed"
        );

        setFormData((prev) => ({
          ...prev,
          bank_name: "",
          bank_branch: "",
        }));
      }
    }
  };

  // =====================================================
  // INPUT CHANGE
  // =====================================================

  const handleChange = (e) => {
    const { name, value } = e.target;

    let newValue = value;

    if (name === "hospital_id") {
      newValue = value ? Number(value) : "";
    }

    if (name === "mobile_number") {
      newValue = value
        .replace(/\D/g, "")
        .slice(0, 10);
    }

    if (name === "pan_number") {
      newValue = value
        .toUpperCase()
        .replace(/\s/g, "")
        .slice(0, 10);
    }

    if (name === "email_id") {
      newValue = value
        .toLowerCase()
        .replace(/\s/g, "");
    }

    if (
      name === "current_pincode" ||
      name === "permanent_pincode"
    ) {
      newValue = value
        .replace(/\D/g, "")
        .slice(0, 6);
    }

    if (name === "dob") {
      const today = new Date();

      const birthDate = new Date(value);

      let age =
        today.getFullYear() -
        birthDate.getFullYear();

      const m =
        today.getMonth() -
        birthDate.getMonth();

      if (
        m < 0 ||
        (m === 0 &&
          today.getDate() <
            birthDate.getDate())
      ) {
        age--;
      }

      const error = validateAge(
        age,
        formData.policy_type
      );

      setAgeError(error);

      setFormData((prev) => ({
        ...prev,
        dob: value,
        age,
      }));

      return;
    }

    if (name === "ifsc") {
      newValue = value
        .toUpperCase()
        .replace(/\s/g, "")
        .slice(0, 11);

      if (newValue.length === 11) {
        fetchBankFromIFSC(newValue);
      }
    }

    if (name === "policy_type") {
      const error = validateAge(
        Number(formData.age),
        newValue
      );

      setAgeError(error);
    }

    setFormData((prev) => {
      const updated = {
        ...prev,
        [name]: newValue,
      };

      if (
        name === "first_name" ||
        name === "last_name"
      ) {
        updated.customer_name =
          `${updated.first_name} ${updated.last_name}`.trim();
      }

      return updated;
    });
  };

  // =====================================================
  // SUBMIT CLAIM BUDDY LOAN
  // =====================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!otpVerified) {
      setMessage(
        "❌ Please verify mobile number first"
      );

      return;
    }

    setLoading(true);
    setMessage("");

    const age = Number(formData.age);

    const policyType =
      formData.policy_type;

    const currentAgeError =
      validateAge(age, policyType);

    if (currentAgeError) {
      setAgeError(currentAgeError);

      setMessage(
        `❌ ${currentAgeError}`
      );

      setLoading(false);

      return;
    }

    const panRegex =
      /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

    if (
      formData.pan_number &&
      !panRegex.test(formData.pan_number)
    ) {
      setMessage(
        "❌ Invalid PAN format"
      );

      setLoading(false);

      return;
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      formData.email_id &&
      !emailRegex.test(formData.email_id)
    ) {
      setMessage(
        "❌ Invalid email format"
      );

      setLoading(false);

      return;
    }

    try {
      const res = await api.post(
        "claim-buddy/manual-entry",
        formData
      );

      setMessage(
        `✅ ${res.data.message} | LAN: ${res.data.lan}`
      );

      setFormData(
        getInitialFormData()
      );

      setOtp("");
      setOtpVerified(false);
      setConsentChecked(false);
      setSameAddress(false);
      setAgeError("");
    } catch (err) {
      console.log(
        "Claim Buddy loan creation error:",
        err
      );

      setMessage(
        err.response?.data?.message ||
          "❌ Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // COMMON INPUT
  // =====================================================

  const renderInput = (
    label,
    name,
    type = "text"
  ) => (
    <div className="modern-field">
      <label>{label}</label>

      <input
        type={type}
        name={name}
        value={formData[name]}
        onChange={handleChange}
        disabled={
          sameAddress &&
          name.startsWith("permanent")
        }
        onWheel={(e) =>
          e.target.blur()
        }
      />
    </div>
  );

  // =====================================================
  // COMMON SELECT
  // =====================================================

  const renderSelect = (
    label,
    name,
    options
  ) => (
    <div className="modern-field">
      <label>{label}</label>

      <select
        name={name}
        value={formData[name]}
        onChange={handleChange}
      >
        <option value="">
          Select
        </option>

        {options.map((opt) => (
          <option
            key={opt}
            value={opt}
          >
            {opt}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="hospital-ui-wrapper">

      <style>{`
        .hospital-ui-wrapper {
          --primary: #0d9488;
          --secondary: #0f766e;
          --bg-slate: #f8fafc;
          --text-dark: #1e293b;
          --text-light: #64748b;
          --white: #ffffff;
          --border: #e2e8f0;

          background: var(--bg-slate);
          min-height: 100vh;
          padding-bottom: 60px;
          font-family: 'Inter', -apple-system, sans-serif;
          color: var(--text-dark);
        }

        .header-banner {
          background: linear-gradient(
            135deg,
            var(--primary) 0%,
            var(--secondary) 100%
          );

          padding: 48px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 15px;
          color: white;
          margin-bottom: 32px;
        }

        .header-banner .header-content,
        .header-banner > div:first-child {
          max-width: 1100px;
        }

        .header-banner h1 {
          font-size: 26px;
          font-weight: 700;
          margin: 0;
        }

        .header-banner p {
          margin: 6px 0 0;
          opacity: 0.85;
          font-size: 14px;
        }

        .date-badge {
          background:
            rgba(255,255,255,0.2);

          padding: 8px 16px;
          border-radius: 20px;
          font-size: 13px;
          white-space: nowrap;
        }

        .modern-form-grid {
          max-width: 1100px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr;
          gap: 28px;
          padding: 0 24px;
        }

        .ui-card {
          background: var(--white);
          border-radius: 14px;
          padding: 32px;

          box-shadow:
            0 4px 6px -1px
            rgba(0,0,0,0.05);

          border:
            1px solid
            var(--border);
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;

          border-bottom:
            1px solid #f1f5f9;

          padding-bottom: 14px;
        }

        .card-header h3 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          color: var(--primary);
        }

        .card-header .icon {
          font-size: 20px;
        }

        .grid-1 {
          display: grid;
          grid-template-columns: 1fr;
          gap: 28px;
        }

        .grid-2 {
          display: grid;
          grid-template-columns:
            1fr 1fr;

          gap: 24px;
          margin-bottom: 20px;
        }

        .grid-3 {
          display: grid;
          grid-template-columns:
            repeat(3, 1fr);

          gap: 24px;
          margin-bottom: 20px;
        }

        .modern-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .modern-field label {
          font-size: 11px;
          font-weight: 700;

          color:
            var(--text-light);

          text-transform: uppercase;

          letter-spacing:
            0.5px;
        }

        input,
        select {
          padding: 12px 14px;
          border-radius: 8px;

          border:
            1px solid
            var(--border);

          font-size: 14px;

          transition:
            all 0.2s;

          background:
            #fcfcfd;

          width: 100%;
          box-sizing: border-box;
        }

        input:focus,
        select:focus {
          outline: none;

          border-color:
            var(--primary);

          box-shadow:
            0 0 0 3px
            rgba(13,148,136,0.1);

          background: #fff;
        }

        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        input[type=number] {
          -moz-appearance: textfield;
        }

        .input-with-action {
          display: flex;
          gap: 10px;
        }

        .otp-btn {
          background:
            var(--primary);

          color: white;
          border: none;

          padding:
            0 20px;

          border-radius:
            8px;

          font-weight:
            600;

          cursor:
            pointer;

          white-space:
            nowrap;

          font-size:
            13px;

          transition:
            0.2s;
        }

        .otp-btn:hover {
          background:
            var(--secondary);
        }

        .otp-btn.verified {
          background:
            #10b981;

          cursor:
            default;
        }

        .main-submit-btn {
          width: 100%;
          padding: 18px;

          background:
            var(--primary);

          color: white;
          border: none;

          border-radius:
            12px;

          font-size:
            16px;

          font-weight:
            700;

          cursor:
            pointer;

          margin-top:
            10px;

          transition:
            transform 0.2s,
            background 0.2s;
        }

        .main-submit-btn:hover {
          background:
            var(--secondary);

          transform:
            translateY(-2px);
        }

        .main-submit-btn:disabled {
          background:
            #cbd5e1;

          cursor:
            not-allowed;

          transform:
            none;
        }

        .checkbox-container {
          display: flex;
          align-items: center;
          gap: 10px;

          cursor:
            pointer;

          font-size:
            14px;

          color:
            var(--text-dark);

          margin-bottom:
            15px;

          font-weight:
            500;
        }

        .checkbox-container input {
          width: auto;
          margin: 0;
        }

        .message {
          max-width:
            1100px;

          margin:
            24px auto;

          padding:
            15px;

          border-radius:
            10px;

          font-weight:
            600;

          text-align:
            center;

          background:
            white;

          border:
            1px solid
            var(--border);
        }

        .inline-error {
          color: #e11d48;
          font-size: 11px;
          font-weight: 600;
          margin-top: 2px;
        }

        .modern-modal-overlay {
          position: fixed;
          inset: 0;

          background:
            rgba(15,23,42,0.8);

          backdrop-filter:
            blur(4px);

          z-index:
            9999;

          display:
            flex;

          align-items:
            center;

          justify-content:
            center;

          padding:
            20px;
        }

        .modal-card {
          background:
            white;

          width:
            100%;

          max-width:
            600px;

          padding:
            30px;

          border-radius:
            20px;

          max-height:
            90vh;

          overflow-y:
            auto;

          box-shadow:
            0 25px 50px -12px
            rgba(0,0,0,0.25);
        }

        .modal-card h3 {
          margin-top: 0;

          color:
            var(--primary);

          font-size:
            20px;
        }

        .consent-scroll {
          height:
            200px;

          overflow-y:
            auto;

          border:
            1px solid
            var(--border);

          padding:
            15px;

          font-size:
            12px;

          line-height:
            1.6;

          margin:
            15px 0;

          background:
            #fafafa;

          border-radius:
            8px;

          color:
            var(--text-light);

          white-space:
            pre-line;
        }

        .modal-actions {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }

        .btn-ghost {
          background:
            #f1f5f9;

          color:
            var(--text-dark);

          border:
            none;

          padding:
            12px 20px;

          border-radius:
            8px;

          font-weight:
            600;

          cursor:
            pointer;
        }

        @media (max-width: 900px) {
          .grid-3 {
            grid-template-columns:
              1fr 1fr;
          }
        }

        @media (max-width: 640px) {
          .header-banner {
            padding:
              28px 20px;

            flex-direction:
              column;

            align-items:
              flex-start;

            margin-bottom:
              20px;
          }

          .header-banner h1 {
            font-size:
              20px;
          }

          .date-badge {
            font-size:
              12px;
          }

          .modern-form-grid {
            padding:
              0 14px;

            gap:
              18px;
          }

          .ui-card {
            padding:
              20px 16px;

            border-radius:
              12px;
          }

          .grid-2,
          .grid-3 {
            grid-template-columns:
              1fr;

            gap:
              16px;
          }

          .input-with-action {
            flex-direction:
              column;
          }

          .otp-btn {
            padding:
              12px;

            width:
              100%;
          }

          .main-submit-btn {
            padding:
              15px;

            font-size:
              15px;
          }

          .modal-card {
            padding:
              20px;

            border-radius:
              14px;
          }

          .modal-actions {
            flex-direction:
              column;
          }

          .modal-actions button {
            width:
              100%;
          }
        }
      `}</style>

      <div className="header-banner">

        <div>
          <h1>
            CLAIM BUDDY Loan Manual Entry
          </h1>

          <p>
            Complete the patient and borrower details to initiate the loan process
          </p>
        </div>

        <div className="date-badge">
          Login Date: {formData.login_date}
        </div>

      </div>

      <form
        onSubmit={handleSubmit}
        className="modern-form-grid"
      >

        {/* ======================================
            HOSPITAL
        ====================================== */}

        <div className="ui-card">

          <div className="card-header">
            <span className="icon">
              🏥
            </span>

            <h3>
              Hospital & Policy Details
            </h3>
          </div>

          <div className="grid-2">

            <div className="modern-field">

              <label>
                Hospital
              </label>

              <select
                name="hospital_id"
                value={formData.hospital_id}
                onChange={handleChange}
              >

                <option value="">
                  Select Hospital
                </option>

                {hospitals.map((h) => (
                  <option
                    key={h.id}
                    value={h.id}
                  >
                    {h.name}
                  </option>
                ))}

              </select>

            </div>

          </div>

        </div>


        {/* ======================================
            BORROWER
        ====================================== */}

        <div className="ui-card">

          <div className="card-header">
            <span className="icon">
              👤
            </span>

            <h3>
              Borrower Information
            </h3>
          </div>

          <div className="grid-3">

            {renderInput(
              "First Name",
              "first_name"
            )}

            {renderInput(
              "Middle Name",
              "middle_name"
            )}

            {renderInput(
              "Last Name",
              "last_name"
            )}

          </div>

          <div className="grid-3">

            {renderSelect(
              "Gender",
              "gender",
              [
                "Male",
                "Female",
              ]
            )}

            {renderSelect(
              "Policy Type",
              "policy_type",
              [
                "Corporate Policy",
                "Individual Policy",
              ]
            )}

            {renderInput(
              "DOB",
              "dob",
              "date"
            )}

          </div>

          <div className="grid-3">

            <div className="modern-field">

              <label>
                Age
              </label>

              <input
                type="number"
                name="age"
                value={formData.age}
                readOnly
                style={{
                  borderColor:
                    ageError
                      ? "#e11d48"
                      : "var(--border)",
                }}
              />

              {ageError && (
                <span className="inline-error">
                  {ageError}
                </span>
              )}

            </div>

          </div>

          <div className="grid-2">

            <div className="modern-field">

              <label>
                Mobile Number (Aadhaar Linked)
              </label>

              <div className="input-with-action">

                <input
                  type="text"
                  name="mobile_number"
                  value={
                    formData.mobile_number
                  }
                  onChange={
                    handleChange
                  }
                  disabled={
                    otpVerified
                  }
                />

                {!otpVerified ? (
                  <button
                    type="button"
                    className="otp-btn"
                    onClick={
                      handleOpenConsentDialog
                    }
                  >
                    Send OTP
                  </button>
                ) : (
                  <button
                    type="button"
                    className="otp-btn verified"
                    disabled
                  >
                    Verified ✅
                  </button>
                )}

              </div>

            </div>

            {renderInput(
              "Email ID",
              "email_id",
              "email"
            )}

          </div>

          <div className="grid-2">

            {renderInput(
              "PAN Number",
              "pan_number"
            )}

            {renderSelect(
              "Employment Type",
              "employment_type",
              [
                "Salaried",
                "Self-Employed",
              ]
            )}

          </div>

          <div className="grid-2">

            {renderInput(
              "Net Monthly Income",
              "net_monthly_income",
              "number"
            )}

          </div>

        </div>


        {/* ======================================
            INSURANCE
        ====================================== */}

        <div className="ui-card">

          <div className="card-header">

            <span className="icon">
              💳
            </span>

            <h3>
              Insurance Details
            </h3>

          </div>

          <div className="grid-3">

            {renderInput(
              "Insurance Card / Company",
              "insurance_company_name"
            )}

            {renderInput(
              "Policy Number",
              "insurance_policy_number"
            )}

            {renderInput(
              "Policy Holder Name",
              "insurance_policy_holder_name"
            )}

          </div>

          <div className="grid-3">

            {renderInput(
              "Patient Name",
              "patient_name"
            )}

            {renderInput(
              "Father's Name",
              "father_name"
            )}

            {renderInput(
              "Mother's Name",
              "mother_name"
            )}

          </div>

        </div>


        {/* ======================================
            CURRENT ADDRESS
        ====================================== */}

        <div className="grid-1">

          <div className="ui-card">

            <div className="card-header">

              <span className="icon">
                📍
              </span>

              <h3>
                Current Address
              </h3>

            </div>

            {renderInput(
              "Full Address",
              "current_address"
            )}

            <div className="grid-2">

              {renderInput(
                "Pincode",
                "current_pincode"
              )}

              {renderInput(
                "Village / City",
                "current_village_city"
              )}

            </div>

            <div className="grid-2">

              {renderInput(
                "District",
                "current_district"
              )}

              {renderInput(
                "State",
                "current_state"
              )}

            </div>

          </div>


          {/* ======================================
              PERMANENT ADDRESS
          ====================================== */}

          <div className="ui-card">

            <div className="card-header">

              <span className="icon">
                🏠
              </span>

              <h3>
                Permanent Address
              </h3>

            </div>

            <label className="checkbox-container">

              <input
                type="checkbox"
                checked={
                  sameAddress
                }
                onChange={
                  handleSameAddress
                }
              />

              Same as Current Address

            </label>

            {renderInput(
              "Full Address",
              "permanent_address"
            )}

            <div className="grid-2">

              {renderInput(
                "Pincode",
                "permanent_pincode"
              )}

              {renderInput(
                "Village / City",
                "permanent_village_city"
              )}

            </div>

            <div className="grid-2">

              {renderInput(
                "District",
                "permanent_district"
              )}

              {renderInput(
                "State",
                "permanent_state"
              )}

            </div>

          </div>

        </div>


        {/* ======================================
            BANK & LOAN
        ====================================== */}

        <div className="ui-card">

          <div className="card-header">

            <span className="icon">
              🏦
            </span>

            <h3>
              Banking & Financials
            </h3>

          </div>

          <div className="grid-2">

            {renderInput(
              "IFSC Code",
              "ifsc"
            )}

          </div>

          <div className="grid-2">

            {renderInput(
              "Bank Name",
              "bank_name"
            )}

            {renderInput(
              "Branch Name",
              "bank_branch"
            )}

          </div>

          <div className="grid-2">

            {renderInput(
              "Account Holder Name",
              "name_in_bank"
            )}

            {renderInput(
              "Account Number",
              "account_number"
            )}

          </div>

          <div
            className="grid-2"
            style={{
              marginTop:
                "20px",

              borderTop:
                "1px solid #f1f5f9",

              paddingTop:
                "20px",
            }}
          >

            {renderInput(
              "Requested Loan Amount",
              "loan_amount",
              "number"
            )}

            {renderInput(
              "Subvention (%)",
              "subvention_percent",
              "number"
            )}

          </div>

        </div>


        <button
          type="submit"
          className="main-submit-btn"
          disabled={loading}
        >
          {loading
            ? "Processing..."
            : "Submit Loan Application"}
        </button>

      </form>


      {message && (
        <div
          className="message"
          style={{
            color:
              message.includes("✅")
                ? "#059669"
                : "#e11d48",
          }}
        >
          {message}
        </div>
      )}


      {/* ======================================
          OTP / CONSENT MODAL
      ====================================== */}

      {showConsentDialog && (

        <div className="modern-modal-overlay">

          <div className="modal-card">

            <h3>
              Medical Consent & Verification
            </h3>

            <div className="consent-scroll">
              {CONSENT_TEXT}
            </div>

            <label className="checkbox-container">

              <input
                type="checkbox"
                checked={
                  consentChecked
                }
                onChange={(e) =>
                  setConsentChecked(
                    e.target.checked
                  )
                }
              />

              I agree to the terms and authorize the verification process.

            </label>

            <div
              className="modern-field"
              style={{
                marginBottom:
                  "20px",
              }}
            >

              <label>
                Enter 6-Digit OTP
              </label>

              <input
                type="text"
                placeholder="000000"
                value={otp}
                onChange={(e) =>
                  setOtp(
                    e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6)
                  )
                }
                disabled={
                  !consentChecked
                }
              />

            </div>

            <div className="modal-actions">

              <button
                type="button"
                className="otp-btn"
                style={{
                  flex: 1,
                  padding:
                    "14px",
                }}
                disabled={
                  !consentChecked ||
                  otpLoading
                }
                onClick={
                  verifyOtpHandler
                }
              >
                {otpLoading
                  ? "Verifying..."
                  : "Verify & Close"}
              </button>

              <button
                type="button"
                className="btn-ghost"
                onClick={() =>
                  setShowConsentDialog(
                    false
                  )
                }
              >
                Cancel
              </button>

            </div>

            <div
              style={{
                textAlign:
                  "center",

                marginTop:
                  "15px",

                fontSize:
                  "13px",
              }}
            >

              {resendTimer > 0 ? (

                <span
                  style={{
                    color:
                      "var(--text-light)",
                  }}
                >
                  Resend OTP in{" "}
                  {resendTimer}s
                </span>

              ) : (

                <button
                  type="button"
                  style={{
                    background:
                      "none",

                    border:
                      "none",

                    color:
                      "var(--primary)",

                    cursor:
                      "pointer",

                    fontWeight:
                      "600",
                  }}
                  onClick={
                    sendOtp
                  }
                >
                  Resend OTP
                </button>

              )}

            </div>

          </div>

        </div>

      )}

    </div>
  );
};

export default ClaimBuddyLoanBooking;