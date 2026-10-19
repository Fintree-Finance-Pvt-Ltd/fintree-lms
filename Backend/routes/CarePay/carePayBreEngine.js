const db = require("../../config/db");

const isProvided = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";
const CAREPAY_BRE_APPROVED_STATUS = "BRE Approved";

const toFiniteNumber = (value, fallback = null) => {
  if (!isProvided(value)) return fallback;

  const num = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : fallback;
};

const calculateCarePayAge = (dob, fallbackAge) => {
  const suppliedAge = toFiniteNumber(fallbackAge);
  if (suppliedAge !== null) return suppliedAge;

  if (!isProvided(dob)) return null;

  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age;
};

const toNumber = (value, fallback = null) => {
  if (!isProvided(value)) return fallback;
  const num = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : fallback;
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!isProvided(value)) return [];
  return [value];
};

const monthsDiff = (from, to) => {
  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return null;
  }
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
};


const { XMLParser } = require("fast-xml-parser");

const XML_PARSER = new XMLParser({
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

const walk = (node, visitor, path = []) => {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, visitor, [...path, index]));
    return;
  }
  if (typeof node !== "object") return;
  visitor(node, path);
  for (const [key, value] of Object.entries(node)) {
    walk(value, visitor, [...path, key]);
  }
};

const getFirst = (object, fieldNames) => {
  if (!object || typeof object !== "object") return null;
  for (const fieldName of fieldNames) {
    if (Object.prototype.hasOwnProperty.call(object, fieldName)) {
      return object[fieldName];
    }
  }
  const lowerCaseMap = new Map(
    Object.keys(object).map((key) => [String(key).toLowerCase(), key]),
  );
  for (const fieldName of fieldNames) {
    const actualKey = lowerCaseMap.get(String(fieldName).toLowerCase());
    if (actualKey !== undefined) return object[actualKey];
  }
  return null;
};

const findAllValuesByKeys = (root, keys) => {
  const keySet = new Set(keys.map((key) => String(key).toLowerCase()));
  const values = [];
  walk(root, (node) => {
    for (const [key, value] of Object.entries(node)) {
      if (keySet.has(String(key).toLowerCase())) {
        values.push(value);
      }
    }
  });
  return values;
};

const parseBureauDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (/^\d{8}$/.test(text)) {
    const firstFourDigits = Number(text.slice(0, 4));
    if (firstFourDigits >= 1900 && firstFourDigits <= 2200) {
      const year = firstFourDigits;
      const month = Number(text.slice(4, 6));
      const day = Number(text.slice(6, 8));
      const date = new Date(year, month - 1, day);
      if (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      ) {
        return date;
      }
    }
    const day = Number(text.slice(0, 2));
    const month = Number(text.slice(2, 4));
    const year = Number(text.slice(4, 8));
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const monthsDifference = (fromDate, toDate = new Date()) => {
  if (!fromDate) return null;
  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
    (toDate.getMonth() - fromDate.getMonth())
  );
};

const parseDpdValue = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().toUpperCase();
  if (["STD", "000", "0", "XXX", "---", "NIL", "NEW"].includes(text)) {
    return 0;
  }
  if (text === "SMA") return 30;
  if (text === "SUB") return 90;
  if (text === "DBT" || text === "LSS") return 180;
  if (/^\d+$/.test(text)) return Number(text);
  return null;
};

const updateDpdFacts = (facts, date, dpd, asOf = new Date()) => {
  if (!date || dpd === null) return;
  const difference = monthsDifference(date, asOf);
  if (difference === null || difference < 0) return;

  if (dpd > facts.maxDpd) {
    facts.maxDpd = dpd;
  }
  if (difference < 3) {
    facts.maxDpdLast3Months = Math.max(facts.maxDpdLast3Months, dpd);
  }
  if (difference < 6) {
    facts.maxDpdLast6Months = Math.max(facts.maxDpdLast6Months, dpd);
  }
  if (difference < 9) {
    facts.maxDpdLast9Months = Math.max(facts.maxDpdLast9Months, dpd);
  }
  if (difference < 12) {
    facts.maxDpdLast12Months = Math.max(facts.maxDpdLast12Months, dpd);
  }
  if (difference < 24) {
    facts.maxDpdLast24Months = Math.max(facts.maxDpdLast24Months, dpd);
  }
  if (difference < 36) {
    facts.maxDpdLast36Months = Math.max(facts.maxDpdLast36Months, dpd);
  }
};

