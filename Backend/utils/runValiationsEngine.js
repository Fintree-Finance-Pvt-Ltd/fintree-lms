const db = require("../config/db");

const { getPanCardDetails } = require("../services/pancardapiservice");

const { runBureau } = require("../services/Bueraupullapiservice");

const { initAadhaarKyc } = require("../services/digitapaadharservice");
const {
  autoApproveMotionCorpIfAllVerified,
} = require("../routes/MotionCorp/motionCorpBRE");
const {
  autoApproveSevenFinCorpIfAllVerified,
} = require("../routes/Seven Fincorp/sevenFincorpBRE");
const { autoApproveSrbhIfAllVerified } = require("../routes/srbh/srbhBRE");
const {
  autoApproveBundelaIfAllVerified,
} = require("../routes/Bundela/bundelaBRE");
// const {
//   autoApproveFundifyIfAllVerified
// } = require("../routes/Fundify/fundigyBRE");

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
      INSERT IGNORE INTO kyc_verification_status (
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

    const shouldRunValidation = (status) => {
      const normalizedStatus = String(status || "").toUpperCase();

      return (
        !normalizedStatus ||
        normalizedStatus === "PENDING" ||
        normalizedStatus === "FAILED"
      );
    };

    const [statusRows] = await pool.query(
      `
      SELECT
        pan_status,
        aadhaar_status,
        aadhaar_transaction_id,
        aadhaar_kyc_url,
        aadhaar_unique_id,
        bureau_status
      FROM kyc_verification_status
      WHERE lan = ?
      AND applicant_type = ?
      LIMIT 1
      `,
      [lan, applicantType],
    );

    const currentStatus = statusRows[0] || {};

    // =========================
    // PAN VALIDATION
    // =========================

    if (shouldRunValidation(currentStatus.pan_status)) {
      await pool.query(
        `
        UPDATE kyc_verification_status
        SET pan_status = 'INITIATED'
        WHERE lan = ?
        AND applicant_type = ?
        `,
        [lan, applicantType],
      );

      const panResult = await getPanCardDetails(
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
          pan_status = ?,
          pan_api_response = ?
        WHERE lan = ?
        AND applicant_type = ?
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
    } else {
      console.log(
        `⏭️ ${applicantType} PAN skipped. Existing status: ${currentStatus.pan_status}`,
      );
    }

    // =========================
    // AADHAAR INIT
    // =========================

    const currentAadhaarStatus = String(
      currentStatus.aadhaar_status || "",
    ).toUpperCase();

    const hasExistingAadhaarSession =
      currentStatus.aadhaar_transaction_id ||
      currentStatus.aadhaar_kyc_url ||
      currentStatus.aadhaar_unique_id;

    if (
      shouldRunValidation(currentAadhaarStatus) &&
      !hasExistingAadhaarSession
    ) {
      await pool.query(
        `
        UPDATE kyc_verification_status
        SET aadhaar_status = 'INITIATED'
        WHERE lan = ?
        AND applicant_type = ?
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
            aadhaar_status = 'INITIATED',
            aadhaar_transaction_id = ?,
            aadhaar_kyc_url = ?,
            aadhaar_unique_id = ?
          WHERE lan = ?
          AND applicant_type = ?
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
          SET aadhaar_status = 'FAILED'
          WHERE lan = ?
          AND applicant_type = ?
          `,
          [lan, applicantType],
        );

        console.log(`❌ ${applicantType} Aadhaar Failed`);
      }
    } else {
      console.log(
        `⏭️ ${applicantType} Aadhaar skipped. Existing status: ${
          currentStatus.aadhaar_status || "EMPTY"
        }`,
      );
    }

    // =========================
    // BUREAU
    // =========================

    if (shouldRunValidation(currentStatus.bureau_status)) {
      await pool.query(
        `
        UPDATE kyc_verification_status
        SET bureau_status = 'INITIATED'
        WHERE lan = ?
        AND applicant_type = ?
        `,
        [lan, applicantType],
      );

      let dobStr = applicantData.dob;

      if (dobStr instanceof Date) {
        dobStr = dobStr.toISOString().split("T")[0];
      }

      const bureauResult = await runBureau({
        enquiry_reason: "01", // 05 - Credit Assessment
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
          bureau_status = ?,
          bureau_api_response = ?
        WHERE lan = ?
        AND applicant_type = ?
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
          SET cibil_score = ?
          WHERE lan = ?
          `,
          [bureauResult.score, lan],
        );
      }
    } else {
      console.log(
        `⏭️ ${applicantType} Bureau skipped. Existing status: ${currentStatus.bureau_status}`,
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
  } else if (lan.startsWith("SFL")) {
      table = "loan_booking_seven_fincorp";
    } else if (lan.startsWith("SBU")) {
      table = "loan_booking_bundela";
    } else if (lan.startsWith("FUN")) {
      table = "loan_booking_fundify";
    } else if (lan.startsWith("SH")) {
      table = "loan_booking_srbh";
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

        loan_amount: loan.requested_loan_amount,

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

          loan_amount: loan.requested_loan_amount,

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

          loan_amount: loan.requested_loan_amount,

          loan_tenure: loan.loan_tenure,
        },
      });
    }

    if (lan.startsWith("MC")) {
      console.log(`🚀 Running Motion Corp BRE for ${lan}`);

      await autoApproveMotionCorpIfAllVerified(lan);

      console.log(`✅ Motion Corp BRE finished for ${lan}`);
    }

    if (lan.startsWith("SFL")) {
      console.log(`🚀 Running Seven FinCorp BRE for ${lan}`);

      await autoApproveSevenFinCorpIfAllVerified(lan);

      console.log(`✅ Seven FinCorp BRE finished for ${lan}`);
    }

    if (lan.startsWith("SBU")) {
      console.log(`🚀 Running Bundela BRE for ${lan}`);
      await autoApproveBundelaIfAllVerified(lan);
      console.log(`✅ Bundela BRE finished for ${lan}`);
    }
    if (lan.startsWith("SH")) {
      console.log(`🚀 Running SRBH BRE for ${lan}`);
      await autoApproveBundelaIfAllVerified(lan);
      console.log(`✅ SRBH BRE finished for ${lan}`);
    }
    console.log(`✅ Validation Engine Completed for ${lan}`);
  } catch (err) {
    console.error("❌ Validation Engine Failed:", err);
  }
};

