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

        ER_NO_SUCH_TABLE:
            "SabGrow table is missing",

        ER_BAD_FIELD_ERROR:
            "SabGrow table columns do not match API code",

        ER_DUP_ENTRY:
            "Duplicate SabGrow login"

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


router.post("/login", verifyApiKey, async (req, res) => {
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

// router.put("/:lan/ops-checker-pay", authenticateUser, async (req, res) => {
//   try {
//     const lan = clean(req.params.lan).toUpperCase();
//     const requestedStatus = normalizeStatus(req.body?.status);

//     const opsCheckerId =
//       req.body?.ops_checker_id || req.user?.id || null;

//     const opsCheckerName =
//       req.body?.ops_checker_name || getUserName(req) || null;

//     if (!lan) {
//       return res.status(400).json({
//         success: false,
//         message: "LAN is required",
//       });
//     }

//     if (!["approved", "ops_rejected", "rejected"].includes(requestedStatus)) {
//       return res.status(400).json({
//         success: false,
//         message: "status must be APPROVED or OPS_REJECTED",
//       });
//     }

//     const loan = await fetchSabGrowOpsCheckerLoan(lan);

//     if (!loan) {
//       return res.status(404).json({
//         success: false,
//         message: "SabGrow loan not found",
//       });
//     }

//     if (normalizeStatus(loan.status) !== "approved") {
//       return res.status(409).json({
//         success: false,
//         message: "Only Approved SabGrow loans can be handled by Ops Checker",
//       });
//     }

//     // OPS REJECT
//     if (["ops_rejected", "rejected"].includes(requestedStatus)) {

//       const result = await updateSabGrowOpsCheckerStatus({
//         lan,
//         status: "OPS_REJECTED",
//         stage: "OPS_REJECTED",
//         opsCheckerId,
//         opsCheckerName,
//         updatedBy: opsCheckerName,
//       });

//       if (!result.affectedRows) {
//         return res.status(404).json({
//           success: false,
//           message: "SabGrow loan not found",
//         });
//       }

//       return res.json({
//         success: true,
//         status: "SUCCESS",
//         lan,
//         final_status: "OPS_REJECTED",
//         message: "Loan rejected by operations checker successfully",
//       });
//     }

//     // OPS APPROVE
//     await updateSabGrowOpsCheckerStatus({
//       lan,
//       status: "Approved",
//       stage: "Approved",
//       opsCheckerId,
//       opsCheckerName,
//       updatedBy: opsCheckerName,
//     });

//     // Check existing payout
//     const activeTransfer = await fetchLatestSabGrowPayout(lan);

//     const activePayoutStatus = getPayoutStatus(activeTransfer);

//     if (ACTIVE_PAYOUT_STATUSES.has(activePayoutStatus)) {
//       return res.status(409).json({
//         success: false,
//         status: "FAILED",
//         message: `Payout already ${activePayoutStatus} for this LAN`,
//         payout_status: activePayoutStatus,
//         unique_request_number:
//           activeTransfer?.unique_request_number || null,
//       });
//     }

//     // Initiate payout
//     const payoutResult = await approveAndInitiatePayout({
//       lan,
//       table: TABLE_NAME,
//     });

//     if (!payoutResult.success) {
//       return res.status(400).json({
//         success: false,
//         status: "FAILED",
//         message:
//           payoutResult.message || "Payout initiation failed",
//       });
//     }

//     const finalPayoutStatuses = new Set([
//       "success",
//       "completed",
//       "processed",
//     ]);

//     const isPayoutFinal = finalPayoutStatuses.has(
//       String(payoutResult.payout_status || "").toLowerCase()
//     );

//     const finalStatus = isPayoutFinal
//       ? "Disbursed"
//       : "Approved";

//     return res.json({
//       success: true,
//       status: "SUCCESS",
//       lan,
//       final_status: finalStatus,
//       payout_status: payoutResult.payout_status || null,
//       unique_request_number:
//         payoutResult.unique_request_number || null,
//       message:
//         "Loan approved by operations checker and payout initiated successfully",
//     });

//   } catch (error) {

//     console.error("[SABGROW] Ops checker payout error", {
//       lan: req.params?.lan,
//       message: error.message,
//       stack: error.stack,
//     });

//     return res.status(500).json({
//       success: false,
//       status: "FAILED",
//       message:
//         error.message ||
//         "Failed to approve SabGrow payout",
//       error:
//         error.sqlMessage ||
//         error.message,
//     });
//   }
// });

router.post("/test-webhook", async (req, res) => {

    console.log("====== SABGROW WEBHOOK RECEIVED ======");

    console.log(req.body);


    return res.json({
        success: true,
        message: "Webhook received successfully"
    });

}); 






module.exports = router;