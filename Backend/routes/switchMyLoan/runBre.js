const db = require("../../config/db");
const { runBureau } = require("../../services/Bueraupullapiservice");
const {
  POLICY,
  calculateAge,
  validateLoanAmount,
  isNewCustomer,
  calculateRepeatCreditLimit,
  parseBureauReport,
} = require("./rapidMoneyPolicy");

const { amlCheck } = require(
  "../../utils/amlCrimescanService",
);

const POLICY_VERSION = "RAPID_MONEY_POLICY_PDF_2026_07";

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serialization_error: true });
  }
}

function rule(passed, reason = null, derivedValues = {}, executed = true) {
  return {
    executed,
    passed,
    reason,
    derived_values: derivedValues,
  };
}

function addReason(reasons, reasonValue) {
  if (reasonValue && !reasons.includes(reasonValue)) {
    reasons.push(reasonValue);
  }
}

function splitName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    first_name: parts[0] || "",
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    last_name:
      parts.length > 1 ? parts[parts.length - 1] : parts[0] || "",
  };
}

const FINAL_AML_STATUSES = new Set([
  "CLEAR",
  "REJECT",
  "REVIEW",
]);

const AML_CLEAR_THRESHOLD = 70;

/**
 * This preserves your current AML interpretation:
 *
 * 0 matches       => CLEAR
 * Score >= 70     => CLEAR
 * Score below 70  => REJECT
 *
 * Confirm with the AML provider that a higher score means
 * a safer result. If a higher score means a stronger match,
 * this comparison must be reversed.
 */
function getAmlDecision(score, totalMatches) {
  if (Number(totalMatches) === 0) {
    return "CLEAR";
  }

  if (
    Number.isFinite(Number(score)) &&
    Number(score) >= AML_CLEAR_THRESHOLD
  ) {
    return "CLEAR";
  }

  return "REJECT";
}

function createInitialRules() {
  return {
    AML_CHECK_RPM: rule(false, null, {}, false),
    LOAN_AMOUNT_CHECK_RPM: rule(false, null, {}, false),
    FIRST_TIME_LIMIT_CHECK_RPM: rule(false, null, {}, false),
    REPEAT_LIMIT_CHECK_RPM: rule(false, null, {}, false),
    REPEAT_AGE_CAP_CHECK_RPM: rule(false, null, {}, false),

    BUREAU_SCORE_CHECK_RPM: rule(false, null, {}, false),
    DUAL_PAN_CHECK_RPM: rule(false, null, {}, false),
    ENQUIRIES_30D_CHECK_RPM: rule(false, null, {}, false),
    OVERDUE_AMOUNT_CHECK_RPM: rule(false, null, {}, false),
    DPD_30_LAST_3M_CHECK_RPM: rule(false, null, {}, false),
    DPD_60_LAST_9M_CHECK_RPM: rule(false, null, {}, false),
    DPD_90_LAST_12M_CHECK_RPM: rule(false, null, {}, false),
    UNSECURED_AGGREGATION_CHECK_RPM: rule(false, null, {}, false),

    CREDIT_LIMIT_CHECK_RPM: rule(false, null, {}, false),
  };
}

async function updateBookingBreSnapshot(lan, result) {
  const bureau = result?.bureau || {};

  const dualPanValue =
    bureau.hasDualPan === true
      ? 1
      : bureau.hasDualPan === false
        ? 0
        : null;

  await db.promise().query(
    `
    UPDATE loan_booking_switch_my_loan
    SET
      sml_policy_version = ?,
      sml_bre_checked_at = NOW(),
      sml_bre_status = ?,
      sml_bre_reason = ?,
      sml_bre_details_json = ?,

      sml_age = ?,
      sml_credit_limit = ?,

      sml_unsecured_total = ?,
      sml_unsecured_count = ?,

      sml_bureau_score = ?,
      sml_pan_count = ?,
      sml_dual_pan_found = ?,
      sml_enquiries_30d = ?,
      sml_total_overdue_amount = ?,
      sml_max_dpd_3m = ?,
      sml_max_dpd_9m = ?,
      sml_max_dpd_12m = ?

    WHERE lan = ?
    `,
    [
      result?.policyVersion || POLICY_VERSION,
      result?.decision || null,
      result?.reason || null,
      safeJson(result),

      result?.age ?? null,
      result?.creditLimit ?? null,

      bureau.unsecuredAggregate ?? null,
      bureau.unsecuredTradelineCount ?? null,

      bureau.score ?? null,
      bureau.panCount ?? null,
      dualPanValue,
      bureau.enquiries30Days ?? null,
      bureau.totalOverdueAmount ?? null,
      bureau.maxDpdLast3Months ?? null,
      bureau.maxDpdLast9Months ?? null,
      bureau.maxDpdLast12Months ?? null,
      lan,
    ],
  );
}