const extractAccounts = (parsedReport) => {
  const knownAccountValues = findAllValuesByKeys(parsedReport, [
    "CAIS_Account_DETAILS",
    "CAISAccountDetails",
    "Account_Details",
    "AccountDetails",
  ]);

  const dedupedKnownAccounts = [];
  const knownSeen = new Set();
  for (const value of knownAccountValues.flatMap(toArray)) {
    if (!value || typeof value !== "object" || knownSeen.has(value)) continue;
    knownSeen.add(value);
    dedupedKnownAccounts.push(value);
  }
  if (dedupedKnownAccounts.length) return dedupedKnownAccounts;

  const fallbackAccounts = [];
  const fallbackSeen = new Set();
  walk(parsedReport, (node) => {
    const accountType = getFirst(node, [
      "Account_Type",
      "AccountType",
      "AccountTypeCode",
      "Account_Type_Code",
    ]);
    const accountName = getFirst(node, [
      "Account_Type_Description",
      "AccountTypeDescription",
      "AccountTypeName",
    ]);
    const accountNumber = getFirst(node, [
      "Account_Number",
      "AccountNumber",
    ]);
    if (accountType === null && accountName === null && accountNumber === null) {
      return;
    }
    if (fallbackSeen.has(node)) return;
    fallbackSeen.add(node);
    fallbackAccounts.push(node);
  });
  return fallbackAccounts;
};

const readStructuredDpdHistory = (account, dpdFacts, asOf) => {
  const visited = new Set();
  walk(account, (node) => {
    if (visited.has(node)) return;
    const dpdRaw = getFirst(node, [
      "Days_Past_Due",
      "DaysPastDue",
      "DPD",
      "Dpd",
    ]);
    if (dpdRaw === null || dpdRaw === undefined) return;
    visited.add(node);

    const year = toFiniteNumber(getFirst(node, ["Year", "YEAR"]));
    const month = toFiniteNumber(getFirst(node, ["Month", "MONTH"]));
    let historyDate = null;
    if (year && month && month >= 1 && month <= 12) {
      historyDate = new Date(year, month - 1, 1);
    } else {
      historyDate = parseBureauDate(
        getFirst(node, [
          "Date",
          "History_Date",
          "HistoryDate",
          "Payment_Date",
          "PaymentDate",
        ]),
      );
    }
    updateDpdFacts(dpdFacts, historyDate, parseDpdValue(dpdRaw), asOf);
  });
};

const readProfileDpdHistory = (account, dpdFacts, asOf) => {
  const profile = getFirst(account, [
    "Payment_History_Profile",
    "PaymentHistoryProfile",
  ]);
  const startDate = parseBureauDate(
    getFirst(account, [
      "Payment_History_Start_Date",
      "PaymentHistoryStartDate",
    ]),
  );
  if (!profile || !startDate) return;

  const chunks = String(profile).match(/.{1,3}/g) || [];
  chunks.forEach((chunk, index) => {
    const date = new Date(
      startDate.getFullYear(),
      startDate.getMonth() - index,
      1,
    );
    updateDpdFacts(dpdFacts, date, parseDpdValue(chunk), asOf);
  });
};

