const db = require("../../config/db");

const {
  runBureau,
} = require("../../services/Bueraupullapiservice");

const {
  screenLoanBooking,
} = require("../../services/trackwizz/screeningService");


/*
 * ============================================================
 * SAME POLICY AS RAPID MONEY
 * ============================================================
 *
 * Change only this path if your rapidMoneyPolicy.js
 * is located somewhere else.
 */
const {
  POLICY,
  calculateAge,
  validateLoanAmount,
  isNewCustomer,
  calculateRepeatCreditLimit,
  parseBureauReport,
} = require("../switchMyLoan/rapidMoneyPolicy");


/*
 * ============================================================
 * QUICK MONEY CONFIG
 * ============================================================
 */

const QUICK_MONEY_TABLE =
  "loan_booking_quick_money";

/*
 * IMPORTANT:
 *
 * Your screeningService must support this product.
 *
 * If screeningService currently only knows:
 * switch_my_loan
 *
 * you need to add QuickMoney mapping there.
 */
const AML_SCREENING_PRODUCT =
  "quick_money";

const AML_REJECT_REASON =
  "AML REJECT";

const TRACKWIZZ_AML_STATUSES =
  new Set([
    "PROCEED",
    "REVIEW",
    "STOP",
  ]);


/*
 * ============================================================
 * ENVIRONMENT
 * ============================================================
 */

const DEPLOYMENT_ENV = String(
  process.env.DEPLOYMENT_ENV ||
    process.env.NODE_ENV ||
    "development",
)
  .trim()
  .toLowerCase();

const AML_MODE = String(
  process.env.AML_MODE || "",
)
  .trim()
  .toLowerCase();

const BUREAU_MODE = String(
  process.env.BUREAU_MODE || "",
)
  .trim()
  .toLowerCase();

const VALID_SERVICE_MODES =
  new Set([
    "live",
    "mock-clear",
  ]);


if (
  !VALID_SERVICE_MODES.has(
    AML_MODE,
  )
) {
  throw new Error(
    `Invalid AML_MODE "${AML_MODE}". Expected live or mock-clear.`,
  );
}


if (
  !VALID_SERVICE_MODES.has(
    BUREAU_MODE,
  )
) {
  throw new Error(
    `Invalid BUREAU_MODE "${BUREAU_MODE}". Expected live or mock-clear.`,
  );
}


if (
  DEPLOYMENT_ENV ===
    "production" &&
  (
    AML_MODE !== "live" ||
    BUREAU_MODE !== "live"
  )
) {
  throw new Error(
    "AML/Bureau bypass is not permitted in production",
  );
}


/*
 * Same business policy.
 *
 * We can still give QuickMoney its own audit label.
 */
const POLICY_VERSION =
  "QUICK_MONEY_RAPID_POLICY_2026_07";


/*
 * ============================================================
 * COMMON HELPERS
 * ============================================================
 */

function safeJson(value) {
  try {
    return JSON.stringify(
      value,
    );
  } catch {
    return JSON.stringify({
      serialization_error:
        true,
    });
  }
}


function rule(
  passed,
  reason = null,
  derivedValues = {},
  executed = true,
) {
  return {
    executed,
    passed,
    reason,
    derived_values:
      derivedValues,
  };
}


function addReason(
  reasons,
  reasonValue,
) {
  if (
    reasonValue &&
    !reasons.includes(
      reasonValue,
    )
  ) {
    reasons.push(
      reasonValue,
    );
  }
}


function splitName(
  fullName,
) {
  const parts = String(
    fullName || "",
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    first_name:
      parts[0] || "",

    middle_name:
      parts.length > 2
        ? parts
            .slice(1, -1)
            .join(" ")
        : "",

    last_name:
      parts.length > 1
        ? parts[
            parts.length - 1
          ]
        : parts[0] || "",
  };
}


/*
 * ============================================================
 * INITIAL BRE RULES
 * ============================================================
 *
 * We keep RPM rule names because the business policy
 * and partner response contract are the same.
 */

function createInitialRules() {
  return {
    AML_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),

    LOAN_AMOUNT_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),

    FIRST_TIME_LIMIT_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),

    REPEAT_LIMIT_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),

    REPEAT_AGE_CAP_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),

    BUREAU_SCORE_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),

    DUAL_PAN_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),

    ENQUIRIES_30D_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),

    OVERDUE_AMOUNT_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),

    DPD_30_LAST_3M_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),

    DPD_60_LAST_9M_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),

    DPD_90_LAST_12M_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),

    UNSECURED_AGGREGATION_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),

    CREDIT_LIMIT_CHECK_RPM:
      rule(
        false,
        null,
        {},
        false,
      ),
  };
}


/*
 * ============================================================
 * SAVE QUICK MONEY BRE SNAPSHOT
 * ============================================================
 */

async function updateBookingBreSnapshot(
  lan,
  result,
) {
  const bureau =
    result?.bureau || {};

  const dualPanValue =
    bureau.hasDualPan === true
      ? 1
      : bureau.hasDualPan === false
        ? 0
        : null;

  await db.promise().query(
    `
    UPDATE loan_booking_quick_money
    SET
      qm_policy_version = ?,
      qm_bre_checked_at = NOW(),
      qm_bre_status = ?,
      qm_bre_reason = ?,
      qm_bre_details_json = ?,

      qm_age = ?,
      qm_credit_limit = ?,

      qm_unsecured_total = ?,
      qm_unsecured_count = ?,

      qm_secured_total = ?,
      qm_secured_count = ?,

      qm_bureau_score = ?,
      qm_pan_count = ?,
      qm_dual_pan_found = ?,
      qm_enquiries_30d = ?,
      qm_total_overdue_amount = ?,
      qm_max_dpd_3m = ?,
      qm_max_dpd_9m = ?,
      qm_max_dpd_12m = ?

    WHERE lan = ?
    `,
    [
      result?.policyVersion ||
        POLICY_VERSION,

      result?.decision ||
        null,

      result?.reason ||
        null,

      safeJson(
        result,
      ),

      result?.age ??
        null,

      result?.creditLimit ??
        null,

      bureau.unsecuredAggregate ??
        null,

      bureau.unsecuredTradelineCount ??
        null,

      bureau.securedAggregate ??
        null,

      bureau.securedTradelineCount ??
        null,

      bureau.score ??
        null,

      bureau.panCount ??
        null,

      dualPanValue,

      bureau.enquiries30Days ??
        null,

      bureau.totalOverdueAmount ??
        null,

      bureau.maxDpdLast3Months ??
        null,

      bureau.maxDpdLast9Months ??
        null,

      bureau.maxDpdLast12Months ??
        null,

      lan,
    ],
  );
}


