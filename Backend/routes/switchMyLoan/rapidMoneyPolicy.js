const { XMLParser } = require("fast-xml-parser");
const {
  ACCOUNT_TYPE,
  getExperianDescription,
} = require("../../utils/experian_description");

/**
 * RapidMoney BRE policy based only on the supplied policy PDF.
 *
 * Included rules:
 * - No dual PAN
 * - Bureau score >= 650
 * - Enquiries in last 30 days must be below 5
 * - Total overdue amount must be below Rs 1,000
 * - No DPD > 30 in last 3 months
 * - No DPD > 60 in last 9 months
 * - No DPD > 90 in last 12 months
 * - Loan amount Rs 5,000 to Rs 15,000, in multiples of Rs 1,000
 * - First-time RapidMoney borrower maximum Rs 8,000
 * - Repeat borrower below age 28 maximum Rs 10,000
 * - New-customer unsecured aggregate >= Rs 2,00,000 for Rs 8,000 limit
 * - Repeat-customer multiplier and Rs 15,000 cap
 *
 * Only the rules explicitly present in the supplied policy PDF are evaluated.
 */
const POLICY = Object.freeze({
  MIN_BUREAU_SCORE: 650,

  MIN_LOAN_AMOUNT: 8000,
  MAX_LOAN_AMOUNT: 15000,
  LOAN_AMOUNT_MULTIPLE: 1000,

  FIRST_TIME_CUSTOMER_LIMIT: 8000,
  REPEAT_CUSTOMER_UNDER_28_LIMIT: 10000,
  MAX_REPEAT_CUSTOMER_LIMIT: 15000,
  MIN_UNSECURED_AGGREGATE: 200000,

  ENQUIRY_REJECT_FROM_30_DAYS: 5,
  OVERDUE_REJECT_FROM: 1000,

  DPD_REJECT_ABOVE_LAST_3_MONTHS: 30,
  DPD_REJECT_ABOVE_LAST_9_MONTHS: 60,
  DPD_REJECT_ABOVE_LAST_12_MONTHS: 90,
});

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
    .replace(/[\u2013\u2014]/g, "-")
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

function calculateAge(dob, asOf = new Date()) {
  if (!dob) return null;

  const birthDate = dob instanceof Date ? new Date(dob) : new Date(dob);
  const currentDate = asOf instanceof Date ? new Date(asOf) : new Date(asOf);

  if (
    Number.isNaN(birthDate.getTime()) ||
    Number.isNaN(currentDate.getTime())
  ) {
    return null;
  }

  let age = currentDate.getFullYear() - birthDate.getFullYear();

  const birthdayNotReached =
    currentDate.getMonth() < birthDate.getMonth() ||
    (currentDate.getMonth() === birthDate.getMonth() &&
      currentDate.getDate() < birthDate.getDate());

  if (birthdayNotReached) age -= 1;
  return age;
}

function validateLoanAmount(value) {
  const amount = toFiniteNumber(value);

  if (amount === null || amount <= 0) {
    return {
      passed: false,
      reason: "INVALID_LOAN_AMOUNT",
      amount,
    };
  }

  if (
    amount < POLICY.MIN_LOAN_AMOUNT ||
    amount > POLICY.MAX_LOAN_AMOUNT
  ) {
    return {
      passed: false,
      reason: "LOAN_AMOUNT_OUTSIDE_8000_TO_15000",
      amount,
    };
  }

  if (amount % POLICY.LOAN_AMOUNT_MULTIPLE !== 0) {
    return {
      passed: false,
      reason: "LOAN_AMOUNT_NOT_MULTIPLE_OF_1000",
      amount,
    };
  }

  return {
    passed: true,
    reason: null,
    amount,
  };
}

function isNewCustomer(totalDisbursedApplications) {
  const count = Number(totalDisbursedApplications ?? 0);
  return !Number.isFinite(count) || count <= 0;
}

function roundDownToThousand(value) {
  return (
    Math.floor(Number(value || 0) / POLICY.LOAN_AMOUNT_MULTIPLE) *
    POLICY.LOAN_AMOUNT_MULTIPLE
  );
}

/**
 * The PDF shows the first repeat bracket as "> 1" and the next as "3-6".
 * That leaves a first repeat customer with one prior disbursal undefined.
 * The implementation therefore applies 1.25x for 1-2 prior disbursals.
 */
function getRepeatMultiplier(totalDisbursedApplications) {
  const count = Number(totalDisbursedApplications ?? 0);

  if (!Number.isInteger(count) || count <= 0) return null;
  if (count <= 2) return 1.25;
  if (count <= 6) return 2;
  return 2.5;
}

