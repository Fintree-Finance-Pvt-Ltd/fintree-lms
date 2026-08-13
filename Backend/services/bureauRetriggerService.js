const db = require("../config/db");
const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const he = require("he");

const {
  autoApproveLoanDigitIfAllVerified,
} = require("../routes/loanDigit/loanDigitBre");
// Import BRE trigger functions for other partners as they get added:
const { autoApproveClayyoIfAllVerified } = require("../routes/clyooRoutes/clayyoBreEngine");
const { autoApproveCarePayIfBureauVerified } = require("../routes/CarePay/carePayBreEngine");

/* ============================================================ */
/*                     STATE CODES (shared)                     */
/* ============================================================ */

const STATE_CODES = {
  "JAMMU AND KASHMIR": "01", "JAMMU & KASHMIR": "01",
  "HIMACHAL PRADESH": "02", PUNJAB: "03", CHANDIGARH: "04",
  UTTRANCHAL: "05", UTTARAKHAND: "05",
  HARAYANA: "06", HARYANA: "06", DELHI: "07",
  RAJASTHAN: "08", "UTTAR PRADESH": "09", BIHAR: "10",
  SIKKIM: "11", "ARUNACHAL PRADESH": "12", NAGALAND: "13",
  MANIPUR: "14", MIZORAM: "15", TRIPURA: "16",
  MEGHALAYA: "17", ASSAM: "18", "WEST BENGAL": "19",
  JHARKHAND: "20", ORRISA: "21", ODISHA: "21",
  CHHATTISGARH: "22", "MADHYA PRADESH": "23",
  GUJRAT: "24", GUJARAT: "24",
  "DAMAN and DIU": "25", "DAMAN AND DIU": "25",
  "DADARA and NAGAR HAVELI": "26", "DADRA AND NAGAR HAVELI": "26",
  MAHARASHTRA: "27", "ANDHRA PRADESH": "28", KARNATAKA: "29",
  GOA: "30", LAKSHADWEEP: "31", KERALA: "32",
  "TAMIL NADU": "33", PONDICHERRY: "34", PUDUCHERRY: "34",
  "ANDAMAN and NICOBAR ISLANDS": "35", "ANDAMAN AND NICOBAR ISLANDS": "35",
  TELANGANA: "36",
};

/* ============================================================ */
/*                     PARTNER REGISTRY                         */
/*                                                              */
/*  Add a new partner by adding a new entry here.               */
/*  Nothing else in this file needs to change.                  */
/* ============================================================ */

const PARTNERS = {
  loan_digit: {
    key: "loan_digit",
    lanPrefix: "LDF",
    table: "loan_booking_loan_digit",
    scoreColumn: "fintree_cibil_score",
    breStatusColumn: "loandigit_bre_status",
    breReasonColumn: "loandigit_bre_reason",
    breCheckedAtColumn: "loandigit_bre_checked_at",
    breTrigger: autoApproveLoanDigitIfAllVerified,
    // Column mapping — logical name → column in this table.
    // If a partner uses different column names, override here.
    columns: {
      first_name: "first_name",
      middle_name: "middle_name",
      last_name: "last_name",
      mobile_number: "mobile_number",
      pan_number: "pan_number",
      dob: "dob",
      gender: "gender",
      current_address: "current_address",
      current_city: "current_village_city",
      current_state: "current_state",
      current_pincode: "current_pincode",
      monthly_salary: "monthly_salary",
      loan_amount: "loan_amount",
      loan_tenure: "loan_tenure",
    },
  },

  // Example — uncomment and adjust when Clayyo goes live:
  //
  clayyo: {
    key: "clayyo",
    lanPrefix: "CLY",
    table: "loan_booking_clayyo",
    //scoreColumn: "fintree_cibil_score",
    scoreColumn: "cibil_score",
    breStatusColumn: "clayyo_bre_status",
    breReasonColumn: "clayyo_bre_reason",
    breCheckedAtColumn: "clayyo_bre_checked_at",
    breTrigger: autoApproveClayyoIfAllVerified,
    columns: {
      first_name: "first_name",
      middle_name: "middle_name",
      last_name: "last_name",
      mobile_number: "mobile_number",           // e.g. Clayyo uses "mobile" not "mobile_number"
      pan_number: "pan_number",
      dob: "dob",
      gender: "gender",
      current_address: "current_address",
      current_city: "current_village_city",
      current_state: "current_state",
      current_pincode: "current_pincode",
      monthly_salary: "net_monthly_income",
      loan_amount: "loan_amount",
      loan_tenure: "loan_tenure",
    },
  },
  carepay: {
    key: "carepay",
    lanPrefix: "CARE",
    table: "loan_booking_carepay",
    scoreColumn: "cibil_score",
    breTrigger: autoApproveCarePayIfBureauVerified,
    columns: {
      first_name: "first_name",
      middle_name: "middle_name",
      last_name: "last_name",
      mobile_number: "mobile_number",
      pan_number: "pan_number",
      dob: "dob",
      gender: "gender",
      current_address: "current_address",
      current_city: "current_village_city",
      current_state: "current_state",
      current_pincode: "current_pincode",
      annual_income: "annual_income",
      loan_amount: "loan_amount",
      loan_tenure: "loan_tenure",
    },
  },
};

