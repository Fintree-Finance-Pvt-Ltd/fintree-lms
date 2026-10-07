const db = require("../../config/db");
const { XMLParser } = require("fast-xml-parser");
const {
  extractMotionCorpBureauFacts,
  evaluateMotionCorpPolicy,
} = require("../MotionCorp/motionCorpBRE");
const {
  screenLoanBooking,
} = require("../../services/trackwizz/screeningService");

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

const toArray = (v) => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

const toNumber = (v, fallback = 0) => {
  if (v === null || v === undefined || v === "") return fallback;

  const n = Number(v);

  return Number.isFinite(n) ? n : fallback;
};

const parseDateYYYYMMDD = (s) => {
  if (!s || String(s).length !== 8) return null;

  const str = String(s);

  const y = Number(str.slice(0, 4));
  const m = Number(str.slice(4, 6)) - 1;
  const d = Number(str.slice(6, 8));

  const dt = new Date(y, m, d);

  return Number.isNaN(dt.getTime()) ? null : dt;
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

  const m = today.getMonth() - birthDate.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};

const extractSevenFinCorpBureauFacts = (reportXml) => {
  if (!reportXml) {
    return {
      score: null,
      enquiries30d: 0,
      hasDpd3M: false,
      hasDpd6M: false,
      hasOverdue12M: false,
      hasWrittenOff3Y: false,
      has60Plus24M: false,
      has90Plus36M: false,
      emiOverdueAmount: 0,
      ccOverdueAmount: 0,
    };
  }

  const json = parser.parse(reportXml);

  const profile = json?.INProfileResponse || {};

  const score =
    toNumber(profile?.SCORE?.BureauScore, null) ??
    toNumber(profile?.Score?.BureauScore, null) ??
    toNumber(profile?.Score?.Value, null);

  const enquiries30d =
    toNumber(profile?.CAPS?.CAPS_Summary?.CAPSLast30Days, 0);

  const accounts = toArray(profile?.CAIS_Account?.CAIS_Account_DETAILS);

  let hasDpd3M = false;
  let hasDpd6M = false;
  let hasOverdue12M = false;
  let hasWrittenOff3Y = false;
  let has60Plus24M = false;
  let has90Plus36M = false;

  let emiOverdueAmount = 0;
  let ccOverdueAmount = 0;

  const now = new Date();

  for (const acc of accounts) {
    const histories = toArray(acc?.CAIS_Account_History);

    const accountType = String(acc?.Account_Type || "").trim();

    const writtenOffStatus = String(
      acc?.Written_Off_Settled_Status || "",
    ).toUpperCase();

    if (
      writtenOffStatus.includes("WRITTEN") ||
      writtenOffStatus.includes("SETTLED")
    ) {
      hasWrittenOff3Y = true;
    }

    const currentBalance = toNumber(
      acc?.Current_Balance || acc?.Amount_Overdue,
      0,
    );

    // Credit Card type = 05
    const isCreditCard = accountType === "05";

    if (currentBalance > 0) {
      if (isCreditCard) {
        ccOverdueAmount += currentBalance;
      } else {
        emiOverdueAmount += currentBalance;
      }
    }

    for (const hist of histories) {
      const year = toNumber(hist?.Year, null);
      const month = toNumber(hist?.Month, null);
      const dpd = toNumber(hist?.Days_Past_Due, 0);

      if (!year || !month) continue;

      const histDate = new Date(year, month - 1, 1);

      const diff = monthsDiff(histDate, now);

      if (diff === null || diff < 0) continue;

      if (diff < 3 && dpd > 0) {
        hasDpd3M = true;
      }

      if (diff < 6 && dpd > 0) {
        hasDpd6M = true;
      }

      if (diff < 12 && dpd > 0) {
        hasOverdue12M = true;
      }

      if (diff < 24 && dpd >= 60) {
        has60Plus24M = true;
      }

      if (diff < 36 && dpd >= 90) {
        has90Plus36M = true;
      }
    }
  }

  return {
    score,
    enquiries30d,
    hasDpd3M,
    hasDpd6M,
    hasOverdue12M,
    hasWrittenOff3Y,
    has60Plus24M,
    has90Plus36M,
    emiOverdueAmount,
    ccOverdueAmount,
  };
};

