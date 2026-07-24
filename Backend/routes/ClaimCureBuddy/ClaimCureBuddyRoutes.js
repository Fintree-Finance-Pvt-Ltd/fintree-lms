const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const db = require("../../config/db");
const { getPanCardDetails } = require("../../services/pancardapiservice");
const { runBureau } = require("../../services/Bueraupullapiservice");
const { initAadhaarKyc } = require("../../services/digitapaadharservice");
const {
  createEnachAuthorizationLink,
} = require("../../services/easebuzz/easebuzzMandateService");
const {
  extractClaimCureBuddyBureauFacts,
  evaluateClaimCureBuddyBorrowerPreBre,
  evaluateClaimCureBuddyApplicant,
  buildFinalDecision,
} = require("./ClaimCureBuddyBre");

const router = express.Router();

const PRODUCT_SEQUENCE_KEY = "CLAIM-CURE-BUDDY_CUSTOMER";

const readPositiveIntegerEnv = (name, fallback, minimum) => {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
};

const OTP_EXPIRY_SECONDS = readPositiveIntegerEnv(
  "CCB_OTP_EXPIRY_SECONDS",
  300,
  60,
);

const OTP_RESEND_SECONDS = readPositiveIntegerEnv(
  "CCB_OTP_RESEND_SECONDS",
  60,
  10,
);

const MAX_OTP_ATTEMPTS = 5;
const TERMINAL_STATUSES = new Set(["Approved", "Rejected"]);

const clean = (value) => String(value ?? "").trim();
const dateOnly = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  const match = clean(value).match(/^(\d{4}-\d{2}-\d{2})/);

  return match?.[1] || "";
};
const upper = (value) => clean(value).toUpperCase();
const lower = (value) => clean(value).toLowerCase();
const nullable = (value) => (clean(value) === "" ? null : clean(value));
const actorId = (req) => req.user?.id || req.user?.userId || null;

const isMobile = (value) => /^[6-9]\d{9}$/.test(value);
const isPan = (value) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value);
const isPincode = (value) => /^\d{6}$/.test(value);
const isIfsc = (value) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value);
const isEmail = (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

const numeric = (value, field, { min = 0, integer = false } = {}) => {
  if (value === "" || value === null || value === undefined) {
    const error = new Error(`${field} is required`);
    error.statusCode = 400;
    throw error;
  }

  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < min ||
    (integer && !Number.isInteger(parsed))
  ) {
    const error = new Error(`${field} is invalid`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

const validateParty = (applicantType, partyNo) => {
  const type = upper(applicantType);
  const party = Number(partyNo || 1);

  if (!["BORROWER", "CO_APPLICANT"].includes(type)) {
    const error = new Error("applicantType must be BORROWER or CO_APPLICANT");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(party) || party < 1 || party > 4) {
    const error = new Error("partyNo must be between 1 and 4");
    error.statusCode = 400;
    throw error;
  }

  if (type === "BORROWER" && party !== 1) {
    const error = new Error("Borrower partyNo must be 1");
    error.statusCode = 400;
    throw error;
  }

  return {
    applicantType: type,
    partyNo: party,
  };
};

const hashOtp = (mobile, otp) =>
  crypto
    .createHash("sha256")
    .update(
      `${mobile}:${otp}:${
        process.env.OTP_HASH_PEPPER || process.env.JWT_SECRET || ""
      }`,
    )
    .digest("hex");

const safeJson = (value) => {
  try {
    return JSON.stringify(value ?? {});
  } catch (_) {
    return JSON.stringify({
      serializationError: true,
    });
  }
};

const errorResponse = (res, error, fallbackMessage) => {
  const status = Number(error.statusCode) || 500;

  if (status >= 500) {
    console.error(fallbackMessage, error);
  }

  return res.status(status).json({
    success: false,
    message: status >= 500 ? fallbackMessage : error.message,
    ...(error.missingFields ? { missingFields: error.missingFields } : {}),
    ...(error.kycErrors ? { kycErrors: error.kycErrors } : {}),
  });
};

const requireFields = (data, fields, label = "request") => {
  const missingFields = fields.filter((field) => clean(data[field]) === "");

  if (missingFields.length) {
    const error = new Error(
      `Required ${label} fields are missing: ${missingFields.join(", ")}`,
    );

    error.statusCode = 400;
    error.missingFields = missingFields;
    throw error;
  }
};

const generateIdentifiers = async (connection) => {
  const [rows] = await connection.query(
    `SELECT last_sequence
     FROM loan_sequences
     WHERE lender_name = ?
     FOR UPDATE`,
    [PRODUCT_SEQUENCE_KEY],
  );

  const sequence = rows.length ? Number(rows[0].last_sequence) + 1 : 11000;

  if (rows.length) {
    await connection.query(
      `UPDATE loan_sequences
       SET last_sequence = ?
       WHERE lender_name = ?`,
      [sequence, PRODUCT_SEQUENCE_KEY],
    );
  } else {
    await connection.query(
      `INSERT INTO loan_sequences
       (lender_name, last_sequence)
       VALUES (?, ?)`,
      [PRODUCT_SEQUENCE_KEY, sequence],
    );
  }

  return {
    applicationId: `CCBAPP${sequence}`,
    partnerLoanId: `CCBPL${sequence}`,
    lan: `CCB${sequence}`,
  };
};

const getLoan = async (connection, lan, { lock = false } = {}) => {
  const [rows] = await connection.query(
    `SELECT *
     FROM loan_booking_claim_cure_buddy
     WHERE lan = ?
     LIMIT 1
     ${lock ? "FOR UPDATE" : ""}`,
    [lan],
  );

  return rows[0] || null;
};

const assertEditable = (loan) => {
  if (!loan) {
    const error = new Error("ClaimCureBuddy loan booking not found");
    error.statusCode = 404;
    throw error;
  }

  if (TERMINAL_STATUSES.has(loan.status)) {
    const error = new Error(
      `Loan cannot be edited after status ${loan.status}`,
    );
    error.statusCode = 409;
    throw error;
  }
};

const resetBureauStatus = async (
  connection,
  lan,
  applicantType = null,
  partyNo = null,
) => {
  const params = [lan];
  let filter = "";

  if (applicantType) {
    filter += " AND applicant_type = ?";
    params.push(applicantType);
  }

  if (partyNo) {
    filter += " AND party_no = ?";
    params.push(partyNo);
  }

  await connection.query(
    `UPDATE kyc_verification_status
     SET bureau_status = 'PENDING',
         bureau_api_response = NULL
     WHERE lan = ?${filter}`,
    params,
  );
};

const splitName = (fullName) => {
  const parts = clean(fullName).replace(/\s+/g, " ").split(" ").filter(Boolean);

  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
    customerName: parts.join(" "),
  };
};

const extractPanProfile = (result) => {
  const root = result?.response ?? result?.data ?? result ?? {};

  const firstLayer = root?.data ?? root?.result ?? root?.payload ?? root;

  const data = firstLayer?.data ?? firstLayer?.result ?? firstLayer;

  const customerName = clean(
    data?.full_name ||
      data?.fullName ||
      data?.name ||
      data?.pan_name ||
      data?.panName ||
      data?.registered_name ||
      data?.registeredName,
  );

  const explicitFirst = clean(data?.first_name || data?.firstName);

  const explicitLast = clean(data?.last_name || data?.lastName);

  const fallback = splitName(
    customerName || [explicitFirst, explicitLast].filter(Boolean).join(" "),
  );

  return {
    firstName: explicitFirst || fallback.firstName,
    lastName: explicitLast || fallback.lastName,
    customerName: customerName || fallback.customerName,
  };
};

const sendSmsOtp = async (mobile, otp) => {
  if (process.env.CCB_SKIP_SMS === "true") {
    return;
  }

  await axios.get(process.env.ALOT_API_URL, {
    params: {
      user: process.env.ALOT_USER,
      password: process.env.ALOT_PASSWORD,
      senderid: process.env.SENDER_ID,
      channel: "TRANS",
      DCS: "0",
      flashsms: "0",
      number: mobile,
      text: `OTP for mobile number verification is ${otp}. Do not share this OTP with anyone. Thanks & Regards Fintree Finance Private Limited.`,
      route: "5",
      DLTTemplateId: process.env.MOBILE_OTP_TEMPLATE_ID,
      PEID: process.env.DLT_PEID,
    },
    timeout: 15000,
  });
};

router.post("/otp/send", async (req, res) => {
  try {
    const mobile = clean(req.body.mobile).replace(/\D/g, "");
    const lan = nullable(req.body.lan);

    const { applicantType, partyNo } = validateParty(
      req.body.applicantType,
      req.body.partyNo,
    );

    if (!isMobile(mobile)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit mobile number",
      });
    }

    if (!process.env.OTP_HASH_PEPPER && !process.env.JWT_SECRET) {
      const error = new Error("OTP_HASH_PEPPER must be configured");
      error.statusCode = 500;
      throw error;
    }

    if (applicantType === "CO_APPLICANT" && !lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required for co-applicant OTP",
      });
    }

    if (lan) {
      const loan = await getLoan(db.promise(), lan);
      assertEditable(loan);
    }

    const [latest] = await db.promise().query(
      `SELECT
         last_sent_at,
         TIMESTAMPDIFF(
  SECOND,
  last_sent_at,
  UTC_TIMESTAMP()
) AS elapsed_seconds
       FROM claim_cure_buddy_otp_sessions
       WHERE mobile_number = ?
         AND applicant_type = ?
         AND lan <=> ?
         AND party_no = ?
       ORDER BY id DESC
       LIMIT 1`,
      [mobile, applicantType, lan, partyNo],
    );

    if (latest.length) {
      const elapsed = Math.max(0, Number(latest[0].elapsed_seconds) || 0);

      if (elapsed < OTP_RESEND_SECONDS) {
        return res.status(429).json({
          success: false,
          message: `Wait ${Math.ceil(
            OTP_RESEND_SECONDS - elapsed,
          )} seconds before resending OTP`,
        });
      }
    }

    const otp = String(crypto.randomInt(100000, 1000000));

    await sendSmsOtp(mobile, otp);

    await db.promise().query(
      `INSERT INTO claim_cure_buddy_otp_sessions
       (
         mobile_number,
         applicant_type,
         lan,
         party_no,
         otp_hash,
         expires_at,
         last_sent_at
       )
       VALUES (
         ?,
         ?,
         ?,
         ?,
         ?,
         DATE_ADD(
  UTC_TIMESTAMP(),
  INTERVAL ? SECOND
),
UTC_TIMESTAMP()
       )`,
      [
        mobile,
        applicantType,
        lan,
        partyNo,
        hashOtp(mobile, otp),
        OTP_EXPIRY_SECONDS,
      ],
    );

    const response = {
      success: true,
      message: "OTP sent successfully",
      expiresInSeconds: OTP_EXPIRY_SECONDS,
    };

    if (process.env.CCB_EXPOSE_TEST_OTP === "true") {
      response.testOtp = otp;
    }

    return res.json(response);
  } catch (error) {
    return errorResponse(res, error, "Unable to send OTP");
  }
});

