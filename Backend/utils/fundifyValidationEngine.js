const db = require("../config/db");
const { getPanCardDetails } = require("../services/pancardapiservice");
const { runBureau } = require("../services/Bueraupullapiservice");
const { autoApproveFundifyIfAllVerified } = require("../routes/Fundify/fundifyBRE");

const FUNDIFY_TABLE = "loan_booking_fundify";

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function emptyToNull(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

function toDateString(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function stringifyForDb(value, fallback = {}) {
  if (value === undefined || value === null) {
    return JSON.stringify(fallback);
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (_) {
    return JSON.stringify({ value: String(value) });
  }
}

function shouldRunValidation(status) {
  const normalizedStatus = normalize(status);

  return (
    !normalizedStatus ||
    normalizedStatus === "PENDING" ||
    normalizedStatus === "FAILED"
  );
}

function mapFundifyRoleToApplicantType(role) {
  const normalizedRole = normalize(role);

  if (normalizedRole === "APPLICANT") return "BORROWER";
  if (normalizedRole === "CO_APPLICANT") return "CO_APPLICANT";
  if (normalizedRole === "GUARANTOR") return "GUARANTOR";

  throw new Error(`Invalid Fundify applicant role: ${role}`);
}

function buildFullName(applicant) {
  const fullName = emptyToNull(applicant.full_name);
  if (fullName) return fullName;

  return [applicant.first_name, applicant.middle_name, applicant.last_name]
    .map(emptyToNull)
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildApplicantData({ loan, applicant }) {
  const customerName = buildFullName(applicant);

  return {
    customer_name: customerName,
    first_name: emptyToNull(applicant.first_name) || customerName,
    last_name: emptyToNull(applicant.last_name) || "",

    dob: toDateString(applicant.dob),
    gender: emptyToNull(applicant.gender),

    pan_number: emptyToNull(applicant.pan),
    mobile_number: emptyToNull(applicant.mobile),
    email: emptyToNull(applicant.email),

    current_address:
      emptyToNull(applicant.current_address) ||
      emptyToNull(applicant.permanent_address),

    current_village_city:
      emptyToNull(applicant.current_city) ||
      emptyToNull(applicant.permanent_city),

    current_state:
      emptyToNull(applicant.current_state) ||
      emptyToNull(applicant.permanent_state),

    current_pincode:
      emptyToNull(applicant.current_pincode) ||
      emptyToNull(applicant.permanent_pincode),

    loan_amount: loan.loan_amount,
    loan_tenure: loan.loan_tenure,
  };
}

async function ensureKycRow({
  pool,
  lan,
  applicantType,
  partyNo,
  sourceApplicantId,
  applicantData,
}) {
  await pool.query(
    `
    INSERT INTO kyc_verification_status (
      lan,
      applicant_type,
      party_no,
      source_applicant_id,
      applicant_name,
      mobile_number,
      pan_number
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      source_applicant_id = VALUES(source_applicant_id),
      applicant_name = VALUES(applicant_name),
      mobile_number = VALUES(mobile_number),
      pan_number = VALUES(pan_number)
    `,
    [
      lan,
      applicantType,
      partyNo,
      sourceApplicantId,
      applicantData.customer_name,
      applicantData.mobile_number,
      applicantData.pan_number,
    ]
  );
}

async function getCurrentKycStatus({ pool, lan, applicantType, partyNo }) {
  const [rows] = await pool.query(
    `
    SELECT
      pan_status,
      bureau_status
    FROM kyc_verification_status
    WHERE lan = ?
      AND applicant_type = ?
      AND party_no = ?
    LIMIT 1
    `,
    [lan, applicantType, partyNo]
  );

  return rows[0] || {};
}

async function runPanValidation({
  pool,
  lan,
  applicantType,
  partyNo,
  sourceApplicantId,
  applicantData,
}) {
  if (!applicantData.pan_number) {
    await pool.query(
      `
      UPDATE kyc_verification_status
      SET
        pan_status = 'FAILED',
        pan_api_response = ?
      WHERE lan = ?
        AND applicant_type = ?
        AND party_no = ?
      `,
      [
        JSON.stringify({ error: "PAN number missing" }),
        lan,
        applicantType,
        partyNo,
      ]
    );

    return {
      success: false,
      skipped: false,
      reason: "PAN number missing",
    };
  }

  await pool.query(
    `
    UPDATE kyc_verification_status
    SET pan_status = 'INITIATED'
    WHERE lan = ?
      AND applicant_type = ?
      AND party_no = ?
    `,
    [lan, applicantType, partyNo]
  );

  const panResult = await getPanCardDetails(
    applicantData.pan_number,
    applicantData.customer_name
  ).catch((err) => {
    console.error(
      `❌ Fundify ${applicantType}-${partyNo} PAN Error:`,
      err?.response?.data || err
    );

    return {
      success: false,
      response: err?.response?.data || {
        error: err.message || String(err),
      },
    };
  });

  const panStatus = panResult.success ? "VERIFIED" : "FAILED";

  await pool.query(
    `
    UPDATE kyc_verification_status
    SET
      pan_status = ?,
      pan_api_response = ?
    WHERE lan = ?
      AND applicant_type = ?
      AND party_no = ?
    `,
    [
      panStatus,
      JSON.stringify(panResult.response || {}),
      lan,
      applicantType,
      partyNo,
    ]
  );

  if (sourceApplicantId) {
    await pool.query(
      `
      UPDATE fundify_applicants
      SET pan_verified = ?
      WHERE id = ?
      `,
      [panResult.success ? 1 : 0, sourceApplicantId]
    );
  }

  console.log(`📌 Fundify ${applicantType}-${partyNo} PAN: ${panStatus}`);

  return {
    success: Boolean(panResult.success),
    status: panStatus,
  };
}

async function runBureauValidation({
  pool,
  lan,
  applicantType,
  partyNo,
  sourceApplicantId,
  applicantData,
}) {
  if (!applicantData.pan_number) {
    await pool.query(
      `
      UPDATE kyc_verification_status
      SET
        bureau_status = 'FAILED',
        bureau_api_response = ?
      WHERE lan = ?
        AND applicant_type = ?
        AND party_no = ?
      `,
      [
        stringifyForDb({ error: "PAN number missing for bureau" }),
        lan,
        applicantType,
        partyNo,
      ]
    );

    return {
      success: false,
      skipped: false,
      reason: "PAN number missing for bureau",
    };
  }

  await pool.query(
    `
    UPDATE kyc_verification_status
    SET bureau_status = 'INITIATED'
    WHERE lan = ?
      AND applicant_type = ?
      AND party_no = ?
    `,
    [lan, applicantType, partyNo]
  );

  const bureauResult = await runBureau({
    enquiry_reason: "61", // 05 - Credit Assessment
    customer_name: applicantData.customer_name,
    first_name: applicantData.first_name,
    last_name: applicantData.last_name,
    dob: applicantData.dob,
    gender: applicantData.gender,
    pan_number: applicantData.pan_number,
    mobile_number: applicantData.mobile_number,
    current_address: applicantData.current_address,
    current_village_city: applicantData.current_village_city,
    current_state: applicantData.current_state,
    current_pincode: applicantData.current_pincode,
    loan_amount: applicantData.loan_amount,
    loan_tenure: applicantData.loan_tenure,
  }).catch((err) => {
    console.error(`❌ Fundify ${applicantType}-${partyNo} Bureau Error:`, err);

    return {
      success: false,
      score: null,
      response: {
        error: err.message || String(err),
      },
    };
  });

  const bureauStatus = bureauResult.success ? "VERIFIED" : "FAILED";
  const bureauResponse = stringifyForDb(bureauResult.response || {});

  await pool.query(
    `
    UPDATE kyc_verification_status
    SET
      bureau_status = ?,
      bureau_api_response = ?
    WHERE lan = ?
      AND applicant_type = ?
      AND party_no = ?
    `,
    [bureauStatus, bureauResponse, lan, applicantType, partyNo]
  );

  await pool.query(
    `
    INSERT INTO loan_cibil_reports (
      lan,
      applicant_type,
      party_no,
      source_applicant_id,
      pan_number,
      score,
      report_xml,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    [
      lan,
      applicantType,
      partyNo,
      sourceApplicantId,
      applicantData.pan_number,
      bureauResult.score,
      bureauResponse,
    ]
  );

  if (bureauResult.score != null && sourceApplicantId) {
    await pool.query(
      `
      UPDATE fundify_applicants
      SET
        cibil_score = ?,
        bureau_score = ?
      WHERE id = ?
      `,
      [bureauResult.score, bureauResult.score, sourceApplicantId]
    );
  }

  if (bureauResult.score != null && applicantType === "BORROWER") {
    await pool.query(
      `
      UPDATE ${FUNDIFY_TABLE}
      SET
        cibil_score = ?,
        bureau_score = ?
      WHERE lan = ?
      `,
      [bureauResult.score, bureauResult.score, lan]
    );
  }

  console.log(`📌 Fundify ${applicantType}-${partyNo} Bureau: ${bureauStatus}`);

  return {
    success: Boolean(bureauResult.success),
    status: bureauStatus,
    score: bureauResult.score,
  };
}

async function runSingleFundifyApplicantValidation({ pool, loan, applicant }) {
  const lan = loan.lan;
  const applicantType = mapFundifyRoleToApplicantType(applicant.role);
  const partyNo = Number(applicant.party_no || 1);
  const sourceApplicantId = applicant.id;

  const applicantData = buildApplicantData({
    loan,
    applicant,
  });

  console.log(
    `🚀 Running Fundify ${applicantType}-${partyNo} validations for ${lan}`
  );

  await ensureKycRow({
    pool,
    lan,
    applicantType,
    partyNo,
    sourceApplicantId,
    applicantData,
  });

  const currentStatus = await getCurrentKycStatus({
    pool,
    lan,
    applicantType,
    partyNo,
  });

  const result = {
    applicant_id: sourceApplicantId,
    applicant_type: applicantType,
    party_no: partyNo,
    name: applicantData.customer_name,
    pan: null,
    bureau: null,
  };

  if (shouldRunValidation(currentStatus.pan_status)) {
    result.pan = await runPanValidation({
      pool,
      lan,
      applicantType,
      partyNo,
      sourceApplicantId,
      applicantData,
    });
  } else {
    result.pan = {
      skipped: true,
      status: currentStatus.pan_status,
    };

    console.log(
      `⏭️ Fundify ${applicantType}-${partyNo} PAN skipped. Existing status: ${currentStatus.pan_status}`
    );
  }

  if (shouldRunValidation(currentStatus.bureau_status)) {
    result.bureau = await runBureauValidation({
      pool,
      lan,
      applicantType,
      partyNo,
      sourceApplicantId,
      applicantData,
    });
  } else {
    result.bureau = {
      skipped: true,
      status: currentStatus.bureau_status,
    };

    console.log(
      `⏭️ Fundify ${applicantType}-${partyNo} Bureau skipped. Existing status: ${currentStatus.bureau_status}`
    );
  }

  return result;
}

exports.runFundifyPanBureauValidations = async (lan) => {
  const pool = db.promise();

  try {
    console.log(`🚀 Starting Fundify PAN + Bureau Validation Engine for ${lan}`);

    const [loanRows] = await pool.query(
      `
      SELECT *
      FROM ${FUNDIFY_TABLE}
      WHERE lan = ?
      `,
      [lan]
    );

    if (!loanRows.length) {
      console.log(`❌ Fundify loan not found: ${lan}`);

      return {
        success: false,
        message: "Fundify loan not found",
        lan,
      };
    }

    const loan = loanRows[0];

    const [applicants] = await pool.query(
      `
      SELECT *
      FROM fundify_applicants
      WHERE lan = ?
      ORDER BY FIELD(role, 'APPLICANT', 'CO_APPLICANT', 'GUARANTOR'),
               party_no,
               id
      `,
      [lan]
    );

    if (!applicants.length) {
      console.log(`❌ Fundify applicants not found: ${lan}`);

      return {
        success: false,
        message: "Fundify applicants not found",
        lan,
      };
    }

    const results = [];

    for (const applicant of applicants) {
      const applicantResult = await runSingleFundifyApplicantValidation({
        pool,
        loan,
        applicant,
      });

      results.push(applicantResult);
    }

    await pool.query(
      `
      UPDATE ${FUNDIFY_TABLE}
      SET
        stage = CASE
          WHEN stage IN ('Login', 'KYC Pending') THEN 'PAN Bureau Completed'
          ELSE stage
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE lan = ?
      `,
      [lan]
    );

    console.log(`✅ Fundify PAN + Bureau Validation Engine completed for ${lan}`);

    // ── Trigger BRE engine after PAN + Bureau completes ──────────────────────
    // This runs asynchronously so it does NOT block the PAN/Bureau response.
    autoApproveFundifyIfAllVerified(lan).catch((breErr) => {
      console.error(`❌ Fundify BRE Engine failed after PAN+Bureau for ${lan}:`, breErr);
    });
    // ─────────────────────────────────────────────────────────────────────────

    return {
      success: true,
      lan,
      results,
    };
  } catch (err) {
    console.error(
      `❌ Fundify PAN + Bureau Validation Engine failed for ${lan}:`,
      err
    );

    return {
      success: false,
      lan,
      message: err.sqlMessage || err.message,
    };
  }
};