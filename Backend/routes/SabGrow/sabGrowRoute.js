const express = require("express");

const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const authenticateUser = require("../../middleware/verifyToken");
const { sendClientWebhook } = require("./sabGrowWebhookService");
// const { approveAndInitiatePayout } = require("../../services/payout.service");

const { runBureau } = require("../../services/Bueraupullapiservice");
const { runBRE } = require("./sabGrowBre");
const { screenLoanBooking } = require("../../services/trackwizz/screeningService");

const router = express.Router();


const TABLE_NAME = "loan_booking_sabgrow";

const SEQUENCE_KEY = "SABGROW_BUSINESS_LOAN";
const LENDER = "SabGrow";
const PRODUCT = "SabGrow";
const LOAN_TYPE = "Business Loan";
const LAN_PREFIX = "SBR";
const AML_SCREENING_PRODUCT = "sabgrow";
const SABGROW_DUMMY_BUREAU =
    process.env.SABGROW_DUMMY_BUREAU === "true";
const SABGROW_AML_COLUMNS = [
    "aml_status",
    "aml_score",
    "aml_total_matches",
    "aml_reason",
    "aml_api_response",
    "aml_checked_at",
];

function clean(value) {
    return String(value ?? "").trim();
}


function digitsOnly(value) {
    return clean(value).replace(/\D/g, "");
}


function nullIfEmpty(value) {
    const text = clean(value);
    return text || null;
}

function getUserName(req) {
  return req.user?.name || req.user?.id || null;
}

function upperOrNull(value) {
    const text = clean(value);
    return text ? text.toUpperCase() : null;
}


function todayDate() {
    return new Date().toISOString().slice(0, 10);
}


function calculateAgeFromDob(dob) {

    if (!dob) return null;

    const birth = new Date(dob);

    if (isNaN(birth))
        return null;


    const today = new Date();

    let age =
        today.getFullYear()
        -
        birth.getFullYear();


    const month =
        today.getMonth()
        -
        birth.getMonth();


    if (month < 0 ||
        (month === 0 && today.getDate() < birth.getDate())) {
        age--;
    }


    return age;
}

function sendServerError(res, error) {
    console.error("[SABGROW] Route error:", error);
    const messages = {
        ER_NO_SUCH_TABLE:"SabGrow table is missing",
        ER_BAD_FIELD_ERROR: "SabGrow table columns do not match API code",
        ER_DUP_ENTRY: "Duplicate SabGrow login"

    };
    return res.status(
        error.code === "ER_DUP_ENTRY" ? 409 : 500
    ).json({
        success:false,
        message:
            messages[error.code] ||
            "Something went wrong",
        error:
            error.sqlMessage ||
            error.message
    });
}

async function getSabGrowCaseByLan(lan) {
  const [[loan]] = await db.promise().query(
    `
    SELECT
      id,
      lan,
      requested_amount,
      status
    FROM ${TABLE_NAME}
    WHERE lan = ?
    LIMIT 1
    `,
    [lan],
  );

  return loan || null;
}

async function findDuplicateFields(connection, data) {

    const fields = [
        {
            column: "partner_loan_id",
            value: data.partnerLoanId,
            message: "Partner loan id already exists"
        },
        {
            column: "mobile_number",
            value: data.mobile_number,
            message: "Mobile number already exists"
        },
        {
            column: "pan_number",
            value: data.pan_number,
            message: "PAN number already exists"
        }
    ];


    const duplicates = [];


    for (const field of fields) {

        if (!field.value)
            continue;


        const [rows] = await connection.query(
            `
            SELECT id 
            FROM ${TABLE_NAME}
            WHERE ${field.column}=?
            LIMIT 1
            `,
            [field.value]
        );


        if (rows.length) {

            duplicates.push({
                field: field.column,
                message: field.message
            });

        }
    }


    return duplicates;
}



async function generateLoanIds(connection) {

    const [rows] = await connection.query(
        `
        SELECT last_sequence
        FROM loan_sequences
        WHERE lender_name=?
        FOR UPDATE
        `,
        [SEQUENCE_KEY]
    );


    const next =
        rows.length
            ?
            Number(rows[0].last_sequence) + 1
            :
            11000;



    if (rows.length) {

        await connection.query(
            `
            UPDATE loan_sequences
            SET last_sequence=?
            WHERE lender_name=?
            `,
            [
                next,
                SEQUENCE_KEY
            ]
        );

    }
    else {

        await connection.query(
            `
            INSERT INTO loan_sequences
            (
                lender_name,
                last_sequence
            )
            VALUES (?,?)
            `,
            [
                SEQUENCE_KEY,
                next
            ]
        );
    }


    return {

        lan: `${LAN_PREFIX}${next}`

    };

}



