const db = require("../../config/db");

const { getPanCardDetails } = require("../../services/pancardapiservice");

const { runBureau } = require("../../services/Bueraupullapiservice");

const { initAadhaarKyc } = require("../../services/digitapaadharservice");

exports.claimBuddyRunAllValidations = async (lan) => {
  try {
    console.log(`🚀 Starting CLAIM BUDDY Validation Engine for LAN: ${lan}`);

    const pool = db.promise();

    // ========================================
    // FETCH LOAN DETAILS
    // ========================================

    const [loanRows] = await pool.query(
      `
SELECT *

FROM loan_booking_claim_buddy

WHERE lan=?

`,

      [lan],
    );

    if (!loanRows.length) {
      console.log("❌ Claim Buddy Loan not found");

      return;
    }

    const loan = loanRows[0];

    // ========================================
    // CREATE KYC ROW
    // ========================================

    await pool.query(
      `
INSERT IGNORE INTO

kyc_verification_status

(lan)

VALUES (?)

`,

      [lan],
    );

    // ========================================
    // 1. PAN VERIFICATION
    // ========================================

    await pool.query(
      `

UPDATE kyc_verification_status

SET pan_status='INITIATED'

WHERE lan=?

`,

      [lan],
    );

    let panResult = await getPanCardDetails(
      loan.pan_number,

      loan.customer_name,
    ).catch((err) => {
      console.log("❌ PAN API Error", err);

      return {
        success: false,

        response: err.response?.data || {
          error: err.message,
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

`,

      [
        panResult.success ? "VERIFIED" : "FAILED",

        JSON.stringify(panResult.response || {}),

        lan,
      ],
    );

    console.log(
      `📌 PAN Status ${lan}:`,

      panResult.success ? "VERIFIED" : "FAILED",
    );

    // ========================================
    // 2. AADHAAR KYC INIT
    // ========================================

    await pool.query(
      `

UPDATE kyc_verification_status

SET aadhaar_status='INITIATED'

WHERE lan=?

`,

      [lan],
    );

    const aadhaarInit = await initAadhaarKyc(
      lan,

      loan.mobile_number,

      loan.email_id,

      loan.customer_name,

      loan.current_address,

      loan.current_pincode,

      loan.current_state,
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

`,

        [
          aadhaarInit.unifiedTransactionId,

          aadhaarInit.kycUrl,

          aadhaarInit.uniqueId,

          lan,
        ],
      );

      console.log(
        "📨 Claim Buddy Aadhaar URL:",

        aadhaarInit.kycUrl,
      );
    } else {
      await pool.query(
        `

UPDATE kyc_verification_status

SET

aadhaar_status='FAILED'


WHERE lan=?


`,

        [lan],
      );

      console.log("❌ Aadhaar failed");
    }

    // ========================================
    // 3. BUREAU PULL
    // ========================================

    await pool.query(
      `

UPDATE kyc_verification_status

SET bureau_status='INITIATED'

WHERE lan=?

`,

      [lan],
    );

    let dobStr = loan.dob;

    if (loan.dob instanceof Date) {
      dobStr = loan.dob.toISOString().split("T")[0];
    }

    let bureauResult = await runBureau({
      enquiry_reason: "05",

      customer_name: loan.customer_name,

      first_name: loan.first_name,

      last_name: loan.last_name,

      dob: dobStr,

      gender: loan.gender,

      pan_number: loan.pan_number,

      mobile_number: loan.mobile_number,

      current_address: loan.current_address,

      current_village_city: loan.current_village_city,

      current_state: loan.current_state,

      current_pincode: loan.current_pincode,

      loan_amount: loan.loan_amount,

      loan_tenure: loan.loan_tenure || 3,
    }).catch((err) => {
      console.log("❌ Bureau Error", err);

      return {
        success: false,

        score: null,

        response: {
          error: err.message,
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

`,

      [
        bureauResult.success ? "VERIFIED" : "FAILED",

        JSON.stringify(bureauResult.response || {}),

        lan,
      ],
    );

    // ========================================
    // SAVE CIBIL REPORT
    // ========================================

    await pool.query(
      `

INSERT INTO loan_cibil_reports

(

lan,

pan_number,

score,

report_xml,

created_at

)

VALUES

(?,?,?,?,NOW())

`,

      [
        lan,

        loan.pan_number,

        bureauResult.score,

        bureauResult.response ? String(bureauResult.response) : null,
      ],
    );

    console.log(
      `📌 Bureau Status ${lan}:`,

      bureauResult.success ? "VERIFIED" : "FAILED",
    );

    console.log(
      "📌 Bureau Score:",

      bureauResult.score,
    );

    // ========================================
    // UPDATE LOAN SCORE
    // ========================================

    if (bureauResult.score !== null) {
      await pool.query(
        `

UPDATE loan_booking_claim_buddy


SET

cibil_score=?


WHERE lan=?


`,

        [bureauResult.score, lan],
      );
    }

    console.log(
      `
✅ Claim Buddy KYC Validation Completed

LAN:
${lan}

PAN:
${panResult.success ? "VERIFIED" : "FAILED"}

AADHAAR:
${aadhaarInit.success ? "INITIATED" : "FAILED"}

BUREAU:
${bureauResult.success ? "VERIFIED" : "FAILED"}

SCORE:
${bureauResult.score}

`,
    );

    console.log(`✅ CLAIM BUDDY Validation Completed: ${lan}`);
  } catch (err) {
    console.error(
      "❌ Claim Buddy Validation Failed:",

      err,
    );
  }
};