const extractCarePayBureauDpd = (bureauResponse, asOf = new Date()) => {
  if (!bureauResponse) {
    return null;
  }

  let parsedReport = bureauResponse;
  if (typeof bureauResponse === "string") {
    const trimmed = bureauResponse.trim();
    if (!trimmed) return null;
    try {
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        parsedReport = JSON.parse(trimmed);
      } else {
        parsedReport = XML_PARSER.parse(trimmed);
      }
    } catch (e) {
      console.error("[CAREPAY-BRE] Failed to parse bureauResponse:", e.message);
      return null;
    }
  }

  if (!parsedReport || typeof parsedReport !== "object") {
    return null;
  }

  const profile = parsedReport?.INProfileResponse || parsedReport;
  const accounts = extractAccounts(profile);
  if (!accounts.length) {
    return null;
  }

  const reportDateRaw =
    profile?.Header?.ReportDate ||
    profile?.CreditProfileHeader?.ReportDate ||
    getFirst(profile, ["ReportDate", "Report_Date"]);

  const referenceDate = parseBureauDate(reportDateRaw) || asOf;

  const dpdFacts = {
    maxDpd: 0,
    maxDpdLast3Months: 0,
    maxDpdLast6Months: 0,
    maxDpdLast9Months: 0,
    maxDpdLast12Months: 0,
    maxDpdLast24Months: 0,
    maxDpdLast36Months: 0,
  };

  for (const account of accounts) {
    readStructuredDpdHistory(account, dpdFacts, referenceDate);
    readProfileDpdHistory(account, dpdFacts, referenceDate);
  }

  // CarePay policy rules:
  // 1. No 30+ DPDs in last 12 months
  // 2. No 60+ DPDs in last 24 months
  // 3. No 90+ DPDs in last 36 months
  const has30PlusDpdLast12Months = dpdFacts.maxDpdLast12Months >= 30;
  const has60PlusDpdLast24Months = dpdFacts.maxDpdLast24Months >= 60;
  const has90PlusDpdLast36Months = dpdFacts.maxDpdLast36Months >= 90;

  return {
    maxDpd: dpdFacts.maxDpd,
    maxDpdLast3Months: dpdFacts.maxDpdLast3Months,
    maxDpdLast6Months: dpdFacts.maxDpdLast6Months,
    maxDpdLast9Months: dpdFacts.maxDpdLast9Months,
    maxDpdLast12Months: dpdFacts.maxDpdLast12Months,
    maxDpdLast24Months: dpdFacts.maxDpdLast24Months,
    maxDpdLast36Months: dpdFacts.maxDpdLast36Months,

    has30PlusDpdLast12Months,
    has60PlusDpdLast24Months,
    has90PlusDpdLast36Months,

    has30Plus12M: has30PlusDpdLast12Months,
    has60Plus24M: has60PlusDpdLast24Months,
    has90Plus36M: has90PlusDpdLast36Months,

    // Legacy fields preserved for backward compatibility
    hasGt30DpdLast3Months: dpdFacts.maxDpdLast3Months >= 30,
    hasGt60DpdLast9Months: dpdFacts.maxDpdLast9Months > 60,
    hasGt90DpdLast12Months: dpdFacts.maxDpdLast12Months > 90,
    has_dpd_3m: dpdFacts.maxDpdLast3Months > 0,
    has_dpd_6m: dpdFacts.maxDpdLast6Months > 0,
    has_60plus_dpd_6m: dpdFacts.maxDpdLast6Months >= 60,
    has_90plus_dpd_6m: dpdFacts.maxDpdLast6Months >= 90,
    max_dpd: dpdFacts.maxDpd,
  };
};

const getCarePayPolicy = (loanType) => {
  const normalizedLoanType = String(loanType || "")
    .trim()
    .toLowerCase();

  const commonPolicy = {
    minBureauScore: 680,
    maxAllowedDpd12M: 29, // No 30+ DPDs in last 12 months
    maxAllowedDpd24M: 59, // No 60+ DPDs in last 24 months
    maxAllowedDpd36M: 89, // No 90+ DPDs in last 36 months
  };

  if (normalizedLoanType === "short-term personal loan") {
    return {
      minAge: 18,
      maxAge: 65,
      minTenure: 1,
      maxTenure: 9,
      minAmount: 5000,
      maxAmount: 500000,
      minAnnualIncome: 114000,
      ...commonPolicy,
    };
  }

  return {
    minAge: 18,
    maxAge: 60,
    minTenure: 2,
    maxTenure: 24,
    minAmount: 5000,
    maxAmount: 500000,
    minAnnualIncome: 120000,
    ...commonPolicy,
  };
};

const normalizeCarePayAnnualIncome = (data) => {
  const annualIncome = toFiniteNumber(data.annual_income);
  if (annualIncome !== null) return annualIncome;

  const monthlyIncome = toFiniteNumber(
    data.monthly_income ?? data.net_monthly_income,
  );
  if (monthlyIncome === null) return null;

  return monthlyIncome * 12;
};

