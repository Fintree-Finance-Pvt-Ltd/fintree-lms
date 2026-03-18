// services/clayyoBreEngine.js
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

const extractClayyoBureauFacts = (reportXml) => {
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

  const score =
    toNumber(profile?.SCORE?.BureauScore, null);

  const enquiries30d =
    toNumber(profile?.TotalCAPS_Summary?.TotalCAPSLast30Days, null);

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

  // 🔥 DEBUG OBJECT
  const debug = {
    score,
    enquiries30d,
    accountsAnalyzed: accounts.length,
    details: [],
    flags: {}
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
    const suitFiled = String(acc?.SuitFiledWillfulDefaultWrittenOffStatus || "").toUpperCase();
    const wilfulDefault = String(acc?.SuitFiled_WilfulDefault || "").toUpperCase();
    const writtenOffSettled = String(acc?.Written_off_Settled_Status || "").toUpperCase();

    const writtenOffAmtTotal = toNumber(acc?.Written_Off_Amt_Total, 0);
    const writtenOffAmtPrincipal = toNumber(acc?.Written_Off_Amt_Principal, 0);



     // 🔥 ACCOUNT DEBUG
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
      dpdHistory: []
    };






    if (dateReported && monthsDiff(dateReported, now) <= 12 && amountPastDue > 0) {
      hasOverdueLast1Y = true;
    }

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

    if (/MORATORIUM/i.test(specialComment)) {
      hasMoratorium = true;
    }

    if (/RESTRUCTURED|RE-SCHEDULED|RESCHEDULED/i.test(specialComment)) {
      hasRestructured = true;
    }

    for (const hist of histories) {
      const year = toNumber(hist?.Year, null);
      const month = toNumber(hist?.Month, null);
      const dpd = toNumber(hist?.Days_Past_Due, 0);

      if (!year || !month) continue;

      const histDate = new Date(year, month - 1, 1);
      const diff = monthsDiff(histDate, now);

      if (diff === null || diff < 0) continue;




      // Store raw DPD values
      accountDebug.dpdHistory.push({
        year,
        month,
        dpd,
        monthsAgo: diff
      });





      if (diff < 3 && dpd > 0) {
        hasDpdIn3M = true;
      }

      if (diff < 12 && dpd === 30) {
        count30Dpd12M++;
      }

      if (diff < 24 && dpd >= 60) {
        has60PlusDpd24M = true;
      }

      if (diff < 36 && dpd >= 90) {
        has90PlusDpd36M = true;
      }
    }

    debug.details.push(accountDebug);


  }

  // Final flags
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

  // 🔥 CLEAN DEBUG OUTPUT
  if (process.env.NODE_ENV !== "production") {
    console.log("📊 Clayyo Bureau Debug:");
    console.dir(debug, { depth: null });
  }

//   console.log(`Extracted Clayyo Bureau Facts: score=${score}, enquiries30d=${enquiries30d}, hasDpdIn3M=${hasDpdIn3M}, count30Dpd12M=${count30Dpd12M}, has60PlusDpd24M=${has60PlusDpd24M}, has90PlusDpd36M=${has90PlusDpd36M}, hasOverdueLast1Y=${hasOverdueLast1Y}, hasWrittenOffLast3Y=${hasWrittenOffLast3Y}, hasMoratorium=${hasMoratorium}, hasRestructured=${hasRestructured}`);
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

