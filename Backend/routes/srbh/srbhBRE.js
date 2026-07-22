const { XMLParser } = require("fast-xml-parser");
const he = require("he");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,

  // Keep entity processing enabled, but raise limits for valid large bureau XML.
  processEntities: {
    enabled: true,
    maxTotalExpansions: 200000,
    maxExpandedLength: 20_000_000,
    maxEntityCount: 200000,
    maxEntitySize: 200000,
  },
});

const CREDIT_CARD_ACCOUNT_TYPES = new Set(["10", "31", "35", "36", "37"]);
const SUITFILED_WRITEOFF_CODES = new Set(["4", "5", "6", "7", "8", "9"]);
const CREDIT_FACILITY_WRITEOFF_CODES = new Set([
  "02",
  "03",
  "04",
  "06",
  "08",
  "09",
  "13",
  "15",
  "16",
]);

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;

  const normalized =
    typeof value === "string" ? value.replace(/,/g, "").trim() : value;
  const number = Number(normalized);

  return Number.isFinite(number) ? number : fallback;
};

const firstNumber = (values, fallback = null) => {
  for (const value of values) {
    const number = toNumber(value, null);

    if (number !== null) return number;
  }

  return fallback;
};

const maximumNumber = (values) =>
  values.reduce((maximum, value) => {
    const number = toNumber(value, 0);
    return number > maximum ? number : maximum;
  }, 0);

const parseDateYYYYMMDD = (value) => {
  if (!value) return null;

  const stringValue = String(value).trim();

  if (!/^\d{8}$/.test(stringValue)) return null;

  const year = Number(stringValue.slice(0, 4));
  const month = Number(stringValue.slice(4, 6)) - 1;
  const day = Number(stringValue.slice(6, 8));
  const date = new Date(year, month, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

const monthsDiff = (fromDate, toDate = new Date()) => {
  if (!fromDate) return null;

  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
    (toDate.getMonth() - fromDate.getMonth())
  );
};

const calculateAge = (dob) => {
  if (!dob) return null;

  const birthDate = new Date(dob);

  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age;
};

const normalizeSrbhProductType = (value) => {
  const productType = String(value || "")
    .trim()
    .toUpperCase();

  return productType === "L3" || productType === "L5" ? productType : null;
};

const emptyBureauFacts = () => ({
  reportParsed: false,
  score: null,
  isNtc: false,
  enquiries30d: 0,
  hasDpd3M: false,
  hasDpd6M: false,
  hasOverdue3M: false,
  hasWrittenOff3Y: false,
  has60Plus6M: false,
  has90Plus6M: false,
  emiOverdueAmount: 0,
  ccOverdueAmount: 0,
});

const findInProfileResponse = (payload, depth = 0) => {
  if (payload === null || payload === undefined || depth > 8) return null;

  if (Buffer.isBuffer(payload)) {
    return findInProfileResponse(payload.toString("utf8"), depth + 1);
  }

  if (typeof payload === "string") {
    const value = payload.trim();

    if (!value) return null;

    try {
      const jsonValue = JSON.parse(value);

      if (jsonValue !== value) {
        const profile = findInProfileResponse(jsonValue, depth + 1);

        if (profile) return profile;
      }
    } catch {
      // The KYC column can also contain raw XML, so JSON parsing is optional.
    }

    const xmlCandidates = [...new Set([value, he.decode(value)])];

    for (const xml of xmlCandidates) {
      if (!xml.includes("<")) continue;

      try {
        const profile = findInProfileResponse(parser.parse(xml), depth + 1);

        if (profile) return profile;
      } catch {
        // Try the next representation (for example entity-encoded SOAP XML).
      }
    }

    return null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const profile = findInProfileResponse(item, depth + 1);

      if (profile) return profile;
    }

    return null;
  }

  if (typeof payload !== "object") return null;

  for (const [key, value] of Object.entries(payload)) {
    if (key.split(":").pop() === "INProfileResponse") {
      if (value && typeof value === "object") return value;

      const profile = findInProfileResponse(value, depth + 1);

      if (profile) return profile;
    }
  }

  for (const value of Object.values(payload)) {
    const profile = findInProfileResponse(value, depth + 1);

    if (profile) return profile;
  }

  return null;
};