const evaluateCarePayLoginBre = ({
  data,
  requestAmount,
  bureauScore = null,
  bureauResponse = null,
  dpdFacts = null,
}) => {
  const policy = getCarePayPolicy(data.loan_type);
  const reasons = [];

  const age = calculateCarePayAge(data.dob, data.age);
  if (age === null) {
    reasons.push("AGE_MISSING");
  } else if (age < policy.minAge || age > policy.maxAge) {
    reasons.push(`AGE_NOT_IN_${policy.minAge}_${policy.maxAge}`);
  }

  const tenure = toFiniteNumber(data.loan_tenure);
  if (tenure === null) {
    reasons.push("TENURE_MISSING");
  } else if (tenure < policy.minTenure || tenure > policy.maxTenure) {
    reasons.push(`TENURE_NOT_IN_${policy.minTenure}_${policy.maxTenure}`);
  }

  const amount = toFiniteNumber(requestAmount);
  if (amount === null) {
    reasons.push("REQUEST_AMOUNT_MISSING");
  } else if (amount < policy.minAmount || amount > policy.maxAmount) {
    reasons.push(`REQUEST_AMOUNT_NOT_IN_${policy.minAmount}_${policy.maxAmount}`);
  }

  const score =
    toFiniteNumber(bureauScore) ??
    toFiniteNumber(data.cibil_score) ??
    toFiniteNumber(data.cibil_score_fintree);

  const emiAmount = toFiniteNumber(data.emi_amount);
  const abb = toFiniteNumber(data.abb);

  const abbRequired =
    (amount !== null && amount > 300000) ||
    (score !== null && score >= 1 && score <= 200) ||
    score === 680;

  if (abbRequired) {
    if (emiAmount === null) {
      reasons.push("EMI_AMOUNT_MISSING_FOR_ABB_CHECK");
    } else if (abb === null) {
      reasons.push("ABB_MISSING");
    } else {
      const requiredAbb = emiAmount * 1.5;

      if (abb < requiredAbb) {
        reasons.push("ABB_BELOW_1_5X_EMI");
      }
    }
  }

  const annualIncome = normalizeCarePayAnnualIncome(data);
  if (annualIncome === null) {
    reasons.push("INCOME_MISSING");
  } else if (annualIncome < policy.minAnnualIncome) {
    reasons.push(`INCOME_BELOW_${policy.minAnnualIncome}`);
  }

  const isNtcCustomer = String(data.customer_type || "")
    .trim()
    .toLowerCase()
    .includes("ntc");

  const isSpecialCibilRange =
    score !== null &&
    score >= 1 &&
    score <= 200;

  if (
    !isNtcCustomer &&
    score !== null &&
    !isSpecialCibilRange &&
    score < policy.minBureauScore
  ) {
    reasons.push(`CIBIL_SCORE_BELOW_${policy.minBureauScore}`);
  }

  // CarePay policy rules:
  // 1. No 30+ DPDs in last 12 months
  // 2. No 60+ DPDs in last 24 months
  // 3. No 90+ DPDs in last 36 months
  const evaluatedDpdFacts =
    dpdFacts || (bureauResponse ? extractCarePayBureauDpd(bureauResponse) : null);

  if (evaluatedDpdFacts) {
    const maxDpd12m =
      toFiniteNumber(
        evaluatedDpdFacts.maxDpdLast12Months ?? evaluatedDpdFacts.max_dpd_12m,
      ) ?? 0;
    const maxDpd24m =
      toFiniteNumber(
        evaluatedDpdFacts.maxDpdLast24Months ?? evaluatedDpdFacts.max_dpd_24m,
      ) ?? 0;
    const maxDpd36m =
      toFiniteNumber(
        evaluatedDpdFacts.maxDpdLast36Months ?? evaluatedDpdFacts.max_dpd_36m,
      ) ?? 0;

    if (
      evaluatedDpdFacts.has30PlusDpdLast12Months ||
      evaluatedDpdFacts.has30Plus12M ||
      maxDpd12m >= 30
    ) {
      reasons.push("30PLUS_DPD_LAST_12_MONTHS");
    }

    if (
      evaluatedDpdFacts.has60PlusDpdLast24Months ||
      evaluatedDpdFacts.has60Plus24M ||
      maxDpd24m >= 60
    ) {
      reasons.push("60PLUS_DPD_LAST_24_MONTHS");
    }

    if (
      evaluatedDpdFacts.has90PlusDpdLast36Months ||
      evaluatedDpdFacts.has90Plus36M ||
      maxDpd36m >= 90
    ) {
      reasons.push("90PLUS_DPD_LAST_36_MONTHS");
    }
  }

  return {
    status: reasons.length > 0 ? "BRE FAILED" : "BRE APPROVED",
    caseStatus: reasons.length > 0 ? "Rejected" : CAREPAY_BRE_APPROVED_STATUS,
    reason: reasons.length > 0 ? reasons.join(", ") : "ELIGIBLE",
    reasons,
    bureauScore: score,
    dpdFacts: evaluatedDpdFacts,
  };
};