/* ============================================================ */
/*                     PARTNER RESOLUTION                       */
/* ============================================================ */

/**
 * Resolve which partner a LAN belongs to using lanPrefix.
 * Longest-prefix wins (so "LDF10" matches before a shorter "LDF").
 */
function resolvePartnerFromLan(lan) {
  const upper = String(lan || "").toUpperCase();
  const matches = Object.values(PARTNERS)
    .filter((p) => upper.startsWith(p.lanPrefix.toUpperCase()))
    .sort((a, b) => b.lanPrefix.length - a.lanPrefix.length);
  return matches[0] || null;
}

function resolvePartnerByKey(key) {
  return PARTNERS[String(key || "").toLowerCase()] || null;
}

/* ============================================================ */
/*                     MAIN RETRIGGER FUNCTION                  */
/* ============================================================ */

/**
 * Retrigger Experian bureau pull for any partner's LAN.
 *
 * @param {string} lan
 * @param {object} opts
 * @param {boolean} [opts.forceEvenIfVerified=false]
 * @param {string}  [opts.partnerKey] - optional explicit partner override
 * @returns {Promise<{success:boolean, score:number|null, reason?:string, partner?:string}>}
 */
async function retriggerBureau(lan, opts = {}) {
  const { forceEvenIfVerified = false, partnerKey, onlyIfFailed = false } = opts;
  const pool = db.promise();

  if (!lan) return { success: false, reason: "LAN_REQUIRED" };

  /* ── 1. Resolve partner ── */
  const partner = partnerKey
    ? resolvePartnerByKey(partnerKey)
    : resolvePartnerFromLan(lan);

  if (!partner) {
    return {
      success: false,
      reason: `UNKNOWN_PARTNER_FOR_LAN: ${lan}. Add its prefix to PARTNERS registry.`,
    };
  }

  /* ── 2. Fetch loan row from that partner's table ── */
  const cols = partner.columns;
  const selectCols = Object.entries(cols)
    .map(([logical, physical]) => `\`${physical}\` AS \`${logical}\``)
    .join(", ");

  const [loanRows] = await pool.query(
    `SELECT lan, ${selectCols} FROM \`${partner.table}\` WHERE lan = ?`,
    [lan],
  );

  if (!loanRows.length) {
    return { success: false, reason: "LOAN_NOT_FOUND", partner: partner.key };
  }
  const loan = loanRows[0];

  /* ── 3. Skip if already verified (unless forced) ── */
  if (!forceEvenIfVerified) {
    const [kycRows] = await pool.query(
      `SELECT bureau_status FROM kyc_verification_status WHERE lan = ?`,
      [lan],
    );
    if (kycRows.length && kycRows[0].bureau_status === "VERIFIED") {
      return {
        success: true,
        score: null,
        reason: "ALREADY_VERIFIED",
        partner: partner.key,
      };
    }
  }

  /* ── 4. Mark IN_PROGRESS ── */
  if (onlyIfFailed) {
    // Automatic/bulk retry:
    // Only one worker is allowed to change FAILED -> INITIATED.
    const [claimResult] = await pool.query(
      `UPDATE kyc_verification_status
     SET bureau_status = 'INITIATED',
     bureau_api_response = NULL
     WHERE lan = ?
       AND bureau_status = 'FAILED'`,
      [lan],
    );

    if (claimResult.affectedRows !== 1) {
      return {
        success: false,
        skipped: true,
        reason: "NOT_FAILED_OR_ALREADY_CLAIMED",
        partner: partner.key,
      };
    }
  } else {
    // Existing manual/single retrigger behaviour remains unchanged.
    await pool.query(
      `INSERT INTO kyc_verification_status (lan, bureau_status)
     VALUES (?, 'INITIATED')
     ON DUPLICATE KEY UPDATE bureau_status = 'INITIATED'`,
      [lan],
    );
  }

  // await pool.query(
  //   `INSERT INTO kyc_verification_status (lan, bureau_status)
  //    VALUES (?, 'INITIATED')
  //    ON DUPLICATE KEY UPDATE bureau_status = 'INITIATED'`,
  //   [lan],
  // );

  /* ── 5. Build request ── */
  const formatDobForBureau = (dob) => {
  if (!dob) return "";

  // MySQL/mysql2 Date object
  if (dob instanceof Date && !isNaN(dob.getTime())) {
    const year = dob.getFullYear();
    const month = String(dob.getMonth() + 1).padStart(2, "0");
    const day = String(dob.getDate()).padStart(2, "0");

    return `${year}${month}${day}`;
  }

  const value = String(dob).trim();

  // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    return `${isoMatch[1]}${isoMatch[2]}${isoMatch[3]}`;
  }

  // Already YYYYMMDD
  if (/^\d{8}$/.test(value)) {
    return value;
  }

  return "";
};