async function insertLogin(connection, data, ids, createdBy) {


    const row = {

        partner_loan_id: data.partnerLoanId,

        lan: ids.lan,

        lender: LENDER,

        product: PRODUCT,

        loan_type: LOAN_TYPE,

        login_date: data.login_date,

        age: data.age,

        annual_income: data.annual_income,

        customer_name: data.customer_name,

        mobile_number: data.mobile_number,

        email: data.email,

        pan_number: data.pan_number,

        aadhaar_number: data.aadhaar_number,


        customer_address: data.customer_address,

        customer_pincode: data.customer_pincode,

        customer_city: data.customer_city,

        customer_state: data.customer_state,


        requested_amount: data.requested_amount,


        business_name: data.business_name,

        business_type: data.business_type,

        gst_number: data.gst_number,

        udyam_number: data.udyam_number,


        business_address: data.business_address,

        business_pincode: data.business_pincode,

        business_city: data.business_city,

        business_state: data.business_state,


        status: "Login",

        stage: "Login",

        created_by: createdBy

    };



    const columns = Object.keys(row);

    const placeholders =
        columns.map(() => "?").join(",");



    const [result] = await connection.query(

        `
INSERT INTO ${TABLE_NAME}
(
${columns.join(",")}
)
VALUES
(
${placeholders}
)
`,
        Object.values(row)

    );


    return result.insertId;

}

async function pullAndPersistBureau(lan, data) {

    let bureauResult;

    if (SABGROW_DUMMY_BUREAU) {

        // Dummy bureau
        bureauResult = {
            success: true,
            score: 750,
            response: JSON.stringify({
                source: "DUMMY_BUREAU",
                score: 750
            })
        };

    } else {

        // Real bureau
        bureauResult = await runBureau(data);

    }


    await db.promise().query(
        `
        UPDATE loan_booking_sabgrow
        SET cibil_score = ?
        WHERE lan = ?
        `,
        [
            bureauResult.score,
            lan
        ]
    );

    return bureauResult;
}


async function runSabGrowAml(lan) {

    try {

        // Check AML columns exist before running AML
        await assertSabGrowAmlColumns();


        const aml = await screenLoanBooking(
            AML_SCREENING_PRODUCT,
            lan
        );

        return {

            status: aml.amlStatus || aml.decision,

            score: aml.amlScore || null,

            reason: aml.reason || null

        };

    }
    catch (error) {

        return {

            status: "ERROR",

            reason: error.message

        };

    }

}

async function updateSabGrowAmlStatus(lan, aml) {

    await db.promise().query(
        `
    UPDATE loan_booking_sabgrow
    SET
        aml_status=?,
        aml_score=?,
        aml_reason=?,
        aml_checked_at=NOW()
    WHERE lan=?
    `,
        [
            aml.status,
            aml.score,
            aml.reason,
            lan
        ]
    );

}

async function updateBreStatus(
    insertId,
    bre,
    aml
) {

    let status =
        bre.eligible
            ?
            "bre_approved"
            :
            "bre_rejected";


    await db.promise().query(

        `
UPDATE ${TABLE_NAME}
SET
status=?,
stage=?,
bre_reason=?
WHERE id=?
`,
        [
            status,
            status,
            bre.reason || null,
            insertId
        ]

    );


    return status;

}

async function assertSabGrowAmlColumns() {

    const [rows] =
        await db.promise().query(

            `
SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = ?
AND COLUMN_NAME IN (${SABGROW_AML_COLUMNS.map(() => "?").join(",")})
`,
            [
                TABLE_NAME,
                ...SABGROW_AML_COLUMNS
            ]

        );


    const existing =
        new Set(rows.map(row => row.COLUMN_NAME));


    const missing =
        SABGROW_AML_COLUMNS.filter(
            column => !existing.has(column)
        );



    if (missing.length) {

        const error =
            new Error(
                `SabGrow AML columns missing: ${missing.join(", ")}`
            );

        error.code = "SABGROW_AML_COLUMNS_MISSING";

        throw error;

    }

}

