// const db = require("../../config/db");
// const { XMLParser } = require("fast-xml-parser");

// const parser = new XMLParser({
//   ignoreAttributes: false,
//   attributeNamePrefix: "",
//   trimValues: true,

//   // Keep entity processing enabled, but raise limits for valid large bureau XML.
//   processEntities: {
//     enabled: true,
//     maxTotalExpansions: 200000,
//     maxExpandedLength: 20_000_000,
//     maxEntityCount: 200000,
//     maxEntitySize: 200000,
//   },
// });

// const toArray = (v) => {
//   if (!v) return [];
//   return Array.isArray(v) ? v : [v];
// };

// const toNumber = (v, fallback = 0) => {
//   if (v === null || v === undefined || v === "") return fallback;

//   const n = Number(v);

//   return Number.isFinite(n) ? n : fallback;
// };

// const parseDateYYYYMMDD = (s) => {
//   if (!s || String(s).length !== 8) return null;
//   const str = String(s);
//   const y = Number(str.slice(0, 4));
//   const m = Number(str.slice(4, 6)) - 1;
//   const d = Number(str.slice(6, 8));
//   const dt = new Date(y, m, d);
//   return Number.isNaN(dt.getTime()) ? null : dt;
// };

// const monthsDiff = (fromDate, toDate = new Date()) => {
//   if (!fromDate) return null;

//   return (
//     (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
//     (toDate.getMonth() - fromDate.getMonth())
//   );
// };

// const calculateAge = (dob) => {
//   if (!dob) return null;

//   const birthDate = new Date(dob);

//   if (Number.isNaN(birthDate.getTime())) return null;

//   const today = new Date();

//   let age = today.getFullYear() - birthDate.getFullYear();

//   const m = today.getMonth() - birthDate.getMonth();

//   if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
//     age--;
//   }

//   return age;
// };

// const extractMotionCorpBureauFacts = (reportXml) => {
//   if (!reportXml) {
//     return {
//       score: null,
//       enquiries30d: 0,
//       hasDpd3M: false,
//       hasDpd6M: false,
//       hasOverdue12M: false,
//       hasWrittenOff3Y: false,
//       has60Plus24M: false,
//       has90Plus36M: false,
//       emiOverdueAmount: 0,
//       ccOverdueAmount: 0,
//     };
//   }

//   const json = parser.parse(reportXml);

//   const profile = json?.INProfileResponse || {};

//   const score =
//     toNumber(profile?.SCORE?.BureauScore, null) ??
//     toNumber(profile?.Score?.BureauScore, null) ??
//     toNumber(profile?.Score?.Value, null);

//   const enquiries30d = toNumber(profile?.CAPS?.CAPS_Summary?.CAPSLast30Days, 0);

//   const accounts = toArray(profile?.CAIS_Account?.CAIS_Account_DETAILS);

//   let hasDpd3M = false;
//   let hasDpd6M = false;
//   let hasOverdue12M = false;
//   let hasWrittenOff3Y = false;
//   let has60Plus24M = false;
//   let has90Plus36M = false;

//   let emiOverdueAmount = 0;
//   let ccOverdueAmount = 0;

//   const now = new Date();

//   for (const acc of accounts) {
//     const histories = toArray(acc?.CAIS_Account_History);

//     const accountType = String(acc?.Account_Type || "").trim();

//     // Experian tag = Written_off_Settled_Status (lowercase "off"); value is a code.
//     // 99 = status cleared, so ignore it. Any other non-empty code = WO/Settled.
//     const woStatus = String(acc?.Written_off_Settled_Status ?? "").trim();

//     if (woStatus && woStatus !== "99") {
//       const woDate =
//         parseDateYYYYMMDD(acc?.WriteOffStatusDate) ||
//         parseDateYYYYMMDD(acc?.Date_Reported);

//       const diffWo = monthsDiff(woDate);

//       if (diffWo === null || diffWo < 36) {
//         hasWrittenOff3Y = true;
//       }
//     }

//     const accountStatus = String(acc?.Account_Status || "").trim();

//     const isClosed =
//       ["13", "14", "15", "16", "17"].includes(accountStatus) ||
//       !!acc?.Date_Closed;

//     // Overdue must come from Amount_Past_Due, NOT Current_Balance
//     const pastDue = toNumber(acc?.Amount_Past_Due, 0);

//     // Experian: Account_Type 10 / Portfolio_Type R = Credit Card (05 = Personal Loan)
//     const portfolioType = String(acc?.Portfolio_Type || "").trim();
//     const isCreditCard = accountType === "10" || portfolioType === "R";