router.post("/otp/verify", async (req, res) => {
  const connection = await db.promise().getConnection();

  try {
    const mobile = clean(req.body.mobile).replace(/\D/g, "");

    const otp = clean(req.body.otp);
    const requestedLan = nullable(req.body.lan);
    const consentText = clean(req.body.consentText);

    const { applicantType, partyNo } = validateParty(
      req.body.applicantType,
      req.body.partyNo,
    );

    if (!isMobile(mobile) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Valid mobile and 6-digit OTP are required",
      });
    }

    if (!consentText) {
      return res.status(400).json({
        success: false,
        message: "Consent is required before OTP verification",
      });
    }

    if (applicantType === "CO_APPLICANT" && !requestedLan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required for co-applicant verification",
      });
    }

    await connection.beginTransaction();

    const sessionSql =
      applicantType === "BORROWER"
        ? `SELECT
             *,
             UTC_TIMESTAMP() AS db_now,
             CASE
               WHEN expires_at <= UTC_TIMESTAMP() THEN 1
               ELSE 0
             END AS is_expired,
             TIMESTAMPDIFF(
           SECOND,
           UTC_TIMESTAMP(),
           expires_at
         ) AS seconds_remaining
           FROM claim_cure_buddy_otp_sessions
           WHERE mobile_number = ?
             AND applicant_type = 'BORROWER'
             AND party_no = 1
           ORDER BY id DESC
           LIMIT 1
           FOR UPDATE`
        : `SELECT
             *,
             UTC_TIMESTAMP() AS db_now,
             CASE
               WHEN expires_at <= UTC_TIMESTAMP() THEN 1
               ELSE 0
             END AS is_expired,
             TIMESTAMPDIFF(
           SECOND,
           UTC_TIMESTAMP(),
           expires_at
         ) AS seconds_remaining
           FROM claim_cure_buddy_otp_sessions
           WHERE mobile_number = ?
             AND applicant_type = 'CO_APPLICANT'
             AND lan = ?
             AND party_no = ?
           ORDER BY id DESC
           LIMIT 1
           FOR UPDATE`;

    const sessionParams =
      applicantType === "BORROWER" ? [mobile] : [mobile, requestedLan, partyNo];

    const [sessions] = await connection.query(sessionSql, sessionParams);

    if (!sessions.length) {
      const error = new Error("OTP session not found");
      error.statusCode = 400;
      throw error;
    }

    const session = sessions[0];

    if (session.verified && session.is_used) {
      await connection.commit();

      return res.json({
        success: true,
        message: "Mobile already verified",
        lan: session.lan || requestedLan,
        partyNo,
      });
    }

    if (session.attempts >= MAX_OTP_ATTEMPTS) {
      const error = new Error(
        "Maximum OTP attempts exceeded. Request a new OTP",
      );
      error.statusCode = 429;
      throw error;
    }

    // The expiry comparison is performed by MySQL.
    // Do not compare the DATETIME using new Date()
    // because Node and MySQL may use different timezones.
    if (Number(session.is_expired) === 1) {
      console.warn("ClaimCureBuddy OTP expired", {
        sessionId: session.id,
        applicantType,
        partyNo,
        dbNow: session.db_now,
        expiresAt: session.expires_at,
        secondsRemaining: session.seconds_remaining,
      });

      const error = new Error("OTP expired. Request a new OTP");
      error.statusCode = 400;
      throw error;
    }

    const suppliedHash = hashOtp(mobile, otp);

    const validHash = crypto.timingSafeEqual(
      Buffer.from(suppliedHash),
      Buffer.from(session.otp_hash),
    );

    if (!validHash) {
      await connection.query(
        `UPDATE claim_cure_buddy_otp_sessions
         SET attempts = attempts + 1
         WHERE id = ?`,
        [session.id],
      );

      await connection.commit();

      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (applicantType === "BORROWER") {
      const identifiers = await generateIdentifiers(connection);

      const [insertResult] = await connection.query(
        `INSERT INTO loan_booking_claim_cure_buddy
           (
             application_id,
             partner_loan_id,
             lan,
             login_date,
             mobile_number,
             borrower_mobile_verified,
             created_by,
             updated_by
           )
           VALUES (
             ?,
             ?,
             ?,
             CURDATE(),
             ?,
             1,
             ?,
             ?
           )`,
        [
          identifiers.applicationId,
          identifiers.partnerLoanId,
          identifiers.lan,
          mobile,
          actorId(req),
          actorId(req),
        ],
      );

      await connection.query(
        `INSERT INTO kyc_verification_status
         (
           lan,
           applicant_type,
           party_no,
           source_applicant_id,
           mobile_number
         )
         VALUES (
           ?,
           'BORROWER',
           1,
           ?,
           ?
         )
         ON DUPLICATE KEY UPDATE
           source_applicant_id =
             VALUES(source_applicant_id),
           mobile_number =
             VALUES(mobile_number)`,
        [identifiers.lan, insertResult.insertId, mobile],
      );

      await connection.query(
        `UPDATE claim_cure_buddy_otp_sessions
         SET
           verified = 1,
           is_used = 1,
           consent_given = 1,
           consent_text = ?,
           consent_at = UTC_TIMESTAMP(),
verified_at = UTC_TIMESTAMP(),
           lan = ?
         WHERE id = ?`,
        [consentText, identifiers.lan, session.id],
      );

      await connection.commit();

      return res.status(201).json({
        success: true,
        message: "Borrower mobile verified and LAN created",
        ...identifiers,
        partyNo: 1,
      });
    }

    const loan = await getLoan(connection, requestedLan, { lock: true });

    assertEditable(loan);

    const [existing] = await connection.query(
      `SELECT *
       FROM claim_cure_buddy_co_applicants
       WHERE lan = ?
         AND party_no = ?
       LIMIT 1
       FOR UPDATE`,
      [requestedLan, partyNo],
    );

    if (
      existing.length &&
      existing[0].mobile_verified &&
      existing[0].mobile_number !== mobile
    ) {
      const error = new Error(
        `Co-applicant ${partyNo} already has a verified mobile. Remove that co-applicant before replacing it`,
      );
      error.statusCode = 409;
      throw error;
    }

    await connection.query(
      `INSERT INTO claim_cure_buddy_co_applicants
       (
         loan_booking_id,
         lan,
         party_no,
         mobile_number,
         mobile_verified,
         created_by,
         updated_by
       )
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
         mobile_number = VALUES(mobile_number),
         mobile_verified = 1,
         updated_by = VALUES(updated_by)`,
      [loan.id, requestedLan, partyNo, mobile, actorId(req), actorId(req)],
    );

    const [[coApplicant]] = await connection.query(
      `SELECT id
         FROM claim_cure_buddy_co_applicants
         WHERE lan = ?
           AND party_no = ?`,
      [requestedLan, partyNo],
    );

    await connection.query(
      `INSERT INTO kyc_verification_status
       (
         lan,
         applicant_type,
         party_no,
         source_applicant_id,
         mobile_number
       )
       VALUES (
         ?,
         'CO_APPLICANT',
         ?,
         ?,
         ?
       )
       ON DUPLICATE KEY UPDATE
         source_applicant_id =
           VALUES(source_applicant_id),
         mobile_number =
           VALUES(mobile_number)`,
      [requestedLan, partyNo, coApplicant.id, mobile],
    );

    await connection.query(
      `UPDATE claim_cure_buddy_otp_sessions
       SET
         verified = 1,
         is_used = 1,
         consent_given = 1,
         consent_text = ?,
         consent_at = NOW(),
         verified_at = NOW()
       WHERE id = ?`,
      [consentText, session.id],
    );

    await connection.commit();

    return res.json({
      success: true,
      message: `Co-applicant ${partyNo} mobile verified and KYC row created`,
      lan: requestedLan,
      partyNo,
    });
  } catch (error) {
    await connection.rollback();

    return errorResponse(res, error, "Unable to verify OTP");
  } finally {
    connection.release();
  }
});