/*
 * ============================================================
 * BUREAU HELPERS
 * ============================================================
 */

function serializeBureauResponse(
  response,
) {
  if (
    response === null ||
    response === undefined
  ) {
    return null;
  }

  return typeof response ===
    "string"
    ? response
    : JSON.stringify(
        response,
      );
}


function deserializeBureauResponse(
  response,
) {
  if (
    !response ||
    typeof response !==
      "string"
  ) {
    return response ||
      null;
  }

  const value =
    response.trim();

  if (
    (
      value.startsWith(
        "{",
      ) &&
      value.endsWith(
        "}",
      )
    ) ||
    (
      value.startsWith(
        "[",
      ) &&
      value.endsWith(
        "]",
      )
    )
  ) {
    try {
      return JSON.parse(
        value,
      );
    } catch {
      return response;
    }
  }

  return response;
}


async function setBureauStatus(
  lan,
  status,
  response = null,
) {
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
    [
      status,
      response,
      lan,
    ],
  );
}


function cleanText(
  value,
) {
  return String(
    value || "",
  ).trim();
}


function normalizeDbString(
  value,
  maxLength,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  return text.slice(
    0,
    maxLength,
  );
}


/*
 * ============================================================
 * SAVE CIBIL REPORT
 * ============================================================
 */

async function saveLoanCibilReport({
  loan,
  score = null,
  response = null,
  sourceApplicantId = null,
  insertOnlyIfMissing = false,
}) {
  const reportXml =
    serializeBureauResponse(
      response,
    );

  if (
    !loan?.lan ||
    reportXml === null ||
    reportXml === undefined ||
    reportXml === ""
  ) {
    return;
  }

  const applicantType =
    "BORROWER";

  const partyNo = 1;


  if (
    insertOnlyIfMissing
  ) {
    const [existingRows] =
      await db.promise().query(
        `
        SELECT id
        FROM loan_cibil_reports
        WHERE lan = ?
          AND applicant_type = ?
          AND party_no = ?
        ORDER BY id DESC
        LIMIT 1
        `,
        [
          loan.lan,
          applicantType,
          partyNo,
        ],
      );

    if (
      existingRows.length
    ) {
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
    VALUES
    (
      ?, ?, ?, ?, 0,
      ?, ?, ?, NOW()
    )
    `,
    [
      normalizeDbString(
        loan.lan,
        50,
      ),

      normalizeDbString(
        loan.pan_number,
        15,
      ),

      normalizeDbString(
        score,
        10,
      ),

      reportXml,

      applicantType,

      partyNo,

      sourceApplicantId ||
        null,
    ],
  );
}


/*
 * ============================================================
 * STATE / PINCODE HELPERS
 * ============================================================
 */

function isValidStateValue(
  value,
) {
  const state =
    cleanText(
      value,
    ).toUpperCase();

  return Boolean(
    state &&
      state !== "NA" &&
      state !== "N/A" &&
      state !== "NULL" &&
      state !==
        "UNDEFINED",
  );
}


function extractPincode(
  value,
) {
  const text =
    cleanText(
      value,
    );

  if (!text) {
    return "";
  }

  const match =
    text.match(
      /\b[1-9][0-9]{5}\b/,
    );

  return match
    ? match[0]
    : "";
}


function getLoanPincode(
  loan,
) {
  return (
    extractPincode(
      loan.current_address_pincode,
    ) ||
    extractPincode(
      loan.address_pincode,
    ) ||
    extractPincode(
      loan.pincode,
    ) ||
    extractPincode(
      loan.pin_code,
    ) ||
    extractPincode(
      loan.current_pincode,
    ) ||
    extractPincode(
      loan.current_address_line_1,
    ) ||
    extractPincode(
      loan.address_line_1,
    ) ||
    extractPincode(
      loan.current_address,
    ) ||
    extractPincode(
      loan.address,
    ) ||
    ""
  );
}


function getLoanStateFromDb(
  loan,
) {
  const state =
    loan.current_address_state ||
    loan.address_state ||
    loan.state ||
    "";

  return isValidStateValue(
    state,
  )
    ? cleanText(
        state,
      )
    : "";
}


async function fetchStateFromPincode(
  pincode,
) {
  const cleanPincode =
    extractPincode(
      pincode,
    );

  if (!cleanPincode) {
    return null;
  }

  try {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        5000,
      );

    const response =
      await fetch(
        `https://api.postalpincode.in/pincode/${cleanPincode}`,
        {
          method:
            "GET",

          signal:
            controller.signal,
        },
      );

    clearTimeout(
      timeout,
    );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    const result =
      Array.isArray(
        data,
      )
        ? data[0]
        : null;

    const postOffice =
      Array.isArray(
        result?.PostOffice,
      )
        ? result
            .PostOffice[0]
        : null;

    const state =
      postOffice?.State;

    return isValidStateValue(
      state,
    )
      ? cleanText(
          state,
        )
      : null;
  } catch (error) {
    console.error(
      "[QUICKMONEY BRE] Failed to fetch state from pincode",
      {
        pincode:
          cleanPincode,

        message:
          error.message,
      },
    );

    return null;
  }
}


async function resolveStateForBureau(
  loan,
) {
  const stateFromDb =
    getLoanStateFromDb(
      loan,
    );

  if (stateFromDb) {
    return stateFromDb;
  }

  const pincode =
    getLoanPincode(
      loan,
    );

  if (!pincode) {
    console.warn(
      "[QUICKMONEY BRE] State and pincode missing for bureau",
      {
        lan:
          loan.lan,
      },
    );

    return "";
  }

  const stateFromPincode =
    await fetchStateFromPincode(
      pincode,
    );

  if (
    stateFromPincode
  ) {
    console.log(
      "[QUICKMONEY BRE] State resolved from pincode",
      {
        lan:
          loan.lan,

        pincode,

        state:
          stateFromPincode,
      },
    );

    return stateFromPincode;
  }

  console.warn(
    "[QUICKMONEY BRE] Could not resolve state from pincode",
    {
      lan:
        loan.lan,

      pincode,
    },
  );

  return "";
}


/*
 * ============================================================
 * DISBURSAL CALCULATION
 * ============================================================
 */

const GST_ON_PROCESSING_FEE_RATE =
  0.18;


