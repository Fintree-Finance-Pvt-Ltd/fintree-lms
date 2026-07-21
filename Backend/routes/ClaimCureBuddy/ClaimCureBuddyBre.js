const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
});

const toArray = (value) => {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const toNumber = (value, fallback = null) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const normalized =
    typeof value === "string"
      ? value
          .replace(/,/g, "")
          .replace(/[^0-9.-]/g, "")
          .trim()
      : value;

  if (normalized === "") return fallback;

  const number = Number(normalized);

  return Number.isFinite(number)
    ? number
    : fallback;
};

const firstNumber = (
  values,
  fallback = null,
) => {
  for (const value of values) {
    const number = toNumber(value, null);

    if (number !== null) {
      return number;
    }
  }

  return fallback;
};

const envNumber = (name, fallback) => {
  const value = toNumber(
    process.env[name],
    fallback,
  );

  return Number.isFinite(value)
    ? value
    : fallback;
};

const POLICY = Object.freeze({
  product: "PERSONAL_LOAN",

  minLoanAmount: envNumber(
    "CCB_MIN_LOAN_AMOUNT",
    25000,
  ),

  maxLoanAmount: envNumber(
    "CCB_MAX_LOAN_AMOUNT",
    100000,
  ),

  ntcMinScore: envNumber(
  "CCB_NTC_MIN_SCORE",
  -1,
),

ntcMaxScore: envNumber(
  "CCB_NTC_MAX_SCORE",
  250,
),

ntcMaxLoanAmount: envNumber(
  "CCB_NTC_MAX_LOAN_AMOUNT",
  50000,
),

  minAge: envNumber(
    "CCB_MIN_AGE",
    18,
  ),

  maxAge: envNumber(
    "CCB_MAX_AGE",
    65,
  ),

  maxTenureDays: envNumber(
    "CCB_MAX_TENURE_DAYS",
    90,
  ),

  repaymentFrequency: "BULLET",

  minScore: envNumber(
    "CCB_MIN_BUREAU_SCORE",
    650,
  ),

  maxEnquiries30d: envNumber(
    "CCB_MAX_ENQUIRIES_30D",
    5,
  ),

  maxOverdueAmount: envNumber(
    "CCB_MAX_OVERDUE_AMOUNT",
    1000,
  ),

  dpdThreshold3m: envNumber(
    "CCB_DPD_THRESHOLD_3M",
    30,
  ),

  dpdThreshold6m: envNumber(
    "CCB_DPD_THRESHOLD_6M",
    60,
  ),

  dpdThreshold12m: envNumber(
    "CCB_DPD_THRESHOLD_12M",
    90,
  ),
});

const monthsDiff = (
  fromDate,
  toDate = new Date(),
) =>
  (toDate.getFullYear() -
    fromDate.getFullYear()) *
    12 +
  (toDate.getMonth() -
    fromDate.getMonth());

const calculateAge = (
  dob,
  asOfDate = new Date(),
) => {
  if (!dob) return null;

  let year;
  let month;
  let day;

  if (
    dob instanceof Date &&
    !Number.isNaN(dob.getTime())
  ) {
    year = dob.getFullYear();
    month = dob.getMonth() + 1;
    day = dob.getDate();
  } else {
    const match = String(dob)
      .trim()
      .match(
        /^(\d{4})-(\d{2})-(\d{2})/,
      );

    if (!match) return null;

    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }

  const birthDate = new Date(
    year,
    month - 1,
    day,
  );

  if (
    Number.isNaN(birthDate.getTime()) ||
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !==
      month - 1 ||
    birthDate.getDate() !== day ||
    birthDate > asOfDate
  ) {
    return null;
  }

  let age =
    asOfDate.getFullYear() - year;

  const birthdayNotReached =
    asOfDate.getMonth() + 1 < month ||
    (asOfDate.getMonth() + 1 ===
      month &&
      asOfDate.getDate() < day);

  if (birthdayNotReached) {
    age -= 1;
  }

  return age;
};