//     if (!isClosed && pastDue > 0) {
//       if (isCreditCard) {
//         ccOverdueAmount += pastDue;
//       } else {
//         emiOverdueAmount += pastDue;
//       }
//     }

//     for (const hist of histories) {
//       const year = toNumber(hist?.Year, null);
//       const month = toNumber(hist?.Month, null);
//       const dpd = toNumber(hist?.Days_Past_Due, 0);

//       if (!year || !month) continue;

//       const histDate = new Date(year, month - 1, 1);

//       const diff = monthsDiff(histDate, now);

//       if (diff === null || diff < 0) continue;

//       if (diff < 3 && dpd > 0) {
//         hasDpd3M = true;
//       }

//       if (diff < 6 && dpd > 0) {
//         hasDpd6M = true;
//       }

//       if (diff < 12 && dpd > 0) {
//         hasOverdue12M = true;
//       }

//       if (diff < 24 && dpd >= 60) {
//         has60Plus24M = true;
//       }

//       if (diff < 36 && dpd >= 90) {
//         has90Plus36M = true;
//       }
//     }
//   }

//   return {
//     score,
//     enquiries30d,
//     hasDpd3M,
//     hasDpd6M,
//     hasOverdue12M,
//     hasWrittenOff3Y,
//     has60Plus24M,
//     has90Plus36M,
//     emiOverdueAmount,
//     ccOverdueAmount,
//   };
// };

// const evaluateMotionCorpPolicy = ({ loan, bureauFacts }) => {
//   const reasons = [];
//   const deviations = [];

//   const age = calculateAge(loan.dob);

//   const loanAmount = toNumber(loan.requested_loan_amount, 0);

//   const tenure = toNumber(loan.loan_tenure, 0);

//   // const apr = toNumber(
//   //   loan.apr || loan.interest_rate,
//   //   0,
//   // );

//   const score = toNumber(bureauFacts.score, null);

//   /**
//    * AGE
//    */
//   if (age === null) {
//     reasons.push("AGE_MISSING");
//   } else {
//     if (age < 18) reasons.push("AGE_BELOW_18");

//     if (age > 58) reasons.push("AGE_ABOVE_58");
//   }

//   /**
//    * SCORE
//    */
//   /**
//    * SCORE / NTC
//    */
//   if (score === null || score < 200) {
//     deviations.push("NTC_BANK_STATEMENT_REQUIRED");
//   }

//   if (score >= 200 && score < 650) {
//     reasons.push("CIBIL_BELOW_650");
//   }

//   if (score >= 650 && score <= 674) {
//     deviations.push("CIBIL_650_TO_674_APPROVAL_BASIS");
//   }

//   /**
//    * LOAN AMOUNT
//    */
//   if (loanAmount < 50000) {
//     reasons.push("LOAN_AMOUNT_BELOW_50000");
//   }

//   if (loanAmount > 165000) {
//     deviations.push("LOAN_AMOUNT_ABOVE_STANDARD_LIMIT");
//   }

//   // /**
//   //  * APR
//   //  */
//   // if (apr > 48) {
//   //   reasons.push("APR_ABOVE_48");
//   // }

//   /**
//    * TENURE
//    */
//   if (tenure < 12 || tenure > 24) {
//     reasons.push("TENURE_OUTSIDE_12_TO_24");
//   }

//   /**
//    * ENQUIRIES
//    */
//   if (bureauFacts.enquiries30d > 5) {
//     reasons.push("ENQUIRIES_GT_5_LAST_30D");
//   }

//   /**
//    * DPD RULES
//    */
//   if (bureauFacts.hasDpd3M) {
//     deviations.push("DPD_LAST_3M_APPROVAL_BASIS");
//   }

//   if (bureauFacts.hasDpd6M) {
//     deviations.push("DPD_LAST_6M_NO_BLANKET_APPROVAL");
//   }

//   /**
//    * OVERDUE
//    */
//   if (bureauFacts.hasOverdue12M) {
//     reasons.push("OVERDUE_LAST_12M");
//   }

//   /**
//    * WRITTEN OFF
//    */
//   if (bureauFacts.hasWrittenOff3Y) {
//     reasons.push("WRITTEN_OFF_LAST_3Y");
//   }

//   /**
//    * 60+ / 90+ DPD
//    */
//   if (bureauFacts.has60Plus24M) {
//     deviations.push("60PLUS_DPD_24M_DEVIATION");
//   }

//   if (bureauFacts.has90Plus36M) {
//     deviations.push("90PLUS_DPD_36M_DEVIATION");
//   }