async function updateCreditStatus(lan, status, updatedBy) {
    const [result] = await db.promise().query(
        `UPDATE ${TABLE_NAME}
     SET status = ?,
         stage = ?,
         updated_by = ?
     WHERE lan = ?
       AND status = 'bre_approved'`,
        [status, status, updatedBy, lan],
    );

    if (!result.affectedRows) {
        return null;
    }

    const [[loan]] = await db.promise().query(
        `SELECT
       lan,
       customer_name,
       mobile_number,
       requested_amount,
       COALESCE(loan_amount, requested_amount) AS approved_amount
     FROM ${TABLE_NAME}
     WHERE lan = ?
     LIMIT 1`,
        [lan],
    );

    return loan || null;
}


function sendSabGrowCreditDecisionWebhook(loan, status, decidedBy) {
  const approved = status === "credit_approved";
  const payload = {
    event: approved ? "LOAN_APPROVED" : "LOAN_REJECTED",
    lan: loan.lan,
    customer_name: loan.customer_name,
    mobile_number: loan.mobile_number,
    requested_amount: Number(loan.requested_amount),
    status,
    decision: approved ? "APPROVED" : "REJECTED",
    decided_by: decidedBy,
    decided_at: new Date().toISOString(),
  };

  if (approved) {
    payload.approved_amount = Number(loan.approved_amount);
  }

  setImmediate(() => {
    sendClientWebhook(payload).catch((error) => {
      console.error("[SABGROW] Credit decision webhook error", {
        lan: loan.lan,
        message: error.message,
      });
    });
  });
}

function normalizeStatus(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}


function readNumber(value) {
  const text = clean(value).replace(/,/g, "");
  return text ? Number(text) : NaN;
}
function cleanAccountNumber(value) {
  return clean(value).replace(/\s+/g, "");
}


function isValidDate(value) {
  const dateText = clean(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return false;
  }

  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidIfsc(value) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean(value).toUpperCase());
}