function toNumberOrNull(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(
      String(value)
        .replace(
          /,/g,
          "",
        )
        .trim(),
    );

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}


function roundMoney(
  value,
) {
  return (
    Math.round(
      (
        Number(
          value || 0,
        ) +
        Number.EPSILON
      ) *
        100,
    ) / 100
  );
}


function calculateNetDisbursalAmount({
  creditLimit,
  processingFeeRate,
  gstRate =
    GST_ON_PROCESSING_FEE_RATE,
}) {
  const grossApprovedAmount =
    toNumberOrNull(
      creditLimit,
    );

  const pfRate =
    toNumberOrNull(
      processingFeeRate,
    );

  const gst =
    toNumberOrNull(
      gstRate,
    ) ??
    GST_ON_PROCESSING_FEE_RATE;


  if (
    !Number.isFinite(
      grossApprovedAmount,
    ) ||
    grossApprovedAmount <=
      0
  ) {
    return {
      ok:
        false,

      reason:
        "INVALID_GROSS_APPROVED_AMOUNT",

      grossApprovedAmount:
        grossApprovedAmount ??
        0,

      processingFeeRate:
        pfRate ?? 0,

      processingFeeAmount:
        0,

      gstRate:
        gst,

      gstOnProcessingFee:
        0,

      totalDeduction:
        0,

      netDisbursalAmount:
        null,
    };
  }


  /*
   * DB format:
   *
   * 0.15 = 15%
   * 0.12 = 12%
   */
  if (
    !Number.isFinite(
      pfRate,
    ) ||
    pfRate < 0 ||
    pfRate > 1
  ) {
    return {
      ok:
        false,

      reason:
        "INVALID_PROCESSING_FEE_RATE",

      grossApprovedAmount,

      processingFeeRate:
        pfRate ?? 0,

      processingFeeAmount:
        0,

      gstRate:
        gst,

      gstOnProcessingFee:
        0,

      totalDeduction:
        0,

      netDisbursalAmount:
        null,
    };
  }


  const processingFeeAmount =
    roundMoney(
      grossApprovedAmount *
        pfRate,
    );


  const gstOnProcessingFee =
    roundMoney(
      processingFeeAmount *
        gst,
    );


  const totalDeduction =
    roundMoney(
      processingFeeAmount +
        gstOnProcessingFee,
    );


  const netDisbursalAmount =
    roundMoney(
      grossApprovedAmount -
        totalDeduction,
    );


  if (
    !Number.isFinite(
      netDisbursalAmount,
    ) ||
    netDisbursalAmount <= 0
  ) {
    return {
      ok:
        false,

      reason:
        "NET_DISBURSAL_AMOUNT_INVALID",

      grossApprovedAmount,

      processingFeeRate:
        pfRate,

      processingFeePercent:
        roundMoney(
          pfRate * 100,
        ),

      processingFeeAmount,

      gstRate:
        gst,

      gstPercent:
        roundMoney(
          gst * 100,
        ),

      gstOnProcessingFee,

      totalDeduction,

      netDisbursalAmount,
    };
  }


  return {
    ok:
      true,

    reason:
      null,

    grossApprovedAmount,

    processingFeeRate:
      pfRate,

    processingFeePercent:
      roundMoney(
        pfRate * 100,
      ),

    processingFeeAmount,

    gstRate:
      gst,

    gstPercent:
      roundMoney(
        gst * 100,
      ),

    gstOnProcessingFee,

    totalDeduction,

    netDisbursalAmount,
  };
}


/*
 * ============================================================
 * BUREAU
 * ============================================================
 */

