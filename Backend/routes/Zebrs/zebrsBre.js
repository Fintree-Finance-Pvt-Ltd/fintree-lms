const db = require("../../config/db");
const { XMLParser } = require("fast-xml-parser");

const ZEBRS_LOAN_TABLE = "loan_booking_zebrs";

/**
 * ===========================================================
 * XML PARSER
 * ===========================================================
 */
const parser = new XMLParser({
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

/**
 * ===========================================================
 * COMMON HELPERS
 * ===========================================================
 */
const toArray = (value) => {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

const toNumber = (value, fallback = 0) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const parseDateYYYYMMDD = (value) => {
  if (!value || String(value).length !== 8) {
    return null;
  }

  const stringValue = String(value);

  const year = Number(stringValue.slice(0, 4));
  const month = Number(stringValue.slice(4, 6)) - 1;
  const day = Number(stringValue.slice(6, 8));

  const date = new Date(year, month, day);

  return Number.isNaN(date.getTime()) ? null : date;
};

const monthsDiff = (
  fromDate,
  toDate = new Date(),
) => {
  if (!fromDate) {
    return null;
  }

  return (
    (toDate.getFullYear() - fromDate.getFullYear()) *
      12 +
    (toDate.getMonth() - fromDate.getMonth())
  );
};

const calculateAge = (dob) => {
  if (!dob) {
    return null;
  }

  const birthDate = new Date(dob);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();

  let age =
    today.getFullYear() -
    birthDate.getFullYear();

  const monthDifference =
    today.getMonth() -
    birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 &&
      today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age;
};

const isNtcScore = (score) => {
  return score === null || score < 300;
};

const isOwnedResidence = (value) => {
  const normalizedValue = normalizeText(value).replace(
    /[_-]/g,
    " ",
  );

  const allowedValues = new Set([
    "OWN",
    "OWNED",
    "SELF OWN",
    "SELF OWNED",
    "FAMILY OWNED",
    "PARENTAL",
  ]);

  return allowedValues.has(normalizedValue);
};

/**
 * ===========================================================
 * EMPTY BUREAU FACTS
 * ===========================================================
 */
const getEmptyBureauFacts = (
  fallbackScore = null,
) => ({
  score: toNumber(fallbackScore, null),

  enquiries30d: 0,

  hasDpd6M: false,
  hasOverdue12M: false,
  hasWrittenOff3Y: false,
  has30Plus24M: false,
  has90Plus36M: false,

  emiOverdueAmount: 0,
  ccOverdueAmount: 0,

  bureauPans: [],
});

/**
 * ===========================================================
 * BUREAU EXTRACTION
 *
 * Supports:
 * 1. Dummy JSON bureau response.
 * 2. Actual Experian XML bureau report.
 * ===========================================================
 */
const extractZebrsBureauFacts = (
  reportPayload,
  fallbackScore = null,
) => {
  const emptyFacts =
    getEmptyBureauFacts(fallbackScore);

  if (!reportPayload) {
    return emptyFacts;
  }

  const rawPayload = String(
    reportPayload,
  ).trim();

  /**
   * ---------------------------------------------------------
   * DUMMY JSON BUREAU RESPONSE
   * ---------------------------------------------------------
   */
  if (
    rawPayload.startsWith("{") ||
    rawPayload.startsWith("[")
  ) {
    try {
      const parsedResponse =
        JSON.parse(rawPayload);

      const dummyScore =
        toNumber(parsedResponse?.score, null) ??
        toNumber(
          parsedResponse?.response?.score,
          null,
        ) ??
        toNumber(fallbackScore, null);

      const dummyPan = normalizeText(
        parsedResponse?.pan_number ||
          parsedResponse?.response?.pan_number,
      );

      return {
        ...emptyFacts,

        score: dummyScore,

        bureauPans: dummyPan
          ? [dummyPan]
          : [],
      };
    } catch (error) {
      console.error(
        "Unable to parse Zebrs dummy bureau JSON:",
        error.message,
      );

      return emptyFacts;
    }
  }

  /**
   * ---------------------------------------------------------
   * ACTUAL EXPERIAN XML RESPONSE
   * ---------------------------------------------------------
   */
  let json;

  try {
    json = parser.parse(rawPayload);
  } catch (error) {
    console.error(
      "Unable to parse Zebrs bureau XML:",
      error.message,
    );

    return emptyFacts;
  }

  const profile =
    json?.INProfileResponse || {};

  const score =
    toNumber(
      profile?.SCORE?.BureauScore,
      null,
    ) ??
    toNumber(
      profile?.Score?.BureauScore,
      null,
    ) ??
    toNumber(
      profile?.Score?.Value,
      null,
    ) ??
    toNumber(fallbackScore, null);

  const enquiries30d = toNumber(
    profile?.CAPS?.CAPS_Summary
      ?.CAPSLast30Days,
    0,
  );

  const accounts = toArray(
    profile?.CAIS_Account
      ?.CAIS_Account_DETAILS,
  );

  let hasDpd6M = false;
  let hasOverdue12M = false;
  let hasWrittenOff3Y = false;
  let has30Plus24M = false;
  let has90Plus36M = false;

  let emiOverdueAmount = 0;
  let ccOverdueAmount = 0;

  const bureauPanSet = new Set();
  const now = new Date();

  /**
   * Application PAN
   */
  const applicationPan = normalizeText(
    profile?.Current_Application
      ?.Current_Application_Details
      ?.Current_Applicant_Details
      ?.IncomeTaxPan,
  );

  if (applicationPan) {
    bureauPanSet.add(applicationPan);
  }

  for (const account of accounts) {
    const accountType = normalizeText(
      account?.Account_Type,
    );

    const portfolioType = normalizeText(
      account?.Portfolio_Type,
    );

    const accountStatus = normalizeText(
      account?.Account_Status,
    );

    /**
     * Collect PAN from bureau accounts
     */
    for (const holder of toArray(
      account?.CAIS_Holder_Details,
    )) {
      const pan = normalizeText(
        holder?.Income_TAX_PAN,
      );

      if (pan) {
        bureauPanSet.add(pan);
      }
    }

    for (const holderId of toArray(
      account?.CAIS_Holder_ID_Details,
    )) {
      const pan = normalizeText(
        holderId?.Income_TAX_PAN,
      );

      if (pan) {
        bureauPanSet.add(pan);
      }
    }

    /**
     * -------------------------------------------------------
     * WRITTEN-OFF STATUS DURING LAST 3 YEARS
     * -------------------------------------------------------
     */
    const writtenOffStatus = normalizeText(
      account?.Written_off_Settled_Status,
    );

    if (
      writtenOffStatus &&
      writtenOffStatus !== "99"
    ) {
      const writtenOffDate =
        parseDateYYYYMMDD(
          account?.WriteOffStatusDate,
        ) ||
        parseDateYYYYMMDD(
          account?.Date_Reported,
        );

      const writtenOffMonthsAgo =
        monthsDiff(writtenOffDate, now);

      if (
        writtenOffMonthsAgo === null ||
        (writtenOffMonthsAgo >= 0 &&
          writtenOffMonthsAgo < 36)
      ) {
        hasWrittenOff3Y = true;
      }
    }

    /**
     * Closed accounts
     */
    const isClosed =
      [
        "13",
        "14",
        "15",
        "16",
        "17",
      ].includes(accountStatus) ||
      Boolean(account?.Date_Closed);

    /**
     * -------------------------------------------------------
     * OVERDUE DURING LAST 12 MONTHS
     * -------------------------------------------------------
     */
    const amountPastDue = toNumber(
      account?.Amount_Past_Due,
      0,
    );

    const reportedDate =
      parseDateYYYYMMDD(
        account?.Date_Reported,
      );

    const reportedMonthsAgo =
      monthsDiff(reportedDate, now);

    if (
      !isClosed &&
      amountPastDue > 0 &&
      (reportedMonthsAgo === null ||
        (reportedMonthsAgo >= 0 &&
          reportedMonthsAgo < 12))
    ) {
      hasOverdue12M = true;
    }

    /**
     * Credit card identification:
     * Account type 10 or Portfolio R
     */
    const isCreditCard =
      accountType === "10" ||
      portfolioType === "R";

    if (!isClosed && amountPastDue > 0) {
      if (isCreditCard) {
        ccOverdueAmount += amountPastDue;
      } else {
        emiOverdueAmount += amountPastDue;
      }
    }

    /**
     * -------------------------------------------------------
     * DPD HISTORY
     * -------------------------------------------------------
     */
    for (const history of toArray(
      account?.CAIS_Account_History,
    )) {
      const year = toNumber(
        history?.Year,
        null,
      );

      const month = toNumber(
        history?.Month,
        null,
      );

      const daysPastDue = toNumber(
        history?.Days_Past_Due,
        0,
      );

      if (!year || !month) {
        continue;
      }

      const historyDate = new Date(
        year,
        month - 1,
        1,
      );

      const historyMonthsAgo =
        monthsDiff(historyDate, now);

      if (
        historyMonthsAgo === null ||
        historyMonthsAgo < 0
      ) {
        continue;
      }

      /**
       * No DPD during last 6 months
       */
      if (
        historyMonthsAgo < 6 &&
        daysPastDue > 0
      ) {
        hasDpd6M = true;
      }

      /**
       * No 30+ DPD during last 24 months
       */
      if (
        historyMonthsAgo < 24 &&
        daysPastDue >= 30
      ) {
        has30Plus24M = true;
      }

      /**
       * No 90+ DPD during last 36 months
       */
      if (
        historyMonthsAgo < 36 &&
        daysPastDue >= 90
      ) {
        has90Plus36M = true;
      }
    }
  }

  return {
    score,
    enquiries30d,

    hasDpd6M,
    hasOverdue12M,
    hasWrittenOff3Y,
    has30Plus24M,
    has90Plus36M,

    emiOverdueAmount,
    ccOverdueAmount,

    bureauPans: [
      ...bureauPanSet,
    ],
  };
};




/**
 * ===========================================================
 * ZEBRS POLICY EVALUATION
 * ===========================================================
 */
const evaluateZebrsPolicy = ({
  loan,
  bureauFacts,

}) => {
  const reasons = [];
  const deviations = [];
  const notes = [];

  const age = calculateAge(loan.dob);

  const score = toNumber(
    bureauFacts.score,
    null,
  );

  const loanAmount = toNumber(
    loan.requested_loan_amount ??
      loan.loan_amount,
    0,
  );

  const tenure = toNumber(
    loan.loan_tenure,
    0,
  );

  // const apr = toNumber(
  //   loan.apr,
  //   null,
  // );

 
  const loanPan = normalizeText(
    loan.pan_card ||
      loan.pan_number,
  );

  const bureauPans =
    Array.isArray(
      bureauFacts.bureauPans,
    )
      ? bureauFacts.bureauPans
      : [];

  /**
   * ---------------------------------------------------------
   * PAN CHECK
   * ---------------------------------------------------------
   */
  if (bureauPans.length > 1) {
    reasons.push(
      "MULTIPLE_PAN_IN_BUREAU",
    );
  }

  if (
    loanPan &&
    bureauPans.length === 1 &&
    bureauPans[0] !== loanPan
  ) {
    reasons.push(
      "BUREAU_PAN_MISMATCH",
    );
  }

  /**
   * ---------------------------------------------------------
   * AGE: MINIMUM 18, MAXIMUM 58
   * ---------------------------------------------------------
   */
  if (age === null) {
    reasons.push("AGE_MISSING");
  } else {
    if (age < 18) {
      reasons.push("AGE_BELOW_18");
    }

    if (age > 58) {
      reasons.push("AGE_ABOVE_58");
    }
  }

  /**
   * ---------------------------------------------------------
   * BUREAU SCORE
   *
   * Normal scored customer: minimum 680
   * NTC: portfolio maximum 10%
   * NTC: bank statement compulsory
   * NTC: owned residence compulsory
   * ---------------------------------------------------------
   */
  const isNtc = isNtcScore(score);

 if (isNtc) {
  notes.push("NTC_CASE");

   if (
    !isOwnedResidence(
      loan.residence_ownership,
    )
  ) {
    reasons.push(
      "NTC_RESIDENCE_NOT_OWNED",
    );
  }
} else if (score < 680) {
  reasons.push(
    "BUREAU_SCORE_BELOW_680",
  );
}

  /**
   * ---------------------------------------------------------
   * LOAN AMOUNT
   *
   * Minimum ₹50,000
   * Maximum ₹1,00,000
   * ---------------------------------------------------------
   */
  if (loanAmount < 50000) {
    reasons.push(
      "LOAN_AMOUNT_BELOW_50000",
    );
  }

  if (loanAmount > 100000) {
    reasons.push(
      "LOAN_AMOUNT_ABOVE_100000",
    );
  }

  /**
   * ---------------------------------------------------------
   * BUREAU SCREENING NORMS
   * ---------------------------------------------------------
   */

  // No DPD during last 6 months
  if (bureauFacts.hasDpd6M) {
    reasons.push(
      "DPD_FOUND_LAST_6_MONTHS",
    );
  }

  // No overdue during last 1 year
  if (bureauFacts.hasOverdue12M) {
    reasons.push(
      "OVERDUE_FOUND_LAST_12_MONTHS",
    );
  }

  // No written-off status during last 3 years
  if (bureauFacts.hasWrittenOff3Y) {
    reasons.push(
      "WRITTEN_OFF_FOUND_LAST_3_YEARS",
    );
  }

  // Maximum 3 enquiries during last 30 days
  if (bureauFacts.enquiries30d > 3) {
    reasons.push(
      "ENQUIRIES_ABOVE_3_LAST_30_DAYS",
    );
  }

  // No 30+ DPD during last 24 months
  if (bureauFacts.has30Plus24M) {
    reasons.push(
      "30PLUS_DPD_FOUND_LAST_24_MONTHS",
    );
  }

  // No 90+ DPD during last 36 months
  if (bureauFacts.has90Plus36M) {
    reasons.push(
      "90PLUS_DPD_FOUND_LAST_36_MONTHS",
    );
  }

  // EMI-based overdue cannot exceed ₹3,000
  if (
    bureauFacts.emiOverdueAmount >
    3000
  ) {
    reasons.push(
      "EMI_LOAN_OVERDUE_ABOVE_3000",
    );
  }

  // Credit-card overdue cannot exceed ₹5,000
  if (
    bureauFacts.ccOverdueAmount >
    5000
  ) {
    reasons.push(
      "CREDIT_CARD_OVERDUE_ABOVE_5000",
    );
  }

  /**
   * ---------------------------------------------------------
   * APR: MAXIMUM 45%
   * ---------------------------------------------------------
   */
  // if (apr === null) {
  //   reasons.push("APR_MISSING");
  // } else if (apr > 45) {
  //   reasons.push(
  //     "APR_ABOVE_45_PERCENT",
  //   );
  // }

  /**
   * ---------------------------------------------------------
   * TENURE: MINIMUM 6, MAXIMUM 12 MONTHS
   * ---------------------------------------------------------
   */
  if (
    tenure < 6 ||
    tenure > 12
  ) {
    reasons.push(
      "TENURE_OUTSIDE_6_TO_12_MONTHS",
    );
  }


 


  /**
   * ---------------------------------------------------------
   * FINAL BRE DECISION
   * ---------------------------------------------------------
   */
  let status = "BRE APPROVED";

  if (reasons.length > 0) {
    status = "BRE REJECTED";
  } else if (
    deviations.length > 0
  ) {
    status = "BRE DEVIATION";
  }

  return {
  status,
  reasons,
  deviations,
  notes,

  age,
  bureauScore: score,
  isNtc,

  loanAmount,
  tenure,
};
};

/**
 * ===========================================================
 * MAIN ZEBRS BRE FUNCTION
 *
 * Bureau runs only for BORROWER.
 * ===========================================================
 */
const autoApproveZebrsIfBureauVerified =
  async (lan) => {
    const pool = db.promise();

    /**
     * Set BRE as pending
     */
    const setPending = async (reason) => {
      await pool.query(
        `
        UPDATE ${ZEBRS_LOAN_TABLE}
        SET
          zebrs_bre_status = 'Pending',
          zebrs_bre_reason = ?,
          zebrs_bre_checked_at = NOW()
        WHERE lan = ?
        `,
        [reason, lan],
      );

      console.log(
        `Zebrs BRE pending for ${lan}: ${reason}`,
      );

      return {
        success: false,
        lan,
        status: "Pending",
        reason,
      };
    };

    /**
     * -------------------------------------------------------
     * FETCH ZEBRS LOAN
     * -------------------------------------------------------
     */
const [loanRows] = await pool.query(
  `
  SELECT
    l.lan,
    l.dob,
    l.pan_card,

    l.requested_loan_amount,
    l.loan_amount,
    l.loan_tenure,
    l.interest_rate,
    l.residence_ownership,

    l.dealer_id,
    l.dealer_name,

    l.battery_name,
    l.battery_type,
    l.battery_serial_no_1,
l.battery_serial_no_2,
    l.chassis_no,
    

    l.manufacturing_year,
    l.sales_invoice_number,
    l.sales_invoice_date,

    l.downpayment_paid_by_borrower,
    l.vehicle_registration_cost,

    d.application_id AS dealer_application_id,
    d.lan AS dealer_lan,
    d.status AS dealer_status,

    p.id AS dealer_product_id,
    p.application_id AS product_application_id,
    p.battery_type AS product_battery_type,
    p.battery_name AS product_battery_name,
    p.e_rickshaw_model,
    p.e_rickshaw_model_price
      AS vehicle_purchase_price

  FROM loan_booking_zebrs l

  LEFT JOIN zebrs_dealer_booking d
    ON TRIM(d.lan) = TRIM(l.dealer_id)

  LEFT JOIN zebrs_dealer_products p
    ON TRIM(p.application_id) =
       TRIM(d.application_id)

   AND LOWER(TRIM(p.battery_type)) =
       LOWER(TRIM(l.battery_type))

   AND LOWER(TRIM(p.battery_name)) =
       LOWER(TRIM(l.battery_name))

  WHERE l.lan = ?

  ORDER BY p.id DESC
  LIMIT 1
  `,
  [lan],
);



if (!loanRows.length) {
  throw new Error(`Zebrs loan not found for LAN ${lan}`);
}

/*
 * Initialize loan before using loan.dealer_id,
 * loan.dealer_product_id, etc.
 */
const loan = loanRows[0];


console.log("Zebrs BRE product mapping:", {
  lan: loan.lan,

  loan_dealer_id: loan.dealer_id,
  dealer_lan: loan.dealer_lan,
  dealer_application_id:
    loan.dealer_application_id,

  loan_battery_type:
    loan.battery_type,
  loan_battery_name:
    loan.battery_name,

  dealer_product_id:
    loan.dealer_product_id,

  product_application_id:
    loan.product_application_id,

  product_battery_type:
    loan.product_battery_type,

  product_battery_name:
    loan.product_battery_name,

  e_rickshaw_model:
    loan.e_rickshaw_model,

  vehicle_purchase_price:
    loan.vehicle_purchase_price,
});

if (!loan.dealer_application_id) {
  return setPending(
    "ZEBRS_DEALER_NOT_FOUND",
  );
}

if (
  normalizeText(loan.dealer_status) !==
  "ACTIVE"
) {
  return setPending(
    "ZEBRS_DEALER_NOT_ACTIVE",
  );
}

if (!loan.dealer_product_id) {
  return setPending(
    "ZEBRS_DEALER_PRODUCT_NOT_FOUND",
  );
}

if (!loan.e_rickshaw_model) {
  return setPending(
    "E_RICKSHAW_MODEL_NOT_FOUND_IN_DEALER_PRODUCT",
  );
}

if (
  toNumber(
    loan.vehicle_purchase_price,
    0,
  ) <= 0
) {
  return setPending(
    "E_RICKSHAW_MODEL_PRICE_MISSING",
  );
}

if (!loan.dealer_application_id) {
  return setPending("ZEBRS_DEALER_NOT_FOUND");
}

if (normalizeText(loan.dealer_status) !== "ACTIVE") {
  return setPending("ZEBRS_DEALER_NOT_ACTIVE");
}

if (!loan.dealer_product_id) {
  return setPending("ZEBRS_DEALER_PRODUCT_NOT_FOUND");
}

if (!loan.e_rickshaw_model) {
  return setPending(
    "E_RICKSHAW_MODEL_NOT_FOUND_IN_DEALER_PRODUCT",
  );
}

if (toNumber(loan.vehicle_purchase_price, 0) <= 0) {
  return setPending("E_RICKSHAW_MODEL_PRICE_MISSING");
}

    if (!loanRows.length) {
      throw new Error(
        `Zebrs loan not found for LAN ${lan}`,
      );
    }


    if (!loan.dealer_application_id) {
  return setPending(
    "ZEBRS_DEALER_NOT_FOUND",
  );
}

if (
  normalizeText(loan.dealer_status) !==
  "ACTIVE"
) {
  return setPending(
    "ZEBRS_DEALER_NOT_ACTIVE",
  );
}

if (!loan.dealer_product_id) {
  return setPending(
    "ZEBRS_DEALER_PRODUCT_NOT_FOUND",
  );
}

if (!loan.e_rickshaw_model) {
  return setPending(
    "E_RICKSHAW_MODEL_NOT_FOUND_IN_DEALER_PRODUCT",
  );
}

if (
  toNumber(loan.vehicle_purchase_price, 0) <= 0
) {
  return setPending(
    "E_RICKSHAW_MODEL_PRICE_MISSING",
  );
}
    /**
     * -------------------------------------------------------
     * BORROWER BUREAU STATUS
     *
     * Only borrower bureau is checked.
     * PAN/Aadhaar are not checked here.
     * -------------------------------------------------------
     */
    const [kycRows] = await pool.query(
      `
      SELECT bureau_status
      FROM kyc_verification_status
      WHERE lan = ?
        AND applicant_type = 'BORROWER'
        AND party_no = 1
      LIMIT 1
      `,
      [lan],
    );

    if (!kycRows.length) {
      return setPending(
        "BORROWER_BUREAU_STATUS_ROW_MISSING",
      );
    }

    const bureauStatus =
      normalizeText(
        kycRows[0].bureau_status,
      );

    if (bureauStatus !== "VERIFIED") {
      return setPending(
        `BORROWER_1_BUREAU_STATUS=${
          bureauStatus || "NA"
        }`,
      );
    }

    /**
     * -------------------------------------------------------
     * FETCH LATEST BUREAU REPORT
     * -------------------------------------------------------
     */
    const [cibilRows] = await pool.query(
      `
      SELECT
        score,
        report_xml,
        created_at

      FROM loan_cibil_reports

      WHERE lan = ?
        AND applicant_type = 'BORROWER'
        AND party_no = 1

      ORDER BY
        created_at DESC,
        id DESC

      LIMIT 1
      `,
      [lan],
    );

    if (!cibilRows.length) {
      return setPending(
        "BUREAU_REPORT_MISSING",
      );
    }

    /**
     * -------------------------------------------------------
     * REQUIRED VEHICLE IDENTIFIERS
     * -------------------------------------------------------
     */
    const requiredVehicleFields = {
      CHASSIS_NO: loan.chassis_no,

      BATTERY_SERIAL_NO:
        loan.battery_serial_no_1 ||
        loan.battery_serial_no_2,
    };

    const missingVehicleFields =
      Object.entries(
        requiredVehicleFields,
      )
        .filter(([, value]) => {
          return !String(
            value || "",
          ).trim();
        })
        .map(
          ([fieldName]) =>
            `${fieldName}_MISSING`,
        );

    if (
      missingVehicleFields.length > 0
    ) {
      return setPending(
        missingVehicleFields.join(", "),
      );
    }

    /**
     * Manufacturer/OEM-to-dealer purchase price
     */
    if (
      toNumber(
        loan.vehicle_purchase_price,
        0,
      ) <= 0
    ) {
      return setPending(
        "VEHICLE_PURCHASE_PRICE_MISSING",
      );
    }


    /**
     * -------------------------------------------------------
     * EXTRACT BUREAU FACTS
     * -------------------------------------------------------
     */
    const bureauFacts =
      extractZebrsBureauFacts(
        cibilRows[0].report_xml,
        cibilRows[0].score,
      );

    
    /**
     * -------------------------------------------------------
     * EVALUATE ZEBRS POLICY
     * -------------------------------------------------------
     */
    const decision =
      evaluateZebrsPolicy({
        loan,
        bureauFacts,
      });

    const reasonParts = [
      ...decision.reasons,
      ...decision.deviations,
      ...decision.notes,
    ];

    const reasonText =
      reasonParts.length > 0
        ? reasonParts.join(", ")
        : "ELIGIBLE";

    /**
     * -------------------------------------------------------
     * FINAL LOAN STATUS/STAGE
     * -------------------------------------------------------
     */
    let finalStatus =
      "Credit Initiated";

    let finalStage =
      "BRE Approved";

    if (
      decision.status ===
      "BRE REJECTED"
    ) {
      finalStatus = "Rejected";
      finalStage = "BRE Rejected";
    } else if (
      decision.status ===
      "BRE DEVIATION"
    ) {
      finalStatus =
        "Credit Initiated";

      finalStage =
        "BRE Deviation";
    }

    /**
     * -------------------------------------------------------
     * UPDATE ZEBRS LOAN
     * -------------------------------------------------------
     */
    await pool.query(
      `
      UPDATE ${ZEBRS_LOAN_TABLE}
      SET
        zebrs_bre_status = ?,
        zebrs_bre_reason = ?,
        zebrs_bre_checked_at = NOW(),

        cibil_score = ?,

        zebrs_enquiries_30d = ?,

        zebrs_dpd_6m_flag = ?,
        zebrs_overdue_12m_flag = ?,
        zebrs_written_off_3y_flag = ?,

        zebrs_30plus_24m_flag = ?,
        zebrs_90plus_36m_flag = ?,

        zebrs_emi_overdue_amount = ?,
        zebrs_cc_overdue_amount = ?,

        zebrs_deviation_flag = ?,

        status = ?,
        stage = ?

      WHERE lan = ?
      `,
      [
        decision.status,
        reasonText,

        decision.bureauScore,

        bureauFacts.enquiries30d,

        bureauFacts.hasDpd6M
          ? 1
          : 0,

        bureauFacts.hasOverdue12M
          ? 1
          : 0,

        bureauFacts.hasWrittenOff3Y
          ? 1
          : 0,

        bureauFacts.has30Plus24M
          ? 1
          : 0,

        bureauFacts.has90Plus36M
          ? 1
          : 0,

        bureauFacts.emiOverdueAmount,
        bureauFacts.ccOverdueAmount,


        decision.deviations.length > 0
          ? 1
          : 0,

        finalStatus,
        finalStage,

        lan,
      ],
    );

    console.log(
      `Zebrs BRE completed for ${lan}: ${decision.status} | ${reasonText}`,
    );

    return {
      success:
        decision.status !==
        "BRE REJECTED",

      lan,

      status: decision.status,
      reason: reasonText,

      decision,
      bureauFacts,
    };
  };


/**
 * ===========================================================
 * EXPORTS
 * ===========================================================
 */
module.exports = {
  autoApproveZebrsIfBureauVerified,
  extractZebrsBureauFacts,
  evaluateZebrsPolicy,
};