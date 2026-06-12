import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
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

const SECTIONS = [
  "Business Details",
  "Applicant",
  "Loan Details",
  "Bank Details",
  "Co-Applicants",
  "Guarantors",
];

const CONSENT_TEXT = `I/We hereby authorise Fintree Finance Private Limited (FFPL) or its associates/subsidiaries/affiliates to obtain, verify, exchange, share or part with all the information regarding my/our residence/contact details and to contact me/us or my/our family/employer/banker/credit bureau/RBI or any third parties as deemed necessary.

I/We consent to receive OTP, SMS, Calls, Email and verification communication related to this loan application.

I/We authorize lender representatives to perform verification and investigation activities including residence verification and document verification.

I/We consent to sharing of data with banks, NBFCs, credit bureaus, CKYC, service providers and regulators for processing and servicing this loan application.`;

/* ============================================================ */
/*                       COMPONENT                              */
/* ============================================================ */

const FundifyManualEntry = () => {
  const [searchParams] = useSearchParams();
  const resumeLan = searchParams.get("lan");

  /* ---- Navigation ---- */
  const [activeSection, setActiveSection] = useState(0);
  const [completedSections, setCompletedSections] = useState(new Set());

  /* ---- Async state ---- */
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  /* ---- Validation ---- */
  const [errors, setErrors] = useState({});
  const [fieldStatus, setFieldStatus] = useState({});
  const [touched, setTouched] = useState({});

  /* ---- Progressive save ---- */
  const [lan, setLan] = useState(resumeLan || "");
  const [businessSaved, setBusinessSaved] = useState(!!resumeLan); // LAN created when business section saved
  const [submitted, setSubmitted] = useState(false);
  const [submittedLan, setSubmittedLan] = useState("");

  /* ---- Aadhaar KYC ---- */
  const [aadhaarStatus, setAadhaarStatus] = useState({
    BORROWER: "",
    CO_APPLICANT: "",
    GUARANTOR: "",
  });

  /* ---- GST ---- */
  const [gstLoading, setGstLoading] = useState(false);
  const [gstVerified, setGstVerified] = useState(false);
  const [gstRawResponse, setGstRawResponse] = useState(null);

  /* ---- OTP ---- */
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [verificationTarget, setVerificationTarget] = useState("");
  const [otpVerified, setOtpVerified] = useState({ applicant: false });
  const [resendTimers, setResendTimers] = useState({});

  /* ---- Data ---- */
  const [applicant, setApplicant] = useState(emptyApplicant("APPLICANT", 1));
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
  const [coApplicants, setCoApplicants] = useState([emptyApplicant("CO_APPLICANT", 1)]);
  const [guarantors, setGuarantors] = useState([emptyApplicant("GUARANTOR", 1)]);

  /* ============================================================ */
  /*                     RESUME EFFECT                            */
  /* ============================================================ */

  useEffect(() => {
    if (resumeLan) fetchResumeBooking(resumeLan);
  }, [resumeLan]);


  const fetchResumeBooking = async (resumeLanParam) => {
    setLoading(true);
    try {
      const res = await api.get(`/fundify/fundify-manual-entry/${resumeLanParam}`);
      if (res.data.success) {
        const { loan: rl, applicants } = res.data.data;

        const normDate = (d) => (d ? String(d).split("T")[0] : "");
        Object.keys(rl).forEach((k) => {
          if (k.includes("date") || k === "dob") rl[k] = normDate(rl[k]);
        });

        setLoan((prev) => ({ ...prev, ...rl }));
        setLan(resumeLanParam);
        setBusinessSaved(true);
        setCompletedSections(new Set([0, 1, 2, 3]));

        const apps = [], coApps = [], guars = [];
        applicants.forEach((a) => {
          if (a.dob) a.dob = normDate(a.dob);
          if (a.role === "APPLICANT") apps.push(a);
          else if (a.role === "CO_APPLICANT") coApps.push(a);
          else if (a.role === "GUARANTOR") guars.push(a);
        });

        if (apps.length > 0) {
          setApplicant(apps[0]);
          setOtpVerified((p) => ({ ...p, applicant: !!apps[0].mobile_verified }));
        }
        if (coApps.length > 0) {
          setCoApplicants(coApps);
          const m = {};
          coApps.forEach((a, i) => { m[`co_${i}`] = !!a.mobile_verified; });
          setOtpVerified((p) => ({ ...p, ...m }));
        }
        if (guars.length > 0) {
          setGuarantors(guars);
          const m = {};
          guars.forEach((a, i) => { m[`guarantor_${i}`] = !!a.mobile_verified; });
          setOtpVerified((p) => ({ ...p, ...m }));
        }
        setMessage(`✅ Resumed loan. LAN: ${resumeLanParam}`);
      }
    } catch {
      setMessage("❌ Could not load existing loan details.");
    } finally {
      setLoading(false);
    }
  };

  /* ============================================================ */
  /*                     VALIDATORS                               */
  /* ============================================================ */

  const isValidMobile = (m) => /^[6-9]\d{9}$/.test(String(m || "").trim());
  const isValidPan    = (p) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(p || "").trim());
  const isValidEmail  = (e) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
  const isValidGstin  = (g) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(g || "").trim().toUpperCase());

  /* ============================================================ */
  /*              PINCODE & IFSC LOOKUP HANDLERS                  */
  /* ============================================================ */

  /**
   * target format:
   *   "applicant_current"  → fills applicant.current_city / current_district / current_state
   *   "applicant_permanent" → fills applicant.permanent_city / permanent_district / permanent_state
   *   "business"           → fills loan.business_city / business_district / business_state
   *   "co_0_current"       → fills coApplicants[0].current_*
   *   "co_0_permanent"     → fills coApplicants[0].permanent_*
   *   "guarantor_0_current" etc.
   */
  const handlePincodeLookup = async (pincode, target) => {
    const pin = String(pincode || "").trim();
    if (pin.length !== 6) return;
    try {
      const res = await axios.get(`https://api.postalpincode.in/pincode/${pin}`);
      const data = res.data[0];
      if (data.Status !== "Success" || !data.PostOffice?.length) {
        setMessage("⚠️ Pincode not found — please fill city/district/state manually.");
        return;
      }
      const office = data.PostOffice[0];
      const city     = office.Division || office.Name || "";
      const district = office.District || "";
      const state    = office.State    || "";

      if (target === "business") {
        setLoan((prev) => ({
          ...prev,
          business_city:     prev.business_city     || city,
          business_district: prev.business_district || district,
          business_state:    prev.business_state    || state,
        }));
      } else if (target === "applicant_current") {
        setApplicant((prev) => ({
          ...prev,
          current_city:     prev.current_city     || city,
          current_district: prev.current_district || district,
          current_state:    prev.current_state    || state,
        }));
      } else if (target === "applicant_permanent") {
        setApplicant((prev) => ({
          ...prev,
          permanent_city:     prev.permanent_city     || city,
          permanent_district: prev.permanent_district || district,
          permanent_state:    prev.permanent_state    || state,
        }));
      } else if (target.startsWith("co_")) {
        const [, idxStr, addrType] = target.split("_");
        const idx = parseInt(idxStr, 10);
        setCoApplicants((prev) => {
          const copy = [...prev];
          const up = { ...copy[idx] };
          if (addrType === "current") {
            up.current_city     = up.current_city     || city;
            up.current_district = up.current_district || district;
            up.current_state    = up.current_state    || state;
          } else {
            up.permanent_city     = up.permanent_city     || city;
            up.permanent_district = up.permanent_district || district;
            up.permanent_state    = up.permanent_state    || state;
          }
          copy[idx] = up;
          return copy;
        });
      } else if (target.startsWith("guarantor_")) {
        const parts = target.split("_");  // ["guarantor", idx, addrType]
        const idx = parseInt(parts[1], 10);
        const addrType = parts[2];
        setGuarantors((prev) => {
          const copy = [...prev];
          const up = { ...copy[idx] };
          if (addrType === "current") {
            up.current_city     = up.current_city     || city;
            up.current_district = up.current_district || district;
            up.current_state    = up.current_state    || state;
          } else {
            up.permanent_city     = up.permanent_city     || city;
            up.permanent_district = up.permanent_district || district;
            up.permanent_state    = up.permanent_state    || state;
          }
          copy[idx] = up;
          return copy;
        });
      }
      setMessage(`✅ Pincode ${pin}: ${district}, ${state}`);
    } catch (err) {
      console.error("Pincode lookup error:", err);
      setMessage("⚠️ Could not fetch pincode details — please fill city/district/state manually.");
    }
  };

  const handleIfscLookup = async (ifscValue) => {
    const ifsc = String(ifscValue || "").trim().toUpperCase();
    if (!ifsc || ifsc.length < 11) return;
    try {
      const res = await axios.get(`https://ifsc.razorpay.com/${ifsc}`);
      setLoan((prev) => ({
        ...prev,
        bank_name:    res.data.BANK   || prev.bank_name,
        name_in_bank: prev.name_in_bank,  // don't overwrite name
      }));
      setMessage(`✅ IFSC matched: ${res.data.BANK} — ${res.data.BRANCH}`);
    } catch {
      setMessage("⚠️ Invalid IFSC code or not found.");
    }
  };

  /* ============================================================ */
  /*              PINCODE AUTO-LOOKUP EFFECTS (after handlers)    */
  /* ============================================================ */

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (String(applicant.current_pincode || "").length === 6) handlePincodeLookup(applicant.current_pincode, "applicant_current"); }, [applicant.current_pincode]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (String(applicant.permanent_pincode || "").length === 6) handlePincodeLookup(applicant.permanent_pincode, "applicant_permanent"); }, [applicant.permanent_pincode]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (String(loan.business_pincode || "").length === 6) handlePincodeLookup(loan.business_pincode, "business"); }, [loan.business_pincode]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { coApplicants.forEach((co, i) => { if (String(co.current_pincode || "").length === 6) handlePincodeLookup(co.current_pincode, `co_${i}_current`); }); }, [coApplicants.map((c) => c.current_pincode).join(",")]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { coApplicants.forEach((co, i) => { if (String(co.permanent_pincode || "").length === 6) handlePincodeLookup(co.permanent_pincode, `co_${i}_permanent`); }); }, [coApplicants.map((c) => c.permanent_pincode).join(",")]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { guarantors.forEach((g, i) => { if (String(g.current_pincode || "").length === 6) handlePincodeLookup(g.current_pincode, `guarantor_${i}_current`); }); }, [guarantors.map((g) => g.current_pincode).join(",")]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { guarantors.forEach((g, i) => { if (String(g.permanent_pincode || "").length === 6) handlePincodeLookup(g.permanent_pincode, `guarantor_${i}_permanent`); }); }, [guarantors.map((g) => g.permanent_pincode).join(",")]);

  const validateFieldValue = (name, value) => {
    const v = String(value || "").trim();
    switch (name) {
      case "first_name": return v ? "" : "First name is required";
      case "full_name":  return "";
      case "dob":        return v ? "" : "Date of birth is required";
      case "mobile":
        if (!v) return "Mobile number is required";
        return isValidMobile(v) ? "" : "Enter valid 10-digit mobile (starts 6–9)";
      case "alternate_mobile":
        return v && !isValidMobile(v) ? "Enter valid 10-digit mobile" : "";
      case "pan":
      case "business_pan":
        return v && !isValidPan(v) ? "Invalid PAN (e.g. ABCDE1234F)" : "";
      case "email":
      case "business_email":
        return v && !isValidEmail(v) ? "Invalid email format" : "";
      case "gstin":
        return v && !isValidGstin(v) ? "Invalid GSTIN format" : "";
      case "current_pincode":
      case "permanent_pincode":
      case "business_pincode":
        return v && v.length !== 6 ? "Enter valid 6-digit pincode" : "";
      case "current_address":  return v ? "" : "Current address is required";
      case "loan_amount":      return !v || Number(v) <= 0 ? "Loan amount must be > 0" : "";
      case "interest_rate":    return v && Number(v) <= 0 ? "Interest rate must be > 0" : "";
      case "loan_tenure":      return v && Number(v) <= 0 ? "Tenure must be > 0 months" : "";
      case "business_name":    return v ? "" : "Business name is required";
      case "business_mobile":
        if (!v) return "Business mobile is required";
        return isValidMobile(v) ? "" : "Enter valid 10-digit mobile";
      case "bank_name":        return v ? "" : "Bank name is required";
      case "account_number":   return v ? "" : "Account number is required";
      case "ifsc":             return v ? "" : "IFSC code is required";
      default:                 return "";
    }
  };

  const markField = (key, value, name) => {
    const error = validateFieldValue(name, value);
    const v = String(value || "").trim();
    const status = v === "" ? "empty" : error ? "invalid" : "valid";
    setErrors((p) => ({ ...p, [key]: error }));
    setFieldStatus((p) => ({ ...p, [key]: status }));
    setTouched((p) => ({ ...p, [key]: true }));
  };

  /* ============================================================ */
  /*                   SECTION VALIDATION                         */
  /* ============================================================ */

  const validateApplicant = () => {
    const e = {};
    if (!applicant.first_name && !applicant.full_name) e["applicant_first_name"] = "First Name is required";
    if (!isValidMobile(applicant.mobile)) e["applicant_mobile"] = "Valid 10-digit mobile required";
    if (applicant.pan && !isValidPan(applicant.pan)) e["applicant_pan"] = "Invalid PAN format";
    if (applicant.email && !isValidEmail(applicant.email)) e["applicant_email"] = "Invalid email format";
    if (!applicant.dob) e["applicant_dob"] = "Date of birth required";
    if (!applicant.current_address) e["applicant_current_address"] = "Current address required";
    if (applicant.current_pincode && String(applicant.current_pincode).length !== 6) e["applicant_current_pincode"] = "6-digit pincode required";
    return e;
  };

  const validateBusiness = () => {
    const e = {};
    if (!loan.business_name) e["business_name"] = "Business name is required";
    if (loan.business_mobile && !isValidMobile(loan.business_mobile)) e["business_mobile"] = "Valid 10-digit mobile required";
    if (loan.business_email && !isValidEmail(loan.business_email)) e["business_email"] = "Invalid email format";
    if (loan.gstin && !isValidGstin(loan.gstin)) e["gstin"] = "Invalid GSTIN format";
    if (loan.business_pan && !isValidPan(loan.business_pan)) e["business_pan"] = "Invalid PAN format";
    if (loan.business_pincode && String(loan.business_pincode).length !== 6) e["business_pincode"] = "6-digit pincode required";
    return e;
  };

  const validateLoan = () => {
    const e = {};
    if (!loan.loan_amount || Number(loan.loan_amount) <= 0) e["loan_amount"] = "Loan amount must be > 0";
    if (loan.interest_rate && Number(loan.interest_rate) <= 0) e["interest_rate"] = "Interest rate must be > 0";
    if (loan.loan_tenure && Number(loan.loan_tenure) <= 0) e["loan_tenure"] = "Tenure must be > 0 months";
    return e;
  };

  const validateBank = () => {
    const e = {};
    if (!loan.bank_name) e["bank_name"] = "Bank name is required";
    if (!loan.account_number) e["account_number"] = "Account number is required";
    if (!loan.ifsc) e["ifsc"] = "IFSC code is required";
    return e;
  };

  const validatePartyList = (parties, prefix) => {
    const e = {};
    parties.forEach((a, i) => {
      const p = `${prefix}_${i}`;
      if (!a.first_name && !a.full_name) e[`${p}_first_name`] = "Name required";
      if (!isValidMobile(a.mobile)) e[`${p}_mobile`] = "Valid mobile required";
      if (a.pan && !isValidPan(a.pan)) e[`${p}_pan`] = "Invalid PAN format";
      if (a.email && !isValidEmail(a.email)) e[`${p}_email`] = "Invalid email format";
    });
    return e;
  };

  const getSectionErrors = (sectionIdx) => {
    switch (sectionIdx) {
      case 0: return validateBusiness();
      case 1: return validateApplicant();
      case 2: return validateLoan();
      case 3: return validateBank();
      case 4: {
        const filled = coApplicants.filter((a) => a.first_name || a.full_name || a.mobile);
        return filled.length > 0 ? validatePartyList(filled, "co") : {};
      }
      case 5: {
        const filled = guarantors.filter((a) => a.first_name || a.full_name || a.mobile);
        return filled.length > 0 ? validatePartyList(filled, "guarantor") : {};
      }
      default: return {};
    }
  };

  /* ============================================================ */
  /*                   FIELD CHANGE HANDLERS                      */
  /* ============================================================ */

  const handleLoanChange = (e) => {
    let { name, value } = e.target;
    if (["business_pan", "gstin", "ifsc"].includes(name)) value = value.toUpperCase();
    if (name === "business_email") value = value.toLowerCase().replace(/\s/g, "");
    if (["business_pincode"].includes(name)) value = value.replace(/\D/g, "").slice(0, 6);
    if (name === "gstin") setGstVerified(false);

    setLoan((prev) => {
      const up = { ...prev, [name]: value };
      if (name === "loan_amount" || name === "processing_fee") {
        const amt = Number(name === "loan_amount" ? value : up.loan_amount);
        const fee = Number(name === "processing_fee" ? value : up.processing_fee);
        if (amt > 0) {
          up.processing_fee_percentage = fee >= 0 ? ((fee / amt) * 100).toFixed(2) : up.processing_fee_percentage;
          up.disbursal_amount = (amt - (fee >= 0 ? fee : 0)).toFixed(2);
        }
      }
      return up;
    });
    markField(name, value, name);
  };

  const handleApplicantChange = (setter, index = null) => (e) => {
    const { name, type, checked, value } = e.target;
    let finalValue = type === "checkbox" ? checked : value;
    if (["pan", "voter_id", "driving_license_no", "passport_no"].includes(name)) finalValue = String(value).toUpperCase();
    if (name === "email") finalValue = value.toLowerCase().replace(/\s/g, "");
    if (["current_pincode", "permanent_pincode"].includes(name)) finalValue = value.replace(/\D/g, "").slice(0, 6);

    const updater = (prev) => {
      const updateSingle = (data) => {
        const up = { ...data, [name]: finalValue };
        if (["first_name", "middle_name", "last_name"].includes(name)) {
          up.full_name = [up.first_name, up.middle_name, up.last_name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        }
        if (name === "same_as_current_address" && checked) {
          up.permanent_address = up.current_address;
          up.permanent_city = up.current_city;
          up.permanent_district = up.current_district;
          up.permanent_state = up.current_state;
          up.permanent_pincode = up.current_pincode;
        }
        return up;
      };

      if (Array.isArray(prev)) {
        const copy = [...prev];
        copy[index] = updateSingle(copy[index]);
        return copy;
      }
      return updateSingle(prev);
    };

    setter(updater);

    // Determine error key
    let prefix = "applicant";
    if (index !== null) {
      if (setter === setCoApplicants) prefix = `co_${index}`;
      else if (setter === setGuarantors) prefix = `guarantor_${index}`;
    }
    const errKey = `${prefix}_${name}`;
    markField(errKey, finalValue, name);
  };

  /* ============================================================ */
  /*                     OTP HANDLERS                             */
  /* ============================================================ */

  const toApplicantType = (targetKey) => {
    if (targetKey === "applicant") return "BORROWER";
    if (targetKey.startsWith("co_")) return "CO_APPLICANT";
    if (targetKey.startsWith("guarantor_")) return "GUARANTOR";
    return targetKey;
  };

  const handleOpenConsentDialog = async (mobile, targetKey) => {
    if (!isValidMobile(mobile)) {
      alert("Enter a valid 10-digit mobile number before sending OTP");
      return;
    }
    setOtp(""); setConsentChecked(false);
    setVerificationTarget(targetKey);
    setShowConsentDialog(true);
    if ((resendTimers[targetKey] || 0) === 0) await sendOtp(mobile, targetKey);
  };

  const sendOtp = async (mobile, targetKey) => {
    try {
      setOtpLoading(true);
      const res = await api.post("/fundify/send-otp", { mobile, applicantType: toApplicantType(targetKey) });
      if (res.data.success) {
        setResendTimers((p) => ({ ...p, [targetKey]: 60 }));
        const timer = setInterval(() => {
          setResendTimers((p) => {
            const cur = p[targetKey];
            if (cur <= 1) { clearInterval(timer); return { ...p, [targetKey]: 0 }; }
            return { ...p, [targetKey]: cur - 1 };
          });
        }, 1000);
      }
    } catch (err) {
      alert(`Failed to send OTP: ${err.response?.data?.message || err.message}`);
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtpHandler = async () => {
    if (!otp) { alert("Please enter OTP"); return; }
    if (!consentChecked) { alert("Please accept the consent terms"); return; }

    let mobile = "";
    if (verificationTarget === "applicant") mobile = applicant.mobile;
    else if (verificationTarget.startsWith("co_")) mobile = coApplicants[parseInt(verificationTarget.split("_")[1], 10)]?.mobile || "";
    else if (verificationTarget.startsWith("guarantor_")) mobile = guarantors[parseInt(verificationTarget.split("_")[1], 10)]?.mobile || "";

    try {
      setOtpLoading(true);
      const res = await api.post("/fundify/verify-otp", {
        mobile, otp,
        applicantType: toApplicantType(verificationTarget),
        consentText: CONSENT_TEXT,
      });
      if (res.data.success) {
        setOtpVerified((p) => ({ ...p, [verificationTarget]: true }));
        setShowConsentDialog(false); setOtp(""); setConsentChecked(false);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "OTP verification failed";
      alert(`❌ ${msg}`);
    } finally {
      setOtpLoading(false);
    }
  };

  /* ============================================================ */
  /*                   PROGRESSIVE SAVE HANDLERS                  */
  /* ============================================================ */

  /* ---------- Save Business Details → creates LAN (section 0) ---------- */
  const saveBusinessSection = async () => {
    if (businessSaved && lan) return true;  // already created
    try {
      setLoading(true);
      const res = await api.post("/fundify/save-business", {
        loan,
        loginDate: loan.login_date,
        gstVerified: gstVerified,
        gstRawResponse: gstRawResponse,
      });
      if (res.data.success) {
        setLan(res.data.lan);
        setBusinessSaved(true);
        setMessage(`✅ Business details saved. LAN: ${res.data.lan}`);
        return true;
      }
    } catch (err) {
      setMessage(`❌ ${err.response?.data?.message || "Failed to save business details"}`);
    } finally {
      setLoading(false);
    }
    return false;
  };

  /* ---------- Update Applicant after LAN exists (section 1) ---------- */
  const updateApplicantSection = async () => {
    if (!otpVerified.applicant) {
      setMessage("❌ Please verify applicant's mobile via OTP before proceeding.");
      return false;
    }
    if (!lan) { setMessage("❌ LAN missing. Please complete Business Details first."); return false; }
    try {
      setLoading(true);
      const res = await api.post("/fundify/save-applicant", {
        applicant: { ...applicant, mobile_verified: 1 },
        lan,                       // attach to existing LAN
        loginDate: loan.login_date,
      });
      if (res.data.success) {
        setMessage(`✅ Applicant saved.`);
        return true;
      }
    } catch (err) {
      setMessage(`❌ ${err.response?.data?.message || "Failed to save applicant"}`);
    } finally {
      setLoading(false);
    }
    return false;
  };

  const updateSection = async (section) => {
    if (!lan) { setMessage("❌ LAN missing."); return false; }
    try {
      setLoading(true);
      await api.post("/fundify/update-section", { lan, section, data: loan });
      return true;
    } catch (err) {
      setMessage(`❌ ${err.response?.data?.message || "Failed to save section"}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const saveParties = async (parties, role) => {
    if (!lan) return true;
    const filled = parties.filter((a) => a.first_name || a.full_name || a.mobile);
    if (filled.length === 0) return true;
    try {
      setLoading(true);
      for (let i = 0; i < filled.length; i++) {
        const targetKey = role === "CO_APPLICANT" ? `co_${i}` : `guarantor_${i}`;
        await api.post("/fundify/save-party", {
          lan,
          applicant: { ...filled[i], role, party_no: i + 1, mobile_verified: otpVerified[targetKey] ? 1 : 0 },
        });
      }
      return true;
    } catch (err) {
      setMessage(`❌ ${err.response?.data?.message || "Failed to save party"}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const finalSubmit = async () => {
    if (!lan) { setMessage("❌ LAN missing. Cannot submit."); return false; }
    try {
      setLoading(true);
      const res = await api.post("/fundify/final-submit", { lan });
      setSubmittedLan(res.data.lan || lan);
      setSubmitted(true);
      return true;
    } catch (err) {
      setMessage(`❌ ${err.response?.data?.message || "Failed to submit loan"}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    const sectionErrors = getSectionErrors(activeSection);
    if (Object.keys(sectionErrors).length > 0) {
      setErrors(sectionErrors);
      setMessage(`❌ Please fix errors in "${SECTIONS[activeSection]}" before proceeding.`);
      return;
    }
    setErrors({}); setMessage("");

    let saved = false;
    if (activeSection === 0) saved = await saveBusinessSection();       // creates LAN
    else if (activeSection === 1) saved = await updateApplicantSection(); // uses existing LAN
    else if (activeSection === 2) saved = await updateSection("loan");
    else if (activeSection === 3) saved = await updateSection("bank");
    else if (activeSection === 4) saved = await saveParties(coApplicants, "CO_APPLICANT");

    if (saved) {
      setCompletedSections((p) => new Set([...p, activeSection]));
      setActiveSection(activeSection + 1);
    }
  };

  const handleSkip = async () => {
    setErrors({}); setMessage("");
    setCompletedSections((p) => new Set([...p, activeSection]));
    if (activeSection < SECTIONS.length - 1) setActiveSection(activeSection + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({}); setMessage("");
    const sectionErrors = getSectionErrors(5);
    if (Object.keys(sectionErrors).length > 0) {
      setErrors(sectionErrors);
      setMessage("❌ Fix errors in Guarantors or use Skip & Submit.");
      return;
    }
    const gSaved = await saveParties(guarantors, "GUARANTOR");
    if (gSaved) await finalSubmit();
  };

  const handleSkipAndSubmit = async () => {
    setErrors({}); setMessage("");
    await finalSubmit();
  };

  /* ============================================================ */
  /*                     GST VERIFY                               */
  /* ============================================================ */

  const formatGstDate = (v) => {
    if (!v) return "";
    const parts = String(v).split("/");
    if (parts.length !== 3) return "";
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  };

  const parseGstAddress = (address = "") => {
    const clean = String(address || "").replace(/\s+/g, " ").trim();
    const result = { address: clean, city: "", district: "", state: "", pincode: "" };
    const pm = clean.match(/\b[1-9][0-9]{5}\b/);
    if (pm) result.pincode = pm[0];
    const parts = clean.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 4) {
      result.state = parts[parts.length - 2] || "";
      result.district = parts[parts.length - 3] || "";
      result.city = parts[parts.length - 3] || "";
    }
    return result;
  };

  const handleVerifyGst = async () => {
    const gstin = String(loan.gstin || "").trim().toUpperCase();
    if (!gstin) { setErrors((p) => ({ ...p, gstin: "GSTIN is required" })); return; }
    if (!isValidGstin(gstin)) { setErrors((p) => ({ ...p, gstin: "Invalid GSTIN format" })); return; }
    try {
      setGstLoading(true);
      const res = await api.post("fundify/gst/verify", { gstNumber: gstin, lan: lan || null });
      if (!res.data?.success) { setGstVerified(false); setMessage(`❌ ${res.data?.message || "GST verification failed"}`); return; }
      const d = res.data.data || {};
      const pa = parseGstAddress(d.address);
      setLoan((prev) => ({
        ...prev,
        gstin: d.gstin || gstin,
        business_pan: d.gstin ? d.gstin.substring(2, 12) : prev.business_pan,
        business_name: d.legal_name || prev.business_name,
        trade_name: d.trade_name || d.legal_name || prev.trade_name,
        constitution_type: d.business_constitution || prev.constitution_type,
        nature_of_business: d.business_nature || prev.nature_of_business,
        industry_type: d.industry_type || prev.industry_type,
        business_start_date: formatGstDate(d.registration_date) || prev.business_start_date,
        business_address: pa.address || prev.business_address,
        business_city: pa.city || prev.business_city,
        business_district: pa.district || prev.business_district,
        business_state: pa.state || prev.business_state,
        business_pincode: pa.pincode || prev.business_pincode,
        business_mobile: d.mobile || prev.business_mobile,
        business_email: d.email || prev.business_email,
      }));
      setGstVerified(true);
      setGstRawResponse(res.data.data || {});
      setMessage(`✅ GST verified: ${d.legal_name || d.trade_name || gstin}`);
    } catch (err) {
      setGstVerified(false);
      setMessage(`❌ ${err.response?.data?.message || err.message || "GST verification failed"}`);
    } finally {
      setGstLoading(false);
    }
  };

  /* ============================================================ */
  /*                     RENDER HELPERS                           */
  /* ============================================================ */

  const renderInput = (label, name, value, onChange, type = "text", readOnly = false, errorKey = null) => {
    const key = errorKey || name;
    const err = touched[key] ? errors[key] : "";
    const status = fieldStatus[key];
    const isTouched = !!touched[key];

    return (
      <div className="form-group">
        <label>{label}</label>
        <div className="input-wrapper">
          <input
            className={`styled-input${err && isTouched ? " input-error" : ""}${status === "valid" && isTouched ? " input-valid" : ""}`}
            name={name}
            type={type}
            value={value || ""}
            onChange={onChange}
            readOnly={readOnly}
            placeholder={type === "date" ? undefined : `Enter ${label}`}
            onBlur={() => markField(key, value, name)}
          />
          {isTouched && !readOnly && (
            <span className={`val-icon ${status === "valid" ? "val-valid" : status === "invalid" ? "val-invalid" : ""}`}>
              {status === "valid" ? "✓" : status === "invalid" ? "✕" : ""}
            </span>
          )}
        </div>
        {err && isTouched && <small className="error-text">{err}</small>}
        {status === "valid" && isTouched && !readOnly && <small className="success-text">Looks good</small>}
      </div>
    );
  };

  const renderSelect = (label, name, value, onChange, options = [], errorKey = null) => {
    const key = errorKey || name;
    const err = touched[key] ? errors[key] : "";
    return (
      <div className="form-group">
        <label>{label}</label>
        <select
          className={`styled-input${err ? " input-error" : ""}`}
          name={name}
          value={value || ""}
          onChange={(e) => { onChange(e); markField(key, e.target.value, name); }}
        >
          <option value="">Select {label}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {err && <small className="error-text">{err}</small>}
      </div>
    );
  };

  /* ---- Aadhaar helpers ---- */
  const isAadhaarButtonDisabled = (stateKey) =>
    ["INITIATING", "INITIATED", "VERIFIED", "COMPLETED"].includes(aadhaarStatus[stateKey]);

  function parseAadhaarAddress(address = "") {
    const result = { addressLine1: "", addressLine2: "", village: "", district: "", state: "", pincode: "" };
    if (!address || typeof address !== "string") return result;
    let clean = address.replace(/\s+/g, " ").replace(/,\s*,/g, ",").replace(/^,\s*/g, "").trim();
    const pm = clean.match(/([1-9][0-9]{5})(?!.*[0-9])/);
    if (pm) { result.pincode = pm[1]; clean = clean.replace(new RegExp(`[-,\\s]*${result.pincode}\\s*$`), "").trim(); }
    clean = clean.replace(/[-,]\s*$/, "").trim();
    const parts = clean.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 1) result.state = parts[parts.length - 1] || "";
    if (parts.length >= 2) { result.district = parts[parts.length - 2] || ""; result.village = parts[parts.length - 2] || ""; }
    if (parts.length >= 3) result.addressLine1 = parts.slice(0, parts.length - 2).join(", ");
    else if (parts.length === 2) result.addressLine1 = parts[0];
    else if (parts.length === 1) result.addressLine1 = parts[0];
    return result;
  }

  const triggerAadhaar = async (applicantType, stateKey) => {
    if (!lan) { setMessage("❌ Please save applicant first to generate LAN."); return; }
    try {
      setAadhaarStatus((prev) => ({ ...prev, [stateKey]: "INITIATING" }));
      const res = await api.post("/fundify/init-aadhaar", { lan, applicantType });
      if (res.data.success) {
        setAadhaarStatus((prev) => ({ ...prev, [stateKey]: "INITIATED" }));
        setMessage(`✅ Aadhaar initiated for ${applicantType}`);
        if (res.data.kycUrl) window.open(res.data.kycUrl, "_blank");
      } else {
        setAadhaarStatus((prev) => ({ ...prev, [stateKey]: "FAILED" }));
        setMessage(`❌ Aadhaar initiation failed for ${applicantType}`);
      }
    } catch (err) {
      setAadhaarStatus((prev) => ({ ...prev, [stateKey]: "FAILED" }));
      setMessage(`❌ ${err.response?.data?.message || `Aadhaar initiation failed for ${applicantType}`}`);
    }
  };

  const fetchAndPrefillAadhaarAddress = async (applicantType, setter) => {
    if (!lan) { setMessage("❌ LAN missing."); return; }
    try {
      setLoading(true);
      const res = await api.get(`/fundify/aadhaar-address/${lan}/${applicantType}`);
      if (!res.data.success) { setMessage(`⚠️ ${res.data.message}`); return; }
      const p = parseAadhaarAddress(res.data.aadhaarAddress);
      setter((prev) => ({
        ...prev,
        current_address: p.addressLine1 || prev.current_address,
        current_city: p.village || prev.current_city,
        current_district: p.district || prev.current_district,
        current_state: p.state || prev.current_state,
        current_pincode: p.pincode || prev.current_pincode,
      }));
      setMessage(`✅ Aadhaar address prefilled for ${applicantType}`);
    } catch (err) {
      setMessage(`❌ ${err.response?.data?.message || "Aadhaar address not available yet."}`);
    } finally {
      setLoading(false);
    }
  };

  const renderApplicantForm = (data, onChange, title, prefix, otpKey, applicantType, aadhaarSetter, stateKey, aadhaarReady) => (
    <div className="party-card">
      <h3>{title}</h3>
      <div className="form-grid">
        {renderInput("First Name *", "first_name", data.first_name, onChange, "text", false, `${prefix}_first_name`)}
        {renderInput("Middle Name", "middle_name", data.middle_name, onChange, "text", false, `${prefix}_middle_name`)}
        {renderInput("Last Name", "last_name", data.last_name, onChange, "text", false, `${prefix}_last_name`)}
        {renderInput("Full Name", "full_name", data.full_name, onChange, "text", false, `${prefix}_full_name`)}
        {renderInput("Father Name", "father_name", data.father_name, onChange, "text", false, `${prefix}_father_name`)}
        {renderInput("Mother Name", "mother_name", data.mother_name, onChange, "text", false, `${prefix}_mother_name`)}
        {renderInput("Spouse Name", "spouse_name", data.spouse_name, onChange, "text", false, `${prefix}_spouse_name`)}
        {renderInput("Date of Birth *", "dob", data.dob, onChange, "date", false, `${prefix}_dob`)}
        {renderSelect("Gender", "gender", data.gender, onChange, ["Male", "Female", "Other"], `${prefix}_gender`)}
        {renderSelect("Marital Status", "marital_status", data.marital_status, onChange, ["Single", "Married", "Divorced", "Widowed", "Other"], `${prefix}_marital_status`)}

        {/* Mobile with OTP */}
        <div className="mobile-otp-wrapper">
          {renderInput("Mobile *", "mobile", data.mobile, onChange, "text", otpVerified[otpKey], `${prefix}_mobile`)}
          <button
            type="button"
            className={otpVerified[otpKey] ? "verified-btn" : "otp-btn"}
            onClick={() => handleOpenConsentDialog(data.mobile, otpKey)}
            disabled={otpVerified[otpKey] || otpLoading}
          >
            {otpVerified[otpKey] ? "Verified ✓" : "Send OTP"}
          </button>
        </div>

        {renderInput("Alternate Mobile", "alternate_mobile", data.alternate_mobile, onChange, "text", false, `${prefix}_alternate_mobile`)}
        {renderInput("Email", "email", data.email, onChange, "email", false, `${prefix}_email`)}
        {renderInput("PAN", "pan", data.pan, onChange, "text", false, `${prefix}_pan`)}
        {renderInput("Aadhaar Last 4", "aadhaar_last4", data.aadhaar_last4, onChange, "text", false, `${prefix}_aadhaar_last4`)}

        {/* ─── Aadhaar KYC Buttons ─── */}
        {aadhaarReady && applicantType && stateKey && (
          <div className="aadhaar-btn-row full-row" style={{ display: "flex", gap: "10px", flexWrap: "wrap", margin: "4px 0" }}>
            <button
              type="button"
              className={isAadhaarButtonDisabled(stateKey) ? "verified-btn" : aadhaarStatus[stateKey] === "FAILED" ? "otp-btn" : "otp-btn"}
              onClick={() => triggerAadhaar(applicantType, stateKey)}
              disabled={loading || !lan || isAadhaarButtonDisabled(stateKey)}
              style={{ flex: "1", minWidth: "180px" }}
            >
              {aadhaarStatus[stateKey] === "INITIATING"
                ? "Starting Aadhaar..."
                : aadhaarStatus[stateKey] === "INITIATED"
                  ? "Aadhaar Initiated ✓"
                  : aadhaarStatus[stateKey] === "VERIFIED"
                    ? "Aadhaar Verified ✓"
                    : aadhaarStatus[stateKey] === "FAILED"
                      ? "⚠️ Retry Aadhaar"
                      : `Trigger ${applicantType === "BORROWER" ? "Applicant" : applicantType === "CO_APPLICANT" ? "Co-Applicant" : "Guarantor"} Aadhaar`}
            </button>
            <button
              type="button"
              className="otp-btn"
              onClick={() => fetchAndPrefillAadhaarAddress(applicantType, aadhaarSetter)}
              disabled={!lan || loading}
              style={{ flex: "1", minWidth: "180px" }}
            >
              Fetch Aadhaar Address
            </button>
          </div>
        )}

        {renderInput("Voter ID", "voter_id", data.voter_id, onChange, "text", false, `${prefix}_voter_id`)}
        {renderInput("Driving License No", "driving_license_no", data.driving_license_no, onChange, "text", false, `${prefix}_driving_license_no`)}
        {renderInput("Passport No", "passport_no", data.passport_no, onChange, "text", false, `${prefix}_passport_no`)}
        {renderInput("CKYC No", "ckyc_no", data.ckyc_no, onChange, "text", false, `${prefix}_ckyc_no`)}

        <div className="full-row">
          {renderInput("Current Address *", "current_address", data.current_address, onChange, "text", false, `${prefix}_current_address`)}
        </div>
        {renderInput("Current City", "current_city", data.current_city, onChange, "text", false, `${prefix}_current_city`)}
        {renderInput("Current District", "current_district", data.current_district, onChange, "text", false, `${prefix}_current_district`)}
        {renderInput("Current State", "current_state", data.current_state, onChange, "text", false, `${prefix}_current_state`)}
        <div className="form-group">
          {renderInput("Current Pincode", "current_pincode", data.current_pincode, onChange, "text", false, `${prefix}_current_pincode`)}
          <small style={{ color: "#94a3b8", fontSize: "11px", marginTop: "-4px" }}>City &amp; district auto-fill on 6 digits</small>
        </div>
        {renderInput("Current Landmark", "current_landmark", data.current_landmark, onChange, "text", false, `${prefix}_current_landmark`)}
        {renderSelect("Residence Ownership", "residence_ownership", data.residence_ownership, onChange, ["Owned", "Rented", "Leased", "Family Owned", "Other"], `${prefix}_residence_ownership`)}

        <label className="checkbox-row full-row">
          <input
            type="checkbox"
            name="same_as_current_address"
            checked={Boolean(data.same_as_current_address)}
            onChange={onChange}
          />
          <span>Same as current address</span>
        </label>

        <div className="full-row">
          {renderInput("Permanent Address", "permanent_address", data.permanent_address, onChange, "text", false, `${prefix}_permanent_address`)}
        </div>
        {renderInput("Permanent City", "permanent_city", data.permanent_city, onChange, "text", false, `${prefix}_permanent_city`)}
        {renderInput("Permanent District", "permanent_district", data.permanent_district, onChange, "text", false, `${prefix}_permanent_district`)}
        {renderInput("Permanent State", "permanent_state", data.permanent_state, onChange, "text", false, `${prefix}_permanent_state`)}
        <div className="form-group">
          {renderInput("Permanent Pincode", "permanent_pincode", data.permanent_pincode, onChange, "text", false, `${prefix}_permanent_pincode`)}
          <small style={{ color: "#94a3b8", fontSize: "11px", marginTop: "-4px" }}>City &amp; district auto-fill on 6 digits</small>
        </div>

        {renderInput("Occupation", "occupation", data.occupation, onChange, "text", false, `${prefix}_occupation`)}
        {renderInput("Employer Name", "employer_name", data.employer_name, onChange, "text", false, `${prefix}_employer_name`)}
        {renderInput("Monthly Income", "monthly_income", data.monthly_income, onChange, "number", false, `${prefix}_monthly_income`)}
      </div>
    </div>
  );

  /* ============================================================ */
  /*                     JSX                                      */
  /* ============================================================ */

  const isOptionalSection = activeSection === 4 || activeSection === 5;
  const isLastSection = activeSection === SECTIONS.length - 1;

  /* ── Success Screen ── */
  if (submitted) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f2027 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}>
        <div style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "24px",
          padding: "56px 48px",
          maxWidth: "560px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
          animation: "fadeSlideUp 0.5s ease",
        }}>
          {/* Animated checkmark circle */}
          <div style={{
            width: "88px",
            height: "88px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #22c55e, #16a34a)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 32px",
            boxShadow: "0 0 40px rgba(34,197,94,0.4), 0 0 80px rgba(34,197,94,0.15)",
            animation: "popIn 0.4s cubic-bezier(0.175,0.885,0.32,1.275)",
          }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path d="M8 20L16 28L32 12" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <h1 style={{
            fontSize: "26px",
            fontWeight: 700,
            color: "#f1f5f9",
            margin: "0 0 12px",
            letterSpacing: "-0.5px",
          }}>Case Submitted Successfully!</h1>

          <p style={{
            fontSize: "15px",
            color: "#94a3b8",
            margin: "0 0 32px",
            lineHeight: 1.7,
          }}>
            Thank you! Your loan application has been created and forwarded to the
            <strong style={{ color: "#cbd5e1" }}> Credit Team</strong> for review and verification.
            You will be notified once the process is complete.
          </p>

          {/* LAN Card */}
          <div style={{
            background: "rgba(99,102,241,0.12)",
            border: "1px solid rgba(99,102,241,0.35)",
            borderRadius: "14px",
            padding: "20px 24px",
            marginBottom: "36px",
          }}>
            <p style={{ margin: "0 0 6px", fontSize: "12px", color: "#818cf8", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600 }}>
              Loan Application Number
            </p>
            <p style={{
              margin: 0,
              fontSize: "24px",
              fontWeight: 800,
              color: "#a5b4fc",
              letterSpacing: "2px",
              fontFamily: "'Courier New', monospace",
            }}>
              {submittedLan}
            </p>
          </div>

          {/* Info pill */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.25)",
            borderRadius: "50px",
            padding: "8px 18px",
            marginBottom: "36px",
          }}>
            <span style={{ fontSize: "16px" }}>⏳</span>
            <span style={{ fontSize: "13px", color: "#fde68a", fontWeight: 500 }}>
              Processing usually takes 24–48 hours
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => window.history.back()}
              style={{
                padding: "12px 28px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#cbd5e1",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.12)"}
              onMouseLeave={e => e.target.style.background = "rgba(255,255,255,0.06)"}
            >
              ← Go Back
            </button>
            <button
              onClick={() => {
                setSubmitted(false);
                setSubmittedLan("");
                setLan("");
                setActiveSection(0);
                setCompletedSections(new Set());
              }}
              style={{
                padding: "12px 28px",
                borderRadius: "10px",
                border: "none",
                background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 20px rgba(99,102,241,0.35)",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => e.target.style.transform = "translateY(-2px)"}
              onMouseLeave={e => e.target.style.transform = "translateY(0)"}
            >
              + New Application
            </button>
          </div>
        </div>

        <style>{`
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(30px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes popIn {
            from { transform: scale(0.4); opacity: 0; }
            to   { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="manual-entry-container">
      <div className="page-header">
        <h2>Fundify Manual Entry</h2>
        {lan && (
          <div className="lan-badge">
            <span className="lan-label">LAN</span>
            <span className="lan-value">{lan}</span>
          </div>
        )}
      </div>

      {/* Section Tabs */}
      <div className="section-tabs">
        {SECTIONS.map((sec, idx) => (
          <div
            key={sec}
            className={`tab ${activeSection === idx ? "active" : ""} ${completedSections.has(idx) ? "completed" : ""}`}
            onClick={() => {
              setErrors({}); setMessage("");
              setActiveSection(idx);
            }}
          >
            {completedSections.has(idx) && activeSection !== idx ? "✓ " : ""}{sec}
            {(idx === 4 || idx === 5) && <span className="optional-badge">Optional</span>}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>

        {/* ───── SECTION 0: BUSINESS DETAILS (creates LAN) ───── */}
        {activeSection === 0 && (
          <div className="party-card">
            <h3>Business Details</h3>
            <div className="form-grid">
              {renderInput("Business Name *", "business_name", loan.business_name, handleLoanChange)}
              {renderInput("Trade Name", "trade_name", loan.trade_name, handleLoanChange)}
              {renderInput("Business PAN", "business_pan", loan.business_pan, handleLoanChange)}

              <div className="gst-verify-wrapper">
                {renderInput("GSTIN", "gstin", loan.gstin, handleLoanChange)}
                <button type="button" className={gstVerified ? "verified-btn" : "verify-btn"} onClick={handleVerifyGst} disabled={gstLoading || gstVerified}>
                  {gstLoading ? "Verifying..." : gstVerified ? "Verified ✓" : "Verify & Fetch"}
                </button>
              </div>

              {renderInput("Udyam Registration No", "udyam_registration_no", loan.udyam_registration_no, handleLoanChange)}
              {renderInput("CIN", "cin", loan.cin, handleLoanChange)}
              {renderInput("LLPIN", "llpin", loan.llpin, handleLoanChange)}
              {renderInput("Shop Establishment No", "shop_establishment_no", loan.shop_establishment_no, handleLoanChange)}
              {renderInput("Business Reg No", "business_registration_no", loan.business_registration_no, handleLoanChange)}
              {renderInput("Constitution Type", "constitution_type", loan.constitution_type, handleLoanChange)}
              {renderInput("Business Start Date", "business_start_date", loan.business_start_date, handleLoanChange, "date")}
              {renderInput("Business Vintage (Months)", "business_vintage_months", loan.business_vintage_months, handleLoanChange, "number")}
              {renderInput("Nature Of Business", "nature_of_business", loan.nature_of_business, handleLoanChange)}
              {renderInput("Industry Type", "industry_type", loan.industry_type, handleLoanChange)}

              <div className="full-row">
                {renderInput("Business Address", "business_address", loan.business_address, handleLoanChange)}
              </div>
              {renderInput("Business City", "business_city", loan.business_city, handleLoanChange)}
              {renderInput("Business District", "business_district", loan.business_district, handleLoanChange)}
              {renderInput("Business State", "business_state", loan.business_state, handleLoanChange)}
              <div className="form-group">
                {renderInput("Business Pincode", "business_pincode", loan.business_pincode, handleLoanChange)}
                <small style={{ color: "#94a3b8", fontSize: "11px", marginTop: "-4px" }}>City &amp; district auto-fill on 6 digits</small>
              </div>
              {renderSelect("Premises Ownership", "premises_ownership", loan.premises_ownership, handleLoanChange, ["Owned", "Rented", "Leased", "Family Owned", "Other"])}
              {renderInput("Business Mobile *", "business_mobile", loan.business_mobile, handleLoanChange)}
              {renderInput("Business Email", "business_email", loan.business_email, handleLoanChange, "email")}
            </div>
          </div>
        )}

        {/* ───── SECTION 1: APPLICANT (LAN already exists) ───── */}
        {activeSection === 1 && renderApplicantForm(
          applicant,
          handleApplicantChange(setApplicant),
          "Primary Applicant",
          "applicant",
          "applicant",
          "BORROWER",
          setApplicant,
          "BORROWER_0",
          !!lan   // ← LAN created in section 0, so button is ready as soon as user reaches section 1
        )}

        {/* ───── SECTION 2: LOAN DETAILS ───── */}
        {activeSection === 2 && (
          <div className="party-card">
            <h3>Loan Details</h3>
            <div className="form-grid">
              {renderInput("Login Date", "login_date", loan.login_date, handleLoanChange, "date")}
              {renderInput("Loan Amount *", "loan_amount", loan.loan_amount, handleLoanChange, "number")}
              {renderInput("Disbursal Amount", "disbursal_amount", loan.disbursal_amount, handleLoanChange, "number")}
              {renderInput("Interest Rate (%)", "interest_rate", loan.interest_rate, handleLoanChange, "number")}
              {renderInput("Loan Tenure (Months)", "loan_tenure", loan.loan_tenure, handleLoanChange, "number")}
              {renderInput("Processing Fee", "processing_fee", loan.processing_fee, handleLoanChange, "number")}
              {renderInput("Processing Fee %", "processing_fee_percentage", loan.processing_fee_percentage, handleLoanChange, "number", true)}
              {renderInput("Insurance Amount", "insurance_amount", loan.insurance_amount, handleLoanChange, "number")}
              {renderInput("Other Charges", "other_charges", loan.other_charges, handleLoanChange, "number")}
            </div>
          </div>
        )}

        {/* ───── SECTION 3: BANK DETAILS ───── */}
        {activeSection === 3 && (
          <div className="party-card">
            <h3>Bank Details</h3>
            <div className="form-grid">
              {renderInput("Bank Name *", "bank_name", loan.bank_name, handleLoanChange)}
              {renderInput("Name In Bank", "name_in_bank", loan.name_in_bank, handleLoanChange)}
              {renderInput("Account Number *", "account_number", loan.account_number, handleLoanChange)}
              {/* IFSC with auto-fill on blur */}
              <div className="form-group">
                <label>IFSC *</label>
                <div className="input-wrapper">
                  <input
                    className={`styled-input${touched["ifsc"] && errors["ifsc"] ? " input-error" : ""}${fieldStatus["ifsc"] === "valid" && touched["ifsc"] ? " input-valid" : ""}`}
                    name="ifsc"
                    type="text"
                    value={loan.ifsc || ""}
                    onChange={(e) => handleLoanChange({ target: { name: "ifsc", value: e.target.value.toUpperCase() } })}
                    onBlur={() => { markField("ifsc", loan.ifsc, "ifsc"); handleIfscLookup(loan.ifsc); }}
                    placeholder="e.g. SBIN0001234"
                    maxLength={11}
                  />
                  {touched["ifsc"] && (
                    <span className={`val-icon ${fieldStatus["ifsc"] === "valid" ? "val-valid" : fieldStatus["ifsc"] === "invalid" ? "val-invalid" : ""}`}>
                      {fieldStatus["ifsc"] === "valid" ? "✓" : fieldStatus["ifsc"] === "invalid" ? "✕" : ""}
                    </span>
                  )}
                </div>
                {touched["ifsc"] && errors["ifsc"] && <small className="error-text">{errors["ifsc"]}</small>}
                <small style={{ color: "#94a3b8", fontSize: "11px" }}>Bank name auto-fills when you leave this field</small>
              </div>

              {renderSelect("Account Type", "account_type", loan.account_type, handleLoanChange, ["SAVINGS", "CURRENT", "OD", "CC", "OTHER"])}
            </div>
          </div>
        )}

        {/* ───── SECTION 4: CO-APPLICANTS (Optional) ───── */}
        {activeSection === 4 && (
          <>
            <div className="optional-notice">
              <span>ℹ️</span>
              <span>Co-Applicants are <strong>optional</strong>. You can skip this section and submit the case.</span>
            </div>
            {coApplicants.map((co, idx) => (
              <div key={idx}>
                {renderApplicantForm(
                  co,
                  handleApplicantChange(setCoApplicants, idx),
                  `Co-Applicant ${idx + 1}`,
                  `co_${idx}`,
                  `co_${idx}`,
                  "CO_APPLICANT",
                  (updater) => setCoApplicants((prev) => prev.map((item, i) => i === idx ? (typeof updater === "function" ? updater(item) : updater) : item)),
                  `CO_APPLICANT_${idx}`,
                  !!lan    // ← LAN always exists when user reaches Co-Applicant section
                )}
                {coApplicants.length > 1 && (
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => setCoApplicants((p) => p.filter((_, i) => i !== idx))}
                  >
                    Remove Co-Applicant {idx + 1}
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="add-btn"
              onClick={() => setCoApplicants((p) => [...p, emptyApplicant("CO_APPLICANT", p.length + 1)])}
            >
              + Add Another Co-Applicant
            </button>
          </>
        )}

        {/* ───── SECTION 5: GUARANTORS (Optional) ───── */}
        {activeSection === 5 && (
          <>
            <div className="optional-notice">
              <span>ℹ️</span>
              <span>Guarantors are <strong>optional</strong>. You can skip and submit the case directly.</span>
            </div>
            {guarantors.map((g, idx) => (
              <div key={idx}>
                {renderApplicantForm(
                  g,
                  handleApplicantChange(setGuarantors, idx),
                  `Guarantor ${idx + 1}`,
                  `guarantor_${idx}`,
                  `guarantor_${idx}`,
                  "GUARANTOR",
                  (updater) => setGuarantors((prev) => prev.map((item, i) => i === idx ? (typeof updater === "function" ? updater(item) : updater) : item)),
                  `GUARANTOR_${idx}`,
                  !!lan    // ← LAN always exists when user reaches Guarantor section
                )}
                {guarantors.length > 1 && (
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => setGuarantors((p) => p.filter((_, i) => i !== idx))}
                  >
                    Remove Guarantor {idx + 1}
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="add-btn"
              onClick={() => setGuarantors((p) => [...p, emptyApplicant("GUARANTOR", p.length + 1)])}
            >
              + Add Another Guarantor
            </button>
          </>
        )}

        {/* ───── STEP BUTTONS ───── */}
        <div className="step-buttons">
          {activeSection > 0 && (
            <button type="button" className="back-btn" onClick={() => { setErrors({}); setMessage(""); setActiveSection(activeSection - 1); }}>
              ← Back
            </button>
          )}

          {!isLastSection && (
            <>
              {isOptionalSection && (
                <button type="button" className="skip-btn" onClick={handleSkip} disabled={loading}>
                  Skip →
                </button>
              )}
              <button type="button" className="next-btn" onClick={handleNext} disabled={loading}>
                {loading ? "Saving..." : "Save & Next →"}
              </button>
            </>
          )}

          {isLastSection && (
            <>
              <button type="button" className="skip-btn" onClick={handleSkipAndSubmit} disabled={loading}>
                {loading ? "Submitting..." : "Skip & Submit"}
              </button>
              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? "Submitting..." : "Save & Submit"}
              </button>
            </>
          )}
        </div>
      </form>

      {/* Message */}
      {message && (
        <div className={`message ${message.includes("❌") ? "message-error" : "message-success"}`}>
          {message}
        </div>
      )}

      {/* ───── OTP CONSENT MODAL ───── */}
      {showConsentDialog && (
        <div className="modern-modal-overlay">
          <div className="modal-card">
            <h3>📱 Mobile Verification Consent</h3>
            <div className="consent-scroll">{CONSENT_TEXT}</div>
            <label className="checkbox-container">
              <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
              I Agree To The Consent Terms
            </label>
            <div className="form-group">
              <label>Enter OTP</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="Enter 6-digit OTP"
                maxLength={6}
                className="styled-input"
              />
            </div>
            <div className="step-buttons">
              <button
                type="button"
                style={{ background: "#cbd5e1", color: "#0f172a" }}
                onClick={() => { setShowConsentDialog(false); setOtp(""); setConsentChecked(false); }}
              >
                Cancel
              </button>
              <button type="button" className="next-btn" onClick={verifyOtpHandler} disabled={otpLoading}>
                {otpLoading ? "Verifying..." : "Verify OTP"}
              </button>
            </div>
            {(resendTimers[verificationTarget] || 0) > 0 ? (
              <p className="resend-timer">Resend OTP in {resendTimers[verificationTarget]}s</p>
            ) : (
              <button
                type="button"
                className="otp-btn"
                style={{ marginTop: "12px" }}
                onClick={() => {
                  let m = "";
                  if (verificationTarget === "applicant") m = applicant.mobile;
                  else if (verificationTarget.startsWith("co_")) m = coApplicants[parseInt(verificationTarget.split("_")[1], 10)]?.mobile || "";
                  else if (verificationTarget.startsWith("guarantor_")) m = guarantors[parseInt(verificationTarget.split("_")[1], 10)]?.mobile || "";
                  sendOtp(m, verificationTarget);
                }}
              >
                Resend OTP
              </button>
            )}
          </div>
        </div>
      )}

      {/* ───── STYLES ───── */}
      <style>{`
        .manual-entry-container {
          background: #ffffff;
          margin: 24px auto;
          padding: 36px 48px;
          border-radius: 18px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.08);
          max-width: 1200px;
        }
        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 28px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .page-header h2 {
          font-size: 26px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .lan-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #0f172a, #1e3a5f);
          color: white;
          border-radius: 30px;
          padding: 8px 18px;
        }
        .lan-label { font-size: 11px; font-weight: 600; opacity: 0.7; text-transform: uppercase; }
        .lan-value { font-size: 14px; font-weight: 700; font-family: monospace; }

        .section-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 30px;
        }
        .tab {
          position: relative;
          padding: 10px 18px;
          border-radius: 10px;
          background: #e2e8f0;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }
        .tab:hover { background: #cbd5e1; }
        .tab.active {
          background: linear-gradient(135deg, #0f172a, #1e3a5f);
          color: white;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(15,23,42,0.25);
        }
        .tab.completed:not(.active) {
          background: linear-gradient(135deg, #d1fae5, #a7f3d0);
          color: #065f46;
          font-weight: 600;
        }
        .optional-badge {
          display: inline-block;
          margin-left: 6px;
          font-size: 9px;
          font-weight: 700;
          background: rgba(255,255,255,0.3);
          padding: 2px 5px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .tab.active .optional-badge { background: rgba(255,255,255,0.2); color: white; }
        .tab:not(.active) .optional-badge { background: rgba(0,0,0,0.08); color: inherit; }

        .optional-notice {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          background: linear-gradient(135deg, #eff6ff, #dbeafe);
          border: 1px solid #bfdbfe;
          border-radius: 12px;
          padding: 14px 18px;
          margin-bottom: 22px;
          font-size: 14px;
          color: #1e40af;
        }

        .party-card {
          margin-bottom: 28px;
          padding: 24px;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          background: #f8fafc;
        }
        .party-card h3 {
          margin: 0 0 22px 0;
          font-size: 17px;
          font-weight: 700;
          color: #0f172a;
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 12px;
        }
        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 22px 36px;
        }
        .full-row { grid-column: span 2; }

        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-group label {
          font-size: 12px;
          font-weight: 600;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .input-wrapper { position: relative; display: flex; align-items: center; }
        .styled-input {
          width: 100%;
          padding: 11px 38px 11px 14px;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          font-size: 14px;
          color: #0f172a;
          background: white;
          transition: all 0.2s ease;
          outline: none;
          box-sizing: border-box;
        }
        .styled-input:focus { border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56,189,248,0.12); }
        .styled-input.input-error { border-color: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.1); }
        .styled-input.input-valid { border-color: #10b981; }
        .styled-input:read-only { background: #f1f5f9; color: #64748b; cursor: default; }

        .val-icon {
          position: absolute;
          right: 12px;
          font-size: 13px;
          font-weight: 700;
          pointer-events: none;
        }
        .val-valid { color: #10b981; }
        .val-invalid { color: #ef4444; }

        .error-text { font-size: 11px; color: #ef4444; font-weight: 500; }
        .success-text { font-size: 11px; color: #10b981; font-weight: 500; }

        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 13px;
          color: #334155;
          font-weight: 500;
        }

        .gst-verify-wrapper { display: flex; gap: 10px; align-items: flex-end; }
        .gst-verify-wrapper .form-group { flex: 1; }

        .mobile-otp-wrapper {
          display: flex;
          gap: 10px;
          align-items: flex-end;
          grid-column: span 2;
        }
        .mobile-otp-wrapper .form-group { flex: 1; }

        .verify-btn, .otp-btn, .verified-btn {
          height: 44px;
          padding: 0 18px;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s;
        }
        .verify-btn { background: #0f172a; color: white; }
        .verify-btn:hover:not(:disabled) { background: #1e293b; }
        .otp-btn { background: #0f172a; color: white; }
        .otp-btn:hover:not(:disabled) { background: #1e293b; }
        .verified-btn { background: #10b981; color: white; cursor: default; }

        .step-buttons {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
        }
        .back-btn, .skip-btn, .next-btn, .submit-btn, .add-btn, .remove-btn {
          padding: 12px 24px;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .back-btn { background: #e2e8f0; color: #475569; }
        .back-btn:hover { background: #cbd5e1; }
        .skip-btn { background: #f1f5f9; color: #64748b; border: 1.5px solid #e2e8f0; }
        .skip-btn:hover:not(:disabled) { background: #e2e8f0; }
        .next-btn { background: linear-gradient(135deg, #0f172a, #1e3a5f); color: white; }
        .next-btn:hover:not(:disabled) { box-shadow: 0 4px 12px rgba(15,23,42,0.3); }
        .submit-btn { background: linear-gradient(135deg, #10b981, #059669); color: white; }
        .submit-btn:hover:not(:disabled) { box-shadow: 0 4px 12px rgba(16,185,129,0.3); }
        button:disabled { opacity: 0.6; cursor: not-allowed; }

        .add-btn { background: #f0fdf4; color: #15803d; border: 1.5px dashed #86efac; margin: 12px 0; display: block; }
        .add-btn:hover { background: #dcfce7; }
        .remove-btn { background: #fff1f2; color: #be123c; border: 1.5px solid #fecdd3; display: block; margin: 8px 0 16px 0; }
        .remove-btn:hover { background: #ffe4e6; }

        .message { margin-top: 18px; padding: 14px 18px; border-radius: 12px; font-size: 14px; font-weight: 500; }
        .message-success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
        .message-error { background: #fff1f2; color: #9f1239; border: 1px solid #fecdd3; }

        /* ── OTP Modal ── */
        .modern-modal-overlay {
          position: fixed; inset: 0;
          background: rgba(15,23,42,0.7);
          backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
        }
        .modal-card {
          background: white;
          width: 100%; max-width: 580px;
          border-radius: 20px;
          padding: 32px;
          max-height: 90vh; overflow-y: auto;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.3);
        }
        .modal-card h3 { margin: 0 0 20px; font-size: 20px; font-weight: 700; color: #0f172a; }
        .consent-scroll {
          height: 180px; overflow-y: auto;
          border: 1px solid #e2e8f0;
          padding: 14px; border-radius: 10px;
          background: #f8fafc;
          font-size: 13px; line-height: 1.7; color: #475569;
          margin-bottom: 18px; white-space: pre-line;
        }
        .checkbox-container {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 18px; font-size: 14px; font-weight: 500; color: #1e293b; cursor: pointer;
        }
        .checkbox-container input { width: 16px; height: 16px; }
        .resend-timer { margin-top: 12px; font-size: 13px; color: #64748b; text-align: center; }
      `}</style>
    </div>
  );
};

export default FundifyManualEntry;