const evaluateSevenFinCorpPolicy = ({ loan, bureauFacts }) => {
  const reasons = [];
  const deviations = [];

  const age = calculateAge(loan.dob);

  const loanAmount = toNumber(loan.requested_loan_amount, 0);

  const tenure = toNumber(loan.loan_tenure, 0);

  // const apr = toNumber(
  //   loan.apr || loan.interest_rate,
  //   0,
  // );

  const score = toNumber(bureauFacts.score, null);

  /**
   * AGE
   */
  if (age === null) {
    reasons.push("AGE_MISSING");
  } else {
    if (age < 18) reasons.push("AGE_BELOW_18");

    if (age > 58) reasons.push("AGE_ABOVE_58");
  }

  /**
   * SCORE
   */
  /**
 * SCORE / NTC
 */
if (score === null || score < 200) {
  reasons.push(
    "NTC_BANK_STATEMENT_REQUIRED",
  );
}

if (
  score >= 200 &&
  score < 680
) {
  reasons.push("CIBIL_BELOW_680");
}

  /**
   * LOAN AMOUNT
   */
  if (loanAmount < 50000) {
    reasons.push("LOAN_AMOUNT_BELOW_50000");
  }

  if (loanAmount > 140000) {
    reasons.push("LOAN_AMOUNT_ABOVE_140000_LIMIT");
  }

  /**
   * TENURE
   */
  if (tenure < 12 || tenure > 24) {
    reasons.push("TENURE_OUTSIDE_12_TO_24");
  }

  /**
   * ENQUIRIES
   */
  if (bureauFacts.enquiries30d > 3) {
    reasons.push("ENQUIRIES_GT_3_LAST_30D");
  }

  /**
   * DPD RULES
   */

  if (bureauFacts.hasDpd6M) {
    reasons.push("DPD_FOUND_IN_LAST_6_MONTHS");
  }

  /**
   * OVERDUE
   */
  if (bureauFacts.hasOverdue12M) {
    reasons.push("OVERDUE_FOUND_IN_LAST_12_MONTHS");
  }

  /**
   * WRITTEN OFF
   */
  if (bureauFacts.hasWrittenOff3Y) {
    deviations.push("WRITTEN_OFF_OR_SETTLED_IN_LAST_3_YEARS");
  }

  /**
   * 60+ / 90+ DPD
   */
  if (bureauFacts.has60Plus24M) {
    deviations.push("60PLUS_DPD_24M_DEVIATION");
  }

  if (bureauFacts.has90Plus36M) {
    deviations.push("90PLUS_DPD_36M_DEVIATION");
  }

  /**
   * OVERDUE AMOUNT
   */
  if (bureauFacts.emiOverdueAmount > 3000) {
    deviations.push("EMI_OVERDUE_GT_3000");
  }

  if (bureauFacts.ccOverdueAmount > 5000) {
    deviations.push("CC_OVERDUE_GT_5000");
  }

  /**
   * FINAL STATUS
   */
  let status = "BRE APPROVED";

  if (reasons.length > 0) {
    status = "BRE REJECTED";
  } else if (deviations.length > 0) {
    status = "Credit Initiated";
  }

  return {
    status,
    reasons,
    deviations,
    bureauScore: score,
  };
};

/**
 * ===========================================================
 * AML SCREENING (TrackWizz) — every party present on the LAN
 * ===========================================================
 * Each party is screened under its own partner key, so the
 * existing-screening reuse, report file name and loan_documents
 * row (doc_name = AML_REPORT) stay separate per person.
 */
const SEVEN_FINCORP_AML_PARTIES = [
  { applicantType: "BORROWER", partnerKey: "seven_fincorp" },
  { applicantType: "GUARANTOR", partnerKey: "seven_fincorp_guarantor" },
  { applicantType: "CO_APPLICANT", partnerKey: "seven_fincorp_co_applicant" },
];

const hasValue = (value) => {
  if (value === null || value === undefined) return false;

  if (typeof value === "string") {
    return value.trim() !== "";
  }

  return true;
};

const getPresentParties = (loan) => {
  const parties = ["BORROWER"];

  if (
    [loan.guarantor_name, loan.guarantor_mobile, loan.guarantor_pan].some(
      hasValue,
    )
  ) {
    parties.push("GUARANTOR");
  }

  if (
    [
      loan.co_applicant_name,
      loan.co_applicant_mobile,
      loan.co_applicant_pan,
    ].some(hasValue)
  ) {
    parties.push("CO_APPLICANT");
  }

  return parties;
};

/**
 * Screens borrower + guarantor/co-applicant (whoever is present).
 * Already-screened parties are reused by screenLoanBooking, so calling
 * this from final submit and again from the BRE does not re-hit TrackWizz.
 *
 * overallStatus: STOP > REVIEW > ERROR > PROCEED
 */
