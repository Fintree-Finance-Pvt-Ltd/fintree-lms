const db = require("../../config/db");
const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  trimValues: true,
});

const toArray = (v) => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

const toNumber = (v, fallback = 0) => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const normalize = (v) => String(v || "").trim().toUpperCase();

const calculateAge = (dob) => {
  if (!dob) return null;

  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};

const monthsDiff = (fromDate, toDate = new Date()) => {
  if (!fromDate) return null;

  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
    (toDate.getMonth() - fromDate.getMonth())
  );
};

const parseAnyDate = (value) => {
  if (!value) return null;

  const str = String(value).trim();

  // YYYYMMDD
  if (/^\d{8}$/.test(str)) {
    const y = Number(str.slice(0, 4));
    const m = Number(str.slice(4, 6)) - 1;
    const d = Number(str.slice(6, 8));
    const dt = new Date(y, m, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(str);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const toDpd = (value) => {
  const str = String(value || "").trim().toUpperCase();

  if (!str || str === "STD" || str === "XXX" || str === "000") {
    return 0;
  }

  const n = Number(str.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Important:
 * Update this function based on your bureau provider's exact account/enquiry codes.
 * Keep it configurable because CIBIL/Experian code mappings can differ by provider response.
 */
const isUnsecuredBLPL = (accountTypeOrPurpose) => {
  const value = normalize(accountTypeOrPurpose);

  return (
    value.includes("PERSONAL LOAN") ||
    value.includes("BUSINESS LOAN") ||
    value === "PL" ||
    value === "BL" ||
    value.includes("UNSECURED")
  );
};

const isLiveAccount = (account) => {
  const closedDate =
    account?.Date_Closed ||
    account?.Closed_Date ||
    account?.DateClosed;

  if (closedDate) return false;

  const status = normalize(
    account?.Account_Status ||
      account?.AccountStatus ||
      account?.Status
  );

  if (status.includes("CLOSED")) return false;

  const balance = toNumber(
    account?.Current_Balance ||
      account?.CurrentBalance ||
      account?.Balance,
    0
  );

  return balance > 0 || !status;
};

const getAccountOpenDate = (account) => {
  return parseAnyDate(
    account?.Date_Opened ||
      account?.Date_Opened_Disbursed ||
      account?.Open_Date ||
      account?.DateOfOpen
  );
};

const getEnquiryDate = (enquiry) => {
  return parseAnyDate(
    enquiry?.Date_of_Request ||
      enquiry?.Date_Reported ||
      enquiry?.Enquiry_Date ||
      enquiry?.DateOfEnquiry ||
      enquiry?.Date
  );
};

const getEnquiryPurpose = (enquiry) => {
  return (
    enquiry?.Enquiry_Reason ||
    enquiry?.Purpose ||
    enquiry?.EnquiryPurpose ||
    enquiry?.Finance_Purpose ||
    enquiry?.Account_Type ||
    ""
  );
};

const extractCapsDetails = (profile) => {
  const caps = profile?.CAPS || {};

  return [
    ...toArray(caps?.CAPS_Application_Details),
    ...toArray(caps?.CAPSApplicationDetails),
    ...toArray(caps?.Application_Details),
    ...toArray(caps?.Applications),
  ];
};

const extractFundifyBureauFacts = (reportXml) => {
  if (!reportXml) {
    return {
      score: null,
      enquiries6M: 0,
      unsecuredBLPLEnquiries3M: 0,
      disbursedLast6M: false,
      dpdLast3M: false,
      dpdEvents6M: 0,
      liveUnsecuredBLPLCount: 0,
    };
  }

  let json;

  try {
    json = parser.parse(reportXml);
  } catch (err) {
    return {
      score: null,
      enquiries6M: 0,
      unsecuredBLPLEnquiries3M: 0,
      disbursedLast6M: false,
      dpdLast3M: false,
      dpdEvents6M: 0,
      liveUnsecuredBLPLCount: 0,
      parseError: true,
    };
  }

  const profile = json?.INProfileResponse || json || {};

  const score =
    toNumber(profile?.SCORE?.BureauScore, null) ??
    toNumber(profile?.Score?.BureauScore, null) ??
    toNumber(profile?.Score?.Value, null);

  const accounts = toArray(profile?.CAIS_Account?.CAIS_Account_DETAILS);

  const now = new Date();

  let dpdLast3M = false;
  let dpdEvents6M = 0;
  let liveUnsecuredBLPLCount = 0;
  let disbursedLast6M = false;

  for (const account of accounts) {
    const accountType = String(
      account?.Account_Type ||
        account?.AccountType ||
        account?.Account_Type_Description ||
        account?.AccountTypeDescription ||
        ""
    );

    const openDate = getAccountOpenDate(account);
    const openDateDiff = monthsDiff(openDate, now);

    if (openDateDiff !== null && openDateDiff >= 0 && openDateDiff < 6) {
      disbursedLast6M = true;
    }

    if (isLiveAccount(account) && isUnsecuredBLPL(accountType)) {
      liveUnsecuredBLPLCount++;
    }

    const histories = toArray(account?.CAIS_Account_History);

    for (const hist of histories) {
      const year = toNumber(hist?.Year, null);
      const month = toNumber(hist?.Month, null);
      const dpd = toDpd(hist?.Days_Past_Due);

      if (!year || !month) continue;

      const histDate = new Date(year, month - 1, 1);
      const diff = monthsDiff(histDate, now);

      if (diff === null || diff < 0) continue;

      if (diff < 3 && dpd > 0) {
        dpdLast3M = true;
      }

      if (diff < 6 && dpd > 0) {
        dpdEvents6M++;
      }
    }
  }

  const capsDetails = extractCapsDetails(profile);

  let enquiries6M = 0;
  let unsecuredBLPLEnquiries3M = 0;

  for (const enquiry of capsDetails) {
    const enquiryDate = getEnquiryDate(enquiry);
    const diff = monthsDiff(enquiryDate, now);

    if (diff === null || diff < 0) continue;

    if (diff < 6) {
      enquiries6M++;
    }

    if (diff < 3 && isUnsecuredBLPL(getEnquiryPurpose(enquiry))) {
      unsecuredBLPLEnquiries3M++;
    }
  }

  // Fallback if detailed enquiries are not present.
  if (enquiries6M === 0) {
    enquiries6M = toNumber(
      profile?.CAPS?.CAPS_Summary?.CAPSLast6Months,
      0
    );
  }

  return {
    score,
    enquiries6M,
    unsecuredBLPLEnquiries3M,
    disbursedLast6M,
    dpdLast3M,
    dpdEvents6M,
    liveUnsecuredBLPLCount,
  };
};

const isOwned = (value) => {
  const v = normalize(value);
  return v.includes("OWN") || v.includes("SELF");
};

const isRented = (value) => {
  const v = normalize(value);
  return v.includes("RENT") || v.includes("LEASE");
};

const isPositive = (value) => {
  const v = normalize(value);
  return v === "POSITIVE" || v === "VERIFIED" || v === "CLEAR";
};

const hasFriendReference = (loan) => {
  return Boolean(
    loan.friend_reference_name &&
      loan.friend_reference_mobile
  );
};

const hasBloodReference = (loan) => {
  return Boolean(
    loan.blood_reference_name &&
      loan.blood_reference_mobile
  );
};

const evaluateFundifyPolicy = ({
  loan,
  primaryApplicant,
  applicants,
  bureauFacts,
}) => {
  const reasons = [];
  const deviations = [];
  const pending = [];

  const loanAmount = toNumber(loan.loan_amount, 0);
  const roi = toNumber(loan.interest_rate, 0);
  const processingFeePct = toNumber(loan.processing_fee_percentage, 0);
  const tenure = toNumber(loan.loan_tenure, 0);
  const businessVintageMonths = toNumber(loan.business_vintage_months, 0);

  const age = calculateAge(primaryApplicant?.dob);

  const constitution = normalize(loan.constitution_type);
  const applicantRoles = applicants.map((a) => normalize(a.role));

  const hasCoApplicantOrGuarantor =
    applicantRoles.includes("CO_APPLICANT") ||
    applicantRoles.includes("GUARANTOR");

  const score = toNumber(bureauFacts.score, null);
  const isNtc = score === null || score < 200;

  /**
   * A. Product details
   */
  if (loanAmount < 50000) reasons.push("LOAN_AMOUNT_BELOW_50000");
  if (loanAmount > 500000) reasons.push("LOAN_AMOUNT_ABOVE_500000");

  if (roi < 25) reasons.push("ROI_BELOW_25");
  if (roi > 38) reasons.push("ROI_ABOVE_38");

  if (processingFeePct < 2.5) {
    reasons.push("PROCESSING_FEE_BELOW_2_5_PERCENT");
  }

  if (processingFeePct > 7) {
    reasons.push("PROCESSING_FEE_ABOVE_7_PERCENT");
  }

  if (!tenure || tenure > 24) {
    reasons.push("TENURE_ABOVE_24_OR_MISSING");
  }

  /**
   * B. Basic gating norms
   */
  if (age === null) {
    reasons.push("AGE_MISSING");
  } else {
    if (age < 21) reasons.push("AGE_BELOW_21");
    if (age > 58) reasons.push("AGE_ABOVE_58");
  }

  if (
    ![
      "PROPRIETORSHIP",
      "SOLE PROPRIETORSHIP",
      "PARTNERSHIP",
      "PARTNERSHIP FIRM",
    ].includes(constitution)
  ) {
    reasons.push("CONSTITUTION_NOT_ALLOWED");
  }

  if (businessVintageMonths < 36) {
    reasons.push("BUSINESS_VINTAGE_BELOW_3_YEARS");
  }

  const officeOwnership = loan.premises_ownership;
  const residenceOwnership = primaryApplicant?.residence_ownership;

  if (!isOwned(officeOwnership) && !isOwned(residenceOwnership)) {
    reasons.push("OFFICE_OR_RESIDENCE_OWNERSHIP_REQUIRED");
  }

  if (isRented(officeOwnership) && isRented(residenceOwnership)) {
    reasons.push("BOTH_OFFICE_AND_RESIDENCE_RENTED");
  }

  if (!hasFriendReference(loan)) {
    reasons.push("FRIEND_REFERENCE_MISSING");
  }

  if (!hasBloodReference(loan)) {
    reasons.push("BLOOD_RELATION_REFERENCE_MISSING");
  }

  if (loanAmount > 200000 && !hasCoApplicantOrGuarantor) {
    reasons.push("CO_APPLICANT_OR_GUARANTOR_REQUIRED_ABOVE_2L");
  }

  /**
   * D. Bureau parameters
   */
  if (isNtc) {
    if (loanAmount > 200000) {
      reasons.push("NTC_ALLOWED_ONLY_UPTO_2L");
    }

    if (businessVintageMonths < 12) {
      reasons.push("NTC_NOT_ALLOWED_WITH_BUSINESS_VINTAGE_BELOW_1_YEAR");
    }
  } else if (score <= 725) {
    reasons.push("CIBIL_SCORE_NOT_ABOVE_725");
  }

  if (bureauFacts.enquiries6M >= 10 && !bureauFacts.disbursedLast6M) {
    reasons.push("ENQUIRIES_10_OR_MORE_LAST_6M_WITH_NO_DISBURSEMENT");
  }

  if (bureauFacts.unsecuredBLPLEnquiries3M > 5) {
    reasons.push("UNSECURED_BL_PL_ENQUIRIES_GT_5_LAST_3M");
  }

  if (bureauFacts.dpdLast3M) {
    reasons.push("DPD_FOUND_LAST_3M");
  }

  if (bureauFacts.dpdEvents6M > 1) {
    reasons.push("MORE_THAN_1_EMI_BOUNCE_LAST_6M");
  } else if (bureauFacts.dpdEvents6M === 1) {
    deviations.push("ONE_EMI_BOUNCE_LAST_6M_JUSTIFICATION_REQUIRED");
  }

  if (bureauFacts.liveUnsecuredBLPLCount > 3) {
    reasons.push("LIVE_UNSECURED_BL_PL_MORE_THAN_3");
  }

  /**
   * E. FI/FCU
   * If FI/FCU is not yet completed, keep BRE pending.
   */
  const officeFiStatus =
    loan.office_fi_status || loan.office_fcu_status;

  const residenceFiStatus =
    loan.residence_fi_status || loan.residence_fcu_status;

  if (!officeFiStatus) {
    pending.push("OFFICE_FI_FCU_PENDING");
  } else if (!isPositive(officeFiStatus)) {
    reasons.push("OFFICE_FI_FCU_NOT_POSITIVE");
  }

  if (!residenceFiStatus) {
    pending.push("RESIDENCE_FI_FCU_PENDING");
  } else if (!isPositive(residenceFiStatus)) {
    reasons.push("RESIDENCE_FI_FCU_NOT_POSITIVE");
  }

  let status = "BRE APPROVED";

  if (reasons.length > 0) {
    status = "BRE REJECTED";
  } else if (pending.length > 0) {
    status = "Pending";
  } else if (deviations.length > 0) {
    status = "Credit Initiated";
  }

  return {
    status,
    reasons,
    deviations,
    pending,
    bureauScore: score,
  };
};

const mapRoleToApplicantType = (role) => {
  const normalizedRole = normalize(role);

  if (normalizedRole === "APPLICANT") return "BORROWER";
  if (normalizedRole === "CO_APPLICANT") return "CO_APPLICANT";
  if (normalizedRole === "GUARANTOR") return "GUARANTOR";

  return normalizedRole;
};

const isAadhaarVerified = (status) => {
  const v = normalize(status);
  return v === "VERIFIED" || v === "COMPLETED";
};

const autoApproveFundifyIfAllVerified = async (lan) => {
  const pool = db.promise();

  const [loanRows] = await pool.query(
    `
    SELECT *
    FROM loan_booking_fundify
    WHERE lan = ?
    `,
    [lan]
  );

  if (!loanRows.length) {
    console.log("Fundify loan not found:", lan);
    return;
  }

  const loan = loanRows[0];

  const [applicants] = await pool.query(
    `
    SELECT *
    FROM fundify_applicants
    WHERE lan = ?
    ORDER BY party_no ASC, id ASC
    `,
    [lan]
  );

  const primaryApplicant = applicants.find(
    (a) => normalize(a.role) === "APPLICANT"
  );

  if (!primaryApplicant) {
    await pool.query(
      `
      UPDATE loan_booking_fundify
      SET
        bre_status = ?,
        bre_reason = ?,
        reject_reason = ?,
        status = ?,
        stage = ?
      WHERE lan = ?
      `,
      [
        "BRE REJECTED",
        "PRIMARY_APPLICANT_MISSING",
        "PRIMARY_APPLICANT_MISSING",
        "Rejected",
        "BRE Rejected",
        lan,
      ]
    );

    return;
  }

  /**
   * KYC gating.
   * This enforces PAN + Aadhaar + Bureau for all captured Fundify parties.
   * If your Aadhaar flow is async, the first run will remain Pending until webhook updates Aadhaar to VERIFIED/COMPLETED.
   */
  const [kycRows] = await pool.query(
    `
    SELECT applicant_type, pan_status, aadhaar_status, bureau_status
    FROM kyc_verification_status
    WHERE lan = ?
    `,
    [lan]
  );

  const kycPendingReasons = [];

  for (const applicant of applicants) {
    const applicantType = mapRoleToApplicantType(applicant.role);

    const kyc = kycRows.find(
      (row) => normalize(row.applicant_type) === normalize(applicantType)
    );

    if (!kyc) {
      kycPendingReasons.push(`${applicantType}_KYC_ROW_MISSING`);
      continue;
    }

    if (kyc.pan_status !== "VERIFIED") {
      kycPendingReasons.push(`${applicantType}_PAN_STATUS=${kyc.pan_status || "NA"}`);
    }

    if (!isAadhaarVerified(kyc.aadhaar_status)) {
      kycPendingReasons.push(
        `${applicantType}_AADHAAR_STATUS=${kyc.aadhaar_status || "NA"}`
      );
    }

    if (kyc.bureau_status !== "VERIFIED") {
      kycPendingReasons.push(
        `${applicantType}_BUREAU_STATUS=${kyc.bureau_status || "NA"}`
      );
    }
  }

  if (kycPendingReasons.length > 0) {
    await pool.query(
      `
      UPDATE loan_booking_fundify
      SET
        bre_status = ?,
        bre_reason = ?,
        status = ?,
        stage = ?
      WHERE lan = ?
      `,
      [
        "Pending",
        kycPendingReasons.join(", "),
        "Login",
        "KYC Pending",
        lan,
      ]
    );

    return;
  }

  const [cibilRows] = await pool.query(
    `
    SELECT score, report_xml, created_at
    FROM loan_cibil_reports
    WHERE lan = ?
    AND applicant_type = 'BORROWER'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [lan]
  );

  if (!cibilRows.length || !cibilRows[0].report_xml) {
    await pool.query(
      `
      UPDATE loan_booking_fundify
      SET
        bre_status = ?,
        bre_reason = ?,
        status = ?,
        stage = ?
      WHERE lan = ?
      `,
      ["Pending", "BUREAU_REPORT_MISSING", "Login", "BRE Pending", lan]
    );

    return;
  }

  const bureauFacts = extractFundifyBureauFacts(cibilRows[0].report_xml);

  const decision = evaluateFundifyPolicy({
    loan,
    primaryApplicant,
    applicants,
    bureauFacts,
  });

  const reasonText = [
    ...(decision.reasons || []),
    ...(decision.deviations || []),
    ...(decision.pending || []),
  ].length
    ? [
        ...decision.reasons,
        ...decision.deviations,
        ...decision.pending,
      ].join(", ")
    : "ELIGIBLE";

  let finalStatus = "Credit Initiated";
  let finalStage = "BRE Approved";

  if (decision.status === "BRE REJECTED") {
    finalStatus = "Rejected";
    finalStage = "BRE Rejected";
  }

  if (decision.status === "Pending") {
    finalStatus = "Login";
    finalStage = "BRE Pending";
  }

  if (decision.status === "Credit Initiated") {
    finalStatus = "Credit Initiated";
    finalStage = "BRE Deviation";
  }

  await pool.query(
    `
    UPDATE loan_booking_fundify
    SET
      bre_status = ?,
      bre_reason = ?,
      reject_reason = ?,
      cibil_score = ?,
      bureau_score = ?,
      status = ?,
      stage = ?
    WHERE lan = ?
    `,
    [
      decision.status,
      reasonText,
      decision.reasons.length ? decision.reasons.join(", ") : null,
      decision.bureauScore,
      decision.bureauScore,
      finalStatus,
      finalStage,
      lan,
    ]
  );

  console.log(
    `Fundify BRE completed for ${lan}: ${decision.status} | ${reasonText}`
  );
};

module.exports = {
  autoApproveFundifyIfAllVerified,
  extractFundifyBureauFacts,
  evaluateFundifyPolicy,
};