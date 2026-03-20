const db = require("../../config/db");
const { getPanCardDetails } = require("../../services/pancardapiservice");
const { runBureau } = require("../../services/Bueraupullapiservice");
const { initAadhaarKyc } = require("../../services/digitapaadharservice");

exports.clayooRunAllValidations = async (lan) => {
  try {
    console.log(`🚀 Starting CLYOO Validation Engine for LAN: ${lan}`);

    const pool = db.promise();

    // Fetch loan details
    const [loanRows] = await pool.query(
      "SELECT * FROM loan_booking_clayyo WHERE lan = ?",
      [lan]
    );

    if (loanRows.length === 0) {
      console.log("❌ Loan not found. Cannot validate.");
      return;
    }

    const loan = loanRows[0];

    // Ensure KYC row exists
    await pool.query(
      "INSERT IGNORE INTO kyc_verification_status (lan) VALUES (?)",
      [lan]
    );

    // 1️⃣ PAN
    await pool.query(
      "UPDATE kyc_verification_status SET pan_status='INITIATED' WHERE lan=?",
      [lan]
    );

    let panResult = await getPanCardDetails(
      loan.pan_number,
      loan.customer_name
    ).catch((err) => {
      console.error("❌ PAN Verification Error:", err?.response?.data || err);
      return {
        success: false,
        response: err?.response?.data || { error: err.message || String(err) },
      };
    });

    await pool.query(
      "UPDATE kyc_verification_status SET pan_status=?, pan_api_response=? WHERE lan=?",
      [
        // panResult.success ? "VERIFIED" : "FAILED",
        panResult.success ? "VERIFIED" : "FAILED",
        JSON.stringify(panResult.response || {}),
        lan,
      ]
    );

    console.log(
      `📌 PAN Status for ${lan}:`,
      panResult.success ? "VERIFIED" : "FAILED"
    );

    // 2️⃣ Aadhaar INIT
    await pool.query(
      "UPDATE kyc_verification_status SET aadhaar_status='INITIATED' WHERE lan=?",
      [lan]
    );

    const aadhaarInit = await initAadhaarKyc(
      lan,
      loan.mobile_number,
      loan.email_id,
      loan.customer_name
    );

    if (aadhaarInit.success) {
      await pool.query(
        `UPDATE kyc_verification_status 
         SET aadhaar_transaction_id=?, aadhaar_kyc_url=?, aadhaar_unique_id=? 
         WHERE lan=?`,
        [
          aadhaarInit.unifiedTransactionId,
          aadhaarInit.kycUrl,
          aadhaarInit.uniqueId,
          lan,
        ]
      );

      console.log(
        "📨 Aadhaar INIT successful, KYC URL:",
        aadhaarInit.kycUrl
      );
    } else {
      console.log(
        "❌ Aadhaar INIT Failed, marking FAILED:",
        aadhaarInit.error || "Unknown error"
      );
      await pool.query(
        "UPDATE kyc_verification_status SET aadhaar_status='FAILED' WHERE lan=?",
        [lan]
      );
    }

    // 3️⃣ Bureau
    await pool.query(
      "UPDATE kyc_verification_status SET bureau_status='INITIATED' WHERE lan=?",
      [lan]
    );

    let dobStr = loan.dob;
    if (loan.dob instanceof Date) {
      dobStr = loan.dob.toISOString().split("T")[0];
    }

    let bureauResult = await runBureau({
      customer_name: loan.customer_name,
      first_name: loan.first_name,
      last_name: loan.last_name,
      dob: dobStr,
      gender: loan.gender,
      pan_number: loan.pan_number,
      mobile_number: loan.mobile_number,
      current_address: loan.permanent_address,
      current_village_city: loan.permanent_village_city,
      current_state: loan.permanent_state,
      current_pincode: loan.permanent_pincode,
      loan_amount: loan.loan_amount,
      loan_tenure: loan.loan_tenure || 3,
    }).catch((err) => {
      console.error("❌ Bureau Error:", err);
      return {
        success: false,
        score: null,
        response: { error: err.message || String(err) },
      };
    });

    await pool.query(
      "UPDATE kyc_verification_status SET bureau_status=?, bureau_api_response=? WHERE lan=?",
      [
        // bureauResult.success ? "VERIFIED" : "FAILED",
        bureauResult.success ? "VERIFIED" : "FAILED",
        JSON.stringify(bureauResult.response || {}),
        lan,
      ]
    );

    await pool.query(
  `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)
   VALUES (?,?,?,?, NOW())`,
  [
    lan,
    loan.pan_number,
    bureauResult.score,
    bureauResult.response ? String(bureauResult.response) : null,
  ]
);

    console.log(
      `📌 Bureau Status for ${lan}:`,
      bureauResult.success ? "VERIFIED" : "FAILED"
    );
    console.log(`📌 Bureau Score Extracted:`, bureauResult.score);

    if (bureauResult.score != null) {
      await pool.query(
        "UPDATE loan_booking_clayoo SET cibil_score=? WHERE lan=?",
        [bureauResult.score, lan]
      );
    }

  } catch (err) {
    console.error("❌ Validation Engine Failed:", err);
  }
};