const extractSrbhBureauFacts = (bureauPayload, fallbackScore = null) => {
  if (!bureauPayload) return emptyBureauFacts();

  const profile = findInProfileResponse(bureauPayload);

  if (!profile || typeof profile !== "object") {
    return emptyBureauFacts();
  }

  const score = firstNumber(
    [
      profile?.SCORE?.BureauScore,
      profile?.Score?.BureauScore,
      profile?.Score?.Value,
      fallbackScore,
    ],
    null,
  );
  const enquiries30d = toNumber(
    profile?.CAPS?.CAPS_Summary?.CAPSLast30Days,
    0,
  );
  const accounts = toArray(profile?.CAIS_Account?.CAIS_Account_DETAILS);

  let hasDpd3M = false;
  let hasDpd6M = false;
  let hasOverdue3M = false;
  let hasWrittenOff3Y = false;
  let has60Plus6M = false;
  let has90Plus6M = false;
  let emiOverdueAmount = 0;
  let ccOverdueAmount = 0;

  const now = new Date();

  for (const account of accounts) {
    const histories = toArray(account?.CAIS_Account_History);
    const accountType = String(account?.Account_Type || "")
      .trim()
      .padStart(2, "0");
    const isCreditCard = CREDIT_CARD_ACCOUNT_TYPES.has(accountType);

    const overdueAmount = maximumNumber([
      account?.Amount_Past_Due,
      account?.Amount_Overdue,
      account?.Current_Amount_Overdue,
      account?.CurrentAmountOverdue,
    ]);

    const dateReported =
      parseDateYYYYMMDD(account?.Date_Reported) ||
      parseDateYYYYMMDD(account?.DateReported) ||
      parseDateYYYYMMDD(account?.Date_of_Last_Payment) ||
      parseDateYYYYMMDD(account?.Date_Closed) ||
      parseDateYYYYMMDD(account?.DateClosed);
    const reportedMonthsAgo = monthsDiff(dateReported, now);

    if (overdueAmount > 0) {
      if (isCreditCard) {
        ccOverdueAmount += overdueAmount;
      } else {
        emiOverdueAmount += overdueAmount;
      }

      // A missing report date is treated conservatively as a current overdue.
      if (reportedMonthsAgo === null || reportedMonthsAgo < 3) {
        hasOverdue3M = true;
      }
    }

    const suitFiledCode = String(
      account?.SuitFiledWillfulDefaultWrittenOffStatus ?? "",
    )
      .trim()
      .replace(/^0+(?=\d)/, "");
    const creditFacilityCode = String(
      account?.Written_off_Settled_Status ??
        account?.Written_Off_Settled_Status ??
        "",
    )
      .trim()
      .padStart(2, "0");
    const writtenOffStatusText = String(
      account?.Written_off_Settled_Status ??
        account?.Written_Off_Settled_Status ??
        "",
    ).toUpperCase();
    const hasWriteOffOrSettlement =
      maximumNumber([
        account?.Written_Off_Amt_Total,
        account?.Written_Off_Amount_Total,
        account?.Written_Off_Amt_Principal,
        account?.Written_Off_Amount_Principal,
        account?.Settlement_Amount,
      ]) > 0 ||
      SUITFILED_WRITEOFF_CODES.has(suitFiledCode) ||
      CREDIT_FACILITY_WRITEOFF_CODES.has(creditFacilityCode) ||
      writtenOffStatusText.includes("WRITTEN") ||
      writtenOffStatusText.includes("SETTLED");

    const writeOffDate =
      parseDateYYYYMMDD(account?.WriteOffStatusDate) ||
      parseDateYYYYMMDD(account?.DefaultStatusDate) ||
      parseDateYYYYMMDD(account?.LitigationStatusDate) ||
      dateReported;
    const writeOffMonthsAgo = monthsDiff(writeOffDate, now);

    // A missing event date is treated conservatively as being inside the window.
    if (
      hasWriteOffOrSettlement &&
      (writeOffMonthsAgo === null || writeOffMonthsAgo < 36)
    ) {
      hasWrittenOff3Y = true;
    }

    for (const history of histories) {
      const year = toNumber(history?.Year, null);
      const month = toNumber(history?.Month, null);
      const dpd = toNumber(history?.Days_Past_Due, 0);

      if (!year || !month) continue;

      const historyDate = new Date(year, month - 1, 1);
      const monthsAgo = monthsDiff(historyDate, now);

      if (monthsAgo === null || monthsAgo < 0) continue;

      if (monthsAgo < 3 && dpd > 0) hasDpd3M = true;
      if (monthsAgo < 6 && dpd > 0) hasDpd6M = true;
      if (monthsAgo < 6 && dpd >= 60) has60Plus6M = true;
      if (monthsAgo < 6 && dpd >= 90) has90Plus6M = true;
    }
  }

  return {
    reportParsed: true,
    score,
    isNtc: score !== null && score >= -1 && score <= 250,
    enquiries30d,
    hasDpd3M,
    hasDpd6M,
    hasOverdue3M,
    hasWrittenOff3Y,
    has60Plus6M,
    has90Plus6M,
    emiOverdueAmount,
    ccOverdueAmount,
  };
};

