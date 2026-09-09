const express = require("express");
const puppeteer = require("puppeteer");
// const crypto = require("crypto");

const router = express.Router();

const db = require("../config/db");

const PARTNER_CONFIG = require(
    "../config/paymentReceiptPartners"
);

const {
    buildPaymentReceiptHtml,
} = require("../utils/paymentReceiptPdf");


/* ============================================================
   HELPERS
============================================================ */

function cleanText(value) {
    return String(value ?? "").trim();
}


function cleanLan(value) {
    return cleanText(value).toUpperCase();
}


function getPartnerConfig(partnerCode) {
    return (
        PARTNER_CONFIG[
        cleanText(partnerCode).toUpperCase()
        ] || null
    );
}


function validateIdentifier(value) {
    const identifier =
        cleanText(value);

    if (
        !/^[A-Za-z0-9_]+$/.test(identifier)
    ) {
        throw new Error(
            `Invalid SQL identifier: ${identifier}`
        );
    }

    return identifier;
}


function selectColumn(
    columnName,
    alias
) {
    if (!columnName) {
        return `NULL AS \`${alias}\``;
    }

    const column =
        validateIdentifier(columnName);

    return `\`${column}\` AS \`${alias}\``;
}


function formatDateForReceiptNo() {
    const now = new Date();

    const year =
        now.getFullYear();

    const month =
        String(
            now.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            now.getDate()
        ).padStart(2, "0");

    return `${year}${month}${day}`;
}


/*
 Since we are NOT storing receipts,
 create deterministic ID from Payment ID.

 Same payment ID will get the same
 receipt number.
*/
async function generateReceiptNo(connection) {
    const today = new Date();

    const year = today.getFullYear();
    const month = String(
        today.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        today.getDate()
    ).padStart(2, "0");

    const receiptDate =
        `${year}-${month}-${day}`;

    const datePart =
        `${year}${month}${day}`;

    // Lock today's receipt rows while generating
    const [rows] = await connection.query(
        `
        SELECT receipt_no
        FROM payment_receipts
        WHERE receipt_date = ?
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
        `,
        [receiptDate]
    );

    let nextNumber = 1;

    if (rows.length > 0 && rows[0].receipt_no) {
        const match =
            rows[0].receipt_no.match(
                /-(\d{4})$/
            );

        if (match) {
            nextNumber =
                parseInt(match[1], 10) + 1;
        }
    }

    const sequence =
        String(nextNumber).padStart(4, "0");

    return `FTF-${datePart}-${sequence}`;
}

/* ============================================================
   FETCH LOAN FROM PARTNER TABLE
============================================================ */

// async function fetchLoanByLan(
//   config,
//   lan
// ) {
//   const table =
//     validateIdentifier(
//       config.bookingTable
//     );

//   const lanColumn =
//     validateIdentifier(
//       config.lanColumn
//     );


//   const query = `

//     SELECT

//       ${selectColumn(
//         config.lanColumn,
//         "lan"
//       )},

//       ${selectColumn(
//         config.customerNameColumn,
//         "customer_name"
//       )},

//       ${selectColumn(
//         config.loanAccountColumn,
//         "loan_account_number"
//       )},

//       ${selectColumn(
//         config.addressColumn,
//         "current_address"
//       )},

//       ${selectColumn(
//         config.alternateAddressColumn,
//         "permanent_address"
//       )},

//       ${selectColumn(
//         config.lenderColumn,
//         "lender"
//       )},

//       ${selectColumn(
//         config.productColumn,
//         "product"
//       )},

//       ${selectColumn(
//         config.lenderTypeColumn,
//         "lender_type"
//       )}

//     FROM \`${table}\`

//     WHERE
//       UPPER(
//         TRIM(
//           \`${lanColumn}\`
//         )
//       ) = ?

//     LIMIT 1
//   `;


//   const [rows] =
//     await db
//       .promise()
//       .query(
//         query,
//         [cleanLan(lan)]
//       );


//   if (!rows.length) {
//     return null;
//   }


//   const loan =
//     rows[0];


//   loan.customer_address =
//     cleanText(
//       loan.current_address
//     ) ||
//     cleanText(
//       loan.permanent_address
//     ) ||
//     "";


//   loan.loan_account_number =
//     cleanText(
//       loan.loan_account_number
//     ) ||
//     cleanText(
//       loan.lan
//     );


