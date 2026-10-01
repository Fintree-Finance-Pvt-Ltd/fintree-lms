// services/claimBuddyBreEngine.js

const db = require("../../config/db");
const { XMLParser } = require("fast-xml-parser");
const {
  screenLoanBooking,
} = require("../../services/trackwizz/screeningService");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,

  processEntities: {
    enabled: true,
    maxTotalExpansions: 200000,
    maxExpandedLength: 20_000_000,
    maxEntityCount: 200000,
    maxEntitySize: 200000,
  },
});

// ======================================================
// HELPERS
// ======================================================

const toArray = (v) => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

const toNumber = (v, fallback = 0) => {
  if (v === null || v === undefined || v === "") {
    return fallback;
  }

  const n = Number(v);

  return Number.isFinite(n) ? n : fallback;
};

const parseDateYYYYMMDD = (s) => {
  if (!s || String(s).length !== 8) {
    return null;
  }

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

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();

  const m = today.getMonth() - birthDate.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};

// ======================================================
// BUREAU FACT EXTRACTION
// ======================================================

const extractClaimBuddyBureauFacts = (reportXml) => {
  if (!reportXml) {
    return {
      score: null,
      enquiries30d: null,

      hasDpdIn3M: false,
      count30Dpd12M: 0,

      has60PlusDpd24M: false,
      has90PlusDpd36M: false,

      hasOverdueLast1Y: false,
      hasWrittenOffLast3Y: false,

      hasMoratorium: false,
      hasRestructured: false,
    };
  }

  const json = parser.parse(reportXml);

  const profile = json?.INProfileResponse || {};

  const score = toNumber(profile?.SCORE?.BureauScore, null);

  const enquiries30d = toNumber(
    profile?.CAPS?.CAPS_Summary?.CAPSLast30Days,
    null,
  );

  const accounts = toArray(profile?.CAIS_Account?.CAIS_Account_DETAILS);

  let hasDpdIn3M = false;
  let count30Dpd12M = 0;

  let has60PlusDpd24M = false;
  let has90PlusDpd36M = false;

  let hasOverdueLast1Y = false;
  let hasWrittenOffLast3Y = false;

  let hasMoratorium = false;
  let hasRestructured = false;

  const now = new Date();

  const debug = {
    score,
    enquiries30d,
    accountsAnalyzed: accounts.length,
    details: [],
    flags: {},
  };

  for (const acc of accounts) {
    const histories = toArray(acc?.CAIS_Account_History);

    const dateReported = parseDateYYYYMMDD(acc?.Date_Reported);

    const writeOffDate =
      parseDateYYYYMMDD(acc?.WriteOffStatusDate) ||
      parseDateYYYYMMDD(acc?.DefaultStatusDate) ||
      parseDateYYYYMMDD(acc?.LitigationStatusDate);

    const amountPastDue = toNumber(acc?.Amount_Past_Due, 0);

    const specialComment = String(acc?.Special_Comment || "").toUpperCase();

    const suitFiled = String(
      acc?.SuitFiledWillfulDefaultWrittenOffStatus || "",
    ).toUpperCase();

    const wilfulDefault = String(
      acc?.SuitFiled_WilfulDefault || "",
    ).toUpperCase();

    const writtenOffSettled = String(
      acc?.Written_off_Settled_Status || "",
    ).toUpperCase();

    const writtenOffAmtTotal = toNumber(acc?.Written_Off_Amt_Total, 0);

    const writtenOffAmtPrincipal = toNumber(acc?.Written_Off_Amt_Principal, 0);

    const accountDebug = {
      accountNumber: acc?.Account_Number || "NA",

      dateReported: acc?.Date_Reported,

      amountPastDue,

      writtenOffAmtTotal,
      writtenOffAmtPrincipal,

      specialComment,
      suitFiled,
      wilfulDefault,
      writtenOffSettled,

      dpdHistory: [],
    };

    // ==================================================
    // OVERDUE - LAST 1 YEAR
    // ==================================================

    if (
      dateReported &&
      monthsDiff(dateReported, now) <= 12 &&
      amountPastDue > 0
    ) {
      hasOverdueLast1Y = true;
    }

    // ==================================================
    // WRITTEN OFF - LAST 3 YEARS
    // ==================================================

    const writeOffIndicators = [
      specialComment,
      suitFiled,
      wilfulDefault,
      writtenOffSettled,
    ].join(" ");

    if (
      writtenOffAmtTotal > 0 ||
      writtenOffAmtPrincipal > 0 ||
      writtenOffSettled === "99" ||
      /WRITTEN|WRITE.?OFF|SETTLED|WILFUL|SUIT/i.test(writeOffIndicators)
    ) {
      if (!writeOffDate || monthsDiff(writeOffDate, now) <= 36) {
        hasWrittenOffLast3Y = true;
      }
    }

    // ==================================================
    // MORATORIUM
    // ==================================================

    if (/MORATORIUM/i.test(specialComment)) {
      hasMoratorium = true;
    }

    // ==================================================
    // RESTRUCTURED
    // ==================================================

    if (/RESTRUCTURED|RE-SCHEDULED|RESCHEDULED/i.test(specialComment)) {
      hasRestructured = true;
    }

    // ==================================================
    // DPD HISTORY
    // ==================================================

    for (const hist of histories) {
      const year = toNumber(hist?.Year, null);

      const month = toNumber(hist?.Month, null);

      const dpd = toNumber(hist?.Days_Past_Due, 0);

      if (!year || !month) {
        continue;
      }

      const histDate = new Date(year, month - 1, 1);

      const diff = monthsDiff(histDate, now);

      if (diff === null || diff < 0) {
        continue;
      }

      accountDebug.dpdHistory.push({
        year,
        month,
        dpd,
        monthsAgo: diff,
      });

      // No DPD in last 3 months
      if (diff < 3 && dpd > 0) {
        hasDpdIn3M = true;
      }

      // Maximum 2 instances of 30 DPD
      // in last 12 months
      if (diff < 12 && dpd === 30) {
        count30Dpd12M++;
      }

      // No 60+ DPD in last 24 months
      if (diff < 24 && dpd >= 60) {
        has60PlusDpd24M = true;
      }

      // No 90+ DPD in last 36 months
      if (diff < 36 && dpd >= 90) {
        has90PlusDpd36M = true;
      }
    }

    debug.details.push(accountDebug);
  }

  debug.flags = {
    hasDpdIn3M,
    count30Dpd12M,
    has60PlusDpd24M,
    has90PlusDpd36M,

    hasOverdueLast1Y,
    hasWrittenOffLast3Y,

    hasMoratorium,
    hasRestructured,
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("📊 Claim Buddy Bureau Debug:");

    console.dir(debug, { depth: null });
  }

  return {
    score,
    enquiries30d,

    hasDpdIn3M,
    count30Dpd12M,

    has60PlusDpd24M,
    has90PlusDpd36M,

    hasOverdueLast1Y,
    hasWrittenOffLast3Y,

    hasMoratorium,
    hasRestructured,
  };
};

