import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/api";
import "../../styles/ClaimCureBuddyLoanBooking.css";

const API = "claim-cure-buddy";
const CONSENT_TEXT = `I/We authorise Fintree Finance Private Limited and its service providers to verify my identity, PAN, Aadhaar, credit bureau and contact details for processing this loan application. I/We consent to receive OTP, SMS, calls and email related to this application.`;

const localToday = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const blankBasic = {
  loginDate: localToday(),
  mobileNumber: "",
  panNumber: "",
  firstName: "",
  lastName: "",
  customerName: "",
  gender: "",
  borrowerDob: "",
  fatherName: "",
  email: "",
};

const blankAddress = {
  permanentAddressLine1: "",
  permanentAddressLine2: "",
  permanentCity: "",
  permanentDistrict: "",
  permanentState: "",
  permanentPincode: "",
  currentAddressLine1: "",
  currentAddressLine2: "",
  currentCity: "",
  currentDistrict: "",
  currentState: "",
  currentPincode: "",
  currentSameAsPermanent: false,
};

const blankLoan = {
  loanAmount: "",
  interestRate: "",
  tenure: "",
  processingFee: "",
  disbursalAmount: "",
};

const blankBank = {
  accountHolderName: "",
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  branchAddress: "",
};

const createCoApplicant = (partyNo) => ({
  partyNo,
  mobileNumber: "",
  mobileVerified: false,
  panNumber: "",
  panVerified: false,
  firstName: "",
  lastName: "",
  customerName: "",
  gender: "",
  dob: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  district: "",
  state: "",
  pincode: "",
  aadhaarStatus: "PENDING",
  saved: false,
});

const getError = (error, fallback) =>
  error.response?.data?.message || error.message || fallback;

