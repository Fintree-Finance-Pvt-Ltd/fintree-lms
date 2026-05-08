// const db = require("../config/db");
// const { getPanCardDetails } = require("../services/pancardapiservice");
// const { runBureau } = require("../services/Bueraupullapiservice");
// const { initAadhaarKyc } = require("../services/digitapaadharservice");

// exports.universalRunAllValidations = async (lan) => {
//   try {
//     console.log(`🚀 Starting Validation Engine for LAN: ${lan}`);

//     const table = "loan_booking_motion_corp";

//     if (lan.startsWith("HEL")){
//       table = "loan_booking_helium";
//     }else if (lan.startsWith("MO")){
//       table = "loan_booking_motion_corp";
//     }
//     else {
//       console.log("❌ Invalid LAN.");
//       return;
//     }
//     const pool = db.promise();

//     // Fetch loan details
//     const [loanRows] = await pool.query(
//       `SELECT * FROM ${table} WHERE lan = ?`,
//       [lan]
//     );

//     if (loanRows.length === 0) {
//       console.log("❌ Loan not found. Cannot validate.");
//       return;
//     }

//     const loan = loanRows[0];

//     // Ensure KYC row exists
//     await pool.query(
//       "INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)",
//       [lan]
//     );

//     // 1️⃣ PAN
//     await pool.query(
//       "UPDATE kyc_verification_status SET pan_status='INITIATED' WHERE lan=?",
//       [lan]
//     );

//     let panResult = await getPanCardDetails(
//       loan.pan_number,
//       loan.customer_name
//     ).catch((err) => {
//       console.error("❌ PAN Verification Error:", err?.response?.data || err);
//       return {
//         success: false,
//         response: err?.response?.data || { error: err.message || String(err) },
//       };
//     });

//     await pool.query(
//       "UPDATE kyc_verification_status SET pan_status=?, pan_api_response=? WHERE lan=?",
//       [
//         // panResult.success ? "VERIFIED" : "FAILED",
//         panResult.success ? "VERIFIED" : "FAILED",
//         JSON.stringify(panResult.response || {}),
//         lan,
//       ]
//     );

//     console.log(
//       `📌 PAN Status for ${lan}:`,
//       panResult.success ? "VERIFIED" : "FAILED"
//     );

//         // 2️⃣ Aadhaar INIT
//         await pool.query(
//           "UPDATE kyc_verification_status SET aadhaar_status='INITIATED' WHERE lan=?",
//           [lan]
//         );

//         const aadhaarInit = await initAadhaarKyc(
//           lan,
//           loan.mobile_number,
//           loan.email_id,
//           loan.customer_name
//         );

//         if (aadhaarInit.success) {
//           await pool.query(
//             `UPDATE kyc_verification_status
//              SET aadhaar_transaction_id=?, aadhaar_kyc_url=?, aadhaar_unique_id=?
//              WHERE lan=?`,
//             [
//               aadhaarInit.unifiedTransactionId,
//               aadhaarInit.kycUrl,
//               aadhaarInit.uniqueId,
//               lan,
//             ]
//           );

//           console.log(
//             "📨 Aadhaar INIT successful, KYC URL:",
//             aadhaarInit.kycUrl
//           );
//         } else {
//           console.log(
//             "❌ Aadhaar INIT Failed, marking FAILED:",
//             aadhaarInit.error || "Unknown error"
//           );
//           await pool.query(
//             "UPDATE kyc_verification_status SET aadhaar_status='FAILED' WHERE lan=?",
//             [lan]
//           );
//         }

//     // 3️⃣ Bureau
//     await pool.query(
//       "UPDATE kyc_verification_status SET bureau_status='INITIATED' WHERE lan=?",
//       [lan]
//     );

//     let dobStr = loan.dob;
//     if (loan.dob instanceof Date) {
//       dobStr = loan.dob.toISOString().split("T")[0];
//     }

//     let bureauResult = await runBureau({
//       customer_name: loan.customer_name,
//       first_name: loan.first_name,
//       last_name: loan.last_name,
//       dob: dobStr,
//       gender: loan.gender,
//       pan_number: loan.pan_number,
//       mobile_number: loan.mobile_number,
//       current_address: loan.permanent_address,
//       current_village_city: loan.permanent_village_city,
//       current_state: loan.permanent_state,
//       current_pincode: loan.permanent_pincode,
//       loan_amount: loan.loan_amount,
//       loan_tenure: loan.loan_tenure,
//     }).catch((err) => {
//       console.error("❌ Bureau Error:", err);
//       return {
//         success: false,
//         score: null,
//         response: { error: err.message || String(err) },
//       };
//     });