const findXml = (
  input,
  depth = 0,
) => {
  if (
    depth > 8 ||
    input === null ||
    input === undefined
  ) {
    return null;
  }

  if (typeof input === "string") {
    const value = input.trim();

    if (
      value.startsWith("<") &&
      value.includes(">")
    ) {
      return value;
    }

    if (
      value.startsWith("{") ||
      value.startsWith("[") ||
      value.startsWith('"')
    ) {
      try {
        return findXml(
          JSON.parse(value),
          depth + 1,
        );
      } catch (_) {
        return null;
      }
    }

    return null;
  }

  if (typeof input !== "object") {
    return null;
  }

  const preferredKeys = [
    "report_xml",
    "reportXml",
    "xml",
    "rawXml",
    "raw_response",
    "response",
    "data",
    "result",
    "payload",
  ];

  for (const key of preferredKeys) {
    if (
      Object.prototype.hasOwnProperty.call(
        input,
        key,
      )
    ) {
      const match = findXml(
        input[key],
        depth + 1,
      );

      if (match) return match;
    }
  }

  return null;
};

const unwrapObject = (input) => {
  if (!input) return {};

  if (typeof input === "string") {
    const value = input.trim();

    if (
      !value.startsWith("{") &&
      !value.startsWith("[") &&
      !value.startsWith('"')
    ) {
      return {};
    }

    try {
      return unwrapObject(
        JSON.parse(value),
      );
    } catch (_) {
      return {};
    }
  }

  if (typeof input !== "object") {
    return {};
  }

  return (
    input.INProfileResponse ||
    input.data?.INProfileResponse ||
    input.response?.INProfileResponse ||
    input.data ||
    input.response ||
    input
  );
};

const normalizeDpd = (value) => {
  const normalized = String(
    value ?? "",
  )
    .trim()
    .toUpperCase();

  if (
    !normalized ||
    ["STD", "XXX", "NA", "N/A"].includes(
      normalized,
    )
  ) {
    return 0;
  }

  // Conservative classification mapping
  if (normalized === "SMA") {
    return 30;
  }

  if (normalized === "SUB") {
    return 90;
  }

  if (
    ["DBT", "LSS"].includes(normalized)
  ) {
    return 180;
  }

  return toNumber(
    normalized.replace(
      /[^0-9]/g,
      "",
    ),
    0,
  );
};