function roundAmount(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculateEmi(loanAmount, interest, tenure) {
  const monthlyRate = interest / 12 / 100;

  if (monthlyRate === 0) {
    return loanAmount / tenure;
  }

  const multiplier = Math.pow(1 + monthlyRate, tenure);
  return (loanAmount * monthlyRate * multiplier) / (multiplier - 1);
}

async function fetchSabGrowOpsCheckerLoan(lan) {

  const [[loan]] = await db.promise().query(
    `
    SELECT
      lan,
      partner_loan_id,
      status
    FROM ${TABLE_NAME}
    WHERE lan = ?
    LIMIT 1
    `,
    [lan]
  );

  return loan || null;
}

async function getSabGrowOpsCheckerColumns() {

  const [rows] = await db.promise().query(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    `,
    [TABLE_NAME]
  );

  return new Set(
    rows.map(row => row.COLUMN_NAME)
  );
}

async function updateSabGrowOpsCheckerStatus({
  lan,
  status,
  stage = status,
  opsCheckerId = null,
  opsCheckerName = null,
  updatedBy = null,
}) {

  const fields = [
    "status = ?",
    "stage = ?",
    "updated_by = ?",
  ];

  const params = [
    status,
    stage,
    updatedBy || opsCheckerName || null,
  ];

  const columns = await getSabGrowOpsCheckerColumns();

  if (columns.has("ops_checker_id")) {
    fields.push("ops_checker_id = ?");
    params.push(opsCheckerId || null);
  }

  if (columns.has("ops_checker_name")) {
    fields.push("ops_checker_name = ?");
    params.push(opsCheckerName || null);
  }

  const [result] = await db.promise().query(
    `
    UPDATE ${TABLE_NAME}
    SET ${fields.join(", ")}
    WHERE lan = ?
    `,
    [...params, lan]
  );

  return result;
}
async function fetchLatestSabGrowPayout(lan) {

  const [[transfer]] = await db.promise().query(
    `
    SELECT
      unique_request_number,
      status,
      payout_status
    FROM quick_transfers
    WHERE lan = ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [lan]
  );

  return transfer || null;
}

function readSabGrowFinalLoanData(body) {
  return {
    loan_amount: readNumber(body.loan_amount),

    loan_tenure: readNumber(
      body.loan_tenure ?? body.tenure
    ),

    interest: readNumber(
      body.interest ??
      body.interest_rate ??
      body.intrest_rate ??
      body.intrests_rate
    ),

    umrn: clean(body.umrn).toUpperCase(),

    sanction_date: clean(
      body.sanction_date ??
      body.saction_date
    ),

    processing_fee: clean(body.processing_fee)
      ? readNumber(body.processing_fee)
      : null,

    processing_fee_percent: clean(body.processing_fee_percent)
      ? readNumber(body.processing_fee_percent)
      : null,

    insurance_amount: clean(body.insurance_amount)
      ? readNumber(body.insurance_amount)
      : null,

    pre_emi_interest: clean(
      body.pre_emi_interest ??
      body.pre_emi_interest_amount
    )
      ? readNumber(
          body.pre_emi_interest ??
          body.pre_emi_interest_amount
        )
      : null,

    name_in_bank: clean(
      body.name_in_bank ??
      body.account_holder_name ??
      body.beneficiary_name ??
      body.bank_account_holder_name ??
      body.customer_name_as_per_bank
    ),

    bank_name: nullIfEmpty(
      body.bank_name ??
      body.bankName
    ),

    account_number: cleanAccountNumber(
      body.account_number ??
      body.bank_account_number ??
      body.customer_account_number ??
      body.bank_ac_number
    ),

    ifsc: clean(
      body.ifsc ??
      body.ifsc_code ??
      body.bank_ifsc_code ??
      body.bank_ifsc
    ).toUpperCase(),
  };
}

function validateSabGrowFinalLoanData(data, savedCase) {

  const requestedAmount =
    Number(savedCase.requested_amount);


  if (
    !Number.isFinite(data.loan_amount) ||
    data.loan_amount <= 0
  ) {
    return "loan_amount is required";
  }


  if (
    data.loan_amount < 10000 ||
    data.loan_amount > 200000
  ) {
    return "loan_amount must be between 10,000 and 2,00,000";
  }


  if (data.loan_amount > requestedAmount) {
    return "loan_amount must be less than or equal to requested_amount";
  }


  if (
    !Number.isInteger(data.loan_tenure) ||
    data.loan_tenure < 6 ||
    data.loan_tenure > 24
  ) {
    return "loan_tenure is required and must be between 6 and 24 months";
  }


  if (
    !Number.isFinite(data.interest) ||
    data.interest < 0 ||
    data.interest > 100
  ) {
    return "interest must be between 0 and 100";
  }


  if (!data.umrn) {
    return "umrn is required";
  }


  if (data.umrn.length > 50) {
    return "umrn must be 50 characters or less";
  }


  if (!isValidDate(data.sanction_date)) {
    return "sanction_date must be a valid date in YYYY-MM-DD format";
  }


  if (!data.name_in_bank) {
    return "name_in_bank is required for payment";
  }


  if (data.name_in_bank.length > 150) {
    return "name_in_bank must be 150 characters or less";
  }


  if (
    data.bank_name &&
    data.bank_name.length > 150
  ) {
    return "bank_name must be 150 characters or less";
  }


  if (!data.account_number) {
    return "account_number is required for payment";
  }


  if (!/^\d{6,30}$/.test(data.account_number)) {
    return "account_number must be 6 to 30 digits";
  }


  if (!data.ifsc) {
    return "ifsc is required for payment";
  }


  if (!isValidIfsc(data.ifsc)) {
    return "ifsc is invalid";
  }


  if (
    data.processing_fee !== null &&
    (
      !Number.isFinite(data.processing_fee) ||
      data.processing_fee < 0
    )
  ) {
    return "processing_fee must be zero or more";
  }


  if (
    data.processing_fee_percent !== null &&
    (
      !Number.isFinite(data.processing_fee_percent) ||
      data.processing_fee_percent < 0 ||
      data.processing_fee_percent > 100
    )
  ) {
    return "processing_fee_percent must be between 0 and 100";
  }


  if (
    data.insurance_amount !== null &&
    (
      !Number.isFinite(data.insurance_amount) ||
      data.insurance_amount < 0
    )
  ) {
    return "insurance_amount must be zero or more";
  }


  if (
    data.pre_emi_interest !== null &&
    (
      !Number.isFinite(data.pre_emi_interest) ||
      data.pre_emi_interest < 0
    )
  ) {
    return "pre_emi_interest must be zero or more";
  }


  return null;
}

function calculateSabGrowFinalAmounts(data) {

  let processingFee = 0;


  if (data.processing_fee !== null) {

    processingFee =
      data.processing_fee;

  } else if (
    data.processing_fee_percent !== null
  ) {

    processingFee =
      (
        data.loan_amount *
        data.processing_fee_percent
      ) / 100;

  }


  const insuranceAmount =
    data.insurance_amount !== null
      ? data.insurance_amount
      : 0;


  const preEmiInterest =
    data.pre_emi_interest !== null
      ? data.pre_emi_interest
      : 0;


  return {

    emi_amount: roundAmount(
      calculateEmi(
        data.loan_amount,
        data.interest,
        data.loan_tenure
      )
    ),

    processing_fee:
      roundAmount(processingFee),

    insurance_amount:
      roundAmount(insuranceAmount),

    pre_emi_interest:
      roundAmount(preEmiInterest),

    net_disbursement:
      roundAmount(
        data.loan_amount -
        processingFee -
        insuranceAmount -
        preEmiInterest
      ),

  };
}

async function saveSabGrowFinalLoanDetails(
  lan,
  data,
  calculation,
  updatedBy
) {

  const [result] = await db.promise().query(
    `
    UPDATE ${TABLE_NAME}

    SET
      loan_amount = ?,
      loan_tenure = ?,
      interest = ?,
      umrn = ?,
      sanction_date = ?,
      name_in_bank = ?,
      bank_name = ?,
      account_number = ?,
      ifsc = ?,

      emi_amount = ?,
      processing_fee = ?,
      insurance_amount = ?,
      pre_emi_interest = ?,
      net_disbursement = ?,

      status = 'ops_initiate',
      stage = 'ops_initiate',
      updated_by = ?

    WHERE lan = ?
      AND status = 'credit_approved'
    `,

    [
      data.loan_amount,
      data.loan_tenure,
      data.interest,
      data.umrn,
      data.sanction_date,
      data.name_in_bank,
      data.bank_name,
      data.account_number,
      data.ifsc,

      calculation.emi_amount,
      calculation.processing_fee,
      calculation.insurance_amount,
      calculation.pre_emi_interest,
      calculation.net_disbursement,

      updatedBy,
      lan,
    ]
  );


  return result.affectedRows > 0;
}

router.post("/loan-booking", verifyApiKey, async (req, res) => {
    let connection;
    let transactionStarted = false;

    try {

        const body = req.body || {};

        const requestedAmount =
            body.requested_amount ??
            body.loan_amount;

        const dob =
            clean(
                body.dob ??
                body.date_of_birth
            );

        const data = {

            login_date: todayDate(),

            partnerLoanId:
                clean(body.partner_loan_id),

            dob,

            age:
                calculateAgeFromDob(dob),

            annual_income:
                body.annual_income || null,

            customer_name:
                clean(body.customer_name),

            mobile_number:
                digitsOnly(body.mobile_number),

            email:
                nullIfEmpty(body.email),

            pan_number:
                upperOrNull(body.pan_number),

            aadhaar_number:
                digitsOnly(
                    body.aadhaar_number
                ),

            customer_address:
                nullIfEmpty(body.customer_address),

            customer_pincode:
                digitsOnly(body.customer_pincode),

            customer_city:
                nullIfEmpty(body.customer_city),

            customer_state:
                nullIfEmpty(body.customer_state),

            requested_amount:
                Number(
                    String(requestedAmount)
                        .replace(/,/g, "")
                ),

            business_name:
                nullIfEmpty(body.business_name),

            business_type:
                nullIfEmpty(body.business_type),

            gst_number:
                upperOrNull(body.gst_number),

            udyam_number:
                upperOrNull(body.udyam_number),

            business_address:
                nullIfEmpty(body.business_address),

            business_pincode:
                digitsOnly(body.business_pincode),


            business_city:
                nullIfEmpty(body.business_city),


            business_state:
                nullIfEmpty(body.business_state)

        };




        connection =
            await db.promise().getConnection();


        await connection.beginTransaction();

        transactionStarted = true;



        const duplicates =
            await findDuplicateFields(
                connection,
                data
            );



        if (duplicates.length) {

            await connection.rollback();


            return res.status(409).json({

                success: false,

                message:
                    duplicates.map(x => x.message).join(",")

            });

        }



        const ids =
            await generateLoanIds(connection);



        const insertId =
            await insertLogin(
                connection,
                data,
                ids,
                req.partner?.name || null
            );



        await connection.commit();


        connection.release();

        connection = null;



        const bureau = await pullAndPersistBureau(
            ids.lan,
            data
        );

        const bre =
            runBRE({

                loan_amount: data.requested_amount,

                age: data.age,

                annual_income: data.annual_income,

                bureau_score: bureau.score

            });



        const aml =
            await runSabGrowAml(ids.lan);

        await updateSabGrowAmlStatus(
            ids.lan,
            aml
        );

        const finalStatus =
            await updateBreStatus(
                insertId,
                bre,
                aml
            );



        return res.status(201).json({

            success: true,

            message: "SabGrow login created",

            data: {

                lan: ids.lan,

                status: finalStatus,

                bureau,

                bre,

                aml

            }

        });



    }
    catch (error) {


        if (connection && transactionStarted)
            await connection.rollback();


        res.status(500).json({

            success: false,

            message: error.message

        });


    }

    finally {

        if (connection)
            connection.release();

    }


});


router.patch("/credit-decision/:lan", authenticateUser, async (req, res) => {

    try {

        const lan =
            clean(req.params.lan).toUpperCase();


        if (!lan.startsWith("SBR")) {
            return res.status(400).json({
                success: false,
                message: "Invalid SabGrow LAN"
            });
        }



        const decision =
            clean(
                req.body?.decision ||
                req.body?.status
            ).toLowerCase();



        const decisionStatusMap = {

            approve: "credit_approved",
            approved: "credit_approved",
            credit_approved: "credit_approved",

            reject: "credit_rejected",
            rejected: "credit_rejected",
            credit_rejected: "credit_rejected"

        };



        const status =
            decisionStatusMap[decision];



        if (!status) {

            return res.status(400).json({

                success: false,

                message: "decision must be approve or reject"

            });

        }



        const updatedBy =
            getUserName(req);



        const loan =
            await updateCreditStatus(
                lan,
                status,
                updatedBy
            );

        if (!loan) {
            return res.status(404).json({
                success: false,
                message:
                    "Case not found or not in bre_approved status"
            });

        }

        sendSabGrowCreditDecisionWebhook( loan, status, updatedBy);

        return res.json({

            success: true,

            message:
                status === "credit_approved"
                    ?
                    "Case credit approved"
                    :
                    "Case credit rejected",

            data: {
                lan,
                status
            }

        });


    }
    catch (error) {

        return sendServerError(res, error);

    }

});

router.patch("/:lan/final-details", async (req, res) => {
  try {
    const lan = clean(req.params.lan).toUpperCase();

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    const savedCase = await getSabGrowCaseByLan(lan);

    if (!savedCase) {
      return res.status(404).json({
        success: false,
        message: "SabGrow case not found",
      });
    }

    if (normalizeStatus(savedCase.status) !== "credit_approved") {
      return res.status(409).json({
        success: false,
        message: "Case must be credit_approved before final details",
      });
    }

    const data = readSabGrowFinalLoanData(req.body || {});

    const validationError = validateSabGrowFinalLoanData(
      data,
      savedCase
    );

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const calculation = calculateSabGrowFinalAmounts(data);

    if (calculation.net_disbursement <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "processing_fee, insurance_amount and pre_emi_interest combined must be less than loan_amount for payment",
      });
    }

    const affectedRows = await saveSabGrowFinalLoanDetails(
      lan,
      data,
      calculation,
      getUserName(req),
    );

    if (!affectedRows) {
      return res.status(409).json({
        success: false,
        message: "Case must be credit_approved before final details",
      });
    }

    return res.json({
      success: true,
      message: "SabGrow final loan details saved",
      data: {
        lan,
        status: "ops_initiate",
        loan_amount: data.loan_amount,
        loan_tenure: data.loan_tenure,
        interest: data.interest,
        umrn: data.umrn,
        sanction_date: data.sanction_date,
        name_in_bank: data.name_in_bank,
        bank_name: data.bank_name,
        account_number: data.account_number,
        ifsc: data.ifsc,
        emi_amount: calculation.emi_amount,
        processing_fee: calculation.processing_fee,
        insurance_amount: calculation.insurance_amount,
        pre_emi_interest: calculation.pre_emi_interest,
        net_disbursement: calculation.net_disbursement,
      },
    });

  } catch (error) {
    console.error("[SABGROW] Final details error", {
      lan: req.params?.lan,
      message: error.message,
      stack: error.stack,
    });

    return sendServerError(res, error);
  }
});