const buildBreSnapshot = ({
  data,
  requestAmount,
  bureauScore = null,
  decision,
  bureauResponse = null,
  dpdFacts = null,
}) => {
  const policy = getCarePayPolicy(data.loan_type);

  const age = calculateCarePayAge(data.dob, data.age);
  const tenure = toFiniteNumber(data.loan_tenure);
  const amount = toFiniteNumber(requestAmount);
  const annualIncome = normalizeCarePayAnnualIncome(data);

  const score =
    toFiniteNumber(bureauScore) ??
    toFiniteNumber(data.cibil_score) ??
    toFiniteNumber(data.cibil_score_fintree);

  const isNtcCustomer = String(data.customer_type || "")
    .trim()
    .toLowerCase()
    .includes("ntc");

  const resolvedDpdFacts =
    dpdFacts ||
    decision?.dpdFacts ||
    (bureauResponse ? extractCarePayBureauDpd(bureauResponse) : null);

  const emiAmount = toFiniteNumber(data.emi_amount);
  const abb = toFiniteNumber(data.abb);
  const abbRequired =
    (amount !== null && amount > 300000) ||
    (score !== null && score >= 1 && score <= 200) ||
    score === 680;

  const bankStatementRequired =
    (amount !== null && amount > 300000) ||
    score === 680;

  const requiredAbb =
    abbRequired && emiAmount !== null
      ? emiAmount * 1.5
      : null;
  
  return {
    evaluated_at: new Date().toISOString(),

    // raw inputs used by BRE
    inputs: {
      loan_type: data.loan_type ?? null,
      dob: data.dob ?? null,
      age_supplied: data.age ?? null,
      loan_tenure: data.loan_tenure ?? null,
      request_amount: requestAmount ?? null,
      abb: data.abb ?? null,
      annual_income: data.annual_income ?? null,
      monthly_income: data.monthly_income ?? null,
      net_monthly_income: data.net_monthly_income ?? null,
      cibil_score: data.cibil_score ?? null,
      cibil_score_fintree: data.cibil_score_fintree ?? null,
      bureau_score_used: bureauScore ?? null,
      customer_type: data.customer_type ?? null,
    },

    // values the engine actually computed / normalised
    computed: {
      age,
      tenure,
      amount,
      annual_income: annualIncome,
      bureau_score: score,
      is_ntc_customer: isNtcCustomer,
      dpd: resolvedDpdFacts,
      emi_amount: emiAmount,
      abb,
      required_abb: requiredAbb,
      abb_check_applicable: amount !== null && amount > 100000,
      abb_check_passed:
        amount !== null && amount > 100000
          ? abb !== null &&
            requiredAbb !== null &&
            abb > requiredAbb
          : true,
      bank_statement_required: abbRequired,
    },

    // policy applied for this loan_type
    policy,

    // decision
    decision: {
      status: decision.status,       // BRE APPROVED | BRE FAILED
      caseStatus: decision.caseStatus, // BRE Approved | Rejected
      reason: decision.reason,
      reasons: decision.reasons,
    },
  };
};