// ======================================================
// CLAIM BUDDY POLICY EVALUATION
// ======================================================

const evaluateClaimBuddyPolicy = ({ loan, bureauFacts }) => {
  const reasons = [];

  const age = calculateAge(loan.dob);

  const income = toNumber(loan.net_monthly_income, 0);

  const loanAmount = toNumber(loan.loan_amount, 0);

  const isCorporate =
    String(loan.policy_type || "")
      .trim()
      .toLowerCase() === "corporate policy";

  const bureauScore =
    toNumber(loan.cibil_score, null) ?? toNumber(bureauFacts.score, null);

  // ==================================================
  // AGE
  // Policy:
  // Normal minimum = 21
  // Corporate exception = 18
  // Maximum = 60
  // Exception = 65
  // ==================================================

  if (age === null) {
    reasons.push("AGE_MISSING");
  } else {
    if (age < 18) {
      reasons.push("AGE_BELOW_MIN");
    }

    if (age >= 18 && age < 21 && !isCorporate) {
      reasons.push("AGE_EXCEPTION_ONLY_CORPORATE");
    }

    if (age > 65) {
      reasons.push("AGE_ABOVE_MAX");
    }
  }

  // ==================================================
  // INCOME
  // Minimum ₹10,000
  // ==================================================

  if (income < 10000) {
    reasons.push("INCOME_BELOW_MIN");
  }

  // ==================================================
  // LOAN AMOUNT
  // ₹10,000 - ₹2,00,000
  // ==================================================

  if (loanAmount < 10000 || loanAmount > 200000) {
    reasons.push("LOAN_AMOUNT_OUT_OF_RANGE");
  }

  // ==================================================
  // BUREAU SCORE
  //
  // Policy contains:
  // 1. Minimum score 600
  // 2. Screening says below 200 OR 680+
  //
  // We preserve the screening rule used in
  // Clayyo, while separately flagging score <600.
  // ==================================================

  if (bureauScore === null) {
    reasons.push("BUREAU_SCORE_MISSING");
  } else {
    if (bureauScore < 600) {
      reasons.push("BUREAU_SCORE_BELOW_600");
    }

    if (!(bureauScore < 200 || bureauScore >= 680)) {
      reasons.push("BUREAU_SCORE_POLICY_FAIL");
    }
  }

  // ==================================================
  // ENQUIRIES
  // Maximum 5 in last 30 days
  // ==================================================

  if (bureauFacts.enquiries30d !== null && bureauFacts.enquiries30d > 5) {
    reasons.push("ENQUIRIES_GT_5_IN_30D");
  }

  // ==================================================
  // DPD - LAST 3 MONTHS
  // No DPD
  // ==================================================

  if (bureauFacts.hasDpdIn3M) {
    reasons.push("DPD_IN_LAST_3M");
  }

  // ==================================================
  // 30 DPD - LAST 12 MONTHS
  // Maximum 2
  // ==================================================

  if (bureauFacts.count30Dpd12M > 2) {
    reasons.push("MORE_THAN_2_30DPD_IN_12M");
  }

  // ==================================================
  // 60+ DPD - LAST 24 MONTHS
  // ==================================================

  if (bureauFacts.has60PlusDpd24M) {
    reasons.push("DPD_60_PLUS_IN_24M");
  }

  // ==================================================
  // 90+ DPD - LAST 36 MONTHS
  // ==================================================

  if (bureauFacts.has90PlusDpd36M) {
    reasons.push("DPD_90_PLUS_IN_36M");
  }

  // ==================================================
  // OVERDUE - LAST 1 YEAR
  // ==================================================

  if (bureauFacts.hasOverdueLast1Y) {
    reasons.push("OVERDUE_IN_LAST_1Y");
  }

  // ==================================================
  // WRITTEN OFF - LAST 3 YEARS
  // ==================================================

  if (bureauFacts.hasWrittenOffLast3Y) {
    reasons.push("WRITTEN_OFF_IN_LAST_3Y");
  }

  // ==================================================
  // MORATORIUM
  // ==================================================

  if (bureauFacts.hasMoratorium) {
    reasons.push("MORATORIUM_FOUND");
  }

  // ==================================================
  // RESTRUCTURED
  // ==================================================

  if (bureauFacts.hasRestructured) {
    reasons.push("RESTRUCTURED_ACCOUNT_FOUND");
  }

  return {
    status: reasons.length ? "BRE FAILED" : "BRE APPROVED",

    reasons,

    bureauScore,
  };
};