const evaluateSrbhBureauPolicy = (bureauFacts = {}) => {
  const reasons = [];
  const score = toNumber(bureauFacts.score, null);

  if (bureauFacts.reportParsed !== true) {
    reasons.push("BUREAU_REPORT_MISSING_OR_INVALID");
  } else if (score === null || score < -1) {
    reasons.push("CIBIL_SCORE_MISSING_OR_INVALID");
  } else if (score > 250 && score < 650) {
    reasons.push("CIBIL_BELOW_650");
  }

  if (toNumber(bureauFacts.enquiries30d, 0) > 3) {
    reasons.push("ENQUIRIES_GT_3_LAST_30D");
  }

  if (bureauFacts.hasDpd3M) reasons.push("DPD_LAST_3M");
  if (bureauFacts.hasOverdue3M) reasons.push("OVERDUE_LAST_3M");
  if (bureauFacts.hasWrittenOff3Y) reasons.push("WRITTEN_OFF_LAST_3Y");
  if (bureauFacts.has60Plus6M) reasons.push("60PLUS_DPD_LAST_6M");
  if (bureauFacts.has90Plus6M) reasons.push("90PLUS_DPD_LAST_6M");

  if (toNumber(bureauFacts.emiOverdueAmount, 0) > 3000) {
    reasons.push("EMI_OVERDUE_GT_3000");
  }

  if (toNumber(bureauFacts.ccOverdueAmount, 0) > 5000) {
    reasons.push("CC_OVERDUE_GT_5000");
  }

  return {
    status:
      reasons.length > 0 ? "BUREAU REJECTED" : "BUREAU APPROVED",
    reasons,
    bureauScore: score,
    isNtc: score !== null && score >= -1 && score <= 250,
  };
};

const isSrbhBureauScreeningComplete = (status) =>
  ["BUREAU APPROVED", "BUREAU REJECTED"].includes(
    String(status || "").trim().toUpperCase(),
  );

const normalizeKycStatus = (status) => {
  const normalized = String(status || "").trim().toUpperCase();
  return normalized || "MISSING";
};

const hasApplicantValue = (value) =>
  value !== null &&
  value !== undefined &&
  String(value).trim() !== "";

const pickSrbhKycRow = (kycRows, applicantType, partyNo = 1) =>
  [...(kycRows || [])]
    .filter(
      (row) =>
        String(row?.applicant_type || "").trim().toUpperCase() ===
          applicantType &&
        Number(row?.party_no) === partyNo,
    )
    .sort((left, right) => {
      const leftUpdatedAt = Date.parse(left?.updated_at || "") || 0;
      const rightUpdatedAt = Date.parse(right?.updated_at || "") || 0;

      if (leftUpdatedAt !== rightUpdatedAt) {
        return rightUpdatedAt - leftUpdatedAt;
      }

      return toNumber(right?.id, 0) - toNumber(left?.id, 0);
    })[0] || null;