function serializeBureauResponse(response) {
  if (response === null || response === undefined) return null;
  return typeof response === "string" ? response : JSON.stringify(response);
}

function deserializeBureauResponse(response) {
  if (!response || typeof response !== "string") return response || null;

  const value = response.trim();

  if (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return response;
    }
  }

  return response;
}

async function setBureauStatus(lan, status, response = null) {
  await db.promise().query(
    `
    UPDATE kyc_verification_status
    SET
      bureau_status = ?,
      bureau_api_response = ?,
      updated_at = NOW()
    WHERE lan = ?
      AND applicant_type = 'BORROWER'
      AND party_no = 1
    `,
    [status, response, lan],
  );
}

  function cleanText(value) {
  return String(value || "").trim();
}

function isValidStateValue(value) {
  const state = cleanText(value).toUpperCase();

  return Boolean(
    state &&
      state !== "NA" &&
      state !== "N/A" &&
      state !== "NULL" &&
      state !== "UNDEFINED",
  );
}

function extractPincode(value) {
  const text = cleanText(value);

  if (!text) return "";

  const match = text.match(/\b[1-9][0-9]{5}\b/);

  return match ? match[0] : "";
}

function getLoanPincode(loan) {
  return (
    extractPincode(loan.current_address_pincode) ||
    extractPincode(loan.address_pincode) ||
    extractPincode(loan.pincode) ||
    extractPincode(loan.pin_code) ||
    extractPincode(loan.current_pincode) ||
    extractPincode(loan.current_address_line_1) ||
    extractPincode(loan.address_line_1) ||
    extractPincode(loan.current_address) ||
    extractPincode(loan.address) ||
    ""
  );
}

function getLoanStateFromDb(loan) {
  const state =
    loan.current_address_state ||
    loan.address_state ||
    loan.state ||
    "";

  return isValidStateValue(state)
    ? cleanText(state)
    : "";
}

