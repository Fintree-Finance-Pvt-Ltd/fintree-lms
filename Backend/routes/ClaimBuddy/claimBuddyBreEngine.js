// services/claimBuddyBreEngine.js

const db = require("../../config/db");

const {
  screenLoanBooking,
} = require("../../services/trackwizz/screeningService");

// ==========================================
// CLAIM BUDDY POLICY PLACEHOLDER
// ==========================================

const evaluateClaimBuddyPolicy = ({ loan, bureauFacts }) => {
  /*
      Claim Buddy BRE rules will be added here later.

      Example:

      Age check
      Income check
      CIBIL check
      Hospital eligibility
      Loan amount limit
      Employment rules

    */

  return {
    status: "BRE APPROVED",

    reasons: [],

    bureauScore: bureauFacts.score || null,
  };
};

// ==========================================
// BASIC BUREAU FACT EXTRACTION
// ==========================================

const extractClaimBuddyBureauFacts = (reportXml) => {
  if (!reportXml) {
    return {
      score: null,
    };
  }

  /*
      XML parsing/rules will be added
      once Claim Buddy BRE rules are finalized
    */

  return {
    score: null,
  };
};

// ==========================================
// MAIN BRE ENGINE
// ==========================================

const autoApproveClaimBuddyIfAllVerified = async (lan) => {
  try {
    console.log("Claim Buddy BRE Engine Started:", lan);

    const pool = db.promise();

    // =================================
    // 1. CHECK KYC
    // =================================

    const [kycRows] = await pool.query(
      `
SELECT

pan_status,

aadhaar_status,

bureau_status


FROM kyc_verification_status


WHERE lan=?

`,

      [lan],
    );

    if (!kycRows.length) {
      console.log("No KYC found:", lan);

      return;
    }

    const kyc = kycRows[0];

    if (
      kyc.pan_status !== "VERIFIED" ||
      kyc.aadhaar_status !== "VERIFIED" ||
      kyc.bureau_status !== "VERIFIED"
    ) {
      await pool.query(
        `

UPDATE loan_booking_claim_buddy


SET

claim_buddy_bre_status=?,

claim_buddy_bre_reason=?,

claim_buddy_bre_checked_at=NOW()


WHERE lan=?


`,

        [
          "Pending",

          `
PAN=${kyc.pan_status || "NA"},
AADHAAR=${kyc.aadhaar_status || "NA"},
BUREAU=${kyc.bureau_status || "NA"}
`,

          lan,
        ],
      );

      console.log("Claim Buddy BRE pending due to KYC:", lan);

      return;
    }

    // =================================
    // 2. FETCH LOAN
    // =================================

    const [loanRows] = await pool.query(
      `

SELECT

*

FROM loan_booking_claim_buddy


WHERE lan=?


LIMIT 1


`,

      [lan],
    );

    if (!loanRows.length) {
      console.log("Claim Buddy loan not found:", lan);

      return;
    }

    const loan = loanRows[0];

    // =================================
    // 3. FETCH CIBIL
    // =================================

    const [cibilRows] = await pool.query(
      `

SELECT

score,

report_xml


FROM loan_cibil_reports


WHERE lan=?


ORDER BY created_at DESC


LIMIT 1


`,

      [lan],
    );

    let bureauFacts = {
      score: cibilRows?.[0]?.score || null,
    };

    if (cibilRows.length && cibilRows[0].report_xml) {
      bureauFacts = extractClaimBuddyBureauFacts(cibilRows[0].report_xml);
    }

    // =================================
    // 4. APPLY CLAIM BUDDY RULES
    // =================================

    const decision = evaluateClaimBuddyPolicy({
      loan,

      bureauFacts,
    });

    // =================================
    // 5. AML CHECK
    // =================================

    let amlStatus = "ERROR";

    try {
      const aml = await screenLoanBooking("claim_buddy", lan);

      amlStatus = aml.amlStatus;
    } catch (err) {
      console.log("AML failed:", err.message);
    }

    // =================================
    // 6. UPDATE LOAN
    // =================================

    let finalStatus = decision.status;

    let finalStage = "LIMIT_APPROVAL_PENDING";

    if (decision.status === "BRE FAILED") {
      finalStage = "BRE_REJECTED";
    }

    await pool.query(
      `

UPDATE loan_booking_claim_buddy


SET


claim_buddy_bre_status=?,


claim_buddy_bre_reason=?,


claim_buddy_bre_checked_at=NOW(),


claim_buddy_bureau_score=?,


stage=?,


status=?


WHERE lan=?


`,

      [
        decision.status,

        decision.reasons.length ? decision.reasons.join(",") : "ELIGIBLE",

        bureauFacts.score,

        finalStage,

        finalStatus,

        lan,
      ],
    );

    console.log(
      `
Claim Buddy BRE completed:
${lan}
${finalStatus}

`,
    );
  } catch (err) {
    console.log("Claim Buddy BRE Error:", err);
  }
};

module.exports = {
  autoApproveClaimBuddyIfAllVerified,

  extractClaimBuddyBureauFacts,

  evaluateClaimBuddyPolicy,
};
