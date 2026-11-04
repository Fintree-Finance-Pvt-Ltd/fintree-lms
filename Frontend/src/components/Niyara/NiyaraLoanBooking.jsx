
import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/api";

const BASE = "niyara";

const steps = [
  "Basic Details",
  "Address",
  "Loan Details",
  "Business Details",
//   "Post BRE Flow",
];

const initialForm = {
  partner_loan_id: "",
  customer_name: "",
  mobile_number: "",
  pan_number: "",
  borrower_dob: "",
  gender: "",
  email: "",
  aadhaar_number: "",
  customer_address: "",
  customer_city: "",
  customer_state: "",
  customer_pincode: "",
  annual_income: "",
  requested_amount: "",
  tenure: "",
roi: "",
processing_fee: "",
net_disbursement_amount: "",
  business_name: "",
  business_type: "",
  gst_number: "",
  udyam_number: "",
  business_address: "",
  business_city: "",
  business_state: "",
  business_pincode: "",
};

const styles = `
.nyra-page {
  padding: 24px;
  min-height: 100vh;
  background: #f3f6fb;
  color: #152640;
  font-family: Inter, Arial, sans-serif;
}
.nyra-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 22px;
}
.nyra-header h1 {
  font-size: 27px;
  margin: 0 0 8px;
}
.nyra-header p {
  color: #71829c;
  font-size: 13px;
  margin: 0;
}
.nyra-meta {
  padding: 15px 18px;
  background: white;
  border: 1px solid #dce5f1;
  border-radius: 12px;
  font-size: 13px;
}
.nyra-tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.nyra-tab {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 14px;
  border: 1px solid #e0e7f2;
  border-radius: 12px;
  background: #f9fbff;
  color: #9aa6ba;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}
.nyra-tab.active {
  border-color: #7ca5ff;
  background: #ebf1ff;
  color: #164b96;
}
.nyra-tab:disabled {
  opacity: .6;
  cursor: not-allowed;
}
.nyra-step-number {
  display: inline-grid;
  place-items: center;
  width: 29px;
  height: 29px;
  border-radius: 50%;
  background: #e8edf5;
  flex-shrink: 0;
}
.nyra-tab.active .nyra-step-number {
  background: #2864bc;
  color: white;
}
.nyra-card {
  background: #fff;
  padding: 30px;
  border-radius: 16px;
  border: 1px solid #dce5f1;
  box-shadow: 0 8px 26px #1e3d6810;
}
.nyra-eyebrow {
  color: #235fc0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
}
.nyra-card h2 {
  font-size: 27px;
  margin: 12px 0 20px;
}
.nyra-rule {
  border: 0;
  height: 1px;
  background: #e5ecf5;
  margin-bottom: 27px;
}
.nyra-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px 20px;
}
.nyra-field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.nyra-field label {
  font-size: 13px;
  font-weight: 700;
  color: #344b69;
}
.nyra-field input,
.nyra-field select,
.nyra-field textarea {
  width: 100%;
  min-height: 50px;
  padding: 12px 14px;
  box-sizing: border-box;
  border: 1px solid #cbd8ea;
  border-radius: 10px;
  background: white;
  color: #172b48;
  font: inherit;
  font-size: 14px;
}
.nyra-field input:focus,
.nyra-field select:focus,
.nyra-field textarea:focus {
  border-color: #2c6cc5;
  outline: 2px solid #dce9ff;
}
.nyra-field input:disabled {
  background: #f0f3f8;
}
.nyra-input-action {
  display: flex;
  gap: 10px;
  align-items: stretch;
}
.nyra-input-action input {
  flex: 1;
  min-width: 0;
}
.nyra-secondary,
.nyra-primary {
  padding: 12px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 750;
  cursor: pointer;
  white-space: nowrap;
}
.nyra-secondary {
  border: 1px solid #bfd1e9;
  color: #245592;
  background: #fff;
}
.nyra-primary {
  border: 1px solid #2864bc;
  background: #2864bc;
  color: white;
}
.nyra-primary:disabled,
.nyra-secondary:disabled {
  opacity: .5;
  cursor: not-allowed;
}
.nyra-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 35px;
  padding-top: 23px;
  border-top: 1px solid #e5ecf5;
}
.nyra-success {
  border: 1px solid #bde6c9;
  background: #f0faf2;
  color: #206b39;
  padding: 16px;
  border-radius: 10px;
  margin-bottom: 18px;
}
.nyra-error {
  border: 1px solid #f1bfc7;
  background: #fff1f2;
  color: #a62739;
  padding: 16px;
  border-radius: 10px;
  margin-bottom: 18px;
}
.nyra-note {
  background: #f1f6ff;
  border: 1px solid #dbe9fb;
  padding: 17px;
  border-radius: 10px;
  color: #486887;
  font-size: 13px;
  margin-top: 22px;
}
.nyra-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #0e1c37a8;
}
.nyra-modal {
  background: white;
  border-radius: 16px;
  padding: 27px;
  width: 100%;
  max-width: 430px;
}
.nyra-modal h3 {
  margin-top: 0;
}
.nyra-modal p {
  color: #71829c;
}
.nyra-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
.nyra-check {
  display: flex;
  gap: 10px;
  margin-top: 15px;
  font-size: 13px;
  line-height: 1.5;
}
.nyra-load {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 15px;
  background: white;
  border: 1px solid #dce5f1;
  border-radius: 12px;
  margin-bottom: 16px;
}
.nyra-load input {
  border: 1px solid #cbd8ea;
  border-radius: 8px;
  padding: 11px;
}
.nyra-flow-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
}
.nyra-flow-card {
  border: 1px solid #dce5f1;
  padding: 20px;
  border-radius: 12px;
  background: #fbfcff;
}
.nyra-flow-card h3 {
  margin-top: 0;
  font-size: 15px;
}
.nyra-flow-card p {
  font-size: 13px;
  color: #6a7e98;
}
@media (max-width: 1100px) {
  .nyra-grid { grid-template-columns: repeat(2, 1fr); }
  .nyra-tabs { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 680px) {
  .nyra-page { padding: 12px; }
  .nyra-card { padding: 20px; }
  .nyra-header { flex-direction: column; align-items: stretch; }
  .nyra-grid, .nyra-flow-grid { grid-template-columns: 1fr; }
  .nyra-tabs { grid-template-columns: repeat(2, 1fr); }
  .nyra-input-action { flex-direction: column; }
}
`;

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
  disabled = false,
  maxLength,
  children,
}) {
  return (
    <div className="nyra-field">
      <label htmlFor={`nyra-${name}`}>
        {label}{required && " *"}
      </label>
      {children || (
        <input
          id={`nyra-${name}`}
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(name, e.target.value)}
          disabled={disabled}
          maxLength={maxLength}
          required={required}
        />
      )}
    </div>
  );
}