const evaluateSrbhKycReadiness = ({ loan = {}, kycRows = [] }) => {
  const requiredApplicants = [
    {
      applicantType: "BORROWER",
      partyNo: 1,
    },
  ];

  if (
    [
      loan.guarantor_name,
      loan.guarantor_pan,
      loan.guarantor_mobile,
      loan.guarantor_dob,
    ].some(hasApplicantValue)
  ) {
    requiredApplicants.push({
      applicantType: "GUARANTOR",
      partyNo: 1,
    });
  }

  if (
    [
      loan.co_applicant_name,
      loan.co_applicant_pan,
      loan.co_applicant_mobile,
      loan.co_applicant_dob,
    ].some(hasApplicantValue)
  ) {
    requiredApplicants.push({
      applicantType: "CO_APPLICANT",
      partyNo: 1,
    });
  }

  const applicants = requiredApplicants.map((required) => {
    const row = pickSrbhKycRow(
      kycRows,
      required.applicantType,
      required.partyNo,
    );
    const panStatus = normalizeKycStatus(row?.pan_status);
    const aadhaarStatus = normalizeKycStatus(row?.aadhaar_status);
    const bureauStatus = normalizeKycStatus(row?.bureau_status);
    const incompleteChecks = [];

    if (panStatus !== "VERIFIED") {
      incompleteChecks.push("PAN");
    }
    if (aadhaarStatus !== "VERIFIED") {
      incompleteChecks.push("AADHAAR");
    }
    if (bureauStatus !== "VERIFIED") {
      incompleteChecks.push("BUREAU");
    }

    return {
      applicantType: required.applicantType,
      partyNo: Number(row?.party_no || required.partyNo),
      panStatus,
      aadhaarStatus,
      bureauStatus,
      incompleteChecks,
    };
  });

  return {
    ready: applicants.every(
      (applicant) => applicant.incompleteChecks.length === 0,
    ),
    applicants,
    incompleteApplicants: applicants.filter(
      (applicant) => applicant.incompleteChecks.length > 0,
    ),
  };
};

const evaluateSrbhPolicy = ({ loan = {}, bureauFacts = {} }) => {
  const bureauDecision = evaluateSrbhBureauPolicy(bureauFacts);
  const reasons = [...bureauDecision.reasons];
  const deviations = [];
  const age = calculateAge(loan.dob);
  const productType = normalizeSrbhProductType(
    loan.product_type ?? loan.Product_Type,
  );
  const loanAmount = toNumber(
    loan.requested_loan_amount ?? loan.loan_amount,
    0,
  );
  const tenure = toNumber(loan.loan_tenure ?? loan.tenure, 0);

  if (age === null) {
    reasons.push("AGE_MISSING");
  } else {
    if (age < 18) reasons.push("AGE_BELOW_18");
    if (age > 65) reasons.push("AGE_ABOVE_65");
  }

  if (!productType) {
    reasons.push("PRODUCT_TYPE_REQUIRED_OR_INVALID");
  } else if (productType === "L3") {
    if (loanAmount < 140000 || loanAmount > 220000) {
      reasons.push("L3_LOAN_AMOUNT_OUTSIDE_140000_TO_220000");
    }

    if (tenure < 12 || tenure > 24) {
      reasons.push("L3_TENURE_OUTSIDE_12_TO_24");
    }
  } else if (productType === "L5") {
    if (loanAmount < 220000 || loanAmount > 450000) {
      reasons.push("L5_LOAN_AMOUNT_OUTSIDE_220000_TO_450000");
    }

    if (tenure < 12 || tenure > 36) {
      reasons.push("L5_TENURE_OUTSIDE_12_TO_36");
    }
  }

  return {
    status: reasons.length > 0 ? "BRE REJECTED" : "BRE APPROVED",
    reasons,
    deviations,
    bureauScore: bureauDecision.bureauScore,
    isNtc: bureauDecision.isNtc,
    productType,
  };
};