function Field({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
  required = false,
  placeholder = "",
  maxLength,
  min,
  max,
  step,
}) {
  return (
    <label className="ccb-field">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        min={min}
        max={max}
        step={step}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options, required = false }) {
  return (
    <label className="ccb-field">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <select
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({ value }) {
  const normalized = String(value || "PENDING").toUpperCase();
  return (
    <span className={`ccb-status ccb-status-${normalized.toLowerCase()}`}>
      {normalized}
    </span>
  );
}

export default function ClaimCureBuddyLoanBooking() {
  const [searchParams] = useSearchParams();
  const resumeLan = searchParams.get("lan");
  const sections = [
    "Basic Details",
    "Address",
    "Loan Details",
    "Co-Applicants",
    "Bank Details",
  ];

  const [activeSection, setActiveSection] = useState(0);
  const [lan, setLan] = useState("");
  const [partnerLoanId, setPartnerLoanId] = useState("");
  const [caseStatus, setCaseStatus] = useState("Draft");
  const [basic, setBasic] = useState(blankBasic);
  const [address, setAddress] = useState(blankAddress);
  const [loan, setLoan] = useState(blankLoan);
  const [bank, setBank] = useState(blankBank);
  const [coApplicants, setCoApplicants] = useState([]);
  const [borrowerMobileVerified, setBorrowerMobileVerified] = useState(false);
  const [borrowerPanVerified, setBorrowerPanVerified] = useState(false);
  const [borrowerAadhaarStatus, setBorrowerAadhaarStatus] = useState("PENDING");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [breResult, setBreResult] = useState(null);
  const [borrowerPreBreStatus, setBorrowerPreBreStatus] = useState("PENDING");

  const [borrowerPreBreResult, setBorrowerPreBreResult] = useState(null);
  const [otpDialog, setOtpDialog] = useState({
    open: false,
    applicantType: "BORROWER",
    partyNo: 1,
    mobile: "",
    otp: "",
    consent: false,
  });

  const isTerminal = useMemo(
    () => ["Approved", "Rejected"].includes(caseStatus),
    [caseStatus],
  );
  const kycKey = (type, partyNo) => `${type}-${partyNo}`;

  const setNotice = (text) => {
    setMessage(text);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const mapResumeData = (payload) => {
    const {
      loan: saved,
      coApplicants: savedCoApplicants = [],
      kycStatuses: savedKyc = [],
    } = payload;
    const sectionByStage = {
      "Basic Details": 0,
      Address: 1,
      "Loan Details": 2,
      "Co-Applicants": 3,
      "Bank Details": 4,
    };

    setActiveSection(sectionByStage[saved.stage] ?? 0);
    const statusMap = {};
    savedKyc.forEach((row) => {
      statusMap[kycKey(row.applicant_type, Number(row.party_no))] = row;
    });
    const borrowerKyc = statusMap[kycKey("BORROWER", 1)] || {};

    setLan(saved.lan);
    setPartnerLoanId(saved.partner_loan_id);
    setCaseStatus(saved.status);
    setBorrowerMobileVerified(Number(saved.borrower_mobile_verified) === 1);
    setBorrowerPanVerified(borrowerKyc.pan_status === "VERIFIED");
    setBorrowerAadhaarStatus(borrowerKyc.aadhaar_status || "PENDING");
    setBorrowerPreBreStatus(saved.borrower_pre_bre_status || "PENDING");

    if (saved.borrower_pre_bre_reason) {
      try {
        const parsedPreBre =
          typeof saved.borrower_pre_bre_reason === "string"
            ? JSON.parse(saved.borrower_pre_bre_reason)
            : saved.borrower_pre_bre_reason;

        setBorrowerPreBreResult(parsedPreBre);
      } catch (error) {
        console.error("Unable to parse borrower pre-BRE result:", error);

        setBorrowerPreBreResult(null);
      }
    } else {
      setBorrowerPreBreResult(null);
    }
    setBasic({
      loginDate: String(saved.login_date || localToday()).slice(0, 10),
      mobileNumber: saved.mobile_number || "",
      panNumber: saved.pan_card || "",
      firstName: saved.first_name || "",
      lastName: saved.last_name || "",
      customerName: saved.customer_name || "",
      gender: saved.gender || "",
      borrowerDob: saved.dob ? String(saved.dob).slice(0, 10) : "",
      fatherName: saved.father_name || "",
      email: saved.email || "",
    });
    setAddress({
      permanentAddressLine1: saved.permanent_address_line_1 || "",
      permanentAddressLine2: saved.permanent_address_line_2 || "",
      permanentCity: saved.permanent_city || "",
      permanentDistrict: saved.permanent_district || "",
      permanentState: saved.permanent_state || "",
      permanentPincode: saved.permanent_pincode || "",
      currentAddressLine1: saved.current_address_line_1 || "",
      currentAddressLine2: saved.current_address_line_2 || "",
      currentCity: saved.current_city || "",
      currentDistrict: saved.current_district || "",
      currentState: saved.current_state || "",
      currentPincode: saved.current_pincode || "",
      currentSameAsPermanent: Number(saved.current_same_as_permanent) === 1,
    });
    setLoan({
      loanAmount: saved.loan_amount || "",
      interestRate: saved.interest_rate || "",
      tenure: saved.loan_tenure || "",
      processingFee: saved.processing_fee || "",
      disbursalAmount: saved.disbursal_amount || "",
    });
    setBank({
      accountHolderName: saved.customer_name_as_per_bank || "",
      bankName: saved.customer_bank_name || "",
      accountNumber: saved.customer_account_number || "",
      ifscCode: saved.bank_ifsc_code || "",
      branchAddress: saved.bank_branch_address || "",
    });
    setCoApplicants(
      savedCoApplicants.map((item) => {
        const partyKyc =
          statusMap[kycKey("CO_APPLICANT", Number(item.party_no))] || {};
        return {
          partyNo: Number(item.party_no),
          mobileNumber: item.mobile_number || "",
          mobileVerified: Number(item.mobile_verified) === 1,
          panNumber: item.pan_number || "",
          panVerified: partyKyc.pan_status === "VERIFIED",
          firstName: item.first_name || "",
          lastName: item.last_name || "",
          customerName: item.customer_name || "",
          gender: item.gender || "",
          dob: item.dob ? String(item.dob).slice(0, 10) : "",
          email: item.email || "",
          addressLine1: item.address_line_1 || "",
          addressLine2: item.address_line_2 || "",
          city: item.city || "",
          district: item.district || "",
          state: item.state || "",
          pincode: item.pincode || "",
          aadhaarStatus: partyKyc.aadhaar_status || "PENDING",
          saved: true,
        };
      }),
    );

    if (saved.bre_reason) {
      try {
        setBreResult(
          typeof saved.bre_reason === "string"
            ? JSON.parse(saved.bre_reason)
            : saved.bre_reason,
        );
      } catch (_) {
        /* ignore old invalid JSON */
      }
    }
  };

  const fetchBooking = async (targetLan) => {
    setLoading(true);
    try {
      const response = await api.get(`${API}/loan-booking/${targetLan}`);
      mapResumeData(response.data.data);
    } catch (error) {
      setNotice(`❌ ${getError(error, "Unable to resume booking")}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (resumeLan) fetchBooking(resumeLan);
  }, [resumeLan]);

  const updateBasic = (name, value) =>
    setBasic((previous) => ({ ...previous, [name]: value }));
  const updateAddress = (name, value) =>
    setAddress((previous) => ({ ...previous, [name]: value }));
  const updateLoan = (name, value) => {
    setLoan((previous) => ({
      ...previous,
      [name]: value,
    }));

    setBorrowerPreBreStatus("PENDING");
    setBorrowerPreBreResult(null);
  };
  const updateBank = (name, value) =>
    setBank((previous) => ({ ...previous, [name]: value }));
  const updateCoApplicant = (partyNo, name, value) => {
    setCoApplicants((previous) =>
      previous.map((item) =>
        item.partyNo === partyNo
          ? { ...item, [name]: value, saved: false }
          : item,
      ),
    );
  };

  const openOtp = async ({ applicantType, partyNo, mobile }) => {
    const cleanedMobile = String(mobile || "").replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(cleanedMobile)) {
      setNotice("❌ Enter a valid 10-digit mobile number.");
      return;
    }
    try {
      setLoading(true);
      await api.post(`${API}/otp/send`, {
        mobile: cleanedMobile,
        applicantType,
        partyNo,
        lan: applicantType === "CO_APPLICANT" ? lan : undefined,
      });
      setOtpDialog({
        open: true,
        applicantType,
        partyNo,
        mobile: cleanedMobile,
        otp: "",
        consent: false,
      });
      setNotice("✅ OTP sent successfully.");
    } catch (error) {
      setNotice(`❌ ${getError(error, "OTP send failed")}`);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpDialog.consent)
      return setNotice("❌ Please accept the consent before verifying OTP.");
    if (!/^\d{6}$/.test(otpDialog.otp))
      return setNotice("❌ Enter a valid 6-digit OTP.");

    try {
      setLoading(true);
      const response = await api.post(`${API}/otp/verify`, {
        mobile: otpDialog.mobile,
        otp: otpDialog.otp,
        consentText: CONSENT_TEXT,
        applicantType: otpDialog.applicantType,
        partyNo: otpDialog.partyNo,
        lan: otpDialog.applicantType === "CO_APPLICANT" ? lan : undefined,
      });

      if (otpDialog.applicantType === "BORROWER") {
        setLan(response.data.lan);
        setPartnerLoanId(response.data.partnerLoanId || "");
        setBorrowerMobileVerified(true);
        updateBasic("mobileNumber", otpDialog.mobile);
      } else {
        setCoApplicants((previous) =>
          previous.map((item) =>
            item.partyNo === otpDialog.partyNo
              ? {
                  ...item,
                  mobileNumber: otpDialog.mobile,
                  mobileVerified: true,
                }
              : item,
          ),
        );
      }
      setOtpDialog((previous) => ({ ...previous, open: false }));
      setNotice(
        `✅ ${response.data.message}${response.data.lan ? ` | LAN: ${response.data.lan}` : ""}`,
      );
    } catch (error) {
      setNotice(`❌ ${getError(error, "OTP verification failed")}`);
    } finally {
      setLoading(false);
    }
  };

  const verifyPan = async (applicantType, partyNo) => {
    const coApplicant =
      applicantType === "CO_APPLICANT"
        ? coApplicants.find((item) => item.partyNo === partyNo)
        : null;

    const panNumber =
      applicantType === "BORROWER"
        ? String(basic.panNumber || "")
            .trim()
            .toUpperCase()
        : String(coApplicant?.panNumber || "")
            .trim()
            .toUpperCase();

    const customerName =
      applicantType === "BORROWER"
        ? String(basic.customerName || "").trim()
        : String(coApplicant?.customerName || "").trim();

    if (!lan) {
      return setNotice("❌ Verify borrower mobile first to generate LAN.");
    }

    if (!customerName) {
      return setNotice(
        `❌ Enter ${
          applicantType === "BORROWER" ? "borrower" : `co-applicant ${partyNo}`
        } customer name.`,
      );
    }

    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
      return setNotice("❌ Enter a valid PAN number.");
    }

    try {
      setLoading(true);

      const response = await api.post(`${API}/pan/verify`, {
        lan,
        applicantType,
        partyNo,
        panNumber,
        customerName,
      });

      const profile = response.data.data;

      if (applicantType === "BORROWER") {
        setBasic((previous) => ({
          ...previous,
          panNumber,
          customerName: profile.customerName || customerName,
          firstName: profile.firstName || "",
          lastName: profile.lastName || "",
        }));

        setBorrowerPanVerified(true);
      } else {
        setCoApplicants((previous) =>
          previous.map((item) =>
            item.partyNo === partyNo
              ? {
                  ...item,
                  panNumber,
                  customerName: profile.customerName || customerName,
                  firstName: profile.firstName || "",
                  lastName: profile.lastName || "",
                  panVerified: true,
                  saved: false,
                }
              : item,
          ),
        );
      }

      setNotice(
        `✅ ${
          applicantType === "BORROWER" ? "Borrower" : `Co-applicant ${partyNo}`
        } PAN and customer name verified.`,
      );
    } catch (error) {
      setNotice(`❌ ${getError(error, "PAN verification failed")}`);
    } finally {
      setLoading(false);
    }
  };

  const triggerAadhaar = async (applicantType, partyNo = 1) => {
    try {
      setLoading(true);
      const response = await api.post(`${API}/aadhaar/init`, {
        lan,
        applicantType,
        partyNo,
      });
      if (applicantType === "BORROWER")
        setBorrowerAadhaarStatus(response.data.status || "INITIATED");
      else
        updateCoApplicant(
          partyNo,
          "aadhaarStatus",
          response.data.status || "INITIATED",
        );
      if (response.data.kycUrl)
        window.open(response.data.kycUrl, "_blank", "noopener,noreferrer");
      setNotice(`✅ ${response.data.message}`);
    } catch (error) {
      setNotice(`❌ ${getError(error, "Aadhaar initiation failed")}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchAadhaarAddress = async (applicantType, partyNo = 1) => {
    try {
      setLoading(true);
      const response = await api.get(
        `${API}/aadhaar/address/${lan}/${applicantType}/${partyNo}`,
      );
      const fetched = response.data.address || {};
      if (applicantType === "BORROWER") {
        setAddress((previous) => ({
          ...previous,
          permanentAddressLine1:
            fetched.addressLine1 || previous.permanentAddressLine1,
          permanentAddressLine2:
            fetched.addressLine2 || previous.permanentAddressLine2,
          permanentCity: fetched.city || previous.permanentCity,
          permanentDistrict: fetched.district || previous.permanentDistrict,
          permanentState: fetched.state || previous.permanentState,
          permanentPincode: fetched.pincode || previous.permanentPincode,
        }));
        setBorrowerAadhaarStatus("VERIFIED");
      } else {
        setCoApplicants((previous) =>
          previous.map((item) =>
            item.partyNo === partyNo
              ? {
                  ...item,
                  addressLine1: fetched.addressLine1 || item.addressLine1,
                  addressLine2: fetched.addressLine2 || item.addressLine2,
                  city: fetched.city || item.city,
                  district: fetched.district || item.district,
                  state: fetched.state || item.state,
                  pincode: fetched.pincode || item.pincode,
                  aadhaarStatus: "VERIFIED",
                  saved: false,
                }
              : item,
          ),
        );
      }
      setNotice("✅ Verified Aadhaar address fetched and filled.");
    } catch (error) {
      setNotice(
        `❌ ${getError(error, "Aadhaar address is not available yet")}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const copyPermanentToCurrent = (checked) => {
    setAddress((previous) =>
      checked
        ? {
            ...previous,
            currentAddressLine1: previous.permanentAddressLine1,
            currentAddressLine2: previous.permanentAddressLine2,
            currentCity: previous.permanentCity,
            currentDistrict: previous.permanentDistrict,
            currentState: previous.permanentState,
            currentPincode: previous.permanentPincode,
            currentSameAsPermanent: true,
          }
        : { ...previous, currentSameAsPermanent: false },
    );
  };

  const saveBasic = async () => {
    if (!borrowerMobileVerified || !lan)
      throw new Error("Verify borrower mobile first.");
    if (!borrowerPanVerified)
      throw new Error("Verify and fetch borrower PAN first.");
    await api.patch(`${API}/loan-booking/${lan}/basic-details`, basic);
  };

  const saveAddress = async () =>
    api.patch(`${API}/loan-booking/${lan}/address`, address);
  const saveLoan = async () => {
    const response = await api.patch(
      `${API}/loan-booking/${lan}/loan-details`,
      loan,
    );

    setBorrowerPreBreStatus(response.data.borrowerPreBreStatus || "PENDING");

    setBorrowerPreBreResult(response.data.preBreDecision || null);

    if (response.data.status) {
      setCaseStatus(response.data.status);
    }

    return response;
  };

  const saveCoApplicant = async (partyNo) => {
    const item = coApplicants.find(
      (candidate) => candidate.partyNo === partyNo,
    );
    if (!item.mobileVerified)
      throw new Error(`Verify co-applicant ${partyNo} mobile first.`);
    if (!item.panVerified)
      throw new Error(`Verify co-applicant ${partyNo} PAN first.`);
    await api.patch(`${API}/loan-booking/${lan}/co-applicants/${partyNo}`, {
      gender: item.gender,
      dob: item.dob,
      email: item.email,
      addressLine1: item.addressLine1,
      addressLine2: item.addressLine2,
      city: item.city,
      district: item.district,
      state: item.state,
      pincode: item.pincode,
    });
    setCoApplicants((previous) =>
      previous.map((candidate) =>
        candidate.partyNo === partyNo
          ? { ...candidate, saved: true }
          : candidate,
      ),
    );
  };

  const addCoApplicant = () => {
    if (coApplicants.length >= 4) return;
    const used = new Set(coApplicants.map((item) => item.partyNo));
    const partyNo = [1, 2, 3, 4].find((number) => !used.has(number));
    setCoApplicants((previous) =>
      [...previous, createCoApplicant(partyNo)].sort(
        (a, b) => a.partyNo - b.partyNo,
      ),
    );
  };

  const removeCoApplicant = async (partyNo) => {
    const item = coApplicants.find(
      (candidate) => candidate.partyNo === partyNo,
    );
    if (!window.confirm(`Remove co-applicant ${partyNo}?`)) return;
    try {
      setLoading(true);
      if (item.mobileVerified)
        await api.delete(`${API}/loan-booking/${lan}/co-applicants/${partyNo}`);
      setCoApplicants((previous) =>
        previous.filter((candidate) => candidate.partyNo !== partyNo),
      );
      setNotice(`✅ Co-applicant ${partyNo} removed.`);
    } catch (error) {
      setNotice(`❌ ${getError(error, "Unable to remove co-applicant")}`);
    } finally {
      setLoading(false);
    }
  };

  const saveAndNext = async () => {
    try {
      setLoading(true);

      let sectionResponse = null;

      if (activeSection === 0) {
        await saveBasic();
      }

      if (activeSection === 1) {
        await saveAddress();
      }

      if (activeSection === 2) {
        sectionResponse = await saveLoan();
      }

      if (activeSection === 3) {
        for (const item of coApplicants) {
          if (!item.saved) {
            await saveCoApplicant(item.partyNo);
          }
        }
      }

      setActiveSection((previous) =>
        Math.min(previous + 1, sections.length - 1),
      );

      if (
        activeSection === 2 &&
        sectionResponse?.data?.borrowerPreBreStatus === "REJECTED"
      ) {
        setNotice(
          "⚠️ Loan details saved. Pre-BRE requires credit-team deviation, but you can continue the journey.",
        );
      } else if (
        activeSection === 2 &&
        sectionResponse?.data?.borrowerPreBreStatus === "ERROR"
      ) {
        setNotice(
          "⚠️ Loan details saved. Pre-BRE could not be completed, but you can continue and retry it later.",
        );
      } else if (activeSection === 2 && sectionResponse?.data?.bureauReused) {
        setNotice(
          "✅ Loan details saved. The previously verified bureau report was reused.",
        );
      } else {
        setNotice(`✅ ${sections[activeSection]} saved.`);
      }
    } catch (error) {
      const payload = error.response?.data;

      if (payload?.preBreDecision) {
        setBorrowerPreBreResult(payload.preBreDecision);
      }

      if (payload?.borrowerPreBreStatus) {
        setBorrowerPreBreStatus(payload.borrowerPreBreStatus);
      }

      if (payload?.status) {
        setCaseStatus(payload.status);
      }

      setNotice(
        `❌ ${getError(error, error.message || "Unable to save this section")}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const submitCase = async () => {
    try {
      setLoading(true);
      const bankResponse = await api.patch(
        `${API}/loan-booking/${lan}/bank-details`,
        bank,
      );
      setCaseStatus(bankResponse.data.status || "Login");
      setNotice("✅ Bank details saved. Running final BRE...");
      const response = await api.post(
        `${API}/loan-booking/${lan}/final-submit`,
      );
      setCaseStatus(response.data.status);
      setBreResult(response.data.breDecision);
      setNotice(
        `${response.data.status === "Approved" ? "✅" : "❌"} ${response.data.message}`,
      );
    } catch (error) {
      const serverStatus = error.response?.data?.status;
      if (serverStatus) setCaseStatus(serverStatus);
      setNotice(`❌ ${getError(error, "Case submission or BRE failed")}`);
    } finally {
      setLoading(false);
    }
  };

  const renderBasic = () => (
    <div className="ccb-grid">
      <Field
        label="Login Date"
        type="date"
        value={basic.loginDate}
        onChange={(value) => updateBasic("loginDate", value)}
        required
      />
      <div className="ccb-inline-field">
        <Field
          label="Mobile Number"
          value={basic.mobileNumber}
          onChange={(value) =>
            updateBasic("mobileNumber", value.replace(/\D/g, ""))
          }
          readOnly={borrowerMobileVerified}
          maxLength={10}
          required
        />
        <button
          type="button"
          className="ccb-secondary"
          disabled={loading || borrowerMobileVerified}
          onClick={() =>
            openOtp({
              applicantType: "BORROWER",
              partyNo: 1,
              mobile: basic.mobileNumber,
            })
          }
        >
          {borrowerMobileVerified ? "Verified ✓" : "Send OTP"}
        </button>
      </div>
      <Field
        label="Customer Name (As Per PAN)"
        value={basic.customerName}
        onChange={(value) => {
          setBasic((previous) => ({
            ...previous,
            customerName: value,
            firstName: "",
            lastName: "",
          }));

          setBorrowerPanVerified(false);
        }}
        readOnly={!borrowerMobileVerified || borrowerPanVerified}
        required
      />

      <div className="ccb-inline-field">
        <Field
          label="PAN Number"
          value={basic.panNumber}
          onChange={(value) => {
            setBasic((previous) => ({
              ...previous,
              panNumber: value.toUpperCase(),
              firstName: "",
              lastName: "",
            }));

            setBorrowerPanVerified(false);
          }}
          readOnly={!borrowerMobileVerified || borrowerPanVerified}
          maxLength={10}
          required
        />

        <button
          type="button"
          className="ccb-secondary"
          disabled={
            loading ||
            !borrowerMobileVerified ||
            borrowerPanVerified ||
            !basic.customerName.trim() ||
            basic.panNumber.trim().length !== 10
          }
          onClick={() => verifyPan("BORROWER", 1)}
        >
          {borrowerPanVerified ? "PAN Verified ✓" : "Verify & Fetch"}
        </button>
      </div>

      <Field
        label="First Name"
        value={basic.firstName}
        onChange={() => {}}
        readOnly
        required
      />

      <Field
        label="Last Name"
        value={basic.lastName}
        onChange={() => {}}
        readOnly
        required
      />
      <SelectField
        label="Gender"
        value={basic.gender}
        onChange={(value) => updateBasic("gender", value)}
        required
        options={[
          { value: "MALE", label: "Male" },
          { value: "FEMALE", label: "Female" },
          { value: "OTHER", label: "Other" },
        ]}
      />
      <Field
        label="Borrower DOB"
        type="date"
        value={basic.borrowerDob}
        onChange={(value) => updateBasic("borrowerDob", value)}
        required
      />
      <Field
        label="Father Name"
        value={basic.fatherName}
        onChange={(value) => updateBasic("fatherName", value)}
        required
      />
      <Field
        label="Email"
        type="email"
        value={basic.email}
        onChange={(value) => updateBasic("email", value)}
        required
      />
    </div>
  );

  const renderAddressFields = (prefix, title) => (
    <div className="ccb-address-block">
      <h3>{title}</h3>
      <div className="ccb-grid">
        <Field
          label="Address Line 1"
          value={address[`${prefix}AddressLine1`]}
          onChange={(value) => updateAddress(`${prefix}AddressLine1`, value)}
          required
        />
        <Field
          label="Address Line 2"
          value={address[`${prefix}AddressLine2`]}
          onChange={(value) => updateAddress(`${prefix}AddressLine2`, value)}
        />
        <Field
          label="City"
          value={address[`${prefix}City`]}
          onChange={(value) => updateAddress(`${prefix}City`, value)}
          required
        />
        <Field
          label="District"
          value={address[`${prefix}District`]}
          onChange={(value) => updateAddress(`${prefix}District`, value)}
          required
        />
        <Field
          label="State"
          value={address[`${prefix}State`]}
          onChange={(value) => updateAddress(`${prefix}State`, value)}
          required
        />
        <Field
          label="Pincode"
          value={address[`${prefix}Pincode`]}
          onChange={(value) =>
            updateAddress(`${prefix}Pincode`, value.replace(/\D/g, ""))
          }
          maxLength={6}
          required
        />
      </div>
    </div>
  );

  const renderAddress = () => (
    <>
      <div className="ccb-action-row">
        <button
          type="button"
          className="ccb-secondary"
          disabled={loading || !lan || borrowerAadhaarStatus === "VERIFIED"}
          onClick={() => triggerAadhaar("BORROWER", 1)}
        >
          {borrowerAadhaarStatus === "INITIATED"
            ? "Aadhaar Initiated ✓"
            : borrowerAadhaarStatus === "VERIFIED"
              ? "Aadhaar Verified ✓"
              : "Trigger Aadhaar"}
        </button>
        <button
          type="button"
          className="ccb-secondary"
          disabled={loading || !lan}
          onClick={() => fetchAadhaarAddress("BORROWER", 1)}
        >
          Fetch Aadhaar Address
        </button>
        <StatusBadge value={borrowerAadhaarStatus} />
      </div>
      {renderAddressFields("permanent", "Permanent Address")}
      <label className="ccb-checkbox">
        <input
          type="checkbox"
          checked={address.currentSameAsPermanent}
          onChange={(event) => copyPermanentToCurrent(event.target.checked)}
        />
        Current address is the same as permanent address
      </label>
      {renderAddressFields("current", "Current Address")}
    </>
  );

  const renderLoan = () => (
    <div className="ccb-grid">
      <Field
        label="Loan Amount"
        type="number"
        value={loan.loanAmount}
        onChange={(value) => updateLoan("loanAmount", value)}
        required
      />
      <Field
        label="Interest Rate (%)"
        type="number"
        value={loan.interestRate}
        onChange={(value) => updateLoan("interestRate", value)}
        required
      />
      <Field
        label="Tenure (days)"
        type="number"
        value={loan.tenure}
        onChange={(value) => updateLoan("tenure", value)}
        min="1"
        max="90"
        step="1"
        required
      />
      <Field
        label="Processing Fee"
        type="number"
        value={loan.processingFee}
        onChange={(value) => updateLoan("processingFee", value)}
        required
      />
      <div className="ccb-inline-field">
        <Field
          label="Disbursal Amount"
          type="number"
          value={loan.disbursalAmount}
          onChange={(value) => updateLoan("disbursalAmount", value)}
          required
        />
        <button
          type="button"
          className="ccb-secondary"
          onClick={() =>
            updateLoan(
              "disbursalAmount",
              Math.max(
                0,
                Number(loan.loanAmount || 0) - Number(loan.processingFee || 0),
              ).toFixed(2),
            )
          }
        >
          Calculate
        </button>
      </div>
      <div className="ccb-info-card">
        Borrower pre-BRE runs when the loan details are saved. A failed pre-BRE
        does not block the journey and can be considered for credit-team
        deviation. Final BRE runs after bank details and case submission.
      </div>
    </div>
  );

  const renderCoApplicant = (item) => (
    <div className="ccb-coapp-card" key={item.partyNo}>
      <div className="ccb-card-heading">
        <div>
          <h3>Co-Applicant {item.partyNo}</h3>
          <span>Party No. {item.partyNo}</span>
        </div>
        <button
          type="button"
          className="ccb-danger-link"
          disabled={loading}
          onClick={() => removeCoApplicant(item.partyNo)}
        >
          Remove
        </button>
      </div>
      <div className="ccb-grid">
        <div className="ccb-inline-field">
          <Field
            label="Mobile Number"
            value={item.mobileNumber}
            onChange={(value) =>
              updateCoApplicant(
                item.partyNo,
                "mobileNumber",
                value.replace(/\D/g, ""),
              )
            }
            readOnly={item.mobileVerified}
            maxLength={10}
            required
          />
          <button
            type="button"
            className="ccb-secondary"
            disabled={loading || item.mobileVerified}
            onClick={() =>
              openOtp({
                applicantType: "CO_APPLICANT",
                partyNo: item.partyNo,
                mobile: item.mobileNumber,
              })
            }
          >
            {item.mobileVerified ? "Verified ✓" : "Send OTP"}
          </button>
        </div>
        <Field
          label="Customer Name (As Per PAN)"
          value={item.customerName}
          onChange={(value) => {
            setCoApplicants((previous) =>
              previous.map((candidate) =>
                candidate.partyNo === item.partyNo
                  ? {
                      ...candidate,
                      customerName: value,
                      firstName: "",
                      lastName: "",
                      panVerified: false,
                      saved: false,
                    }
                  : candidate,
              ),
            );
          }}
          readOnly={!item.mobileVerified || item.panVerified}
          required
        />

        <div className="ccb-inline-field">
          <Field
            label="PAN Number"
            value={item.panNumber}
            onChange={(value) => {
              setCoApplicants((previous) =>
                previous.map((candidate) =>
                  candidate.partyNo === item.partyNo
                    ? {
                        ...candidate,
                        panNumber: value.toUpperCase(),
                        firstName: "",
                        lastName: "",
                        panVerified: false,
                        saved: false,
                      }
                    : candidate,
                ),
              );
            }}
            readOnly={!item.mobileVerified || item.panVerified}
            maxLength={10}
            required
          />

          <button
            type="button"
            className="ccb-secondary"
            disabled={
              loading ||
              !item.mobileVerified ||
              item.panVerified ||
              !item.customerName.trim() ||
              item.panNumber.trim().length !== 10
            }
            onClick={() => verifyPan("CO_APPLICANT", item.partyNo)}
          >
            {item.panVerified ? "PAN Verified ✓" : "Verify & Fetch"}
          </button>
        </div>

        <Field
          label="First Name"
          value={item.firstName}
          onChange={() => {}}
          readOnly
          required
        />

        <Field
          label="Last Name"
          value={item.lastName}
          onChange={() => {}}
          readOnly
          required
        />
        <SelectField
          label="Gender"
          value={item.gender}
          onChange={(value) => updateCoApplicant(item.partyNo, "gender", value)}
          required
          options={[
            { value: "MALE", label: "Male" },
            { value: "FEMALE", label: "Female" },
            { value: "OTHER", label: "Other" },
          ]}
        />
        <Field
          label="Co-Applicant DOB"
          type="date"
          value={item.dob}
          onChange={(value) => updateCoApplicant(item.partyNo, "dob", value)}
          required
        />
        <Field
          label="Email"
          type="email"
          value={item.email}
          onChange={(value) => updateCoApplicant(item.partyNo, "email", value)}
          required
        />
        <Field
          label="Address Line 1"
          value={item.addressLine1}
          onChange={(value) =>
            updateCoApplicant(item.partyNo, "addressLine1", value)
          }
          required
        />
        <Field
          label="Address Line 2"
          value={item.addressLine2}
          onChange={(value) =>
            updateCoApplicant(item.partyNo, "addressLine2", value)
          }
        />
        <Field
          label="City"
          value={item.city}
          onChange={(value) => updateCoApplicant(item.partyNo, "city", value)}
          required
        />
        <Field
          label="District"
          value={item.district}
          onChange={(value) =>
            updateCoApplicant(item.partyNo, "district", value)
          }
          required
        />
        <Field
          label="State"
          value={item.state}
          onChange={(value) => updateCoApplicant(item.partyNo, "state", value)}
          required
        />
        <Field
          label="Pincode"
          value={item.pincode}
          onChange={(value) =>
            updateCoApplicant(item.partyNo, "pincode", value.replace(/\D/g, ""))
          }
          maxLength={6}
          required
        />
      </div>
      <div className="ccb-action-row">
        <button
          type="button"
          className="ccb-secondary"
          disabled={loading || !item.mobileVerified || !item.panVerified}
          onClick={async () => {
            try {
              setLoading(true);
              await saveCoApplicant(item.partyNo);
              setNotice(`✅ Co-applicant ${item.partyNo} saved.`);
            } catch (error) {
              setNotice(`❌ ${getError(error, error.message)}`);
            } finally {
              setLoading(false);
            }
          }}
        >
          Save Co-Applicant
        </button>
        <button
          type="button"
          className="ccb-secondary"
          disabled={
            loading ||
            !item.mobileVerified ||
            !item.panVerified ||
            item.aadhaarStatus === "VERIFIED"
          }
          onClick={() => triggerAadhaar("CO_APPLICANT", item.partyNo)}
        >
          {item.aadhaarStatus === "INITIATED"
            ? "Aadhaar Initiated ✓"
            : item.aadhaarStatus === "VERIFIED"
              ? "Aadhaar Verified ✓"
              : "Trigger Aadhaar"}
        </button>
        <button
          type="button"
          className="ccb-secondary"
          disabled={loading || !item.mobileVerified}
          onClick={() => fetchAadhaarAddress("CO_APPLICANT", item.partyNo)}
        >
          Fetch Aadhaar Address
        </button>
        <StatusBadge value={item.aadhaarStatus} />
      </div>
    </div>
  );

  const renderCoApplicants = () => (
    <>
      <div className="ccb-section-intro">
        <div>
          <h3>Co-Applicants</h3>
          <p>
            Optional. Add up to four co-applicants. Each person has a separate
            OTP and KYC party row.
          </p>
        </div>
        <button
          type="button"
          className="ccb-primary"
          disabled={loading || coApplicants.length >= 4}
          onClick={addCoApplicant}
        >
          + Add Co-Applicant
        </button>
      </div>
      {!coApplicants.length && (
        <div className="ccb-empty">
          No co-applicant added. You can continue with the borrower only.
        </div>
      )}
      {coApplicants.map(renderCoApplicant)}
    </>
  );

  const renderBank = () => (
    <>
      <div className="ccb-grid">
        <Field
          label="Customer Name as per Bank"
          value={bank.accountHolderName}
          onChange={(value) => updateBank("accountHolderName", value)}
          required
        />
        <Field
          label="Bank Name"
          value={bank.bankName}
          onChange={(value) => updateBank("bankName", value)}
          required
        />
        <Field
          label="Account Number"
          value={bank.accountNumber}
          onChange={(value) =>
            updateBank("accountNumber", value.replace(/\D/g, ""))
          }
          required
        />
        <Field
          label="IFSC Code"
          value={bank.ifscCode}
          onChange={(value) => updateBank("ifscCode", value.toUpperCase())}
          maxLength={11}
          required
        />
        <Field
          label="Branch Address"
          value={bank.branchAddress}
          onChange={(value) => updateBank("branchAddress", value)}
          required
        />
      </div>
      <div className="ccb-bre-note">
        <strong>Final checks on submit</strong>
        <span>
          Borrower + every added co-applicant: PAN verified, Aadhaar verified,
          bureau score, DPD and 30-day enquiries.
        </span>
      </div>
    </>
  );

  return (
    <div className="ccb-page">
      <div className="ccb-header">
        <div>
          <span className="ccb-eyebrow">New Product</span>
          <h1>ClaimCureBuddy Loan Booking</h1>
          <p>
            Mobile verification creates the LAN. Final BRE runs after bank
            submission.
          </p>
        </div>
        <div className="ccb-case-meta">
          <div>
            <span>LAN</span>
            <strong>{lan || "Not generated"}</strong>
          </div>
          <div>
            <span>Partner Loan ID</span>
            <strong>{partnerLoanId || "—"}</strong>
          </div>
          <StatusBadge value={caseStatus} />
        </div>
      </div>

      {message && (
        <div
          className={`ccb-message ${message.startsWith("❌") ? "ccb-message-error" : ""}`}
        >
          {message}
        </div>
      )}

      <div className="ccb-tabs">
        {sections.map((section, index) => (
          <button
            type="button"
            key={section}
            className={activeSection === index ? "active" : ""}
            disabled={index > 0 && !lan}
            onClick={() => setActiveSection(index)}
          >
            <span>{index + 1}</span>
            {section}
          </button>
        ))}
      </div>

      <section className="ccb-panel">
        <div className="ccb-panel-title">
          <span>
            Step {activeSection + 1} of {sections.length}
          </span>
          <h2>{sections[activeSection]}</h2>
        </div>
        {loading && <div className="ccb-loading">Processing…</div>}
        {activeSection === 0 && renderBasic()}
        {activeSection === 1 && renderAddress()}
        {activeSection === 2 && renderLoan()}
        {activeSection === 2 && borrowerPreBreStatus !== "PENDING" && (
          <div
            className={`ccb-decision ${
              borrowerPreBreStatus === "APPROVED" ? "approved" : "rejected"
            }`}
          >
            <h3>Borrower Pre-BRE: {borrowerPreBreStatus}</h3>

            {borrowerPreBreResult?.bureauReused && (
              <p>The previously verified bureau report was reused.</p>
            )}

            {borrowerPreBreResult?.reasons?.length ? (
              <>
                <p>
                  You can continue the journey. Credit-team deviation may be
                  required.
                </p>

                <ul>
                  {borrowerPreBreResult.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </>
            ) : borrowerPreBreStatus === "ERROR" ? (
              <p>
                The bureau check could not be completed. You can continue and
                retry it later.
              </p>
            ) : (
              <p>All configured borrower pre-BRE checks passed.</p>
            )}
          </div>
        )}
        {activeSection === 3 && renderCoApplicants()}
        {activeSection === 4 && renderBank()}

        {breResult && (
          <div
            className={`ccb-decision ${caseStatus === "Approved" ? "approved" : "rejected"}`}
          >
            <h3>BRE Decision: {caseStatus}</h3>
            {breResult.reasons?.length ? (
              <ul>
                {breResult.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p>All configured checks passed.</p>
            )}
          </div>
        )}

        <div className="ccb-navigation">
          <button
            type="button"
            className="ccb-secondary"
            disabled={loading || activeSection === 0}
            onClick={() => setActiveSection((previous) => previous - 1)}
          >
            ← Back
          </button>
          {activeSection < sections.length - 1 ? (
            <button
              type="button"
              className="ccb-primary"
              disabled={loading || isTerminal}
              onClick={saveAndNext}
            >
              Save & Next →
            </button>
          ) : (
            <button
              type="button"
              className="ccb-primary ccb-submit"
              disabled={loading || isTerminal || !lan}
              onClick={submitCase}
            >
              {isTerminal
                ? `Case ${caseStatus}`
                : "Submit Case & Run Final BRE"}
            </button>
          )}
        </div>
      </section>

      {otpDialog.open && (
        <div className="ccb-modal-backdrop">
          <div className="ccb-modal">
            <h2>Verify Mobile OTP</h2>
            <p>
              OTP sent to ******{otpDialog.mobile.slice(-4)} for{" "}
              {otpDialog.applicantType === "BORROWER"
                ? "Borrower"
                : `Co-Applicant ${otpDialog.partyNo}`}
              .
            </p>
            <Field
              label="6-digit OTP"
              value={otpDialog.otp}
              onChange={(value) =>
                setOtpDialog((previous) => ({
                  ...previous,
                  otp: value.replace(/\D/g, ""),
                }))
              }
              maxLength={6}
              required
            />
            <label className="ccb-consent">
              <input
                type="checkbox"
                checked={otpDialog.consent}
                onChange={(event) =>
                  setOtpDialog((previous) => ({
                    ...previous,
                    consent: event.target.checked,
                  }))
                }
              />
              <span>{CONSENT_TEXT}</span>
            </label>
            <div className="ccb-modal-actions">
              <button
                type="button"
                className="ccb-secondary"
                disabled={loading}
                onClick={() =>
                  setOtpDialog((previous) => ({ ...previous, open: false }))
                }
              >
                Cancel
              </button>
              <button
                type="button"
                className="ccb-primary"
                disabled={loading || !otpDialog.consent}
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