function calculateRepeatCreditLimit(
  totalDisbursedApplications,
  previousLoanAmount,
  age,
) {
  const multiplier = getRepeatMultiplier(totalDisbursedApplications);
  const previousAmount = toFiniteNumber(previousLoanAmount);

  if (multiplier === null || previousAmount === null || previousAmount <= 0) {
    return {
      creditLimit: null,
      multiplier,
      rawLimit: null,
      cappedLimit: null,
      roundedLimit: null,
      ageCapApplied: false,
    };
  }

  const rawLimit = previousAmount * multiplier;
  let cappedLimit = Math.min(rawLimit, POLICY.MAX_REPEAT_CUSTOMER_LIMIT);
  let ageCapApplied = false;

  if (age !== null && age < 28) {
    cappedLimit = Math.min(
      cappedLimit,
      POLICY.REPEAT_CUSTOMER_UNDER_28_LIMIT,
    );
    ageCapApplied = true;
  }

  const roundedLimit = roundDownToThousand(cappedLimit);

  return {
    creditLimit: roundedLimit,
    multiplier,
    rawLimit: round2(rawLimit),
    cappedLimit: round2(cappedLimit),
    roundedLimit,
    ageCapApplied,
  };
}

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
  const profile =
    parsedReport?.INProfileResponse ||
    parsedReport ||
    {};

  /*
   * Priority 1:
   * Exact total enquiry field from Experian response.
   *
   * Example:
   * TotalCAPSLast30Days = 2
   */
  const totalCapsLast30Days = toFiniteNumber(
    profile?.TotalCAPS_Summary
      ?.TotalCAPSLast30Days,
  );

  if (totalCapsLast30Days !== null) {
    return {
      total: Math.max(
        0,
        Math.trunc(totalCapsLast30Days),
      ),
      credit: toFiniteNumber(
        profile?.CAPS
          ?.CAPS_Summary
          ?.CAPSLast30Days,
      ),
      nonCredit: toFiniteNumber(
        profile?.NonCreditCAPS
          ?.NonCreditCAPS_Summary
          ?.NonCreditCAPSLast30Days,
      ),
      source: "TOTAL_CAPS_SUMMARY",
    };
  }

  /*
   * Priority 2:
   * Add credit and non-credit enquiries.
   */
  const creditEnquiries = toFiniteNumber(
    profile?.CAPS
      ?.CAPS_Summary
      ?.CAPSLast30Days,
  );

  const nonCreditEnquiries = toFiniteNumber(
    profile?.NonCreditCAPS
      ?.NonCreditCAPS_Summary
      ?.NonCreditCAPSLast30Days,
  );

  if (
    creditEnquiries !== null ||
    nonCreditEnquiries !== null
  ) {
    const total =
      Number(creditEnquiries || 0) +
      Number(nonCreditEnquiries || 0);

    return {
      total: Math.max(
        0,
        Math.trunc(total),
      ),
      credit:
        creditEnquiries === null
          ? null
          : Math.max(
              0,
              Math.trunc(creditEnquiries),
            ),
      nonCredit:
        nonCreditEnquiries === null
          ? null
          : Math.max(
              0,
              Math.trunc(nonCreditEnquiries),
            ),
      source:
        "CAPS_PLUS_NON_CREDIT_CAPS",
    };
  }

  /*
   * Priority 3:
   * Count individual enquiry dates only when
   * summary fields are unavailable.
   */
  const creditApplications = toArray(
    profile?.CAPS
      ?.CAPS_Application_Details,
  );

  const nonCreditApplications = toArray(
    profile?.NonCreditCAPS
      ?.CAPS_Application_Details,
  );

  const allApplications = [
    ...creditApplications,
    ...nonCreditApplications,
  ];

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

    const difference = daysDifference(
      requestDate,
      asOf,
    );

    if (
      difference !== null &&
      difference >= 0 &&
      difference < 30
    ) {
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

    const difference = daysDifference(
      requestDate,
      asOf,
    );

    if (
      difference !== null &&
      difference >= 0 &&
      difference < 30
    ) {
      nonCreditFromDates += 1;
    }
  }

  totalFromDates =
    creditFromDates +
    nonCreditFromDates;

  /*
   * Some response versions may store applications
   * in a generic structure. Use recursive fallback
   * only when direct CAPS arrays are empty.
   */
  if (
    allApplications.length === 0
  ) {
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
      ].map((field) =>
        field.toLowerCase(),
      ),
    );

    walk(parsedReport, (node) => {
      for (
        const [key, value] of
        Object.entries(node)
      ) {
        if (
          !enquiryDateFields.has(
            String(key).toLowerCase(),
          )
        ) {
          continue;
        }

        const requestDate =
          parseBureauDate(value);

        const difference =
          daysDifference(
            requestDate,
            asOf,
          );

        if (
          difference !== null &&
          difference >= 0 &&
          difference < 30
        ) {
          totalFromDates += 1;
        }
      }
    });
  }

  return {
    total: Math.max(
      0,
      totalFromDates,
    ),
    credit: creditFromDates,
    nonCredit: nonCreditFromDates,
    source:
      "INDIVIDUAL_ENQUIRY_DATES",
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

  const code =
    rawCode === null || rawCode === undefined ? null : String(rawCode).trim();

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

  return {
    code,
    accountName,
    mappingMissing,
  };
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
}

