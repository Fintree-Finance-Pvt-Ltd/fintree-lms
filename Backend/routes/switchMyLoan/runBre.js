// bre/runBre.js

const db = require("../../config/db");
const { amlCheck } = require("../../utils/amlCrimescanService");
const mobileRevocationLookup = require("../../utils/mnrlApiService");


function roundDownToThousand(value) {
  return Math.floor(Number(value || 0) / 1000) * 1000;
}

function isNewCustomer(totalDisbursedApplications) {
  return Number(totalDisbursedApplications || 0) === 0;
}

function calculateCreditLimit(data) {
  const totalDisbursed = Number(data.total_disbursed_applications || 0);
  const previousLoanAmount = Number(data.previous_loan_amount || 0);

  let limit = 0;

  if (totalDisbursed === 0) limit = 8000;
  else if (totalDisbursed <= 2) limit = previousLoanAmount * 1.25;
  else if (totalDisbursed <= 6) limit = previousLoanAmount * 2;
  else limit = previousLoanAmount * 2.5;

  if (limit > 15000) limit = 15000;
  if (limit < 8000) limit = 8000;

  return roundDownToThousand(limit);
}


/**
 * AML Decision Engine
 */
// function getAmlDecision(score) {

//   if (score >= 90) return "REJECT";
//   if (score >= 70) return "REVIEW";

//   return "CLEAR";
// }

function getAmlDecision(score, totalMatches) {

  // No AML match → safe
  if (totalMatches === 0) return "CLEAR";

  if (score >= 70) return "CLEAR";

  return "REJECT";
}

// function getMobileRevocationDecision(result) {
//   if (!result) return "CLEAR";

//   if (result.mobile_number_status === "REVOKED")
//     return "REJECT";

//   if (
//     result.fri_status === "Flagged for reverification" ||
//     result.severity_index === "Very High Severity"
//   )
//     return "REVIEW";

//   return "CLEAR";
// }

function getMobileRevocationDecision(result) {

  if (!result) return "CLEAR";

  if (result.mobile_number_status === "REVOKED")
    return "REJECT";

  if (
    result.fri_status === "Flagged for reverification" ||
    result.mobile_number_status === "SUSPECTED" ||
    result.severity_index === "Very High Severity"
  )
    return "REJECT"; // earlier REVIEW

  return "CLEAR";
}


/**
 * MAIN BRE FUNCTION
 */
async function runBRE(data) {

  const lan = data.lan;

  // STEP 1️⃣ Check existing AML result
  const [rows] = await db.promise().query(
    `SELECT aml_score, aml_status, mobile_revocation_status
     FROM loan_booking_switch_my_loan
     WHERE lan = ?`,
    [lan]
  );

  let amlScore = rows?.[0]?.aml_score || null;
  let amlStatus = rows?.[0]?.aml_status || null;
  let mobileRevocationStatus =
    rows?.[0]?.mobile_revocation_status ?? null;


    console.log(`Existing AML score: ${amlScore}, status: ${amlStatus}, mobile revocation status: ${mobileRevocationStatus}`);
  // STEP 2️⃣ If AML not already run → trigger AML API
  if (amlScore === null ) {

    console.log("Triggering AML check for LAN:", lan);
    console.log("aml request", {
      customer_name: data.full_name,
      location: data.city,
      father_name: data.father_name,
      pan_number: data.pan_number,
      phone: data.mobile
    });

    const amlResult = await amlCheck("switch-my-loan", {
      customer_name: data.full_name,
      location: data.city,
      father_name: data.father_name,
      pan_number: data.pan_number,
      phone: data.mobile
    });

    console.log("AML Result:", amlResult);

    // const match = amlResult?.results?.[0];

    // amlScore = match?.score || 0;

if (!amlResult || amlResult.total === 0) {

  // No AML match → safe
  amlScore = 100;

} else {

  const match = amlResult.results[0];
  amlScore = match?.score || 0;

}

    amlStatus = getAmlDecision(
      amlScore,
      amlResult.total
    );    

    // Save AML result
    await db.promise().query(
      `UPDATE loan_booking_switch_my_loan
       SET aml_score = ?, aml_status = ?, aml_checked_at = NOW()
       WHERE lan = ?`,
      [amlScore, amlStatus, lan]
    );
  }


  // STEP 3️⃣ Decision based on AML status
  if (amlStatus === "REJECT") {
    return {
      decision: "REJECTED",
      reason: "AML_HIGH_RISK_MATCH",
      amlScore
    };
  }

  // if (amlStatus === "REVIEW") {
  //   return {
  //     decision: "MANUAL_REVIEW",
  //     reason: "AML_MEDIUM_RISK_MATCH",
  //     amlScore
  //   };
  // }

  if (amlStatus === "REVIEW") {
  return {
    decision: "REJECTED",
    reason: "AML_MEDIUM_RISK_MATCH",
    amlScore
  };
}



  // STEP 4️⃣ Mobile Revocation Lookup Check

if (!mobileRevocationStatus) {

let mobileRevocationResult = null;

  try {
  mobileRevocationResult = await mobileRevocationLookup(
    data.mobile,
    lan
  );
} catch (err) {
  console.error("Mobile revocation lookup failed:", err.message);
  mobileRevocationResult = null;
}

  mobileRevocationStatus =
    getMobileRevocationDecision(mobileRevocationResult);

  await db.promise().query(
    `UPDATE loan_booking_switch_my_loan
     SET mobile_revocation_status = ?,
         mobile_revocation_checked_at = NOW()
     WHERE lan = ?`,
    [mobileRevocationStatus, lan]
  );
}


// STEP 5️⃣ Reject if revoked number

if (mobileRevocationStatus === "REJECT") {
  return {
    decision: "REJECTED",
    reason: "MOBILE_NUMBER_REVOKED"
  };
}


// STEP 6️⃣ Manual review if suspicious number

// if (mobileRevocationStatus === "REVIEW") {
//   return {
//     decision: "MANUAL_REVIEW",
//     reason: "MOBILE_NUMBER_SUSPECTED"
//   };
// }

if (mobileRevocationStatus === "REVIEW") {
  return {
    decision: "REJECTED",
    reason: "MOBILE_NUMBER_SUSPECTED"
  };
}


  // STEP 4️⃣ Continue normal BRE logic

  const totalDisbursed = Number(data.total_disbursed_applications || 0);

  const newCustomer = isNewCustomer(totalDisbursed);

  const creditLimit = calculateCreditLimit(data);

  return {
    decision: "APPROVED",

    aml: {
      status: amlStatus,
      score: amlScore
    },

    mobile_revocation: mobileRevocationStatus,

    rules: {
      CREDIT_LIMIT_CHECK_RPM: {
        derived_values: {
          LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM:
            newCustomer ? creditLimit : 0,

          LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM:
            newCustomer ? 0 : creditLimit
        }
      }
    }
  };
}

module.exports = runBRE;