//   /**
//    * OVERDUE AMOUNT
//    */
//   if (bureauFacts.emiOverdueAmount > 3000) {
//     deviations.push("EMI_OVERDUE_GT_3000");
//   }

//   if (bureauFacts.ccOverdueAmount > 5000) {
//     deviations.push("CC_OVERDUE_GT_5000");
//   }

//   /**
//    * FINAL STATUS
//    */
//   let status = "BRE APPROVED";

//   if (reasons.length > 0) {
//     status = "BRE REJECTED";
//   } else if (deviations.length > 0) {
//     status = "Credit Initiated";
//   }

//   return {
//     status,
//     reasons,
//     deviations,
//     bureauScore: score,
//   };
// };

// const autoApproveMotionCorpIfAllVerified = async (lan) => {
//   const pool = db.promise();

//   /**
//    * KYC STATUS
//    */
//   const [kycRows] = await pool.query(
//     `
//   SELECT
//     pan_status,
//     aadhaar_status,
//     bureau_status
//   FROM kyc_verification_status
//   WHERE lan = ?
//     AND applicant_type = 'BORROWER'
//     AND party_no = 1
//   LIMIT 1
//   `,
//     [lan],
//   );

//   if (!kycRows.length) {
//     console.log("No Motion Corp KYC row found:", lan);

//     await pool.query(
//       `
//     UPDATE loan_booking_motion_corp
//     SET
//       motioncorp_bre_status = ?,
//       motioncorp_bre_reason = ?,
//       motioncorp_bre_checked_at = NOW()
//     WHERE lan = ?
//     `,
//       ["Pending", "KYC_STATUS_ROW_MISSING", lan],
//     );

//     return;
//   }

//   const kyc = kycRows[0];

//   const requiredKycStatuses = {
//     PAN: kyc.pan_status,
//     AADHAAR: kyc.aadhaar_status,
//     BUREAU: kyc.bureau_status,
//   };

//   const incompleteKycChecks = Object.entries(requiredKycStatuses)
//     .filter(([, status]) => status !== "VERIFIED")
//     .map(
//       ([verificationType, status]) =>
//         `${verificationType}_STATUS=${status || "NA"}`,
//     );

//   if (incompleteKycChecks.length > 0) {
//     const pendingReason = incompleteKycChecks.join(", ");

//     await pool.query(
//       `
//     UPDATE loan_booking_motion_corp
//     SET
//       motioncorp_bre_status = ?,
//       motioncorp_bre_reason = ?,
//       motioncorp_bre_checked_at = NOW()
//     WHERE lan = ?
//     `,
//       ["Pending", pendingReason, lan],
//     );

//     console.log(`Motion Corp BRE pending for ${lan}: ${pendingReason}`);

//     return;
//   }

//   /**
//    * LOAN
//    */
//   const [loanRows] = await pool.query(
//     `
//     SELECT
//       lan,
//       dob,
//       requested_loan_amount,
//       loan_tenure,
//       interest_rate,
//       cibil_score
//     FROM loan_booking_motion_corp
//     WHERE lan = ?
//     `,
//     [lan],
//   );

//   if (!loanRows.length) {
//     console.log("Motion Corp loan not found:", lan);

//     return;
//   }

//   const loan = loanRows[0];

//   /**
//    * BUREAU XML
//    */
//   const [cibilRows] = await pool.query(
//     `
//     SELECT score, report_xml, created_at
//     FROM loan_cibil_reports
//     WHERE lan = ?
//     AND applicant_type = 'BORROWER'
//     ORDER BY created_at DESC, id DESC
//     LIMIT 1
//     `,
//     [lan],
//   );

//   if (!cibilRows.length || !cibilRows[0].report_xml) {
//     await pool.query(
//       `
//       UPDATE loan_booking_motion_corp
//       SET
//         motioncorp_bre_status = ?,
//         motioncorp_bre_reason = ?,
//         motioncorp_bre_checked_at = NOW()
//       WHERE lan = ?
//       `,
//       ["Pending", "BUREAU_REPORT_MISSING", lan],
//     );

//     return;
//   }

//   const bureauFacts = extractMotionCorpBureauFacts(cibilRows[0].report_xml);

//   const decision = evaluateMotionCorpPolicy({
//     loan,
//     bureauFacts,
//   });

//   const reasonText = [
//     ...(decision.reasons || []),
//     ...(decision.deviations || []),
//   ].length
//     ? [...decision.reasons, ...decision.deviations].join(", ")
//     : "ELIGIBLE";

//   // let finalStatus = "BRE APPROVED";