router.post("/pan/verify", async (req, res) => {
  try {
    const lan = clean(req.body.lan);
    const panNumber = upper(req.body.panNumber);
    const customerName = clean(req.body.customerName);

    const { applicantType, partyNo } = validateParty(
      req.body.applicantType,
      req.body.partyNo,
    );

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    if (!isPan(panNumber)) {
      return res.status(400).json({
        success: false,
        message: "Valid PAN number is required",
      });
    }

    if (!customerName) {
      return res.status(400).json({
        success: false,
        message: "Customer name is required for PAN verification",
      });
    }

    const connection = db.promise();
    const loan = await getLoan(connection, lan);

    assertEditable(loan);

    if (applicantType === "CO_APPLICANT") {
      const [coRows] = await connection.query(
        `SELECT *
         FROM claim_cure_buddy_co_applicants
         WHERE lan = ?
           AND party_no = ?
         LIMIT 1`,
        [lan, partyNo],
      );

      if (!coRows.length || !coRows[0].mobile_verified) {
        return res.status(400).json({
          success: false,
          message: `Verify co-applicant ${partyNo} mobile before PAN`,
        });
      }
    } else if (!loan.borrower_mobile_verified) {
      return res.status(400).json({
        success: false,
        message: "Verify borrower mobile before PAN",
      });
    }

    const [duplicate] = await connection.query(
      `SELECT party_no
       FROM kyc_verification_status
       WHERE lan = ?
         AND pan_number = ?
         AND NOT (
           applicant_type = ?
           AND party_no = ?
         )
       LIMIT 1`,
      [lan, panNumber, applicantType, partyNo],
    );

    if (duplicate.length) {
      return res.status(409).json({
        success: false,
        message:
          "This PAN is already used by another applicant in the same loan",
      });
    }

    const [[existingKyc]] = await connection.query(
      `SELECT pan_number
         FROM kyc_verification_status
         WHERE lan = ?
           AND applicant_type = ?
           AND party_no = ?
         LIMIT 1`,
      [lan, applicantType, partyNo],
    );

    const identityChanged = upper(existingKyc?.pan_number) !== panNumber;

    await connection.query(
      `UPDATE kyc_verification_status
   SET
     pan_number = ?,
     pan_status = 'INITIATED',
     bureau_status =
       IF(?, 'PENDING', bureau_status),
     bureau_api_response =
       IF(?, NULL, bureau_api_response),
     aadhaar_status =
       IF(?, 'PENDING', aadhaar_status),
     aadhaar_transaction_id =
       IF(?, NULL, aadhaar_transaction_id),
     aadhaar_kyc_url =
       IF(?, NULL, aadhaar_kyc_url),
     aadhaar_unique_id =
       IF(?, NULL, aadhaar_unique_id)
   WHERE lan = ?
     AND applicant_type = ?
     AND party_no = ?`,
      [
        panNumber,
        identityChanged,
        identityChanged,
        identityChanged,
        identityChanged,
        identityChanged,
        identityChanged,
        lan,
        applicantType,
        partyNo,
      ],
    );

    let panResult;

    try {
      // PAN service remains unchanged.
      // Both PAN and entered customer name are passed.
      panResult = await getPanCardDetails(panNumber, customerName);
    } catch (apiError) {
      panResult = {
        success: false,
        response: apiError.response?.data || {
          message: apiError.message,
        },
      };
    }

    const apiProfile = extractPanProfile(panResult);

    const enteredNameProfile = splitName(customerName);

    const profile = {
      firstName: apiProfile.firstName || enteredNameProfile.firstName,
      lastName: apiProfile.lastName || enteredNameProfile.lastName,
      customerName: apiProfile.customerName || enteredNameProfile.customerName,
    };

    const verified = Boolean(
      panResult?.success && panResult?.nameMatch !== false,
    );

    await connection.query(
      `UPDATE kyc_verification_status
       SET
         pan_status = ?,
         pan_api_response = ?,
         applicant_name = ?,
         pan_number = ?
       WHERE lan = ?
         AND applicant_type = ?
         AND party_no = ?`,
      [
        verified ? "VERIFIED" : "FAILED",
        safeJson(panResult?.response ?? panResult),
        verified ? profile.customerName : customerName,
        panNumber,
        lan,
        applicantType,
        partyNo,
      ],
    );

    if (!verified) {
      return res.status(422).json({
        success: false,
        message:
          panResult?.nameMatch === false
            ? "Customer name does not match the PAN holder name"
            : "PAN verification failed",
        reason: panResult?.reason || "PAN_API_FAILURE",
      });
    }

    if (applicantType === "BORROWER") {
      await connection.query(
        `UPDATE loan_booking_claim_cure_buddy
         SET
           pan_card = ?,
           first_name = ?,
           last_name = ?,
           customer_name = ?,
           bre_status = 'PENDING',
           updated_by = ?
         WHERE lan = ?`,
        [
          panNumber,
          profile.firstName,
          profile.lastName,
          profile.customerName,
          actorId(req),
          lan,
        ],
      );
    } else {
      await connection.query(
        `UPDATE claim_cure_buddy_co_applicants
         SET
           pan_number = ?,
           first_name = ?,
           last_name = ?,
           customer_name = ?,
           bre_status = 'PENDING',
           updated_by = ?
         WHERE lan = ?
           AND party_no = ?`,
        [
          panNumber,
          profile.firstName,
          profile.lastName,
          profile.customerName,
          actorId(req),
          lan,
          partyNo,
        ],
      );
    }

    return res.json({
      success: true,
      message: "PAN verified",
      data: profile,
    });
  } catch (error) {
    return errorResponse(res, error, "PAN verification failed");
  }
});