const runSevenFincorpAmlScreening = async (lan) => {
  const pool = db.promise();

  const [loanRows] = await pool.query(
    `
    SELECT
      lan,
      guarantor_name,
      guarantor_mobile,
      guarantor_pan,
      co_applicant_name,
      co_applicant_mobile,
      co_applicant_pan
    FROM loan_booking_seven_fincorp
    WHERE lan = ?
    LIMIT 1
    `,
    [lan],
  );

  if (!loanRows.length) {
    throw new Error(`Seven Fincorp loan not found: ${lan}`);
  }

  const presentParties = getPresentParties(loanRows[0]);

  const results = [];

  for (const party of SEVEN_FINCORP_AML_PARTIES) {
    if (!presentParties.includes(party.applicantType)) continue;

    try {
      const aml = await screenLoanBooking(party.partnerKey, lan);

      results.push({
        applicantType: party.applicantType,
        status: String(aml.amlStatus || "")
          .trim()
          .toUpperCase(),
        reason: aml.amlReason || "",
      });
    } catch (error) {
      console.error(
        `Seven Fincorp AML failed for ${lan} (${party.applicantType}):`,
        error.message,
      );

      results.push({
        applicantType: party.applicantType,
        status: "ERROR",
        reason: `AML unavailable: ${error.message}`.slice(0, 255),
      });
    }
  }

  const statuses = results.map((result) => result.status);

  let overallStatus = "PROCEED";

  if (statuses.includes("STOP")) {
    overallStatus = "STOP";
  } else if (statuses.includes("REVIEW")) {
    overallStatus = "REVIEW";
  } else if (statuses.some((status) => status !== "PROCEED")) {
    overallStatus = "ERROR";
  }

  return { overallStatus, results };
};

/**
 * ===========================================================
 * MAIN BRE
 * ===========================================================
 */