router.put("/:lan/ops-checker-pay", authenticateUser, async (req, res) => {
  try {
    const lan = clean(req.params.lan).toUpperCase();
    const requestedStatus = normalizeStatus(req.body?.status);

    const opsCheckerId =
      req.body?.ops_checker_id || req.user?.id || null;

    const opsCheckerName =
      req.body?.ops_checker_name || getUserName(req) || null;

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    if (!["approved", "ops_rejected", "rejected"].includes(requestedStatus)) {
      return res.status(400).json({
        success: false,
        message: "status must be APPROVED or OPS_REJECTED",
      });
    }

    const loan = await fetchSabGrowOpsCheckerLoan(lan);

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "SabGrow loan not found",
      });
    }

    if (normalizeStatus(loan.status) !== "approved") {
      return res.status(409).json({
        success: false,
        message: "Only Approved SabGrow loans can be handled by Ops Checker",
      });
    }

    // OPS REJECT
    if (["ops_rejected", "rejected"].includes(requestedStatus)) {

      const result = await updateSabGrowOpsCheckerStatus({
        lan,
        status: "OPS_REJECTED",
        stage: "OPS_REJECTED",
        opsCheckerId,
        opsCheckerName,
        updatedBy: opsCheckerName,
      });

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "SabGrow loan not found",
        });
      }

      return res.json({
        success: true,
        status: "SUCCESS",
        lan,
        final_status: "OPS_REJECTED",
        message: "Loan rejected by operations checker successfully",
      });
    }

    // OPS APPROVE
    await updateSabGrowOpsCheckerStatus({
      lan,
      status: "Approved",
      stage: "Approved",
      opsCheckerId,
      opsCheckerName,
      updatedBy: opsCheckerName,
    });

    // Check existing payout
    const activeTransfer = await fetchLatestSabGrowPayout(lan);

    const activePayoutStatus = getPayoutStatus(activeTransfer);

    if (ACTIVE_PAYOUT_STATUSES.has(activePayoutStatus)) {
      return res.status(409).json({
        success: false,
        status: "FAILED",
        message: `Payout already ${activePayoutStatus} for this LAN`,
        payout_status: activePayoutStatus,
        unique_request_number:
          activeTransfer?.unique_request_number || null,
      });
    }

    // Initiate payout
    const payoutResult = await approveAndInitiatePayout({
      lan,
      table: TABLE_NAME,
    });

    if (!payoutResult.success) {
      return res.status(400).json({
        success: false,
        status: "FAILED",
        message:
          payoutResult.message || "Payout initiation failed",
      });
    }

    const finalPayoutStatuses = new Set([
      "success",
      "completed",
      "processed",
    ]);

    const isPayoutFinal = finalPayoutStatuses.has(
      String(payoutResult.payout_status || "").toLowerCase()
    );

    const finalStatus = isPayoutFinal
      ? "Disbursed"
      : "Approved";

    return res.json({
      success: true,
      status: "SUCCESS",
      lan,
      final_status: finalStatus,
      payout_status: payoutResult.payout_status || null,
      unique_request_number:
        payoutResult.unique_request_number || null,
      message:
        "Loan approved by operations checker and payout initiated successfully",
    });

  } catch (error) {

    console.error("[SABGROW] Ops checker payout error", {
      lan: req.params?.lan,
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      status: "FAILED",
      message:
        error.message ||
        "Failed to approve SabGrow payout",
      error:
        error.sqlMessage ||
        error.message,
    });
  }
});



router.post("/test-webhook", async (req, res) => {

    console.log("====== SABGROW WEBHOOK RECEIVED ======");

    console.log(req.body);


    return res.json({
        success: true,
        message: "Webhook received successfully"
    });

}); 






module.exports = router;