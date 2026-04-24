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

/**
 * Extract LoanDigit bureau facts from bureau XML
 *
 * Based on policy:
 * - Min score 700
 * - Enquiries <= 5 in last 6 months
 * - No DPD in last 6 months
 * - No loans >30 DPD in last 12 months
 * - No loan >60 DPD ever
 * - No more than 1 PAN reported
 * - Deviation possible only if DPD loan closed and fresh loan granted after that
 */
const extractLoanDigitBureauFacts = (reportXml) => {
  if (!reportXml) {
    return {
      score: null,
      enquiries6m: null,
      hasDpdIn6M: false,
      hasGt30Dpd12M: false,
      hasGt60DpdEver: false,
      totalPanReported: 0,
      closedLoanWithOldDpd: false,
      newLoanAfterOldDpd: false,
      deviationEligible: false,
    };
  }

  const json = parser.parse(reportXml);
  const profile = json?.INProfileResponse || {};

  const score =
  toNumber(profile?.SCORE?.BureauScore, null) ??
  toNumber(profile?.Score?.BureauScore, null) ??
  toNumber(profile?.Score?.Value, null);

  const enquiries6m =
    toNumber(profile?.TotalCAPS_Summary?.TotalCAPSLast180Days, null) ??
    toNumber(profile?.TotalCAPS_Summary?.TotalCAPSLast6Months, null);

  const accounts = toArray(profile?.CAIS_Account?.CAIS_Account_DETAILS);

  let hasDpdIn6M = false;
  let hasGt30Dpd12M = false;
  let hasGt60DpdEver = false;
  let closedLoanWithOldDpd = false;
  let newLoanAfterOldDpd = false;

  const now = new Date();
  let latestOldDpdClosedDate = null;

  const panReportedRaw =
  profile?.Current_Application
    ?.Current_Application_Details
    ?.Current_Applicant_Details
    ?.IncomeTaxPan || null;

 const totalPanReported = panReportedRaw ? 1 : 0;

  const debug = {
    score,
    enquiries6m,
    accountsAnalyzed: accounts.length,
    details: [],
    flags: {},
  };

  for (const acc of accounts) {
    const histories = toArray(acc?.CAIS_Account_History);

    const dateOpened =
      parseDateYYYYMMDD(acc?.Date_Opened_Or_Disbursed) ||
      parseDateYYYYMMDD(acc?.DateOpenedDisbursed) ||
      parseDateYYYYMMDD(acc?.Date_Opened) ||
      parseDateYYYYMMDD(acc?.Open_Date);

    const dateClosed =
      parseDateYYYYMMDD(acc?.Date_Closed) ||
      parseDateYYYYMMDD(acc?.DateClosed) ||
      parseDateYYYYMMDD(acc?.Date_Closed_Or_Settled)

    const accountStatus = String(acc?.Account_Status || "").toUpperCase();

    const accountDebug = {
      accountNumber: acc?.Account_Number || "NA",
      accountStatus,
      dateOpened: acc?.Date_Opened_Or_Disbursed || acc?.DateOpenedDisbursed || acc?.Date_Opened || null,
      dateClosed: acc?.Date_Closed || acc?.DateClosed || null,
      dpdHistory: [],
    };

    let accountHadDpd = false;

    for (const hist of histories) {
      const year = toNumber(hist?.Year, null);
      const month = toNumber(hist?.Month, null);
      const dpd = toNumber(hist?.Days_Past_Due, 0);

      if (!year || !month) continue;

      const histDate = new Date(year, month - 1, 1);
      const diff = monthsDiff(histDate, now);

      if (diff === null || diff < 0) continue;

      accountDebug.dpdHistory.push({
        year,
        month,
        dpd,
        monthsAgo: diff,
      });

      if (diff < 6 && dpd > 0) {
        hasDpdIn6M = true;
      }

      if (diff < 12 && dpd > 30) {
        hasGt30Dpd12M = true;
      }

      if (dpd > 60) {
        hasGt60DpdEver = true;
      }

      if (dpd > 0) {
        accountHadDpd = true;
      }
    }

    if (
      accountHadDpd &&
      (accountStatus.includes("CLOSED") || dateClosed)
    ) {
      closedLoanWithOldDpd = true;

      if (!latestOldDpdClosedDate || (dateClosed && dateClosed > latestOldDpdClosedDate)) {
        latestOldDpdClosedDate = dateClosed || latestOldDpdClosedDate;
      }
    }

    debug.details.push(accountDebug);
  }

  if (latestOldDpdClosedDate) {
    for (const acc of accounts) {
      const dateOpened =
        parseDateYYYYMMDD(acc?.Date_Opened_Or_Disbursed) ||
        parseDateYYYYMMDD(acc?.DateOpenedDisbursed) ||
        parseDateYYYYMMDD(acc?.Date_Opened) ||
        parseDateYYYYMMDD(acc?.Open_Date);


      if (dateOpened && dateOpened > latestOldDpdClosedDate) {
        newLoanAfterOldDpd = true;
        break;
      }
    }
  }

  const deviationEligible = closedLoanWithOldDpd && newLoanAfterOldDpd;

  debug.flags = {
    hasDpdIn6M,
    hasGt30Dpd12M,
    hasGt60DpdEver,
    totalPanReported,
    closedLoanWithOldDpd,
    newLoanAfterOldDpd,
    deviationEligible,
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("📊 LoanDigit Bureau Debug:");
    console.dir(debug, { depth: null });
  }

  return {
    score,
    enquiries6m,
    hasDpdIn6M,
    hasGt30Dpd12M,
    hasGt60DpdEver,
    totalPanReported,
    closedLoanWithOldDpd,
    newLoanAfterOldDpd,
    deviationEligible,
  };
};