const autoApproveCarePayIfBureauVerified = async (lan) => {
  const pool = db.promise();
  /**  1) Check bureau status */
  const [kycRows] = await pool.query(
    `SELECT bureau_status, bureau_api_response
     FROM kyc_verification_status
     WHERE lan = ?
     LIMIT 1`,
    [lan],
  );

  if (!kycRows.length) {
    console.log(`[CAREPAY-BRE] No KYC row found for LAN: ${lan}`);

    return {
      success: false,
      reason: "KYC_ROW_NOT_FOUND",
    };
  }

  const kyc = kycRows[0];

  if (
    String(kyc.bureau_status || "")
      .trim()
      .toUpperCase() !== "VERIFIED"
  ) {
    console.log(
      `[CAREPAY-BRE] Bureau not verified for ${lan}:`,
      kyc.bureau_status,
    );

    return {
      success: false,
      reason: `BUREAU_STATUS=${kyc.bureau_status || "NA"}`,
    };
  }

  /**
   * 2) Fetch CarePay loan
   */
  const [loanRows] = await pool.query(
    `SELECT
       lan,
       product,
       dob,
       age,
       loan_tenure,
       request_amount,
       loan_amount,
       annual_income,
       emi_amount,
       abb,
       cibil_score,
       cibil_score_fintree,
       customer_type
     FROM loan_booking_carepay
     WHERE lan = ?
     LIMIT 1`,
    [lan],
  );

  if (!loanRows.length) {
    console.log(`[CAREPAY-BRE] Loan not found for LAN: ${lan}`);

    return {
      success: false,
      reason: "LOAN_NOT_FOUND",
    };
  }

  const loan = loanRows[0];

  /**
   * 3) Get latest bureau result
   */
  const [cibilRows] = await pool.query(
    `SELECT
       score,
       report_xml,
       created_at
     FROM loan_cibil_reports
     WHERE lan = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [lan],
  );

  if (!cibilRows.length) {
    console.log(
      `[CAREPAY-BRE] Bureau report not found for LAN: ${lan}`,
    );

    return {
      success: false,
      reason: "BUREAU_REPORT_MISSING",
    };
  }

  const latestBureau = cibilRows[0];

  /**
   * Score inserted by retriggerBureau()
   */
  const bureauScore =
    toFiniteNumber(latestBureau.score) ??
    toFiniteNumber(loan.cibil_score) ??
    toFiniteNumber(loan.cibil_score_fintree);

  if (bureauScore === null) {
    console.log(
      `[CAREPAY-BRE] Bureau score missing for LAN: ${lan}`,
    );

    return {
      success: false,
      reason: "BUREAU_SCORE_MISSING",
    };
  }

  /**
   * 4) Parse Experian XML for BRE snapshot / DPD facts
   */
  let bureauResponse = null;

  if (latestBureau.report_xml) {
    try {
      if (typeof latestBureau.report_xml === "object") {
        bureauResponse = latestBureau.report_xml;
      } else {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "",
          trimValues: true,
        });

        bureauResponse = parser.parse(
          String(latestBureau.report_xml),
        );
      }
    } catch (err) {
      console.error(
        `[CAREPAY-BRE] Bureau XML parse warning for ${lan}:`,
        err.message,
      );

      bureauResponse = null;
    }
  }

  /**
   * 5) Prepare data expected by CarepayBreEngine
   *
   * IMPORTANT:
   * loan_type was saved in DB column "product"
   */
  const data = {
    ...loan,

    loan_type: loan.product,

    cibil_score: bureauScore,
  };

  const requestAmount =
    toFiniteNumber(loan.request_amount) ??
    toFiniteNumber(loan.loan_amount);

  if (requestAmount === null) {
    return {
      success: false,
      reason: "REQUEST_AMOUNT_MISSING",
    };
  }

  /**
   * 6) RUN CAREPAY BRE
   */
  const dpdFacts = extractCarePayBureauDpd(bureauResponse || latestBureau.report_xml);

  const decision = evaluateCarePayLoginBre({
    data,
    requestAmount,
    bureauScore,
    bureauResponse,
    dpdFacts,
  });

  /**
   * 7) Build snapshot
   */
  const breSnapshot = buildBreSnapshot({
    data,
    requestAmount,
    bureauScore,
    decision,
    bureauResponse,
    dpdFacts,
  });

  /**
   * 8) Update final CarePay status
   */
  await pool.query(
    `UPDATE loan_booking_carepay
     SET
       cibil_score = ?,
       status = ?,
       bre_snapshot = ?,
       updated_at = NOW()
     WHERE lan = ?`,
    [
      bureauScore,
      decision.caseStatus,
      JSON.stringify(breSnapshot),
      lan,
    ],
  );

  console.log(
    `✅ [CAREPAY-BRE] Completed for ${lan}:`,
    {
      bureauScore,
      breStatus: decision.status,
      status: decision.caseStatus,
      reasons: decision.reasons,
    },
  );

  return {
    success: true,
    lan,
    bureauScore,
    breStatus: decision.status,
    status: decision.caseStatus,
    reason: decision.reason,
    reasons: decision.reasons,
  };
};

module.exports = {
  extractCarePayBureauDpd,
  evaluateCarePayLoginBre,
  buildBreSnapshot,
  getCarePayPolicy,
  calculateCarePayAge,
  normalizeCarePayAnnualIncome,
  toFiniteNumber,
  isProvided,
  autoApproveCarePayIfBureauVerified,
};
