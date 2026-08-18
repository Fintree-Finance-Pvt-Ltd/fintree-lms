/**
 * PL Partner BRE (business rule engine) for the /approve endpoint.
 *
 * Ported from Backend/routes/switchMyLoan/runBre.js, adapted for the two-call
 * decision flow PLP actually uses (see the integration contract): PRE_APPROVAL
 * runs the full rule set against the requested amount and returns a credit
 * limit; FINAL_APPROVAL (after the customer selects an offer) only re-checks
 * that the selected offer fits within the credit limit already computed at
 * PRE_APPROVAL — it does not re-run AML/bureau.
 *
 * Deliberately kept separate from runBre.js/rapidMoneyPolicy.js so RapidMoney's
 * BRE is untouched. Known simplifications for this pass (see the PL Partner
 * plan discussion):
 *  - No repeat-customer signal exists in the PLP contract, so every applicant
 *    is treated as a new customer (FIRST_TIME_CUSTOMER_LIMIT). The repeat
 *    branch is not implemented here; add it if/when PLP starts sending prior
 *    disbursal history.
 *  - No processing-fee field exists anywhere in the PLP contract/schema, so
 *    approved amounts are gross (no PF/GST netting like switchMyLoan does).
 *  - AML is still always mocked (PLP_AML_MODE, forced to "mock-clear" —
 *    "live" mode throws NOT_IMPLEMENTED since no real AML integration has
 *    been wired up yet).
 *  - Bureau is live-capable (PLP_BUREAU_MODE=live pulls a real Experian/CIBIL
 *    report via the same shared Backend/services/Bueraupullapiservice.js
 *    RapidMoney uses, and reuses the same product-agnostic kyc_verification_status
 *    / loan_cibil_reports tables every lending product in this LMS already shares).
 *    The report is interpreted by plPartnerBureauParser.js, a full independent
 *    copy of rapidMoneyPolicy.js's parser kept separate on purpose.
 */
const db = require("../../../config/db");
const {
  POLICY,
  calculateAge,
  validateLoanAmount,
  calculateNetDisbursalAmount,
} = require("./plPartnerPolicy");
const { parseBureauReport } = require("./plPartnerBureauParser");
const {
  runBureau: pullBureauReport,
} = require("../../../services/Bueraupullapiservice");

const {
  screenLoanBooking,
} = require("../../../services/trackwizz/screeningService");

const AML_SCREENING_PRODUCT = "fintreepl";

const AML_REJECT_REASON = "AML REJECT";

const TRACKWIZZ_AML_STATUSES = new Set(["PROCEED", "REVIEW", "STOP"]);

const POLICY_VERSION = "PL_PARTNER_POLICY_PLACEHOLDER_2026_08";

const DEPLOYMENT_ENV = String(
  process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || "development",
)
  .trim()
  .toLowerCase();

const PLP_AML_MODE = String(process.env.PLP_AML_MODE || "")
  .trim()
  .toLowerCase();

const PLP_BUREAU_MODE = String(process.env.PLP_BUREAU_MODE || "")
  .trim()
  .toLowerCase();

const VALID_SERVICE_MODES = new Set(["live", "mock-clear"]);

if (!VALID_SERVICE_MODES.has(PLP_AML_MODE)) {
  throw new Error(
    `Invalid PLP_AML_MODE "${PLP_AML_MODE}". Expected live or mock-clear.`,
  );
}

if (!VALID_SERVICE_MODES.has(PLP_BUREAU_MODE)) {
  throw new Error(
    `Invalid PLP_BUREAU_MODE "${PLP_BUREAU_MODE}". Expected live or mock-clear.`,
  );
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(String(value).replace(/,/g, "").trim());

  return Number.isFinite(number) ? number : null;
}

// if (
//   DEPLOYMENT_ENV === "production" &&
//   (PLP_AML_MODE !== "live" || PLP_BUREAU_MODE !== "live")
// ) {
//   throw new Error("PL Partner AML/Bureau bypass is not permitted in production");
// }

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serialization_error: true });
  }
}

function rule(passed, reason = null, derivedValues = {}, executed = true) {
  return { executed, passed, reason, derived_values: derivedValues };
}

function addReason(reasons, reasonValue) {
  if (reasonValue && !reasons.includes(reasonValue)) {
    reasons.push(reasonValue);
  }
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
    SELECTED_OFFER_CHECK_RPM: rule(false, null, {}, false),
    PROCESSING_FEE_CHECK_RPM: rule(false, null, {}, false),
  };
}

// async function runAml() {
//   if (PLP_AML_MODE === "mock-clear") {
//     return {
//       status: "PROCEED",
//       score: 100,
//       totalMatches: 0,
//       reason: null,
//       source: "TEST_BYPASS",
//     };
//   }

//   throw new Error("PL Partner live AML integration is not implemented yet.");
// }