const dobFormatted = formatDobForBureau(loan.dob);

console.log("[BUREAU] DOB DEBUG", {
  lan,
  rawDob: loan.dob,
  rawDobType: typeof loan.dob,
  isDateObject: loan.dob instanceof Date,
  dobFormatted,
});
  const genderValue = String(loan.gender || "Male").trim().toLowerCase();
  const gender_code = genderValue === "female" ? 2 : 1;

  const normalizedState = String(loan.current_state || "")
    .trim()
    .toUpperCase();
  const state_code = STATE_CODES[normalizedState];
  if (!state_code) {
    await markBureauFailed(
      partner,
      lan,
      `UNMAPPED_STATE: ${loan.current_state}`,
    );
    return {
      success: false,
      reason: `UNMAPPED_STATE: ${loan.current_state}`,
      partner: partner.key,
    };
  }

  const ftRef = `${String(Date.now()).slice(-9)}`;

  const soapBody = buildSoapBody({
    ftRef,
    loan,
    gender_code,
    dobFormatted,
    state_code,
  });

  /* ── 6. Call Experian ── */
  let response;

  try {
    response = await callBureauApi(soapBody);
  } catch (err) {
    await markBureauFailed(
      partner,
      lan,
      `NETWORK: ${err.message}`
    );

    return {
      success: false,
      reason: `NETWORK: ${err.message}`,
      partner: partner.key,
    };
  }

  /* Validate HTTP response */
  if (
    !response ||
    response.status < 200 ||
    response.status >= 300
  ) {
    const reason = `EXPERIAN_HTTP_${response?.status || "UNKNOWN"}`;

    await markBureauFailed(
      partner,
      lan,
      reason
    );

    return {
      success: false,
      reason,
      partner: partner.key,
    };
  }

  /* ── 7. Parse SOAP envelope ── */
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

  let decodedXml;
  try {
    const parsedOuter = parser.parse(response.data);

    const envelope =
      parsedOuter["SOAP-ENV:Envelope"] ||
      parsedOuter["soap:Envelope"] ||
      parsedOuter["soapenv:Envelope"] ||
      parsedOuter["S:Envelope"];
    const body =
      envelope?.["SOAP-ENV:Body"] ||
      envelope?.["soap:Body"] ||
      envelope?.["soapenv:Body"] ||
      envelope?.["S:Body"];
    if (!body) throw new Error("SOAP body missing");

    const responseNode = Object.entries(body).find(
      ([k]) => k === "processResponse" || k.endsWith(":processResponse"),
    )?.[1];
    if (!responseNode) throw new Error("processResponse missing");

    const outNode = Object.entries(responseNode).find(
      ([k]) => k === "out" || k.endsWith(":out"),
    )?.[1];
    if (!outNode) throw new Error("out node missing");

    decodedXml = he.decode(String(outNode));
  } catch (err) {
    await markBureauFailed(partner, lan, `PARSE: ${err.message}`);
    return {
      success: false,
      reason: `PARSE: ${err.message}`,
      partner: partner.key,
    };
  }

  /* ── 8. Parse & validate inner XML ── */
  let parsedInner;
  try {
    parsedInner = parser.parse(decodedXml);
  } catch (err) {
    await markBureauFailed(partner, lan, `INNER_PARSE: ${err.message}`);
    return {
      success: false,
      reason: `INNER_PARSE: ${err.message}`,
      partner: partner.key,
    };
  }

  const errorNode = parsedInner?.INProfileResponse?.ERROR;
  if (errorNode) {
    const errText =
      typeof errorNode === "object"
        ? JSON.stringify(errorNode).slice(0, 300)
        : String(errorNode).slice(0, 300);
    await markBureauFailed(partner, lan, `EXPERIAN_ERROR: ${errText}`);
    return {
      success: false,
      reason: `EXPERIAN_ERROR: ${errText}`,
      partner: partner.key,
    };
  }

  if (!parsedInner?.INProfileResponse) {
    await markBureauFailed(partner, lan, "INVALID_RESPONSE_STRUCTURE");
    return {
      success: false,
      reason: "INVALID_RESPONSE_STRUCTURE",
      partner: partner.key,
    };
  }

  /* ── 9. Extract score ── */
  const scoreRaw =
    parsedInner?.INProfileResponse?.SCORE?.BureauScore ??
    parsedInner?.INProfileResponse?.Score?.BureauScore ??
    null;
  const scoreNum = Number(scoreRaw);
  const score =
    Number.isFinite(scoreNum) && scoreNum > 0 ? scoreNum : null;

  /* ── 10. Persist ── */
  try {
    await pool.query(
      `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [lan, loan.pan_number, score, decodedXml],
    );

    await pool.query(
      `INSERT INTO kyc_verification_status (lan, bureau_status, bureau_api_response)
       VALUES (?, 'VERIFIED', ?)
       ON DUPLICATE KEY UPDATE
         bureau_status = 'VERIFIED',
         bureau_api_response = VALUES(bureau_api_response)`,
      [lan, decodedXml],
    );

    if (score !== null && partner.scoreColumn) {
      await pool.query(
        `UPDATE \`${partner.table}\` SET \`${partner.scoreColumn}\` = ? WHERE lan = ?`,
        [score, lan],
      );
    }
  } catch (err) {
    await markBureauFailed(partner, lan, `DB_PERSIST: ${err.message}`);
    return {
      success: false,
      reason: `DB_PERSIST: ${err.message}`,
      partner: partner.key,
    };
  }

  /* ── 11. Trigger BRE (partner-specific) ── */
  if (typeof partner.breTrigger === "function") {
    try {
      await partner.breTrigger(lan);
    } catch (err) {
      console.error(
        `[${partner.key}] BRE trigger failed for ${lan}:`,
        err.message,
      );
    }
  }

  return { success: true, score, partner: partner.key };
}

