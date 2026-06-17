const db = require("../../config/db");
const { XMLParser } = require("fast-xml-parser");

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

const extractSrbhBureauFacts = (reportXml) => {
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

const evaluateSrbhPolicy = ({ loan, bureauFacts }) => {
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
  deviations.push(
    "NTC_BANK_STATEMENT_REQUIRED",
  );
}

if (
  score >= 200 &&
  score < 650
) {
  reasons.push("CIBIL_BELOW_650");
}

if (
  score >= 650 &&
  score <= 674
) {
  deviations.push(
    "CIBIL_650_TO_674_APPROVAL_BASIS",
  );
}

  /**
   * LOAN AMOUNT
   */
  if (loanAmount < 50000) {
    reasons.push("LOAN_AMOUNT_BELOW_50000");
  }

  if (loanAmount > 165000) {
    deviations.push("LOAN_AMOUNT_ABOVE_STANDARD_LIMIT");
  }

  // /**
  //  * APR
  //  */
  // if (apr > 48) {
  //   reasons.push("APR_ABOVE_48");
  // }

  /**
   * TENURE
   */
  if (tenure < 12 || tenure > 24) {
    reasons.push("TENURE_OUTSIDE_12_TO_24");
  }

  /**
   * ENQUIRIES
   */
  if (bureauFacts.enquiries30d > 5) {
    reasons.push("ENQUIRIES_GT_5_LAST_30D");
  }

  /**
   * DPD RULES
   */
  if (bureauFacts.hasDpd3M) {
    deviations.push("DPD_LAST_3M_APPROVAL_BASIS");
  }

  if (bureauFacts.hasDpd6M) {
    deviations.push("DPD_LAST_6M_NO_BLANKET_APPROVAL");
  }

  /**
   * OVERDUE
   */
  if (bureauFacts.hasOverdue12M) {
    reasons.push("OVERDUE_LAST_12M");
  }

  /**
   * WRITTEN OFF
   */
  if (bureauFacts.hasWrittenOff3Y) {
    reasons.push("WRITTEN_OFF_LAST_3Y");
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

const autoApproveSrbhIfAllVerified = async (lan) => {
  const pool = db.promise();

  /**
   * KYC STATUS
   */
  const [kycRows] = await pool.query(
    `
    SELECT bureau_status
    FROM kyc_verification_status
    WHERE lan = ?
    AND applicant_type = 'BORROWER'
    `,
    [lan],
  );

  if (!kycRows.length) {
    console.log("No SRBH KYC row found:", lan);

    return;
  }

  const kyc = kycRows[0];

  if (kyc.bureau_status !== "VERIFIED") {
    await pool.query(
      `
      UPDATE loan_booking_srbh
      SET
        srbh_bre_status = ?,
        srbh_bre_reason = ?,
        srbh_bre_checked_at = NOW()
      WHERE lan = ?
      `,
      [
        "Pending",
        `BUREAU_STATUS=${kyc.bureau_status || "NA"}`,
        lan,
      ],
    );

    return;
  }

  /**
   * LOAN
   */
  const [loanRows] = await pool.query(
    `
    SELECT
      lan,
      dob,
      requested_loan_amount,
      loan_tenure,
      interest_rate,
      cibil_score
    FROM loan_booking_srbh
    WHERE lan = ?
    `,
    [lan],
  );

  if (!loanRows.length) {
    console.log("SRBH loan not found:", lan);

    return;
  }

  const loan = loanRows[0];

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

    return;
  }

  const bureauFacts = extractSrbhBureauFacts(
    cibilRows[0].report_xml,
  );

  const decision = evaluateSrbhPolicy({
    loan,
    bureauFacts,
  });

  const reasonText = [
    ...(decision.reasons || []),
    ...(decision.deviations || []),
  ].length
    ? [...decision.reasons, ...decision.deviations].join(", ")
    : "ELIGIBLE";

  // let finalStatus = "BRE APPROVED";

  // if (decision.status === "BRE REJECTED") {
  //   finalStatus = "BRE REJECTED";
  // }

  // if (decision.status === "Credit Initiated") {
  //   finalStatus = "Credit Initiated";
  // }

  let finalStatus = "Credit Initiated";
let finalStage = "BRE Approved";

if (decision.status === "BRE REJECTED") {
  finalStatus = "Rejected";
  finalStage = "BRE Rejected";
}
 
if (decision.status === "Credit Initiated") {
  finalStatus = "Credit Initiated";
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
      srbh_written_off_3y_flag = ?,
      srbh_60plus_24m_flag = ?,
      srbh_90plus_36m_flag = ?,
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
    `SRBH BRE completed for ${lan}: ${decision.status} | ${reasonText}`,
  );
};

module.exports = {
  autoApproveSrbhIfAllVerified,
  extractSrbhBureauFacts,
  evaluateSrbhPolicy,
};