async function runTrackwizzAml(application) {
  try {
    if (PLP_AML_MODE === "mock-clear") {
      console.warn("[PLP BRE] AML bypassed in test mode", {
        applicationId: application.id,
        lan: application.lan,
        deploymentEnvironment: DEPLOYMENT_ENV,
      });

      return {
        status: "PROCEED",
        score: 100,
        totalMatches: 0,
        reason: null,
        source: "TEST_BYPASS",
        bypassed: true,
        technicalReason: null,
      };
    }

    /*
     * fintreepl config:
     *
     * table: pl_partner_applications
     * codeFields: ["lan", "partner_application_id"]
     *
     * Prefer LAN, same as Switch My Loan.
     * Fall back to partner_application_id if needed.
     */
    const screeningCode = application.lan || application.partner_application_id;

    if (!screeningCode) {
      return {
        status: "ERROR",
        score: null,
        totalMatches: null,
        reason: "AML_SCREENING_CODE_MISSING",
        source: "TRACKWIZZ",
        technicalReason: "AML_SCREENING_CODE_MISSING",
      };
    }

    const screening = await screenLoanBooking(
      AML_SCREENING_PRODUCT,
      screeningCode,
    );

    /*
     * screenLoanBooking writes these columns through the
     * fintreepl amlColumns configuration.
     *
     * Reload them so DB remains the source of truth.
     */
    const [[amlRow]] = await db.promise().query(
      `
      SELECT
        aml_status,
        aml_score,
        aml_total_matches,
        aml_reason
      FROM pl_partner_applications
      WHERE id = ?
      LIMIT 1
      `,
      [application.id],
    );

    const status = String(screening?.amlStatus || amlRow?.aml_status || "")
      .trim()
      .toUpperCase();

    const providerReason =
      String(screening?.amlReason || amlRow?.aml_reason || "").trim() || null;

    const score = toNumberOrNull(amlRow?.aml_score);

    const totalMatches = toNumberOrNull(amlRow?.aml_total_matches);

    if (!TRACKWIZZ_AML_STATUSES.has(status)) {
      return {
        status: status || "ERROR",
        score,
        totalMatches,
        reason: providerReason,
        source: "TRACKWIZZ",
        technicalReason: "AML_STATUS_INVALID",
      };
    }

    return {
      status,
      score,
      totalMatches,
      reason: providerReason,
      source: "TRACKWIZZ",
      technicalReason: null,
    };
  } catch (error) {
    console.error("[PLP BRE] TrackWizz AML failed", {
      applicationId: application?.id,
      lan: application?.lan,
      message: error.message,
    });

    return {
      status: "ERROR",
      score: null,
      totalMatches: null,
      reason: "AML_TECHNICAL_FAILURE",
      source: "TRACKWIZZ",
      technicalReason: "AML_TECHNICAL_FAILURE",
    };
  }
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

function getApplicationPincode(application) {
  return (
    extractPincode(application.curr_pincode) ||
    extractPincode(application.perm_pincode) ||
    ""
  );
}

function getApplicationStateFromDb(application) {
  const state = application.curr_state || application.perm_state || "";

  return isValidStateValue(state) ? cleanText(state) : "";
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
    const result = Array.isArray(data) ? data[0] : null;
    const postOffice = Array.isArray(result?.PostOffice)
      ? result.PostOffice[0]
      : null;
    const state = postOffice?.State;

    return isValidStateValue(state) ? cleanText(state) : null;
  } catch (error) {
    console.error("[PLP BRE] Failed to fetch state from pincode", {
      pincode: cleanPincode,
      message: error.message,
    });

    return null;
  }
}

