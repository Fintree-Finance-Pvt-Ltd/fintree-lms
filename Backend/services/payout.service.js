// const axios = require("axios");
// const crypto = require("crypto");
// const db = require("../config/db");

// exports.approveAndInitiatePayout = async ({ lan, table }) => {
//   try {
//     console.log("PAYOUT INIT:", lan, table);

//     /* ================================
//        1️⃣ Fetch loan details
//     ================================ */
//     const [[loan]] = await db.promise().query(
//       `
//       SELECT 
//         name_in_bank,
//         loan_amount,
//         account_number,
//         ifsc
//       FROM ?? 
//       WHERE lan = ?
//       `,
//       [table, lan]
//     );

//     if (!loan) {
//       throw new Error(`Loan not found: ${lan}`);
//     }

//     const amount = Number(loan.loan_amount);
//     const unique_request_number = `LAN_${lan}_${Date.now()}`;
//     const beneficiaryName = loan.name_in_bank
//   .trim()
//   .replace(/\s+/g, " ")
//   .toUpperCase();


//     /* ================================
//        2️⃣ Save INITIATED record
//     ================================ */
//     await db.promise().query(
//       `
//       INSERT INTO quick_transfers
//       (lan, unique_request_number, amount, status)
//       VALUES (?, ?, ?, ?)
//       `,
//       [lan, unique_request_number, amount, "INITIATED"]
//     );

//     /* ================================
//        3️⃣ Generate HASH (STRICT ORDER)
//        key|account|ifsc|upi|urn|amount|salt
//     ================================ */
//     const raw = [
//       process.env.EASEBUZZ_KEY,
//       loan.account_number,
//       loan.ifsc,
//       "", // upi_handle (bank payout)
//       unique_request_number,
//       amount,
//       process.env.EASEBUZZ_SALT,
//     ].join("|");

//     const authorization = crypto
//       .createHash("sha512")
//       .update(raw)
//       .digest("hex");

//     /* ================================
//        4️⃣ Initiate payout
//     ================================ */
//     const response = await axios.post(
//       "https://wire.easebuzz.in/api/v1/quick_transfers/initiate/",
//       {
//         key: process.env.EASEBUZZ_KEY,
//         beneficiary_type: "bank_account",
//         beneficiary_name: loan.name_in_bank,
//         account_number: loan.account_number,
//         ifsc: loan.ifsc,
//         upi_handle: "",
//         unique_request_number,
//         payment_mode: "NEFT",
//         amount,
//         // udf1: loan.lan,
//       },
//       {
//         headers: {
//           Authorization: authorization,
//           "WIRE-API-KEY": process.env.EASEBUZZ_WIRE_API_KEY,
//           "Content-Type": "application/json",
//         },
//         timeout: 15000,
//       }
//     );

//     /* ================================
//        5️⃣ App-level failure
//     ================================ */
//     if (response.data?.success === false) {
//       await db.promise().query(
//         `
//         UPDATE quick_transfers
//         SET status='FAILED',
//             failure_reason=?
//         WHERE unique_request_number=?
//         `,
//         [response.data.message, unique_request_number]
//       );
//     }

//     return {
//       success: true,
//       unique_request_number,
//       acknowledged: response.data?.success === true,
//     };
//   } catch (err) {
//     console.error("approveAndInitiatePayout error:", err.message);
//     throw err;
//   }
// };

/////////////////
const axios = require("axios");
const crypto = require("crypto");
const db = require("../config/db");
const { processEmiClubDisbursement } = require("../services/processEmiClubDisbursement");