function readProfileDpdHistory(account, dpdFacts, asOf) {
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
}

function parseBureauReport(
  reportXml,
  reportId = null,
  source = "REUSED_REPORT",
  asOf = new Date(),
) {
  try {
    const parsedReport =
      typeof reportXml === "string" ? XML_PARSER.parse(reportXml) : reportXml;

    if (!parsedReport || typeof parsedReport !== "object") {
      throw new Error("Bureau report is empty or invalid");
    }

    const profile =
  parsedReport?.INProfileResponse ||
  parsedReport;

/*
 * Use the bureau report date as the reference date
 * for enquiry and DPD windows.
 */
const reportDateRaw =
  profile?.Header?.ReportDate ||
  profile?.CreditProfileHeader?.ReportDate ||
  findFirstValueByKeys(
    parsedReport,
    ["ReportDate"],
  );

const reportDate =
  parseBureauDate(reportDateRaw) ||
  asOf;

    const specificScore = findFirstValueByKeys(parsedReport, [
      "BureauScore",
      "CreditScore",
      "ScoreValue",
    ]);

    const score = toFiniteNumber(
      specificScore ?? findFirstValueByKeys(parsedReport, ["Score"]),
    );

    const panNumbers = extractPanNumbers(parsedReport);
    const enquiryFacts =
  extractEnquiries30Days(
    parsedReport,
    reportDate,
  );

const enquiries30Days =
  enquiryFacts.total;


    const accounts = extractAccounts(parsedReport);

    const matchedTradelines = [];
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

      if (
        accountName &&
        NORMALIZED_UNSECURED_CATEGORIES.has(normalizedAccountName)
      ) {
        matchedTradelines.push({
          accountTypeCode: code,
          normalizedAccountName,
          amount: originalAmount,
        });
      }

      totalOverdueAmount += extractOverdueAmount(account);
      readStructuredDpdHistory(
  account,
  dpdFacts,
  reportDate,
);

readProfileDpdHistory(
  account,
  dpdFacts,
  reportDate,
);
    }

    const unsecuredAggregate = round2(
      matchedTradelines.reduce(
        (sum, tradeline) => sum + Number(tradeline.amount || 0),
        0,
      ),
    );

    return {
      ok: true,
      score,

      panCount: panNumbers.length,
      hasDualPan: panNumbers.length > 1,

      reportDate:
  reportDateRaw
    ? String(reportDateRaw)
    : null,

enquiries30Days,

enquiryBreakdown30Days: {
  total:
    enquiryFacts.total,

  credit:
    enquiryFacts.credit,

  nonCredit:
    enquiryFacts.nonCredit,

  source:
    enquiryFacts.source,
},

totalOverdueAmount:
  round2(totalOverdueAmount),

      maxDpdLast3Months: dpdFacts.maxDpdLast3Months,
      maxDpdLast9Months: dpdFacts.maxDpdLast9Months,
      maxDpdLast12Months: dpdFacts.maxDpdLast12Months,

      hasGt30DpdLast3Months:
        dpdFacts.maxDpdLast3Months >
        POLICY.DPD_REJECT_ABOVE_LAST_3_MONTHS,
      hasGt60DpdLast9Months:
        dpdFacts.maxDpdLast9Months >
        POLICY.DPD_REJECT_ABOVE_LAST_9_MONTHS,
      hasGt90DpdLast12Months:
        dpdFacts.maxDpdLast12Months >
        POLICY.DPD_REJECT_ABOVE_LAST_12_MONTHS,

      totalTradelines: accounts.length,
      unsecuredTradelineCount: matchedTradelines.length,
      unsecuredAggregate,
      matchedTradelines,
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
      unmappedAccountTypeCodes: [],
      reportId,
      source,
    };
  }
}

module.exports = {
  POLICY,
  UNSECURED_CATEGORIES,
  calculateAge,
  validateLoanAmount,
  isNewCustomer,
  getRepeatMultiplier,
  calculateRepeatCreditLimit,
  parseBureauReport,
  normalizeName,
  round2,
};