async function resolveStateForApplication(application) {
  const stateFromDb = getApplicationStateFromDb(application);

  if (stateFromDb) {
    return stateFromDb;
  }

  const pincode = getApplicationPincode(application);

  if (!pincode) {
    console.warn("[PLP BRE] State and pincode missing for bureau", {
      applicationId: application.id,
    });

    return "";
  }

  const stateFromPincode = await fetchStateFromPincode(pincode);

  if (stateFromPincode) {
    console.log("[PLP BRE] State resolved from pincode", {
      applicationId: application.id,
      pincode,
      state: stateFromPincode,
    });

    return stateFromPincode;
  }

  return "";
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

function normalizeDbString(value, maxLength) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  return text.slice(0, maxLength);
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

async function saveApplicationCibilReport({
  application,
  score = null,
  response = null,
  sourceApplicantId = null,
  insertOnlyIfMissing = false,
}) {
  const reportXml = serializeBureauResponse(response);

  if (
    !application?.lan ||
    reportXml === null ||
    reportXml === undefined ||
    reportXml === ""
  ) {
    return;
  }

  const applicantType = "BORROWER";
  const partyNo = 1;

  if (insertOnlyIfMissing) {
    const [existingRows] = await db.promise().query(
      `
      SELECT id
      FROM loan_cibil_reports
      WHERE lan = ?
        AND applicant_type = ?
        AND party_no = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [application.lan, applicantType, partyNo],
    );

    if (existingRows.length) {
      return;
    }
  }

  await db.promise().query(
    `
    INSERT INTO loan_cibil_reports
    (
      lan,
      pan_number,
      score,
      report_xml,
      pdf_generated,
      applicant_type,
      party_no,
      source_applicant_id,
      created_at
    )
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, NOW())
    `,
    [
      normalizeDbString(application.lan, 50),
      normalizeDbString(application.pan_number, 15),
      normalizeDbString(score, 10),
      reportXml,
      applicantType,
      partyNo,
      sourceApplicantId || null,
    ],
  );
}

async function runBureau(application) {
  if (PLP_BUREAU_MODE === "mock-clear") {
    console.warn("[PLP BRE] Bureau bypassed in test mode", {
      applicationId: application.id,
      deploymentEnvironment: DEPLOYMENT_ENV,
    });

    return {
      status: "VERIFIED",
      source: "TEST_BYPASS",
      bypassed: true,

      reportId: null,
      reportDate: null,

      score: 750,

      panCount: 1,
      hasDualPan: false,

      enquiries30Days: 0,
      totalOverdueAmount: 0,

      maxDpdLast3Months: 0,
      maxDpdLast9Months: 0,
      maxDpdLast12Months: 0,

      hasGt30DpdLast3Months: false,
      hasGt60DpdLast9Months: false,
      hasGt90DpdLast12Months: false,

      unsecuredAggregate: 250000,
      unsecuredTradelineCount: 2,
      totalTradelines: 2,
    };
  }

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
    [application.lan],
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
        application.lan,
        "FAILED",
        existingKyc.bureau_api_response,
      );

      return {
        status: "FAILED",
        technicalReason: "BUREAU_PARSE_FAILED",
      };
    }

    try {
      await saveApplicationCibilReport({
        application,
        score: parsed.score,
        response: existingKyc.bureau_api_response,
        sourceApplicantId: existingKyc.id,
        insertOnlyIfMissing: true,
      });
    } catch (error) {
      console.error("[PLP BRE] Failed to save reused bureau report", {
        lan: application.lan,
        message: error.message,
      });

      return {
        status: "FAILED",
        technicalReason: "BUREAU_REPORT_SAVE_FAILED",
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
      application.lan,
      application.customer_full_name || null,
      application.mobile_number || null,
      application.pan_number || null,
    ],
  );

  const [[currentKyc]] = await pool.query(
    `
    SELECT id
    FROM kyc_verification_status
    WHERE lan = ?
      AND applicant_type = 'BORROWER'
      AND party_no = 1
    LIMIT 1
    `,
    [application.lan],
  );

  const currentKycId = currentKyc?.id || existingKyc?.id || null;

  try {
    const resolvedState = await resolveStateForApplication(application);
    const resolvedPincode = getApplicationPincode(application);

    if (!resolvedState) {
      await setBureauStatus(
        application.lan,
        "FAILED",
        JSON.stringify({
          error: "BUREAU_STATE_MISSING",
          pincode: resolvedPincode || null,
        }),
      );

      return {
        status: "FAILED",
        technicalReason: "BUREAU_STATE_MISSING",
      };
    }

    const bureauResult = await pullBureauReport({
      first_name: application.customer_first_name,
      middle_name: application.customer_middle_name,
      last_name:
        application.customer_last_name || application.customer_first_name,
      dob: application.date_of_birth,
      gender: application.gender,
      current_address:
        application.curr_address_line1 || application.perm_address_line1 || "",
      current_village_city:
        application.curr_city || application.perm_city || "",
      current_state: resolvedState,
      current_pincode: resolvedPincode,
      mobile_number: application.mobile_number,
      pan_number: application.pan_number,
      loan_amount: application.requested_amount,
      loan_tenure: application.requested_tenure,
    });

    const responseToStore = serializeBureauResponse(bureauResult?.response);

    if (!bureauResult?.success || !bureauResult?.response) {
      await setBureauStatus(application.lan, "FAILED", responseToStore);

      return {
        status: "FAILED",
        technicalReason: "BUREAU_API_TECHNICAL_FAILURE",
      };
    }

    const parsed = parseBureauReport(bureauResult.response, null, "NEW_PULL");

    if (!parsed.ok) {
      await setBureauStatus(application.lan, "FAILED", responseToStore);

      return {
        status: "FAILED",
        technicalReason: "BUREAU_PARSE_FAILED",
      };
    }

    try {
      await saveApplicationCibilReport({
        application,
        score: parsed.score,
        response: responseToStore,
        sourceApplicantId: currentKycId,
      });
    } catch (error) {
      console.error("[PLP BRE] Failed to save new bureau report", {
        lan: application.lan,
        message: error.message,
      });

      await setBureauStatus(
        application.lan,
        "FAILED",
        JSON.stringify({
          error: "BUREAU_REPORT_SAVE_FAILED",
          message: error.message,
        }),
      );

      return {
        status: "FAILED",
        technicalReason: "BUREAU_REPORT_SAVE_FAILED",
      };
    }

    await setBureauStatus(application.lan, "VERIFIED", responseToStore);

    return {
      status: "VERIFIED",
      ...parsed,
      source: "NEW_PULL",
    };
  } catch (error) {
    await setBureauStatus(
      application.lan,
      "FAILED",
      JSON.stringify({
        error: error.message || "BUREAU_API_TECHNICAL_FAILURE",
      }),
    );

    return {
      status: "FAILED",
      technicalReason: "BUREAU_API_TECHNICAL_FAILURE",
    };
  }
}

async function loadApplication(applicationId) {
  const [[application]] = await db
    .promise()
    .query(`SELECT * FROM pl_partner_applications WHERE id = ? LIMIT 1`, [
      applicationId,
    ]);

  return application || null;
}

async function persistBreSnapshot(applicationId, stage, result) {
  /*
   * PRE_APPROVAL and FINAL_APPROVAL write to non-overlapping columns.
   * FINAL_APPROVAL must never touch bre_status/bre_decision_stage/bre_credit_limit —
   * those are FINAL_APPROVAL's own precondition (it checks bre_status === 'APPROVED'
   * to confirm PRE_APPROVAL happened). Overwriting them on every call would make a
   * second FINAL_APPROVAL call (a retry, or a corrected offer) incorrectly see
   * "PRE_APPROVAL never happened" once the first FINAL_APPROVAL had already run.
   */
  if (stage === "PRE_APPROVAL") {
    await db.promise().query(
      `
      UPDATE pl_partner_applications
      SET
        bre_policy_version = ?,
        bre_decision_stage = ?,
        bre_status = ?,
        bre_reason = ?,
        bre_credit_limit = ?,
        bre_checked_at = NOW(),
        bre_details_json = ?
      WHERE id = ?
      `,
      [
        result.policyVersion,
        stage,
        result.decision,
        result.reason,
        result.creditLimit,
        safeJson(result),
        applicationId,
      ],
    );
    return;
  }

  await db.promise().query(
    `
    UPDATE pl_partner_applications
    SET
      bre_final_status = ?,
      bre_final_reason = ?,
      bre_gross_approved_amount = ?,
      bre_approved_loan_amount = ?,
      bre_checked_at = NOW(),
      bre_details_json = ?
    WHERE id = ?
    `,
    [
      result.decision,
      result.reason,
      result.grossApprovedLoanAmount,
      result.approvedLoanAmount,
      safeJson(result),
      applicationId,
    ],
  );
}

function buildBaseResult() {
  return {
    policyVersion: POLICY_VERSION,
    decision: "APPROVED",
    reason: null,
    reasons: [],
    creditLimit: null,
    grossApprovedLoanAmount: null,
    approvedLoanAmount: null, // net, after PF + GST deduction
    disbursalBreakup: null,
    age: null,
    newCustomer: null,
    aml: null,
    bureau: null,
    rules: createInitialRules(),
  };
}

async function runPreApproval(application) {
  const reasons = [];
  const result = buildBaseResult();
  const rules = result.rules;

  //   const aml = await runAml();
  //   result.aml = aml;

  //   const amlRejected = aml.status !== "PROCEED";

  //   rules.AML_CHECK_RPM = rule(!amlRejected, amlRejected ? "AML_REJECT" : null, aml);

  //   if (amlRejected) {
  //     addReason(reasons, "AML_REJECT");
  //     result.decision = "REJECTED";
  //     result.reason = reasons[0];
  //     result.reasons = reasons;
  //     return result;
  //   }

  //   const loanAmountResult = validateLoanAmount(application.requested_amount);
  //   addReason(reasons, loanAmountResult.reason);

  //   rules.LOAN_AMOUNT_CHECK_RPM = rule(loanAmountResult.passed, loanAmountResult.reason, {
  //     requestedLoanAmount: loanAmountResult.amount,
  //     minimumLoanAmount: POLICY.MIN_LOAN_AMOUNT,
  //     maximumLoanAmount: POLICY.MAX_LOAN_AMOUNT,
  //     requiredMultiple: POLICY.LOAN_AMOUNT_MULTIPLE,
  //   });

  //   // Always a new customer for now — see the file header comment.
  //   const newCustomer = true;
  //   const age = calculateAge(application.date_of_birth, new Date());
  //   const creditLimit = POLICY.FIRST_TIME_CUSTOMER_LIMIT;
  //   const requestedLoanAmount = Number(application.requested_amount);
  //   const limitAdjusted = requestedLoanAmount > creditLimit;

  //   rules.FIRST_TIME_LIMIT_CHECK_RPM = rule(true, null, {
  //     applicable: true,
  //     requestedLoanAmount,
  //     assignedCreditLimit: creditLimit,
  //     limitAdjusted,
  //     adjustmentReason: limitAdjusted
  //       ? "REQUESTED_AMOUNT_CAPPED_TO_FIRST_TIME_LIMIT"
  //       : null,
  //   });

  //   rules.REPEAT_LIMIT_CHECK_RPM = rule(true, null, { applicable: false });
  //   rules.REPEAT_AGE_CAP_CHECK_RPM = rule(true, null, { applicable: false });

  //   rules.CREDIT_LIMIT_CHECK_RPM = rule(true, null, {
  //     creditLimit,
  //     requestedLoanAmount,
  //     newCustomer,
  //     limitAdjusted,
  //   });

  //   // Do not call the bureau if the application already fails mandatory input/limit
  //   // rules — avoids an unnecessary (and, once live, paid) CIBIL pull for an
  //   // application that's rejected regardless of what the bureau report says.
  //   if (reasons.length) {
  //     result.creditLimit = creditLimit;
  //     result.approvedLoanAmount = null;
  //     result.age = age;
  //     result.newCustomer = newCustomer;
  //     result.decision = "REJECTED";
  //     result.reason = reasons[0];
  //     result.reasons = reasons;
  //     return result;
  //   }

  //   const bureau = await runBureau(application);

  //   if (bureau.technicalReason) {
  //     result.creditLimit = creditLimit;
  //     result.age = age;
  //     result.newCustomer = newCustomer;
  //     result.decision = "TECHNICAL_FAILURE";
  //     result.reason = bureau.technicalReason;
  //     result.reasons = [bureau.technicalReason];
  //     result.bureau = { status: bureau.status };
  //     return result;
  //   }

  //   result.bureau = bureau;

  //   const bureauScoreMissing = bureau.score === null || bureau.score === undefined;
  //   const bureauScoreBelowMinimum =
  //     !bureauScoreMissing && Number(bureau.score) < POLICY.MIN_BUREAU_SCORE;

  //   if (bureauScoreMissing) addReason(reasons, "BUREAU_SCORE_MISSING");
  //   if (bureauScoreBelowMinimum) addReason(reasons, "BUREAU_SCORE_BELOW_MINIMUM");

  //   rules.BUREAU_SCORE_CHECK_RPM = rule(
  //     !bureauScoreMissing && !bureauScoreBelowMinimum,
  //     bureauScoreMissing
  //       ? "BUREAU_SCORE_MISSING"
  //       : bureauScoreBelowMinimum
  //         ? "BUREAU_SCORE_BELOW_MINIMUM"
  //         : null,
  //     { bureauScore: bureau.score, minimumRequiredScore: POLICY.MIN_BUREAU_SCORE },
  //   );

  //   if (bureau.hasDualPan) addReason(reasons, "DUAL_PAN_FOUND_IN_BUREAU");

  //   rules.DUAL_PAN_CHECK_RPM = rule(
  //     !bureau.hasDualPan,
  //     bureau.hasDualPan ? "DUAL_PAN_FOUND_IN_BUREAU" : null,
  //     { panCount: bureau.panCount },
  //   );

  //   const enquiries30Days = Number(bureau.enquiries30Days || 0);
  //   const enquiriesFailed = enquiries30Days >= POLICY.ENQUIRY_REJECT_FROM_30_DAYS;

  //   if (enquiriesFailed) addReason(reasons, "ENQUIRIES_ABOVE_POLICY_LIMIT_LAST_30_DAYS");

  //   rules.ENQUIRIES_30D_CHECK_RPM = rule(
  //     !enquiriesFailed,
  //     enquiriesFailed ? "ENQUIRIES_ABOVE_POLICY_LIMIT_LAST_30_DAYS" : null,
  //     {
  //       enquiriesLast30Days: enquiries30Days,
  //       maximumAllowedExclusive: POLICY.ENQUIRY_REJECT_FROM_30_DAYS,
  //     },
  //   );

  //   const totalOverdueAmount = Number(bureau.totalOverdueAmount || 0);
  //   const overdueFailed = totalOverdueAmount >= POLICY.OVERDUE_REJECT_FROM;

  //   if (overdueFailed) addReason(reasons, "OVERDUE_AMOUNT_ABOVE_POLICY_LIMIT");

  //   rules.OVERDUE_AMOUNT_CHECK_RPM = rule(
  //     !overdueFailed,
  //     overdueFailed ? "OVERDUE_AMOUNT_ABOVE_POLICY_LIMIT" : null,
  //     { totalOverdueAmount, maximumAllowedExclusive: POLICY.OVERDUE_REJECT_FROM },
  //   );

  //   if (bureau.hasGt30DpdLast3Months) addReason(reasons, "DPD_ABOVE_POLICY_LIMIT_LAST_3_MONTHS");

  //   rules.DPD_30_LAST_3M_CHECK_RPM = rule(
  //     !bureau.hasGt30DpdLast3Months,
  //     bureau.hasGt30DpdLast3Months ? "DPD_ABOVE_POLICY_LIMIT_LAST_3_MONTHS" : null,
  //     {
  //       maximumObservedDpd: bureau.maxDpdLast3Months,
  //       rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_3_MONTHS,
  //     },
  //   );

  //   if (bureau.hasGt60DpdLast9Months) addReason(reasons, "DPD_ABOVE_POLICY_LIMIT_LAST_9_MONTHS");

  //   rules.DPD_60_LAST_9M_CHECK_RPM = rule(
  //     !bureau.hasGt60DpdLast9Months,
  //     bureau.hasGt60DpdLast9Months ? "DPD_ABOVE_POLICY_LIMIT_LAST_9_MONTHS" : null,
  //     {
  //       maximumObservedDpd: bureau.maxDpdLast9Months,
  //       rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_9_MONTHS,
  //     },
  //   );

  //   if (bureau.hasGt90DpdLast12Months) addReason(reasons, "DPD_ABOVE_POLICY_LIMIT_LAST_12_MONTHS");

  //   rules.DPD_90_LAST_12M_CHECK_RPM = rule(
  //     !bureau.hasGt90DpdLast12Months,
  //     bureau.hasGt90DpdLast12Months ? "DPD_ABOVE_POLICY_LIMIT_LAST_12_MONTHS" : null,
  //     {
  //       maximumObservedDpd: bureau.maxDpdLast12Months,
  //       rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_12_MONTHS,
  //     },
  //   );

  //   const unsecuredAggregate = Number(bureau.unsecuredAggregate || 0);
  //   const unsecuredAggregationFailed =
  //     newCustomer && unsecuredAggregate < POLICY.MIN_UNSECURED_AGGREGATE;

  //   if (unsecuredAggregationFailed) {
  //     addReason(reasons, "UNSECURED_TRADELINE_AGGREGATE_BELOW_POLICY_MINIMUM");
  //   }

  //   rules.UNSECURED_AGGREGATION_CHECK_RPM = rule(
  //     !unsecuredAggregationFailed,
  //     unsecuredAggregationFailed
  //       ? "UNSECURED_TRADELINE_AGGREGATE_BELOW_POLICY_MINIMUM"
  //       : null,
  //     {
  //       applicable: newCustomer,
  //       unsecuredAggregate,
  //       minimumRequiredAggregate: POLICY.MIN_UNSECURED_AGGREGATE,
  //     },
  //   );

  //   result.creditLimit = creditLimit;
  //   result.approvedLoanAmount = null; // finalized only at FINAL_APPROVAL
  //   result.age = age;
  //   result.newCustomer = newCustomer;
  //   result.decision = reasons.length ? "REJECTED" : "APPROVED";
  //   result.reason = reasons[0] || null;
  //   result.reasons = reasons;

  //   return result;
  // }

  const aml = await runTrackwizzAml(application);

  result.aml = {
    status: aml.status,
    score: aml.score,
    totalMatches: aml.totalMatches,
    reason: aml.reason,
    source: aml.source,
  };

  /*
   * Technical TrackWizz/API problem is NOT a business AML rejection.
   */
  if (aml.technicalReason) {
    rules.AML_CHECK_RPM = rule(false, aml.technicalReason, result.aml);

    result.decision = "TECHNICAL_FAILURE";
    result.reason = aml.technicalReason;
    result.reasons = [aml.technicalReason];

    return result;
  }

  /*
   * Same policy as Switch My Loan:
   *
   * PROCEED + 0 matches => pass
   * REVIEW             => reject
   * STOP               => reject
   * Any AML match      => reject
   */
  const hasAmlHit =
    Number.isFinite(Number(aml.totalMatches)) && Number(aml.totalMatches) > 0;

  const amlRejected =
    hasAmlHit || aml.status === "REVIEW" || aml.status === "STOP";

  if (amlRejected) {
    addReason(reasons, AML_REJECT_REASON);

    rules.AML_CHECK_RPM = rule(false, AML_REJECT_REASON, {
      ...result.aml,
      hasAmlHit,
      rejectedByStatus: aml.status === "REVIEW" || aml.status === "STOP",
    });

    result.decision = "REJECTED";
    result.reason = AML_REJECT_REASON;
    result.reasons = [AML_REJECT_REASON];

    return result;
  }

  if (aml.status !== "PROCEED") {
    rules.AML_CHECK_RPM = rule(false, "AML_STATUS_INVALID", result.aml);

    result.decision = "TECHNICAL_FAILURE";
    result.reason = "AML_STATUS_INVALID";
    result.reasons = ["AML_STATUS_INVALID"];

    return result;
  }

  rules.AML_CHECK_RPM = rule(true, null, {
    ...result.aml,
    hasAmlHit: false,
  });

  const loanAmountResult = validateLoanAmount(application.requested_amount);
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

  // PL Partner currently has no repeat-customer signal.
  const newCustomer = true;
  const age = calculateAge(application.date_of_birth, new Date());
  const creditLimit = POLICY.FIRST_TIME_CUSTOMER_LIMIT;
  const requestedLoanAmount = Number(application.requested_amount);
  const limitAdjusted = requestedLoanAmount > creditLimit;

  rules.FIRST_TIME_LIMIT_CHECK_RPM = rule(true, null, {
    applicable: true,
    requestedLoanAmount,
    assignedCreditLimit: creditLimit,
    limitAdjusted,
    adjustmentReason: limitAdjusted
      ? "REQUESTED_AMOUNT_CAPPED_TO_FIRST_TIME_LIMIT"
      : null,
  });
  rules.REPEAT_LIMIT_CHECK_RPM = rule(true, null, { applicable: false });
  rules.REPEAT_AGE_CAP_CHECK_RPM = rule(true, null, { applicable: false });
  rules.CREDIT_LIMIT_CHECK_RPM = rule(true, null, {
    creditLimit,
    requestedLoanAmount,
    newCustomer,
    limitAdjusted,
  });

  if (reasons.length) {
    result.creditLimit = creditLimit;
    result.approvedLoanAmount = null;
    result.age = age;
    result.newCustomer = newCustomer;
    result.decision = "REJECTED";
    result.reason = reasons[0];
    result.reasons = reasons;
    return result;
  }

  const bureau = await runBureau(application);

  if (bureau.technicalReason) {
    result.creditLimit = creditLimit;
    result.age = age;
    result.newCustomer = newCustomer;
    result.decision = "TECHNICAL_FAILURE";
    result.reason = bureau.technicalReason;
    result.reasons = [bureau.technicalReason];
    result.bureau = { status: bureau.status };
    return result;
  }

  result.bureau = bureau;

  const bureauScoreMissing =
    bureau.score === null || bureau.score === undefined;
  const bureauScoreBelowMinimum =
    !bureauScoreMissing && Number(bureau.score) < POLICY.MIN_BUREAU_SCORE;

  if (bureauScoreMissing) addReason(reasons, "BUREAU_SCORE_MISSING");
  if (bureauScoreBelowMinimum) {
    addReason(reasons, "BUREAU_SCORE_BELOW_MINIMUM");
  }

  rules.BUREAU_SCORE_CHECK_RPM = rule(
    !bureauScoreMissing && !bureauScoreBelowMinimum,
    bureauScoreMissing
      ? "BUREAU_SCORE_MISSING"
      : bureauScoreBelowMinimum
        ? "BUREAU_SCORE_BELOW_MINIMUM"
        : null,
    {
      bureauScore: bureau.score,
      minimumRequiredScore: POLICY.MIN_BUREAU_SCORE,
    },
  );

  if (bureau.hasDualPan) addReason(reasons, "DUAL_PAN_FOUND_IN_BUREAU");
  rules.DUAL_PAN_CHECK_RPM = rule(
    !bureau.hasDualPan,
    bureau.hasDualPan ? "DUAL_PAN_FOUND_IN_BUREAU" : null,
    { panCount: bureau.panCount },
  );

  const enquiries30Days = Number(bureau.enquiries30Days || 0);
  const enquiriesFailed = enquiries30Days >= POLICY.ENQUIRY_REJECT_FROM_30_DAYS;
  if (enquiriesFailed) {
    addReason(reasons, "ENQUIRIES_ABOVE_POLICY_LIMIT_LAST_30_DAYS");
  }
  rules.ENQUIRIES_30D_CHECK_RPM = rule(
    !enquiriesFailed,
    enquiriesFailed ? "ENQUIRIES_ABOVE_POLICY_LIMIT_LAST_30_DAYS" : null,
    {
      enquiriesLast30Days: enquiries30Days,
      maximumAllowedExclusive: POLICY.ENQUIRY_REJECT_FROM_30_DAYS,
    },
  );

  const totalOverdueAmount = Number(bureau.totalOverdueAmount || 0);
  const overdueFailed = totalOverdueAmount >= POLICY.OVERDUE_REJECT_FROM;
  if (overdueFailed) addReason(reasons, "OVERDUE_AMOUNT_ABOVE_POLICY_LIMIT");
  rules.OVERDUE_AMOUNT_CHECK_RPM = rule(
    !overdueFailed,
    overdueFailed ? "OVERDUE_AMOUNT_ABOVE_POLICY_LIMIT" : null,
    { totalOverdueAmount, maximumAllowedExclusive: POLICY.OVERDUE_REJECT_FROM },
  );

  if (bureau.hasGt30DpdLast3Months) {
    addReason(reasons, "DPD_ABOVE_POLICY_LIMIT_LAST_3_MONTHS");
  }

  rules.DPD_30_LAST_3M_CHECK_RPM = rule(
    !bureau.hasGt30DpdLast3Months,
    bureau.hasGt30DpdLast3Months
      ? "DPD_ABOVE_POLICY_LIMIT_LAST_3_MONTHS"
      : null,
    {
      maximumObservedDpd: bureau.maxDpdLast3Months,
      rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_3_MONTHS,
    },
  );

  if (bureau.hasGt60DpdLast9Months) {
    addReason(reasons, "DPD_ABOVE_POLICY_LIMIT_LAST_9_MONTHS");
  }

  rules.DPD_60_LAST_9M_CHECK_RPM = rule(
    !bureau.hasGt60DpdLast9Months,
    bureau.hasGt60DpdLast9Months
      ? "DPD_ABOVE_POLICY_LIMIT_LAST_9_MONTHS"
      : null,
    {
      maximumObservedDpd: bureau.maxDpdLast9Months,
      rejectWhenAbove: POLICY.DPD_REJECT_ABOVE_LAST_9_MONTHS,
    },
  );

  if (bureau.hasGt90DpdLast12Months) {
    addReason(reasons, "DPD_ABOVE_POLICY_LIMIT_LAST_12_MONTHS");
  }

  rules.DPD_90_LAST_12M_CHECK_RPM = rule(
    !bureau.hasGt90DpdLast12Months,
    bureau.hasGt90DpdLast12Months
      ? "DPD_ABOVE_POLICY_LIMIT_LAST_12_MONTHS"
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
    addReason(reasons, "UNSECURED_TRADELINE_AGGREGATE_BELOW_POLICY_MINIMUM");
  }
  rules.UNSECURED_AGGREGATION_CHECK_RPM = rule(
    !unsecuredAggregationFailed,
    unsecuredAggregationFailed
      ? "UNSECURED_TRADELINE_AGGREGATE_BELOW_POLICY_MINIMUM"
      : null,
    {
      applicable: newCustomer,
      unsecuredAggregate,
      minimumRequiredAggregate: POLICY.MIN_UNSECURED_AGGREGATE,
    },
  );

  result.creditLimit = creditLimit;
  result.approvedLoanAmount = null;
  result.age = age;
  result.newCustomer = newCustomer;
  result.decision = reasons.length ? "REJECTED" : "APPROVED";
  result.reason = reasons[0] || null;
  result.reasons = reasons;

  return result;
}

async function runFinalApproval(application) {
  const reasons = [];
  const result = buildBaseResult();
  const rules = result.rules;

  if (application.bre_status !== "APPROVED") {
    result.decision = "REJECTED";
    result.reason = "PRE_APPROVAL_NOT_COMPLETED";
    result.reasons = ["PRE_APPROVAL_NOT_COMPLETED"];
    return result;
  }

  const creditLimit = Number(application.bre_credit_limit);
  const selectedOfferAmount = Number(application.selected_offer_amount);

  result.creditLimit = Number.isFinite(creditLimit) ? creditLimit : null;
  result.age = application.date_of_birth
    ? calculateAge(application.date_of_birth, new Date())
    : null;
  result.newCustomer = true;

  const selectedOfferValid =
    Number.isFinite(selectedOfferAmount) &&
    selectedOfferAmount > 0 &&
    Number.isFinite(creditLimit) &&
    selectedOfferAmount <= creditLimit;

  if (!selectedOfferValid) {
    addReason(reasons, "SELECTED_OFFER_EXCEEDS_CREDIT_LIMIT");
  }

  rules.SELECTED_OFFER_CHECK_RPM = rule(
    selectedOfferValid,
    selectedOfferValid ? null : "SELECTED_OFFER_EXCEEDS_CREDIT_LIMIT",
    {
      selectedOfferAmount: Number.isFinite(selectedOfferAmount)
        ? selectedOfferAmount
        : null,
      creditLimit: Number.isFinite(creditLimit) ? creditLimit : null,
    },
  );

  let disbursalBreakup = null;

  if (selectedOfferValid) {
    // application.processing_fee is stored as a percentage number (e.g. 2.0000
    // for 2%, per the partner's format) — calculateNetDisbursalAmount expects
    // a 0-1 fraction, so convert here at the point of use.
    const processingFeeRate =
      application.processing_fee === null ||
      application.processing_fee === undefined
        ? null
        : Number(application.processing_fee) / 100;

    disbursalBreakup = calculateNetDisbursalAmount({
      creditLimit: selectedOfferAmount,
      processingFeeRate,
    });

    if (!disbursalBreakup.ok) {
      addReason(
        reasons,
        disbursalBreakup.reason || "NET_DISBURSAL_AMOUNT_INVALID",
      );
    }
  }

  rules.PROCESSING_FEE_CHECK_RPM = rule(
    selectedOfferValid && Boolean(disbursalBreakup?.ok),
    !selectedOfferValid
      ? null // already covered by SELECTED_OFFER_CHECK_RPM
      : disbursalBreakup?.ok
        ? null
        : disbursalBreakup?.reason || "NET_DISBURSAL_AMOUNT_INVALID",
    disbursalBreakup || { applicable: selectedOfferValid },
  );

  result.decision = reasons.length ? "REJECTED" : "APPROVED";
  result.reason = reasons[0] || null;
  result.reasons = reasons;
  result.disbursalBreakup = disbursalBreakup;
  result.grossApprovedLoanAmount =
    result.decision === "APPROVED" ? selectedOfferAmount : null;
  result.approvedLoanAmount =
    result.decision === "APPROVED" ? disbursalBreakup.netDisbursalAmount : null;

  return result;
}

async function runPlPartnerBre(applicationInput, { phase }) {
  if (!applicationInput?.id) {
    throw new Error("A PL partner application with an id is required");
  }

  if (phase !== "PRE_APPROVAL" && phase !== "FINAL_APPROVAL") {
    throw new Error(`Invalid BRE phase: ${phase}`);
  }

  const application = await loadApplication(applicationInput.id);

  if (!application) {
    throw new Error(`PL partner application not found: ${applicationInput.id}`);
  }

  const result =
    phase === "PRE_APPROVAL"
      ? await runPreApproval(application)
      : await runFinalApproval(application);

  await persistBreSnapshot(application.id, phase, result);

  return result;
}

module.exports = {
  runPlPartnerBre,
  POLICY_VERSION,
};
