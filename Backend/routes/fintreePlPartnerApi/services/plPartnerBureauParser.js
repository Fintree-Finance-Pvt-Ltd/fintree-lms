/**
 * PL Partner bureau (CIBIL/Experian) XML report parser.
 *
 * Full duplicate of Backend/routes/switchMyLoan/rapidMoneyPolicy.js's
 * parseBureauReport + all of its extraction helpers, kept as an independent
 * copy so RapidMoney's bureau interpretation is never affected by changes
 * made here, and vice versa (per the same separation used for the rest of
 * the PL Partner integration).
 */
const { XMLParser } = require("fast-xml-parser");
const {
  ACCOUNT_TYPE,
  getExperianDescription,
} = require("../../../utils/experian_description");
const { POLICY } = require("./plPartnerPolicy");

const UNSECURED_CATEGORIES = [
  "Other",
  "Discloser",
  "Note Loan",
  "Debit Card",
  "Fleet Card",
  "Staff Loan",
  "Credit Card",
  "Medical Debt",
  "Attorney Fees",
  "Child Support",
  "Consumer Loan",
  "Personal Loan",
  "Charge Account",
  "Debt Purchaser",
  "Life Insurance",
  "Returned Check",
  "Status Not Set",
  "Telco Landline",
  "Telco Wireless",
  "Government Fine",
  "Household Goods",
  "Telco Broadband",
  "Time Share Loan",
  "Utility Company",
  "Educational Loan",
  "Government Grant",
  "Home Improvement",
  "Rental Agreement",
  "General Insurance",
  "P2P Personal Loan",
  "Debt Consolidation",
  "Government Benefit",
  "Gecl Loan Unsecured",
  "Loan On Credit Card",
  "Loan To Professional",
  "Business Loan General",
  "Corporate Credit Card",
  "Government Overpayment",
  "Business Loan Unsecured",
  "Recreational Merchandise",
  "Collection Agency Attorney",
  "Instalment Sales Contract",
  "Business Loan - Unsecured",
  "Government Employee Advance",
  "Government Fee For Services",
  "Telecommunications Cellular",
  "Government Miscellaneous Debt",
  "Flexible Spending Credit Card",
  "Mudra Loans Shishu Kishor Tarun",
  "Government Unsecured Direct Loan",
  "Inquiry Request Purpose Disclosure",
  "Business Line Personally Guaranteed",
  "Business Loan Priority Sector Others",
  "Government Unsecured Guaranteed Loan",
  "Prime Minister Jaan Dhan Yojana Overdraft",
  "Business Non Funded Credit Facility General",
  "Business Loan Priority Sector Small Business",
  "Business Non Funded Credit Facility Priority Sector Others",
  "Business Non Funded Credit Facility Priority Sector Agriculture",
  "Business Non Funded Credit Facility Priority Sector Small Business",
  "Short Term Personal Loan",
];

const SECURED_CATEGORIES = [
  "Auto Loan",
  "Housing Loan",
  "Property Loan",
  "Loan Against Shares Securities",
  "Gold Loan",
  "Two-Wheeler Loan",
  "Loan Against Bank Deposits",
  "Commercial Vehicle Loan",
  "Gecl Secured",
  "Secured Credit Card",
  "Used Car Loan",
  "Construction Equipment Loan",
  "Tractor Loan",
  "Microfinance Housing Loan",
  "P2P Auto Loan",
  "Business Loan - Secured",
  "Business Loans Against Bank Deposits",
  "Priority Sector Gold Loan Secured",
];

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  processEntities: true,
});