const extractClaimCureBuddyBureauFacts = (
  rawResponse,
  fallbackScore = null,
) => {
  const xml = findXml(rawResponse);
  let profile = {};

  if (xml) {
    const parsed = parser.parse(xml);

    profile =
      parsed?.INProfileResponse ||
      parsed;
  } else {
    profile =
      unwrapObject(rawResponse);
  }

  const score = firstNumber(
    [
      profile?.SCORE?.BureauScore,
      profile?.Score?.BureauScore,
      profile?.Score?.Value,
      profile?.bureauScore,
      profile?.score,
      fallbackScore,
    ],
    null,
  );

  const enquiries30d = firstNumber(
    [
      profile?.CAPS?.CAPS_Summary
        ?.CAPSLast30Days,

      profile?.CAPS_Summary
        ?.CAPSLast30Days,

      profile?.enquiries30d,
      profile?.enquiries_30d,
    ],
    0,
  );

  const accounts = toArray(
    profile?.CAIS_Account
      ?.CAIS_Account_DETAILS ||
      profile?.CAIS_Account_DETAILS ||
      profile?.accounts,
  );

  const reportedAccountCount =
    firstNumber(
      [
        profile?.CAIS_Account
          ?.CAIS_Summary
          ?.Credit_Account
          ?.CreditAccountTotal,

        profile?.CAIS_Summary
          ?.Credit_Account
          ?.CreditAccountTotal,

        profile?.accountCount,
        profile?.account_count,
      ],
      0,
    );

  const accountCount = Math.max(
    accounts.length,
    reportedAccountCount || 0,
  );

  const reportParsed = Boolean(
    xml ||
      profile?.SCORE ||
      profile?.Score ||
      profile?.CAPS ||
      profile?.CAPS_Summary ||
      profile?.CAIS_Account ||
      profile?.CAIS_Account_DETAILS ||
      profile?.bureauScore !==
        undefined ||
      profile?.score !== undefined ||
      profile?.isNtc === true ||
      profile?.is_ntc === true,
  );

  const isNtc =
  reportParsed &&
  score !== null &&
  score >= POLICY.ntcMinScore &&
  score <= POLICY.ntcMaxScore;

  let maxDpd3m = 0;
  let maxDpd6m = 0;
  let maxDpd12m = 0;

  let dpd30Plus3mInstances = 0;
  let dpd60Plus6mInstances = 0;
  let dpd90Plus12mInstances = 0;

  let totalOverdueAmount = 0;

  const now = new Date();

  for (const account of accounts) {
    const accountOverdue = Math.max(
      0,
      firstNumber(
        [
          account?.Amount_Past_Due,
          account?.Amount_Overdue,
          account
            ?.Current_Amount_Overdue,
          account?.Overdue_Amount,
          account?.amountPastDue,
          account?.amountOverdue,
          account?.overdueAmount,
        ],
        0,
      ),
    );

    totalOverdueAmount +=
      accountOverdue;

    const histories = toArray(
      account?.CAIS_Account_History ||
        account?.accountHistory ||
        account?.history,
    );

    for (const history of histories) {
      const year = toNumber(
        history?.Year ??
          history?.year,
        null,
      );

      const month = toNumber(
        history?.Month ??
          history?.month,
        null,
      );

      const dpd = normalizeDpd(
        history?.Days_Past_Due ??
          history?.dpd ??
          history?.daysPastDue,
      );

      if (
        !year ||
        !month ||
        month < 1 ||
        month > 12
      ) {
        continue;
      }

      const ageInMonths = monthsDiff(
        new Date(
          year,
          month - 1,
          1,
        ),
        now,
      );

      if (ageInMonths < 0) {
        continue;
      }

      if (ageInMonths < 3) {
        maxDpd3m = Math.max(
          maxDpd3m,
          dpd,
        );

        if (
          dpd >=
          POLICY.dpdThreshold3m
        ) {
          dpd30Plus3mInstances += 1;
        }
      }

      if (ageInMonths < 6) {
        maxDpd6m = Math.max(
          maxDpd6m,
          dpd,
        );

        if (
          dpd >=
          POLICY.dpdThreshold6m
        ) {
          dpd60Plus6mInstances += 1;
        }
      }

      if (ageInMonths < 12) {
        maxDpd12m = Math.max(
          maxDpd12m,
          dpd,
        );

        if (
          dpd >=
          POLICY.dpdThreshold12m
        ) {
          dpd90Plus12mInstances += 1;
        }
      }
    }
  }

  return {
    score,

    reportParsed,

    isNtc,

    hasCreditHistory: !isNtc,

    accountCount,

    enquiries30d,

    totalOverdueAmount,

    maxDpd3m,
    maxDpd6m,
    maxDpd12m,

    dpd30Plus3mInstances,
    dpd60Plus6mInstances,
    dpd90Plus12mInstances,
  };
};

