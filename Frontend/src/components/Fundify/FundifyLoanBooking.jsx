import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/api";

const today = new Date().toISOString().split("T")[0];

const emptyApplicant = (role, partyNo) => ({
  role,
  party_no: partyNo,
  first_name: "",
  middle_name: "",
  last_name: "",
  full_name: "",
  father_name: "",
  mother_name: "",
  spouse_name: "",
  dob: "",
  gender: "",
  marital_status: "",
  mobile: "",
  alternate_mobile: "",
  email: "",
  pan: "",
  aadhaar_last4: "",
  voter_id: "",
  driving_license_no: "",
  passport_no: "",
  ckyc_no: "",
  current_address: "",
  current_city: "",
  current_district: "",
  current_state: "",
  current_pincode: "",
  current_landmark: "",
  residence_ownership: "",
  permanent_address: "",
  permanent_city: "",
  permanent_district: "",
  permanent_state: "",
  permanent_pincode: "",
  same_as_current_address: false,
  occupation: "",
  employer_name: "",
  monthly_income: "",
});

const FundifyManualEntry = () => {
  const [searchParams] = useSearchParams();
  const resumeLan = searchParams.get("lan");
  const [activeSection, setActiveSection] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});
  const [gstLoading, setGstLoading] = useState(false);
const [gstVerified, setGstVerified] = useState(false);

  const [loan, setLoan] = useState({
    login_date: today,
    loan_amount: "",
    disbursal_amount: "",
    interest_rate: "",
    loan_tenure: "",
    processing_fee: "",
    processing_fee_percentage: "",
    insurance_amount: "",
    other_charges: "",
    business_name: "",
    trade_name: "",
    business_pan: "",
    gstin: "",
    udyam_registration_no: "",
    cin: "",
    llpin: "",
    shop_establishment_no: "",
    business_registration_no: "",
    constitution_type: "",
    business_start_date: "",
    business_vintage_months: "",
    nature_of_business: "",
    industry_type: "",
    business_address: "",
    business_city: "",
    business_district: "",
    business_state: "",
    business_pincode: "",
    premises_ownership: "",
    business_mobile: "",
    business_email: "",
    bank_name: "",
    name_in_bank: "",
    account_number: "",
    ifsc: "",
    account_type: "",
  });

  const [applicant, setApplicant] = useState(emptyApplicant("APPLICANT", 1));
  const [coApplicants, setCoApplicants] = useState([
    emptyApplicant("CO_APPLICANT", 1),
  ]);
  const [guarantors, setGuarantors] = useState([
    emptyApplicant("GUARANTOR", 1),
  ]);

  useEffect(() => {
    if (resumeLan) {
      fetchResumeBooking(resumeLan);
    }
  }, [resumeLan]);

  const fetchResumeBooking = async (lan) => {
    setLoading(true);
    try {
      const response = await api.get(`/fundify/fundify-manual-entry/${lan}`);
      if (response.data.success) {
        const { loan: resumeLoan, applicants } = response.data.data;

        // Ensure proper date formatting
        if (resumeLoan.login_date) {
          resumeLoan.login_date = resumeLoan.login_date.split("T")[0];
        }
        if (resumeLoan.business_start_date) {
          resumeLoan.business_start_date = resumeLoan.business_start_date.split("T")[0];
        }

        setLoan((prev) => ({ ...prev, ...resumeLoan }));

        const apps = [];
        const coApps = [];
        const guars = [];

        applicants.forEach((app) => {
          // Format date fields
          if (app.dob) app.dob = app.dob.split("T")[0];

          if (app.role === "APPLICANT") {
            apps.push(app);
          } else if (app.role === "CO_APPLICANT") {
            coApps.push(app);
          } else if (app.role === "GUARANTOR") {
            guars.push(app);
          }
        });

        if (apps.length > 0) setApplicant(apps[0]);
        if (coApps.length > 0) setCoApplicants(coApps);
        if (guars.length > 0) setGuarantors(guars);
      } else {
        setMessage("Failed to load loan details for resume.");
      }
    } catch (err) {
      console.error("Error fetching resume loan:", err);
      setMessage("Error loading loan details.");
    } finally {
      setLoading(false);
    }
  };

  const sections = [
    "Loan Details",
    "Business Details",
    "Bank Details",
    "Applicant",
    "Co-Applicants",
    "Guarantors",
  ];

  const isValidMobile = (m) => /^[6-9]\d{9}$/.test(String(m || ""));
  const isValidPan = (p) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(p || ""));
  const isValidEmail = (e) =>
    !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ""));

  const handleLoanChange = (e) => {
    const { name, value } = e.target;
    let finalValue = value;

    if (["business_pan", "gstin", "ifsc"].includes(name)) {
      finalValue = value.toUpperCase();
    }

    if (name === "gstin") {
  setGstVerified(false);
}

    if (name === "business_email") {
      finalValue = value.toLowerCase().replace(/\s/g, "");
    }

    if (name.includes("pincode")) {
      finalValue = value.replace(/\D/g, "").slice(0, 6);
    }

    setLoan((prev) => {
      const updated = { ...prev, [name]: finalValue };

      if (name === "loan_amount" || name === "processing_fee") {
        const amount = Number(
          name === "loan_amount" ? finalValue : updated.loan_amount
        );
        const fee = Number(
          name === "processing_fee" ? finalValue : updated.processing_fee
        );

        if (amount > 0 && fee >= 0) {
          updated.processing_fee_percentage = ((fee / amount) * 100).toFixed(2);
          updated.disbursal_amount = (amount - fee).toFixed(2);
        }
      }

      return updated;
    });

    // Clear dynamic field errors sequentially on change
    if (errors[name]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    }
  };

  const handleApplicantChange = (setter, index = null) => (e) => {
    const { name, type, checked, value } = e.target;
    let finalValue = type === "checkbox" ? checked : value;

    if (["pan", "driving_license_no", "voter_id", "passport_no"].includes(name)) {
      finalValue = String(value).toUpperCase();
    }

    if (name === "email") {
      finalValue = value.toLowerCase().replace(/\s/g, "");
    }

    if (name.includes("pincode")) {
      finalValue = value.replace(/\D/g, "").slice(0, 6);
    }

    setter((prev) => {
      if (Array.isArray(prev)) {
        const copy = [...prev];
        const updated = { ...copy[index], [name]: finalValue };

        if (["first_name", "middle_name", "last_name"].includes(name)) {
          updated.full_name = [
            updated.first_name,
            updated.middle_name,
            updated.last_name,
          ]
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        }

        if (name === "same_as_current_address" && checked) {
          updated.permanent_address = updated.current_address;
          updated.permanent_city = updated.current_city;
          updated.permanent_district = updated.current_district;
          updated.permanent_state = updated.current_state;
          updated.permanent_pincode = updated.current_pincode;
        }

        copy[index] = updated;
        return copy;
      }

      const updated = { ...prev, [name]: finalValue };

      if (["first_name", "middle_name", "last_name"].includes(name)) {
        updated.full_name = [
          updated.first_name,
          updated.middle_name,
          updated.last_name,
        ]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      }

      if (name === "same_as_current_address" && checked) {
        updated.permanent_address = updated.current_address;
        updated.permanent_city = updated.current_city;
        updated.permanent_district = updated.current_district;
        updated.permanent_state = updated.current_state;
        updated.permanent_pincode = updated.current_pincode;
      }

      return updated;
    });

    // Reset error messages upon field re-entry
    const prefix = index !== null ? `${setter === setCoApplicants ? "co_" + index : "guarantor_" + index}` : "applicant";
    const mappedKey = `${prefix}_${name}`;
    if (errors[mappedKey]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[mappedKey];
        return copy;
      });
    }
  };

  const validateApplicant = (a, prefix) => {
    const e = {};

    if (!a.full_name && !a.first_name) e[`${prefix}_first_name`] = "First Name or Full Name is required";
    if (!a.mobile || !isValidMobile(a.mobile)) e[`${prefix}_mobile`] = "Valid 10-digit mobile number required";
    if (!a.pan || !isValidPan(a.pan)) e[`${prefix}_pan`] = "Valid PAN card required (e.g., ABCDE1234F)";
    if (!isValidEmail(a.email)) e[`${prefix}_email`] = "Invalid email format";
    if (!a.dob) e[`${prefix}_dob`] = "Date of Birth required";
    if (!a.current_address) e[`${prefix}_current_address`] = "Current Address required";
    if (!a.current_pincode || String(a.current_pincode).length !== 6) e[`${prefix}_current_pincode`] = "Valid 6 digit pincode required";

    return e;
  };

  const getSectionErrors = (sectionIndex) => {
    let e = {};

    if (sectionIndex === 0) {
      if (!loan.login_date) e.login_date = "Login date required";
      if (!loan.loan_amount || Number(loan.loan_amount) <= 0) {
        e.loan_amount = "Valid positive loan amount required";
      }
      if (loan.interest_rate && Number(loan.interest_rate) <= 0) {
        e.interest_rate = "Interest rate must be greater than 0";
      }
      if (loan.loan_tenure && Number(loan.loan_tenure) <= 0) {
        e.loan_tenure = "Tenure must be greater than 0 months";
      }
      if (loan.processing_fee && Number(loan.processing_fee) < 0) {
        e.processing_fee = "Processing fee cannot be negative";
      }
      return e;
    }

    if (sectionIndex === 1) {
      if (!loan.business_name) e.business_name = "Business name required";
      if (!loan.business_mobile || !isValidMobile(loan.business_mobile)) {
        e.business_mobile = "Valid 10-digit business mobile required";
      }
      if (loan.business_email && !isValidEmail(loan.business_email)) {
        e.business_email = "Invalid business email address";
      }
      if (loan.gstin && !isValidGstin(loan.gstin)) {
  e.gstin = "Invalid GSTIN format";
}
      if (loan.business_pan && !isValidPan(loan.business_pan)) {
        e.business_pan = "Invalid business PAN format";
      }
      if (!loan.business_pincode || String(loan.business_pincode).length !== 6) {
        e.business_pincode = "Valid 6-digit business pincode required";
      }
      return e;
    }

    if (sectionIndex === 2) {
      if (!loan.bank_name) e.bank_name = "Bank name required";
      if (!loan.account_number) e.account_number = "Account number required";
      if (!loan.ifsc) e.ifsc = "IFSC code required";
      return e;
    }

    if (sectionIndex === 3) {
      return validateApplicant(applicant, "applicant");
    }

    if (sectionIndex === 4) {
      const filledCoApplicants = coApplicants.filter(
        (a) => a.full_name || a.first_name || a.pan || a.mobile
      );
      filledCoApplicants.forEach((a, i) => {
        e = { ...e, ...validateApplicant(a, `co_${i}`) };
      });
      return e;
    }

    if (sectionIndex === 5) {
      const filledGuarantors = guarantors.filter(
        (a) => a.full_name || a.first_name || a.pan || a.mobile
      );
      filledGuarantors.forEach((a, i) => {
        e = { ...e, ...validateApplicant(a, `guarantor_${i}`) };
      });
      return e;
    }

    return e;
  };

  const handleTabClick = (targetIndex) => {
    // Run validation sequentially from the current section up to target section
    const currentSectionErrors = getSectionErrors(activeSection);
    if (Object.keys(currentSectionErrors).length > 0) {
      setErrors(currentSectionErrors);
      setMessage(`❌ Please complete the required fields in "${sections[activeSection]}" first.`);
      return;
    }
    setErrors({});
    setMessage("");
    setActiveSection(targetIndex);
  };

  const validateForm = () => {
    let globalErrors = {};
    for (let i = 0; i < sections.length; i++) {
      globalErrors = { ...globalErrors, ...getSectionErrors(i) };
    }
    setErrors(globalErrors);
    return Object.keys(globalErrors).length === 0;
  };

  const buildPayload = () => {
    const cleanCoApplicants = coApplicants
      .filter((a) => a.full_name || a.first_name || a.pan || a.mobile)
      .map((a, index) => ({
        ...a,
        role: "CO_APPLICANT",
        party_no: index + 1,
      }));

    const cleanGuarantors = guarantors
      .filter((a) => a.full_name || a.first_name || a.pan || a.mobile)
      .map((a, index) => ({
        ...a,
        role: "GUARANTOR",
        party_no: index + 1,
      }));

    return {
      loan,
      applicants: [
        {
          ...applicant,
          role: "APPLICANT",
          party_no: 1,
        },
        ...cleanCoApplicants,
        ...cleanGuarantors,
      ],
    };
  };

  const isValidGstin = (gstin) =>
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
    String(gstin || "").trim().toUpperCase()
  );