function toArray(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const normalized = String(value)
    .replace(/,/g, "")
    .replace(/[^0-9.-]/g, "")
    .trim();

  if (!normalized) return null;

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeName(value) {
  return String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/\[.*?\]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const NORMALIZED_UNSECURED_CATEGORIES = new Set(
  UNSECURED_CATEGORIES.map(normalizeName),
);

const NORMALIZED_SECURED_CATEGORIES = new Set(
  SECURED_CATEGORIES.map(normalizeName),
);

function walk(node, visitor, path = []) {
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
}

function getFirst(object, fieldNames) {
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
}

function findFirstValueByKeys(root, keys) {
  const keySet = new Set(keys.map((key) => String(key).toLowerCase()));
  let found = null;

  walk(root, (node) => {
    if (found !== null) return;

    for (const [key, value] of Object.entries(node)) {
      if (keySet.has(String(key).toLowerCase())) {
        found = value;
        return;
      }
    }
  });

  return found;
}

function findAllValuesByKeys(root, keys) {
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
}

function parseBureauDate(value) {
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
}

function monthsDifference(fromDate, toDate = new Date()) {
  if (!fromDate) return null;

  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
    (toDate.getMonth() - fromDate.getMonth())
  );
}

function daysDifference(fromDate, toDate = new Date()) {
  if (!fromDate) return null;

  const from = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
  );
  const to = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());

  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function normalizePanValues(value) {
  if (value === null || value === undefined) return [];

  return (
    String(value)
      .toUpperCase()
      .match(/[A-Z]{5}[0-9]{4}[A-Z]/g) || []
  );
}

function extractPanNumbers(parsedReport) {
  const panValues = findAllValuesByKeys(parsedReport, [
    "IncomeTaxPan",
    "Income_Tax_Pan",
    "PAN",
    "Pan",
    "PAN_Number",
    "PanNumber",
    "Permanent_Account_Number",
    "PermanentAccountNumber",
  ]);

  const panSet = new Set();

  for (const value of panValues) {
    normalizePanValues(value).forEach((pan) => panSet.add(pan));
  }

  return [...panSet];
}

function extractEnquiries30Days(parsedReport, asOf = new Date()) {
  const profile = parsedReport?.INProfileResponse || parsedReport || {};

  /*
   * Priority 1:
   * Exact total enquiry field from Experian response.
   */
  const totalCapsLast30Days = toFiniteNumber(
    profile?.CAPS?.CAPS_Summary?.CAPSLast30Days,
  );

  if (totalCapsLast30Days !== null) {
    return {
      total: Math.max(0, Math.trunc(totalCapsLast30Days)),
      credit: toFiniteNumber(profile?.CAPS?.CAPS_Summary?.CAPSLast30Days),
      nonCredit: toFiniteNumber(
        profile?.NonCreditCAPS?.NonCreditCAPS_Summary?.NonCreditCAPSLast30Days,
      ),
      source: "TOTAL_CAPS_SUMMARY",
    };
  }

  /*
   * Priority 2:
   * Add credit and non-credit enquiries.
   */
  const creditEnquiries = toFiniteNumber(
    profile?.CAPS?.CAPS_Summary?.CAPSLast30Days,
  );

  const nonCreditEnquiries = toFiniteNumber(
    profile?.NonCreditCAPS?.NonCreditCAPS_Summary?.NonCreditCAPSLast30Days,
  );

  if (creditEnquiries !== null || nonCreditEnquiries !== null) {
    const total = Number(creditEnquiries || 0) + Number(nonCreditEnquiries || 0);

    return {
      total: Math.max(0, Math.trunc(total)),
      credit: creditEnquiries === null ? null : Math.max(0, Math.trunc(creditEnquiries)),
      nonCredit:
        nonCreditEnquiries === null ? null : Math.max(0, Math.trunc(nonCreditEnquiries)),
      source: "CAPS_PLUS_NON_CREDIT_CAPS",
    };
  }

  /*
   * Priority 3:
   * Count individual enquiry dates only when summary fields are unavailable.
   */
  const creditApplications = toArray(profile?.CAPS?.CAPS_Application_Details);
  const nonCreditApplications = toArray(profile?.NonCreditCAPS?.CAPS_Application_Details);
  const allApplications = [...creditApplications, ...nonCreditApplications];

  let totalFromDates = 0;
  let creditFromDates = 0;
  let nonCreditFromDates = 0;

  for (const application of creditApplications) {
    const requestDate = parseBureauDate(
      application?.Date_of_Request ||
        application?.DateOfRequest ||
        application?.Enquiry_Date ||
        application?.EnquiryDate ||
        application?.Inquiry_Date ||
        application?.InquiryDate,
    );

    const difference = daysDifference(requestDate, asOf);

    if (difference !== null && difference >= 0 && difference < 30) {
      creditFromDates += 1;
    }
  }

  for (const application of nonCreditApplications) {
    const requestDate = parseBureauDate(
      application?.Date_of_Request ||
        application?.DateOfRequest ||
        application?.Enquiry_Date ||
        application?.EnquiryDate ||
        application?.Inquiry_Date ||
        application?.InquiryDate,
    );

    const difference = daysDifference(requestDate, asOf);

    if (difference !== null && difference >= 0 && difference < 30) {
      nonCreditFromDates += 1;
    }
  }

  totalFromDates = creditFromDates + nonCreditFromDates;

  /*
   * Some response versions may store applications in a generic structure.
   * Use recursive fallback only when direct CAPS arrays are empty.
   */
  if (allApplications.length === 0) {
    const enquiryDateFields = new Set(
      [
        "Date_of_Request",
        "DateOfRequest",
        "Enquiry_Date",
        "EnquiryDate",
        "Inquiry_Date",
        "InquiryDate",
        "Date_of_Enquiry",
        "DateOfEnquiry",
      ].map((field) => field.toLowerCase()),
    );

    walk(parsedReport, (node) => {
      for (const [key, value] of Object.entries(node)) {
        if (!enquiryDateFields.has(String(key).toLowerCase())) {
          continue;
        }

        const requestDate = parseBureauDate(value);
        const difference = daysDifference(requestDate, asOf);

        if (difference !== null && difference >= 0 && difference < 30) {
          totalFromDates += 1;
        }
      }
    });
  }

  return {
    total: Math.max(0, totalFromDates),
    credit: creditFromDates,
    nonCredit: nonCreditFromDates,
    source: "INDIVIDUAL_ENQUIRY_DATES",
  };
}