router.patch("/loan-booking/:lan/basic-details", async (req, res) => {
  try {
    const lan = clean(req.params.lan);
    const data = req.body || {};

    requireFields(
      data,
      ["gender", "borrowerDob", "fatherName", "email"],
      "basic detail",
    );

    const gender = upper(data.gender);
    const email = lower(data.email);

    if (!["MALE", "FEMALE", "OTHER"].includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "Invalid gender",
      });
    }

    if (!isDate(data.borrowerDob) || !isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Valid borrower DOB and email are required",
      });
    }

    if (data.loginDate && !isDate(data.loginDate)) {
      return res.status(400).json({
        success: false,
        message: "loginDate must be YYYY-MM-DD",
      });
    }

    const connection = db.promise();
    const loan = await getLoan(connection, lan);

    assertEditable(loan);

    const [[kyc]] = await connection.query(
      `SELECT pan_status, pan_number
           FROM kyc_verification_status
           WHERE lan = ?
             AND applicant_type = 'BORROWER'
             AND party_no = 1
           LIMIT 1`,
      [lan],
    );

    if (
      !kyc ||
      kyc.pan_status !== "VERIFIED" ||
      !loan.pan_card ||
      kyc.pan_number !== loan.pan_card
    ) {
      return res.status(422).json({
        success: false,
        message: "Borrower PAN must be verified before saving basic details",
      });
    }

    const bureauInputsChanged =
      upper(loan.gender) !== gender ||
      dateOnly(loan.dob) !== dateOnly(data.borrowerDob);

    await connection.query(
      `UPDATE loan_booking_claim_cure_buddy
         SET
           login_date =
             COALESCE(?, login_date),
           gender = ?,
           dob = ?,
           father_name = ?,
           email = ?,
           stage = 'Address',
           bre_status = 'PENDING',
           updated_by = ?
         WHERE lan = ?`,
      [
        nullable(data.loginDate),
        gender,
        data.borrowerDob,
        clean(data.fatherName),
        email,
        actorId(req),
        lan,
      ],
    );

    if (bureauInputsChanged) {
      await resetBureauStatus(connection, lan, "BORROWER", 1);

      await connection.query(
        `UPDATE loan_booking_claim_cure_buddy
     SET
       borrower_pre_bre_status = 'PENDING',
       borrower_pre_bre_reason = NULL,
       borrower_pre_bre_checked_at = NULL
     WHERE lan = ?`,
        [lan],
      );
    }

    return res.json({
      success: true,
      message: "Borrower basic details saved",
      lan,
    });
  } catch (error) {
    return errorResponse(res, error, "Unable to save borrower details");
  }
});

router.post("/aadhaar/init", async (req, res) => {
  try {
    const lan = clean(req.body.lan);

    const { applicantType, partyNo } = validateParty(
      req.body.applicantType,
      req.body.partyNo,
    );

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    const connection = db.promise();
    const loan = await getLoan(connection, lan);

    assertEditable(loan);

    let applicant;

    if (applicantType === "BORROWER") {
      applicant = {
        id: loan.id,
        name: loan.customer_name,
        mobile: loan.mobile_number,
        email: loan.email,
      };
    } else {
      const [rows] = await connection.query(
        `SELECT
           id,
           customer_name AS name,
           mobile_number AS mobile,
           email
         FROM claim_cure_buddy_co_applicants
         WHERE lan = ?
           AND party_no = ?
         LIMIT 1`,
        [lan, partyNo],
      );

      applicant = rows[0];
    }

    if (!applicant?.name || !applicant?.mobile) {
      return res.status(400).json({
        success: false,
        message: `${applicantType} ${partyNo} PAN/name and mobile must be saved first`,
      });
    }

    const [[kyc]] = await connection.query(
      `SELECT *
         FROM kyc_verification_status
         WHERE lan = ?
           AND applicant_type = ?
           AND party_no = ?
         LIMIT 1`,
      [lan, applicantType, partyNo],
    );

    if (kyc?.aadhaar_status === "VERIFIED") {
      return res.json({
        success: true,
        message: "Aadhaar already verified",
        status: "VERIFIED",
      });
    }

    if (kyc?.aadhaar_status === "INITIATED" && kyc?.aadhaar_kyc_url) {
      return res.json({
        success: true,
        message: "Aadhaar already initiated",
        status: "INITIATED",
        kycUrl: kyc.aadhaar_kyc_url,
      });
    }

    await connection.query(
      `INSERT INTO kyc_verification_status
       (
         lan,
         applicant_type,
         party_no,
         source_applicant_id,
         applicant_name,
         mobile_number,
         aadhaar_status
       )
       VALUES (?, ?, ?, ?, ?, ?, 'INITIATED')
       ON DUPLICATE KEY UPDATE
         source_applicant_id =
           VALUES(source_applicant_id),
         applicant_name =
           VALUES(applicant_name),
         mobile_number =
           VALUES(mobile_number),
         aadhaar_status = 'INITIATED'`,
      [
        lan,
        applicantType,
        partyNo,
        applicant.id,
        applicant.name,
        applicant.mobile,
      ],
    );

    let result;

    try {
      result = await initAadhaarKyc(
        lan,
        applicant.mobile,
        applicant.email || "",
        applicant.name,
      );
    } catch (apiError) {
      result = {
        success: false,
        error: apiError.message,
      };
    }

    if (!result?.success) {
      await connection.query(
        `UPDATE kyc_verification_status
         SET aadhaar_status = 'FAILED'
         WHERE lan = ?
           AND applicant_type = ?
           AND party_no = ?`,
        [lan, applicantType, partyNo],
      );

      return res.status(422).json({
        success: false,
        message: "Aadhaar initiation failed",
      });
    }

    await connection.query(
      `UPDATE kyc_verification_status
       SET
         aadhaar_status = 'INITIATED',
         aadhaar_transaction_id = ?,
         aadhaar_kyc_url = ?,
         aadhaar_unique_id = ?
       WHERE lan = ?
         AND applicant_type = ?
         AND party_no = ?`,
      [
        result.unifiedTransactionId,
        result.kycUrl,
        result.uniqueId,
        lan,
        applicantType,
        partyNo,
      ],
    );

    return res.json({
      success: true,
      message: "Aadhaar initiated",
      status: "INITIATED",
      kycUrl: result.kycUrl,
      transactionId: result.unifiedTransactionId,
      uniqueId: result.uniqueId,
      partyNo,
    });
  } catch (error) {
    return errorResponse(res, error, "Aadhaar initiation failed");
  }
});

const parseAadhaarAddress = (raw) => {
  if (!raw) {
    return null;
  }

  let data = raw;

  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return {
        addressLine1: raw,
      };
    }
  }

  const address = data.address || data.data?.address || data;

  const line1 = [address.house, address.street, address.landmark]
    .filter(Boolean)
    .join(", ");

  const city = address.vtc || address.city || address.loc || address.po || "";

  return {
    addressLine1: line1 || address.addressLine1 || address.address_line_1 || "",
    addressLine2:
      address.subdist || address.addressLine2 || address.address_line_2 || "",
    city,
    district: address.dist || address.district || "",
    state: address.state || "",
    pincode: String(address.pc || address.pincode || ""),
  };
};

router.get(
  "/aadhaar/address/:lan/:applicantType/:partyNo",
  async (req, res) => {
    try {
      const lan = clean(req.params.lan);

      const { applicantType, partyNo } = validateParty(
        req.params.applicantType,
        req.params.partyNo,
      );

      const [rows] = await db.promise().query(
        `SELECT
             aadhaar_status,
             aadhaar_name,
             aadhaar_dob,
             aadhaar_masked_number,
             aadhaar_address,
             aadhaar_api_response
           FROM kyc_verification_status
           WHERE lan = ?
             AND applicant_type = ?
             AND party_no = ?
           LIMIT 1`,
        [lan, applicantType, partyNo],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Aadhaar KYC record not found",
        });
      }

      if (rows[0].aadhaar_status !== "VERIFIED") {
        return res.status(409).json({
          success: false,
          status: rows[0].aadhaar_status,
          message: "Aadhaar is not verified yet",
        });
      }

      let aadhaarPayload = null;

      try {
        aadhaarPayload =
          typeof rows[0].aadhaar_api_response === "string"
            ? JSON.parse(rows[0].aadhaar_api_response)
            : rows[0].aadhaar_api_response;
      } catch (_) {
        aadhaarPayload = null;
      }

      const structuredAddress =
        aadhaarPayload?.data?.address ||
        aadhaarPayload?.payload?.data?.address ||
        rows[0].aadhaar_address;

      return res.json({
        success: true,
        status: "VERIFIED",
        aadhaarName: rows[0].aadhaar_name,
        aadhaarDob: rows[0].aadhaar_dob,
        aadhaarMaskedNumber: rows[0].aadhaar_masked_number,
        rawAddress: rows[0].aadhaar_address,
        address: parseAadhaarAddress(structuredAddress),
      });
    } catch (error) {
      return errorResponse(res, error, "Unable to fetch Aadhaar address");
    }
  },
);

