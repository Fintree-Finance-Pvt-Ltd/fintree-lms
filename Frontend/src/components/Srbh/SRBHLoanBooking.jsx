import React, { useState, useEffect } from "react";
import api from "../../api/api";
import axios from "axios";
import { useSearchParams } from "react-router-dom";

const createEmptyBureauResult = () => ({
  status: "",
  reason: "",
  reasons: [],
  checked: false,
  canContinue: false,
  bureauScore: null,
  isNtc: false,
  facts: null,
});

const createEmptyBreResult = () => ({
  status: "",
  reason: "",
  reasons: [],
  checked: false,
  code: "",
  validationStatuses: null,
  incompleteValidations: [],
});

const toReasonList = (reasons, reason) => {
  if (Array.isArray(reasons)) return reasons.filter(Boolean);
  if (!reason || reason === "ELIGIBLE") return [];

  return String(reason)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const SRBHLoanBooking = ({ lenderType = "SRBH", apiPrefix = "srbh",title="SRBH Manual Entry"
 }) => {
  const [searchParams] = useSearchParams();
const resumeLan = searchParams.get("lan");
  const today = new Date().toISOString().split("T")[0];
  const [formData, setFormData] = useState({
    lenderType: "EV Loan",
    lender: "SRBH",
    product: "Monthly Loan",
    status: "Login",

    LOGIN_DATE: today,
    First_Name: "",
    Last_Name: "",
    Customer_Name: "",
    Gender: "",
    Borrower_DOB: "",
    Father_Name: "",
    Address_Line_1: "",
    Address_Line_2: "",
    Village: "",
    District: "",
    State: "",
    Pincode: "",
    Mobile_Number: "",
    Email: "",
    Pan_Card: "",
    Driving_Licence: "",

    Loan_Amount: "",
    Interest_Rate: "",
    Tenure: "",
    Processing_Fee_Percentage: "",
    Processing_Fee: "",
    Disbursal_Amount: "",
    GPS_Charges: "",

    GURANTOR: "",
    GURANTOR_DOB: "",
    GURANTOR_EMAIL: "",
    GURANTOR_PAN: "",
    GURANTOR_MOBILE: "",
    Relationship_with_Borrower: "",
    GURANTOR_Address_Line_1: "",
    GURANTOR_Address_Line_2: "",
    GURANTOR_Village: "",
    GURANTOR_District: "",
    GURANTOR_State: "",
    GURANTOR_Pincode: "",
    GURANTOR_Driving_Licence: "",

    Co_Applicant: "",
    Co_Applicant_DOB: "",
    Co_Applicant_Email: "",
    Co_Applicant_PAN: "",
    Co_Applicant_Mobile: "",
    Co_Applicant_Address_Line_1: "",
    Co_Applicant_Address_Line_2: "",
    Co_Applicant_Village: "",
    Co_Applicant_District: "",
    Co_Applicant_State: "",
    Co_Applicant_Pincode: "",
    Co_Applicant_Driving_Licence: "",

    customer_name_as_per_bank: "",
    customer_bank_name: "",
    customer_account_number: "",
    bank_ifsc_code: "",
    bank_branch_address: "",

    selected_dealer_application_id: "",
    dealer_id: "",
    trade_name: "",
    dealer_name: "",
    dealer_contact: "",
    dealer_email: "",
    gst_no: "",
    pan_number: "",
    dealer_address: "",
    dealer_city: "",
    dealer_state: "",
    dealer_pincode: "",
    bank_name: "",
    account_number: "",
    ifsc: "",
    name_in_bank: "",

    Product_Type: "",
    selected_product_id: "",
    Battery_Name: "",
    Battery_Type: "",
    Battery_Serial_no_1: "",
    Battery_Serial_no_2: "",
    E_Rikshaw_model: "",
    Chassis_no: "",

    insurance_cost: "",
    insurance_company_provider: "",
    insurance_policy_number: "",
    policy_issued_date: "",
    period_of_insurance: "",

    cost_of_vehicle: "",
    manufacturing_year: "",
    downpayment_paid_by_borrower: "",
    vehicle_registration_cost: "",
    sales_invoice_number: "",
    sales_invoice_date: "",
  });

  const [dealers, setDealers] = useState([]);
  const [dealerProducts, setDealerProducts] = useState([]);
  const [errors, setErrors] = useState({});
  const [fieldStatus, setFieldStatus] = useState({}); // Track validation status
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [sectionValid, setSectionValid] = useState(false);
  const [touched, setTouched] = useState({});
  const [showConsentDialog, setShowConsentDialog] = useState(false);

  const [lan, setLan] = useState("");
  const [partnerLoanId, setPartnerLoanId] = useState("");
  const [borrowerSaved, setBorrowerSaved] = useState(false);

  // Borrower bureau screening runs on Loan Details before the journey continues.
  const [bureauResult, setBureauResult] = useState(createEmptyBureauResult);
  const [bureauLoading, setBureauLoading] = useState(false);

  // Final BRE runs synchronously when Vehicle Details is submitted.
  const [breResult, setBreResult] = useState(createEmptyBreResult);
  const [breLoading, setBreLoading] = useState(false);

  const [aadhaarStatus, setAadhaarStatus] = useState({
    BORROWER: "",
    GUARANTOR: "",
    CO_APPLICANT: "",
  });

  const [otp, setOtp] = useState("");

  const [otpLoading, setOtpLoading] = useState(false);

  const [consentChecked, setConsentChecked] = useState(false);

  const [resendTimers, setResendTimers] = useState({
    BORROWER: 0,
    GUARANTOR: 0,
    CO_APPLICANT: 0,
  });

  const [verificationTarget, setVerificationTarget] = useState("");

  const [otpVerified, setOtpVerified] = useState({
    borrower: false,
    guarantor: false,
    coApplicant: false,
  });

  useEffect(() => {
  if (resumeLan) {
    fetchResumeBooking(resumeLan);
  }
}, [resumeLan]);

  const sections = [
    "Borrower Details",
    "Address",
    "Loan Details",
    "Guarantor Details",
    "Co-Applicant Details",
    "Bank Details",
    "Dealer Details",
    "Product Details",
    "Insurance Details",
    "Vehicle Details",
  ];

  const fetchResumeBooking = async (resumeLan) => {
  try {
    setLoading(true);

    const res = await api.get(`${apiPrefix}/loan-booking/${resumeLan}`);

    if (!res.data.success) {
      setMessage("❌ Could not resume booking");
      return;
    }

    const d = res.data.data;

    setLan(d.lan || "");
    setPartnerLoanId(d.partner_loan_id || "");
    setBorrowerSaved(true);

    setFormData((prev) => ({
      ...prev,

      lenderType: d.lender_type || "EV Loan",
      lender: d.lender || "SRBH",
      product: d.product || "Monthly Loan",
      status: d.status || "Login",

      LOGIN_DATE: d.login_date ? String(d.login_date).split("T")[0] : prev.LOGIN_DATE,
      First_Name: d.first_name || "",
      Last_Name: d.last_name || "",
      Customer_Name: d.customer_name || "",
      Borrower_DOB: d.dob ? String(d.dob).split("T")[0] : "",
      Father_Name: d.father_name || "",
      Mobile_Number: d.mobile_number || "",
      Email: d.email || "",
      Pan_Card: d.pan_card || "",
      Gender: d.gender || "",

      Address_Line_1: d.permanent_address_line_1 || "",
      Address_Line_2: d.permanent_address_line_2 || "",
      Village: d.permanent_village_city || "",
      District: d.permanent_district || "",
      State: d.permanent_state || "",
      Pincode: d.permanent_pincode || "",

      Loan_Amount: d.requested_loan_amount || d.loan_amount || "",
      Interest_Rate: d.interest_rate || "",
      Tenure: d.loan_tenure || "",
      Disbursal_Amount: d.disbursal_amount || "",
      Processing_Fee: d.processing_fee || "",
      Processing_Fee_Percentage: d.processing_fee_percentage || "",

      GURANTOR: d.guarantor_name || "",
      GURANTOR_DOB: d.guarantor_dob ? String(d.guarantor_dob).split("T")[0] : "",
      GURANTOR_EMAIL: d.guarantor_email || "",
      GURANTOR_PAN: d.guarantor_pan || "",
      GURANTOR_MOBILE: d.guarantor_mobile || "",
      Relationship_with_Borrower: d.relationship_with_borrower || "",
      GURANTOR_Address_Line_1: d.guarantor_address_line_1 || "",
      GURANTOR_Address_Line_2: d.guarantor_address_line_2 || "",
      GURANTOR_Village: d.guarantor_village_city || "",
      GURANTOR_District: d.guarantor_district || "",
      GURANTOR_State: d.guarantor_state || "",
      GURANTOR_Pincode: d.guarantor_pincode || "",

      Co_Applicant: d.co_applicant_name || "",
      Co_Applicant_DOB: d.co_applicant_dob ? String(d.co_applicant_dob).split("T")[0] : "",
      Co_Applicant_Email: d.co_applicant_email || "",
      Co_Applicant_PAN: d.co_applicant_pan || "",
      Co_Applicant_Mobile: d.co_applicant_mobile || "",
      Co_Applicant_Address_Line_1: d.co_applicant_address_line_1 || "",
      Co_Applicant_Address_Line_2: d.co_applicant_address_line_2 || "",
      Co_Applicant_Village: d.co_applicant_village_city || "",
      Co_Applicant_District: d.co_applicant_district || "",
      Co_Applicant_State: d.co_applicant_state || "",
      Co_Applicant_Pincode: d.co_applicant_pincode || "",

      customer_name_as_per_bank: d.customer_name_as_per_bank || "",
      customer_bank_name: d.customer_bank_name || "",
      customer_account_number: d.customer_account_number || "",
      bank_ifsc_code: d.bank_ifsc_code || "",
      bank_branch_address: d.bank_branch_address || "",

      selected_dealer_application_id: d.selected_dealer_application_id || "",
      dealer_id: d.dealer_id || "",
      trade_name: d.trade_name || "",
      dealer_name: d.dealer_name || "",
      dealer_contact: d.dealer_contact || "",
      dealer_email: d.dealer_email || "",
      gst_no: d.gst_no || "",
      pan_number: d.pan_number || "",
      dealer_address: d.dealer_address || "",
      dealer_city: d.dealer_city || "",
      dealer_state: d.dealer_state || "",
      dealer_pincode: d.dealer_pincode || "",

      bank_name: d.dealer_bank_name || "",
      account_number: d.dealer_account_number || "",
      ifsc: d.dealer_ifsc || "",
      name_in_bank: d.dealer_name_in_bank || "",

      Product_Type: d.product_type || "",
      selected_product_id: d.selected_product_id || "",
      Battery_Name: d.battery_name || "",
      Battery_Type: d.battery_type || "",
      Battery_Serial_no_1: d.battery_serial_no_1 || "",
      Battery_Serial_no_2: d.battery_serial_no_2 || "",
      E_Rikshaw_model: d.e_rikshaw_model || "",
      Chassis_no: d.chassis_no || "",
      Driving_Licence: d.driving_licence || "",
      GPS_Charges: d.gps_charges || "",
      GURANTOR_Driving_Licence: d.guarantor_driving_licence || "",
      Co_Applicant_Driving_Licence: d.co_applicant_driving_licence || "",

      insurance_cost: d.insurance_cost || "",
      insurance_company_provider: d.insurance_company_provider || "",
      insurance_policy_number: d.insurance_policy_number || "",
      policy_issued_date: d.policy_issued_date
        ? String(d.policy_issued_date).split("T")[0]
        : "",
      period_of_insurance: d.period_of_insurance || "",

      cost_of_vehicle: d.cost_of_vehicle || "",
      manufacturing_year: d.manufacturing_year || "",
      downpayment_paid_by_borrower: d.downpayment_paid_by_borrower || "",
      vehicle_registration_cost: d.vehicle_registration_cost || "",
      sales_invoice_number: d.sales_invoice_number || "",
      sales_invoice_date: d.sales_invoice_date
        ? String(d.sales_invoice_date).split("T")[0]
        : "",
    }));

    setOtpVerified({
      borrower: Number(d.borrower_mobile_verified) === 1,
      guarantor: Number(d.guarantor_mobile_verified) === 1,
      coApplicant: Number(d.co_applicant_mobile_verified) === 1,
    });

    const screeningStatus = d.srbh_bureau_screening_status || "";
    const screeningReason = d.srbh_bureau_screening_reason || "";
    const screeningChecked = Boolean(
      screeningStatus || d.srbh_bureau_screening_checked_at,
    );

    setBureauResult({
      status: screeningStatus,
      reason: screeningReason,
      reasons: toReasonList(null, screeningReason),
      checked: screeningChecked,
      canContinue:
        ["BUREAU APPROVED", "BUREAU REJECTED"].includes(
          String(screeningStatus).toUpperCase(),
        ),
      bureauScore:
        d.srbh_bureau_score ??
        d.fintree_cibil_score ??
        d.cibil_score ??
        null,
      isNtc: (() => {
        const score = Number(
          d.srbh_bureau_score ??
            d.fintree_cibil_score ??
            d.cibil_score,
        );

        return Number.isFinite(score) && score >= -1 && score <= 250;
      })(),
      facts: screeningChecked
        ? {
            score:
              d.srbh_bureau_score ??
              d.fintree_cibil_score ??
              d.cibil_score ??
              null,
            enquiries30d: d.srbh_enquiries_30d ?? 0,
            hasDpd3M: Number(d.srbh_dpd_3m_flag) === 1,
            hasDpd6M: Number(d.srbh_dpd_6m_flag) === 1,
            hasOverdue3M: Number(d.srbh_overdue_3m_flag) === 1,
            hasWrittenOff3Y: Number(d.srbh_written_off_3y_flag) === 1,
            has60Plus6M: Number(d.srbh_60plus_6m_flag) === 1,
            has90Plus6M: Number(d.srbh_90plus_6m_flag) === 1,
            emiOverdueAmount: d.srbh_emi_overdue_amount ?? 0,
            ccOverdueAmount: d.srbh_cc_overdue_amount ?? 0,
          }
        : null,
    });

    const finalBreStatus = d.srbh_bre_status || "";
    const finalBreReason = d.srbh_bre_reason || "";

    setBreResult({
      status: finalBreStatus,
      reason: finalBreReason,
      reasons: toReasonList(null, finalBreReason),
      checked: Boolean(finalBreStatus || d.srbh_bre_checked_at),
      code: "",
      validationStatuses: null,
      incompleteValidations: [],
    });

    setMessage(`✅ Resumed booking. LAN: ${d.lan}`);
  } catch (err) {
    setMessage(
      `❌ ${err.response?.data?.message || "Failed to resume booking"}`
    );
  } finally {
    setLoading(false);
  }
};

  const [activeSection, setActiveSection] = useState(0);

  const requiredFields = [
    "First_Name",
    "Last_Name",
    "Gender",
    "Borrower_DOB",
    "Father_Name",
    "Mobile_Number",
    "Address_Line_1",
    "Village",
    "District",
    "State",
    "Pincode",
    "Loan_Amount",
    "Interest_Rate",
    "Tenure",
    "Processing_Fee_Percentage",
    "GPS_Charges",

    "customer_name_as_per_bank",
    "customer_bank_name",
    "customer_account_number",
    "bank_ifsc_code",
    "Pan_Card",
    "Driving_Licence",
    "selected_dealer_application_id",
    "Product_Type",
    "selected_product_id",
    "Battery_Name",
    "Battery_Type",
    "Battery_Serial_no_1",
    "E_Rikshaw_model",
    "Chassis_no",
    "insurance_cost",
    "insurance_company_provider",
    "insurance_policy_number",
    "policy_issued_date",
    "period_of_insurance",
    "manufacturing_year",
    "downpayment_paid_by_borrower",
    "vehicle_registration_cost",
    "sales_invoice_number",
    "sales_invoice_date",
    "cost_of_vehicle",
  ];

  const isValidMobile = (m) => /^[6-9]\d{9}$/.test(m);
  const isValidAadhar = (a) => /^\d{12}$/.test(a);
  const isValidPan = (p) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(p);
  // const isValidIFSC = (i) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(i);
  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  useEffect(() => {
    fetchDealers();
  }, []);

  // useEffect(() => {
  //   if (formData.Pincode.length === 6) {
  //     handlePincodeBlur();
  //   }
  // }, [formData.Pincode]);

  useEffect(() => {
    if (formData.Pincode?.length === 6) {
      handlePincodeLookup(formData.Pincode, "BORROWER");
    }
  }, [formData.Pincode]);

  useEffect(() => {
    if (formData.GURANTOR_Pincode?.length === 6) {
      handlePincodeLookup(formData.GURANTOR_Pincode, "GUARANTOR");
    }
  }, [formData.GURANTOR_Pincode]);

  useEffect(() => {
    if (formData.Co_Applicant_Pincode?.length === 6) {
      handlePincodeLookup(formData.Co_Applicant_Pincode, "CO_APPLICANT");
    }
  }, [formData.Co_Applicant_Pincode]);

  useEffect(() => {
    const sectionErrors = validateSection(activeSection);
    setSectionValid(Object.keys(sectionErrors).length === 0);
  }, [formData, activeSection]);

  const fetchDealers = async () => {
    try {
      const res = await api.get(`${apiPrefix}/dealersforbooking`);
      setDealers(res.data?.dealers || []);
    } catch (err) {
      console.error("Dealer fetch error:", err);
      setMessage("⚠️ Could not fetch dealer list.");
    }
  };

  const CONSENT_TEXT = `
I/We hereby authorise Fintree Finance Private Limited(FFPL)
or its associates/subsidiaries/affiliates to obtain,
verify, exchange, share or part with all the information
regarding my/our residence/contact details and to contact
me/us or my/our family/employer/banker/credit bureau/RBI
or any third parties as deemed necessary.

I/We consent to receive OTP, SMS, Calls, Email and
verification communication related to this loan application.

I/We authorize lender representatives to perform
verification and investigation activities including
residence verification and document verification.

I/We consent to sharing of data with banks, NBFCs,
credit bureaus, CKYC, service providers and regulators
for processing and servicing this loan application.
`;

  const handleDealerSelect = (e) => {
    const applicationId = e.target.value;

    if (breResult.checked) {
      setBreResult(createEmptyBreResult());
    }

    const selectedDealer = dealers.find(
      (dealer) => dealer.application_id === applicationId,
    );

    if (!selectedDealer) return;

    setDealerProducts(selectedDealer.products || []);

    setFormData((prev) => ({
      ...prev,
      selected_dealer_application_id: selectedDealer.application_id || "",
      dealer_id: selectedDealer.dealer_id || "",
      trade_name: selectedDealer.trade_name || "",
      dealer_name:
        selectedDealer.business_name || selectedDealer.owner_name || "",
      dealer_contact: selectedDealer.owner_mobile || "",
      dealer_email: selectedDealer.owner_email || "",
      gst_no: selectedDealer.gst_number || "",
      pan_number: selectedDealer.pan_number || "",
      dealer_address: selectedDealer.showroom_address || "",
      dealer_city: selectedDealer.city || "",
      dealer_state: selectedDealer.state || "",
      dealer_pincode: selectedDealer.pincode || "",
      bank_name: selectedDealer.bank_name || "",
      account_number: selectedDealer.account_number || "",
      ifsc: selectedDealer.ifsc_code || "",
      name_in_bank: selectedDealer.account_holder_name || "",
      selected_product_id: "",
      Battery_Name: "",
      Battery_Type: "",
      E_Rikshaw_model: "",
      Battery_Serial_no_1: "",
      Battery_Serial_no_2: "",
      Chassis_no: "",
    }));

    setTouched((prev) => ({
      ...prev,
      selected_dealer_application_id: true,
    }));

    setFieldStatus((prev) => ({
      ...prev,
      selected_dealer_application_id: "valid",
      selected_product_id: "empty",
    }));

    setErrors((prev) => ({
      ...prev,
      selected_dealer_application_id: "",
      selected_product_id: "",
    }));

    if (errors.selected_dealer_application_id) {
      setErrors((prev) => ({
        ...prev,
        selected_dealer_application_id: "",
      }));
    }
  };
  ///// sajag
  const guarantorFields = [
    "GURANTOR",
    "GURANTOR_DOB",
    "GURANTOR_EMAIL",
    "GURANTOR_PAN",
    "GURANTOR_MOBILE",
    "Relationship_with_Borrower",
    "GURANTOR_Address_Line_1",
    "GURANTOR_Village",
    "GURANTOR_District",
    "GURANTOR_State",
    "GURANTOR_Pincode",
    "GURANTOR_Driving_Licence",
  ];

  const coApplicantFields = [
    "Co_Applicant",
    "Co_Applicant_DOB",
    "Co_Applicant_Email",
    "Co_Applicant_PAN",
    "Co_Applicant_Mobile",
    "Co_Applicant_Address_Line_1",
    "Co_Applicant_Village",
    "Co_Applicant_District",
    "Co_Applicant_State",
    "Co_Applicant_Pincode",
    "Co_Applicant_Driving_Licence",
  ];

  const hasAnyValue = (fields) =>
    fields.some((field) => String(formData[field] || "").trim() !== "");

  const hasGuarantorDetails = () => hasAnyValue(guarantorFields);

  const hasCoApplicantDetails = () => hasAnyValue(coApplicantFields);

  const isGuarantorRequired = () =>
    activeSection === 3 && !hasCoApplicantDetails();

  const isCoApplicantRequired = () =>
    activeSection === 4 && !hasGuarantorDetails();

  // const saveBorrowerFirstSection = async () => {
  //   const sectionErrors = validateSection(0);

  //   if (Object.keys(sectionErrors).length > 0) {
  //     setErrors(sectionErrors);

  //     const newTouched = {};
  //     sectionFields[0].forEach((field) => {
  //       newTouched[field] = true;
  //     });

  //     setTouched((prev) => ({ ...prev, ...newTouched }));
  //     setMessage("❌ Please complete Borrower Details first.");
  //     return false;
  //   }

  //   if (!otpVerified.borrower) {
  //     setMessage("❌ Borrower mobile not verified");
  //     return false;
  //   }

  //   if (borrowerSaved && lan) {
  //     return true;
  //   }

  //   try {
  //     setLoading(true);

  //     const res = await api.post(`${apiPrefix}/save-borrower-first-section`, {
  //       ...formData,
  //       borrower_mobile_verified: 1,
  //     });

  //     if (res.data.success) {
  //       setLan(res.data.lan);
  //       setPartnerLoanId(res.data.partner_loan_id);
  //       setBorrowerSaved(true);
  //       setMessage(`✅ Borrower saved. LAN: ${res.data.lan}`);
  //       return true;
  //     }

  //     return false;
  //   } catch (err) {
  //     setMessage(
  //       `❌ ${
  //         err.response?.data?.message || "Failed to save borrower section"
  //       }`,
  //     );
  //     return false;
  //   } finally {
  //     setLoading(false);
  //   }
  // };
  ////////

  // Run the advisory borrower bureau screening from Loan Details.
  const handleRunBureauScreening = async () => {
    if (!lan) {
      setMessage("❌ Please save borrower details first (complete Borrower section).");
      return false;
    }

    try {
      setBureauLoading(true);
      setMessage("");

      const res = await api.post(`${apiPrefix}/run-bureau-screening`, {
        lan,
        Loan_Amount: formData.Loan_Amount,
        Interest_Rate: formData.Interest_Rate,
        Tenure: formData.Tenure,
        Processing_Fee: formData.Processing_Fee,
        Processing_Fee_Percentage: formData.Processing_Fee_Percentage,
        GPS_Charges: formData.GPS_Charges,
        Disbursal_Amount: formData.Disbursal_Amount,
      });

      if (res.data.success) {
        const status =
          res.data.screeningStatus ||
          res.data.bureauStatus ||
          res.data.breStatus ||
          res.data.status ||
          "";
        const reasons = toReasonList(
          res.data.reasons,
          res.data.screeningReason ||
            res.data.bureauReason ||
            res.data.breReason,
        );
        const reason =
          res.data.screeningReason ||
          res.data.bureauReason ||
          res.data.breReason ||
          reasons.join(", ") ||
          "ELIGIBLE";
        const facts = res.data.bureauFacts || res.data.facts || {};
        const canContinue =
          res.data.canContinue === true ||
          res.data.canContinue === 1 ||
          res.data.canContinue === "1" ||
          ["BUREAU APPROVED", "BUREAU REJECTED"].includes(
            String(status).toUpperCase(),
          );

        setBureauResult({
          status,
          reason,
          reasons,
          checked: true,
          canContinue,
          bureauScore: res.data.bureauScore ?? facts.score ?? null,
          isNtc: Boolean(res.data.isNtc ?? facts.isNtc),
          facts,
        });

        setMessage(
          String(status).toUpperCase() === "BUREAU APPROVED"
            ? "✅ Borrower bureau screening approved. You may continue."
            : String(status).toUpperCase() === "BUREAU REJECTED"
              ? "⚠️ Borrower bureau screening rejected. This is advisory; you may continue to final BRE."
              : "⚠️ Borrower bureau screening is pending. Please retry before continuing.",
        );

        return canContinue;
      }

      setMessage("❌ Bureau screening failed. Please try again.");
      return false;
    } catch (err) {
      setMessage(
        `❌ ${err.response?.data?.message || "Bureau screening failed"}`,
      );
      return false;
    } finally {
      setBureauLoading(false);
    }
  };

const saveBorrowerFirstSection = async () => {
  const sectionErrors = validateSection(activeSection);

  if (Object.keys(sectionErrors).length > 0) {
    setErrors(sectionErrors);

    const newTouched = {};
    sectionFields[activeSection].forEach((field) => {
      newTouched[field] = true;
    });

    setTouched((prev) => ({ ...prev, ...newTouched }));
    setMessage("❌ Please complete current section first.");
    return false;
  }

  if (activeSection === 0 && !otpVerified.borrower) {
    setMessage("❌ Borrower mobile not verified");
    return false;
  }

  try {
    setLoading(true);

    const res = await api.post(`${apiPrefix}/save-borrower-first-section`, {
      activeSection,
      lan,
      partner_loan_id: partnerLoanId,

      ...formData,

      borrower_mobile_verified: otpVerified.borrower ? 1 : 0,
      guarantor_mobile_verified: otpVerified.guarantor ? 1 : 0,
      co_applicant_mobile_verified: otpVerified.coApplicant ? 1 : 0,
    });

    if (res.data.success) {
      if (res.data.lan) {
        setLan(res.data.lan);
      }

      if (res.data.partner_loan_id) {
        setPartnerLoanId(res.data.partner_loan_id);
      }

      if (activeSection === 0) {
        setBorrowerSaved(true);
      }

      setMessage(`✅ ${res.data.message}`);
      return true;
    }

    setMessage("❌ Failed to save section.");
    return false;
  } catch (err) {
    console.error("SAVE ERROR:", err.response?.data || err);

    setMessage(
      `❌ ${
        err.response?.data?.sqlMessage ||
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to save current section"
      }`
    );

    return false;
  } finally {
    setLoading(false);
  }
};
  const sectionFields = {
    0: [
      "LOGIN_DATE",
      "First_Name",
      "Last_Name",
      "Gender",
      "Borrower_DOB",
      "Father_Name",
      "Mobile_Number",
      "Email",
      "Pan_Card",
      "Driving_Licence",
    ],
    1: ["Address_Line_1", "Village", "Pincode", "District", "State"],
    2: [
      "Loan_Amount",
      "Interest_Rate",
      "Tenure",
      "Processing_Fee_Percentage",
      "GPS_Charges",
    ],
    3: guarantorFields,
    4: coApplicantFields,
    5: [
      "customer_name_as_per_bank",
      "customer_bank_name",
      "customer_account_number",
      "bank_ifsc_code",
    ],
    6: ["selected_dealer_application_id"],
    7: [
      "Product_Type",
      "selected_product_id",
      "Battery_Name",
      "Battery_Type",
      "Battery_Serial_no_1",
      "E_Rikshaw_model",
      "Chassis_no",
    ],
    8: [
      "insurance_cost",
      "insurance_company_provider",
      "insurance_policy_number",
      "policy_issued_date",
      "period_of_insurance",
    ],
    9: [
      "cost_of_vehicle",
      "manufacturing_year",
      "downpayment_paid_by_borrower",
      "vehicle_registration_cost",
      "sales_invoice_number",
      "sales_invoice_date",
    ],
  };

  // Real-time validation for individual field
  const validateField = (fieldName, value) => {
    let error = "";

    // Check if required
    if (
      requiredFields.includes(fieldName) &&
      (!value || String(value).trim() === "")
    ) {
      error = "This field is required.";
      return error;
    }

    // Skip format validation if field is empty (unless required)
    if (!value || String(value).trim() === "") {
      return "";
    }

    // Format validations
    switch (fieldName) {
      case "Mobile_Number":
      case "GURANTOR_MOBILE":
      case "Co_Applicant_Mobile":
      case "dealer_contact":
        if (!isValidMobile(value)) {
          error = "Enter valid 10-digit mobile (6-9 xxxxxxxx)";
        }
        break;

      case "Pan_Card":
      case "GURANTOR_PAN":
      case "Co_Applicant_PAN":
        if (!isValidPan(value)) {
          error = "Invalid PAN format (ABCDE1234F)";
        }
        break;
      case "GURANTOR_EMAIL":
      case "Co_Applicant_Email":
      case "Email":
        if (value && !isValidEmail(value)) {
          error = "Invalid email format";
        }
        break;

      case "Loan_Amount":
      case "Interest_Rate":
      case "Tenure":
        if (Number(value) <= 0 || Number.isNaN(Number(value))) {
          error = "Enter a valid number";
        }
        break;

      case "Processing_Fee_Percentage":
        if (Number(value) < 0 || Number(value) > 100) {
          error = "Processing fee percentage must be between 0 and 100";
        }
        break;

      default:
        break;
    }

    return error;
  };

  const validateSection = (sectionIndex) => {
    const fields = sectionFields[sectionIndex];
    const newErrors = {};

    // Guarantor section
    if (sectionIndex === 3) {
      // If guarantor is empty, allow skip to Co-Applicant
      if (!hasGuarantorDetails()) {
        return {};
      }

      // If user started guarantor, all guarantor fields become required
      fields.forEach((field) => {
        if (!formData[field] || String(formData[field]).trim() === "") {
          newErrors[field] = "This field is required.";
          return;
        }

        const error = validateField(field, formData[field]);
        if (error) newErrors[field] = error;
      });

      return newErrors;
    }

    // Co-Applicant section
    if (sectionIndex === 4) {
      // If guarantor is completed, Co-Applicant can be skipped
      if (hasGuarantorDetails()) {
        return {};
      }

      // If guarantor is not filled, Co-Applicant is required
      fields.forEach((field) => {
        if (!formData[field] || String(formData[field]).trim() === "") {
          newErrors[field] = "This field is required.";
          return;
        }

        const error = validateField(field, formData[field]);
        if (error) newErrors[field] = error;
      });

      return newErrors;
    }

    fields.forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) {
        newErrors[field] = error;
      }
    });

    return newErrors;
  };
  const handleProductSelect = (e) => {
    const productId = e.target.value;

    const selectedProduct = dealerProducts.find(
      (product) => String(product.id) === String(productId),
    );

    if (!selectedProduct) return;

    if (breResult.checked) {
      setBreResult(createEmptyBreResult());
    }

    setFormData((prev) => ({
      ...prev,
      selected_product_id: productId,
      Battery_Type: selectedProduct.battery_type || "",
      Battery_Name: selectedProduct.battery_name || "",
      E_Rikshaw_model: selectedProduct.e_rickshaw_model || "",
    }));

    setTouched((prev) => ({
      ...prev,
      selected_product_id: true,
      Battery_Name: true,
      Battery_Type: true,
      E_Rikshaw_model: true,
    }));

    setFieldStatus((prev) => ({
      ...prev,
      selected_product_id: "valid",
      Battery_Name: "valid",
      Battery_Type: "valid",
      E_Rikshaw_model: "valid",
    }));

    setErrors((prev) => ({
      ...prev,
      selected_product_id: "",
      Battery_Name: "",
      Battery_Type: "",
      E_Rikshaw_model: "",
    }));

    if (errors.selected_product_id) {
      setErrors((prev) => ({
        ...prev,
        selected_product_id: "",
      }));
    }
  };

  const isAadhaarButtonDisabled = (type) => {
  return ["INITIATING", "INITIATED", "VERIFIED", "COMPLETED"].includes(
    aadhaarStatus[type]
  );
};

  const handleOpenConsentDialog = async (mobile, type) => {
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      alert("Enter valid mobile number");
      return;
    }

    // RESET MODAL DATA
    setOtp("");

    setConsentChecked(false);

    setVerificationTarget(type);

    setShowConsentDialog(true);

    // ONLY SEND OTP IF TIMER NOT RUNNING
    if (resendTimers[type] === 0) {
      await sendOtp(mobile, type);
    }
  };

  const sendOtp = async (mobile, type) => {
    try {
      setOtpLoading(true);
      const res = await api.post(`${apiPrefix}/send-otp`, {
        mobile,
        applicantType: type,
      });

      if (res.data.success) {
        setResendTimers((prev) => ({
          ...prev,
          [type]: 60,
        }));

        const timer = setInterval(() => {
          setResendTimers((prev) => {
            const current = prev[type];

            if (current <= 1) {
              clearInterval(timer);

              return {
                ...prev,
                [type]: 0,
              };
            }

            return {
              ...prev,
              [type]: current - 1,
            };
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

      let mobile = "";

      if (verificationTarget === "BORROWER") {
        mobile = formData.Mobile_Number;
      }

      if (verificationTarget === "GUARANTOR") {
        mobile = formData.GURANTOR_MOBILE;
      }

      if (verificationTarget === "CO_APPLICANT") {
        mobile = formData.Co_Applicant_Mobile;
      }

      const res = await api.post(`${apiPrefix}/verify-otp`, {
        mobile,
        otp,
        applicantType: verificationTarget,
        consentText: CONSENT_TEXT,
      });

      if (res.data.success) {
        if (verificationTarget === "BORROWER") {
          setOtpVerified((prev) => ({
            ...prev,
            borrower: true,
          }));
        }

        if (verificationTarget === "GUARANTOR") {
          setOtpVerified((prev) => ({
            ...prev,
            guarantor: true,
          }));
        }

        if (verificationTarget === "CO_APPLICANT") {
          setOtpVerified((prev) => ({
            ...prev,
            coApplicant: true,
          }));
        }

        setShowConsentDialog(false);
        setOtp("");

        setConsentChecked(false);
      }
    } catch (err) {
      alert("Invalid OTP");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    const bureauInputFields = new Set([
      ...sectionFields[0],
      ...sectionFields[1],
      ...sectionFields[2],
    ]);

    if (bureauInputFields.has(name) && bureauResult.checked) {
      setBureauResult(createEmptyBureauResult());
    }

    if (breResult.checked) {
      setBreResult(createEmptyBreResult());
    }

    let finalValue = value;

    if (
      name === "Pan_Card" ||
      name === "GURANTOR_PAN" ||
      name === "Co_Applicant_PAN" ||
      name === "bank_ifsc_code"
    ) {
      finalValue = value.toUpperCase();
    }

    if (
        name === "Email" ||
        name === "GURANTOR_EMAIL" ||
        name === "Co_Applicant_Email"
      ) {
        finalValue = value.toLowerCase().replace(/\s/g, "");
      }

      if (
        name === "Pincode" ||
        name === "GURANTOR_Pincode" ||
        name === "Co_Applicant_Pincode"
      ) {
        finalValue = value.replace(/\D/g, "").slice(0, 6);
      }

    setFormData((prev) => {
      const updated = {
        ...prev,
        [name]: finalValue,
      };

      // Combine first name + last name into customer name
      if (name === "First_Name" || name === "Last_Name") {
        const firstName =
          name === "First_Name" ? finalValue : updated.First_Name;

        const lastName = name === "Last_Name" ? finalValue : updated.Last_Name;

        updated.Customer_Name = `${firstName || ""} ${lastName || ""}`
          .replace(/\s+/g, " ")
          .trim();
      }

      // Auto-calculate Processing Fee and Disbursal Amount
      // if (name === "Loan_Amount" || name === "Processing_Fee_Percentage") {
      //   const loanAmount = Number(
      //     name === "Loan_Amount" ? finalValue : updated.Loan_Amount,
      //   );

      //   const processingFeePercentage = Number(
      //     name === "Processing_Fee_Percentage"
      //       ? finalValue
      //       : updated.Processing_Fee_Percentage,
      //   );

      //   if (
      //     !Number.isNaN(loanAmount) &&
      //     !Number.isNaN(processingFeePercentage) &&
      //     loanAmount > 0 &&
      //     processingFeePercentage >= 0
      //   ) {
      //     const processingFee = (loanAmount * processingFeePercentage) / 100;
      //     const disbursalAmount = loanAmount - processingFee;

      //     updated.Processing_Fee = processingFee.toFixed(2);
      //     updated.Disbursal_Amount = disbursalAmount.toFixed(2);
      //   } else {
      //     updated.Processing_Fee = "";
      //     updated.Disbursal_Amount = "";
      //   }
      // }

      // Auto-calculate Processing Fee % and Disbursal Amount
      if (
        name === "Loan_Amount" ||
        name === "Processing_Fee" ||
        name === "GPS_Charges"
      ) {
        const loanAmount = Number(
          name === "Loan_Amount" ? finalValue : updated.Loan_Amount,
        );

        const processingFee = Number(
          name === "Processing_Fee" ? finalValue : updated.Processing_Fee,
        );

        const gpsCharges = Number(
          name === "GPS_Charges" ? finalValue : updated.GPS_Charges,
        );

        if (
          !Number.isNaN(loanAmount) &&
          !Number.isNaN(processingFee) &&
          !Number.isNaN(gpsCharges) &&
          loanAmount > 0 &&
          processingFee >= 0 &&
          gpsCharges >= 0
        ) {
          const processingFeePercentage = (processingFee / loanAmount) * 100;
          const disbursalAmount = loanAmount - processingFee - gpsCharges;

          updated.Processing_Fee_Percentage =
            processingFeePercentage.toFixed(2);
          updated.Disbursal_Amount = disbursalAmount.toFixed(2);
        } else {
          updated.Processing_Fee_Percentage = "";
          updated.Disbursal_Amount = "";
        }
      }

      return updated;
    });

    const error = validateField(name, finalValue);

    setErrors((prev) => ({
      ...prev,
      [name]: error,
    }));

    setTouched((prev) => ({
      ...prev,
      [name]: true,
    }));

    if (!finalValue || String(finalValue).trim() === "") {
      setFieldStatus((prev) => ({
        ...prev,
        [name]: "empty",
      }));
    } else if (error) {
      setFieldStatus((prev) => ({
        ...prev,
        [name]: "invalid",
      }));
    } else {
      setFieldStatus((prev) => ({
        ...prev,
        [name]: "valid",
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    requiredFields.forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) {
        newErrors[field] = error;
      }
    });

    const guarantorFilled = hasGuarantorDetails();
    const coApplicantFilled = hasCoApplicantDetails();

    if (!guarantorFilled && !coApplicantFilled) {
      coApplicantFields.forEach((field) => {
        if (!formData[field] || String(formData[field]).trim() === "") {
          newErrors[field] = "This field is required.";
        }
      });

      setMessage(
        "❌ Please fill either Guarantor Details or Co-Applicant Details.",
      );
    }

    if (guarantorFilled) {
      guarantorFields.forEach((field) => {
        if (!formData[field] || String(formData[field]).trim() === "") {
          newErrors[field] = "This field is required.";
          return;
        }

        const error = validateField(field, formData[field]);
        if (error) newErrors[field] = error;
      });
    }

    if (!guarantorFilled && coApplicantFilled) {
      coApplicantFields.forEach((field) => {
        if (!formData[field] || String(formData[field]).trim() === "") {
          newErrors[field] = "This field is required.";
          return;
        }

        const error = validateField(field, formData[field]);
        if (error) newErrors[field] = error;
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const handleIFSCBlur = async () => {
    const ifsc = formData.bank_ifsc_code?.trim();

    // if (!isValidIFSC(ifsc)) return;

    try {
      const res = await axios.get(`https://ifsc.razorpay.com/${ifsc}`);

      setFormData((prev) => ({
        ...prev,
        customer_bank_name: res.data.BANK || prev.customer_bank_name,
      }));

      setMessage(`✅ IFSC matched: ${res.data.BANK}, ${res.data.BRANCH}`);
    } catch (err) {
      setMessage("⚠️ Invalid IFSC code");
    }
  };

const saveApplicantBeforeAadhaar = async (applicantType) => {
  if (!lan) {
    setMessage("❌ Please save borrower first to generate LAN.");
    return false;
  }

  if (applicantType === "GUARANTOR") {
    const sectionErrors = validateSection(3);

    if (Object.keys(sectionErrors).length > 0) {
      setErrors(sectionErrors);
      setMessage("❌ Please complete guarantor details first.");
      return false;
    }

    if (!otpVerified.guarantor) {
      setMessage("❌ Guarantor mobile not verified.");
      return false;
    }
  }

  if (applicantType === "CO_APPLICANT") {
    const sectionErrors = validateSection(4);

    if (Object.keys(sectionErrors).length > 0) {
      setErrors(sectionErrors);
      setMessage("❌ Please complete co-applicant details first.");
      return false;
    }

    if (!otpVerified.coApplicant) {
      setMessage("❌ Co-applicant mobile not verified.");
      return false;
    }
  }

  if (applicantType === "BORROWER") {
    return true;
  }

  await api.post(`${apiPrefix}/save-applicant-details`, {
    lan,
    applicantType,
    data: {
      ...formData,
      guarantor_mobile_verified: otpVerified.guarantor ? 1 : 0,
      co_applicant_mobile_verified: otpVerified.coApplicant ? 1 : 0,
    },
  });

  return true;
};

const triggerAadhaar = async (applicantType) => {
  if (!lan) {
    setMessage("❌ Please save borrower first to generate LAN.");
    return;
  }

  try {
    const saved = await saveApplicantBeforeAadhaar(applicantType);
    if (!saved) return;

    setAadhaarStatus((prev) => ({
      ...prev,
      [applicantType]: "INITIATING",
    }));

    const res = await api.post(`${apiPrefix}/init-aadhaar`, {
      lan,
      applicantType,
    });

    if (res.data.success) {
      setAadhaarStatus((prev) => ({
        ...prev,
        [applicantType]: "INITIATED",
      }));

      setMessage(`✅ Aadhaar initiated for ${applicantType}`);

      if (res.data.kycUrl) {
        window.open(res.data.kycUrl, "_blank");
      }
    }
  } catch (err) {
    setAadhaarStatus((prev) => ({
      ...prev,
      [applicantType]: "FAILED",
    }));

    setMessage(
      `❌ ${
        err.response?.data?.message || `Aadhaar failed for ${applicantType}`
      }`
    );
  }
};

function parseAadhaarAddress(address = "") {
  const result = {
    addressLine1: "",
    addressLine2: "",
    village: "",
    district: "",
    state: "",
    pincode: "",
  };

  if (!address || typeof address !== "string") {
    return result;
  }

  let cleanAddress = address
    .replace(/\s+/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/^,\s*/g, "")
    .trim();

  // Extract pincode from end or anywhere in address
  const pincodeMatch = cleanAddress.match(/([1-9][0-9]{5})(?!.*[0-9])/);

  if (pincodeMatch) {
    result.pincode = pincodeMatch[1];

    cleanAddress = cleanAddress
      .replace(new RegExp(`[-,\\s]*${result.pincode}\\s*$`), "")
      .trim();
  }

  // Remove trailing hyphen if left after removing pincode
  cleanAddress = cleanAddress.replace(/[-,]\s*$/, "").trim();

  const parts = cleanAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  /*
    Example:
    [
      "Sangam Mitra Mandal Teen Dongri Juna Hanuman Nagar",
      "Mumbai",
      "Maharashtra"
    ]
  */

  if (parts.length >= 1) {
    result.state = parts[parts.length - 1] || "";
  }

  if (parts.length >= 2) {
    result.district = parts[parts.length - 2] || "";
    result.village = parts[parts.length - 2] || "";
  }

  if (parts.length >= 3) {
    result.addressLine1 = parts.slice(0, parts.length - 2).join(", ");
  } else if (parts.length === 2) {
    result.addressLine1 = parts[0];
  } else if (parts.length === 1) {
    result.addressLine1 = parts[0];
  }

  return result;
}

const fetchAndPrefillAadhaarAddress = async (applicantType) => {
  if (!lan) {
    setMessage("❌ Please save borrower first to generate LAN.");
    return;
  }

  try {
    setLoading(true);

    const res = await api.get(
      `${apiPrefix}/aadhaar-address/${lan}/${applicantType}`
    );

    if (!res.data.success) {
      setMessage(`⚠️ ${res.data.message}`);
      return;
    }

    const parsedAddress = parseAadhaarAddress(res.data.aadhaarAddress);

    setFormData((prev) => {
      const updated = { ...prev };

      if (applicantType === "BORROWER") {
        updated.Address_Line_1 =
          parsedAddress.addressLine1 || prev.Address_Line_1;
        updated.Address_Line_2 =
          parsedAddress.addressLine2 || prev.Address_Line_2;
        updated.Village = parsedAddress.village || prev.Village;
        updated.District = parsedAddress.district || prev.District;
        updated.State = parsedAddress.state || prev.State;
        updated.Pincode = parsedAddress.pincode || prev.Pincode;
      }

      if (applicantType === "GUARANTOR") {
        updated.GURANTOR_Address_Line_1 =
          parsedAddress.addressLine1 || prev.GURANTOR_Address_Line_1;
        updated.GURANTOR_Address_Line_2 =
          parsedAddress.addressLine2 || prev.GURANTOR_Address_Line_2;
        updated.GURANTOR_Village =
          parsedAddress.village || prev.GURANTOR_Village;
        updated.GURANTOR_District =
          parsedAddress.district || prev.GURANTOR_District;
        updated.GURANTOR_State =
          parsedAddress.state || prev.GURANTOR_State;
        updated.GURANTOR_Pincode =
          parsedAddress.pincode || prev.GURANTOR_Pincode;
      }

      if (applicantType === "CO_APPLICANT") {
        updated.Co_Applicant_Address_Line_1 =
          parsedAddress.addressLine1 || prev.Co_Applicant_Address_Line_1;
        updated.Co_Applicant_Address_Line_2 =
          parsedAddress.addressLine2 || prev.Co_Applicant_Address_Line_2;
        updated.Co_Applicant_Village =
          parsedAddress.village || prev.Co_Applicant_Village;
        updated.Co_Applicant_District =
          parsedAddress.district || prev.Co_Applicant_District;
        updated.Co_Applicant_State =
          parsedAddress.state || prev.Co_Applicant_State;
        updated.Co_Applicant_Pincode =
          parsedAddress.pincode || prev.Co_Applicant_Pincode;
      }

      return updated;
    });

    setMessage(`✅ Aadhaar address prefilled for ${applicantType}`);
  } catch (err) {
    setMessage(
      `❌ ${
        err.response?.data?.message ||
        "Aadhaar address not available yet. Please fetch after customer completes Aadhaar."
      }`
    );
  } finally {
    setLoading(false);
  }
};

  // const handlePincodeBlur = async () => {
  //   const pin = formData.Pincode?.trim();

  //   if (!pin || pin.length !== 6) return;

  //   try {
  //     const res = await axios.get(
  //       `https://api.postalpincode.in/pincode/${pin}`,
  //     );

  //     const data = res.data[0];

  //     if (data.Status === "Success" && data.PostOffice?.length > 0) {
  //       const office = data.PostOffice[0];

  //       setFormData((prev) => ({
  //         ...prev,
  //         State: office.State || prev.State,
  //         District: office.District || prev.District,
  //       }));

  //       setMessage(`✅ Pincode matched: ${office.District}, ${office.State}`);
  //     } else {
  //       setMessage("⚠️ Invalid or not found pincode.");
  //     }
  //   } catch (err) {
  //     console.error("Error fetching pincode details:", err);
  //     setMessage("⚠️ Could not fetch pincode details. Please fill manually.");
  //   }
  // };

  const handlePincodeLookup = async (pin, type) => {
    const cleanPin = String(pin || "").trim();

    if (!cleanPin || cleanPin.length !== 6) return;

    try {
      const res = await axios.get(
        `https://api.postalpincode.in/pincode/${cleanPin}`,
      );

      const data = res.data[0];

      if (data.Status === "Success" && data.PostOffice?.length > 0) {
        const office = data.PostOffice[0];

        setFormData((prev) => {
          const updated = { ...prev };

          if (type === "BORROWER") {
            updated.State = office.State || prev.State;
            updated.District = office.District || prev.District;
          }

          if (type === "GUARANTOR") {
            updated.GURANTOR_State = office.State || prev.GURANTOR_State;

            updated.GURANTOR_District =
              office.District || prev.GURANTOR_District;
          }

          if (type === "CO_APPLICANT") {
            updated.Co_Applicant_State =
              office.State || prev.Co_Applicant_State;

            updated.Co_Applicant_District =
              office.District || prev.Co_Applicant_District;
          }

          return updated;
        });

        setMessage(`✅ Pincode matched: ${office.District}, ${office.State}`);
      } else {
        setMessage("⚠️ Invalid or not found pincode.");
      }
    } catch (err) {
      console.error("Error fetching pincode details:", err);
      setMessage("⚠️ Could not fetch pincode details. Please fill manually.");
    }
  };
  const renderSelect = (label, name, options = []) => {
    const hasError = errors[name];
    const isValid = fieldStatus[name] === "valid";
    const isTouched = touched[name];

    return (
      <div className="form-group">
        <label>
          {label}{" "}
          {(requiredFields.includes(name) ||
            (activeSection === 3 &&
              hasGuarantorDetails() &&
              guarantorFields.includes(name)) ||
            (activeSection === 4 &&
              !hasGuarantorDetails() &&
              coApplicantFields.includes(name))) && (
            <span className="req">*</span>
          )}
        </label>

        <div className="input-wrapper">
          <select
            name={name}
            value={formData[name] || ""}
            onChange={handleChange}
            className={`styled-input ${
              hasError && isTouched ? "input-error" : ""
            } ${isValid && isTouched ? "input-valid" : ""}`}
            onBlur={() =>
              setTouched((prev) => ({
                ...prev,
                [name]: true,
              }))
            }
          >
            <option value="">Select {label}</option>

            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          {isTouched && (
            <span className="validation-icon">
              {hasError ? (
                <span className="icon-error" title={hasError}>
                  ✕
                </span>
              ) : isValid ? (
                <span className="icon-valid">✓</span>
              ) : null}
            </span>
          )}
        </div>

        {hasError && isTouched && (
          <small className="error-text">{hasError}</small>
        )}

        {isValid && isTouched && !hasError && (
          <small className="success-text">✓ Looks good!</small>
        )}
      </div>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitted(true);
    setMessage("");

    if (!validateForm()) {
      const newTouched = {};

      requiredFields.forEach((field) => {
        newTouched[field] = true;
      });

      setTouched((prev) => ({
        ...prev,
        ...newTouched,
      }));

      setMessage("❌ Please fill all required fields correctly.");
      return;
    }

    setLoading(true);

    if (!otpVerified.borrower) {
      setMessage("Borrower mobile not verified");
      setLoading(false);
      return;
    }

    if (hasGuarantorDetails() && !otpVerified.guarantor) {
      setMessage("Guarantor mobile not verified");
      setLoading(false);
      return;
    }

    if (
      !hasGuarantorDetails() &&
      hasCoApplicantDetails() &&
      !otpVerified.coApplicant
    ) {
      setMessage("Co-applicant mobile not verified");
      setLoading(false);
      return;
    }

    try {
      if (!lan) {
  setMessage("❌ LAN missing. Please save borrower first.");
  setLoading(false);
  return;
}
      setBreLoading(true);

      const res = await api.post(`${apiPrefix}/final-submit-ev-customer-manual`, {
  ...formData,
  lan,
  borrower_mobile_verified: otpVerified.borrower ? 1 : 0,
  guarantor_mobile_verified: otpVerified.guarantor ? 1 : 0,
  co_applicant_mobile_verified: otpVerified.coApplicant ? 1 : 0,
});

      const finalStatus = res.data.breStatus || "";
      const finalReason = res.data.breReason || "";

      if (!finalStatus) {
        throw new Error("Final BRE result was not returned by the server.");
      }

      setBreResult({
        status: finalStatus,
        reason: finalReason,
        reasons: toReasonList(res.data.reasons, finalReason),
        checked: true,
        code: "",
        validationStatuses: res.data.validationStatuses || null,
        incompleteValidations: [],
      });

      setMessage(
        `${finalStatus === "BRE APPROVED" ? "✅" : finalStatus === "BRE REJECTED" ? "❌" : "⚠️"} ${res.data.message || `Final BRE: ${finalStatus}`} | LAN: ${res.data.lan || lan}`,
      );

    } catch (err) {
      const payload = err.response?.data;

      if (payload?.code === "KYC_VALIDATIONS_INCOMPLETE") {
        const pendingReason =
          payload.breReason || "KYC_VALIDATIONS_INCOMPLETE";

        setBreResult({
          status: payload.breStatus || "Pending",
          reason: pendingReason,
          reasons: toReasonList(null, pendingReason),
          checked: true,
          code: payload.code,
          validationStatuses: payload.validationStatuses || null,
          incompleteValidations: Array.isArray(payload.incompleteValidations)
            ? payload.incompleteValidations
            : [],
        });
        setMessage(
          `⚠️ ${payload.message || "Final BRE was not run because required KYC validations are incomplete."}`,
        );
        return;
      }

      setMessage(
        `❌ ${
          payload?.message ||
          err.message ||
          "Something went wrong. Please try again."
        }`,
      );
    } finally {
      setLoading(false);
      setBreLoading(false);
    }
  };

  const renderInput = (label, name, type = "text", readOnly = false) => {
    const hasError = errors[name];
    const isValid = fieldStatus[name] === "valid";
    const isEmpty = fieldStatus[name] === "empty";
    const isTouched = touched[name];

    return (
      <div className="form-group">
        <label>
          {label}{" "}
          {requiredFields.includes(name) && <span className="req">*</span>}
        </label>

        <div className="input-wrapper">
          <input
            type={type}
            name={name}
            value={formData[name] || ""}
            onChange={handleChange}
            onBlur={name === "bank_ifsc_code" ? handleIFSCBlur : undefined}
            placeholder={type === "date" ? "Select date" : `Enter ${label}`}
            className={`styled-input ${
              hasError && isTouched ? "input-error" : ""
            } ${isValid && isTouched ? "input-valid" : ""}`}
            readOnly={readOnly}
          />

          {/* Validation Icons */}
          {isTouched && !readOnly && (
            <span className="validation-icon">
              {hasError ? (
                <span className="icon-error" title={hasError}>
                  ✕
                </span>
              ) : isValid ? (
                <span className="icon-valid">✓</span>
              ) : null}
            </span>
          )}
        </div>

        {/* Error Message */}
        {hasError && isTouched && (
          <small className="error-text">{hasError}</small>
        )}

        {/* Helper Text */}
        {isValid && isTouched && !hasError && (
          <small className="success-text">✓ Looks good!</small>
        )}
      </div>
    );
  };

  const renderDealerSelect = () => {
    const hasError = errors.selected_dealer_application_id;
    const isValid = fieldStatus.selected_dealer_application_id === "valid";
    const isTouched = touched.selected_dealer_application_id;

    return (
      <div className="form-group">
        <label>
          Select Dealer <span className="req">*</span>
        </label>

        <div className="input-wrapper">
          <select
            name="selected_dealer_application_id"
            value={formData.selected_dealer_application_id}
            onChange={handleDealerSelect}
            className={`styled-input ${
              hasError && isTouched ? "input-error" : ""
            } ${isValid && isTouched ? "input-valid" : ""}`}
            onBlur={() =>
              setTouched((prev) => ({
                ...prev,
                selected_dealer_application_id: true,
              }))
            }
          >
            <option value="">Select Dealer</option>

            {dealers.map((dealer) => (
              <option key={dealer.id} value={dealer.application_id}>
                {dealer.business_name || dealer.trade_name || dealer.owner_name}{" "}
                - {dealer.owner_mobile}
              </option>
            ))}
          </select>

          {isTouched && (
            <span className="validation-icon">
              {hasError ? (
                <span className="icon-error">✕</span>
              ) : isValid ? (
                <span className="icon-valid">✓</span>
              ) : null}
            </span>
          )}
        </div>

        {hasError && isTouched && (
          <small className="error-text">{hasError}</small>
        )}
      </div>
    );
  };

  const renderProductSelect = () => {
    const hasError = errors.selected_product_id;
    const isValid = fieldStatus.selected_product_id === "valid";
    const isTouched = touched.selected_product_id;

    return (
      <div className="form-group">
        <label>
          Select Product <span className="req">*</span>
        </label>

        <div className="input-wrapper">
          <select
            name="selected_product_id"
            value={formData.selected_product_id}
            onChange={handleProductSelect}
            className={`styled-input ${
              hasError && isTouched ? "input-error" : ""
            } ${isValid && isTouched ? "input-valid" : ""}`}
            disabled={!formData.selected_dealer_application_id}
            onBlur={() =>
              setTouched((prev) => ({
                ...prev,
                selected_product_id: true,
              }))
            }
          >
            <option value="">
              {formData.selected_dealer_application_id
                ? "Select Product"
                : "Select dealer first"}
            </option>

            {dealerProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.battery_name} - {product.e_rickshaw_model}
              </option>
            ))}
          </select>

          {isTouched && formData.selected_dealer_application_id && (
            <span className="validation-icon">
              {hasError ? (
                <span className="icon-error">✕</span>
              ) : isValid ? (
                <span className="icon-valid">✓</span>
              ) : null}
            </span>
          )}
        </div>

        {hasError && isTouched && (
          <small className="error-text">{hasError}</small>
        )}
      </div>
    );
  };

  const renderBureauScreeningResult = () => {
    if (!bureauResult.checked) return null;

    const facts = bureauResult.facts || {};
    const score = bureauResult.bureauScore ?? facts.score ?? null;
    const hasScore = score !== null && score !== undefined && score !== "";
    const isNtc =
      Boolean(bureauResult.isNtc ?? facts.isNtc) ||
      (hasScore && Number(score) >= -1 && Number(score) <= 250);
    const screeningApproved =
      String(bureauResult.status).toUpperCase() === "BUREAU APPROVED";
    const screeningRejected =
      String(bureauResult.status).toUpperCase() === "BUREAU REJECTED";
    const formatAmount = (value) =>
      value === null || value === undefined || value === ""
        ? "Not available"
        : `₹${Number(value).toLocaleString("en-IN")}`;
    const flagFact = (label, value) => ({
      label,
      value:
        value === null || value === undefined
          ? "Not available"
          : value
            ? "Found"
            : "Clear",
      passed:
        value === null || value === undefined ? null : !value,
    });
    const enquiries = facts.enquiries30d;
    const emiOverdue = facts.emiOverdueAmount;
    const ccOverdue = facts.ccOverdueAmount;
    const factRows = [
      {
        label: "Bureau Score",
        value: hasScore ? score : "Not available",
        passed:
          hasScore
            ? isNtc || Number(score) >= 650
            : null,
      },
      {
        label: "NTC Customer",
        value: hasScore ? (isNtc ? "Yes" : "No") : "Not available",
        passed: hasScore ? true : null,
      },
      {
        label: "Enquiries (Last 30 Days)",
        value:
          enquiries === null || enquiries === undefined
            ? "Not available"
            : enquiries,
        passed:
          enquiries === null || enquiries === undefined
            ? null
            : Number(enquiries) <= 3,
      },
      flagFact("DPD (Last 3 Months)", facts.hasDpd3M),
      flagFact("DPD (Last 6 Months)", facts.hasDpd6M),
      flagFact("Overdue (Last 3 Months)", facts.hasOverdue3M),
      flagFact("Written Off (Last 3 Years)", facts.hasWrittenOff3Y),
      flagFact("60+ DPD (Last 6 Months)", facts.has60Plus6M),
      flagFact("90+ DPD (Last 6 Months)", facts.has90Plus6M),
      {
        label: "EMI Overdue",
        value: formatAmount(emiOverdue),
        passed:
          emiOverdue === null || emiOverdue === undefined
            ? null
            : Number(emiOverdue) <= 3000,
      },
      {
        label: "Credit Card Overdue",
        value: formatAmount(ccOverdue),
        passed:
          ccOverdue === null || ccOverdue === undefined
            ? null
            : Number(ccOverdue) <= 5000,
      },
    ];
    const reasons =
      bureauResult.reasons?.length > 0
        ? bureauResult.reasons
        : toReasonList(null, bureauResult.reason);
    const accentColor = screeningApproved
      ? "#10b981"
      : screeningRejected
        ? "#dc2626"
        : "#f59e0b";
    const background = screeningApproved
      ? "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)"
      : screeningRejected
        ? "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)"
        : "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)";

    return (
      <div
        style={{
          marginTop: "24px",
          padding: "20px 24px",
          borderRadius: "14px",
          border: `2px solid ${accentColor}`,
          background,
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "14px",
          }}
        >
          <span style={{ fontSize: "24px" }}>
            {screeningApproved ? "✅" : screeningRejected ? "❌" : "⚠️"}
          </span>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "700" }}>
              Borrower Bureau Screening: {bureauResult.status || "Pending"}
            </div>
            <div style={{ fontSize: "13px", marginTop: "3px" }}>
              {screeningApproved
                ? "All borrower bureau rules passed. You may continue."
                : screeningRejected
                  ? "The borrower failed bureau screening. This is advisory; you may continue to the final BRE."
                  : "The bureau result is not ready. Retry the screening before continuing."}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "10px",
          }}
        >
          {factRows.map((fact) => (
            <div
              key={fact.label}
              style={{
                background: "rgba(255,255,255,0.72)",
                border: "1px solid rgba(148,163,184,0.35)",
                borderRadius: "8px",
                padding: "10px 12px",
              }}
            >
              <div style={{ color: "#475569", fontSize: "12px" }}>
                {fact.label}
              </div>
              <div
                style={{
                  color:
                    fact.passed === null
                      ? "#92400e"
                      : fact.passed
                        ? "#047857"
                        : "#b91c1c",
                  fontSize: "14px",
                  fontWeight: "700",
                  marginTop: "3px",
                }}
              >
                {fact.passed === null ? "•" : fact.passed ? "✓" : "✕"}{" "}
                {fact.value}
              </div>
            </div>
          ))}
        </div>

        {reasons.length > 0 && (
          <div style={{ marginTop: "14px", color: "#991b1b" }}>
            <strong>Reason(s):</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: "20px" }}>
              {reasons.map((reason, index) => (
                <li key={`${reason}-${index}`}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="manual-entry-container">
      <h2>{title}</h2>

      <div className="section-tabs">
        {sections.map((sec, index) => (
          <div
            key={index}
            className={`tab ${activeSection === index ? "active" : ""}`}
            // onClick={() => setActiveSection(index)}
            onClick={() => {
              if (index <= activeSection) {
                setActiveSection(index);
                return;
              }

              if (index > 2 && !bureauResult.canContinue) {
                setMessage(
                  "❌ Complete the borrower bureau screening in Loan Details before continuing.",
                );
                return;
              }

              const sectionErrors = validateSection(activeSection);

              if (Object.keys(sectionErrors).length > 0) {
                setErrors(sectionErrors);

                const newTouched = {};
                sectionFields[activeSection].forEach((field) => {
                  newTouched[field] = true;
                });

                setTouched((prev) => ({ ...prev, ...newTouched }));
                setMessage("❌ Please complete current section first.");
                return;
              }

              setActiveSection(index);
            }}
          >
            {sec}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {activeSection === 0 && (
          <div className="form-grid">
            {renderInput("Login Date", "LOGIN_DATE", "date", true)}
            {renderInput("First Name", "First_Name")}
            {renderInput("Last Name", "Last_Name")}
            {renderInput("Customer Name", "Customer_Name", "text", true)}
            {renderSelect("Gender", "Gender", ["Male", "Female"])}
            {renderInput("Borrower DOB", "Borrower_DOB", "date")}
            {renderInput("Father Name", "Father_Name")}
            <div className="mobile-otp-wrapper">
              {renderInput(
                "Mobile Number",
                "Mobile_Number",
                "text",
                otpVerified.borrower,
              )}

              <button
                type="button"
                className={otpVerified.borrower ? "verified-btn" : "otp-btn"}
                onClick={() =>
                  handleOpenConsentDialog(formData.Mobile_Number, "BORROWER")
                }
                disabled={otpVerified.borrower}
              >
                {otpVerified.borrower ? "Verified ✓" : "Send OTP"}
              </button>
            </div>

            {renderInput("Email", "Email", "email")}
            {renderInput("Pan Card", "Pan_Card")}
            {renderInput("Driving Licence No", "Driving_Licence")}
          </div>
        )}

        {activeSection === 1 && (
          <div className="form-grid">
            <button
  type="button"
  className="otp-btn"
  onClick={() => triggerAadhaar("BORROWER")}
  disabled={loading || !borrowerSaved || isAadhaarButtonDisabled("BORROWER")}
>
  {aadhaarStatus.BORROWER === "INITIATING"
    ? "Starting Aadhaar..."
    : aadhaarStatus.BORROWER === "INITIATED"
      ? "Aadhaar Initiated ✓"
      : aadhaarStatus.BORROWER === "VERIFIED"
        ? "Aadhaar Verified ✓"
        : "Trigger Borrower Aadhaar"}
</button>
            <button
      type="button"
      className="otp-btn"
      onClick={() => fetchAndPrefillAadhaarAddress("BORROWER")}
      disabled={!lan || loading}
    >
      Fetch Borrower Aadhaar Address
    </button>

            {renderInput("Address Line 1", "Address_Line_1")}
            {renderInput("Address Line 2", "Address_Line_2")}
            {renderInput("Village", "Village")}
            {renderInput("Pincode", "Pincode")}
            {renderInput("District", "District")}
            {renderInput("State", "State")}
          </div>
        )}

        {activeSection === 2 && (
          <div className="form-grid">
            {renderInput("Loan Amount", "Loan_Amount", "number")}
            {renderInput("Interest Rate (%)", "Interest_Rate", "number")}
            {renderInput("Tenure (In Months)", "Tenure", "number")}
            {renderInput(
  "Processing Fee (₹)",
  "Processing_Fee",
  "number",
)}
            {renderInput("GPS Charges (₹)", "GPS_Charges", "number")}

{renderInput(
  "Processing Fee (%)",
  "Processing_Fee_Percentage",
  "number",
  true,
)}
            {renderInput(
              "Disbursal Amount",
              "Disbursal_Amount",
              "number",
              true,
            )}
          </div>
        )}

        {activeSection === 2 && renderBureauScreeningResult()}

        {/* Final BRE result stays visible on Vehicle Details after submission. */}
        {activeSection === 9 && breResult.checked && (
          <div
            style={{
              marginTop: "24px",
              padding: "20px 24px",
              borderRadius: "14px",
              border: `2px solid ${
                breResult.status === "BRE APPROVED"
                  ? "#10b981"
                  : breResult.status === "BRE REJECTED"
                    ? "#dc2626"
                    : "#f59e0b"
              }`,
              background:
                breResult.status === "BRE APPROVED"
                  ? "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)"
                  : breResult.status === "BRE REJECTED"
                    ? "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)"
                    : "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
              <span style={{ fontSize: "24px" }}>
                {breResult.status === "BRE APPROVED"
                  ? "✅"
                  : breResult.status === "BRE REJECTED"
                    ? "⚠️"
                    : "🟡"}
              </span>
              <div>
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: "700",
                    color:
                      breResult.status === "BRE APPROVED"
                        ? "#065f46"
                        : breResult.status === "BRE REJECTED"
                          ? "#7f1d1d"
                          : "#78350f",
                  }}
                >
                  {breResult.code === "KYC_VALIDATIONS_INCOMPLETE"
                    ? "Final BRE not run - complete KYC"
                    : `Final BRE Status: ${breResult.status}`}
                </div>
                {breResult.reason && breResult.reason !== "ELIGIBLE" && (
                  <div
                    style={{
                      fontSize: "13px",
                      marginTop: "4px",
                      color:
                        breResult.status === "BRE APPROVED"
                          ? "#064e3b"
                          : breResult.status === "BRE REJECTED"
                            ? "#991b1b"
                            : "#92400e",
                      lineHeight: "1.5",
                    }}
                  >
                    <strong>Reason(s):</strong>{" "}
                    {breResult.reason
                      .split(", ")
                      .map((r, i) => (
                        <span
                          key={i}
                          style={{
                            display: "inline-block",
                            background:
                              breResult.status === "BRE REJECTED"
                                ? "rgba(220,38,38,0.12)"
                                : "rgba(245,158,11,0.15)",
                            borderRadius: "6px",
                            padding: "2px 8px",
                            margin: "2px 3px",
                            fontSize: "12px",
                            fontWeight: "600",
                          }}
                        >
                          {r.trim()}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>
            {breResult.code === "KYC_VALIDATIONS_INCOMPLETE" && (
              <div
                style={{
                  marginTop: "14px",
                  padding: "14px",
                  background: "rgba(255,255,255,0.72)",
                  border: "1px solid rgba(245,158,11,0.45)",
                  borderRadius: "10px",
                  color: "#78350f",
                }}
              >
                <div style={{ fontWeight: "700", marginBottom: "10px" }}>
                  Complete these required applicant validations, then retry
                  Final BRE:
                </div>

                {breResult.incompleteValidations.length > 0 ? (
                  <div style={{ display: "grid", gap: "10px" }}>
                    {breResult.incompleteValidations.map((item, index) => {
                      const applicantLabel = String(
                        item.applicantType || "APPLICANT",
                      )
                        .replaceAll("_", " ")
                        .toLowerCase()
                        .replace(/\b\w/g, (letter) => letter.toUpperCase());
                      const statusRows = [
                        ["PAN", item.panStatus],
                        ["Aadhaar", item.aadhaarStatus],
                        ["Bureau", item.bureauStatus],
                      ];

                      return (
                        <div
                          key={`${item.applicantType || "applicant"}-${item.partyNo || index}`}
                          style={{
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(148,163,184,0.35)",
                            background: "#fff",
                          }}
                        >
                          <div style={{ fontWeight: "700", marginBottom: "8px" }}>
                            {applicantLabel}
                            {item.partyNo ? ` (Party ${item.partyNo})` : ""}
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(120px, 1fr))",
                              gap: "8px",
                            }}
                          >
                            {statusRows.map(([label, status]) => {
                              const verified =
                                String(status).toUpperCase() === "VERIFIED";

                              return (
                                <div
                                  key={label}
                                  style={{
                                    padding: "7px 9px",
                                    borderRadius: "6px",
                                    background: verified ? "#ecfdf5" : "#fff7ed",
                                    color: verified ? "#047857" : "#9a3412",
                                    fontSize: "12px",
                                    fontWeight: "700",
                                  }}
                                >
                                  {label}: {status || "PENDING"}
                                </div>
                              );
                            })}
                          </div>
                          {Array.isArray(item.incompleteChecks) &&
                            item.incompleteChecks.length > 0 && (
                              <div
                                style={{
                                  fontSize: "12px",
                                  marginTop: "8px",
                                  color: "#9a3412",
                                }}
                              >
                                <strong>Missing:</strong>{" "}
                                {item.incompleteChecks
                                  .map((check) =>
                                    String(check).replaceAll("_", " "),
                                  )
                                  .join(", ")}
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: "13px" }}>
                    Required KYC validations are still incomplete.
                  </div>
                )}
              </div>
            )}
            {breResult.status === "BRE REJECTED" && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "10px 14px",
                  background: "rgba(220,38,38,0.08)",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "#991b1b",
                  fontWeight: "500",
                }}
              >
                This application has been rejected by the final SRBH BRE.
              </div>
            )}
          </div>
        )}

        {activeSection === 3 && (
          <div className="form-grid">
            {renderInput("Guarantor Name", "GURANTOR")}
            {renderInput("Guarantor DOB", "GURANTOR_DOB", "date")}
            {renderInput("Guarantor Email", "GURANTOR_EMAIL", "email")}
            {renderInput("Guarantor PAN", "GURANTOR_PAN")}
            {renderInput("Guarantor Address Line 1", "GURANTOR_Address_Line_1")}
            {renderInput("Guarantor Address Line 2", "GURANTOR_Address_Line_2")}
            {renderInput("Guarantor Village", "GURANTOR_Village")}
            {renderInput("Guarantor Pincode", "GURANTOR_Pincode")}
            {renderInput("Guarantor District", "GURANTOR_District")}
            {renderInput("Guarantor State", "GURANTOR_State")}
            {renderInput(
              "Guarantor Driving Licence",
              "GURANTOR_Driving_Licence",
            )}
            <div className="mobile-otp-wrapper">
              {renderInput(
                "Guarantor Mobile",
                "GURANTOR_MOBILE",
                "text",
                otpVerified.guarantor,
              )}

              <button
                type="button"
                className={otpVerified.guarantor ? "verified-btn" : "otp-btn"}
                onClick={() =>
                  handleOpenConsentDialog(formData.GURANTOR_MOBILE, "GUARANTOR")
                }
                disabled={otpVerified.guarantor}
              >
                {otpVerified.guarantor ? "Verified ✓" : "Send OTP"}
              </button>
            </div>

            {renderInput(
              "Relationship with Borrower",
              "Relationship_with_Borrower",
            )}
            <button
  type="button"
  className="otp-btn"
  onClick={() => triggerAadhaar("GUARANTOR")}
  disabled={ loading || !lan || isAadhaarButtonDisabled("GUARANTOR")}
>
  {aadhaarStatus.GUARANTOR === "INITIATING"
    ? "Starting Aadhaar..."
    : aadhaarStatus.GUARANTOR === "INITIATED"
      ? "Aadhaar Initiated ✓"
      : aadhaarStatus.GUARANTOR === "VERIFIED"
        ? "Aadhaar Verified ✓"
        : "Trigger Guarantor Aadhaar"}
</button>

<button
  type="button"
  className="otp-btn"
  onClick={() => fetchAndPrefillAadhaarAddress("GUARANTOR")}
  disabled={!lan || loading}
>
  Fetch Guarantor Aadhaar Address
</button>
          </div>
        )}

        {activeSection === 4 && (
          <div className="form-grid">
            {renderInput("Co Applicant Name", "Co_Applicant")}
            {renderInput("Co Applicant DOB", "Co_Applicant_DOB", "date")}
            {renderInput("Co Applicant Email", "Co_Applicant_Email", "email")}
            {renderInput("Co Applicant PAN", "Co_Applicant_PAN")}
            {renderInput(
              "Co Applicant Address Line 1",
              "Co_Applicant_Address_Line_1",
            )}
            {renderInput(
              "Co Applicant Address Line 2",
              "Co_Applicant_Address_Line_2",
            )}
            {renderInput("Co Applicant Village", "Co_Applicant_Village")}
            {renderInput("Co Applicant Pincode", "Co_Applicant_Pincode")}
            {renderInput("Co Applicant District", "Co_Applicant_District")}
            {renderInput("Co Applicant State", "Co_Applicant_State")}
            {renderInput(
              "Co Applicant Driving Licence",
              "Co_Applicant_Driving_Licence",
            )}
            <div className="mobile-otp-wrapper">
              {renderInput(
                "Co Applicant Mobile",
                "Co_Applicant_Mobile",
                "text",
                otpVerified.coApplicant,
              )}

              <button
                type="button"
                className={otpVerified.coApplicant ? "verified-btn" : "otp-btn"}
                onClick={() =>
                  handleOpenConsentDialog(
                    formData.Co_Applicant_Mobile,
                    "CO_APPLICANT",
                  )
                }
                disabled={otpVerified.coApplicant}
              >
                {otpVerified.coApplicant ? "Verified ✓" : "Send OTP"}
              </button>

              
            </div>
            <button
  type="button"
  className="otp-btn"
  onClick={() => triggerAadhaar("CO_APPLICANT")}
  disabled={loading || !lan || isAadhaarButtonDisabled("CO_APPLICANT")}
>
  {aadhaarStatus.CO_APPLICANT === "INITIATING"
    ? "Starting Aadhaar..."
    : aadhaarStatus.CO_APPLICANT === "INITIATED"
      ? "Aadhaar Initiated ✓"
      : aadhaarStatus.CO_APPLICANT === "VERIFIED"
        ? "Aadhaar Verified ✓"
        : "Trigger Co-Applicant Aadhaar"}
</button>
<button
  type="button"
  className="otp-btn"
  onClick={() => fetchAndPrefillAadhaarAddress("CO_APPLICANT")}
  disabled={!lan || loading}
>
  Fetch Co-Applicant Aadhaar Address
</button>
          </div>
        )}

        {activeSection === 5 && (
          <div className="form-grid">
            {renderInput("Customer Name (Bank)", "customer_name_as_per_bank")}
            {renderInput("Bank Name", "customer_bank_name")}
            {renderInput("Account Number", "customer_account_number")}
            {renderInput("IFSC Code", "bank_ifsc_code")}
            {renderInput("Branch Address", "bank_branch_address")}
          </div>
        )}

        {activeSection === 6 && (
          <div className="form-grid">
            {renderDealerSelect()}
            {renderInput("Dealer ID", "dealer_id", "text", true)}
            {renderInput("Trade Name", "trade_name", "text", true)}
            {renderInput("Dealer Name", "dealer_name", "text", true)}
            {renderInput("Dealer Contact", "dealer_contact", "text", true)}
            {renderInput("Dealer Email", "dealer_email", "text", true)}
            {renderInput("GST Number", "gst_no", "text", true)}
            {renderInput("Dealer PAN", "pan_number", "text", true)}
            {renderInput("Dealer Address", "dealer_address", "text", true)}
            {renderInput("Dealer City", "dealer_city", "text", true)}
            {renderInput("Dealer State", "dealer_state", "text", true)}
            {renderInput("Dealer Pincode", "dealer_pincode", "text", true)}
            {renderInput("Dealer Bank Name", "bank_name", "text", true)}
            {renderInput(
              "Dealer Account Number",
              "account_number",
              "text",
              true,
            )}
            {renderInput("Dealer IFSC Code", "ifsc", "text", true)}
            {renderInput("Name in Bank", "name_in_bank", "text", true)}
          </div>
        )}

        {activeSection === 7 && (
          <div className="form-grid">
            {renderSelect("Product Type", "Product_Type", ["L3", "L5"])}
            {renderProductSelect()}
            {renderInput("Battery Name", "Battery_Name", "text", true)}
            {renderInput("Battery Type", "Battery_Type", "text", true)}
            {renderInput("E-Rikshaw Model", "E_Rikshaw_model", "text", true)}
            {renderInput("Battery Serial No 1", "Battery_Serial_no_1")}
            {renderInput("Battery Serial No 2", "Battery_Serial_no_2")}
            {renderInput("Chassis No", "Chassis_no")}
          </div>
        )}

        {activeSection === 8 && (
          <div className="form-grid">
            {renderInput("Insurance Cost", "insurance_cost", "number")}
            {renderInput(
              "Insurance Company Provider",
              "insurance_company_provider",
            )}
            {renderInput(
              "Insurance Policy Number",
              "insurance_policy_number",
            )}
            {renderInput("Policy Issued Date", "policy_issued_date", "date")}
            {renderInput("Period of Insurance", "period_of_insurance")}
          </div>
        )}

        {activeSection === 9 && (
          <div className="form-grid">
            {renderInput("Cost Of Vehicle", "cost_of_vehicle", "number")}
            {renderInput(
              "Manufacturing Year",
              "manufacturing_year",
              "number",
            )}
            {renderInput("Sales Invoice Number", "sales_invoice_number")}
            {renderInput("Sales Invoice Date", "sales_invoice_date", "date")}
            {renderInput(
              "Downpayment Paid By The Borrower",
              "downpayment_paid_by_borrower",
            )}
            {renderInput(
              "Vehicle Registration Cost",
              "vehicle_registration_cost",
              "number",
            )}
          </div>
        )}

        <div className="step-buttons">
          {activeSection > 0 && (
            <button
              type="button"
              onClick={() => setActiveSection(activeSection - 1)}
            >
              ← Back
            </button>
          )}

          {activeSection < sections.length - 1 ? (
            <>
              {activeSection === 3 && !hasGuarantorDetails() && (
                <button
                  type="button"
                  onClick={() => {
                    setErrors({});
                    setActiveSection(4);
                    setMessage("Please fill Co-Applicant Details.");
                  }}
                >
                  Skip Guarantor →
                </button>
              )}

              {activeSection === 4 && hasGuarantorDetails() && (
                <button
                  type="button"
                  onClick={() => {
                    setErrors({});
                    setActiveSection(5);
                  }}
                >
                  Skip Co-Applicant →
                </button>
              )}

              {/* <button
                type="button"
                onClick={async () => {
                  if (activeSection === 0) {
                    const saved = await saveBorrowerFirstSection();
                    if (!saved) return;

                    setActiveSection(1);
                    return;
                  }

                  const sectionErrors = validateSection(activeSection);

                  if (Object.keys(sectionErrors).length > 0) {
                    setErrors(sectionErrors);
                    setIsSubmitted(true);

                    const newTouched = {};
                    sectionFields[activeSection].forEach((field) => {
                      newTouched[field] = true;
                    });

                    setTouched((prev) => ({ ...prev, ...newTouched }));
                    return;
                  }

                  setActiveSection(activeSection + 1);
                }}
              >
                Next →
              </button> */}
              <button
  type="button"
  disabled={
    loading ||
    (activeSection === 2 && bureauLoading)
  }
  onClick={async () => {
    // Loan Details: save, run bureau screening, show the result, then gate Next.
    if (activeSection === 2) {
      if (!bureauResult.canContinue) {
        const saved = await saveBorrowerFirstSection();
        if (!saved) return;
        await handleRunBureauScreening();
        return;
      }

      const saved = await saveBorrowerFirstSection();
      if (!saved) return;
      setActiveSection((prev) => prev + 1);
      return;
    }

    const saved = await saveBorrowerFirstSection();
    if (!saved) return;

    setActiveSection((prev) => prev + 1);
  }}
>
  {activeSection === 2
    ? bureauLoading
      ? "🔄 Running Borrower Bureau..."
      : bureauResult.canContinue
        ? String(bureauResult.status).toUpperCase() === "BUREAU REJECTED"
          ? "Continue → (Bureau Rejected - Advisory)"
          : "Next → (Bureau Approved)"
        : bureauResult.checked
          ? "🔄 Retry Bureau Screening"
          : "🔍 Run Bureau Screening"
    : loading ? "Saving..." : "Next →"}
</button>
            </>
          ) : (
            <button
              type="submit"
              disabled={
                loading ||
                breLoading ||
                ["BRE APPROVED", "BRE REJECTED"].includes(breResult.status)
              }
            >
              {breLoading
                ? "🔄 Running Final BRE..."
                : ["BRE APPROVED", "BRE REJECTED"].includes(breResult.status)
                  ? `Final Result: ${breResult.status}`
                  : breResult.checked
                    ? "Retry Final BRE"
                    : "Submit Loan & Run Final BRE"}
            </button>
          )}
        </div>
      </form>

      {message && (
        <div
          className={`message ${message.includes("❌") ? "message-error" : ""}`}
        >
          {message}
        </div>
      )}

      {showConsentDialog && (
        <div className="modern-modal-overlay">
          <div className="modal-card">
            <h3>Mobile Verification Consent</h3>

            <div className="consent-scroll">{CONSENT_TEXT}</div>

            <label className="checkbox-container">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
              />
              I Agree To The Consent Terms
            </label>

            <div className="form-group">
              <label>Enter OTP</label>

              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="Enter OTP"
                maxLength={6}
                className="styled-input"
              />
            </div>

            <div className="step-buttons">
              <button
                type="button"
                onClick={() => {
                  setShowConsentDialog(false);

                  setOtp("");

                  setConsentChecked(false);
                }}
                style={{
                  background: "#cbd5e1",
                  color: "#0f172a",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={verifyOtpHandler}
                disabled={otpLoading}
              >
                {otpLoading ? "Verifying..." : "Verify OTP"}
              </button>
            </div>

            {resendTimers[verificationTarget] > 0 ? (
              <p
                style={{
                  marginTop: "15px",
                  fontSize: "13px",
                }}
              >
                Resend OTP in {resendTimers[verificationTarget]}s
              </p>
            ) : (
              <button
                type="button"
                className="otp-btn"
                onClick={() => {
                  let mobile = "";

                  if (verificationTarget === "BORROWER") {
                    mobile = formData.Mobile_Number;
                  }

                  if (verificationTarget === "GUARANTOR") {
                    mobile = formData.GURANTOR_MOBILE;
                  }

                  if (verificationTarget === "CO_APPLICANT") {
                    mobile = formData.Co_Applicant_Mobile;
                  }

                  sendOtp(mobile, verificationTarget);
                }}
              >
                Resend OTP
              </button>
            )}
          </div>
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

        .modern-modal-overlay {
position: fixed;
inset: 0;
background: rgba(15, 23, 42, 0.7);
backdrop-filter: blur(4px);
z-index: 9999;

display: flex;
align-items: center;
justify-content: center;

padding: 20px;
}

.modal-card {
background: white;
width: 100%;
max-width: 600px;

border-radius: 18px;

padding: 30px;

max-height: 90vh;
overflow-y: auto;

box-shadow:
0 25px 50px -12px rgba(0,0,0,0.25);
}

.modal-card h3 {
margin-top: 0;
margin-bottom: 20px;

font-size: 22px;
font-weight: 700;

color: #0f172a;
}

.consent-scroll {
height: 220px;

overflow-y: auto;

border: 1px solid #cbd5e1;

padding: 16px;

border-radius: 10px;

background: #f8fafc;

font-size: 13px;

line-height: 1.7;

color: #475569;

margin-bottom: 20px;
}

.checkbox-container {
display: flex;
align-items: center;
gap: 10px;

margin-bottom: 20px;

font-size: 14px;
font-weight: 500;

color: #1e293b;
}

.checkbox-container input {
width: 16px;
height: 16px;
}

.mobile-otp-wrapper {
display: flex;
gap: 12px;
align-items: flex-end;
}

.mobile-otp-wrapper .form-group {
flex: 1;
}

.otp-btn,
.verified-btn {
height: 52px;

border: none;

padding: 0 18px;

border-radius: 12px;

font-weight: 600;

cursor: pointer;

white-space: nowrap;
}

.otp-btn {
background: #0f172a;
color: white;
}

.verified-btn {
background: #10b981;
color: white;
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
          background: linear-gradient(
            90deg,
            rgba(56, 189, 248, 0.18),
            rgba(56, 189, 248, 0.05)
          );
          color: #0f172a;
          font-weight: 600;
          border-left: 4px solid #38bdf8;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 26px 40px;
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
          letter-spacing: 0.01em;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .styled-input,
        .form-group input,
        .form-group select {
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
          box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.03);
        }

        .styled-input::placeholder,
        .form-group input::placeholder {
          color: #94a3b8;
          font-weight: 400;
        }

        .styled-input:hover,
        .form-group input:hover,
        .form-group select:hover {
          border-color: #bfd0e2;
          background: #ffffff;
        }

        .styled-input:focus,
        .form-group input:focus,
        .form-group select:focus {
          border-color: #38bdf8;
          background: #ffffff;
          outline: none;
          box-shadow:
            0 0 0 4px rgba(56, 189, 248, 0.12),
            0 8px 20px rgba(37, 99, 235, 0.06);
          transform: translateY(-1px);
        }

        /* Input Error State */
        .input-error {
          border-color: #dc2626 !important;
          background: #fef2f2;
        }

        .input-error:focus {
          border-color: #dc2626 !important;
          box-shadow:
            0 0 0 4px rgba(220, 38, 38, 0.12),
            0 8px 20px rgba(220, 38, 38, 0.06) !important;
        }

        /* Input Valid State */
        .input-valid {
          border-color: #10b981 !important;
          background: #f0fdf4;
        }

        .input-valid:focus {
          border-color: #10b981 !important;
          box-shadow:
            0 0 0 4px rgba(16, 185, 129, 0.12),
            0 8px 20px rgba(16, 185, 129, 0.06) !important;
        }

        .styled-input:read-only {
          background: #f1f5f9;
          cursor: not-allowed;
          border-color: #cbd5e1;
        }

        .validation-icon {
          position: absolute;
          right: 14px;
          font-size: 16px;
          font-weight: bold;
          display: flex;
          align-items: center;
          pointer-events: none;
        }

        .icon-error {
          color: #dc2626;
          font-size: 18px;
        }

        .icon-valid {
          color: #10b981;
          font-size: 18px;
        }

        .req {
          color: red;
          margin-left: 3px;
        }

        .error-text {
          color: #dc2626;
          font-size: 12px;
          margin-top: 6px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .error-text::before {
          content: "⚠";
          font-size: 14px;
        }

        .success-text {
          color: #10b981;
          font-size: 12px;
          margin-top: 6px;
          font-weight: 500;
        }

        .step-buttons {
          display: flex;
          justify-content: space-between;
          margin-top: 40px;
          gap: 15px;
        }

        .step-buttons button {
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

        .step-buttons button:hover:not(:disabled) {
          background: #1e293b;
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
          animation: slideIn 0.3s ease-out;
        }

        .message-error {
          background: #fef2f2;
          color: #7f1d1d;
          border-left-color: #dc2626;
        }

        @keyframes slideIn {
          from {
            transform: translateY(-10px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @media (max-width: 768px) {
          .form-grid {
            grid-template-columns: 1fr;
            gap: 20px;
          }

          .manual-entry-container {
            padding: 25px;
            margin: 15px;
          }

          .section-tabs {
            gap: 8px;
            overflow-x: auto;
            padding-bottom: 8px;
          }

          .tab {
            padding: 8px 12px;
            font-size: 12px;
            white-space: nowrap;
          }

          .step-buttons {
            flex-direction: column-reverse;
          }

          .step-buttons button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default  SRBHLoanBooking;