const formatGstDate = (value) => {
  if (!value) return "";

  // GST API date comes like DD/MM/YYYY
  const parts = String(value).split("/");
  if (parts.length !== 3) return "";

  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
};

const parseGstAddress = (address = "") => {
  const clean = String(address || "").replace(/\s+/g, " ").trim();

  const result = {
    address: clean,
    city: "",
    district: "",
    state: "",
    pincode: "",
  };

  const pincodeMatch = clean.match(/\b[1-9][0-9]{5}\b/);
  if (pincodeMatch) {
    result.pincode = pincodeMatch[0];
  }

  const parts = clean
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  // Example:
  // 4th Floor, 1, Engineering Centre, 9 Mathew Road, Opera House, Mumbai, Mumbai, Maharashtra, 400004
  if (parts.length >= 4) {
    result.state = parts[parts.length - 2] || "";
    result.district = parts[parts.length - 3] || "";
    result.city = parts[parts.length - 3] || "";
  }

  return result;
};

const handleVerifyGst = async () => {
  const gstin = String(loan.gstin || "").trim().toUpperCase();

  if (!gstin) {
    setErrors((prev) => ({
      ...prev,
      gstin: "GSTIN is required",
    }));
    setMessage("❌ Please enter GSTIN first.");
    return;
  }

  if (!isValidGstin(gstin)) {
    setErrors((prev) => ({
      ...prev,
      gstin: "Invalid GSTIN format",
    }));
    setMessage("❌ Invalid GSTIN format.");
    return;
  }

  try {
    setGstLoading(true);
    setMessage("");
    setErrors((prev) => ({
      ...prev,
      gstin: "",
    }));

    const res = await api.post("fundify/gst/verify", {
      gstNumber: gstin,
    });

    if (!res.data?.success) {
      setGstVerified(false);
      setMessage(`❌ ${res.data?.message || "GST verification failed"}`);
      return;
    }

    const d = res.data.data || {};
    const parsedAddress = parseGstAddress(d.address);

    setLoan((prev) => ({
      ...prev,

      gstin: d.gstin || gstin,

      // GSTIN contains PAN from character 3 to 12
      business_pan: d.gstin ? d.gstin.substring(2, 12) : prev.business_pan,

      business_name: d.legal_name || prev.business_name,
      trade_name: d.trade_name || d.legal_name || prev.trade_name,

      constitution_type:
        d.business_constitution || prev.constitution_type,

      nature_of_business:
        d.business_nature || prev.nature_of_business,

      industry_type:
        d.industry_type || prev.industry_type,

      business_start_date:
        formatGstDate(d.registration_date) || prev.business_start_date,

      business_address:
        parsedAddress.address || prev.business_address,

      business_city:
        parsedAddress.city || prev.business_city,

      business_district:
        parsedAddress.district || prev.business_district,

      business_state:
        parsedAddress.state || prev.business_state,

      business_pincode:
        parsedAddress.pincode || prev.business_pincode,

      business_mobile:
        d.mobile || prev.business_mobile,

      business_email:
        d.email || prev.business_email,
    }));

    setGstVerified(true);
    setMessage(
      `✅ GST verified: ${d.legal_name || d.trade_name || gstin}`
    );
  } catch (err) {
    setGstVerified(false);
    setMessage(
      `❌ ${
        err.response?.data?.message ||
        err.message ||
        "GST verification failed"
      }`
    );
  } finally {
    setGstLoading(false);
  }
};

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!validateForm()) {
      setMessage("❌ Validation failed. Please review all fields across the sections.");
      return;
    }

    try {
      setLoading(true);
      const payload = buildPayload();
      if (resumeLan) {
        payload.loan.lan = resumeLan;
      }
      const res = await api.post("/fundify/manual-entry", payload);
      setMessage(
        `✅ Fundify loan ${resumeLan ? "updated" : "created"} successfully | LAN: ${res.data.lan} | Partner Loan ID: ${res.data.partner_loan_id || "N/A"}`
      );
    } catch (err) {
      setMessage(
        `❌ ${err.response?.data?.message || err.message || "Failed to submit application"}`
      );
    } finally {
      setLoading(false);
    }
  };

  const renderInput = (label, name, value, onChange, type = "text", readOnly = false, errorKey = null) => {
    const keyToLookup = errorKey || name;
    return (
      <div className="form-group">
        <label>{label}</label>
        <input
          className={`styled-input ${errors[keyToLookup] ? "input-error" : ""}`}
          name={name}
          type={type}
          value={value || ""}
          onChange={onChange}
          readOnly={readOnly}
          placeholder={`Enter ${label}`}
        />
        {errors[keyToLookup] && <span className="error-text">{errors[keyToLookup]}</span>}
      </div>
    );
  };

  const renderSelect = (label, name, value, onChange, options = [], errorKey = null) => {
    const keyToLookup = errorKey || name;
    return (
      <div className="form-group">
        <label>{label}</label>
        <select
          className={`styled-input ${errors[keyToLookup] ? "input-error" : ""}`}
          name={name}
          value={value || ""}
          onChange={onChange}
        >
          <option value="">Select {label}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {errors[keyToLookup] && <span className="error-text">{errors[keyToLookup]}</span>}
      </div>
    );
  };

  const renderApplicantForm = (data, onChange, title, errorPrefix) => (
    <div className="party-card">
      <h3>{title}</h3>

      <div className="form-grid">
        {renderInput("First Name", "first_name", data.first_name, onChange, "text", false, `${errorPrefix}_first_name`)}
        {renderInput("Middle Name", "middle_name", data.middle_name, onChange, "text", false, `${errorPrefix}_middle_name`)}
        {renderInput("Last Name", "last_name", data.last_name, onChange, "text", false, `${errorPrefix}_last_name`)}
        {renderInput("Full Name", "full_name", data.full_name, onChange, "text", false, `${errorPrefix}_full_name`)}
        {renderInput("Father Name", "father_name", data.father_name, onChange, "text", false, `${errorPrefix}_father_name`)}
        {renderInput("Mother Name", "mother_name", data.mother_name, onChange, "text", false, `${errorPrefix}_mother_name`)}
        {renderInput("Spouse Name", "spouse_name", data.spouse_name, onChange, "text", false, `${errorPrefix}_spouse_name`)}
        {renderInput("DOB", "dob", data.dob, onChange, "date", false, `${errorPrefix}_dob`)}

        {renderSelect("Gender", "gender", data.gender, onChange, ["Male", "Female", "Other"], `${errorPrefix}_gender`)}
        {renderSelect("Marital Status", "marital_status", data.marital_status, onChange, ["Single", "Married", "Divorced", "Widowed", "Other"], `${errorPrefix}_marital_status`)}

        {renderInput("Mobile", "mobile", data.mobile, onChange, "text", false, `${errorPrefix}_mobile`)}
        {renderInput("Alternate Mobile", "alternate_mobile", data.alternate_mobile, onChange, "text", false, `${errorPrefix}_alternate_mobile`)}
        {renderInput("Email", "email", data.email, onChange, "email", false, `${errorPrefix}_email`)}
        {renderInput("PAN", "pan", data.pan, onChange, "text", false, `${errorPrefix}_pan`)}
        {renderInput("Aadhaar Last 4", "aadhaar_last4", data.aadhaar_last4, onChange, "text", false, `${errorPrefix}_aadhaar_last4`)}
        {renderInput("Voter ID", "voter_id", data.voter_id, onChange, "text", false, `${errorPrefix}_voter_id`)}
        {renderInput("Driving License No", "driving_license_no", data.driving_license_no, onChange, "text", false, `${errorPrefix}_driving_license_no`)}
        {renderInput("Passport No", "passport_no", data.passport_no, onChange, "text", false, `${errorPrefix}_passport_no`)}
        {renderInput("CKYC No", "ckyc_no", data.ckyc_no, onChange, "text", false, `${errorPrefix}_ckyc_no`)}

        {renderInput("Current Address", "current_address", data.current_address, onChange, "text", false, `${errorPrefix}_current_address`)}
        {renderInput("Current City", "current_city", data.current_city, onChange, "text", false, `${errorPrefix}_current_city`)}
        {renderInput("Current District", "current_district", data.current_district, onChange, "text", false, `${errorPrefix}_current_district`)}
        {renderInput("Current State", "current_state", data.current_state, onChange, "text", false, `${errorPrefix}_current_state`)}
        {renderInput("Current Pincode", "current_pincode", data.current_pincode, onChange, "text", false, `${errorPrefix}_current_pincode`)}
        {renderInput("Current Landmark", "current_landmark", data.current_landmark, onChange, "text", false, `${errorPrefix}_current_landmark`)}

        {renderSelect("Residence Ownership", "residence_ownership", data.residence_ownership, onChange, ["Owned", "Rented", "Leased", "Family Owned", "Other"], `${errorPrefix}_residence_ownership`)}

        <label className="checkbox-row">
          <input
            type="checkbox"
            name="same_as_current_address"
            checked={Boolean(data.same_as_current_address)}
            onChange={onChange}
          />
          Same as current address
        </label>

        {renderInput("Permanent Address", "permanent_address", data.permanent_address, onChange, "text", false, `${errorPrefix}_permanent_address`)}
        {renderInput("Permanent City", "permanent_city", data.permanent_city, onChange, "text", false, `${errorPrefix}_permanent_city`)}
        {renderInput("Permanent District", "permanent_district", data.permanent_district, onChange, "text", false, `${errorPrefix}_permanent_district`)}
        {renderInput("Permanent State", "permanent_state", data.permanent_state, onChange, "text", false, `${errorPrefix}_permanent_state`)}
        {renderInput("Permanent Pincode", "permanent_pincode", data.permanent_pincode, onChange, "text", false, `${errorPrefix}_permanent_pincode`)}

        {renderInput("Occupation", "occupation", data.occupation, onChange, "text", false, `${errorPrefix}_occupation`)}
        {renderInput("Employer Name", "employer_name", data.employer_name, onChange, "text", false, `${errorPrefix}_employer_name`)}
        {renderInput("Monthly Income", "monthly_income", data.monthly_income, onChange, "number", false, `${errorPrefix}_monthly_income`)}
      </div>
    </div>
  );

  return (
    <div className="manual-entry-container">
      <h2>Fundify Manual Entry</h2>

      {/* <div className="section-tabs">
        {sections.map((sec, index) => (
          <div
            key={sec}
            className={`tab ${activeSection === index ? "active" : ""}`}
            onClick={() => handleTabClick(index)}
          >
            {sec}
          </div>
        ))}
      </div> */}

      <div className="section-tabs">
  {sections.map((sec, index) => (
    <div
      key={sec}
      className={`tab ${activeSection === index ? "active" : ""}`}
      onClick={() => setActiveSection(index)}
    >
      {sec}
    </div>
  ))}
</div>

      <form onSubmit={handleSubmit}>
        {activeSection === 0 && (
          <div className="form-grid">
            {renderInput("Login Date", "login_date", loan.login_date, handleLoanChange, "date")}
            {renderInput("Loan Amount", "loan_amount", loan.loan_amount, handleLoanChange, "number")}
            {renderInput("Disbursal Amount", "disbursal_amount", loan.disbursal_amount, handleLoanChange, "number")}
            {renderInput("Interest Rate", "interest_rate", loan.interest_rate, handleLoanChange, "number")}
            {renderInput("Loan Tenure", "loan_tenure", loan.loan_tenure, handleLoanChange, "number")}
            {renderInput("Processing Fee", "processing_fee", loan.processing_fee, handleLoanChange, "number")}
            {renderInput("Processing Fee %", "processing_fee_percentage", loan.processing_fee_percentage, handleLoanChange, "number", true)}
            {renderInput("Insurance Amount", "insurance_amount", loan.insurance_amount, handleLoanChange, "number")}
            {renderInput("Other Charges", "other_charges", loan.other_charges, handleLoanChange, "number")}
          </div>
        )}

        {activeSection === 1 && (
          <div className="form-grid">
            {renderInput("Business Name", "business_name", loan.business_name, handleLoanChange)}
            {renderInput("Trade Name", "trade_name", loan.trade_name, handleLoanChange)}
            {renderInput("Business PAN", "business_pan", loan.business_pan, handleLoanChange)}
            <div className="gst-verify-wrapper">
  {renderInput("GSTIN", "gstin", loan.gstin, handleLoanChange)}

  <button
    type="button"
    className={gstVerified ? "verified-btn" : "verify-btn"}
    onClick={handleVerifyGst}
    disabled={gstLoading || gstVerified}
  >
    {gstLoading
      ? "Verifying..."
      : gstVerified
        ? "Verified ✓"
        : "Verify & Fetch"}
  </button>
</div>
            {renderInput("Udyam Registration No", "udyam_registration_no", loan.udyam_registration_no, handleLoanChange)}
            {renderInput("CIN", "cin", loan.cin, handleLoanChange)}
            {renderInput("LLPIN", "llpin", loan.llpin, handleLoanChange)}
            {renderInput("Shop Establishment No", "shop_establishment_no", loan.shop_establishment_no, handleLoanChange)}
            {renderInput("Business Registration No", "business_registration_no", loan.business_registration_no, handleLoanChange)}
            {renderInput("Constitution Type", "constitution_type", loan.constitution_type, handleLoanChange)}
            {renderInput("Business Start Date", "business_start_date", loan.business_start_date, handleLoanChange, "date")}
            {renderInput("Business Vintage Months", "business_vintage_months", loan.business_vintage_months, handleLoanChange, "number")}
            {renderInput("Nature Of Business", "nature_of_business", loan.nature_of_business, handleLoanChange)}
            {renderInput("Industry Type", "industry_type", loan.industry_type, handleLoanChange)}
            {renderInput("Business Address", "business_address", loan.business_address, handleLoanChange)}
            {renderInput("Business City", "business_city", loan.business_city, handleLoanChange)}
            {renderInput("Business District", "business_district", loan.business_district, handleLoanChange)}
            {renderInput("Business State", "business_state", loan.business_state, handleLoanChange)}
            {renderInput("Business Pincode", "business_pincode", loan.business_pincode, handleLoanChange)}
            {renderSelect("Premises Ownership", "premises_ownership", loan.premises_ownership, handleLoanChange, ["Owned", "Rented", "Leased", "Family Owned", "Other"])}
            {renderInput("Business Mobile", "business_mobile", loan.business_mobile, handleLoanChange)}
            {renderInput("Business Email", "business_email", loan.business_email, handleLoanChange, "email")}
          </div>
        )}

        {activeSection === 2 && (
          <div className="form-grid">
            {renderInput("Bank Name", "bank_name", loan.bank_name, handleLoanChange)}
            {renderInput("Name In Bank", "name_in_bank", loan.name_in_bank, handleLoanChange)}
            {renderInput("Account Number", "account_number", loan.account_number, handleLoanChange)}
            {renderInput("IFSC", "ifsc", loan.ifsc, handleLoanChange)}
            {renderSelect("Account Type", "account_type", loan.account_type, handleLoanChange, ["SAVINGS", "CURRENT", "OD", "CC", "OTHER"])}
          </div>
        )}

        {activeSection === 3 &&
          renderApplicantForm(applicant, handleApplicantChange(setApplicant), "Primary Applicant", "applicant")}

        {activeSection === 4 && (
          <>
            {coApplicants.map((co, index) => (
              <div key={index}>
                {renderApplicantForm(co, handleApplicantChange(setCoApplicants, index), `Co-Applicant ${index + 1}`, `co_${index}`)}
                {coApplicants.length > 1 && (
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => setCoApplicants((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove Co-Applicant
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="add-btn"
              onClick={() => setCoApplicants((prev) => [...prev, emptyApplicant("CO_APPLICANT", prev.length + 1)])}
            >
              + Add Co-Applicant
            </button>
          </>
        )}

        {activeSection === 5 && (
          <>
            {guarantors.map((g, index) => (
              <div key={index}>
                {renderApplicantForm(g, handleApplicantChange(setGuarantors, index), `Guarantor ${index + 1}`, `guarantor_${index}`)}
                {guarantors.length > 1 && (
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => setGuarantors((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove Guarantor
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="add-btn"
              onClick={() => setGuarantors((prev) => [...prev, emptyApplicant("GUARANTOR", prev.length + 1)])}
            >
              + Add Guarantor
            </button>
          </>
        )}

        <div className="step-buttons">
          {activeSection > 0 && (
            <button type="button" onClick={() => { setErrors({}); setMessage(""); setActiveSection(activeSection - 1); }}>
              ← Back
            </button>
          )}

          {activeSection < sections.length - 1 ? (
            <button
              type="button"
              onClick={() => {
                const sectionErrors = getSectionErrors(activeSection);
                if (Object.keys(sectionErrors).length > 0) {
                  setErrors(sectionErrors);
                  setMessage(`❌ Complete required fields in ${sections[activeSection]} first.`);
                  return;
                }
                setErrors({});
                setMessage("");
                setActiveSection(activeSection + 1);
              }}
            >
              Next →
            </button>
          ) : (
            <button type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Submit Fundify Loan"}
            </button>
          )}
        </div>
      </form>

      {message && (
        <div className={`message ${message.includes("❌") ? "message-error" : ""}`}>
          {message}
        </div>
      )}

      <style>{`
        .manual-entry-container {
          background: #ffffff;
          margin: 30px auto;
          padding: 40px 50px;
          border-radius: 14px;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.08);
          max-width: 1200px;
        }
        .manual-entry-container h2 {
          font-size: 28px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 25px;
        }
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
          background: linear-gradient(90deg, rgba(56, 189, 248, 0.18), rgba(56, 189, 248, 0.05));
          color: #0f172a;
          font-weight: 600;
          border-left: 4px solid #38bdf8;
        }
        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 26px 40px;
        }
        .party-card {
          margin-bottom: 30px;
          padding: 24px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #f8fafc;
        }
        .party-card h3 {
          margin-top: 0;
          margin-bottom: 24px;
          color: #0f172a;
        }
          .gst-verify-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.gst-verify-wrapper .form-group {
  flex: 1;
}

.verify-btn,
.verified-btn {
  height: 52px;
  border: none;
  padding: 0 18px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.verify-btn {
  background: #0f172a;
  color: white;
}

.verified-btn {
  background: #10b981;
  color: white;
}

.verify-btn:disabled,
.verified-btn:disabled {
  opacity: 0.8;
  cursor: not-allowed;
}
        .form-group {
          display: flex;
          flex-direction: column;
        }
        .form-group label {
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          margin-bottom: 8px;
        }
        .styled-input {
          width: 100%;
          height: 52px;
          border-radius: 14px;
          border: 2px solid #d8e2ee;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          padding: 0 16px;
          font-size: 15px;
          font-weight: 500;
          color: #0f172a;
          transition: all 0.22s ease;
        }
        .styled-input:focus {
          border-color: #38bdf8;
          background: #ffffff;
          outline: none;
          box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.12), 0 8px 20px rgba(37, 99, 235, 0.06);
          transform: translateY(-1px);
        }
        .input-error {
          border-color: #dc2626 !important;
          background: #fff5f5;
        }
        .styled-input:read-only {
          background: #f1f5f9;
          cursor: not-allowed;
        }
        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          font-weight: 600;
          color: #334155;
          margin-top: 28px;
        }
        .checkbox-row input {
          width: 16px;
          height: 16px;
        }
        .step-buttons {
          display: flex;
          justify-content: space-between;
          margin-top: 40px;
          gap: 15px;
        }
        .step-buttons button, .add-btn, .remove-btn {
          background: #0f172a;
          border: none;
          color: white;
          padding: 12px 32px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: 0.2s ease;
        }
        .add-btn {
          margin-top: 10px;
          background: #0369a1;
        }
        .remove-btn {
          margin-bottom: 24px;
          background: #dc2626;
        }
        .step-buttons button:hover:not(:disabled), .add-btn:hover, .remove-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.2);
        }
        .step-buttons button:disabled {
          background: #cbd5e1;
          cursor: not-allowed;
        }
        .message {
          margin-top: 20px;
          padding: 14px 16px;
          border-radius: 8px;
          background: #ecfdf5;
          color: #065f46;
          font-weight: 600;
          border-left: 4px solid #10b981;
        }
        .message-error {
          background: #fef2f2;
          color: #7f1d1d;
          border-left-color: #dc2626;
        }
        .error-text {
          color: #dc2626;
          font-size: 12px;
          font-weight: 600;
          margin-top: 4px;
        }
        @media (max-width: 768px) {
          .form-grid { grid-template-columns: 1fr; gap: 20px; }
          .manual-entry-container { padding: 25px; margin: 15px; }
          .section-tabs { overflow-x: auto; }
          .tab { white-space: nowrap; }
          .step-buttons { flex-direction: column-reverse; }
          .step-buttons button, .add-btn, .remove-btn { width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default FundifyManualEntry;