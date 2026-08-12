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

const extractCarePayBureauDpd = (bureauResponse) => {
  if (!bureauResponse || typeof bureauResponse !== "object") {
    return null;
  }

  const profile = bureauResponse?.INProfileResponse;
  if (!profile || typeof profile !== "object") {
    return null;
  }

  const accounts = toArray(profile?.CAIS_Account?.CAIS_Account_DETAILS);
  if (!accounts.length) {
    return null;
  }

  const now = new Date();
  let hasDpd3M = false;
  let hasDpd6M = false;
  let has60Plus6M = false;
  let has90Plus6M = false;
  let maxDpd = 0;

  for (const account of accounts) {
    const histories = toArray(account?.CAIS_Account_History);

    for (const history of histories) {
      const year = toNumber(history?.Year, null);
      const month = toNumber(history?.Month, null);
      const dpd = toNumber(history?.Days_Past_Due, 0);

      if (!year || !month) continue;

      const historyDate = new Date(year, month - 1, 1);
      const monthsAgo = monthsDiff(historyDate, now);

      if (monthsAgo === null || monthsAgo < 0) continue;

      if (dpd > 0) {
        if (monthsAgo < 3) hasDpd3M = true;
        if (monthsAgo < 6) {
          hasDpd6M = true;
          if (dpd >= 60) has60Plus6M = true;
          if (dpd >= 90) has90Plus6M = true;
        }
      }

      if (dpd > maxDpd) maxDpd = dpd;
    }
  }

  return {
    has_dpd_3m: hasDpd3M,
    has_dpd_6m: hasDpd6M,
    has_60plus_dpd_6m: has60Plus6M,
    has_90plus_dpd_6m: has90Plus6M,
    max_dpd: maxDpd,
  };
};

const getCarePayPolicy = (loanType) => {
  const normalizedLoanType = String(loanType || "")
    .trim()
    .toLowerCase();

  if (normalizedLoanType === "short-term personal loan") {
    return {
      minAge: 18,
      maxAge: 65,
      minTenure: 1,
      maxTenure: 9,
      minAmount: 5000,
      maxAmount: 500000,
      minAnnualIncome: 114000,
      minBureauScore: 680,
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
    minBureauScore: 680,
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

const evaluateCarePayLoginBre = ({ data, requestAmount, bureauScore = null }) => {
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

  const annualIncome = normalizeCarePayAnnualIncome(data);
  if (annualIncome === null) {
    reasons.push("INCOME_MISSING");
  } else if (annualIncome < policy.minAnnualIncome) {
    reasons.push(`INCOME_BELOW_${policy.minAnnualIncome}`);
  }

  const score =
    toFiniteNumber(bureauScore) ??
    toFiniteNumber(data.cibil_score) ??
    toFiniteNumber(data.cibil_score_fintree);
  const isNtcCustomer = String(data.customer_type || "")
    .trim()
    .toLowerCase()
    .includes("ntc");

  if (!isNtcCustomer && score !== null && score < policy.minBureauScore) {
    reasons.push(`CIBIL_SCORE_BELOW_${policy.minBureauScore}`);
  }

  return {
    status: reasons.length ? "BRE FAILED" : "BRE APPROVED",
    caseStatus: reasons.length ? "Rejected" : CAREPAY_BRE_APPROVED_STATUS,
    reason: reasons.length ? reasons.join(", ") : "ELIGIBLE",
    reasons,
    bureauScore: score,
  };
};


const buildBreSnapshot = ({ data, requestAmount, bureauScore = null, decision, bureauResponse = null }) => {
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

  const dpdFacts = extractCarePayBureauDpd(bureauResponse);

  return {
    evaluated_at: new Date().toISOString(),

    // raw inputs used by BRE
    inputs: {
      loan_type: data.loan_type ?? null,
      dob: data.dob ?? null,
      age_supplied: data.age ?? null,
      loan_tenure: data.loan_tenure ?? null,
      request_amount: requestAmount ?? null,
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
      dpd: dpdFacts,
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

      // BRE can still run because current CarePay decision
      // mainly uses score + loan fields.
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
  const decision = evaluateCarePayLoginBre({
    data,
    requestAmount,
    bureauScore,
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
  evaluateCarePayLoginBre,
  buildBreSnapshot,
  getCarePayPolicy,
  calculateCarePayAge,
  normalizeCarePayAnnualIncome,
  toFiniteNumber,
  isProvided,
  autoApproveCarePayIfBureauVerified,
};