//   // if (decision.status === "BRE REJECTED") {
//   //   finalStatus = "BRE REJECTED";
//   // }

//   // if (decision.status === "Credit Initiated") {
//   //   finalStatus = "Credit Initiated";
//   // }

//   let finalStatus = "Credit Initiated";
//   let finalStage = "BRE Approved";

//   if (decision.status === "BRE REJECTED") {
//     finalStatus = "Rejected";
//     finalStage = "BRE Rejected";
//   }

//   if (decision.status === "Credit Initiated") {
//     finalStatus = "Credit Initiated";
//     finalStage = "BRE Deviation";
//   }

//   await pool.query(
//     `
//     UPDATE loan_booking_motion_corp
//     SET
//       motioncorp_bre_status = ?,
//       motioncorp_bre_reason = ?,
//       motioncorp_bre_checked_at = NOW(),

//       fintree_cibil_score = ?,
//       motioncorp_enquiries_30d = ?,
//       motioncorp_dpd_3m_flag = ?,
//       motioncorp_dpd_6m_flag = ?,
//       motioncorp_written_off_3y_flag = ?,
//       motioncorp_60plus_24m_flag = ?,
//       motioncorp_90plus_36m_flag = ?,
//       motioncorp_emi_overdue_amount = ?,
//       motioncorp_cc_overdue_amount = ?,
//       motioncorp_deviation_flag = ?,

//       status = ?,
// stage = ?
//     WHERE lan = ?
//     `,
//     [
//       decision.status,
//       reasonText,

//       decision.bureauScore,
//       bureauFacts.enquiries30d,
//       bureauFacts.hasDpd3M ? 1 : 0,
//       bureauFacts.hasDpd6M ? 1 : 0,
//       bureauFacts.hasWrittenOff3Y ? 1 : 0,
//       bureauFacts.has60Plus24M ? 1 : 0,
//       bureauFacts.has90Plus36M ? 1 : 0,
//       bureauFacts.emiOverdueAmount,
//       bureauFacts.ccOverdueAmount,
//       decision.deviations.length > 0 ? 1 : 0,

//       finalStatus,
//       finalStage,
//       lan,
//     ],
//   );

//   console.log(
//     `Motion Corp BRE completed for ${lan}: ${decision.status} | ${reasonText}`,
//   );
// };

// module.exports = {
//   autoApproveMotionCorpIfAllVerified,
//   extractMotionCorpBureauFacts,
//   evaluateMotionCorpPolicy,
// };

const db = require("../../config/db");
const { XMLParser } = require("fast-xml-parser");
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

/**
 * ===========================================================
 * BUREAU XML EXTRACTION (Experian INProfileResponse)
 * ===========================================================
 */