const autoApproveSrbhIfAllVerified = async (lan) => {
  const db = require("../../config/db");
  const pool = db.promise();

  const [loanRows] = await pool.query(
    `
    SELECT
      lan,
      dob,
      requested_loan_amount,
      loan_tenure,
      interest_rate,
      cibil_score,
      pan_card,
      product_type,
      srbh_bureau_screening_status,
      guarantor_name,
      guarantor_dob,
      guarantor_pan,
      guarantor_mobile,
      co_applicant_name,
      co_applicant_dob,
      co_applicant_pan,
      co_applicant_mobile,
      cost_of_vehicle,
      manufacturing_year,
      downpayment_paid_by_borrower,
      vehicle_registration_cost,
      sales_invoice_number,
      sales_invoice_date
    FROM loan_booking_srbh
    WHERE lan = ?
    `,
    [lan],
  );

  if (!loanRows.length) {
    console.log("SRBH loan not found:", lan);
    return {
      status: "Pending",
      reason: "LOAN_NOT_FOUND",
      reasons: [],
      deviations: [],
    };
  }

  const loan = loanRows[0];

  if (!isSrbhBureauScreeningComplete(loan.srbh_bureau_screening_status)) {
    const pendingReason = `BUREAU_SCREENING_STATUS=${
      loan.srbh_bureau_screening_status || "NOT_RUN"
    }`;

    await pool.query(
      `
      UPDATE loan_booking_srbh
      SET
        srbh_bre_status = ?,
        srbh_bre_reason = ?,
        srbh_bre_checked_at = NOW()
      WHERE lan = ?
      `,
      ["Pending", pendingReason, lan],
    );

    return {
      status: "Pending",
      reason: pendingReason,
      reasons: [],
      deviations: [],
    };
  }

  const requiredVehicleFields = [
    loan.cost_of_vehicle,
    loan.manufacturing_year,
    loan.downpayment_paid_by_borrower,
    loan.vehicle_registration_cost,
    loan.sales_invoice_number,
    loan.sales_invoice_date,
  ];
  const vehicleDetailsComplete = requiredVehicleFields.every(
    (value) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== "",
  );

  if (!vehicleDetailsComplete) {
    await pool.query(
      `
      UPDATE loan_booking_srbh
      SET
        srbh_bre_status = ?,
        srbh_bre_reason = ?,
        srbh_bre_checked_at = NOW()
      WHERE lan = ?
      `,
      ["Pending", "FINAL_BRE_REQUIRES_VEHICLE_DETAILS", lan],
    );

    return {
      status: "Pending",
      reason: "FINAL_BRE_REQUIRES_VEHICLE_DETAILS",
      reasons: [],
      deviations: [],
    };
  }

  const [kycRows] = await pool.query(
    `
    SELECT
      id,
      applicant_type,
      party_no,
      pan_status,
      aadhaar_status,
      bureau_status,
      bureau_api_response,
      updated_at
    FROM kyc_verification_status
    WHERE lan = ?
      AND applicant_type IN ('BORROWER', 'GUARANTOR', 'CO_APPLICANT')
      AND party_no = 1
    ORDER BY
      updated_at DESC,
      id DESC
    `,
    [lan],
  );

  const kycReadiness = evaluateSrbhKycReadiness({
    loan,
    kycRows,
  });

  if (!kycReadiness.ready) {
    const statusKeyByCheck = {
      PAN: "panStatus",
      AADHAAR: "aadhaarStatus",
      BUREAU: "bureauStatus",
    };
    const pendingDetails = kycReadiness.incompleteApplicants
      .map((applicant) => {
        const checks = applicant.incompleteChecks
          .map(
            (check) =>
              `${check}=${applicant[statusKeyByCheck[check]] || "MISSING"}`,
          )
          .join(", ");

        return `${applicant.applicantType}[${checks}]`;
      })
      .join("; ");
    const pendingReason =
      `KYC_VALIDATIONS_INCOMPLETE: ${pendingDetails}`;

    await pool.query(
      `
      UPDATE loan_booking_srbh
      SET
        srbh_bre_status = ?,
        srbh_bre_reason = ?,
        srbh_bre_checked_at = NOW()
      WHERE lan = ?
      `,
      ["Pending", pendingReason, lan],
    );

    return {
      status: "Pending",
      code: "KYC_VALIDATIONS_INCOMPLETE",
      reason: pendingReason,
      reasons: [],
      deviations: [],
      kycReady: false,
      validationStatuses: kycReadiness.applicants,
      incompleteValidations: kycReadiness.incompleteApplicants,
    };
  }

  const kyc = pickSrbhKycRow(kycRows, "BORROWER", 1);

  if (!kyc.bureau_api_response) {
    await pool.query(
      `
      UPDATE loan_booking_srbh
      SET
        srbh_bre_status = ?,
        srbh_bre_reason = ?,
        srbh_bre_checked_at = NOW()
      WHERE lan = ?
      `,
      ["Pending", "BUREAU_REPORT_MISSING", lan],
    );

    return {
      status: "Pending",
      reason: "BUREAU_REPORT_MISSING",
      reasons: [],
      deviations: [],
      kycReady: true,
      validationStatuses: kycReadiness.applicants,
    };
  }

  const bureauFacts = extractSrbhBureauFacts(
    kyc.bureau_api_response,
    loan.cibil_score,
  );

  if (!bureauFacts.reportParsed) {
    await pool.query(
      `
      UPDATE loan_booking_srbh
      SET
        srbh_bre_status = ?,
        srbh_bre_reason = ?,
        srbh_bre_checked_at = NOW()
      WHERE lan = ?
      `,
      ["Pending", "BUREAU_REPORT_MISSING_OR_INVALID", lan],
    );

    return {
      status: "Pending",
      reason: "BUREAU_REPORT_MISSING_OR_INVALID",
      reasons: [],
      deviations: [],
      kycReady: true,
      validationStatuses: kycReadiness.applicants,
    };
  }

  const decision = evaluateSrbhPolicy({ loan, bureauFacts });
  const decisionMessages = [
    ...(decision.reasons || []),
    ...(decision.deviations || []),
  ];
  const reasonText = decisionMessages.length
    ? decisionMessages.join(", ")
    : "ELIGIBLE";

  let finalStatus = "Credit Initiated";
  let finalStage = "BRE Approved";

  if (decision.status === "BRE REJECTED") {
    finalStatus = "Rejected";
    finalStage = "BRE Rejected";
  } else if (decision.status === "Credit Initiated") {
    finalStage = "BRE Deviation";
  }

  await pool.query(
    `
    UPDATE loan_booking_srbh
    SET
      srbh_bre_status = ?,
      srbh_bre_reason = ?,
      srbh_bre_checked_at = NOW(),
      fintree_cibil_score = ?,
      srbh_enquiries_30d = ?,
      srbh_dpd_3m_flag = ?,
      srbh_dpd_6m_flag = ?,
      srbh_overdue_3m_flag = ?,
      srbh_written_off_3y_flag = ?,
      srbh_60plus_6m_flag = ?,
      srbh_90plus_6m_flag = ?,
      srbh_emi_overdue_amount = ?,
      srbh_cc_overdue_amount = ?,
      srbh_deviation_flag = ?,
      status = ?,
      stage = ?
    WHERE lan = ?
    `,
    [
      decision.status,
      reasonText,
      decision.bureauScore,
      bureauFacts.enquiries30d,
      bureauFacts.hasDpd3M ? 1 : 0,
      bureauFacts.hasDpd6M ? 1 : 0,
      bureauFacts.hasOverdue3M ? 1 : 0,
      bureauFacts.hasWrittenOff3Y ? 1 : 0,
      bureauFacts.has60Plus6M ? 1 : 0,
      bureauFacts.has90Plus6M ? 1 : 0,
      bureauFacts.emiOverdueAmount,
      bureauFacts.ccOverdueAmount,
      decision.deviations.length > 0 ? 1 : 0,
      finalStatus,
      finalStage,
      lan,
    ],
  );

  console.log(
    `SRBH BRE completed for ${lan}: ${decision.status} | ${reasonText}`,
  );

  return {
    ...decision,
    reason: reasonText,
    kycReady: true,
    validationStatuses: kycReadiness.applicants,
  };
};

module.exports = {
  autoApproveSrbhIfAllVerified,
  evaluateSrbhBureauPolicy,
  evaluateSrbhKycReadiness,
  extractSrbhBureauFacts,
  evaluateSrbhPolicy,
  isSrbhBureauScreeningComplete,
  normalizeSrbhProductType,
};