async function fetchStateFromPincode(pincode) {
  const cleanPincode = extractPincode(pincode);

  if (!cleanPincode) {
    return null;
  }

  try {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 5000);

    const response = await fetch(
      `https://api.postalpincode.in/pincode/${cleanPincode}`,
      {
        method: "GET",
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    const result = Array.isArray(data)
      ? data[0]
      : null;

    const postOffice = Array.isArray(result?.PostOffice)
      ? result.PostOffice[0]
      : null;

    const state = postOffice?.State;

    return isValidStateValue(state)
      ? cleanText(state)
      : null;
  } catch (error) {
    console.error("[SML BRE] Failed to fetch state from pincode", {
      pincode: cleanPincode,
      message: error.message,
    });

    return null;
  }
}

async function resolveStateForBureau(loan) {
  const stateFromDb = getLoanStateFromDb(loan);

  if (stateFromDb) {
    return stateFromDb;
  }

  const pincode = getLoanPincode(loan);

  if (!pincode) {
    console.warn("[SML BRE] State and pincode missing for bureau", {
      lan: loan.lan,
    });

    return "";
  }

  const stateFromPincode =
    await fetchStateFromPincode(pincode);

  if (stateFromPincode) {
    console.log("[SML BRE] State resolved from pincode", {
      lan: loan.lan,
      pincode,
      state: stateFromPincode,
    });

    return stateFromPincode;
  }

  console.warn("[SML BRE] Could not resolve state from pincode", {
    lan: loan.lan,
    pincode,
  });

  return "";
}


/**
 * Bureau execution flow required by business:
 * 1. VERIFIED + stored response -> reuse stored response.
 * 2. Any other status or no row -> trigger bureau.
 * 3. Successful bureau response -> store response and mark VERIFIED.
 * 4. Failed call/parse -> mark FAILED. The next request retries.
 */
async function runOrReuseBureau(loan) {
  const pool = db.promise();

  const [kycRows] = await pool.query(
    `
    SELECT id, bureau_status, bureau_api_response
    FROM kyc_verification_status
    WHERE lan = ?
      AND applicant_type = 'BORROWER'
      AND party_no = 1
    LIMIT 1
    `,
    [loan.lan],
  );

  const existingKyc = kycRows[0] || null;

  if (
    existingKyc?.bureau_status === "VERIFIED" &&
    existingKyc?.bureau_api_response
  ) {
    const parsed = parseBureauReport(
      deserializeBureauResponse(existingKyc.bureau_api_response),
      null,
      "REUSED_REPORT",
    );

    if (!parsed.ok) {
      await setBureauStatus(
        loan.lan,
        "FAILED",
        existingKyc.bureau_api_response,
      );

      return {
        status: "FAILED",
        technicalReason: "BUREAU_PARSE_FAILED",
      };
    }

    return {
      status: "VERIFIED",
      ...parsed,
      source: "REUSED_REPORT",
    };
  }

  await pool.query(
    `
    INSERT INTO kyc_verification_status
    (
      lan,
      applicant_type,
      party_no,
      applicant_name,
      mobile_number,
      pan_number,
      bureau_status,
      bureau_api_response
    )
    VALUES (?, 'BORROWER', 1, ?, ?, ?, 'INITIATED', NULL)
    ON DUPLICATE KEY UPDATE
      applicant_name = VALUES(applicant_name),
      mobile_number = VALUES(mobile_number),
      pan_number = VALUES(pan_number),
      bureau_status = 'INITIATED',
      bureau_api_response = NULL,
      updated_at = NOW()
    `,
    [
      loan.lan,
      loan.customer_name || null,
      loan.mobile || null,
      loan.pan_number || null,
    ],
  );

  try {
    const resolvedStateForBureau =
  await resolveStateForBureau(loan);

const resolvedPincodeForBureau =
  getLoanPincode(loan);

if (!resolvedStateForBureau) {
  await setBureauStatus(
    loan.lan,
    "FAILED",
    safeJson({
      error: "BUREAU_STATE_MISSING",
      pincode: resolvedPincodeForBureau || null,
    }),
  );

  return {
    status: "FAILED",
    technicalReason: "BUREAU_STATE_MISSING",
  };
}

    const bureauResult = await runBureau({
      ...splitName(loan.customer_name),
      dob: loan.dob,
      gender: loan.gender,
      current_address:
        loan.current_address_line_1 || loan.address_line_1 || "",
      current_village_city:
        loan.current_address_city ||
        loan.address_city ||
        loan.city ||
        "",
        current_state: resolvedStateForBureau,
  current_pincode: resolvedPincodeForBureau,
      mobile_number: loan.mobile,
      pan_number: loan.pan_number,
      loan_amount: loan.loan_amount,
      loan_tenure: loan.tenure,
    });

    const responseToStore = serializeBureauResponse(bureauResult?.response);

    if (!bureauResult?.success || !bureauResult?.response) {
      await setBureauStatus(loan.lan, "FAILED", responseToStore);

      return {
        status: "FAILED",
        technicalReason: "BUREAU_API_TECHNICAL_FAILURE",
      };
    }

    const parsed = parseBureauReport(
      bureauResult.response,
      null,
      "NEW_PULL",
    );

    if (!parsed.ok) {
      await setBureauStatus(loan.lan, "FAILED", responseToStore);

      return {
        status: "FAILED",
        technicalReason: "BUREAU_PARSE_FAILED",
      };
    }

    await setBureauStatus(loan.lan, "VERIFIED", responseToStore);

    return {
      status: "VERIFIED",
      ...parsed,
      source: "NEW_PULL",
    };
  } catch (error) {
    const safeError = JSON.stringify({
      error: error.message || "BUREAU_API_TECHNICAL_FAILURE",
    });

    await setBureauStatus(loan.lan, "FAILED", safeError);

    return {
      status: "FAILED",
      technicalReason: "BUREAU_API_TECHNICAL_FAILURE",
    };
  }
}

async function runOrReuseAml(loan) {
  const pool = db.promise();

  /*
   * Always reload the current AML state because the loan
   * object passed to runBRE may be old.
   */
  const [loanRows] = await pool.query(
    `
    SELECT
      aml_score,
      aml_status,
      aml_checked_at,
      aml_total_matches,
      aml_reason,
      aml_api_response
    FROM loan_booking_switch_my_loan
    WHERE lan = ?
    LIMIT 1
    `,
    [loan.lan],
  );

  const amlRow = loanRows[0] || {};
  const currentStatus = String(
    amlRow.aml_status || "",
  ).toUpperCase();

  /*
   * Reuse a completed AML result.
   */
  const hasCompleteAmlAudit =
  amlRow.aml_total_matches !== null &&
  amlRow.aml_total_matches !== undefined &&
  Boolean(amlRow.aml_api_response);

if (
  FINAL_AML_STATUSES.has(
    currentStatus,
  ) &&
  hasCompleteAmlAudit
) {
    return {
      status: currentStatus,
      score:
        amlRow.aml_score === null ||
        amlRow.aml_score === undefined
          ? null
          : Number(amlRow.aml_score),

      totalMatches:
        amlRow.aml_total_matches === null ||
        amlRow.aml_total_matches === undefined
          ? null
          : Number(amlRow.aml_total_matches),

      reason: amlRow.aml_reason || null,
      source: "REUSED",
    };
  }

  /*
   * Any non-final status, including FAILED, is retried.
   */
  await pool.query(
    `
    UPDATE loan_booking_switch_my_loan
    SET
      aml_status = 'INITIATED',
      aml_score = NULL,
      aml_total_matches = NULL,
      aml_reason = NULL,
      aml_api_response = NULL,
      aml_checked_at = NOW()
    WHERE lan = ?
    `,
    [loan.lan],
  );

  try {
    const amlResult = await amlCheck(
      "switch-my-loan",
      {
        customer_name:
          loan.customer_name || "",

        location:
          loan.current_address_city ||
          loan.address_city ||
          loan.city ||
          "",

        father_name:
          loan.father_name || "",

        pan_number:
          loan.pan_number || "",

        phone:
          loan.mobile || "",
      },
    );

    const totalMatches = Number(
      amlResult?.total ?? 0,
    );

    const returnedScore =
      amlResult?.results?.[0]?.score;

    const parsedScore =
      returnedScore === null ||
      returnedScore === undefined ||
      returnedScore === ""
        ? null
        : Number(returnedScore);

    /*
     * When no AML match exists, your existing logic assigns
     * a score of 100.
     */
    const amlScore =
      totalMatches === 0
        ? 100
        : Number.isFinite(parsedScore)
          ? parsedScore
          : null;

    /*
     * A match exists but no usable score was received.
     * Treat this as a technical failure rather than
     * automatically clearing or rejecting the customer.
     */
    if (
      totalMatches > 0 &&
      amlScore === null
    ) {
      await pool.query(
        `
        UPDATE loan_booking_switch_my_loan
        SET
          aml_status = 'FAILED',
          aml_score = NULL,
          aml_total_matches = ?,
          aml_reason = 'AML_SCORE_MISSING',
          aml_api_response = ?,
          aml_checked_at = NOW()
        WHERE lan = ?
        `,
        [
          totalMatches,
          safeJson(amlResult),
          loan.lan,
        ],
      );

      return {
        status: "FAILED",
        score: null,
        totalMatches,
        reason: "AML_SCORE_MISSING",
        source: "NEW_CHECK",
        technicalReason:
          "AML_TECHNICAL_FAILURE",
      };
    }

    const amlStatus = getAmlDecision(
      amlScore,
      totalMatches,
    );

    const amlReason =
      amlStatus === "CLEAR"
        ? null
        : "AML_HIGH_RISK_MATCH";

    await pool.query(
      `
      UPDATE loan_booking_switch_my_loan
      SET
        aml_status = ?,
        aml_score = ?,
        aml_total_matches = ?,
        aml_reason = ?,
        aml_api_response = ?,
        aml_checked_at = NOW()
      WHERE lan = ?
      `,
      [
        amlStatus,
        amlScore,
        totalMatches,
        amlReason,
        safeJson(amlResult),
        loan.lan,
      ],
    );

    return {
      status: amlStatus,
      score: amlScore,
      totalMatches,
      reason: amlReason,
      source: "NEW_CHECK",
    };
  } catch (error) {
    console.error("[SML BRE] AML failed", {
      lan: loan.lan,
      message: error.message,
    });

    await pool.query(
      `
      UPDATE loan_booking_switch_my_loan
      SET
        aml_status = 'FAILED',
        aml_score = NULL,
        aml_total_matches = NULL,
        aml_reason = 'AML_TECHNICAL_FAILURE',
        aml_api_response = ?,
        aml_checked_at = NOW()
      WHERE lan = ?
      `,
      [
        safeJson({
          error:
            error.message ||
            "AML_TECHNICAL_FAILURE",
        }),
        loan.lan,
      ],
    );

    return {
      status: "FAILED",
      score: null,
      totalMatches: null,
      reason: "AML_TECHNICAL_FAILURE",
      source: "NEW_CHECK",
      technicalReason:
        "AML_TECHNICAL_FAILURE",
    };
  }
}

async function runBRE(data) {
  if (!data?.lan) {
    return {
      policyVersion: POLICY_VERSION,
      decision: "TECHNICAL_FAILURE",
      reason: "LAN_MISSING",
      reasons: ["LAN_MISSING"],
      creditLimit: null,
      age: null,
      newCustomer: null,
      aml: null,
      amlScore: null,
      bureau: null,
      rules: createInitialRules(),
    };
  }

  const [[storedLoan]] = await db.promise().query(
    `
    SELECT *
    FROM loan_booking_switch_my_loan
    WHERE lan = ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [data.lan],
  );

  const loan = storedLoan || data;
  const reasons = [];
  const rules = createInitialRules();

  const result = {
    policyVersion: POLICY_VERSION,
    decision: "APPROVED",
    reason: null,
    reasons,
    creditLimit: null,

    requestedLoanAmount: null,
  approvedLoanAmount: null,
  limitAdjusted: false,

    age: null,
    newCustomer: null,
    aml: null,
    amlScore: null,
    bureau: null,
    rules,
  };

  /*
   * AML remains a mandatory compliance check and follows the
   * previous RapidMoney BRE interpretation:
   * - no matches => CLEAR with score 100
   * - matches + score >= 70 => CLEAR
   * - matches + score < 70 => REJECT
   * - REVIEW is treated as rejection, as in the previous BRE
   */
  const aml = await runOrReuseAml(loan);

  result.aml = {
    status: aml.status,
    score: aml.score,
    totalMatches: aml.totalMatches,
    reason: aml.reason,
    source: aml.source,
  };
  result.amlScore = aml.score;

  if (aml.technicalReason) {
    rules.AML_CHECK_RPM = rule(
      false,
      aml.technicalReason,
      result.aml,
    );

    result.decision = "TECHNICAL_FAILURE";
    result.reason = aml.technicalReason;
    result.reasons = [aml.technicalReason];

    await updateBookingBreSnapshot(loan.lan, result);
    return result;
  }

  if (aml.status === "REJECT") {
    addReason(reasons, "AML_HIGH_RISK_MATCH");

    rules.AML_CHECK_RPM = rule(
      false,
      "AML_HIGH_RISK_MATCH",
      result.aml,
    );

    result.decision = "REJECTED";
    result.reason = "AML_HIGH_RISK_MATCH";
    result.reasons = reasons;

    await updateBookingBreSnapshot(loan.lan, result);
    return result;
  }

  if (aml.status === "REVIEW") {
    addReason(reasons, "AML_MEDIUM_RISK_MATCH");

    rules.AML_CHECK_RPM = rule(
      false,
      "AML_MEDIUM_RISK_MATCH",
      result.aml,
    );

    result.decision = "REJECTED";
    result.reason = "AML_MEDIUM_RISK_MATCH";
    result.reasons = reasons;

    await updateBookingBreSnapshot(loan.lan, result);
    return result;
  }

  rules.AML_CHECK_RPM = rule(
    aml.status === "CLEAR",
    aml.status === "CLEAR" ? null : "AML_STATUS_INVALID",
    result.aml,
  );

  if (aml.status !== "CLEAR") {
    result.decision = "TECHNICAL_FAILURE";
    result.reason = "AML_STATUS_INVALID";
    result.reasons = ["AML_STATUS_INVALID"];

    await updateBookingBreSnapshot(loan.lan, result);
    return result;
  }

  const rawTotalDisbursed = loan.total_disbursed_applications;
  const totalDisbursed = Number(rawTotalDisbursed ?? 0);

  if (
    rawTotalDisbursed !== null &&
    rawTotalDisbursed !== undefined &&
    (!Number.isInteger(totalDisbursed) || totalDisbursed < 0)
  ) {
    addReason(reasons, "TOTAL_DISBURSED_APPLICATIONS_INVALID");
  }

  const newCustomer = isNewCustomer(totalDisbursed);
  const age = calculateAge(loan.dob, new Date());

  const loanAmountResult = validateLoanAmount(loan.loan_amount);
  addReason(reasons, loanAmountResult.reason);

  rules.LOAN_AMOUNT_CHECK_RPM = rule(
    loanAmountResult.passed,
    loanAmountResult.reason,
    {
      requestedLoanAmount: loanAmountResult.amount,
      minimumLoanAmount: POLICY.MIN_LOAN_AMOUNT,
      maximumLoanAmount: POLICY.MAX_LOAN_AMOUNT,
      requiredMultiple: POLICY.LOAN_AMOUNT_MULTIPLE,
    },
  );

  let creditLimit = null;
  let repeatLimitDetails = null;

  if (newCustomer) {
    creditLimit = POLICY.FIRST_TIME_CUSTOMER_LIMIT;


    const firstTimeLimitAdjusted =
  Number(loan.loan_amount) >
  POLICY.FIRST_TIME_CUSTOMER_LIMIT;

rules.FIRST_TIME_LIMIT_CHECK_RPM =
  rule(
    true,
    null,
    {
      applicable: true,

      requestedLoanAmount:
        Number(loan.loan_amount),

      assignedCreditLimit:
        POLICY
          .FIRST_TIME_CUSTOMER_LIMIT,

      limitAdjusted:
        firstTimeLimitAdjusted,

      adjustmentReason:
        firstTimeLimitAdjusted
          ? "REQUESTED_AMOUNT_CAPPED_TO_FIRST_TIME_LIMIT"
          : null,
    },
  );

    rules.REPEAT_LIMIT_CHECK_RPM = rule(true, null, { applicable: false });
    rules.REPEAT_AGE_CAP_CHECK_RPM = rule(true, null, { applicable: false });
  } else {
    rules.FIRST_TIME_LIMIT_CHECK_RPM = rule(true, null, { applicable: false });

    if (age === null) {
      addReason(reasons, "AGE_MISSING_OR_INVALID_FOR_REPEAT_CUSTOMER");
    }

    if (
      !loan.previous_loan_amount ||
      Number(loan.previous_loan_amount) <= 0
    ) {
      addReason(reasons, "PREVIOUS_LOAN_AMOUNT_MISSING_FOR_REPEAT_CUSTOMER");
    }

    repeatLimitDetails = calculateRepeatCreditLimit(
      totalDisbursed,
      loan.previous_loan_amount,
      age,
    );
    creditLimit = repeatLimitDetails.creditLimit;

    if (!creditLimit || creditLimit < POLICY.MIN_LOAN_AMOUNT) {
      addReason(reasons, "REPEAT_CUSTOMER_CREDIT_LIMIT_BELOW_MINIMUM_LOAN");
    }

    // if (
    //   age !== null &&
    //   age < 28 &&
    //   Number(loan.loan_amount) > POLICY.REPEAT_CUSTOMER_UNDER_28_LIMIT
    // ) {
    //   addReason(reasons, "REPEAT_CUSTOMER_UNDER_28_AMOUNT_ABOVE_10000");
    // }

    rules.REPEAT_LIMIT_CHECK_RPM = rule(
      Boolean(creditLimit && creditLimit >= POLICY.MIN_LOAN_AMOUNT),
      !creditLimit || creditLimit < POLICY.MIN_LOAN_AMOUNT
        ? "REPEAT_CUSTOMER_CREDIT_LIMIT_BELOW_MINIMUM_LOAN"
        : null,
      {
        applicable: true,
        previousLoanAmount: Number(loan.previous_loan_amount || 0),
        repeatLoanCount: totalDisbursed,
        multiplier: repeatLimitDetails.multiplier,
        rawLimit: repeatLimitDetails.rawLimit,
        cappedLimit: repeatLimitDetails.cappedLimit,
        roundedLimit: repeatLimitDetails.roundedLimit,
        maximumPolicyCap: POLICY.MAX_REPEAT_CUSTOMER_LIMIT,
      },
    );

    // const repeatAgeCapFailed =
    //   age !== null &&
    //   age < 28 &&
    //   Number(loan.loan_amount) > POLICY.REPEAT_CUSTOMER_UNDER_28_LIMIT;

    const ageCapApplicable =
  age !== null &&
  age < 28;

const ageCapAdjusted =
  ageCapApplicable &&
  Number(loan.loan_amount) >
    POLICY
      .REPEAT_CUSTOMER_UNDER_28_LIMIT;

rules.REPEAT_AGE_CAP_CHECK_RPM =
  rule(
    true,
    null,
    {
      applicable:
        ageCapApplicable,

      age,

      requestedLoanAmount:
        Number(loan.loan_amount),

      maximumAllowedAmount:
        POLICY
          .REPEAT_CUSTOMER_UNDER_28_LIMIT,

      ageCapApplied:
        repeatLimitDetails
          .ageCapApplied,

      limitAdjusted:
        ageCapAdjusted,

      adjustmentReason:
        ageCapAdjusted
          ? "REQUESTED_AMOUNT_CAPPED_TO_UNDER_28_LIMIT"
          : null,
    },
  );
  }

  // if (
  //   creditLimit !== null &&
  //   Number(loan.loan_amount) > Number(creditLimit)
  // ) {
  //   addReason(reasons, "LOAN_AMOUNT_EXCEEDS_CREDIT_LIMIT");
  // }

  // rules.CREDIT_LIMIT_CHECK_RPM = rule(
  //   creditLimit !== null && Number(loan.loan_amount) <= Number(creditLimit),
  //   creditLimit === null
  //     ? "CREDIT_LIMIT_COULD_NOT_BE_CALCULATED"
  //     : Number(loan.loan_amount) > Number(creditLimit)
  //       ? "LOAN_AMOUNT_EXCEEDS_CREDIT_LIMIT"
  //       : null,
  //   {
  //     creditLimit,
  //     requestedLoanAmount: Number(loan.loan_amount),
  //     newCustomer,
  //     repeatLoanCount: newCustomer ? 0 : totalDisbursed,
  //     previousLoanAmount: newCustomer
  //       ? null
  //       : Number(loan.previous_loan_amount || 0),
  //     multiplier: repeatLimitDetails?.multiplier ?? null,
  //     ageCapApplied: repeatLimitDetails?.ageCapApplied ?? false,
  //   },
  // );

  const requestedLoanAmount =
  Number(loan.loan_amount);

const numericCreditLimit =
  Number(creditLimit);

const validCreditLimit =
  Number.isFinite(numericCreditLimit) &&
  numericCreditLimit >=
    POLICY.MIN_LOAN_AMOUNT;

/*
 * Requested amount exceeding the calculated
 * credit limit is not a rejection.
 *
 * The customer is approved at the lower amount.
 */
const approvedLoanAmount =
  validCreditLimit
    ? Math.min(
        requestedLoanAmount,
        numericCreditLimit,
      )
    : null;

const limitAdjusted =
  validCreditLimit &&
  requestedLoanAmount >
    numericCreditLimit;

    result.creditLimit =
  validCreditLimit
    ? numericCreditLimit
    : null;

result.requestedLoanAmount =
  requestedLoanAmount;

result.approvedLoanAmount =
  approvedLoanAmount;

result.limitAdjusted =
  limitAdjusted;

/*
 * Reject only when a valid credit limit could
 * not be calculated.
 */
if (!validCreditLimit) {
  addReason(
    reasons,
    "CREDIT_LIMIT_COULD_NOT_BE_CALCULATED",
  );
}

rules.CREDIT_LIMIT_CHECK_RPM =
  rule(
    validCreditLimit,

    validCreditLimit
      ? null
      : "CREDIT_LIMIT_COULD_NOT_BE_CALCULATED",

    {
      creditLimit:
        validCreditLimit
          ? numericCreditLimit
          : null,

      requestedLoanAmount,

      approvedLoanAmount,

      limitAdjusted,

      adjustmentReason:
        limitAdjusted
          ? "REQUESTED_AMOUNT_CAPPED_TO_CREDIT_LIMIT"
          : null,

      newCustomer,

      repeatLoanCount:
        newCustomer
          ? 0
          : totalDisbursed,

      previousLoanAmount:
        newCustomer
          ? null
          : Number(
              loan.previous_loan_amount ||
                0,
            ),

      multiplier:
        repeatLimitDetails
          ?.multiplier ?? null,

      ageCapApplied:
        repeatLimitDetails
          ?.ageCapApplied ?? false,
    },
  );

  result.decision = reasons.length ? "REJECTED" : "APPROVED";
  result.reason = reasons[0] || null;
  result.reasons = reasons;
  // result.creditLimit = creditLimit;
  result.age = age;
  result.newCustomer = newCustomer;

  // Do not call bureau if the application already fails mandatory input/limit rules.
  if (reasons.length) {
    await updateBookingBreSnapshot(loan.lan, result);
    return result;
  }

  const bureau = await runOrReuseBureau(loan);

  if (bureau.technicalReason) {
    result.decision = "TECHNICAL_FAILURE";
    result.reason = bureau.technicalReason;
    result.reasons = [bureau.technicalReason];
    result.bureau = { status: bureau.status };

    await updateBookingBreSnapshot(loan.lan, result);
    return result;
  }

  result.bureau = {
    status: bureau.status,
    source: bureau.source,
    reportId: bureau.reportId ?? null,
    score: bureau.score,
    panCount: bureau.panCount,
    hasDualPan: bureau.hasDualPan,
    reportDate:
    bureau.reportDate || null,

  enquiryBreakdown30Days:
    bureau.enquiryBreakdown30Days ||
    null,
    enquiries30Days: bureau.enquiries30Days,
    totalOverdueAmount: bureau.totalOverdueAmount,
    maxDpdLast3Months: bureau.maxDpdLast3Months,
    maxDpdLast9Months: bureau.maxDpdLast9Months,
    maxDpdLast12Months: bureau.maxDpdLast12Months,
    hasGt30DpdLast3Months: bureau.hasGt30DpdLast3Months,
    hasGt60DpdLast9Months: bureau.hasGt60DpdLast9Months,
    hasGt90DpdLast12Months: bureau.hasGt90DpdLast12Months,
    unsecuredAggregate: bureau.unsecuredAggregate,
    unsecuredTradelineCount: bureau.unsecuredTradelineCount,
    totalTradelines: bureau.totalTradelines,
    unmappedAccountTypeCodes: bureau.unmappedAccountTypeCodes || [],
  };

  const bureauScoreMissing =
    bureau.score === null || bureau.score === undefined;
  const bureauScoreBelowMinimum =
    !bureauScoreMissing && Number(bureau.score) < POLICY.MIN_BUREAU_SCORE;

  if (bureauScoreMissing) addReason(reasons, "BUREAU_SCORE_MISSING");
  if (bureauScoreBelowMinimum) addReason(reasons, "BUREAU_SCORE_BELOW_650");

  rules.BUREAU_SCORE_CHECK_RPM = rule(
    !bureauScoreMissing && !bureauScoreBelowMinimum,
    bureauScoreMissing
      ? "BUREAU_SCORE_MISSING"
      : bureauScoreBelowMinimum
        ? "BUREAU_SCORE_BELOW_650"
        : null,
    {
      bureauScore: bureau.score,
      minimumRequiredScore: POLICY.MIN_BUREAU_SCORE,
    },
  );

  if (bureau.hasDualPan) {
    addReason(reasons, "DUAL_PAN_FOUND_IN_BUREAU");
  }

  rules.DUAL_PAN_CHECK_RPM = rule(
    !bureau.hasDualPan,
    bureau.hasDualPan ? "DUAL_PAN_FOUND_IN_BUREAU" : null,
    {
      panCount: bureau.panCount,
    },
  );

  const enquiries30Days = Number(bureau.enquiries30Days || 0);
  const enquiriesFailed =
    enquiries30Days >= POLICY.ENQUIRY_REJECT_FROM_30_DAYS;

  if (enquiriesFailed) {
    addReason(reasons, "ENQUIRIES_GTE_5_LAST_30_DAYS");
  }

  rules.ENQUIRIES_30D_CHECK_RPM = rule(
    !enquiriesFailed,
    enquiriesFailed ? "ENQUIRIES_GTE_5_LAST_30_DAYS" : null,
    {
      enquiriesLast30Days: enquiries30Days,
      maximumAllowedExclusive: POLICY.ENQUIRY_REJECT_FROM_30_DAYS,
    },
  );

  const totalOverdueAmount = Number(bureau.totalOverdueAmount || 0);
  const overdueFailed = totalOverdueAmount >= POLICY.OVERDUE_REJECT_FROM;

  if (overdueFailed) {
    addReason(reasons, "OVERDUE_AMOUNT_GTE_1000");
  }

  rules.OVERDUE_AMOUNT_CHECK_RPM = rule(
    !overdueFailed,
    overdueFailed ? "OVERDUE_AMOUNT_GTE_1000" : null,
    {
      totalOverdueAmount,
      maximumAllowedExclusive: POLICY.OVERDUE_REJECT_FROM,
    },
  );

  if (bureau.hasGt30DpdLast3Months) {
    addReason(reasons, "DPD_GT_30_LAST_3_MONTHS");
  }

  rules.DPD_30_LAST_3M_CHECK_RPM = rule(
    !bureau.hasGt30DpdLast3Months,
    bureau.hasGt30DpdLast3Months
      ? "DPD_GT_30_LAST_3_MONTHS"
      : null,
    {
      maximumObservedDpd: bureau.maxDpdLast3Months,
      rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_3_MONTHS,
    },
  );

  if (bureau.hasGt60DpdLast9Months) {
    addReason(reasons, "DPD_GT_60_LAST_9_MONTHS");
  }

  rules.DPD_60_LAST_9M_CHECK_RPM = rule(
    !bureau.hasGt60DpdLast9Months,
    bureau.hasGt60DpdLast9Months
      ? "DPD_GT_60_LAST_9_MONTHS"
      : null,
    {
      maximumObservedDpd: bureau.maxDpdLast9Months,
      rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_9_MONTHS,
    },
  );

  if (bureau.hasGt90DpdLast12Months) {
    addReason(reasons, "DPD_GT_90_LAST_12_MONTHS");
  }

  rules.DPD_90_LAST_12M_CHECK_RPM = rule(
    !bureau.hasGt90DpdLast12Months,
    bureau.hasGt90DpdLast12Months
      ? "DPD_GT_90_LAST_12_MONTHS"
      : null,
    {
      maximumObservedDpd: bureau.maxDpdLast12Months,
      rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_12_MONTHS,
    },
  );

  const unsecuredAggregate = Number(bureau.unsecuredAggregate || 0);
  const unsecuredAggregationFailed =
    newCustomer && unsecuredAggregate < POLICY.MIN_UNSECURED_AGGREGATE;

  if (unsecuredAggregationFailed) {
    addReason(reasons, "UNSECURED_TRADELINE_AGGREGATE_BELOW_200000");
  }

  rules.UNSECURED_AGGREGATION_CHECK_RPM = rule(
    !unsecuredAggregationFailed,
    unsecuredAggregationFailed
      ? "UNSECURED_TRADELINE_AGGREGATE_BELOW_200000"
      : null,
    {
      applicable: newCustomer,
      unsecuredAggregate,
      unsecuredTradelineCount: bureau.unsecuredTradelineCount,
      minimumRequiredAggregate: POLICY.MIN_UNSECURED_AGGREGATE,
      unmappedAccountTypeCodes: bureau.unmappedAccountTypeCodes || [],
    },
  );

  result.decision = reasons.length ? "REJECTED" : "APPROVED";
  result.reason = reasons[0] || null;
  result.reasons = reasons;

  await updateBookingBreSnapshot(loan.lan, result);
  return result;
}

runBRE.helpers = {
  safeJson,
  splitName,
  getAmlDecision,
};

module.exports = runBRE;