const extractMotionCorpBureauFacts = (reportXml) => {
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
      bureauPans: [],
    };
  }

  const json = parser.parse(reportXml);

  const profile = json?.INProfileResponse || {};

  const score =
    toNumber(profile?.SCORE?.BureauScore, null) ??
    toNumber(profile?.Score?.BureauScore, null) ??
    toNumber(profile?.Score?.Value, null);

  const enquiries30d = toNumber(profile?.CAPS?.CAPS_Summary?.CAPSLast30Days, 0);

  const accounts = toArray(profile?.CAIS_Account?.CAIS_Account_DETAILS);

  let hasDpd3M = false;
  let hasDpd6M = false;
  let hasOverdue12M = false;
  let hasWrittenOff3Y = false;
  let has60Plus24M = false;
  let has90Plus36M = false;

  let emiOverdueAmount = 0;
  let ccOverdueAmount = 0;

  const panSet = new Set();

  // PAN from the current application section of the report
  const appPan = String(
    profile?.Current_Application?.Current_Application_Details
      ?.Current_Applicant_Details?.IncomeTaxPan || "",
  )
    .trim()
    .toUpperCase();

  if (appPan) panSet.add(appPan);

  const now = new Date();

  for (const acc of accounts) {
    const histories = toArray(acc?.CAIS_Account_History);

    const accountType = String(acc?.Account_Type || "").trim();

    // Collect every PAN reported on this tradeline (holder + ID details)
    for (const holder of toArray(acc?.CAIS_Holder_Details)) {
      const p = String(holder?.Income_TAX_PAN || "")
        .trim()
        .toUpperCase();
      if (p) panSet.add(p);
    }

    for (const idDet of toArray(acc?.CAIS_Holder_ID_Details)) {
      const p = String(idDet?.Income_TAX_PAN || "")
        .trim()
        .toUpperCase();
      if (p) panSet.add(p);
    }

    /**
     * WRITTEN OFF / SETTLED
     * Experian tag = Written_off_Settled_Status (lowercase "off"); value is a code.
     * 99 = status cleared, so ignore it. Any other non-empty code = WO/Settled.
     * Date-gated to last 36 months using WriteOffStatusDate / Date_Reported.
     */
    const woStatus = String(acc?.Written_off_Settled_Status ?? "").trim();

    if (woStatus && woStatus !== "99") {
      const woDate =
        parseDateYYYYMMDD(acc?.WriteOffStatusDate) ||
        parseDateYYYYMMDD(acc?.Date_Reported);

      const diffWo = monthsDiff(woDate);

      if (diffWo === null || diffWo < 36) {
        hasWrittenOff3Y = true;
      }
    }

    /**
     * OVERDUE AMOUNTS
     * Overdue must come from Amount_Past_Due, NOT Current_Balance.
     * Closed accounts are skipped.
     * Experian: Account_Type 10 / Portfolio_Type R = Credit Card (05 = Personal Loan).
     */
    const accountStatus = String(acc?.Account_Status || "").trim();

    const isClosed =
      ["13", "14", "15", "16", "17"].includes(accountStatus) ||
      !!acc?.Date_Closed;

    const pastDue = toNumber(acc?.Amount_Past_Due, 0);

    const reportedDate = parseDateYYYYMMDD(acc?.Date_Reported);
    const reportedMonthsAgo = monthsDiff(reportedDate, now);

    if (
      !isClosed &&
      pastDue > 0 &&
      (reportedMonthsAgo === null ||
        (reportedMonthsAgo >= 0 && reportedMonthsAgo < 12))
    ) {
      hasOverdue12M = true;
    }

    const portfolioType = String(acc?.Portfolio_Type || "").trim();
    const isCreditCard = accountType === "10" || portfolioType === "R";

    if (!isClosed && pastDue > 0) {
      if (isCreditCard) {
        ccOverdueAmount += pastDue;
      } else {
        emiOverdueAmount += pastDue;
      }
    }

    /**
     * DPD HISTORY
     */
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

      // if (diff < 12 && dpd > 0) {
      //   hasOverdue12M = true;
      // }

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
    bureauPans: [...panSet],
  };
};

const evaluateMotionCorpBureauScreening = ({ loanPan, bureauFacts }) => {
  const reasons = [];
  const deviations = [];

  const score = toNumber(bureauFacts.score, null);

  const normalizedLoanPan = String(loanPan || "")
    .trim()
    .toUpperCase();

  const bureauPans = Array.isArray(bureauFacts.bureauPans)
    ? bureauFacts.bureauPans
    : [];

  /*
   * PAN checks
   */
  if (bureauPans.length > 1) {
    reasons.push("MULTIPLE_PAN_IN_BUREAU");
  }

  if (
    normalizedLoanPan &&
    bureauPans.length === 1 &&
    bureauPans[0] !== normalizedLoanPan
  ) {
    reasons.push("BUREAU_PAN_MISMATCH");
  }

  /*
   * Score checks
   */
  if (score === null || score < 300) {
    deviations.push("NTC_BANK_STATEMENT_REQUIRED");
  } else if (score < 650) {
    reasons.push("CIBIL_BELOW_650");
  } else if (score <= 674) {
    deviations.push("CIBIL_650_TO_674_APPROVAL_BASIS");
  }

  /*
   * Hard rejection bureau rules
   */
  if (bureauFacts.enquiries30d > 5) {
    reasons.push("ENQUIRIES_GT_5_LAST_30D");
  }

  if (bureauFacts.hasOverdue12M) {
    reasons.push("OVERDUE_LAST_12M");
  }

  if (bureauFacts.hasWrittenOff3Y) {
    deviations.push("WRITTEN_OFF_LAST_3Y_DEVIATION");
  }

  /*
   * Deviation rules
   */
  if (bureauFacts.hasDpd3M) {
    deviations.push("DPD_LAST_3M_DEVIATION");
  } else if (bureauFacts.hasDpd6M) {
    deviations.push("DPD_LAST_4_TO_6M_DEVIATION");
  }

  if (bureauFacts.has60Plus24M) {
    deviations.push("60PLUS_DPD_24M_DEVIATION");
  }

  if (bureauFacts.has90Plus36M) {
    deviations.push("90PLUS_DPD_36M_DEVIATION");
  }

  if (bureauFacts.emiOverdueAmount > 3000) {
    deviations.push("EMI_OVERDUE_GT_3000");
  }

  if (bureauFacts.ccOverdueAmount > 5000) {
    deviations.push("CC_OVERDUE_GT_5000");
  }

  return {
    status: reasons.length > 0 ? "BUREAU REJECTED" : "BUREAU APPROVED",

    reasons,
    deviations,
    bureauScore: score,

    isNtc: score === null || score < 300,
  };
};
/**
 * ===========================================================
 * POLICY EVALUATION
 * ===========================================================
 */