//     await pool.query(
//       "UPDATE kyc_verification_status SET bureau_status=?, bureau_api_response=? WHERE lan=?",
//       [
//         // bureauResult.success ? "VERIFIED" : "FAILED",
//         bureauResult.success ? "VERIFIED" : "FAILED",
//         JSON.stringify(bureauResult.response || {}),
//         lan,
//       ]
//     );

//     await pool.query(
//       `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
//    VALUES (?,?,?,?, NOW())`,
//       [
//         lan,
//         loan.pan_number,
//         bureauResult.score,
//         bureauResult.response ? String(bureauResult.response) : null,
//       ]
//     );

//     console.log(
//       `📌 Bureau Status for ${lan}:`,
//       bureauResult.success ? "VERIFIED" : "FAILED"
//     );
//     console.log(`📌 Bureau Score Extracted:`, bureauResult.score);

//     if (bureauResult.score != null) {
//       await pool.query(
//         `UPDATE ${table} SET cibil_score=? WHERE lan=?`,
//         [bureauResult.score, lan]
//       );
//     }

//   } catch (err) {
//     console.error("❌ Validation Engine Failed:", err);
//   }
// };

const db = require("../config/db");

const { getPanCardDetails } = require("../services/pancardapiservice");

const { runBureau } = require("../services/Bueraupullapiservice");

const { initAadhaarKyc } = require("../services/digitapaadharservice");

async function runApplicantValidation({
  pool,
  lan,
  table,
  applicantType,
  applicantData,
}) {
  try {
    console.log(`🚀 Running ${applicantType} validations for ${lan}`);

    // Ensure row exists
    await pool.query(
      `
  INSERT IGNORE INTO
  kyc_verification_status (
    lan,
    applicant_type,
    applicant_name,
    mobile_number,
    pan_number
  )
  VALUES (?, ?, ?, ?, ?)
  `,
      [
        lan,
        applicantType,
        applicantData.customer_name,
        applicantData.mobile_number,
        applicantData.pan_number,
      ],
    );

    // =========================
    // PAN VALIDATION
    // =========================

    await pool.query(
      `
  UPDATE kyc_verification_status
  SET pan_status='INITIATED'
  WHERE lan=?
  AND applicant_type=?
  `,
      [lan, applicantType],
    );

    let panResult = await getPanCardDetails(
      applicantData.pan_number,
      applicantData.customer_name,
    ).catch((err) => {
      console.error(
        `❌ ${applicantType} PAN Error:`,
        err?.response?.data || err,
      );

      return {
        success: false,
        response: err?.response?.data || {
          error: err.message || String(err),
        },
      };
    });

    await pool.query(
      `
  UPDATE kyc_verification_status
  SET
    pan_status=?,
    pan_api_response=?
  WHERE lan=?
  AND applicant_type=?
  `,
      [
        panResult.success ? "VERIFIED" : "FAILED",

        JSON.stringify(panResult.response || {}),

        lan,
        applicantType,
      ],
    );

    console.log(
      `📌 ${applicantType} PAN:`,
      panResult.success ? "VERIFIED" : "FAILED",
    );

    // =========================
    // AADHAAR INIT
    // =========================

    await pool.query(
      `
  UPDATE kyc_verification_status
  SET aadhaar_status='INITIATED'
  WHERE lan=?
  AND applicant_type=?
  `,
      [lan, applicantType],
    );

    const aadhaarInit = await initAadhaarKyc(
      lan,
      applicantData.mobile_number,
      applicantData.email,
      applicantData.customer_name,
    );

    if (aadhaarInit.success) {
      await pool.query(
        `
    UPDATE kyc_verification_status
    SET
      aadhaar_transaction_id=?,
      aadhaar_kyc_url=?,
      aadhaar_unique_id=?
    WHERE lan=?
    AND applicant_type=?
    `,
        [
          aadhaarInit.unifiedTransactionId,
          aadhaarInit.kycUrl,
          aadhaarInit.uniqueId,
          lan,
          applicantType,
        ],
      );

      console.log(`📨 ${applicantType} Aadhaar INIT success`);
    } else {
      await pool.query(
        `
    UPDATE kyc_verification_status
    SET aadhaar_status='FAILED'
    WHERE lan=?
    AND applicant_type=?
    `,
        [lan, applicantType],
      );

      console.log(`❌ ${applicantType} Aadhaar Failed`);
    }

    // =========================
    // BUREAU
    // =========================

    await pool.query(
      `
  UPDATE kyc_verification_status
  SET bureau_status='INITIATED'
  WHERE lan=?
  AND applicant_type=?
  `,
      [lan, applicantType],
    );

    let dobStr = applicantData.dob;

    if (dobStr instanceof Date) {
      dobStr = dobStr.toISOString().split("T")[0];
    }

    let bureauResult = await runBureau({
      customer_name: applicantData.customer_name,

      first_name: applicantData.first_name,

      last_name: applicantData.last_name,

      dob: dobStr,

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
      console.error(`❌ ${applicantType} Bureau Error:`, err);

      return {
        success: false,
        score: null,
        response: {
          error: err.message || String(err),
        },
      };
    });

    await pool.query(
      `
  UPDATE kyc_verification_status
  SET
    bureau_status=?,
    bureau_api_response=?
  WHERE lan=?
  AND applicant_type=?
  `,
      [
        bureauResult.success ? "VERIFIED" : "FAILED",

        JSON.stringify(bureauResult.response || {}),

        lan,
        applicantType,
      ],
    );

    await pool.query(
      `
  INSERT INTO loan_cibil_reports (
    lan,
    applicant_type,
    pan_number,
    score,
    report_xml,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, NOW())
  `,
      [
        lan,
        applicantType,
        applicantData.pan_number,
        bureauResult.score,
        bureauResult.response ? String(bureauResult.response) : null,
      ],
    );

    console.log(
      `📌 ${applicantType} Bureau:`,
      bureauResult.success ? "VERIFIED" : "FAILED",
    );

    if (bureauResult.score != null && applicantType === "BORROWER") {
      await pool.query(
        `
    UPDATE ${table}
    SET cibil_score=?
    WHERE lan=?
    `,
        [bureauResult.score, lan],
      );
    }
  } catch (err) {
    console.error(`❌ ${applicantType} Validation Failed:`, err);
  }
}

