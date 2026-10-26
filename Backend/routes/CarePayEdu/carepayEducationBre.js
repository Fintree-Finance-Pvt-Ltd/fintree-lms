
const { XMLParser } = require("fast-xml-parser");

// ==========================================
// CAREPAY EDUCATION BRE POLICY
// ==========================================

const CAREPAY_EDUCATION_POLICY = Object.freeze({
    minAge: 18,
    maxAge: 50,

    minLoanAmount: 5000,
    maxLoanAmount: 30000,

    minTenure: 3,
    maxTenure: 4,

    repaymentFrequency: "MONTHLY",

    minExclusiveBureauScore: 620,

    maxDpd12M: 29,
    maxDpd24M: 59,
    maxDpd36M: 89,
});

// ==========================================
// HELPERS
// ==========================================

const isProvided = (value) =>
    value !== undefined &&
    value !== null &&
    String(value).trim() !== "";

const toNumber = (value) => {
    if (!isProvided(value)) return null;

    const number = Number(String(value).replace(/,/g, ""));

    return Number.isFinite(number) ? number : null;
};

const normalize = (value) =>
    String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s_-]+/g, " ");

const getCustomerType = (value) => {
    const type = normalize(value);

    if (
        type === "ETC" ||
        type === "EXISTING TO CREDIT" ||
        type === "EXISTING TO CREDIT CUSTOMER"
    ) {
        return "ETC";
    }

    if (
        type === "NTC" ||
        type === "NEW TO CREDIT" ||
        type === "NEW TO CREDIT CUSTOMER"
    ) {
        return "NTC";
    }

    return null;
};


const calculateAge = (dob, suppliedAge = null, asOf = new Date()) => {
  let birthDate = null;

  if (dob instanceof Date) {
    if (!Number.isNaN(dob.getTime())) {
      birthDate = dob;
    }
  } else if (isProvided(dob)) {
    const text = String(dob).trim();

    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);

    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);

      const date = new Date(Date.UTC(year, month - 1, day));

      if (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      ) {
        birthDate = date;
      }
    }
  }

  if (birthDate) {
    const referenceDate = new Date(asOf);

    let age =
      referenceDate.getUTCFullYear() -
      birthDate.getUTCFullYear();

    const monthDifference =
      referenceDate.getUTCMonth() -
      birthDate.getUTCMonth();

    if (
      monthDifference < 0 ||
      (
        monthDifference === 0 &&
        referenceDate.getUTCDate() <
          birthDate.getUTCDate()
      )
    ) {
      age--;
    }

    return age >= 0 ? age : null;
  }

  const fallback = toNumber(suppliedAge);

  return Number.isInteger(fallback) && fallback >= 0
    ? fallback
    : null;
};


const parseReport = (report) => {
    if (!report) return null;

    if (typeof report === "object") return report;

    if (typeof report !== "string") return null;

    try {
        const text = report.trim();

        if (!text) return null;

        if (text.startsWith("{") || text.startsWith("[")) {
            return JSON.parse(text);
        }

        return new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "",
            trimValues: true,
        }).parse(text);
    } catch (error) {
        console.error(
            "[CAREPAY-EDU-BRE] Bureau report parse failed:",
            error.message
        );

        return null;
    }
};

// ==========================================
// EXTRACT EXPERIAN POLICY FACTS
// ==========================================

// Prefer normalized facts from a verified Experian
// parser. Do not trust partner-provided flags.
//
// Required ETC facts:
// maxDpdLast12Months
// maxDpdLast24Months
// maxDpdLast36Months
// adverseStatusLast12Months
// hasRestructuredAccount
// historyComplete
// adverseHistoryComplete
// restructureCheckComplete

const extractExperianPolicyFacts = ({
    bureauResponse = null,
    dpdFacts = null,
    policyFacts = null,
} = {}) => {

    // Raw report must be parsed by the proper
    // Experian adapter before evaluating status history.
    const report = parseReport(bureauResponse);

    const input = policyFacts || {};

    const dpd = dpdFacts || {};

    const maxDpd12M = toNumber(
        input.maxDpdLast12Months ??
        dpd.maxDpdLast12Months
    );

    const maxDpd24M = toNumber(
        input.maxDpdLast24Months ??
        dpd.maxDpdLast24Months
    );

    const maxDpd36M = toNumber(
        input.maxDpdLast36Months ??
        dpd.maxDpdLast36Months
    );

    // These fields must be supplied by a trusted
    // complete Experian parser, not inferred from
    // the absence of text in the raw report.

    const hasAdverseStatus =
        typeof input.adverseStatusLast12Months === "boolean"
            ? input.adverseStatusLast12Months
            : null;

    const hasRestructuredAccount =
        typeof input.hasRestructuredAccount === "boolean"
            ? input.hasRestructuredAccount
            : null;

    return {
        reportAvailable: report !== null,

        maxDpdLast12Months: maxDpd12M,
        maxDpdLast24Months: maxDpd24M,
        maxDpdLast36Months: maxDpd36M,

        adverseStatusLast12Months: hasAdverseStatus,
        hasRestructuredAccount,

        historyComplete:
            input.historyComplete === true,

        adverseHistoryComplete:
            input.adverseHistoryComplete === true,

        restructureCheckComplete:
            input.restructureCheckComplete === true,
    };
};