const evaluateMotionCorpPolicy = ({ loan, bureauFacts, amlStatus }) => {
  const reasons = [];
  const deviations = [];

  const age = calculateAge(loan.dob);

  const loanAmount = toNumber(loan.requested_loan_amount, 0);

  const tenure = toNumber(loan.loan_tenure, 0);

  const score = toNumber(bureauFacts.score, null);

  /**
   * PAN DUPLICATION (DB - same PAN on another active loan)
   */
  // if (panDuplicate) {
  //   reasons.push("PAN_DUPLICATE_FOUND");
  // }

  /**
   * PAN DUPLICATE IN BUREAU XML
   * More than one distinct PAN reported in the CIBIL report,
   * or bureau PAN doesn't match the PAN on the loan application.
   */
  const loanPan = String(loan.pan_card || loan.pan_number || "")
    .trim()
    .toUpperCase();
  const bureauPans = bureauFacts.bureauPans || [];

  if (bureauPans.length > 1) {
    reasons.push("MULTIPLE_PAN_IN_BUREAU");
  }

  if (loanPan && bureauPans.length === 1 && bureauPans[0] !== loanPan) {
    reasons.push("BUREAU_PAN_MISMATCH");
  }

  /**
   * AGE
   */
  if (age === null) {
    reasons.push("AGE_MISSING");
  } else {
    if (age < 18) reasons.push("AGE_BELOW_18");

    if (age > 58) reasons.push("AGE_ABOVE_58");
  }

  // AML STATUS
  const normalizedAmlStatus = String(amlStatus || "")
    .trim()
    .toUpperCase();

  if (normalizedAmlStatus === "STOP") {
    reasons.push("AML_STOP");
  } else if (normalizedAmlStatus === "REVIEW") {
    reasons.push("AML_REVIEW");
  }

  /**
   * SCORE BANDS
   * < 300 (or NTC / no score) -> BRE Deviation (bank statement required)
   * 300 - 649                 -> BRE Rejected
   * 650 - 674                 -> BRE Deviation (approval basis)
   * >= 675                    -> straight BRE Approved (no score flag)
   */
  if (score === null || score < 300) {
    deviations.push("NTC_BANK_STATEMENT_REQUIRED");
  } else if (score < 650) {
    reasons.push("CIBIL_BELOW_650");
  } else if (score <= 674) {
    deviations.push("CIBIL_650_TO_674_APPROVAL_BASIS");
  }
  // score >= 675 -> no flag

  /**
   * LOAN AMOUNT
   * Min ticket: 50,000 | Max ticket: 1,60,000
   */
  if (loanAmount < 50000) {
    reasons.push("LOAN_AMOUNT_BELOW_50000");
  }

  if (loanAmount > 160000) {
    reasons.push("LOAN_AMOUNT_ABOVE_160000");
  }

  /**
   * TENURE: Min 12 Max 24 months
   */
  if (tenure < 12 || tenure > 24) {
    reasons.push("TENURE_OUTSIDE_12_TO_24");
  }

  /**
   * ENQUIRIES: should not exceed 5 in last 30 days
   */
  if (bureauFacts.enquiries30d > 5) {
    reasons.push("ENQUIRIES_GT_5_LAST_30D");
  }

  /**
   * DPD RULES
   * DPD in last 3 months -> BRE Deviation
   * DPD in last 6 months -> BRE Deviation
   */
  if (bureauFacts.hasDpd3M) {
    deviations.push("DPD_LAST_3M_DEVIATION");
  } else if (bureauFacts.hasDpd6M) {
    deviations.push("DPD_LAST_4_TO_6M_DEVIATION");
  }

  /**
   * OVERDUE in last 12 months -> BRE Rejected
   */
  if (bureauFacts.hasOverdue12M) {
    reasons.push("OVERDUE_LAST_12M");
  }

  /**
   * WRITTEN OFF in last 3 years -> BRE Deviation
   */
  if (bureauFacts.hasWrittenOff3Y) {
    deviations.push("WRITTEN_OFF_LAST_3Y_DEVIATION");
  }

  /**
   * 60+ DPD in last 24 months -> BRE Deviation
   * 90+ DPD in last 36 months -> BRE Deviation
   */
  if (bureauFacts.has60Plus24M) {
    deviations.push("60PLUS_DPD_24M_DEVIATION");
  }

  if (bureauFacts.has90Plus36M) {
    deviations.push("90PLUS_DPD_36M_DEVIATION");
  }

  /**
   * OVERDUE AMOUNTS
   * EMI-based loans > 3,000 -> BRE Deviation
   * Credit card > 5,000     -> BRE Deviation
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
    status = "BRE DEVIATION";
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
 * PAN DUPLICATION (DB)
 * Same PAN used on another non-rejected loan (different LAN).
 * ===========================================================
 */
// const checkPanDuplicate = async (pool, lan) => {
//   const [rows] = await pool.query(
//     `
//     SELECT COUNT(*) AS cnt
//     FROM loan_booking_motion_corp other
//     JOIN loan_booking_motion_corp self
//       ON self.lan = ?
//     WHERE other.lan <> self.lan
//       AND other.pan_number IS NOT NULL
//       AND other.pan_number <> ''
//       AND other.pan_number = self.pan_number
//       AND (other.status IS NULL OR other.status NOT IN ('Rejected'))
//     `,
//     [lan],
//   );

//   return toNumber(rows?.[0]?.cnt, 0) > 0;
// };

/**
 * ===========================================================
 * MAIN BRE
 * ===========================================================
 */
const autoApproveMotionCorpIfAllVerified = async (lan) => {
  const pool = db.promise();

  const setPending = async (reason) => {
    await pool.query(
      `
      UPDATE loan_booking_motion_corp
      SET
        motioncorp_bre_status = ?,
        motioncorp_bre_reason = ?,
        motioncorp_bre_checked_at = NOW()
      WHERE lan = ?
      `,
      ["Pending", reason, lan],
    );
  };

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
    guarantor_name,
    guarantor_mobile,
    guarantor_pan,
    co_applicant_name,
    co_applicant_mobile,
    co_applicant_pan
  FROM loan_booking_motion_corp
  WHERE lan = ?
  LIMIT 1
  `,
    [lan],
  );

  if (!loanRows.length) {
    console.log("Motion Corp loan not found:", lan);
    return;
  }

  const loan = loanRows[0];

  const normalizeStatus = (status) =>
    String(status || "")
      .trim()
      .toUpperCase();

  /**
   * BORROWER KYC — PAN, AADHAAR, BUREAU must all be VERIFIED
   */
  const [kycRows] = await pool.query(
    `
    SELECT
      pan_status,
      aadhaar_status,
      bureau_status
    FROM kyc_verification_status
    WHERE lan = ?
      AND applicant_type = 'BORROWER'
      AND party_no = 1
    LIMIT 1
    `,
    [lan],
  );

  if (!kycRows.length) {
    console.log("No Motion Corp KYC row found:", lan);

    await setPending("KYC_STATUS_ROW_MISSING");

    return;
  }

  const kyc = kycRows[0];

  const requiredKycStatuses = {
    PAN: kyc.pan_status,
    AADHAAR: kyc.aadhaar_status,
    BUREAU: kyc.bureau_status,
  };

  const incompleteKycChecks = Object.entries(requiredKycStatuses)
    .filter(([, status]) => normalizeStatus(status) !== "VERIFIED")
    .map(
      ([verificationType, status]) =>
        `BORROWER_1_${verificationType}_STATUS=${
          normalizeStatus(status) || "NA"
        }`,
    );

  if (incompleteKycChecks.length > 0) {
    const pendingReason = incompleteKycChecks.join(", ");

    await setPending(pendingReason);

    console.log(`Motion Corp BRE pending for ${lan}: ${pendingReason}`);

    return;
  }

  /**
   * CO-APPLICANT / GUARANTOR KYC — PAN, AADHAAR, BUREAU must all be VERIFIED
   * (enforced only for parties that exist on this LAN)
   */
  /**
   * Determine which second parties actually exist on the loan.
   */
  const hasValue = (value) => String(value || "").trim() !== "";

  const requiredSecondPartyTypes = [];

  const hasGuarantor = [
    loan.guarantor_name,
    loan.guarantor_mobile,
    loan.guarantor_pan,
  ].some(hasValue);

  const hasCoApplicant = [
    loan.co_applicant_name,
    loan.co_applicant_mobile,
    loan.co_applicant_pan,
  ].some(hasValue);

  if (hasGuarantor) {
    requiredSecondPartyTypes.push("GUARANTOR");
  }

  if (hasCoApplicant) {
    requiredSecondPartyTypes.push("CO_APPLICANT");
  }

  if (!requiredSecondPartyTypes.length) {
    await setPending("SECOND_PARTY_MISSING");
    return;
  }

  /**
   * Every party present on the loan must have PAN, Aadhaar
   * and Bureau VERIFIED for party_no 1.
   */
  for (const applicantType of requiredSecondPartyTypes) {
    const [partyKycRows] = await pool.query(
      `
    SELECT
      pan_status,
      aadhaar_status,
      bureau_status
    FROM kyc_verification_status
    WHERE lan = ?
      AND applicant_type = ?
      AND party_no = 1
    LIMIT 1
    `,
      [lan, applicantType],
    );

    if (!partyKycRows.length) {
      await setPending(`${applicantType}_1_KYC_ROW_MISSING`);
      return;
    }

    const partyKyc = partyKycRows[0];

    const partyIncomplete = Object.entries({
      PAN: partyKyc.pan_status,
      AADHAAR: partyKyc.aadhaar_status,
      BUREAU: partyKyc.bureau_status,
    })
      .filter(([, status]) => normalizeStatus(status) !== "VERIFIED")
      .map(
        ([verificationType, status]) =>
          `${applicantType}_1_${verificationType}_STATUS=${
            normalizeStatus(status) || "NA"
          }`,
      );

    if (partyIncomplete.length > 0) {
      await setPending(partyIncomplete.join(", "));
      return;
    }
  }

  /**
   * BUREAU XML
   */
  const [cibilRows] = await pool.query(
    `
    SELECT score, report_xml, created_at
    FROM loan_cibil_reports
    WHERE lan = ?
      AND applicant_type = 'BORROWER'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [lan],
  );

  if (!cibilRows.length || !cibilRows[0].report_xml) {
    await setPending("BUREAU_REPORT_MISSING");

    return;
  }

  /**
   * PAN DUPLICATION (DB)
   */
  // const panDuplicate = await checkPanDuplicate(pool, lan);

  /**
   * AML SCREENING (TrackWizz)
   */
  let amlStatus = "ERROR";
  let amlReason = "";

  try {
    const aml = await screenLoanBooking("motion_corp", lan);

    amlStatus = String(aml.amlStatus || "")
      .trim()
      .toUpperCase();

    amlReason = aml.amlReason || "";

    console.log(`AML screening for ${lan}: ${amlStatus} | ${amlReason}`);
  } catch (amlErr) {
    console.error("AML screening failed for", lan, amlErr.message);

    amlReason = `AML unavailable: ${amlErr.message}`.slice(0, 255);

    await setPending(amlReason);
    return;
  }

  const supportedAmlStatuses = new Set(["PROCEED", "REVIEW", "STOP"]);

  if (!supportedAmlStatuses.has(amlStatus)) {
    await setPending(`AML_STATUS=${amlStatus || "NA"}`);
    return;
  }

  /**
   * EXTRACT + EVALUATE
   */
  const bureauFacts = extractMotionCorpBureauFacts(cibilRows[0].report_xml);

  const decision = evaluateMotionCorpPolicy({
    loan,
    bureauFacts,
    amlStatus,
  });

  const reasonParts = [...decision.reasons, ...decision.deviations];

  if (
    amlReason &&
    (amlStatus === "STOP" || amlStatus === "REVIEW" || amlStatus === "ERROR")
  ) {
    reasonParts.push(`AML: ${amlReason}`);
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
    UPDATE loan_booking_motion_corp
    SET
      motioncorp_bre_status = ?,
      motioncorp_bre_reason = ?,
      motioncorp_bre_checked_at = NOW(),

      fintree_cibil_score = ?,
      motioncorp_enquiries_30d = ?,
      motioncorp_dpd_3m_flag = ?,
      motioncorp_dpd_6m_flag = ?,
      motioncorp_overdue_12m_flag = ?,
      motioncorp_written_off_3y_flag = ?,
      motioncorp_60plus_24m_flag = ?,
      motioncorp_90plus_36m_flag = ?,
      motioncorp_emi_overdue_amount = ?,
      motioncorp_cc_overdue_amount = ?,
      motioncorp_deviation_flag = ?,

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
    `Motion Corp BRE completed for ${lan}: ${decision.status} | ${reasonText}`,
  );
};

module.exports = {
  autoApproveMotionCorpIfAllVerified,
  extractMotionCorpBureauFacts,
  evaluateMotionCorpPolicy,
  evaluateMotionCorpBureauScreening,
  // checkPanDuplicate,
};