function extractAccounts(parsedReport) {
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

    const accountNumber = getFirst(node, ["Account_Number", "AccountNumber"]);

    if (accountType === null && accountName === null && accountNumber === null) {
      return;
    }

    if (fallbackSeen.has(node)) return;
    fallbackSeen.add(node);
    fallbackAccounts.push(node);
  });

  return fallbackAccounts;
}

function extractAccountName(account) {
  const rawCode = getFirst(account, [
    "Account_Type",
    "AccountType",
    "AccountTypeCode",
    "Account_Type_Code",
  ]);

  const rawName = getFirst(account, [
    "Account_Type_Description",
    "AccountTypeDescription",
    "AccountTypeName",
  ]);

  const code = rawCode === null || rawCode === undefined ? null : String(rawCode).trim();

  let accountName = rawName ? String(rawName).trim() : "";
  let mappingMissing = false;

  if (!accountName && code) {
    const mapped = getExperianDescription(ACCOUNT_TYPE, code);

    if (mapped && !String(mapped).startsWith("Unknown code:")) {
      accountName = String(mapped).trim();
    } else {
      mappingMissing = true;
    }
  }

  return { code, accountName, mappingMissing };
}

function extractOriginalAmount(account) {
  const value = toFiniteNumber(
    getFirst(account, [
      "Highest_Credit_or_Original_Loan_Amount",
      "HighestCreditOrOriginalLoanAmount",
      "Original_Loan_Amount",
      "OriginalLoanAmount",
      "Sanctioned_Amount",
      "Sanction_Amount",
      "SanctionAmount",
      "Credit_Limit",
      "CreditLimit",
      "Highest_Credit",
      "HighestCredit",
    ]),
  );

  return Math.max(0, value || 0);
}

function extractOverdueAmount(account) {
  const value = toFiniteNumber(
    getFirst(account, [
      "Amount_Overdue",
      "AmountOverdue",
      "Overdue_Amount",
      "OverdueAmount",
      "Past_Due_Amount",
      "PastDueAmount",
    ]),
  );

  return Math.max(0, value || 0);
}