/* ============================================================ */
/*               BULK FAILED BUREAU RETRIGGER                  */
/* ============================================================ */

async function retriggerFailedBureauBatch(partnerKey, requestedLimit = 50) {
  const pool = db.promise();

  const partner = resolvePartnerByKey(partnerKey);

  if (!partner) {
    throw new Error(`Unknown partner: ${partnerKey}`);
  }

  const parsedLimit = Number(requestedLimit);

  const limit = Math.min(
    Math.max(
      Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 50,
      1,
    ),
    200,
  );

  const [rows] = await pool.query(
    `SELECT l.lan
   FROM \`${partner.table}\` l
   INNER JOIN kyc_verification_status k
     ON k.lan = l.lan
   WHERE k.bureau_status = 'FAILED'
   ORDER BY k.updated_at ASC
   LIMIT ?`,
    [limit],
  );

  const results = [];

  for (const { lan } of rows) {
    try {
      const result = await retriggerBureau(lan, {
        partnerKey: partner.key,

        // Very important:
        // retrigger only if DB status is STILL FAILED.
        onlyIfFailed: true,
      });

      results.push({
        lan,
        ...result,
      });

      // Delay only when an actual Experian attempt happened.
      if (!result.skipped) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error(
        `[BUREAU-BULK-RETRY] Error for ${lan}:`,
        err.message,
      );

      results.push({
        lan,
        success: false,
        reason: err.message,
      });
    }
  }
  return {
    partner: partner.key,

    selected: rows.length,

    processed: results.filter((r) => !r.skipped).length,

    skipped: results.filter((r) => r.skipped).length,

    successful: results.filter((r) => r.success).length,

    failed: results.filter(
      (r) => !r.success && !r.skipped,
    ).length,

    results,
  };
}