router.patch("/loan-booking/:lan/address", async (req, res) => {
  try {
    const lan = clean(req.params.lan);
    const data = req.body || {};

    const fields = [
      "permanentAddressLine1",
      "permanentCity",
      "permanentDistrict",
      "permanentState",
      "permanentPincode",
      "currentAddressLine1",
      "currentCity",
      "currentDistrict",
      "currentState",
      "currentPincode",
    ];

    requireFields(data, fields, "address");

    if (
      !isPincode(clean(data.permanentPincode)) ||
      !isPincode(clean(data.currentPincode))
    ) {
      return res.status(400).json({
        success: false,
        message: "Permanent and current pincodes must contain 6 digits",
      });
    }

    const connection = db.promise();
    const loan = await getLoan(connection, lan);

    assertEditable(loan);

    await connection.query(
      `UPDATE loan_booking_claim_cure_buddy
         SET
           permanent_address_line_1 = ?,
           permanent_address_line_2 = ?,
           permanent_city = ?,
           permanent_district = ?,
           permanent_state = ?,
           permanent_pincode = ?,
           current_address_line_1 = ?,
           current_address_line_2 = ?,
           current_city = ?,
           current_district = ?,
           current_state = ?,
           current_pincode = ?,
           current_same_as_permanent = ?,
           stage = 'Loan Details',
           bre_status = 'PENDING',
           updated_by = ?
         WHERE lan = ?`,
      [
        clean(data.permanentAddressLine1),
        nullable(data.permanentAddressLine2),
        clean(data.permanentCity),
        clean(data.permanentDistrict),
        clean(data.permanentState),
        clean(data.permanentPincode),
        clean(data.currentAddressLine1),
        nullable(data.currentAddressLine2),
        clean(data.currentCity),
        clean(data.currentDistrict),
        clean(data.currentState),
        clean(data.currentPincode),
        data.currentSameAsPermanent ? 1 : 0,
        actorId(req),
        lan,
      ],
    );

    // await resetBureauStatus(connection, lan, "BORROWER", 1);

    return res.json({
      success: true,
      message: "Borrower addresses saved",
      lan,
    });
  } catch (error) {
    return errorResponse(res, error, "Unable to save addresses");
  }
});

router.patch("/loan-booking/:lan/loan-details", async (req, res) => {
  try {
    const lan = clean(req.params.lan);

    const loanAmount = numeric(req.body.loanAmount, "loanAmount", { min: 1 });

    const interestRate = numeric(req.body.interestRate, "interestRate", {
      min: 0,
    });

    const tenure = numeric(req.body.tenure, "tenure", {
      min: 1,
      integer: true,
    });

    const processingFee = numeric(req.body.processingFee, "processingFee", {
      min: 0,
    });

    const disbursalAmount = numeric(
      req.body.disbursalAmount,
      "disbursalAmount",
      { min: 0 },
    );

    if (loanAmount < 25000 || loanAmount > 100000) {
      return res.status(400).json({
        success: false,
        message: "Loan amount must be between 25000 and 100000",
      });
    }

    if (tenure > 90) {
      return res.status(400).json({
        success: false,
        message: "Loan tenure cannot exceed 90 days",
      });
    }

    if (disbursalAmount > loanAmount) {
      return res.status(400).json({
        success: false,
        message: "Disbursal amount cannot exceed loan amount",
      });
    }

    const connection = db.promise();
    const loan = await getLoan(connection, lan);

    assertEditable(loan);

    const requiredBureauFields = [
      "customer_name",
      "first_name",
      "last_name",
      "dob",
      "gender",
      "pan_card",
      "mobile_number",
      "current_address_line_1",
      "current_city",
      "current_state",
      "current_pincode",
    ];

    const missingBureauFields = requiredBureauFields.filter(
      (field) => clean(loan[field]) === "",
    );

    if (missingBureauFields.length) {
      return res.status(422).json({
        success: false,
        message: `Complete borrower details before running pre-BRE: ${missingBureauFields.join(", ")}`,
        missingFields: missingBureauFields,
      });
    }

    const [[borrowerKyc]] = await connection.query(
      `SELECT pan_status, pan_number
   FROM kyc_verification_status
   WHERE lan = ?
     AND applicant_type = 'BORROWER'
     AND party_no = 1
   LIMIT 1`,
      [lan],
    );

    if (
      borrowerKyc?.pan_status !== "VERIFIED" ||
      upper(borrowerKyc?.pan_number) !== upper(loan.pan_card)
    ) {
      return res.status(422).json({
        success: false,
        message:
          "Borrower PAN must be verified and match the saved borrower PAN before running pre-BRE",
      });
    }

    await connection.query(
      `UPDATE loan_booking_claim_cure_buddy
         SET
           loan_amount = ?,
           interest_rate = ?,
           loan_tenure = ?,
           processing_fee = ?,
           disbursal_amount = ?,
           stage = 'Loan Details',
           borrower_pre_bre_status = 'RUNNING',
           borrower_pre_bre_reason = NULL,
           borrower_pre_bre_checked_at = NULL,
           bre_status = 'PENDING',
           updated_by = ?
         WHERE lan = ?`,
      [
        loanAmount,
        interestRate,
        tenure,
        processingFee,
        disbursalAmount,
        actorId(req),
        lan,
      ],
    );

    const updatedLoan = await getLoan(connection, lan);

    let preBreDecision;

    try {
      preBreDecision = await runApplicantBureau({
        loan: updatedLoan,
        applicant: updatedLoan,
        applicantType: "BORROWER",
        partyNo: 1,
        evaluationMode: "PRE_BRE",
      });
    } catch (bureauError) {
      await connection.query(
        `UPDATE loan_booking_claim_cure_buddy
           SET
             borrower_pre_bre_status = 'ERROR',
             borrower_pre_bre_reason = ?,
             borrower_pre_bre_checked_at = NOW(),
             stage = 'Co-Applicants',
             bre_status = 'PENDING',
             updated_by = ?
           WHERE lan = ?`,
        [
          safeJson({
            stage: "BORROWER_PRE_BRE",
            reasons: [bureauError.message],
            retryable: true,
          }),
          actorId(req),
          lan,
        ],
      );

      return res.json({
        success: true,
        lan,
        eligible: null,
        retryable: true,
        canProceed: true,
        deviationRequired: true,
        status: updatedLoan.status,
        borrowerPreBreStatus: "ERROR",
        message:
          "Borrower bureau check could not be completed. The case may continue and the bureau can be retried later",
        reason: bureauError.message,
      });
    }

    if (preBreDecision.status !== "APPROVED") {
      await connection.query(
        `UPDATE loan_booking_claim_cure_buddy
     SET
       stage = 'Co-Applicants',
       borrower_pre_bre_status = 'REJECTED',
       borrower_pre_bre_reason = ?,
       borrower_pre_bre_checked_at = NOW(),
       bre_status = 'PENDING',
       bre_reason = NULL,
       bre_checked_at = NULL,
       rejected_at = NULL,
       updated_by = ?
     WHERE lan = ?`,
        [safeJson(preBreDecision), actorId(req), lan],
      );

      return res.json({
        success: true,
        lan,
        eligible: false,
        canProceed: true,
        deviationRequired: true,
        status: updatedLoan.status,
        borrowerPreBreStatus: "REJECTED",
        bureauReused: Boolean(preBreDecision.bureauReused),
        message:
          "Borrower pre-BRE did not meet the standard policy. The case may continue for credit-team deviation",
        preBreDecision,
      });
    }

    await connection.query(
      `UPDATE loan_booking_claim_cure_buddy
         SET
           stage = 'Co-Applicants',
           borrower_pre_bre_status =
             'APPROVED',
           borrower_pre_bre_reason = ?,
           borrower_pre_bre_checked_at =
             NOW(),
           bre_status = 'PENDING',
           bre_reason = NULL,
           updated_by = ?
         WHERE lan = ?`,
      [safeJson(preBreDecision), actorId(req), lan],
    );

    return res.json({
      success: true,
      eligible: true,
      canProceed: true,
      deviationRequired: false,
      lan,
      status: updatedLoan.status,
      borrowerPreBreStatus: "APPROVED",
      bureauReused: Boolean(preBreDecision.bureauReused),
      message: preBreDecision.bureauReused
        ? "Borrower remains eligible. The stored bureau report was reused"
        : "Borrower is eligible. Bureau check completed successfully",
      preBreDecision,
    });
  } catch (error) {
    return errorResponse(res, error, "Unable to save loan details");
  }
});