function parseDpdValue(value) {
  if (value === null || value === undefined || value === "") return null;

  const text = String(value).trim().toUpperCase();

  if (["STD", "000", "0", "XXX", "---", "NIL"].includes(text)) {
    return 0;
  }

  if (/^\d+$/.test(text)) return Number(text);
  return null;
}

function updateDpdFacts(facts, date, dpd, asOf) {
  if (!date || dpd === null) return;

  const difference = monthsDifference(date, asOf);
  if (difference === null || difference < 0) return;

  if (difference < 3) {
    facts.maxDpdLast3Months = Math.max(facts.maxDpdLast3Months, dpd);
  }

  if (difference < 9) {
    facts.maxDpdLast9Months = Math.max(facts.maxDpdLast9Months, dpd);
  }

  if (difference < 12) {
    facts.maxDpdLast12Months = Math.max(facts.maxDpdLast12Months, dpd);
  }
}

function readStructuredDpdHistory(account, dpdFacts, asOf) {
  const visited = new Set();

  walk(account, (node) => {
    if (visited.has(node)) return;

    const dpdRaw = getFirst(node, ["Days_Past_Due", "DaysPastDue", "DPD", "Dpd"]);

    if (dpdRaw === null || dpdRaw === undefined) return;
    visited.add(node);

    const year = toFiniteNumber(getFirst(node, ["Year", "YEAR"]));
    const month = toFiniteNumber(getFirst(node, ["Month", "MONTH"]));

    let historyDate = null;

    if (year && month && month >= 1 && month <= 12) {
      historyDate = new Date(year, month - 1, 1);
    } else {
      historyDate = parseBureauDate(
        getFirst(node, ["Date", "History_Date", "HistoryDate", "Payment_Date", "PaymentDate"]),
      );
    }

    updateDpdFacts(dpdFacts, historyDate, parseDpdValue(dpdRaw), asOf);
  });
}

function readProfileDpdHistory(account, dpdFacts, asOf) {
  const profile = getFirst(account, ["Payment_History_Profile", "PaymentHistoryProfile"]);

  const startDate = parseBureauDate(
    getFirst(account, ["Payment_History_Start_Date", "PaymentHistoryStartDate"]),
  );

  if (!profile || !startDate) return;

  const chunks = String(profile).match(/.{1,3}/g) || [];

  chunks.forEach((chunk, index) => {
    const date = new Date(startDate.getFullYear(), startDate.getMonth() - index, 1);
    updateDpdFacts(dpdFacts, date, parseDpdValue(chunk), asOf);
  });
}