const normalizeFrequency = (value) =>
  String(value || "BULLET")
    .trim()
    .toUpperCase()
    .replace(/[ _-]+/g, "_");

    const evaluateClaimCureBuddyBorrowerPreBre = ({
  facts,
  loan = {},
}) => {
  const reasons = [];

  const loanAmount = toNumber(
    loan.loan_amount,
    null,
  );

  if (!facts.reportParsed) {
    reasons.push(
      "BORROWER_BUREAU_REPORT_UNREADABLE",
    );
  } else if (!facts.isNtc) {
    if (facts.score === null) {
      reasons.push(
        "BORROWER_BUREAU_SCORE_MISSING",
      );
    } else if (
      facts.score < POLICY.minScore
    ) {
      reasons.push(
        `BORROWER_BUREAU_SCORE_BELOW_${POLICY.minScore}`,
      );
    }
  }

  if (
    facts.dpd30Plus3mInstances > 0
  ) {
    reasons.push(
      "BORROWER_30PLUS_DPD_IN_LAST_3M",
    );
  }

  if (
    facts.dpd60Plus6mInstances > 0
  ) {
    reasons.push(
      "BORROWER_60PLUS_DPD_IN_LAST_6M",
    );
  }

  if (
    facts.dpd90Plus12mInstances > 0
  ) {
    reasons.push(
      "BORROWER_90PLUS_DPD_IN_LAST_12M",
    );
  }

  if (
    facts.isNtc &&
    loanAmount !== null &&
    loanAmount >
      POLICY.ntcMaxLoanAmount
  ) {
    reasons.push(
      `NTC_LOAN_AMOUNT_ABOVE_${POLICY.ntcMaxLoanAmount}`,
    );
  }

  return {
    applicantType: "BORROWER",
    partyNo: 1,
    phase: "PRE_BRE",

    status: reasons.length
      ? "REJECTED"
      : "APPROVED",

    reasons,

    facts: {
      ...facts,
      loanAmount,
    },
  };
};