// ==========================================
// EVALUATE CAREPAY EDUCATION BRE
// ==========================================

function evaluateCarePayEducationBre({
    data = {},
    requestAmount = null,
    bureau = {},
    dpdFacts = null,
    policyFacts = null,
    asOf = new Date(),
} = {}) {

    const policy = CAREPAY_EDUCATION_POLICY;

    const reasons = [];
    const pending = [];

    // ======================================
    // 1. AGE
    // ======================================

    const age = calculateAge(
        data.dob,
        data.age,
        asOf
    );

    if (age === null) {
        pending.push("AGE_MISSING_OR_INVALID");
    } else if (age < policy.minAge || age > policy.maxAge) {
        reasons.push("AGE_NOT_IN_18_50");
    }

    // ======================================
    // 2. LOAN AMOUNT
    // ======================================

    const amount = toNumber(
        requestAmount ??
        data.request_amount ??
        data.loan_amount
    );

    if (amount === null) {
        pending.push("LOAN_AMOUNT_MISSING");
    } else if (
        amount < policy.minLoanAmount ||
        amount > policy.maxLoanAmount
    ) {
        reasons.push("LOAN_AMOUNT_NOT_IN_5000_30000");
    }

    // ======================================
    // 3. LOAN TENURE
    // ======================================

    const tenure = toNumber(data.loan_tenure);

    if (tenure === null) {
        pending.push("LOAN_TENURE_MISSING");
    } else if (
        !Number.isInteger(tenure) ||
        tenure < policy.minTenure ||
        tenure > policy.maxTenure
    ) {
        reasons.push("LOAN_TENURE_NOT_IN_3_4_MONTHS");
    }

    // ======================================
    // 4. REPAYMENT FREQUENCY
    // ======================================

    // The product supports monthly repayment.
    // Explicitly reject another supplied frequency.
    // If absent, monthly is the product default.

    const repaymentFrequency = normalize(
        data.repayment_frequency || "MONTHLY"
    );

    if (
        repaymentFrequency !== "MONTHLY" &&
        repaymentFrequency !== "MONTH"
    ) {
        reasons.push("REPAYMENT_FREQUENCY_NOT_MONTHLY");
    }


    // ======================================
    // 6. CUSTOMER TYPE BASED ON BUREAU SCORE
    // ======================================

    const bureauScore = toNumber(bureau.score);

    let customerType = null;

    if (
        bureauScore !== null &&
        bureauScore >= 1 &&
        bureauScore <= 200
    ) {
        customerType = "NTC";
    } else if (
        bureauScore !== null &&
        bureauScore > 200
    ) {
        customerType = "ETC";
    } else {
        pending.push("BUREAU_SCORE_MISSING_FOR_CUSTOMER_TYPE");
    }

    // ======================================
    // 7. REAL EXPERIAN BUREAU VALIDATION
    // ======================================

    const bureauVerified =
        bureau.verified === true &&
        bureau.success === true &&
        normalize(bureau.provider) === "EXPERIAN";

    let evaluatedDpdFacts = null;

    if (!bureauVerified) {
        pending.push("VERIFIED_EXPERIAN_REPORT_REQUIRED");
    }

    if (customerType === "ETC") {

        // Credit score must be strictly greater than 620

        if (bureauVerified && bureauScore <= 620) {
            reasons.push("BUREAU_SCORE_NOT_ABOVE_620");
        }

        evaluatedDpdFacts = extractExperianPolicyFacts({
            bureauResponse: bureau.response,
            dpdFacts,
            policyFacts,
        });

        // ======================================
        // DPD POLICY
        // ======================================

        const d12 = evaluatedDpdFacts.maxDpdLast12Months;
        const d24 = evaluatedDpdFacts.maxDpdLast24Months;
        const d36 = evaluatedDpdFacts.maxDpdLast36Months;

        if (bureauVerified) {
            if (d12 !== null && d12 >= 30) {
                reasons.push("30PLUS_DPD_LAST_12_MONTHS");
            }

            if (d24 !== null && d24 >= 60) {
                reasons.push("60PLUS_DPD_LAST_24_MONTHS");
            }

            if (d36 !== null && d36 >= 90) {
                reasons.push("90PLUS_DPD_LAST_36_MONTHS");
            }
        }

        if (
            !bureauVerified ||
            !evaluatedDpdFacts.historyComplete ||
            d12 === null ||
            d24 === null ||
            d36 === null
        ) {
            pending.push("BUREAU_DPD_HISTORY_NOT_VERIFIED");
        }

        // ======================================
        // ADVERSE BUREAU HISTORY
        // ======================================

        if (
            bureauVerified &&
            evaluatedDpdFacts.adverseStatusLast12Months === true
        ) {
            reasons.push("ADVERSE_BUREAU_STATUS_LAST_12_MONTHS");
        } else if (
            !bureauVerified ||
            !evaluatedDpdFacts.adverseHistoryComplete ||
            evaluatedDpdFacts.adverseStatusLast12Months === null
        ) {
            pending.push("ADVERSE_BUREAU_HISTORY_NOT_VERIFIED");
        }

        // ======================================
        // RESTRUCTURED ACCOUNT
        // ======================================

        if (
            bureauVerified &&
            evaluatedDpdFacts.hasRestructuredAccount === true
        ) {
            reasons.push("RESTRUCTURED_ACCOUNT_FOUND");
        } else if (
            !bureauVerified ||
            !evaluatedDpdFacts.restructureCheckComplete ||
            evaluatedDpdFacts.hasRestructuredAccount === null
        ) {
            pending.push("RESTRUCTURE_STATUS_NOT_VERIFIED");
        }
    }

    // ======================================
    // 9. FINAL BRE DECISION
    // ======================================

    const uniqueReasons = [...new Set(reasons)];
    const uniquePending = [...new Set(pending)];

    let status;
    let caseStatus;

    if (uniqueReasons.length > 0) {
        status = "BRE FAILED";
        caseStatus = "Rejected";
    } else if (uniquePending.length > 0) {
        status = "BRE PENDING";
        caseStatus = "BRE Pending";
    } else {
        status = "BRE APPROVED";
        caseStatus = "BRE Approved";
    }

    return {
        status,
        caseStatus,

        reason:
            uniqueReasons.length > 0
                ? uniqueReasons.join(", ")
                : uniquePending.length > 0
                    ? uniquePending.join(", ")
                    : "ELIGIBLE",

        reasons: uniqueReasons,
        pending: uniquePending,

        age,
        amount,
        tenure,
        customerType,
        bureauScore,
        dpdFacts: evaluatedDpdFacts,
    };
}