router.patch("/loan-booking/:lan/co-applicants/:partyNo", async (req, res) => {
  try {
    const lan = clean(req.params.lan);
    const partyNo = Number(req.params.partyNo);

    validateParty("CO_APPLICANT", partyNo);

    const data = req.body || {};

    requireFields(
      data,
      [
        "gender",
        "dob",
        "email",
        "addressLine1",
        "city",
        "district",
        "state",
        "pincode",
      ],
      "co-applicant",
    );

    const gender = upper(data.gender);
    const email = lower(data.email);

    if (
      !["MALE", "FEMALE", "OTHER"].includes(gender) ||
      !isDate(data.dob) ||
      !isEmail(email) ||
      !isPincode(clean(data.pincode))
    ) {
      return res.status(400).json({
        success: false,
        message: "Co-applicant gender, DOB, email, or pincode is invalid",
      });
    }

    const connection = db.promise();
    const loan = await getLoan(connection, lan);

    assertEditable(loan);

    const [[coApplicant]] = await connection.query(
      `SELECT *
           FROM claim_cure_buddy_co_applicants
           WHERE lan = ?
             AND party_no = ?
           LIMIT 1`,
      [lan, partyNo],
    );

    if (!coApplicant?.mobile_verified) {
      return res.status(422).json({
        success: false,
        message: `Co-applicant ${partyNo} mobile must be verified first`,
      });
    }

    const [[kyc]] = await connection.query(
      `SELECT
             pan_status,
             pan_number
           FROM kyc_verification_status
           WHERE lan = ?
             AND applicant_type = 'CO_APPLICANT'
             AND party_no = ?
           LIMIT 1`,
      [lan, partyNo],
    );

    if (
      !kyc ||
      kyc.pan_status !== "VERIFIED" ||
      !coApplicant.pan_number ||
      kyc.pan_number !== coApplicant.pan_number
    ) {
      return res.status(422).json({
        success: false,
        message: `Co-applicant ${partyNo} PAN must be verified first`,
      });
    }

    await connection.query(
      `UPDATE claim_cure_buddy_co_applicants
         SET
           gender = ?,
           dob = ?,
           email = ?,
           address_line_1 = ?,
           address_line_2 = ?,
           city = ?,
           district = ?,
           state = ?,
           pincode = ?,
           bre_status = 'PENDING',
           updated_by = ?
         WHERE lan = ?
           AND party_no = ?`,
      [
        gender,
        data.dob,
        email,
        clean(data.addressLine1),
        nullable(data.addressLine2),
        clean(data.city),
        clean(data.district),
        clean(data.state),
        clean(data.pincode),
        actorId(req),
        lan,
        partyNo,
      ],
    );

    await connection.query(
      `UPDATE loan_booking_claim_cure_buddy
         SET
           stage = 'Co-Applicants',
           bre_status = 'PENDING',
           updated_by = ?
         WHERE lan = ?`,
      [actorId(req), lan],
    );

    await resetBureauStatus(connection, lan, "CO_APPLICANT", partyNo);

    return res.json({
      success: true,
      message: `Co-applicant ${partyNo} saved`,
      lan,
      partyNo,
    });
  } catch (error) {
    return errorResponse(res, error, "Unable to save co-applicant");
  }
});

router.delete("/loan-booking/:lan/co-applicants/:partyNo", async (req, res) => {
  const connection = await db.promise().getConnection();

  try {
    const lan = clean(req.params.lan);
    const partyNo = Number(req.params.partyNo);

    validateParty("CO_APPLICANT", partyNo);

    await connection.beginTransaction();

    const loan = await getLoan(connection, lan, { lock: true });

    assertEditable(loan);

    await connection.query(
      `DELETE FROM kyc_verification_status
         WHERE lan = ?
           AND applicant_type = 'CO_APPLICANT'
           AND party_no = ?`,
      [lan, partyNo],
    );

    const [result] = await connection.query(
      `DELETE FROM claim_cure_buddy_co_applicants
           WHERE lan = ?
             AND party_no = ?`,
      [lan, partyNo],
    );

    await connection.query(
      `UPDATE loan_booking_claim_cure_buddy
         SET
           bre_status = 'PENDING',
           updated_by = ?
         WHERE lan = ?`,
      [actorId(req), lan],
    );

    await connection.commit();

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Co-applicant not found",
      });
    }

    return res.json({
      success: true,
      message: `Co-applicant ${partyNo} removed`,
    });
  } catch (error) {
    await connection.rollback();

    return errorResponse(res, error, "Unable to remove co-applicant");
  } finally {
    connection.release();
  }
});

router.patch("/loan-booking/:lan/bank-details", async (req, res) => {
  try {
    const lan = clean(req.params.lan);
    const data = req.body || {};

    requireFields(
      data,
      [
        "accountHolderName",
        "bankName",
        "accountNumber",
        "ifscCode",
        "branchAddress",
      ],
      "bank",
    );

    const ifsc = upper(data.ifscCode);

    if (!isIfsc(ifsc) || !/^\d{6,20}$/.test(clean(data.accountNumber))) {
      return res.status(400).json({
        success: false,
        message: "Valid account number and IFSC are required",
      });
    }

    const connection = db.promise();
    const loan = await getLoan(connection, lan);

    assertEditable(loan);

    await connection.query(
      `UPDATE loan_booking_claim_cure_buddy
         SET
           customer_name_as_per_bank = ?,
           customer_bank_name = ?,
           customer_account_number = ?,
           bank_ifsc_code = ?,
           bank_branch_address = ?,
           status = 'Login',
           stage = 'Bank Details',
           bre_status = 'PENDING',
           updated_by = ?
         WHERE lan = ?`,
      [
        clean(data.accountHolderName),
        clean(data.bankName),
        clean(data.accountNumber),
        ifsc,
        clean(data.branchAddress),
        actorId(req),
        lan,
      ],
    );

    return res.json({
      success: true,
      message: "Bank details saved. Case status is Login",
      lan,
      status: "Login",
    });
  } catch (error) {
    return errorResponse(res, error, "Unable to save bank details");
  }
});

const applicantMissingFields = (applicant, fields) =>
  fields.filter(
    (field) =>
      applicant[field] === null ||
      applicant[field] === undefined ||
      clean(applicant[field]) === "",
  );

const runApplicantBureau = async ({
  loan,
  applicant,
  applicantType,
  partyNo,
  evaluationMode = "FINAL",
}) => {
  const pool = db.promise();

  const [[kyc]] = await pool.query(
    `SELECT
       bureau_status,
       bureau_api_response
     FROM kyc_verification_status
     WHERE lan = ?
       AND applicant_type = ?
       AND party_no = ?
     LIMIT 1`,
    [loan.lan, applicantType, partyNo],
  );

  let rawResponse = kyc?.bureau_api_response;

  let fallbackScore =
    applicant.bureau_score ?? applicant.borrower_bureau_score ?? null;

  const bureauReused = kyc?.bureau_status === "VERIFIED";

  if (bureauReused && !rawResponse) {
    const error = new Error(
      `${applicantType} ${partyNo} bureau status is VERIFIED but bureau_api_response is missing`,
    );

    error.statusCode = 409;
    throw error;
  }

  if (!bureauReused) {
    await pool.query(
      `UPDATE kyc_verification_status
       SET bureau_status = 'INITIATED'
       WHERE lan = ?
         AND applicant_type = ?
         AND party_no = ?`,
      [loan.lan, applicantType, partyNo],
    );

    let bureauResult;

    try {
      bureauResult = await runBureau({
        enquiry_reason: "01",
        customer_name: applicant.customer_name,
        first_name: applicant.first_name,
        last_name: applicant.last_name,
        dob: dateOnly(applicant.dob),
        gender: applicant.gender,
        pan_number: applicant.pan_number || applicant.pan_card,
        mobile_number: applicant.mobile_number,
        current_address: [
          applicant.current_address_line_1 || applicant.address_line_1,
          applicant.current_address_line_2 || applicant.address_line_2,
        ]
          .filter(Boolean)
          .join(", "),
        current_village_city: applicant.current_city || applicant.city,
        current_state: applicant.current_state || applicant.state,
        current_pincode: applicant.current_pincode || applicant.pincode,
        loan_amount: loan.loan_amount,
        loan_tenure: loan.loan_tenure,
      });
    } catch (apiError) {
      bureauResult = {
        success: false,
        response: apiError.response?.data || {
          message: apiError.message,
        },
      };
    }

    rawResponse = bureauResult?.response ?? bureauResult;

    fallbackScore = bureauResult?.score ?? fallbackScore;

    await pool.query(
      `UPDATE kyc_verification_status
       SET
         bureau_status = ?,
         bureau_api_response = ?
       WHERE lan = ?
         AND applicant_type = ?
         AND party_no = ?`,
      [
        bureauResult?.success ? "VERIFIED" : "FAILED",
        safeJson(rawResponse),
        loan.lan,
        applicantType,
        partyNo,
      ],
    );

    if (!bureauResult?.success) {
      const error = new Error(`${applicantType} ${partyNo} bureau API failed`);

      error.statusCode = 422;
      throw error;
    }
  }

  const facts = extractClaimCureBuddyBureauFacts(rawResponse, fallbackScore);

  const decision =
    evaluationMode === "PRE_BRE" && applicantType === "BORROWER"
      ? evaluateClaimCureBuddyBorrowerPreBre({
          facts,
          loan,
        })
      : evaluateClaimCureBuddyApplicant({
          applicantType,
          partyNo,
          facts,
          applicant,
          loan,
        });

  if (applicantType === "BORROWER") {
    await pool.query(
      `UPDATE loan_booking_claim_cure_buddy
       SET
         borrower_bureau_score = ?,
         borrower_bureau_facts = ?
       WHERE lan = ?`,
      [facts.score, safeJson(decision.facts), loan.lan],
    );
  } else {
    await pool.query(
      `UPDATE claim_cure_buddy_co_applicants
       SET
         bureau_score = ?,
         bureau_facts = ?,
         bre_status = ?,
         bre_reason = ?
       WHERE lan = ?
         AND party_no = ?`,
      [
        facts.score,
        safeJson(decision.facts),
        decision.status,
        safeJson(decision.reasons),
        loan.lan,
        partyNo,
      ],
    );
  }

  return {
    ...decision,
    bureauReused,
  };
};