const evaluateClaimCureBuddyApplicant = ({
  applicantType,
  partyNo,
  facts,
  applicant = {},
  loan = {},
}) => {
  const reasons = [];

  const label =
    applicantType === "BORROWER"
      ? "BORROWER"
      : `CO_APPLICANT_${partyNo}`;

  const age = calculateAge(
    applicant.dob,
  );

  /*
   * Age applies to borrower and every
   * co-applicant.
   */
  if (age === null) {
    reasons.push(
      `${label}_AGE_MISSING_OR_INVALID`,
    );
  } else if (age < POLICY.minAge) {
    reasons.push(
      `${label}_AGE_BELOW_${POLICY.minAge}`,
    );
  } else if (age > POLICY.maxAge) {
    reasons.push(
      `${label}_AGE_ABOVE_${POLICY.maxAge}`,
    );
  }

  /*
   * Do not approve an unreadable bureau
   * response as an NTC case.
   */
  if (!facts.reportParsed) {
    reasons.push(
      `${label}_BUREAU_REPORT_UNREADABLE`,
    );
  } else if (!facts.isNtc) {
    /*
     * Score rule applies only when the
     * applicant has credit history.
     */
    if (facts.score === null) {
      reasons.push(
        `${label}_BUREAU_SCORE_MISSING`,
      );
    } else if (
      facts.score < POLICY.minScore
    ) {
      reasons.push(
        `${label}_BUREAU_SCORE_BELOW_${POLICY.minScore}`,
      );
    }
  }

  /*
   * Maximum five enquiries are allowed.
   * Five passes; six rejects.
   */
  if (
    facts.enquiries30d >
    POLICY.maxEnquiries30d
  ) {
    reasons.push(
      `${label}_ENQUIRIES_30D_ABOVE_${POLICY.maxEnquiries30d}`,
    );
  }

  /*
   * Nil 30+ DPD in last three months.
   */
  if (
    facts.dpd30Plus3mInstances > 0
  ) {
    reasons.push(
      `${label}_30PLUS_DPD_IN_LAST_3M`,
    );
  }

  /*
   * Nil 60+ DPD in last six months.
   */
  if (
    facts.dpd60Plus6mInstances > 0
  ) {
    reasons.push(
      `${label}_60PLUS_DPD_IN_LAST_6M`,
    );
  }

  /*
   * Nil 90+ DPD in last twelve months.
   */
  if (
    facts.dpd90Plus12mInstances > 0
  ) {
    reasons.push(
      `${label}_90PLUS_DPD_IN_LAST_12M`,
    );
  }

  /*
   * ₹1,000 passes; anything above it rejects.
   */
  if (
    facts.totalOverdueAmount >
    POLICY.maxOverdueAmount
  ) {
    reasons.push(
      `${label}_OVERDUE_AMOUNT_ABOVE_${POLICY.maxOverdueAmount}`,
    );
  }

  const applicationFacts = {
    age,
    loanAmount: null,
    tenureDays: null,
    repaymentFrequency: null,
  };

  /*
   * Loan-level checks are applied only once
   * as part of the borrower decision.
   */
  if (applicantType === "BORROWER") {
    const loanAmount = toNumber(
      loan.loan_amount,
      null,
    );

    const tenureDays = toNumber(
      loan.loan_tenure,
      null,
    );

    const repaymentFrequency =
      normalizeFrequency(
        loan.repayment_frequency ||
          loan.emi_frequency ||
          "BULLET",
      );

    applicationFacts.loanAmount =
      loanAmount;

    applicationFacts.tenureDays =
      tenureDays;

    applicationFacts.repaymentFrequency =
      repaymentFrequency;

    /*
     * Standard loan amount range.
     */
    if (loanAmount === null) {
      reasons.push(
        "LOAN_AMOUNT_MISSING",
      );
    } else {
      if (
        loanAmount <
        POLICY.minLoanAmount
      ) {
        reasons.push(
          `LOAN_AMOUNT_BELOW_${POLICY.minLoanAmount}`,
        );
      }

      if (
        loanAmount >
        POLICY.maxLoanAmount
      ) {
        reasons.push(
          `LOAN_AMOUNT_ABOVE_${POLICY.maxLoanAmount}`,
        );
      }

      /*
       * NTC loan cap is ₹50,000.
       */
      if (
        facts.isNtc &&
        loanAmount >
          POLICY.ntcMaxLoanAmount
      ) {
        reasons.push(
          `NTC_LOAN_AMOUNT_ABOVE_${POLICY.ntcMaxLoanAmount}`,
        );
      }
    }

    /*
     * loan_tenure is stored in days.
     */
    if (
      tenureDays === null ||
      !Number.isInteger(tenureDays) ||
      tenureDays < 1
    ) {
      reasons.push(
        "LOAN_TENURE_DAYS_INVALID",
      );
    } else if (
      tenureDays >
      POLICY.maxTenureDays
    ) {
      reasons.push(
        `LOAN_TENURE_ABOVE_${POLICY.maxTenureDays}_DAYS`,
      );
    }

    /*
     * Product repayment type is bullet.
     */
    if (
      ![
        "BULLET",
        "BULLET_PAYMENT",
      ].includes(repaymentFrequency)
    ) {
      reasons.push(
        "REPAYMENT_FREQUENCY_MUST_BE_BULLET",
      );
    }
  }

  return {
    applicantType,
    partyNo,

    status: reasons.length
      ? "REJECTED"
      : "APPROVED",

    reasons,

    facts: {
      ...facts,
      ...applicationFacts,
    },
  };
};

const buildFinalDecision = (
  applicantDecisions,
) => {
  const reasons =
    applicantDecisions.flatMap(
      (item) => item.reasons || [],
    );

  return {
    status: reasons.length
      ? "REJECTED"
      : "APPROVED",

    reasons,

    policy: POLICY,

    applicants:
      applicantDecisions,
  };
};

module.exports = {
  POLICY,
  calculateAge,
  extractClaimCureBuddyBureauFacts,
  evaluateClaimCureBuddyBorrowerPreBre,
  evaluateClaimCureBuddyApplicant,
  buildFinalDecision,
};