// ==========================================
// BUILD BRE SNAPSHOT
// ==========================================

function buildCarePayEducationBreSnapshot({
    data = {},
    requestAmount = null,
    bureau = {},
    decision,
} = {}) {

    if (!decision) {
        throw new Error("BRE decision is required");
    }

    return {
        evaluated_at: new Date().toISOString(),

        product: "CarePay Education",

        policy: CAREPAY_EDUCATION_POLICY,

        inputs: {
            dob: data.dob ?? null,
            age: data.age ?? null,

            request_amount:
                requestAmount ??
                data.request_amount ??
                null,

            loan_tenure:
                data.loan_tenure ?? null,

            repayment_frequency:
                data.repayment_frequency ?? "MONTHLY",

            nationality:
                data.nationality ?? null,

            residential_status:
                data.residential_status ??
                data.residency_status ??
                null,

            customer_type:
                data.customer_type ?? null,
        },

        computed: {
            age: decision.age,
            amount: decision.amount,
            tenure: decision.tenure,
            customerType: decision.customerType,

            bureauScore: decision.bureauScore,
            dpdFacts: decision.dpdFacts,

            bureauProvider:
                bureau.provider ?? null,

            bureauVerified:
                bureau.verified === true &&
                bureau.success === true &&
                normalize(bureau.provider) === "EXPERIAN",
        },

        decision: {
            status: decision.status,
            caseStatus: decision.caseStatus,

            reason: decision.reason,
            reasons: decision.reasons,
            pending: decision.pending,
        },
    };
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    CAREPAY_EDUCATION_POLICY,
    calculateAge,
    extractExperianPolicyFacts,
    evaluateCarePayEducationBre,
    buildCarePayEducationBreSnapshot,
};