// ======================================================
// AUTO RUN CLAIM BUDDY BRE
// ======================================================

const autoApproveClaimBuddyIfAllVerified = async (lan) => {
  console.log("Claim Buddy BRE engine started:", lan);

  const pool = db.promise();

  // ==================================================
  // 1. KYC
  // ==================================================

  const [kycRows] = await pool.query(
    `
        SELECT
          pan_status,
          aadhaar_status,
          bureau_status
        FROM kyc_verification_status
        WHERE lan = ?
        `,
    [lan],
  );

  if (!kycRows.length) {
    console.log("No KYC row found:", lan);

    return;
  }

  const kyc = kycRows[0];

  if (
    kyc.pan_status !== "VERIFIED" ||
    kyc.aadhaar_status !== "VERIFIED" ||
    kyc.bureau_status !== "VERIFIED"
  ) {
    await pool.query(
      `
        UPDATE loan_booking_claim_buddy
        SET
          claim_buddy_bre_status = ?,
          claim_buddy_bre_reason = ?,
          claim_buddy_bre_checked_at = NOW()
        WHERE lan = ?
        `,
      [
        "Pending",

        `PAN=${kyc.pan_status || "NA"}, AADHAAR=${
          kyc.aadhaar_status || "NA"
        }, BUREAU=${kyc.bureau_status || "NA"}`,

        lan,
      ],
    );

    return;
  }

  // ==================================================
  // 2. LOAN DATA
  // ==================================================

  const [loanRows] = await pool.query(
    `
        SELECT
          lan,
          dob,
          policy_type,
          net_monthly_income,
          loan_amount,
          cibil_score
        FROM loan_booking_claim_buddy
        WHERE lan = ?
        `,
    [lan],
  );

  if (!loanRows.length) {
    console.log("Claim Buddy loan not found:", lan);

    return;
  }

  const loan = loanRows[0];

  // ==================================================
  // 3. LATEST BUREAU REPORT
  // ==================================================

  const [cibilRows] = await pool.query(
    `
        SELECT
          score,
          report_xml,
          created_at
        FROM loan_cibil_reports
        WHERE lan = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        `,
    [lan],
  );

  if (!cibilRows.length || !cibilRows[0].report_xml) {
    await pool.query(
      `
        UPDATE loan_booking_claim_buddy
        SET
          claim_buddy_bre_status = ?,
          claim_buddy_bre_reason = ?,
          claim_buddy_bre_checked_at = NOW()
        WHERE lan = ?
        `,
      ["Pending", "BUREAU_REPORT_MISSING", lan],
    );

    return;
  }

  // ==================================================
  // 4. EXTRACT BUREAU FACTS
  // ==================================================

  const bureauFacts = extractClaimBuddyBureauFacts(cibilRows[0].report_xml);

  // ==================================================
  // 5. EVALUATE POLICY
  // ==================================================

  const decision = evaluateClaimBuddyPolicy({
    loan,
    bureauFacts,
  });

  const reasonText = decision.reasons.length
    ? decision.reasons.join(", ")
    : "ELIGIBLE";

  // ==================================================
  // 6. AML SCREENING
  // ==================================================

  let amlStatus = "ERROR";
  let amlReason = "";

  try {
    const aml = await screenLoanBooking("claim_buddy", lan);

    amlStatus = aml.amlStatus;

    amlReason = aml.amlReason || "";

    console.log(`AML screening for ${lan}: ${amlStatus} | ${amlReason}`);
  } catch (amlErr) {
    console.error("AML screening failed for", lan, amlErr.message);

    amlReason = `AML unavailable: ${amlErr.message}`.slice(0, 255);
  }

  // ==================================================
  // 7. FINAL BRE + AML STATUS
  // ==================================================

  let finalStatus;
  let finalStage;

  if (decision.status === "BRE APPROVED") {
    if (amlStatus === "STOP") {
      finalStatus = "BRE FAILED";

      finalStage = "AML_REJECTED";
    } else if (amlStatus === "REVIEW" || amlStatus === "ERROR") {
      finalStatus = "BRE FAILED";

      finalStage = "AML_REVIEW";
    } else {
      finalStatus = "CREDIT APPROVED";

      finalStage = "LIMIT_APPROVAL_PENDING";
    }
  } else {
    finalStatus = "BRE FAILED";

    finalStage = "BRE_REJECTED";
  }

  // ==================================================
  // 8. SAVE BRE RESULT
  // ==================================================

  await pool.query(
    `
      UPDATE loan_booking_claim_buddy
      SET

        claim_buddy_bre_status = ?,

        claim_buddy_bre_reason = ?,

        claim_buddy_bre_checked_at = NOW(),

        claim_buddy_bureau_score = ?,

        claim_buddy_enquiries_30d = ?,

        claim_buddy_dpd_3m_flag = ?,

        claim_buddy_dpd_12m_count = ?,

        claim_buddy_dpd_24m_60_flag = ?,

        claim_buddy_dpd_36m_90_flag = ?,

        claim_buddy_overdue_flag = ?,

        claim_buddy_writtenoff_flag = ?,

        claim_buddy_moratorium_flag = ?,

        claim_buddy_restructured_flag = ?,

        stage = ?,

        status = ?

      WHERE lan = ?
      `,
    [
      decision.status,

      reasonText,

      decision.bureauScore,

      bureauFacts.enquiries30d,

      bureauFacts.hasDpdIn3M ? 1 : 0,

      bureauFacts.count30Dpd12M,

      bureauFacts.has60PlusDpd24M ? 1 : 0,

      bureauFacts.has90PlusDpd36M ? 1 : 0,

      bureauFacts.hasOverdueLast1Y ? 1 : 0,

      bureauFacts.hasWrittenOffLast3Y ? 1 : 0,

      bureauFacts.hasMoratorium ? 1 : 0,

      bureauFacts.hasRestructured ? 1 : 0,

      finalStage,

      finalStatus,

      lan,
    ],
  );

  console.log(
    `Claim Buddy BRE completed for ${lan}: ${finalStatus} | ${reasonText}`,
  );
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  autoApproveClaimBuddyIfAllVerified,
  extractClaimBuddyBureauFacts,
  evaluateClaimBuddyPolicy,
};