/* ============================================================ */
/*                     HELPERS                                  */
/* ============================================================ */

async function isProdDatabase() {
  const [rows] = await db.promise().query(
    `SELECT DATABASE() AS db_name`
  );

  const dbName = String(
    rows?.[0]?.db_name || ""
  ).toUpperCase();

  return dbName === "U341672715_FLMS_PRODUCT";
}

async function callBureauApi(soapBody) {

  return axios.post(
    process.env.EXPERIAN_URL,
    soapBody,
    {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "urn:cbv2/process",
        Accept: "text/xml",
      },
      timeout: 30000,
      validateStatus: () => true,
    }
  );
}

function buildSoapBody({ ftRef, loan, gender_code, dobFormatted, state_code }) {
  const incomeForBureau =
    Number(loan.monthly_salary) ||
    (Number(loan.annual_income)
      ? Number(loan.annual_income) / 12
      : 0);
  return `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:cbv2">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:process>
      <urn:in>
        <INProfileRequest>

          <Identification>
            <XMLUser>${process.env.EXPERIAN_USER}</XMLUser>
            <XMLPassword>${process.env.EXPERIAN_PASSWORD}</XMLPassword>
          </Identification>

          <Application>
            <FTReferenceNumber>${ftRef}</FTReferenceNumber>
            <CustomerReferenceID/>
            <EnquiryReason>13</EnquiryReason>
            <FinancePurpose>99</FinancePurpose>
            <AmountFinanced>${Number(loan.loan_amount) || 0}</AmountFinanced>
            <DurationOfAgreement>${Number(loan.loan_tenure) || 0}</DurationOfAgreement>
            <ScoreFlag>3</ScoreFlag>
            <PSVFlag>0</PSVFlag>
          </Application>

          <Applicant>
            <Surname>${(loan.last_name || "").toUpperCase()}</Surname>
            <FirstName>${(loan.first_name || "").toUpperCase()}</FirstName>
            <MiddleName1>${(loan.middle_name || "").toUpperCase()}</MiddleName1>
            <MiddleName2/>
            <MiddleName3/>

            <GenderCode>${gender_code}</GenderCode>

            <IncomeTaxPAN>${loan.pan_number || ""}</IncomeTaxPAN>
            <PANIssueDate/>
            <PANExpirationDate/>

            <PassportNumber/>
            <PassportIssueDate/>
            <PassportExpirationDate/>

            <VoterIdentityCard/>
            <VoterIDIssueDate/>
            <VoterIDExpirationDate/>

            <DriverLicenseNumber/>
            <DriverLicenseIssueDate/>
            <DriverLicenseExpirationDate/>

            <RationCardNumber/>
            <RationCardIssueDate/>
            <RationCardExpirationDate/>

            <UniversalIDNumber/>
            <UniversalIDIssueDate/>
            <UniversalIDExpirationDate/>

            <DateOfBirth>${dobFormatted}</DateOfBirth>

            <STDPhoneNumber/>
            <PhoneNumber/>
            <TelephoneExtension/>
            <TelephoneType/>

            <MobilePhone>${loan.mobile_number || ""}</MobilePhone>
            <EMailId/>
          </Applicant>

          <Details>
          <Income>${Math.round(incomeForBureau)}</Income>
            <MaritalStatus/>
            <EmployStatus/>
            <TimeWithEmploy/>
            <NumberOfMajorCreditCardHeld/>
          </Details>

          <Address>
            <FlatNoPlotNoHouseNo>${loan.current_address || ""}</FlatNoPlotNoHouseNo>
            <BldgNoSocietyName/>
            <RoadNoNameAreaLocality/>
            <City>${loan.current_city || ""}</City>
            <Landmark/>
            <State>${state_code}</State>
            <PinCode>${loan.current_pincode || ""}</PinCode>
          </Address>

          <AdditionalAddressFlag>
            <Flag>N</Flag>
          </AdditionalAddressFlag>

          <AdditionalAddress>
            <FlatNoPlotNoHouseNo/>
            <BldgNoSocietyName/>
            <RoadNoNameAreaLocality/>
            <City/>
            <Landmark/>
            <State/>
            <PinCode/>
          </AdditionalAddress>

        </INProfileRequest>
      </urn:in>
    </urn:process>
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function markBureauFailed(partner, lan, reason) {
  const pool = db.promise();
  const shortReason = String(reason || "").slice(0, 4000);
  try {
    await pool.query(
      `INSERT INTO kyc_verification_status (lan, bureau_status, bureau_api_response)
       VALUES (?, 'FAILED', ?)
       ON DUPLICATE KEY UPDATE
         bureau_status = 'FAILED',
         bureau_api_response = VALUES(bureau_api_response)`,
      [lan, shortReason],
    );

    if (
      partner &&
      partner.table &&
      partner.breStatusColumn &&
      partner.breReasonColumn
    ) {
      const checkedAtCol = partner.breCheckedAtColumn
        ? `, \`${partner.breCheckedAtColumn}\` = NOW()`
        : "";
      await pool.query(
        `UPDATE \`${partner.table}\`
         SET \`${partner.breStatusColumn}\` = 'Pending',
             \`${partner.breReasonColumn}\` = ?
             ${checkedAtCol}
         WHERE lan = ?`,
        [`BUREAU_FETCH_FAILED: ${shortReason.slice(0, 180)}`, lan],
      );
    }
  } catch (err) {
    console.error(`markBureauFailed persist failed for ${lan}:`, err.message);
  }
}

module.exports = {
  retriggerBureau,
  retriggerFailedBureauBatch,
  resolvePartnerFromLan,
  resolvePartnerByKey,
  PARTNERS,
};