const errorMessage = (error) =>
  error.response?.data?.message ||
  error.response?.data?.error?.message ||
  error.message ||
  "Request failed";

export default function NiyaraLoanBooking() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ ...initialForm });
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lan, setLan] = useState("");
  const [loadLan, setLoadLan] = useState("");
  const [caseStatus, setCaseStatus] = useState("Draft");
  const [mobileVerified, setMobileVerified] = useState(false);
  const [panVerified, setPanVerified] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSession, setOtpSession] = useState("");
  const [consent, setConsent] = useState(false);
const [aadhaarStatus, setAadhaarStatus] = useState("PENDING");
const [aadhaarUrl, setAadhaarUrl] = useState("");
const [aadhaarRetryCount, setAadhaarRetryCount] = useState(0);
const [bookingFinalized, setBookingFinalized] = useState(false);
  const change = (name, value) => {
    let next = value;

    if (["pan_number", "gst_number", "udyam_number"].includes(name)) {
      next = value.toUpperCase();
    }

    if (["mobile_number", "customer_pincode", "business_pincode", "aadhaar_number"].includes(name)) {
      next = value.replace(/\D/g, "");
    }

    if (name === "mobile_number") {
      next = next.slice(0, 10);
      setMobileVerified(false);
      setOtpSession("");
    }

    if (name === "pan_number") {
      next = next.slice(0, 10);
      setPanVerified(false);
    }

    if (name === "customer_name") setPanVerified(false);

    if (name === "customer_pincode" || name === "business_pincode") {
      next = next.slice(0, 6);
    }

    if (name === "aadhaar_number") next = next.slice(0, 12);

    setForm((previous) => ({ ...previous, [name]: next }));
  };

  const sendOtp = async () => {
    setError("");
    setSuccess("");

    if (!/^[6-9]\d{9}$/.test(form.mobile_number)) {
      return setError("Enter a valid 10-digit mobile number.");
    }

    try {
      setLoading(true);

      const response = await api.post(`${BASE}/otp/send`, {
        mobile_number: form.mobile_number,
      });

      const sessionId = response.data?.session_id;

      if (!sessionId) {
        throw new Error("OTP session ID not received.");
      }

      setOtpSession(sessionId);
      setOtp("");
      setConsent(false);
      setOtpOpen(true);
      setSuccess("OTP sent successfully.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError("");

    if (!/^\d{6}$/.test(otp)) {
      return setError("Enter a valid 6-digit OTP.");
    }

    if (!consent) {
      return setError("Please accept the consent.");
    }

    try {
      setLoading(true);

      const response = await api.post(`${BASE}/otp/verify`, {
        session_id: otpSession,
        mobile_number: form.mobile_number,
        otp,
        consent_accepted: true,
      });

      if (response.data?.verified !== true) {
        throw new Error("Mobile OTP verification failed.");
      }

      setMobileVerified(true);
      setOtpOpen(false);
      setOtp("");
      setSuccess("Mobile number verified successfully.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

 

const verifyPan = async () => {
  setError("");
  setSuccess("");

  if (!mobileVerified) {
    return setError("Verify mobile number first.");
  }

  if (!otpSession) {
    return setError(
      "OTP session not found. Please verify mobile again."
    );
  }

  if (!form.customer_name.trim()) {
    return setError("Enter customer name.");
  }

  const panNumber = form.pan_number.trim().toUpperCase();

  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
    return setError("Enter a valid PAN number.");
  }

  try {
    setLoading(true);

    const response = await api.post(`${BASE}/pan/verify`, {
      session_id: otpSession,
      mobile_number: form.mobile_number,
      pan_number: panNumber,
      customer_name: form.customer_name.trim(),
    });

    if (
      response.data?.success !== true ||
      response.data?.verified !== true
    ) {
      throw new Error(
        response.data?.message || "PAN verification failed."
      );
    }

    const details = response.data?.data || {};

    const fetchedName = String(
      details.customer_name ||
      details.customerName ||
      [details.firstName, details.lastName]
        .filter(Boolean)
        .join(" ")
    ).trim();

    if (!fetchedName) {
      throw new Error(
        "PAN verified, but customer name was not returned by the API."
      );
    }

    setForm((previous) => ({
      ...previous,
      pan_number: panNumber,
      customer_name: fetchedName,
    }));

    setPanVerified(true);

    setSuccess(
      "PAN verified and customer name fetched successfully."
    );
  } catch (err) {
  setPanVerified(false);

  if (
    err.response?.status === 403 &&
    err.response?.data?.message ===
      "Verify mobile OTP before PAN"
  ) {
    setMobileVerified(false);
    setOtpSession("");

    setError(
      "Your OTP verification session has expired or is invalid. Please verify your mobile number again."
    );

    return;
  }

  setError(errorMessage(err));
} finally {
    setLoading(false);
  }
};


  const validateStep = () => {
    if (step === 0) {
      if (!form.partner_loan_id.trim()) return "Enter Partner Loan ID.";
      if (!form.customer_name.trim()) return "Enter Customer Name.";
      if (!mobileVerified) return "Verify Mobile Number.";
      if (!panVerified) return "Verify PAN Number.";
      if (!form.borrower_dob) return "Enter Borrower DOB.";
    }

    if (step === 1) {
      if (!form.customer_address.trim()) return "Enter Address.";
      if (!form.customer_city.trim()) return "Enter City.";
      if (!form.customer_state.trim()) return "Enter State.";
      if (!/^[1-9]\d{5}$/.test(form.customer_pincode)) {
        return "Enter valid Pincode.";
      }
    }


if (step === 2) {
  if (
    form.annual_income === "" ||
    !Number.isFinite(Number(form.annual_income)) ||
    Number(form.annual_income) < 0
  ) {
    return "Enter valid Annual Income.";
  }

  if (
    form.requested_amount === "" ||
    !Number.isFinite(Number(form.requested_amount)) ||
    Number(form.requested_amount) <= 0
  ) {
    return "Enter valid Requested Loan Amount.";
  }

  if (
    form.tenure === "" ||
    !Number.isInteger(Number(form.tenure)) ||
    Number(form.tenure) <= 0
  ) {
    return "Enter valid Tenure in months.";
  }

  if (
    form.roi === "" ||
    !Number.isFinite(Number(form.roi)) ||
    Number(form.roi) < 0 ||
    Number(form.roi) > 100
  ) {
    return "Enter valid ROI between 0 and 100.";
  }

  if (
    form.processing_fee !== "" &&
    (
      !Number.isFinite(Number(form.processing_fee)) ||
      Number(form.processing_fee) < 0
    )
  ) {
    return "Enter valid Processing Fee.";
  }

  if (
    form.net_disbursement_amount === "" ||
    !Number.isFinite(Number(form.net_disbursement_amount)) ||
    Number(form.net_disbursement_amount) <= 0 ||
    Number(form.net_disbursement_amount) >
      Number(form.requested_amount)
  ) {
    return "Enter valid Net Disbursement Amount.";
  }
}


    if (step === 3) {
      if (
        form.business_pincode &&
        !/^[1-9]\d{5}$/.test(form.business_pincode)
      ) return "Enter valid Business Pincode.";
    }

    return "";
  };


const next = async () => {
  setError("");
  setSuccess("");

  if (loading) return;

  const validation = validateStep();

  if (validation) {
    setError(validation);
    return;
  }

  try {
    setLoading(true);

    // STEP 1 - Create draft and generate LAN
    if (step === 0) {
      if (!lan) {
        const response = await api.post(`${BASE}/draft`, {
          partner_loan_id: form.partner_loan_id.trim(),
          customer_name: form.customer_name.trim(),
          mobile_number: form.mobile_number,
          pan_number: form.pan_number,
          borrower_dob: form.borrower_dob,
          gender: form.gender,
          email: form.email,
          session_id: otpSession,
        });

        const generatedLan = response.data?.data?.lan;

        if (!response.data?.success || !generatedLan) {
          throw new Error("Failed to save Basic Details.");
        }

        setLan(generatedLan);
        setLoadLan(generatedLan);
        setCaseStatus("Draft");
        setSuccess(`Basic Details saved. LAN: ${generatedLan}`);
      }

      setStep(1);
      return;
    }

    if (!lan) {
      throw new Error("Save Basic Details first.");
    }

    // STEP 2 - Save residential address
 
if (step === 1) {
  if (!lan) {
    throw new Error("Please save Basic Details first.");
  }

  const payload = {
    step: "address",
    data: {
      customer_address: form.customer_address.trim(),
      customer_city: form.customer_city.trim(),
      customer_state: form.customer_state.trim(),
      customer_pincode: form.customer_pincode.trim(),
    },
  };

  console.log("[NIYARA ADDRESS] Saving:", {
    lan,
    step: payload.step,
    hasAddress: Boolean(payload.data.customer_address),
    city: payload.data.customer_city,
    state: payload.data.customer_state,
    pincodeValid: /^[1-9]\d{5}$/.test(
      payload.data.customer_pincode
    ),
  });

  const response = await api.patch(
    `${BASE}/draft/${encodeURIComponent(lan)}`,
    payload
  );

  if (response.data?.success !== true) {
    throw new Error(
      response.data?.message || "Address save failed."
    );
  }

  setSuccess("Address Details saved successfully.");
  setStep(2);
  return;
}


    // STEP 3 - Save loan details
    if (step === 2) {
      const response = await api.patch(
        `${BASE}/draft/${encodeURIComponent(lan)}`,
        {
          step: "loan",
        data: {
  annual_income: Number(form.annual_income),
  requested_amount: Number(form.requested_amount),
  tenure: Number(form.tenure),
  roi: Number(form.roi),
  processing_fee: Number(form.processing_fee || 0),
  net_disbursement_amount: Number(form.net_disbursement_amount),
},
        }
      );

      if (!response.data?.success) {
        throw new Error("Failed to save Loan Details.");
      }

      setSuccess("Loan Details saved successfully.");
      setStep(3);
      return;
    }
  } catch (err) {
    setError(errorMessage(err));
  } finally {
    setLoading(false);
  }
};


const triggerAadhaar = async (retrigger = false) => {
  setError("");
  setSuccess("");

  if (!lan) {
    return setError(
      "Submit the Niyara loan booking first to generate LAN."
    );
  }

  // Frontend entry validation only.
  // The raw Aadhaar number is not sent to DigiLocker
  // by this provider initiation API.
  if (!/^\d{12}$/.test(form.aadhaar_number)) {
    return setError("Enter a valid 12-digit Aadhaar number.");
  }

  // Open an empty tab directly from the user click so
  // browser popup blockers do not prevent DigiLocker.
  const digilockerWindow = window.open(
    "",
    "_blank"
  );

  try {
    setLoading(true);

    const response = await api.post(
      `${BASE}/aadhaar/init`,
      {
        lan,
        retrigger,
      }
    );

    const data = response.data;

    if (!data?.success) {
      throw new Error(
        data?.message || "Aadhaar initiation failed."
      );
    }

    setAadhaarStatus(data.status || "INITIATED");
    setAadhaarRetryCount(
      Number(data.aadhaarRetryCount || 0)
    );

    if (data.kycUrl) {
      setAadhaarUrl(data.kycUrl);

      if (digilockerWindow) {
        digilockerWindow.opener = null;
        digilockerWindow.location.replace(data.kycUrl);
      }
    } else if (digilockerWindow) {
      digilockerWindow.close();
    }

    setSuccess(data.message || "Aadhaar initiated.");
  } catch (err) {
    if (digilockerWindow) digilockerWindow.close();
    setError(errorMessage(err));
  } finally {
    setLoading(false);
  }
};

const fetchAadhaarAddress = async () => {
  setError("");
  setSuccess("");

  if (!lan) {
    return setError("Niyara LAN is required.");
  }

  try {
    setLoading(true);

    const response = await api.get(
      `${BASE}/aadhaar/address/${encodeURIComponent(lan)}`
    );

    if (
      !response.data?.success ||
      response.data?.status !== "VERIFIED"
    ) {
      throw new Error("Aadhaar verification is pending.");
    }

    const fetched = response.data.address || {};

    setForm((previous) => ({
      ...previous,
      customer_address:
        fetched.addressLine1 || previous.customer_address,
      customer_city:
        fetched.city || previous.customer_city,
      customer_state:
        fetched.state || previous.customer_state,
      customer_pincode:
        fetched.pincode || previous.customer_pincode,
    }));

    setAadhaarStatus("VERIFIED");
    setSuccess("Aadhaar verified. Address fetched successfully.");
  } catch (err) {
    setError(errorMessage(err));
  } finally {
    setLoading(false);
  }
};

  const loadBooking = async (targetLan) => {
    const value = String(targetLan || "").trim().toUpperCase();

    if (!/^NYRA\d+$/.test(value)) {
      return setError("Enter a valid Niyara LAN.");
    }

    try {
      setLoading(true);
      setError("");

      const response = await api.get(
        `${BASE}/customer-details/${value}`
      );

      const saved = response.data?.data?.loan ||
        response.data?.data;

      if (!saved?.lan) throw new Error("Loan details not found.");


setForm((previous) => {
  const nextForm = { ...previous };

  Object.keys(initialForm).forEach((key) => {
    nextForm[key] = saved[key] ?? "";
  });

  // Map database fields to frontend fields
  nextForm.tenure =
    saved.tenure ?? saved.loan_tenure ?? "";

  nextForm.roi =
    saved.roi ?? saved.interest ?? "";

  nextForm.net_disbursement_amount =
    saved.net_disbursement_amount ??
    saved.net_disbursement ??
    "";

  return nextForm;
});


setLan(saved.lan);
setLoadLan(saved.lan);

const status = String(saved.status || "Draft").trim();

const finalized = !["draft", "login"].includes(
  status.toLowerCase()
);

setCaseStatus(status);
setBookingFinalized(finalized);

setAadhaarStatus("PENDING");
setAadhaarUrl("");
setAadhaarRetryCount(0);

// Do not claim OTP/PAN verification from browser state.
setMobileVerified(false);
setPanVerified(false);

setStep(finalized ? 4 : 1);
      setSuccess(`Case ${saved.lan} loaded successfully.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const requestedLan = searchParams.get("lan");
    if (requestedLan) loadBooking(requestedLan);
  }, [searchParams]);


const submitBooking = async () => {
  setError("");
  setSuccess("");

  if (loading || bookingFinalized) return;

  if (!lan) {
    return setError("Save Basic Details first.");
  }

//   if (!mobileVerified || !panVerified) {
//     setStep(0);
//     return setError(
//       "Complete Mobile OTP and PAN verification first."
//     );
//   }

 
  
const requiredFields = [
  ["partner_loan_id", "Partner Loan ID"],
  ["customer_name", "Customer Name"],
  ["customer_address", "Residential Address"],
  ["customer_city", "City"],
  ["customer_state", "State"],
  ["borrower_dob", "Borrower DOB"],
  ["customer_pincode", "Pincode"],
  ["annual_income", "Annual Income"],
  ["requested_amount", "Requested Loan Amount"],
//   ["tenure", "Tenure"],
  ["roi", "ROI"],
];

for (const [field, label] of requiredFields) {
  if (
    form[field] === null ||
    form[field] === undefined ||
    String(form[field]).trim() === ""
  ) {
    return setError(`${label} is required.`);
  }
}

if (!/^[1-9]\d{5}$/.test(String(form.customer_pincode))) {
  return setError("Enter a valid 6-digit Pincode.");
}

if (
  !Number.isFinite(Number(form.annual_income)) ||
  Number(form.annual_income) < 0
) {
  return setError("Enter a valid Annual Income.");
}

if (
  !Number.isFinite(Number(form.requested_amount)) ||
  Number(form.requested_amount) <= 0
) {
  return setError("Enter a valid Requested Loan Amount.");
}

if (
  !Number.isInteger(Number(form.tenure)) ||
  Number(form.tenure) <= 0
) {
  return setError("Enter a valid Tenure.");
}

if (
  !Number.isFinite(Number(form.roi)) ||
  Number(form.roi) < 0 ||
  Number(form.roi) > 100
) {
  return setError("ROI must be between 0 and 100.");
}

console.log("[NIYARA SUBMIT VALIDATION]", {
  missingFields: [
    "partner_loan_id",
    "customer_name",
    "customer_address",
    "customer_city",
    "customer_state",
    "borrower_dob",
    "customer_pincode",
    "annual_income",
    "requested_amount",
    "tenure",
    "roi",
  ].filter(
    (key) =>
      form[key] == null ||
      String(form[key]).trim() === ""
  ),
  pincodeValid: /^[1-9]\d{5}$/.test(
    String(form.customer_pincode)
  ),
  annualIncomeValid:
    form.annual_income !== "" &&
    Number.isFinite(Number(form.annual_income)) &&
    Number(form.annual_income) >= 0,
  requestedAmountValid:
    Number(form.requested_amount) > 0,
  tenureValid:
    Number.isInteger(Number(form.tenure)) &&
    Number(form.tenure) > 0,
  roiValid:
    form.roi !== "" &&
    Number(form.roi) >= 0 &&
    Number(form.roi) <= 100,
});
  try {
    setLoading(true);



    // STEP 2: Submit using existing LAN through LOGIN API
    const payload = {
      ...form,
      lan,
      session_id: otpSession,
      annual_income: Number(form.annual_income),
      requested_amount: Number(form.requested_amount),
      tenure: Number(form.tenure),
      roi: Number(form.roi),
      processing_fee: Number(form.processing_fee || 0),
      net_disbursement_amount: Number(
        form.net_disbursement_amount
      ),
    };

    // Raw Aadhaar number is not needed for login submission
    delete payload.aadhaar_number;

    const response = await api.post(
      `${BASE}/login`,
      payload
    );

    if (!response.data?.success) {
      throw new Error(
        response.data?.message || "Loan booking failed."
      );
    }

    const booked = response.data?.data || {};

    if (booked.lan !== lan) {
      throw new Error(
        "Login API returned a different LAN. Check backend draft handling."
      );
    }

    setLan(lan);
    setLoadLan(lan);
    setCaseStatus(booked.status || "Login");
    setBookingFinalized(true);
    setStep(4);

    setSuccess(
      `Niyara loan submitted successfully. LAN: ${lan}`
    );
  } catch (err) {
    setError(errorMessage(err));
  } finally {
    setLoading(false);
  }
};


  const renderInput = (name, label, options = {}) => (
    <Field
      name={name}
      label={label}
      value={form[name]}
      onChange={change}
      disabled={bookingFinalized|| loading}
      {...options}
    />
  );

  return (
    <div className="nyra-page">
      <style>{styles}</style>

      <div className="nyra-header">
        <div>
          <h1>Niyara Loan Booking</h1>
          <p>Unsecured Business Loan | Fintree Finance</p>
        </div>
        <div className="nyra-meta">
          <div><strong>LAN:</strong> {lan || "Not Generated"}</div>
          <div><strong>Status:</strong> {caseStatus}</div>
        </div>
      </div>

      <div className="nyra-load">
        <input
          placeholder="Enter NYRA LAN"
          value={loadLan}
          onChange={(e) => setLoadLan(e.target.value.toUpperCase())}
        />
        <button
          type="button"
          className="nyra-secondary"
          disabled={loading}
          onClick={() => loadBooking(loadLan)}
        >
          Load Case
        </button>
        <button
          type="button"
          className="nyra-secondary"
          onClick={() => window.location.assign("/niyara/loan-booking")}
        >
          New Case
        </button>
      </div>

      {error && <div className="nyra-error">{error}</div>}
      {success && <div className="nyra-success">{success}</div>}

      <div className="nyra-tabs">
        {steps.map((title, index) => (
          <button
            key={title}
            type="button"
            className={`nyra-tab ${step === index ? "active" : ""}`}
            disabled={index === 4 && !lan}
            onClick={() => setStep(index)}
          >
            <span className="nyra-step-number">{index + 1}</span>
            {title}
          </button>
        ))}
      </div>

      <section className="nyra-card">
        <div className="nyra-eyebrow">
          STEP {step + 1} OF 5
        </div>
        <h2>{steps[step]}</h2>
        <hr className="nyra-rule" />

        {step === 0 && (
          <div className="nyra-grid">
            {renderInput("partner_loan_id", "Partner Loan ID", {
              required: true,
            })}

            {renderInput("customer_name", "Customer Name", {
              required: true,
            })}

            <Field
              label="Mobile Number"
              name="mobile_number"
              required
            >
              <div className="nyra-input-action">
                <input
                  id="nyra-mobile_number"
                  value={form.mobile_number}
                  maxLength={10}
                  disabled={mobileVerified || Boolean(lan)}
                  onChange={(e) =>
                    change("mobile_number", e.target.value)
                  }
                />
                <button
                  type="button"
                  className="nyra-secondary"
                  disabled={loading || mobileVerified || Boolean(lan)}
                  onClick={sendOtp}
                >
                  {mobileVerified ? "Verified ✓" : "Send OTP"}
                </button>
              </div>
            </Field>

            <Field label="PAN Number" name="pan_number" required>
              <div className="nyra-input-action">
                <input
                  id="nyra-pan_number"
                  value={form.pan_number}
                  maxLength={10}
                  disabled={!mobileVerified || panVerified || Boolean(lan)}
                  onChange={(e) =>
                    change("pan_number", e.target.value)
                  }
                />
                <button
                  type="button"
                  className="nyra-secondary"
                  disabled={
                    loading || !mobileVerified ||
                    panVerified || bookingFinalized
                  }
                  onClick={verifyPan}
                >
                  {panVerified ? "PAN Verified ✓" : "Verify & Fetch"}
                </button>
              </div>
            </Field>

            {renderInput("borrower_dob", "Borrower DOB", {
              type: "date",
              required: true,
            })}

            <Field label="Gender" name="gender">
              <select
                id="nyra-gender"
                value={form.gender}
                disabled={Boolean(lan)}
                onChange={(e) => change("gender", e.target.value)}
              >
                <option value="">Select</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>

            {renderInput("email", "Email", { type: "email" })}
          </div>
        )}

       
{step === 1 && (
  <div className="nyra-grid">
    {renderInput("customer_address", "Residential Address", {
      required: true,
    })}

    {renderInput("customer_city", "City", {
      required: true,
    })}

    {renderInput("customer_state", "State", {
      required: true,
    })}

    {renderInput("customer_pincode", "Pincode", {
      required: true,
      maxLength: 6,
    })}

    {renderInput("aadhaar_number", "Aadhaar Number (Optional)", {
      maxLength: 12,
    })}

    {/* Aadhaar DigiLocker Actions */}
    <div
      className="nyra-field"
      style={{ gridColumn: "1 / -1" }}
    >
      <label>Aadhaar DigiLocker Verification</label>

      <div
        className="nyra-input-action"
        style={{ flexWrap: "wrap" }}
      >
        <button
          type="button"
          className="nyra-secondary"
          disabled={
            loading ||
            !lan ||
            !/^\d{12}$/.test(form.aadhaar_number) ||
            aadhaarStatus === "VERIFIED" ||
            aadhaarStatus === "INITIATED"
          }
          onClick={() => triggerAadhaar(false)}
        >
          {aadhaarStatus === "VERIFIED"
            ? "Aadhaar Verified ✓"
            : "Trigger Aadhaar"}
        </button>

        {aadhaarStatus === "INITIATED" && (
          <button
            type="button"
            className="nyra-secondary"
            disabled={
              loading || aadhaarRetryCount >= 2
            }
            onClick={() => triggerAadhaar(true)}
          >
            {aadhaarRetryCount >= 2
              ? "Retry Limit Reached"
              : `Retry Aadhaar (${aadhaarRetryCount}/2)`}
          </button>
        )}

        {aadhaarUrl && (
          <button
            type="button"
            className="nyra-secondary"
            onClick={() =>
              window.open(
                aadhaarUrl,
                "_blank",
                "noopener,noreferrer"
              )
            }
          >
            Open DigiLocker
          </button>
        )}

        <button
          type="button"
          className="nyra-secondary"
          disabled={loading || !lan}
          onClick={fetchAadhaarAddress}
        >
          Fetch Aadhaar Address
        </button>
      </div>

      <span style={{ fontSize: 12, color: "#71829c" }}>
        Status: <strong>{aadhaarStatus}</strong>

        {!lan && (
          <span>
            {" "}— Submit loan booking first to enable DigiLocker.
          </span>
        )}
      </span>
    </div>
  </div>
)}


        
{step === 2 && (
  <div className="nyra-grid">
    {renderInput("annual_income", "Annual Income (₹)", {
      type: "number",
      required: true,
    })}

    {renderInput("requested_amount", "Requested Loan Amount (₹)", {
      type: "number",
      required: true,
    })}

    {renderInput("tenure", "Tenure (Months)", {
      type: "number",
      required: true,
    })}

    {renderInput("roi", "ROI (% Per Annum)", {
      type: "number",
      required: true,
    })}

    {renderInput("processing_fee", "Processing Fee (₹)", {
      type: "number",
    })}

    {renderInput(
      "net_disbursement_amount",
      "Net Disbursement Amount (₹)",
      {
        type: "number",
        required: true,
      }
    )}
  </div>
)}


        {step === 3 && (
          <div className="nyra-grid">
            {renderInput("business_name", "Business Name")}
            {renderInput("business_type", "Business Type")}
            {renderInput("gst_number", "GST Number")}
            {renderInput("udyam_number", "Udyam Number")}
            {renderInput("business_address", "Business Address")}
            {renderInput("business_city", "Business City")}
            {renderInput("business_state", "Business State")}
            {renderInput("business_pincode", "Business Pincode", {
              maxLength: 6,
            })}
          </div>
        )}

        {step === 4 && (
          <div>
            <div className="nyra-note">
              <strong>Loan Account:</strong> {lan || "Not generated"}
              <p><strong>Current Status:</strong> {caseStatus}</p>
              <p>
                After booking, Niyara verification proceeds through
                Bureau, BRE and AML before partner credit review.
              </p>
            </div>

            <div className="nyra-flow-grid">
              {[
                ["Bureau / BRE / AML", "Verification and eligibility"],
                ["Partner Credit", "Partner credit decision"],
                ["Internal Credit", "Fintree credit decision"],
                ["eSign / eNACH", "Agreement and mandate"],
                ["Ops Maker / Checker", "Operations approvals"],
                ["Disbursement", "Final payout"],
              ].map(([title, subtitle]) => (
                <div className="nyra-flow-card" key={title}>
                  <h3>{title}</h3>
                  <p>{subtitle}</p>
                </div>
              ))}
            </div>

            <p className="nyra-note">
              These workflow cards are informational. This booking
              component does not automatically initiate credit,
              eSign, eNACH or disbursement actions.
            </p>
          </div>
        )}

        <div className="nyra-actions">
          <button
            type="button"
            className="nyra-secondary"
            disabled={loading || step === 0}
            onClick={() => setStep((previous) => previous - 1)}
          >
            ← Back
          </button>

          {step < 3 && (
            <button
              type="button"
              className="nyra-primary"
disabled={loading || bookingFinalized}
              onClick={next}
            >
              Save & Next →
            </button>
          )}

          {step === 3 && (
            <button
              type="button"
              className="nyra-primary"
              disabled={loading || bookingFinalized}
              onClick={submitBooking}
            >
              {loading ? "Submitting..." : "Submit Loan Booking"}
            </button>
          )}
        </div>
      </section>

      {otpOpen && (
        <div className="nyra-modal-backdrop">
          <div
            className="nyra-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nyra-otp-title"
          >
            <h3 id="nyra-otp-title">Verify Mobile OTP</h3>
            <p>OTP sent to ******{form.mobile_number.slice(-4)}</p>

            <div className="nyra-field">
              <label htmlFor="nyra-otp">6-digit OTP</label>
              <input
                id="nyra-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
            </div>

            <label className="nyra-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I consent to mobile verification for my loan application
              with Fintree Finance.
            </label>

            <div className="nyra-modal-actions">
              <button
                type="button"
                className="nyra-secondary"
                disabled={loading}
                onClick={() => setOtpOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="nyra-primary"
                disabled={loading || !consent || otp.length !== 6}
                onClick={verifyOtp}
              >
                Verify OTP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