const autoApproveSevenFinCorpIfAllVerified = async (lan) => {
  const pool = db.promise();

  const setPending = async (reason) => {
    await pool.query(
      `
      UPDATE loan_booking_seven_fincorp
      SET
        seven_fincorp_bre_status = ?,
        seven_fincorp_bre_reason = ?,
        seven_fincorp_bre_checked_at = NOW()
      WHERE lan = ?
      `,
      ["Pending", String(reason).slice(0, 1000), lan],
    );
  };

  const normalizeStatus = (status) =>
    String(status || "")
      .trim()
      .toUpperCase();

  /**
   * LOAN
   */
  const [loanRows] = await pool.query(
    `
    SELECT
      lan,
      dob,
      pan_card,
      requested_loan_amount,
      loan_tenure,
      interest_rate,
      cibil_score,
      seven_fincorp_bureau_screening_status,
      guarantor_name,
      guarantor_mobile,
      guarantor_pan,
      co_applicant_name,
      co_applicant_mobile,
      co_applicant_pan
    FROM loan_booking_seven_fincorp
    WHERE lan = ?
    LIMIT 1
    `,
    [lan],
  );

  if (!loanRows.length) {
    console.log("Seven Fincorp loan not found:", lan);
    return;
  }

  const loan = loanRows[0];

  /**
   * Address-tab bureau screening must be complete before the final BRE.
   */
  const screeningStatus = normalizeStatus(
    loan.seven_fincorp_bureau_screening_status,
  );

  if (!["BUREAU APPROVED", "BUREAU REJECTED"].includes(screeningStatus)) {
    await setPending(`BUREAU_SCREENING_STATUS=${screeningStatus || "NOT_RUN"}`);
    return;
  }

  /**
   * KYC — PAN, AADHAAR and BUREAU must be VERIFIED for the borrower
   * and for the guarantor / co-applicant present on the loan.
   */
  const presentParties = getPresentParties(loan);

  if (presentParties.length === 1) {
    await setPending("SECOND_PARTY_MISSING");
    return;
  }

  for (const applicantType of presentParties) {
    const [kycRows] = await pool.query(
      `
      SELECT
        pan_status,
        aadhaar_status,
        bureau_status
      FROM kyc_verification_status
      WHERE lan = ?
        AND UPPER(TRIM(applicant_type)) = ?
        AND party_no = 1
      LIMIT 1
      `,
      [lan, applicantType],
    );

    if (!kycRows.length) {
      await setPending(`${applicantType}_1_KYC_ROW_MISSING`);
      return;
    }

    const kyc = kycRows[0];

    const incomplete = Object.entries({
      PAN: kyc.pan_status,
      AADHAAR: kyc.aadhaar_status,
      BUREAU: kyc.bureau_status,
    })
      .filter(([, status]) => normalizeStatus(status) !== "VERIFIED")
      .map(
        ([verificationType, status]) =>
          `${applicantType}_1_${verificationType}_STATUS=${
            normalizeStatus(status) || "NA"
          }`,
      );

    if (incomplete.length > 0) {
      const pendingReason = incomplete.join(", ");

      await setPending(pendingReason);

      console.log(`Seven Fincorp BRE pending for ${lan}: ${pendingReason}`);
      return;
    }
  }

  /**
   * BORROWER BUREAU XML
   */
  const [cibilRows] = await pool.query(
    `
    SELECT score, report_xml, created_at
    FROM loan_cibil_reports
    WHERE TRIM(lan) = TRIM(?)
      AND UPPER(TRIM(applicant_type)) = 'BORROWER'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [lan],
  );

  if (!cibilRows.length || !hasValue(cibilRows[0].report_xml)) {
    await setPending("BUREAU_REPORT_MISSING");
    return;
  }

  let bureauFacts;

  try {
    bureauFacts = extractMotionCorpBureauFacts(cibilRows[0].report_xml);
  } catch (error) {
    console.error("Seven Fincorp bureau XML parsing failed:", {
      lan,
      message: error.message,
    });

    await setPending("BUREAU_REPORT_PARSE_FAILED");
    return;
  }

  /**
   * AML — borrower + guarantor / co-applicant
   */
  const aml = await runSevenFincorpAmlScreening(lan);

  if (aml.overallStatus === "ERROR") {
    const amlErrors = aml.results
      .filter((result) => result.status !== "PROCEED")
      .map((result) => `${result.applicantType}_AML=${result.status || "NA"}`)
      .join(", ");

    await setPending(amlErrors || "AML_STATUS=ERROR");
    return;
  }

  /**
   * EVALUATE
   */
  const decision = evaluateMotionCorpPolicy({
    loan,
    bureauFacts,
    amlStatus: aml.overallStatus,
  });

  const reasonParts = [...decision.reasons, ...decision.deviations];

  for (const result of aml.results) {
    if (result.status === "STOP" || result.status === "REVIEW") {
      reasonParts.push(`${result.applicantType} AML: ${result.reason}`);
    }
  }

  const reasonText = reasonParts.length ? reasonParts.join(", ") : "ELIGIBLE";

  let finalStatus = "Credit Initiated";
  let finalStage = "BRE Approved";

  if (decision.status === "BRE REJECTED") {
    finalStatus = "Rejected";
    finalStage = "BRE Rejected";
  }

  if (decision.status === "BRE DEVIATION") {
    finalStatus = "Credit Initiated";
    finalStage = "BRE Deviation";
  }

  await pool.query(
    `
    UPDATE loan_booking_seven_fincorp
    SET
      seven_fincorp_bre_status = ?,
      seven_fincorp_bre_reason = ?,
      seven_fincorp_bre_checked_at = NOW(),

      fintree_cibil_score = ?,
      seven_fincorp_enquiries_30d = ?,
      seven_fincorp_dpd_3m_flag = ?,
      seven_fincorp_dpd_6m_flag = ?,
      seven_fincorp_overdue_12m_flag = ?,
      seven_fincorp_written_off_3y_flag = ?,
      seven_fincorp_60plus_24m_flag = ?,
      seven_fincorp_90plus_36m_flag = ?,
      seven_fincorp_emi_overdue_amount = ?,
      seven_fincorp_cc_overdue_amount = ?,
      seven_fincorp_deviation_flag = ?,

      status = ?,
      stage = ?
    WHERE lan = ?
    `,
    [
      decision.status,
      reasonText.slice(0, 1000),

      decision.bureauScore,
      bureauFacts.enquiries30d,
      bureauFacts.hasDpd3M ? 1 : 0,
      bureauFacts.hasDpd6M ? 1 : 0,
      bureauFacts.hasOverdue12M ? 1 : 0,
      bureauFacts.hasWrittenOff3Y ? 1 : 0,
      bureauFacts.has60Plus24M ? 1 : 0,
      bureauFacts.has90Plus36M ? 1 : 0,
      bureauFacts.emiOverdueAmount,
      bureauFacts.ccOverdueAmount,
      decision.deviations.length > 0 ? 1 : 0,

      finalStatus,
      finalStage,
      lan,
    ],
  );

  console.log(
    `Seven Fincorp BRE completed for ${lan}: ${decision.status} | ${reasonText}`,
  );
};

module.exports = {
  autoApproveSevenFinCorpIfAllVerified,
  runSevenFincorpAmlScreening,
  extractSevenFinCorpBureauFacts: extractMotionCorpBureauFacts,
  evaluateSevenFinCorpPolicy: evaluateMotionCorpPolicy,
};