router.post("/loan-booking/:lan/final-submit", async (req, res) => {
  const connection = await db.promise().getConnection();

  let loan;
  let coApplicants;

  try {
    const lan = clean(req.params.lan);

    await connection.beginTransaction();

    loan = await getLoan(connection, lan, { lock: true });

    if (!loan) {
      const error = new Error("ClaimCureBuddy loan booking not found");
      error.statusCode = 404;
      throw error;
    }

    if (TERMINAL_STATUSES.has(loan.status)) {
      await connection.commit();
      connection.release();

      let storedReason = [];

      try {
        storedReason = loan.bre_reason ? JSON.parse(loan.bre_reason) : [];
      } catch (_) {
        storedReason = [];
      }

      return res.json({
        success: true,
        message: `Case is already ${loan.status}`,
        lan,
        status: loan.status,
        breStatus: loan.bre_status,
        breReason: storedReason,
      });
    }

    if (loan.status !== "Login") {
      const error = new Error(
        "Save bank details first so the case status becomes Login",
      );
      error.statusCode = 409;
      throw error;
    }

    if (loan.bre_status === "RUNNING") {
      const error = new Error("Final BRE is already running for this LAN");
      error.statusCode = 409;
      throw error;
    }

    const borrowerRequired = [
      "pan_card",
      "first_name",
      "last_name",
      "customer_name",
      "gender",
      "dob",
      "father_name",
      "email",
      "permanent_address_line_1",
      "permanent_city",
      "permanent_district",
      "permanent_state",
      "permanent_pincode",
      "current_address_line_1",
      "current_city",
      "current_district",
      "current_state",
      "current_pincode",
      "loan_amount",
      "interest_rate",
      "loan_tenure",
      "processing_fee",
      "disbursal_amount",
      "customer_name_as_per_bank",
      "customer_bank_name",
      "customer_account_number",
      "bank_ifsc_code",
      "bank_branch_address",
    ];

    const borrowerMissing = applicantMissingFields(loan, borrowerRequired);

    if (borrowerMissing.length) {
      const error = new Error(
        `Loan data is incomplete: ${borrowerMissing.join(", ")}`,
      );
      error.statusCode = 422;
      throw error;
    }

    const [coRows] = await connection.query(
      `SELECT *
           FROM claim_cure_buddy_co_applicants
           WHERE lan = ?
           ORDER BY party_no`,
      [lan],
    );

    coApplicants = coRows;

    const coRequired = [
      "mobile_number",
      "pan_number",
      "first_name",
      "customer_name",
      "gender",
      "dob",
      "email",
      "address_line_1",
      "city",
      "district",
      "state",
      "pincode",
    ];

    for (const co of coApplicants) {
      const missing = applicantMissingFields(co, coRequired);

      if (!co.mobile_verified || missing.length) {
        const error = new Error(
          `Co-applicant ${co.party_no} is incomplete: ${
            missing.join(", ") || "mobile verification"
          }`,
        );

        error.statusCode = 422;
        throw error;
      }
    }

    const [kycRows] = await connection.query(
      `SELECT
             applicant_type,
             party_no,
             pan_status,
             aadhaar_status
           FROM kyc_verification_status
           WHERE lan = ?`,
      [lan],
    );

    const requiredParties = [
      {
        applicantType: "BORROWER",
        partyNo: 1,
      },
      ...coApplicants.map((co) => ({
        applicantType: "CO_APPLICANT",
        partyNo: Number(co.party_no),
      })),
    ];

    const kycErrors = [];

    for (const party of requiredParties) {
      const row = kycRows.find(
        (item) =>
          item.applicant_type === party.applicantType &&
          Number(item.party_no) === party.partyNo,
      );

      if (
        !row ||
        row.pan_status !== "VERIFIED" ||
        row.aadhaar_status !== "VERIFIED"
      ) {
        kycErrors.push({
          applicantType: party.applicantType,
          partyNo: party.partyNo,
          panStatus: row?.pan_status || "MISSING",
          aadhaarStatus: row?.aadhaar_status || "MISSING",
        });
      }
    }

    if (kycErrors.length) {
      const error = new Error(
        "Borrower and every added co-applicant must have verified PAN and Aadhaar",
      );

      error.statusCode = 422;
      error.kycErrors = kycErrors;
      throw error;
    }

    await connection.query(
      `UPDATE loan_booking_claim_cure_buddy
         SET
           bre_status = 'RUNNING',
           stage = 'BRE',
           submitted_at =
             COALESCE(submitted_at, NOW()),
           updated_by = ?
         WHERE lan = ?`,
      [actorId(req), lan],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    connection.release();

    return errorResponse(res, error, "Unable to start final BRE");
  }

  connection.release();

  try {
    const decisions = [];

    decisions.push(
      await runApplicantBureau({
        loan,
        applicant: loan,
        applicantType: "BORROWER",
        partyNo: 1,
      }),
    );

    for (const coApplicant of coApplicants) {
      decisions.push(
        await runApplicantBureau({
          loan,
          applicant: coApplicant,
          applicantType: "CO_APPLICANT",
          partyNo: Number(coApplicant.party_no),
        }),
      );
    }

    const finalDecision = buildFinalDecision(decisions);

    const finalStatus =
      finalDecision.status === "APPROVED" ? "Approved" : "Rejected";

    await db.promise().query(
      `UPDATE loan_booking_claim_cure_buddy
         SET
           status = ?,
           stage = 'Completed',
           bre_status = ?,
           bre_reason = ?,
           bre_checked_at = NOW(),
           approved_at =
             IF(? = 'Approved', NOW(), NULL),
           rejected_at =
             IF(? = 'Rejected', NOW(), NULL)
         WHERE lan = ?
           AND bre_status = 'RUNNING'`,
      [
        finalStatus,
        finalDecision.status,
        safeJson(finalDecision),
        finalStatus,
        finalStatus,
        loan.lan,
      ],
    );

    return res.json({
      success: true,
      message: `Final BRE completed. Case ${finalStatus}`,
      lan: loan.lan,
      status: finalStatus,
      breStatus: finalDecision.status,
      breDecision: finalDecision,
    });
  } catch (error) {
    await db.promise().query(
      `UPDATE loan_booking_claim_cure_buddy
         SET
           status = 'Login',
           bre_status = 'ERROR',
           bre_reason = ?,
           bre_checked_at = NOW()
         WHERE lan = ?
           AND status = 'Login'`,
      [
        safeJson({
          reasons: [error.message],
          type: "BUREAU_API_OR_PROCESSING_ERROR",
        }),
        loan.lan,
      ],
    );

    const statusCode = Number(error.statusCode) || 500;

    if (statusCode >= 500) {
      console.error("ClaimCureBuddy final BRE failed", error);
    }

    return res.status(statusCode).json({
      success: false,
      message:
        "Final BRE could not be completed; case remains at Login and can be retried",
      reason: error.message,
      status: "Login",
      breStatus: "ERROR",
    });
  }
});

router.get("/approved-cases", async (_req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT
             lb.id,
             lb.application_id,
             lb.partner_loan_id,
             lb.lan,
             lb.customer_name,
             lb.mobile_number,
             lb.email,
             lb.pan_card,
             lb.loan_amount,
             lb.disbursal_amount,
             lb.interest_rate,
             lb.loan_tenure,
             lb.login_date,
             lb.approved_at,
             lb.status,
             lb.stage,
             lb.bre_status,
             lb.customer_name_as_per_bank,
             lb.customer_bank_name,
             lb.customer_account_number,
             lb.bank_ifsc_code,
             lb.bank_verification_status,
             lb.agreement_esign_status,
             lb.agreement_esign_sent_at,
             lb.agreement_esign_signed_at,
             lb.agreement_esign_reference,
             COALESCE(
               em.status,
               'NOT_STARTED'
             ) AS enach_status,
             em.transaction_id
               AS enach_transaction_id,
             em.payment_url
               AS enach_payment_url,
             em.short_url
               AS enach_short_url,
             em.provider_status
               AS enach_provider_status,
             em.created_at
               AS enach_created_at,
             lb.created_at,
             lb.updated_at
           FROM loan_booking_claim_cure_buddy lb
           LEFT JOIN easebuzz_mandates em
             ON em.id = (
               SELECT em2.id
               FROM easebuzz_mandates em2
               WHERE em2.lan = lb.lan
               ORDER BY em2.id DESC
               LIMIT 1
             )
           WHERE lb.status = 'Approved'
             AND lb.bre_status = 'APPROVED'
           ORDER BY
             COALESCE(
               lb.approved_at,
               lb.updated_at
             ) DESC`,
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    return errorResponse(
      res,
      error,
      "Unable to fetch ClaimCureBuddy approved cases",
    );
  }
});

router.post("/loan-booking/:lan/enach", async (req, res) => {
  try {
    const lan = upper(req.params.lan);
    const data = req.body || {};
    const connection = db.promise();

    const loan = await getLoan(connection, lan);

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "ClaimCureBuddy loan booking not found",
      });
    }

    if (loan.status !== "Approved" || loan.bre_status !== "APPROVED") {
      return res.status(409).json({
        success: false,
        message: "eNACH can be initiated only after the case is BRE approved",
      });
    }

    const missingBankFields = [
      ["customer_name_as_per_bank", loan.customer_name_as_per_bank],
      ["customer_account_number", loan.customer_account_number],
      ["bank_ifsc_code", loan.bank_ifsc_code],
    ]
      .filter(([, value]) => !clean(value))
      .map(([field]) => field);

    if (missingBankFields.length) {
      return res.status(422).json({
        success: false,
        message: `Saved bank details are incomplete: ${missingBankFields.join(", ")}`,
        missingFields: missingBankFields,
      });
    }

    if (
      !isMobile(clean(loan.mobile_number)) ||
      !clean(loan.email) ||
      !isEmail(clean(loan.email))
    ) {
      return res.status(422).json({
        success: false,
        message:
          "Valid borrower mobile number and email are required for eNACH",
      });
    }

    const accountType = upper(data.accountType || "SAVINGS");

    const authMode = clean(data.authMode || "NetBanking");

    const frequency = upper("AS_PRESENTED");

    const amountRule = upper(data.amountRule || "MAX");

    const maxDebitAmount = numeric(data.maxDebitAmount, "maxDebitAmount", {
      min: 1,
    });

    const finalCollectionDate = clean(data.finalCollectionDate);

    const expiryDate = nullable(data.expiryDate);

    if (!["SAVINGS", "CURRENT"].includes(accountType)) {
      return res.status(400).json({
        success: false,
        message: "accountType must be SAVINGS or CURRENT",
      });
    }

    if (!isDate(finalCollectionDate)) {
      return res.status(400).json({
        success: false,
        message: "finalCollectionDate must be YYYY-MM-DD",
      });
    }

    if (expiryDate && !isDate(expiryDate)) {
      return res.status(400).json({
        success: false,
        message: "expiryDate must be YYYY-MM-DD",
      });
    }

    if (expiryDate && expiryDate > finalCollectionDate) {
      return res.status(400).json({
        success: false,
        message:
          "eNACH link expiry date cannot be after the final collection date",
      });
    }

    const ifsc = upper(loan.bank_ifsc_code);

    const bankCode = ifsc.slice(0, 4);

    const result = await createEnachAuthorizationLink({
      lan: loan.lan,
      name: clean(loan.customer_name_as_per_bank || loan.customer_name),
      phone: clean(loan.mobile_number),
      email: lower(loan.email),
      linkAmount: "1.00",
      maxDebitAmount,
      finalCollectionDate,
      expiryDate,
      accountNumber: clean(loan.customer_account_number),
      accountType,
      ifsc,
      bankCode,
      authMode,
      amountRule,
      frequency,
      message: `ClaimCureBuddy eNACH authorization for ${loan.lan}`,
      udf1: loan.lan,
      udf2: "ClaimCureBuddy",
      udf3: loan.partner_loan_id || "",
      createdBy: actorId(req),
    });

    return res.status(201).json({
      success: true,
      message: "Easebuzz eNACH authorization link created",
      data: result,
    });
  } catch (error) {
    return errorResponse(
      res,
      error,
      "Unable to create ClaimCureBuddy eNACH link",
    );
  }
});

// Keep this static route above /loan-booking/:lan.
// Otherwise Express treats "draft-cases" as a LAN.
// Keep this route ABOVE router.get("/loan-booking/:lan")
router.get("/loan-booking/draft-cases", async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT
          id,
          application_id,
          partner_loan_id,
          lan,
          lender,
          product,
          login_date,
          customer_name,
          first_name,
          last_name,
          mobile_number,
          pan_card,
          pan_card AS pan_number,
          loan_amount,
          status,
          stage,
          bre_status,
          created_at,
          updated_at
       FROM loan_booking_claim_cure_buddy
       WHERE status IN ('Draft', 'Login')
         AND lan LIKE 'CCB%'
       ORDER BY updated_at DESC, id DESC`,
    );

    return res.status(200).json(rows);
  } catch (error) {
    console.error("ClaimCureBuddy draft cases error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch ClaimCureBuddy draft cases",
    });
  }
});