async function runOrReuseBureau(
  loan,
) {
  const pool =
    db.promise();


  /*
   * ==========================================================
   * UAT MOCK
   * ==========================================================
   */

  if (
    BUREAU_MODE ===
    "mock-clear"
  ) {
    console.warn(
      "[QUICKMONEY BRE] Bureau bypassed in test mode",
      {
        lan:
          loan.lan,

        deploymentEnvironment:
          DEPLOYMENT_ENV,
      },
    );

    return {
      status:
        "VERIFIED",

      source:
        "TEST_BYPASS",

      bypassed:
        true,

      reportId:
        null,

      reportDate:
        null,

      score:
        750,

      panCount:
        1,

      hasDualPan:
        false,

      enquiryBreakdown30Days:
        {
          total:
            0,

          credit:
            0,

          nonCredit:
            0,

          source:
            "TEST_BYPASS",
        },

      enquiries30Days:
        0,

      totalOverdueAmount:
        0,

      maxDpdLast3Months:
        0,

      maxDpdLast9Months:
        0,

      maxDpdLast12Months:
        0,

      hasGt30DpdLast3Months:
        false,

      hasGt60DpdLast9Months:
        false,

      hasGt90DpdLast12Months:
        false,

      unsecuredAggregate:
        250000,

      unsecuredTradelineCount:
        2,

      securedAggregate:
        0,

      securedTradelineCount:
        0,

      totalTradelines:
        2,

      unmappedAccountTypeCodes:
        [],
    };
  }


  /*
   * ==========================================================
   * CHECK EXISTING BUREAU
   * ==========================================================
   */

  const [kycRows] =
    await pool.query(
      `
      SELECT
        id,
        bureau_status,
        bureau_api_response
      FROM kyc_verification_status
      WHERE lan = ?
        AND applicant_type = 'BORROWER'
        AND party_no = 1
      LIMIT 1
      `,
      [
        loan.lan,
      ],
    );


  const existingKyc =
    kycRows[0] ||
    null;


  /*
   * ==========================================================
   * REUSE VERIFIED BUREAU
   * ==========================================================
   */

  if (
    existingKyc?.bureau_status ===
      "VERIFIED" &&
    existingKyc?.bureau_api_response
  ) {
    const parsed =
      parseBureauReport(
        deserializeBureauResponse(
          existingKyc.bureau_api_response,
        ),
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
        status:
          "FAILED",

        technicalReason:
          "BUREAU_PARSE_FAILED",
      };
    }


    try {
      await saveLoanCibilReport({
        loan,

        score:
          parsed.score,

        response:
          existingKyc.bureau_api_response,

        sourceApplicantId:
          existingKyc.id,

        insertOnlyIfMissing:
          true,
      });
    } catch (error) {
      console.error(
        "[QUICKMONEY BRE] Failed to save reused bureau report",
        {
          lan:
            loan.lan,

          message:
            error.message,
        },
      );

      return {
        status:
          "FAILED",

        technicalReason:
          "BUREAU_REPORT_SAVE_FAILED",
      };
    }


    return {
      status:
        "VERIFIED",

      ...parsed,

      source:
        "REUSED_REPORT",
    };
  }


  /*
   * ==========================================================
   * INITIATE BUREAU
   * ==========================================================
   */

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
    VALUES
    (
      ?,
      'BORROWER',
      1,
      ?,
      ?,
      ?,
      'INITIATED',
      NULL
    )

    ON DUPLICATE KEY UPDATE
      applicant_name =
        VALUES(applicant_name),

      mobile_number =
        VALUES(mobile_number),

      pan_number =
        VALUES(pan_number),

      bureau_status =
        'INITIATED',

      bureau_api_response =
        NULL,

      updated_at =
        NOW()
    `,
    [
      loan.lan,

      loan.customer_name ||
        null,

      loan.mobile ||
        null,

      loan.pan_number ||
        null,
    ],
  );


  const [[currentKyc]] =
    await pool.query(
      `
      SELECT id
      FROM kyc_verification_status
      WHERE lan = ?
        AND applicant_type = 'BORROWER'
        AND party_no = 1
      LIMIT 1
      `,
      [
        loan.lan,
      ],
    );


  const currentKycId =
    currentKyc?.id ||
    existingKyc?.id ||
    null;


  try {
    const resolvedStateForBureau =
      await resolveStateForBureau(
        loan,
      );


    const resolvedPincodeForBureau =
      getLoanPincode(
        loan,
      );


    if (
      !resolvedStateForBureau
    ) {
      await setBureauStatus(
        loan.lan,
        "FAILED",
        safeJson({
          error:
            "BUREAU_STATE_MISSING",

          pincode:
            resolvedPincodeForBureau ||
            null,
        }),
      );

      return {
        status:
          "FAILED",

        technicalReason:
          "BUREAU_STATE_MISSING",
      };
    }


    /*
     * ========================================================
     * CALL BUREAU API
     * ========================================================
     */

    const bureauResult =
      await runBureau({
        ...splitName(
          loan.customer_name,
        ),

        dob:
          loan.dob,

        gender:
          loan.gender,

        current_address:
          loan.current_address_line_1 ||
          loan.address_line_1 ||
          "",

        current_village_city:
          loan.current_address_city ||
          loan.address_city ||
          loan.city ||
          "",

        current_state:
          resolvedStateForBureau,

        current_pincode:
          resolvedPincodeForBureau,

        mobile_number:
          loan.mobile,

        pan_number:
          loan.pan_number,

        loan_amount:
          loan.loan_amount,

        loan_tenure:
          loan.tenure,
      });


    const responseToStore =
      serializeBureauResponse(
        bureauResult?.response,
      );


    if (
      !bureauResult?.success ||
      !bureauResult?.response
    ) {
      await setBureauStatus(
        loan.lan,
        "FAILED",
        responseToStore,
      );

      return {
        status:
          "FAILED",

        technicalReason:
          "BUREAU_API_TECHNICAL_FAILURE",
      };
    }


    const parsed =
      parseBureauReport(
        bureauResult.response,
        null,
        "NEW_PULL",
      );


    if (!parsed.ok) {
      await setBureauStatus(
        loan.lan,
        "FAILED",
        responseToStore,
      );

      return {
        status:
          "FAILED",

        technicalReason:
          "BUREAU_PARSE_FAILED",
      };
    }


    try {
      await saveLoanCibilReport({
        loan,

        score:
          parsed.score,

        response:
          responseToStore,

        sourceApplicantId:
          currentKycId,
      });
    } catch (error) {
      console.error(
        "[QUICKMONEY BRE] Failed to save new bureau report",
        {
          lan:
            loan.lan,

          message:
            error.message,
        },
      );


      await setBureauStatus(
        loan.lan,
        "FAILED",
        safeJson({
          error:
            "BUREAU_REPORT_SAVE_FAILED",

          message:
            error.message,
        }),
      );


      return {
        status:
          "FAILED",

        technicalReason:
          "BUREAU_REPORT_SAVE_FAILED",
      };
    }


    await setBureauStatus(
      loan.lan,
      "VERIFIED",
      responseToStore,
    );


    return {
      status:
        "VERIFIED",

      ...parsed,

      source:
        "NEW_PULL",
    };
  } catch (error) {
    const safeError =
      JSON.stringify({
        error:
          error.message ||
          "BUREAU_API_TECHNICAL_FAILURE",
      });


    await setBureauStatus(
      loan.lan,
      "FAILED",
      safeError,
    );


    return {
      status:
        "FAILED",

      technicalReason:
        "BUREAU_API_TECHNICAL_FAILURE",
    };
  }
}


/*
 * ============================================================
 * TRACKWIZZ AML
 * ============================================================
 */

async function runTrackwizzAml(
  loan,
) {
  try {
    /*
     * ========================================================
     * UAT MOCK
     * ========================================================
     */

    if (
      AML_MODE ===
      "mock-clear"
    ) {
      console.warn(
        "[QUICKMONEY BRE] AML bypassed in test mode",
        {
          lan:
            loan.lan,

          deploymentEnvironment:
            DEPLOYMENT_ENV,
        },
      );

      return {
        status:
          "PROCEED",

        score:
          100,

        totalMatches:
          0,

        reason:
          null,

        source:
          "TEST_BYPASS",

        bypassed:
          true,
      };
    }


    /*
     * ========================================================
     * LIVE TRACKWIZZ SCREENING
     * ========================================================
     */

    const screening =
      await screenLoanBooking(
        AML_SCREENING_PRODUCT,
        loan.lan,
      );


    /*
     * screenLoanBooking should save AML result
     * into QuickMoney table.
     */
    const [[amlRow]] =
      await db.promise().query(
        `
        SELECT
          aml_status,
          aml_score,
          aml_total_matches,
          aml_reason
        FROM loan_booking_quick_money
        WHERE lan = ?
        ORDER BY id DESC
        LIMIT 1
        `,
        [
          loan.lan,
        ],
      );


    const status =
      String(
        screening?.amlStatus ||
          amlRow?.aml_status ||
          "",
      )
        .trim()
        .toUpperCase();


    const providerReason =
      String(
        screening?.amlReason ||
          amlRow?.aml_reason ||
          "",
      ).trim() ||
      null;


    const score =
      toNumberOrNull(
        amlRow?.aml_score,
      );


    const totalMatches =
      toNumberOrNull(
        amlRow?.aml_total_matches,
      );


    if (
      !TRACKWIZZ_AML_STATUSES.has(
        status,
      )
    ) {
      return {
        status:
          status ||
          "ERROR",

        score,

        totalMatches,

        reason:
          providerReason,

        source:
          "TRACKWIZZ",

        technicalReason:
          "AML_STATUS_INVALID",
      };
    }


    return {
      status,

      score,

      totalMatches,

      reason:
        providerReason,

      source:
        "TRACKWIZZ",

      technicalReason:
        null,
    };
  } catch (error) {
    console.error(
      "[QUICKMONEY BRE] TrackWizz AML failed",
      {
        lan:
          loan.lan,

        message:
          error.message,
      },
    );


    return {
      status:
        "ERROR",

      score:
        null,

      totalMatches:
        null,

      reason:
        "AML_TECHNICAL_FAILURE",

      source:
        "TRACKWIZZ",

      technicalReason:
        "AML_TECHNICAL_FAILURE",
    };
  }
}


/*
 * ============================================================
 * MAIN QUICK MONEY BRE
 * ============================================================
 */

async function runQuickMoneyBRE(
  data,
) {
  /*
   * ==========================================================
   * LAN REQUIRED
   * ==========================================================
   */

  if (!data?.lan) {
    return {
      policyVersion:
        POLICY_VERSION,

      decision:
        "TECHNICAL_FAILURE",

      reason:
        "LAN_MISSING",

      reasons: [
        "LAN_MISSING",
      ],

      creditLimit:
        null,

      age:
        null,

      newCustomer:
        null,

      aml:
        null,

      amlScore:
        null,

      bureau:
        null,

      rules:
        createInitialRules(),
    };
  }


  /*
   * ==========================================================
   * RELOAD QUICK MONEY LOAN FROM DB
   * ==========================================================
   */

  const [[storedLoan]] =
    await db.promise().query(
      `
      SELECT *
      FROM loan_booking_quick_money
      WHERE lan = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [
        data.lan,
      ],
    );


  const loan =
    storedLoan ||
    data;


  const reasons =
    [];


  const rules =
    createInitialRules();


  const result = {
    policyVersion:
      POLICY_VERSION,

    decision:
      "APPROVED",

    reason:
      null,

    reasons,

    creditLimit:
      null,

    requestedLoanAmount:
      null,

    approvedLoanAmount:
      null,

    grossApprovedLoanAmount:
      null,

    disbursalBreakup:
      null,

    limitAdjusted:
      false,

    age:
      null,

    newCustomer:
      null,

    aml:
      null,

    amlScore:
      null,

    bureau:
      null,

    rules,
  };


  /*
   * ==========================================================
   * AML
   * ==========================================================
   */

  const aml =
    await runTrackwizzAml(
      loan,
    );


  result.aml = {
    status:
      aml.status,

    score:
      aml.score,

    totalMatches:
      aml.totalMatches,

    reason:
      aml.reason,

    source:
      aml.source,

    bypassed:
      aml.bypassed === true,
  };


  result.amlScore =
    aml.score;


  /*
   * ==========================================================
   * AML TECHNICAL FAILURE
   * ==========================================================
   */

  if (
    aml.technicalReason
  ) {
    rules.AML_CHECK_RPM =
      rule(
        false,
        aml.technicalReason,
        result.aml,
      );


    result.decision =
      "TECHNICAL_FAILURE";

    result.reason =
      aml.technicalReason;

    result.reasons = [
      aml.technicalReason,
    ];


    await updateBookingBreSnapshot(
      loan.lan,
      result,
    );


    return result;
  }


  /*
   * ==========================================================
   * AML REJECT
   * ==========================================================
   */

  const hasAmlHit =
    Number.isFinite(
      Number(
        aml.totalMatches,
      ),
    ) &&
    Number(
      aml.totalMatches,
    ) > 0;


  const amlRejected =
    hasAmlHit ||
    aml.status ===
      "REVIEW" ||
    aml.status ===
      "STOP";


  if (amlRejected) {
    addReason(
      reasons,
      AML_REJECT_REASON,
    );


    rules.AML_CHECK_RPM =
      rule(
        false,
        AML_REJECT_REASON,
        {
          ...result.aml,

          hasAmlHit,

          rejectedByStatus:
            aml.status ===
              "REVIEW" ||
            aml.status ===
              "STOP",
        },
      );


    result.decision =
      "REJECTED";

    result.reason =
      AML_REJECT_REASON;

    result.reasons = [
      AML_REJECT_REASON,
    ];


    await updateBookingBreSnapshot(
      loan.lan,
      result,
    );


    return result;
  }


  /*
   * Only PROCEED passes.
   */

  if (
    aml.status !==
    "PROCEED"
  ) {
    rules.AML_CHECK_RPM =
      rule(
        false,
        "AML_STATUS_INVALID",
        result.aml,
      );


    result.decision =
      "TECHNICAL_FAILURE";

    result.reason =
      "AML_STATUS_INVALID";

    result.reasons = [
      "AML_STATUS_INVALID",
    ];


    await updateBookingBreSnapshot(
      loan.lan,
      result,
    );


    return result;
  }


  rules.AML_CHECK_RPM =
    rule(
      true,
      null,
      {
        ...result.aml,
        hasAmlHit:
          false,
      },
    );


  /*
   * ==========================================================
   * NEW / REPEAT CUSTOMER
   * ==========================================================
   */

  const rawTotalDisbursed =
    loan.total_disbursed_applications;


  const totalDisbursed =
    Number(
      rawTotalDisbursed ??
        0,
    );


  if (
    rawTotalDisbursed !==
      null &&
    rawTotalDisbursed !==
      undefined &&
    (
      !Number.isInteger(
        totalDisbursed,
      ) ||
      totalDisbursed < 0
    )
  ) {
    addReason(
      reasons,
      "TOTAL_DISBURSED_APPLICATIONS_INVALID",
    );
  }


  const newCustomer =
    isNewCustomer(
      totalDisbursed,
    );


  const age =
    calculateAge(
      loan.dob,
      new Date(),
    );


  /*
   * ==========================================================
   * LOAN AMOUNT
   * ==========================================================
   */

  const loanAmountResult =
    validateLoanAmount(
      loan.loan_amount,
    );


  addReason(
    reasons,
    loanAmountResult.reason,
  );


  rules.LOAN_AMOUNT_CHECK_RPM =
    rule(
      loanAmountResult.passed,

      loanAmountResult.reason,

      {
        requestedLoanAmount:
          loanAmountResult.amount,

        minimumLoanAmount:
          POLICY.MIN_LOAN_AMOUNT,

        maximumLoanAmount:
          POLICY.MAX_LOAN_AMOUNT,

        requiredMultiple:
          POLICY.LOAN_AMOUNT_MULTIPLE,
      },
    );


  /*
   * ==========================================================
   * CREDIT LIMIT
   * ==========================================================
   */

  let creditLimit =
    null;


  let repeatLimitDetails =
    null;


  /*
   * ==========================================================
   * NEW CUSTOMER
   * ==========================================================
   */

  if (newCustomer) {
    creditLimit =
      POLICY.FIRST_TIME_CUSTOMER_LIMIT;


    const firstTimeLimitAdjusted =
      Number(
        loan.loan_amount,
      ) >
      POLICY.FIRST_TIME_CUSTOMER_LIMIT;


    rules.FIRST_TIME_LIMIT_CHECK_RPM =
      rule(
        true,
        null,
        {
          applicable:
            true,

          requestedLoanAmount:
            Number(
              loan.loan_amount,
            ),

          assignedCreditLimit:
            POLICY.FIRST_TIME_CUSTOMER_LIMIT,

          limitAdjusted:
            firstTimeLimitAdjusted,

          adjustmentReason:
            firstTimeLimitAdjusted
              ? "REQUESTED_AMOUNT_CAPPED_TO_FIRST_TIME_LIMIT"
              : null,
        },
      );


    rules.REPEAT_LIMIT_CHECK_RPM =
      rule(
        true,
        null,
        {
          applicable:
            false,
        },
      );


    rules.REPEAT_AGE_CAP_CHECK_RPM =
      rule(
        true,
        null,
        {
          applicable:
            false,
        },
      );
  }

  /*
   * ==========================================================
   * REPEAT CUSTOMER
   * ==========================================================
   */
  else {
    rules.FIRST_TIME_LIMIT_CHECK_RPM =
      rule(
        true,
        null,
        {
          applicable:
            false,
        },
      );


    if (
      age ===
      null
    ) {
      addReason(
        reasons,
        "AGE_MISSING_OR_INVALID_FOR_REPEAT_CUSTOMER",
      );
    }


    if (
      !loan.previous_loan_amount ||
      Number(
        loan.previous_loan_amount,
      ) <= 0
    ) {
      addReason(
        reasons,
        "PREVIOUS_LOAN_AMOUNT_MISSING_FOR_REPEAT_CUSTOMER",
      );
    }


    repeatLimitDetails =
      calculateRepeatCreditLimit(
        totalDisbursed,

        loan.previous_loan_amount,

        age,
      );


    creditLimit =
      repeatLimitDetails.creditLimit;


    if (
      !creditLimit ||
      creditLimit <
        POLICY.MIN_LOAN_AMOUNT
    ) {
      addReason(
        reasons,
        "REPEAT_CUSTOMER_CREDIT_LIMIT_BELOW_MINIMUM_LOAN",
      );
    }


    rules.REPEAT_LIMIT_CHECK_RPM =
      rule(
        Boolean(
          creditLimit &&
            creditLimit >=
              POLICY.MIN_LOAN_AMOUNT,
        ),

        !creditLimit ||
          creditLimit <
            POLICY.MIN_LOAN_AMOUNT
          ? "REPEAT_CUSTOMER_CREDIT_LIMIT_BELOW_MINIMUM_LOAN"
          : null,

        {
          applicable:
            true,

          previousLoanAmount:
            Number(
              loan.previous_loan_amount ||
                0,
            ),

          repeatLoanCount:
            totalDisbursed,

          multiplier:
            repeatLimitDetails.multiplier,

          rawLimit:
            repeatLimitDetails.rawLimit,

          cappedLimit:
            repeatLimitDetails.cappedLimit,

          roundedLimit:
            repeatLimitDetails.roundedLimit,

          maximumPolicyCap:
            POLICY.MAX_REPEAT_CUSTOMER_LIMIT,
        },
      );


    const ageCapApplicable =
      age !== null &&
      age < 28;


    const ageCapAdjusted =
      ageCapApplicable &&
      Number(
        loan.loan_amount,
      ) >
        POLICY.REPEAT_CUSTOMER_UNDER_28_LIMIT;


    rules.REPEAT_AGE_CAP_CHECK_RPM =
      rule(
        true,
        null,
        {
          applicable:
            ageCapApplicable,

          age,

          requestedLoanAmount:
            Number(
              loan.loan_amount,
            ),

          maximumAllowedAmount:
            POLICY.REPEAT_CUSTOMER_UNDER_28_LIMIT,

          ageCapApplied:
            repeatLimitDetails.ageCapApplied,

          limitAdjusted:
            ageCapAdjusted,

          adjustmentReason:
            ageCapAdjusted
              ? "REQUESTED_AMOUNT_CAPPED_TO_UNDER_28_LIMIT"
              : null,
        },
      );
  }


  /*
   * ==========================================================
   * APPROVED AMOUNT
   * ==========================================================
   */

  const requestedLoanAmount =
    Number(
      loan.loan_amount,
    );


  const numericCreditLimit =
    Number(
      creditLimit,
    );


  const validCreditLimit =
    Number.isFinite(
      numericCreditLimit,
    ) &&
    numericCreditLimit >=
      POLICY.MIN_LOAN_AMOUNT;


  /*
   * Requested amount above limit is capped, not rejected.
   */
  const grossApprovedLoanAmount =
    validCreditLimit
      ? Math.min(
          requestedLoanAmount,
          numericCreditLimit,
        )
      : null;


  /*
   * Deduct PF + GST.
   */
  const disbursalBreakup =
    grossApprovedLoanAmount !==
    null
      ? calculateNetDisbursalAmount({
          creditLimit:
            grossApprovedLoanAmount,

          processingFeeRate:
            loan.processing_fee,
        })
      : null;


  if (!validCreditLimit) {
    addReason(
      reasons,
      "CREDIT_LIMIT_COULD_NOT_BE_CALCULATED",
    );
  }


  if (
    validCreditLimit &&
    !disbursalBreakup?.ok
  ) {
    addReason(
      reasons,

      disbursalBreakup?.reason ||
        "NET_DISBURSAL_AMOUNT_INVALID",
    );
  }


  const approvedLoanAmount =
    disbursalBreakup?.ok
      ? disbursalBreakup.netDisbursalAmount
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


  result.grossApprovedLoanAmount =
    grossApprovedLoanAmount;


  result.limitAdjusted =
    limitAdjusted;


  result.disbursalBreakup =
    disbursalBreakup;


  const creditLimitRulePassed =
    validCreditLimit &&
    Boolean(
      disbursalBreakup?.ok,
    );


  const creditLimitRuleReason =
    !validCreditLimit
      ? "CREDIT_LIMIT_COULD_NOT_BE_CALCULATED"
      : !disbursalBreakup?.ok
        ? disbursalBreakup?.reason ||
          "NET_DISBURSAL_AMOUNT_INVALID"
        : null;


  rules.CREDIT_LIMIT_CHECK_RPM =
    rule(
      creditLimitRulePassed,

      creditLimitRuleReason,

      {
        creditLimit:
          validCreditLimit
            ? numericCreditLimit
            : null,

        requestedLoanAmount,

        grossApprovedLoanAmount,

        approvedLoanAmount,

        netDisbursalAmount:
          approvedLoanAmount,

        processingFeeRate:
          disbursalBreakup
            ?.processingFeeRate ??
          0,

        processingFeePercent:
          disbursalBreakup
            ?.processingFeePercent ??
          0,

        processingFeeAmount:
          disbursalBreakup
            ?.processingFeeAmount ??
          0,

        gstRate:
          disbursalBreakup
            ?.gstRate ??
          GST_ON_PROCESSING_FEE_RATE,

        gstPercent:
          disbursalBreakup
            ?.gstPercent ??
          18,

        gstOnProcessingFee:
          disbursalBreakup
            ?.gstOnProcessingFee ??
          0,

        totalDeduction:
          disbursalBreakup
            ?.totalDeduction ??
          0,

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
            ?.multiplier ??
          null,

        ageCapApplied:
          repeatLimitDetails
            ?.ageCapApplied ??
          false,
      },
    );


  result.decision =
    reasons.length
      ? "REJECTED"
      : "APPROVED";


  result.reason =
    reasons[0] ||
    null;


  result.reasons =
    reasons;


  result.age =
    age;


  result.newCustomer =
    newCustomer;


  /*
   * ==========================================================
   * DON'T CALL BUREAU IF BASIC POLICY ALREADY FAILED
   * ==========================================================
   */

  if (
    reasons.length
  ) {
    await updateBookingBreSnapshot(
      loan.lan,
      result,
    );

    return result;
  }


  /*
   * ==========================================================
   * BUREAU
   * ==========================================================
   */

  const bureau =
    await runOrReuseBureau(
      loan,
    );


  if (
    bureau.technicalReason
  ) {
    result.decision =
      "TECHNICAL_FAILURE";

    result.reason =
      bureau.technicalReason;

    result.reasons = [
      bureau.technicalReason,
    ];

    result.bureau = {
      status:
        bureau.status,
    };


    await updateBookingBreSnapshot(
      loan.lan,
      result,
    );


    return result;
  }


  result.bureau = {
    status:
      bureau.status,

    source:
      bureau.source,

    bypassed:
      bureau.bypassed ===
      true,

    reportId:
      bureau.reportId ??
      null,

    score:
      bureau.score,

    panCount:
      bureau.panCount,

    hasDualPan:
      bureau.hasDualPan,

    reportDate:
      bureau.reportDate ||
      null,

    enquiryBreakdown30Days:
      bureau.enquiryBreakdown30Days ||
      null,

    enquiries30Days:
      bureau.enquiries30Days,

    totalOverdueAmount:
      bureau.totalOverdueAmount,

    maxDpdLast3Months:
      bureau.maxDpdLast3Months,

    maxDpdLast9Months:
      bureau.maxDpdLast9Months,

    maxDpdLast12Months:
      bureau.maxDpdLast12Months,

    hasGt30DpdLast3Months:
      bureau.hasGt30DpdLast3Months,

    hasGt60DpdLast9Months:
      bureau.hasGt60DpdLast9Months,

    hasGt90DpdLast12Months:
      bureau.hasGt90DpdLast12Months,

    unsecuredAggregate:
      bureau.unsecuredAggregate,

    unsecuredTradelineCount:
      bureau.unsecuredTradelineCount,

    securedAggregate:
      bureau.securedAggregate,

    securedTradelineCount:
      bureau.securedTradelineCount,

    totalTradelines:
      bureau.totalTradelines,

    unmappedAccountTypeCodes:
      bureau.unmappedAccountTypeCodes ||
      [],
  };


  /*
   * ==========================================================
   * BUREAU SCORE
   * ==========================================================
   */

  const bureauScoreMissing =
    bureau.score ===
      null ||
    bureau.score ===
      undefined;


  const bureauScoreBelowMinimum =
    !bureauScoreMissing &&
    Number(
      bureau.score,
    ) <
      POLICY.MIN_BUREAU_SCORE;


  if (
    bureauScoreMissing
  ) {
    addReason(
      reasons,
      "BUREAU_SCORE_MISSING",
    );
  }


  if (
    bureauScoreBelowMinimum
  ) {
    addReason(
      reasons,
      "BUREAU_SCORE_BELOW_650",
    );
  }


  rules.BUREAU_SCORE_CHECK_RPM =
    rule(
      !bureauScoreMissing &&
        !bureauScoreBelowMinimum,

      bureauScoreMissing
        ? "BUREAU_SCORE_MISSING"
        : bureauScoreBelowMinimum
          ? "BUREAU_SCORE_BELOW_650"
          : null,

      {
        bureauScore:
          bureau.score,

        minimumRequiredScore:
          POLICY.MIN_BUREAU_SCORE,
      },
    );


  /*
   * ==========================================================
   * DUAL PAN
   * ==========================================================
   */

  if (
    bureau.hasDualPan
  ) {
    addReason(
      reasons,
      "DUAL_PAN_FOUND_IN_BUREAU",
    );
  }


  rules.DUAL_PAN_CHECK_RPM =
    rule(
      !bureau.hasDualPan,

      bureau.hasDualPan
        ? "DUAL_PAN_FOUND_IN_BUREAU"
        : null,

      {
        panCount:
          bureau.panCount,
      },
    );


  /*
   * ==========================================================
   * ENQUIRIES 30 DAYS
   * ==========================================================
   */

  const enquiries30Days =
    Number(
      bureau.enquiries30Days ||
        0,
    );


  const enquiriesFailed =
    enquiries30Days >=
    POLICY.ENQUIRY_REJECT_FROM_30_DAYS;


  if (
    enquiriesFailed
  ) {
    addReason(
      reasons,
      "ENQUIRIES_GTE_5_LAST_30_DAYS",
    );
  }


  rules.ENQUIRIES_30D_CHECK_RPM =
    rule(
      !enquiriesFailed,

      enquiriesFailed
        ? "ENQUIRIES_GTE_5_LAST_30_DAYS"
        : null,

      {
        enquiriesLast30Days:
          enquiries30Days,

        maximumAllowedExclusive:
          POLICY.ENQUIRY_REJECT_FROM_30_DAYS,
      },
    );


  /*
   * ==========================================================
   * OVERDUE
   * ==========================================================
   */

  const totalOverdueAmount =
    Number(
      bureau.totalOverdueAmount ||
        0,
    );


  const overdueFailed =
    totalOverdueAmount >=
    POLICY.OVERDUE_REJECT_FROM;


  if (
    overdueFailed
  ) {
    addReason(
      reasons,
      "OVERDUE_AMOUNT_GTE_1000",
    );
  }


  rules.OVERDUE_AMOUNT_CHECK_RPM =
    rule(
      !overdueFailed,

      overdueFailed
        ? "OVERDUE_AMOUNT_GTE_1000"
        : null,

      {
        totalOverdueAmount,

        maximumAllowedExclusive:
          POLICY.OVERDUE_REJECT_FROM,
      },
    );


  /*
   * ==========================================================
   * DPD 3 MONTHS
   * ==========================================================
   */

  if (
    bureau.hasGt30DpdLast3Months
  ) {
    addReason(
      reasons,
      "DPD_GT_30_LAST_3_MONTHS",
    );
  }


  rules.DPD_30_LAST_3M_CHECK_RPM =
    rule(
      !bureau.hasGt30DpdLast3Months,

      bureau.hasGt30DpdLast3Months
        ? "DPD_GT_30_LAST_3_MONTHS"
        : null,

      {
        maximumObservedDpd:
          bureau.maxDpdLast3Months,

        rejectWhenAbove:
          POLICY.DPD_REJECT_ABOVE_LAST_3_MONTHS,
      },
    );


  /*
   * ==========================================================
   * DPD 9 MONTHS
   * ==========================================================
   */

  if (
    bureau.hasGt60DpdLast9Months
  ) {
    addReason(
      reasons,
      "DPD_GT_60_LAST_9_MONTHS",
    );
  }


  rules.DPD_60_LAST_9M_CHECK_RPM =
    rule(
      !bureau.hasGt60DpdLast9Months,

      bureau.hasGt60DpdLast9Months
        ? "DPD_GT_60_LAST_9_MONTHS"
        : null,

      {
        maximumObservedDpd:
          bureau.maxDpdLast9Months,

        rejectWhenAbove:
          POLICY.DPD_REJECT_ABOVE_LAST_9_MONTHS,
      },
    );


  /*
   * ==========================================================
   * DPD 12 MONTHS
   * ==========================================================
   */

  if (
    bureau.hasGt90DpdLast12Months
  ) {
    addReason(
      reasons,
      "DPD_GT_90_LAST_12_MONTHS",
    );
  }


  rules.DPD_90_LAST_12M_CHECK_RPM =
    rule(
      !bureau.hasGt90DpdLast12Months,

      bureau.hasGt90DpdLast12Months
        ? "DPD_GT_90_LAST_12_MONTHS"
        : null,

      {
        maximumObservedDpd:
          bureau.maxDpdLast12Months,

        rejectWhenAbove:
          POLICY.DPD_REJECT_ABOVE_LAST_12_MONTHS,
      },
    );


  /*
   * ==========================================================
   * UNSECURED / SECURED AGGREGATION
   * ==========================================================
   */

  const unsecuredAggregate =
    Number(
      bureau.unsecuredAggregate ||
        0,
    );


  const securedAggregate =
    Number(
      bureau.securedAggregate ||
        0,
    );


  const unsecuredBelowMinimum =
    unsecuredAggregate <
    POLICY.MIN_UNSECURED_AGGREGATE;


  /*
   * If unsecured aggregate is low,
   * secured aggregate can be fallback.
   */
  const securedFallbackPassed =
    unsecuredBelowMinimum &&
    securedAggregate >=
      POLICY.MIN_SECURED_AGGREGATE;


  const unsecuredAggregationFailed =
    unsecuredBelowMinimum &&
    !securedFallbackPassed;


  if (
    unsecuredAggregationFailed
  ) {
    addReason(
      reasons,
      "UNSECURED_AND_SECURED_TRADELINE_AGGREGATE_BELOW_MINIMUM",
    );
  }


  rules.UNSECURED_AGGREGATION_CHECK_RPM =
    rule(
      !unsecuredAggregationFailed,

      unsecuredAggregationFailed
        ? "UNSECURED_AND_SECURED_TRADELINE_AGGREGATE_BELOW_MINIMUM"
        : null,

      {
        applicable:
          true,

        newCustomer,

        unsecuredAggregate,

        unsecuredTradelineCount:
          bureau.unsecuredTradelineCount,

        minimumRequiredUnsecuredAggregate:
          POLICY.MIN_UNSECURED_AGGREGATE,

        securedAggregate,

        securedTradelineCount:
          bureau.securedTradelineCount,

        minimumRequiredSecuredAggregate:
          POLICY.MIN_SECURED_AGGREGATE,

        securedFallbackApplied:
          unsecuredBelowMinimum,

        securedFallbackPassed,

        unmappedAccountTypeCodes:
          bureau.unmappedAccountTypeCodes ||
          [],
      },
    );


  /*
   * ==========================================================
   * FINAL DECISION
   * ==========================================================
   */

  result.decision =
    reasons.length
      ? "REJECTED"
      : "APPROVED";


  result.reason =
    reasons[0] ||
    null;


  result.reasons =
    reasons;


  /*
   * ==========================================================
   * SAVE QUICK MONEY BRE RESULT
   * ==========================================================
   */

  await updateBookingBreSnapshot(
    loan.lan,
    result,
  );


  return result;
}


/*
 * ============================================================
 * HELPERS EXPORT
 * ============================================================
 */

runQuickMoneyBRE.helpers = {
  safeJson,
  splitName,
  runTrackwizzAml,
  runOrReuseBureau,
  calculateNetDisbursalAmount,
};


/*
 * ============================================================
 * EXPORT
 * ============================================================
 */

module.exports =
  runQuickMoneyBRE;