exports.approveAndInitiatePayout = async ({ lan, table }) => {
  try {
    console.log("PAYOUT INIT By Sajag:", lan, table);

    const [[loan]] = await db.promise().query(
      `
      SELECT 
        name_in_bank,
        loan_amount,
        account_number,
        ifsc
      FROM ?? 
      WHERE lan = ?
      `,
      [table, lan]
    );

    if (!loan) throw new Error(`Loan not found: ${lan}`);

    const amount = Number(loan.loan_amount); // ✅ NUMBER
    const unique_request_number = `LAN_${lan}_${Date.now()}`;

    await db.promise().query(
      `
      INSERT INTO quick_transfers
      (lan, unique_request_number, amount, status)
      VALUES (?, ?, ?, 'INITIATED')
      `,
      [lan, unique_request_number, amount]
    );

    /* ============================
       3️⃣ Generate HASH
       key|account|ifsc|upi|urn|amount|salt
    ============================ */
    const raw = [
      process.env.EASEBUZZ_KEY,
      loan.account_number,
      loan.ifsc,
      "",
      unique_request_number,
      amount,
      process.env.EASEBUZZ_SALT,
    ].join("|");


console.log("raw data sss",raw);

    const authorization = crypto
      .createHash("sha512")
      .update(raw)
      .digest("hex");


         /* ============================
       4️⃣ Call Easebuzz API
    ============================ */
    const response = await axios.post(
      "https://wire.easebuzz.in/api/v1/quick_transfers/initiate/",
      {
        key: process.env.EASEBUZZ_KEY,
        beneficiary_type: "bank_account",
        beneficiary_name: loan.name_in_bank
          .trim()
          .replace(/\s+/g, " ")
          .toUpperCase(),
        account_number: loan.account_number,
        ifsc: loan.ifsc,
        upi_handle: "",
        unique_request_number,
        payment_mode: "IMPS", // ✅ IMPORTANT
        amount,               // ✅ NUMBER
      },
      {
        headers: {
          Authorization: authorization,
          "WIRE-API-KEY": process.env.EASEBUZZ_WIRE_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );


    console.log("Easebuzz API Response:", response.data);
  
    // const tr = response.data?.data?.transfer_request;

    //  const tr = response.data.data.transfer_request;
    /* =================================================
       5️⃣ SAVE FULL RESPONSE (IMPORTANT PART)
    ================================================= */
     /* 5️⃣ API-LEVEL FAILURE */
    if (response.data?.success === false) {
      await db.promise().query(
        `
        UPDATE quick_transfers
        SET
          status = 'FAILED',
          failure_reason = ?,
          raw_api_response = ?,
          updated_at = NOW()
        WHERE unique_request_number = ?
        `,
        [
          response.data.message || "API_FAILURE",
          JSON.stringify(response.data),
          unique_request_number,
        ]
      );

      return { success: false, unique_request_number };
    }

    /* 6️⃣ ACCEPTED / PENDING */
     const tr = response.data.data.transfer_request;

    await db.promise().query(
      `
  UPDATE quick_transfers
  SET
    status = ?,
    payout_status = ?,
    easebuzz_transfer_id = ?,
    queue_on_low_balance = ?,
    transfer_date = ?,
    raw_api_response = ?,
    utr = ?,
    updated_at = NOW()
  WHERE unique_request_number = ?
  `,
  [
    tr.status,                                 // status
    tr.status,                                 // payout_status
    tr.id,                                     // easebuzz_transfer_id
    tr.queue_on_low_balance ?? 0,               // queue_on_low_balance
    tr.transfer_date ? tr.transfer_date.split('T')[0] : null, // ✅ DATE ONLY
    JSON.stringify(response.data),              // raw_api_response
    tr.unique_transaction_reference || null,    // utr
    unique_request_number                       // WHERE condition
  ]
);
  /* =================================================
       🔥 AUTO DISBURSEMENT – EMI CLUB ONLY
    ================================================= */
    if (
      lan.startsWith("FINE") &&
      tr.status === "SUCCESS" &&
      tr.unique_transaction_reference &&
      tr.transfer_date
    ) {
      await processEmiClubDisbursement({
        lan,
        disbursementUTR: tr.unique_transaction_reference,
        disbursementDate: new Date(tr.transfer_date),
      });
    }

    return {
      success: true,
      unique_request_number,
      payout_status: tr.status,
    };
  } catch (err) {
    console.error("approveAndInitiatePayout error:", err);
    throw err;
  }
};