// Keep this parameter route below all static
// /loan-booking routes.
router.get("/loan-booking/:lan", async (req, res) => {
  try {
    const lan = clean(req.params.lan);
    const pool = db.promise();

    const loan = await getLoan(pool, lan);

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "ClaimCureBuddy loan booking not found",
      });
    }

    const [coApplicants, kyc] = await Promise.all([
      pool.query(
        `SELECT *
             FROM claim_cure_buddy_co_applicants
             WHERE lan = ?
             ORDER BY party_no`,
        [lan],
      ),
      pool.query(
        `SELECT
               id,
               lan,
               applicant_type,
               party_no,
               source_applicant_id,
               applicant_name,
               mobile_number,
               pan_number,
               pan_status,
               aadhaar_status,
               bureau_status,
               aadhaar_kyc_url,
               aadhaar_name,
               aadhaar_masked_number,
               aadhaar_dob,
               aadhaar_address
             FROM kyc_verification_status
             WHERE lan = ?
             ORDER BY
               applicant_type,
               party_no`,
        [lan],
      ),
    ]);

    return res.json({
      success: true,
      data: {
        loan,
        coApplicants: coApplicants[0],
        kycStatuses: kyc[0],
      },
    });
  } catch (error) {
    return errorResponse(res, error, "Unable to fetch ClaimCureBuddy booking");
  }
});

// operastion approval loans list

// router.get("/ops-approvals-loans", async (req, res) => {
//   try {
//     const [rows] = await db
//       .promise()
//       .query(
//         `Select * from loan_booking_claim_cure_buddy where status = 'Approved'`,
//       );
//     return res.status(200).json(rows);
//   } catch (error) {
//     console.error("ClaimCureBuddy ops approvals error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Unable to fetch ClaimCureBuddy ops approvals",
//     });
//   }
// });

module.exports = router;