exports.universalRunAllValidations = async (lan) => {
  try {
    console.log(`🚀 Starting Validation Engine for ${lan}`);

    let table = "";

    if (lan.startsWith("HEL")) {
      table = "loan_booking_helium";
    } else if (lan.startsWith("MC")) {
      table = "loan_booking_motion_corp";
    } else {
      console.log("❌ Invalid LAN");
      return;
    }

    const pool = db.promise();

    const [loanRows] = await pool.query(
      `
    SELECT *
    FROM ${table}
    WHERE lan=?
    `,
      [lan],
    );

    if (!loanRows.length) {
      console.log("❌ Loan not found");

      return;
    }

    const loan = loanRows[0];

    // =========================
    // BORROWER
    // =========================

    await runApplicantValidation({
      pool,
      lan,
      table,

      applicantType: "BORROWER",

      applicantData: {
        customer_name: loan.customer_name,

        first_name: loan.first_name,

        last_name: loan.last_name,

        dob: loan.dob,

        gender: loan.gender,

        pan_number: loan.pan_card,

        mobile_number: loan.mobile_number,

        email: loan.email,

        current_address: loan.permanent_address_line_1,

        current_village_city: loan.permanent_village_city,

        current_state: loan.permanent_state,

        current_pincode: loan.permanent_pincode,

        loan_amount: loan.loan_amount,

        loan_tenure: loan.loan_tenure,
      },
    });

    // =========================
    // GUARANTOR
    // =========================

    if (loan.guarantor_name && loan.guarantor_pan) {
      await runApplicantValidation({
        pool,
        lan,
        table,

        applicantType: "GUARANTOR",

        applicantData: {
          customer_name: loan.guarantor_name,

          first_name: loan.guarantor_name,

          last_name: "",

          dob: loan.guarantor_dob,

          gender: loan.gender,

          pan_number: loan.guarantor_pan,

          mobile_number: loan.guarantor_mobile,

          email: loan.guarantor_email,

          current_address: loan.guarantor_address_line_1,

          current_village_city: loan.guarantor_village_city,

          current_state: loan.guarantor_state,

          current_pincode: loan.guarantor_pincode,

          loan_amount: loan.loan_amount,

          loan_tenure: loan.loan_tenure,
        },
      });
    }

    // =========================
    // CO-APPLICANT
    // =========================

    if (loan.co_applicant_name && loan.co_applicant_pan) {
      await runApplicantValidation({
        pool,
        lan,
        table,

        applicantType: "CO_APPLICANT",

        applicantData: {
          customer_name: loan.co_applicant_name,

          first_name: loan.co_applicant_name,

          last_name: "",

          dob: loan.co_applicant_dob,

          gender: loan.gender,

          pan_number: loan.co_applicant_pan,

          mobile_number: loan.co_applicant_mobile,

          email: loan.co_applicant_email,

          current_address: loan.co_applicant_address_line_1,

          current_village_city: loan.co_applicant_village_city,

          current_state: loan.co_applicant_state,

          current_pincode: loan.co_applicant_pincode,

          loan_amount: loan.loan_amount,

          loan_tenure: loan.loan_tenure,
        },
      });
    }

    console.log(`✅ Validation Engine Completed for ${lan}`);
  } catch (err) {
    console.error("❌ Validation Engine Failed:", err);
  }
};