//   return loan;
// }
async function fetchLoanByLan(config, lan) {
    const cleanValue = String(lan || "")
        .trim()
        .toUpperCase();

    if (!cleanValue) {
        return null;
    }

    console.log("Payment Receipt LAN Search:", cleanValue);

    /*
      For Saswat:
      Search using:
        1. lan
        2. loan_account_number
        3. partner_loan_id
    */

    const [rows] = await db.promise().query(
        `
    SELECT
        id,
        lan,
        loan_account_number,
        partner_loan_id,

        customer_name,

        current_address,
        permanent_address,

        lender,
        product,
        lender_type

    FROM loan_booking_saswat

    WHERE
        UPPER(TRIM(lan)) = ?
        OR UPPER(TRIM(COALESCE(loan_account_number, ''))) = ?
        OR UPPER(TRIM(COALESCE(partner_loan_id, ''))) = ?

    LIMIT 1
    `,
        [
            cleanValue,
            cleanValue,
            cleanValue,
        ]
    );

    console.log(
        "Payment Receipt Loan Result:",
        rows
    );

    if (!rows.length) {
        return null;
    }

    const loan = rows[0];

    loan.customer_address =
        String(loan.current_address || "").trim() ||
        String(loan.permanent_address || "").trim() ||
        "";

    loan.loan_account_number =
        String(loan.loan_account_number || "").trim() ||
        String(loan.lan || "").trim();

    return loan;
}

/* ============================================================
   API 1
   FETCH LOAN DETAILS
============================================================

GET

/api/payment-receipts/loan-details
?partner_code=SASWAT
&lan=SW11008

============================================================ */

// router.get(
//   "/loan-details",
//   async (req, res) => {

//     try {

//       const partnerCode =
//         cleanText(
//           req.query.partner_code
//         ).toUpperCase();


//       const lan =
//         cleanLan(
//           req.query.lan
//         );


//       if (!partnerCode) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "partner_code is required",
//         });
//       }


//       if (!lan) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "LAN is required",
//         });
//       }


//       const config =
//         getPartnerConfig(
//           partnerCode
//         );


//       if (!config) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Partner configuration not found",
//         });
//       }


//       const loan =
//         await fetchLoanByLan(
//           config,
//           lan
//         );


//       if (!loan) {
//         return res.status(404).json({
//           success: false,

//           message:
//             `Loan ${lan} not found`,
//         });
//       }


//       return res.status(200).json({

//         success: true,

//         data: {

//           partner_code:
//             config.partnerCode,

//           partner_name:
//             config.partnerName,

//           lan:
//             loan.lan,

//           loan_account_number:
//             loan.loan_account_number,

//           customer_name:
//             loan.customer_name,

//           customer_address:
//             loan.customer_address,

//           lender:
//             loan.lender,

//           product:
//             loan.product,

//           lender_type:
//             loan.lender_type,
//         },

//       });

//     } catch (error) {

//       console.error(
//         "Receipt loan details error:",
//         error
//       );


//       return res.status(500).json({

//         success: false,

//         message:
//           "Unable to fetch loan details",

//         error:
//           error.message,

//       });

//     }

//   }
// );
router.get(
    "/loan-details",
    async (req, res) => {
        try {
            const partnerCode = String(
                req.query.partner_code || ""
            )
                .trim()
                .toUpperCase();

            const lan = String(
                req.query.lan || ""
            )
                .trim()
                .toUpperCase();

            console.log("Partner Code:", partnerCode);
            console.log("Received LAN:", lan);

            if (!partnerCode) {
                return res.status(400).json({
                    success: false,
                    message: "partner_code is required",
                });
            }

            if (!lan) {
                return res.status(400).json({
                    success: false,
                    message: "LAN is required",
                });
            }

            if (partnerCode !== "SASWAT") {
                return res.status(400).json({
                    success: false,
                    message: "Currently only SASWAT is supported",
                });
            }

            const config =
                PARTNER_CONFIG.SASWAT;

            const loan =
                await fetchLoanByLan(
                    config,
                    lan
                );

            if (!loan) {
                return res.status(404).json({
                    success: false,
                    message: `Loan not found for ${lan}`,
                });
            }

            return res.status(200).json({
                success: true,

                data: {
                    partner_code: "SASWAT",

                    partner_name:
                        config.partnerName,

                    lan:
                        loan.lan,

                    loan_account_number:
                        loan.loan_account_number,

                    partner_loan_id:
                        loan.partner_loan_id,

                    customer_name:
                        loan.customer_name,

                    customer_address:
                        loan.customer_address,

                    lender:
                        loan.lender,

                    product:
                        loan.product,

                    lender_type:
                        loan.lender_type,
                },
            });
        } catch (error) {
            console.error(
                "Payment Receipt Loan Error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to fetch loan details",
                error:
                    error.message,
            });
        }
    }
);

/* ============================================================
   API 2
   DIRECTLY GENERATE PDF

   NO DATABASE INSERT
============================================================

POST

/api/payment-receipts/generate-pdf

BODY:

{
    "partner_code": "SASWAT",
    "lan": "SW11008",
    "payment_id": "PAY-SW-10001",
    "amount": 6420
}

============================================================ */