const evaluateClayyoPolicy = ({ loan, bureauFacts }) => {
  const reasons = [];

  const age = calculateAge(loan.dob);
  const income = toNumber(loan.net_monthly_income, 0);
  const loanAmount = toNumber(loan.loan_amount, 0);
  const isCorporate = String(loan.policy_type || "").trim().toLowerCase() === "corporate policy";

  const bureauScore =
    toNumber(loan.cibil_score, null) ?? toNumber(bureauFacts.score, null);

  // Age
  if (age === null) {
    reasons.push("AGE_MISSING");
  } else {
    if (age < 22) reasons.push("AGE_BELOW_MIN");
    if (age >= 22 && age < 25 && !isCorporate) reasons.push("AGE_EXCEPTION_ONLY_CORPORATE");
    if (age > 60) reasons.push("AGE_ABOVE_MAX");
  }

  // Income
  if (income < 22000) {
    reasons.push("INCOME_BELOW_MIN");
  } else if (income < 25000 && !isCorporate) {
    reasons.push("INCOME_EXCEPTION_ONLY_CORPORATE");
  }

  // Loan amount
  if (loanAmount < 15000 || loanAmount > 500000) {
    reasons.push("LOAN_AMOUNT_OUT_OF_RANGE");
  }

  // Bureau score
  if (bureauScore === null) {
    reasons.push("BUREAU_SCORE_MISSING");
  } else if (!(bureauScore < 200 || bureauScore >= 680)) {
    reasons.push("BUREAU_SCORE_POLICY_FAIL");
  }

  // Bureau rules
  if (bureauFacts.enquiries30d !== null && bureauFacts.enquiries30d > 5) {
    reasons.push("ENQUIRIES_GT_5_IN_30D");
  }

  if (bureauFacts.hasDpdIn3M) {
    reasons.push("DPD_IN_LAST_3M");
  }

  // policy says max two 30 DPD in 12M, and 1 DPD exception if corporate
  if (!isCorporate && bureauFacts.count30Dpd12M > 2) {
    reasons.push("MORE_THAN_2_30DPD_IN_12M");
  }

  if (isCorporate && bureauFacts.count30Dpd12M > 3) {
    reasons.push("CORPORATE_DPD_EXCEPTION_EXCEEDED");
  }

  if (bureauFacts.has60PlusDpd24M) {
    reasons.push("DPD_60_PLUS_IN_24M");
  }

  if (bureauFacts.has90PlusDpd36M) {
    reasons.push("DPD_90_PLUS_IN_36M");
  }

  if (bureauFacts.hasOverdueLast1Y) {
    reasons.push("OVERDUE_IN_LAST_1Y");
  }

  if (bureauFacts.hasWrittenOffLast3Y) {
    reasons.push("WRITTEN_OFF_IN_LAST_3Y");
  }

  if (bureauFacts.hasMoratorium) {
    reasons.push("MORATORIUM_FOUND");
  }

  if (bureauFacts.hasRestructured) {
    reasons.push("RESTRUCTURED_ACCOUNT_FOUND");
  }

  return {
    status: reasons.length ? "Rejected" : "Approved",
    reasons,
    bureauScore,
  };
};

const autoApproveClayyoIfAllVerified = async (lan) => {
  const pool = db.promise();

  // 1) KYC row
  const [kycRows] = await pool.query(
    `SELECT pan_status, aadhaar_status, bureau_status
     FROM kyc_verification_status
     WHERE lan = ?`,
    [lan]
  );

  if (!kycRows.length) {
    console.log("No KYC row found for LAN:", lan);
    return;
  }

  const kyc = kycRows[0];

  if (
    kyc.pan_status !== "VERIFIED" ||
    kyc.aadhaar_status !== "VERIFIED" ||
    kyc.bureau_status !== "VERIFIED"
  ) {
    console.log("Clayyo BRE pending due to KYC not fully verified:", lan);
    await pool.query(
      `UPDATE loan_booking_clayyo
       SET clayyo_bre_status = ?,
           clayyo_bre_reason = ?,
           clayyo_bre_checked_at = NOW()
       WHERE lan = ?`,
      [
        "Pending",
        `PAN=${kyc.pan_status || "NA"}, AADHAAR=${kyc.aadhaar_status || "NA"}, BUREAU=${kyc.bureau_status || "NA"}`,
        lan,
      ]
    );
    return;
  }

  // 2) Loan row
  const [loanRows] = await pool.query(
    `SELECT lan, dob, policy_type, net_monthly_income, loan_amount, cibil_score
     FROM loan_booking_clayyo
     WHERE lan = ?`,
    [lan]
  );

  if (!loanRows.length) {
    console.log("Clayyo loan not found for LAN:", lan);
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
      `UPDATE loan_booking_clayyo
       SET clayyo_bre_status = ?,
           clayyo_bre_reason = ?,
           clayyo_bre_checked_at = NOW()
       WHERE lan = ?`,
      ["Pending", "BUREAU_REPORT_MISSING", lan]
    );
    return;
  }

  const bureauFacts = extractClayyoBureauFacts(cibilRows[0].report_xml);

  const decision = evaluateClayyoPolicy({ loan, bureauFacts });

  const reasonText = decision.reasons.length
    ? decision.reasons.join(", ")
    : "ELIGIBLE";

  await pool.query(
    `UPDATE loan_booking_clayyo
     SET
       clayyo_bre_status = ?,
       clayyo_bre_reason = ?,
       clayyo_bre_checked_at = NOW(),

       clayyo_bureau_score = ?,
       clayyo_enquiries_30d = ?,
       clayyo_dpd_3m_flag = ?,
       clayyo_dpd_12m_count = ?,
       clayyo_dpd_24m_60_flag = ?,
       clayyo_dpd_36m_90_flag = ?,
       clayyo_overdue_flag = ?,
       clayyo_writtenoff_flag = ?,
       clayyo_moratorium_flag = ?,
       clayyo_restructured_flag = ?,

       status = ?
     WHERE lan = ?`,
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

      decision.status,
      lan,
    ]
  );

  console.log(
    `Clayyo BRE completed for ${lan}: ${decision.status} | ${reasonText}`
  );
};

module.exports = {
  autoApproveClayyoIfAllVerified,
  extractClayyoBureauFacts,
  evaluateClayyoPolicy,
};