function parseBureauReport(reportXml, reportId = null, source = "REUSED_REPORT", asOf = new Date()) {
  try {
    const parsedReport =
      typeof reportXml === "string" ? XML_PARSER.parse(reportXml) : reportXml;

    if (!parsedReport || typeof parsedReport !== "object") {
      throw new Error("Bureau report is empty or invalid");
    }

    const profile = parsedReport?.INProfileResponse || parsedReport;

    /*
     * Use the bureau report date as the reference date for enquiry and DPD windows.
     */
    const reportDateRaw =
      profile?.Header?.ReportDate ||
      profile?.CreditProfileHeader?.ReportDate ||
      findFirstValueByKeys(parsedReport, ["ReportDate"]);

    const reportDate = parseBureauDate(reportDateRaw) || asOf;

    const specificScore = findFirstValueByKeys(parsedReport, [
      "BureauScore",
      "CreditScore",
      "ScoreValue",
    ]);

    const score = toFiniteNumber(specificScore ?? findFirstValueByKeys(parsedReport, ["Score"]));

    const panNumbers = extractPanNumbers(parsedReport);
    const enquiryFacts = extractEnquiries30Days(parsedReport, reportDate);
    const enquiries30Days = enquiryFacts.total;

    const accounts = extractAccounts(parsedReport);

    const matchedTradelines = [];
    const matchedSecuredTradelines = [];
    const unmappedAccountTypeCodes = [];
    const seenUnmappedCodes = new Set();

    let totalOverdueAmount = 0;

    const dpdFacts = {
      maxDpdLast3Months: 0,
      maxDpdLast9Months: 0,
      maxDpdLast12Months: 0,
    };

    for (const account of accounts) {
      const { code, accountName, mappingMissing } = extractAccountName(account);

      if (mappingMissing && code && !seenUnmappedCodes.has(code)) {
        seenUnmappedCodes.add(code);
        unmappedAccountTypeCodes.push(code);
      }

      const normalizedAccountName = normalizeName(accountName);
      const originalAmount = extractOriginalAmount(account);

      if (accountName && NORMALIZED_UNSECURED_CATEGORIES.has(normalizedAccountName)) {
        matchedTradelines.push({
          accountTypeCode: code,
          normalizedAccountName,
          amount: originalAmount,
        });
      }

      if (accountName && NORMALIZED_SECURED_CATEGORIES.has(normalizedAccountName)) {
        matchedSecuredTradelines.push({
          accountTypeCode: code,
          normalizedAccountName,
          amount: originalAmount,
        });
      }

      totalOverdueAmount += extractOverdueAmount(account);
      readStructuredDpdHistory(account, dpdFacts, reportDate);
      readProfileDpdHistory(account, dpdFacts, reportDate);
    }

    const unsecuredAggregate = round2(
      matchedTradelines.reduce((sum, tradeline) => sum + Number(tradeline.amount || 0), 0),
    );

    const securedAggregate = round2(
      matchedSecuredTradelines.reduce((sum, tradeline) => sum + Number(tradeline.amount || 0), 0),
    );

    return {
      ok: true,
      score,

      panCount: panNumbers.length,
      hasDualPan: panNumbers.length > 1,

      reportDate: reportDateRaw ? String(reportDateRaw) : null,

      enquiries30Days,
      enquiryBreakdown30Days: {
        total: enquiryFacts.total,
        credit: enquiryFacts.credit,
        nonCredit: enquiryFacts.nonCredit,
        source: enquiryFacts.source,
      },

      totalOverdueAmount: round2(totalOverdueAmount),

      maxDpdLast3Months: dpdFacts.maxDpdLast3Months,
      maxDpdLast9Months: dpdFacts.maxDpdLast9Months,
      maxDpdLast12Months: dpdFacts.maxDpdLast12Months,

      hasGt30DpdLast3Months: dpdFacts.maxDpdLast3Months > POLICY.DPD_REJECT_ABOVE_LAST_3_MONTHS,
      hasGt60DpdLast9Months: dpdFacts.maxDpdLast9Months > POLICY.DPD_REJECT_ABOVE_LAST_9_MONTHS,
      hasGt90DpdLast12Months: dpdFacts.maxDpdLast12Months > POLICY.DPD_REJECT_ABOVE_LAST_12_MONTHS,

      totalTradelines: accounts.length,
      unsecuredTradelineCount: matchedTradelines.length,
      unsecuredAggregate,
      matchedTradelines,
      securedTradelineCount: matchedSecuredTradelines.length,
      securedAggregate,
      matchedSecuredTradelines,
      unmappedAccountTypeCodes,

      reportId,
      source,
    };
  } catch (error) {
    return {
      ok: false,
      error: "BUREAU_PARSE_FAILED",
      safeMessage: error.message,
      score: null,
      panCount: 0,
      hasDualPan: false,
      enquiries30Days: 0,
      totalOverdueAmount: 0,
      maxDpdLast3Months: 0,
      maxDpdLast9Months: 0,
      maxDpdLast12Months: 0,
      hasGt30DpdLast3Months: false,
      hasGt60DpdLast9Months: false,
      hasGt90DpdLast12Months: false,
      totalTradelines: 0,
      unsecuredTradelineCount: 0,
      unsecuredAggregate: 0,
      matchedTradelines: [],
      securedTradelineCount: 0,
      securedAggregate: 0,
      matchedSecuredTradelines: [],
      unmappedAccountTypeCodes: [],
      reportId,
      source,
    };
  }
}

module.exports = {
  UNSECURED_CATEGORIES,
  SECURED_CATEGORIES,
  normalizeName,
  parseBureauReport,
  round2,
};