const evaluateLoanDigitPolicy = ({ loan, bureauFacts }) => {
  const reasons = [];
  const deviations = [];

  const age = calculateAge(loan.dob);
const monthlyIncome = toNumber(loan.monthly_salary, 0);
const companyContinuity = toNumber(loan.years_in_current_job, 0);
const occupation = String(loan.employment || "").trim().toLowerCase();

  const bureauScore = toNumber(bureauFacts.score, null);

  /**
   * AGE CHECK
   */
  if (age === null) {
    reasons.push("AGE_MISSING");
  } else {
    if (age < 23) reasons.push("AGE_BELOW_23");
    if (age > 45) reasons.push("AGE_ABOVE_45");
  }

  /**
   * OCCUPATION CHECK
   */
if (!occupation.includes("salary")) {
  reasons.push("ONLY_SALARIED_ALLOWED");
}

  /**
   * COMPANY CONTINUITY
   */
  if (companyContinuity < 6) {
    reasons.push("COMPANY_CONTINUITY_BELOW_6M");
  }

  /**
   * MONTHLY INCOME
   */
  if (monthlyIncome < 20000) {
    reasons.push("MONTHLY_INCOME_BELOW_20000");
  }

  /**
   * CIBIL SCORE
   */
  if (bureauScore === null) {
    reasons.push("CIBIL_MISSING");
  } else if (bureauScore < 700) {
    reasons.push("CIBIL_BELOW_700");
  }

  /**
   * ENQUIRIES CHECK
   */
  if (
    bureauFacts.enquiries6m !== null &&
    bureauFacts.enquiries6m > 5
  ) {
    reasons.push("ENQUIRIES_GT_5_IN_6M");
  }

  /**
   * DPD LAST 6 MONTHS
   */
  if (bureauFacts.hasDpdIn6M) {
    reasons.push("DPD_PRESENT_LAST_6M");
  }

  /**
   * DPD >30 LAST 12 MONTHS
   */
  if (bureauFacts.hasGt30Dpd12M) {
    if (bureauFacts.deviationEligible) {
      deviations.push("GT30_DPD_12M_DEVIATION");
    } else {
      reasons.push("GT30_DPD_LAST_12M");
    }
  }

  /**
   * DPD >60 EVER
   */
  if (bureauFacts.hasGt60DpdEver) {
    if (bureauFacts.deviationEligible) {
      deviations.push("GT60_DPD_EVER_DEVIATION");
    } else {
      reasons.push("GT60_DPD_EVER");
    }
  }

  /**
   * MULTIPLE PAN CHECK
   */
  if (bureauFacts.totalPanReported > 1) {
    reasons.push("MULTIPLE_PAN_REPORTED");
  }

  /**
   * FINAL STATUS
   */
  let status = "BRE APPROVED";

  if (reasons.length > 0) {
    status = "BRE FAILED";
  } else if (deviations.length > 0) {
    status = "Credit Recheck";
  }

  return {
    status,
    reasons,
    deviations,
    bureauScore,
  };
};