router.post(
    "/generate-pdf",
    async (req, res) => {

        let browser = null;

        try {

            const partnerCode =
                cleanText(
                    req.body.partner_code
                ).toUpperCase();


            const lan =
                cleanLan(
                    req.body.lan
                );


            const paymentId =
                cleanText(
                    req.body.payment_id
                );

            const paymentDate =
                cleanText(
                    req.body.payment_date
                );

            const amount =
                Number(
                    req.body.amount
                );


            /* =============================
               VALIDATION
            ============================= */

            if (!partnerCode) {
                return res.status(400).json({
                    success: false,
                    message:
                        "partner_code is required",
                });
            }


            if (!lan) {
                return res.status(400).json({
                    success: false,
                    message:
                        "LAN is required",
                });
            }


            if (!paymentId) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Payment ID is required",
                });
            }


            if (!paymentDate) {
                return res.status(400).json({
                    success: false,

                    message:
                        "Payment Date is required",
                });
            }

            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Valid amount is required",
                });
            }


            /* =============================
               PARTNER CONFIG
            ============================= */

            const config =
                getPartnerConfig(
                    partnerCode
                );


            if (!config) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Partner configuration not found",
                });
            }


            /* =============================
               FETCH LOAN
            ============================= */

            const loan =
                await fetchLoanByLan(
                    config,
                    lan
                );


            if (!loan) {
                return res.status(404).json({

                    success: false,

                    message:
                        `Loan ${lan} not found`,

                });
            }


          /* =============================
   CREATE / GET RECEIPT
============================= */

const receiptDate = new Date()
    .toISOString()
    .slice(0, 10);

/*
   First check whether this payment
   already has a receipt.
*/
const [existingReceiptRows] =
    await db.promise().query(
        `
        SELECT
            id,
            receipt_no
        FROM payment_receipts
        WHERE partner_code = ?
          AND lan = ?
          AND payment_id = ?
        LIMIT 1
        `,
        [
            partnerCode,
            loan.lan,
            paymentId
        ]
    );

let receiptNo;

if (existingReceiptRows.length > 0) {

    /*
       Receipt already exists for this payment.
       Reuse the same receipt number.
    */
    receiptNo =
        existingReceiptRows[0].receipt_no;

} else {

    /*
       Create a new receipt record.

       AUTO_INCREMENT id gives us a
       unique sequential number.
    */

    const [insertResult] =
        await db.promise().query(
            `
            INSERT INTO payment_receipts (
                lan,
                payment_id,
                partner_code,
                receipt_date,
                amount,
                payment_date,
                customer_name,
                loan_account_number
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                loan.lan,
                paymentId,
                partnerCode,
                receiptDate,
                amount,
                paymentDate,
                loan.customer_name,
                loan.loan_account_number
            ]
        );

    const receiptId =
        insertResult.insertId;

    /*
       Convert AUTO_INCREMENT ID
       into 4-digit receipt number.

       Example:
       1  -> 0001
       25 -> 0025
       123 -> 0123
    */
    const sequence =
        String(receiptId).padStart(4, "0");

    receiptNo =
        `FTF-${receiptDate.replace(/-/g, "")}-${sequence}`;

    /*
       Save generated receipt number.
    */
    await db.promise().query(
        `
        UPDATE payment_receipts
        SET receipt_no = ?
        WHERE id = ?
        `,
        [
            receiptNo,
            receiptId
        ]
    );
}


/* =============================
   CREATE RECEIPT OBJECT
============================= */

const receipt = {

    receipt_no:
        receiptNo,

    partner_code:
        partnerCode,

    lan:
        loan.lan,

    payment_id:
        paymentId,

    payment_date:
        paymentDate,

    receipt_date:
        receiptDate,

    amount:
        amount,

    customer_name:
        loan.customer_name,

    loan_account_number:
        loan.loan_account_number,

    customer_address:
        loan.customer_address,

    product:
        loan.product,

    lender:
        loan.lender,

    lender_type:
        loan.lender_type,

};


            /* =============================
               CREATE HTML
            ============================= */

            const html =
                buildPaymentReceiptHtml(
                    receipt,
                    config
                );


            /* =============================
               CREATE PDF
            ============================= */

            browser =
                await puppeteer.launch({

                    headless: true,

                    args: [
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                    ],

                });


            const page =
                await browser.newPage();


            await page.setContent(
                html,
                {
                    waitUntil:
                        "networkidle0",
                }
            );


            const pdfBuffer =
                await page.pdf({

                    format: "A4",

                    printBackground:
                        true,

                    preferCSSPageSize:
                        true,

                    margin: {
                        top: "5mm",
                        right: "5mm",
                        bottom: "5mm",
                        left: "5mm",
                    },

                });


            await browser.close();

            browser = null;


            /* =============================
               RETURN PDF
            ============================= */

            res.setHeader(
                "Content-Type",
                "application/pdf"
            );


            res.setHeader(
                "Content-Disposition",
                `inline; filename="${receiptNo}.pdf"`
            );


            res.setHeader(
                "X-Receipt-No",
                receiptNo
            );


            return res.send(
                pdfBuffer
            );

        } catch (error) {

            console.error(
                "Payment receipt PDF error:",
                error
            );


            if (!res.headersSent) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to generate payment receipt",

                    error:
                        error.message,

                });

            }

        } finally {

            if (browser) {

                try {
                    await browser.close();
                } catch (_) { }

            }

        }

    }
);


module.exports = router;