const autoApproveLoanDigitIfAllVerified = async (lan) => {
  const pool = db.promise();

  // 1) KYC row
  const [kycRows] = await pool.query(
    `SELECT bureau_status
     FROM kyc_verification_status
     WHERE lan = ?`,
    [lan]
  );

  if (!kycRows.length) {
    console.log("No KYC row found for LAN:", lan);
    return;
  }

  const kyc = kycRows[0];

if (kyc.bureau_status !== "VERIFIED") {
  await pool.query(
    `UPDATE loan_booking_loan_digit
     SET loandigit_bre_status = ?,
         loandigit_bre_reason = ?,
         loandigit_bre_checked_at = NOW()
     WHERE lan = ?`,
    ["Pending", `BUREAU_STATUS=${kyc.bureau_status || "NA"}`, lan]
  );

  return;
}

  // 2) Loan row
  const [loanRows] = await pool.query(
    `SELECT
    lan,
    dob,
    employment,
    years_in_current_job,
    monthly_salary,
    cibil_score
     FROM loan_booking_loan_digit
     WHERE lan = ?`,
    [lan]
  );

  if (!loanRows.length) {
    console.log("LoanDigit loan not found for LAN:", lan);
    return;
  }

  const loan = loanRows[0];

  // 3) Latest bureau XML
  const [cibilRows] = await pool.query(
    `SELECT score, report_xml, created_at
     FROM loan_cibil_reports
     WHERE lan = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [lan]
  );

  if (!cibilRows.length || !cibilRows[0].report_xml) {
    await pool.query(
      `UPDATE loan_booking_loan_digit
       SET loandigit_bre_status = ?,
           loandigit_bre_reason = ?,
           loandigit_bre_checked_at = NOW()
       WHERE lan = ?`,
      ["Pending", "BUREAU_REPORT_MISSING", lan]
    );
    return;
  }

  const bureauFacts = extractLoanDigitBureauFacts(cibilRows[0].report_xml);
  const decision = evaluateLoanDigitPolicy({ loan, bureauFacts });

  const reasonText = [
    ...(decision.reasons || []),
    ...(decision.deviations || []),
  ].length
    ? [...decision.reasons, ...decision.deviations].join(", ")
    : "ELIGIBLE";

  let finalStage = "BRE_APPROVED";
  if (decision.status === "BRE FAILED") finalStage = "BRE_REJECTED";
  if (decision.status === "Credit Recheck") finalStage = "CREDIT_RECHECK";

  await pool.query(
  `UPDATE loan_booking_loan_digit
   SET
     loandigit_bre_status = ?,
     loandigit_bre_reason = ?,
     loandigit_bre_checked_at = NOW(),

     fintree_cibil_score = ?,
     loandigit_enquiries_6m = ?,
     loandigit_dpd_6m_flag = ?,
     loandigit_dpd_gt30_12m_flag = ?,
     loandigit_dpd_gt60_ever_flag = ?,
     loandigit_multi_pan_flag = ?,
     loandigit_deviation_flag = ?,

     status = ?
   WHERE lan = ?`,
  [
    decision.status,
    reasonText,

    decision.bureauScore,
    bureauFacts.enquiries6m,
    bureauFacts.hasDpdIn6M ? 1 : 0,
    bureauFacts.hasGt30Dpd12M ? 1 : 0,
    bureauFacts.hasGt60DpdEver ? 1 : 0,
    bureauFacts.totalPanReported > 1 ? 1 : 0,
    bureauFacts.deviationEligible ? 1 : 0,

    decision.status,
    lan,
  ]
);

  console.log(
    `LoanDigit BRE completed for ${lan}: ${decision.status} | ${reasonText}`
  );
};

module.exports = {
  autoApproveLoanDigitIfAllVerified,
  extractLoanDigitBureauFacts,
  evaluateLoanDigitPolicy,
};