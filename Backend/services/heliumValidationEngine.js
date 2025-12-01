// // services/heliumValidationEngine.js

// const db = require("../config/db");
// const { getPanCardDetails } = require("./pancardapiservice");
// const { runBureau } = require("./Bueraupullapiservice");
// const { initAadhaarKyc } = require("./digitapaadharservice");

// exports.runAllValidations = async (lan) => {
//   try {
//     console.log(`🚀 Starting HELIUM Validation Engine for LAN: ${lan}`);

//     // Fetch loan details
//     const [loanRows] = await db
//       .promise()
//       .query("SELECT * FROM loan_booking_helium WHERE lan = ?", [lan]);

//     if (loanRows.length === 0) {
//       console.log("❌ Loan not found. Cannot validate.");
//       return;
//     }

//     const loan = loanRows[0];

//     // -------------------------------
//     // 1️⃣ PAN VALIDATION
//     // -------------------------------

//     await db
//       .promise()
//       .query(
//         "UPDATE kyc_verification_status SET pan_status='INITIATED' WHERE lan=?",
//         [lan]
//       );

//     let panResult = await getPanCardDetails(
//       loan.pan_number,
//       loan.customer_name
//     ).catch(() => ({
//       success: false,
//       response: null,
//     }));

//     await db
//       .promise()
//       .query(
//         "UPDATE kyc_verification_status SET pan_status=?, pan_api_response=? WHERE lan=?",
//         [
//           panResult.success ? "VERIFIED" : "FAILED",
//           JSON.stringify(panResult.response || {}),
//           lan,
//         ]
//       );

//     console.log(`📌 PAN Status for ${lan}:`, panResult.success ? "VERIFIED" : "FAILED");

//      // -----------------------------------------
//     // 2️⃣ AADHAAR INIT (Digitap URL generation)
//     // -----------------------------------------

//     await db
//       .promise()
//       .query(
//         "UPDATE kyc_verification_status SET aadhaar_status='INITIATED' WHERE lan=?",
//         [lan]
//       );

//     const aadhaarInit = await initAadhaarKyc(lan,
//   loan.mobile_number,
//   loan.email_id,
//   loan.customer_name);

//     if (aadhaarInit.success) {
//       await db
//         .promise()
//         .query(
//           `UPDATE kyc_verification_status 
//            SET aadhaar_transaction_id=?, aadhaar_kyc_url=?, aadhaar_unique_id=? 
//            WHERE lan=?`,
//           [
//             aadhaarInit.unifiedTransactionId,
//             aadhaarInit.kycUrl,
//             aadhaarInit.uniqueId,
//             lan,
//           ]
//         );

//       console.log("📨 Sending Aadhaar KYC URL via SMS:", aadhaarInit.kycUrl);
//       // TODO: integrate SMS service

//     } else {
//       console.log("❌ Aadhaar INIT Failed, marking FAILED");
//       await db
//         .promise()
//         .query(
//           "UPDATE kyc_verification_status SET aadhaar_status='FAILED' WHERE lan=?",
//           [lan]
//         );
//     }

//     // NOTE: Aadhaar VERIFICATION happens later via callback/webhook


//     // -------------------------------
//     // 2️⃣ BUREAU VALIDATION (Experian via SOAP)
//     // -------------------------------

//     await db
//       .promise()
//       .query(
//         "UPDATE kyc_verification_status SET bureau_status='INITIATED' WHERE lan=?",
//         [lan]
//       );

//     let bureauResult = await runBureau({
//       customer_name: loan.customer_name,
//       first_name: loan.first_name,
//       last_name: loan.last_name,
//       dob: loan.dob,
//       gender: loan.gender,
//       pan_number: loan.pan_number,
//       mobile_number: loan.mobile_number,
//       current_address: loan.current_address,
//       current_village_city: loan.current_village_city,
//       current_state: loan.current_state,
//       current_pincode: loan.current_pincode,
//       loan_amount: loan.loan_amount,
//       loan_tenure: loan.loan_tenure,
//     }).catch(() => ({
//       success: false,
//       score: null,
//       response: null,
//     }));

//     await db
//       .promise()
//       .query(
//         "UPDATE kyc_verification_status SET bureau_status=?, bureau_api_response=? WHERE lan=?",
//         [
//           bureauResult.success ? "VERIFIED" : "FAILED",
//           bureauResult.response ? bureauResult.response.toString() : "",
//           lan,
//         ]
//       );

//     console.log(`📌 Bureau Status for ${lan}:`, bureauResult.success ? "VERIFIED" : "FAILED");
//     console.log(`📌 Bureau Score Extracted:`, bureauResult.score);

//     // -------------------------------
//     // 3️⃣ AUTO DECISION ENGINE
//     // -------------------------------

//     let finalStatus = "";

//     if (panResult.success && bureauResult.success) {
//       finalStatus = "Approved";
//     } else {
//       finalStatus = "Rejected";
//     }

//     await db
//       .promise()
//       .query("UPDATE loan_booking_helium SET status=? WHERE lan=?", [
//         finalStatus,
//         lan,
//       ]);

//     console.log(`🎯 FINAL DECISION FOR ${lan}: ${finalStatus}`);

//   } catch (err) {
//     console.error("❌ Validation Engine Failed:", err);
//   }
// };


// exports.autoApproveIfAllVerified = async (lan) => {
//   const [rows] = await db
//     .promise()
//     .query(
//       `SELECT pan_status, aadhaar_status, bureau_status 
//        FROM kyc_verification_status WHERE lan=?`,
//       [lan]
//     );

//   if (!rows.length) return;

//   const v = rows[0];

//   if (
//     v.pan_status === "VERIFIED" &&
//     v.aadhaar_status === "VERIFIED" &&
//     v.bureau_status === "VERIFIED"
//   ) {
//     await db
//       .promise()
//       .query(
//         `UPDATE loan_booking_helium SET status='Approved' WHERE lan=?`,
//         [lan]
//       );

//     console.log(`🎉 LOAN APPROVED FOR LAN: ${lan}`);
//   } else {
//     console.log(`⏳ Loan ${lan} pending — some checks not verified.`);
//   }
// };




// services/heliumValidationEngine.js

const db = require("../config/db");
const { getPanCardDetails } = require("./pancardapiservice");
const { runBureau } = require("./Bueraupullapiservice");
const { initAadhaarKyc } = require("./digitapaadharservice");

// -------------------------------
// Helper functions for BRE
// -------------------------------
function calculateAge(dob) {
  if (!dob) return null;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(d.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

function mapExperianScoreToPolicy(experianScore) {
  if (experianScore == null) return 25;
  if (experianScore >= 750) return 90;
  if (experianScore >= 700) return 75;
  if (experianScore >= 675) return 50;
  return 25;
}

function mapAgeScore(age) {
  if (age == null) return 25;
  if (age >= 45 && age <= 60) return 90;
  if (age >= 35 && age < 45) return 75;
  if (age >= 25 && age < 35) return 50;
  if (age >= 18 && age < 25) return 25;
  return 25;
}

function mapCustomerTypeScore(type) {
  if (!type) return 50;
  const t = String(type).toLowerCase();
  if (t.includes("family")) return 90;
  return 50; // individual / others
}

function mapEmploymentScore(empType) {
  if (!empType) return 50;
  const e = String(empType).toLowerCase();
  if (e.includes("salaried")) return 90;
  if (e.includes("business") || e.includes("self")) return 50;
  return 50;
}

function mapIncomeRentScore(netIncome, avgRent) {
  if (!netIncome || !avgRent || avgRent <= 0) return 25;
  const ratio = netIncome / avgRent;
  if (ratio >= 4) return 90;
  if (ratio >= 3) return 75;
  if (ratio >= 2) return 50;
  return 25;
}

// 🚀 UPDATED: returns components + flags
function computeHeliumRiskScore({
  dob,
  cibilScore,
  customerType,
  employmentType,
  netMonthlyIncome,
  avgMonthlyRent,
}) {
  const age = calculateAge(dob);

  const creditScoreComp = mapExperianScoreToPolicy(cibilScore);
  const ageScore = mapAgeScore(age);
  const custTypeScore = mapCustomerTypeScore(customerType);
  const empScore = mapEmploymentScore(employmentType);
  const incomeScore = mapIncomeRentScore(netMonthlyIncome, avgMonthlyRent);

  const demographicScore = (ageScore + custTypeScore) / 2;

  const hrs =
    0.35 * creditScoreComp +
    0.25 * incomeScore +
    0.15 * empScore +
    0.25 * demographicScore;

  const finalHrs = Math.round(hrs * 100) / 100;

  // Flags: 1 = eligible (score > 25), 0 = not eligible (score == 25)
  const creditFlag = creditScoreComp > 25 ? 1 : 0;
  const ageFlag = ageScore > 25 ? 1 : 0;
  const custTypeFlag = custTypeScore > 25 ? 1 : 0;
  const empFlag = empScore > 25 ? 1 : 0;
  const incomeFlag = incomeScore > 25 ? 1 : 0;
  const demographicFlag = demographicScore > 25 ? 1 : 0;

  // Total HRS flag – 1 if eligible (>=50), 0 otherwise
  const totalFlag = finalHrs >= 50 ? 1 : 0;

  let riskBand = "Not Eligible";
  let loanMonths = 0;
  let depositMonths = 0;

  if (finalHrs >= 80) {
    riskBand = "Low";
    loanMonths = 3;
    depositMonths = 1;
  } else if (finalHrs >= 70) {
    riskBand = "Moderate";
    loanMonths = 2;
    depositMonths = 2;
  } else if (finalHrs >= 50) {
    riskBand = "High";
    loanMonths = 1;
    depositMonths = 3;
  } else {
    riskBand = "Not Eligible";
  }

  return {
    hrs: finalHrs,
    riskBand,
    loanMonths,
    depositMonths,
    components: {
      credit: { score: creditScoreComp, flag: creditFlag },
      age: { score: ageScore, flag: ageFlag },
      customerType: { score: custTypeScore, flag: custTypeFlag },
      employment: { score: empScore, flag: empFlag },
      income: { score: incomeScore, flag: incomeFlag },
      demographic: { score: demographicScore, flag: demographicFlag },
      total: { score: finalHrs, flag: totalFlag },
    },
  };
}

// -------------------------------
// MAIN: Run all validations
// -------------------------------

exports.runAllValidations = async (lan) => {
  try {
    console.log(`🚀 Starting HELIUM Validation Engine for LAN: ${lan}`);

    const pool = db.promise();

    // Fetch loan details
    const [loanRows] = await pool.query(
      "SELECT * FROM loan_booking_helium WHERE lan = ?",
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
      current_address: loan.current_address,
      current_village_city: loan.current_village_city,
      current_state: loan.current_state,
      current_pincode: loan.current_pincode,
      loan_amount: loan.loan_amount,
      loan_tenure: loan.loan_tenure,
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

    console.log(
      `📌 Bureau Status for ${lan}:`,
      bureauResult.success ? "VERIFIED" : "FAILED"
    );
    console.log(`📌 Bureau Score Extracted:`, bureauResult.score);

    if (bureauResult.score != null) {
      await pool.query(
        "UPDATE loan_booking_helium SET cibil_score=? WHERE lan=?",
        [bureauResult.score, lan]
      );
    }

  } catch (err) {
    console.error("❌ Validation Engine Failed:", err);
  }
};

// -------------------------------
// AUTO APPROVAL + BRE
// -------------------------------

exports.autoApproveIfAllVerified = async (lan) => {
  const pool = db.promise();

  // 1️⃣ Check KYC statuses
  const [rows] = await pool.query(
    `SELECT pan_status, aadhaar_status, bureau_status 
     FROM kyc_verification_status WHERE lan=?`,
    [lan]
  );

  if (!rows.length) {
    console.log("❌ No KYC row found for LAN:", lan);
    return;
  }

  const v = rows[0];

  if (
    v.pan_status !== "VERIFIED" ||
    v.aadhaar_status !== "VERIFIED" ||
    v.bureau_status !== "VERIFIED"
  ) {
    console.log(
      `⏳ Loan ${lan} pending — some checks not verified.`,
      v.pan_status,
      v.aadhaar_status,
      v.bureau_status
    );
    return;
  }

  // 2️⃣ Fetch loan for BRE
  const [loanRows] = await pool.query(
    `SELECT dob, cibil_score, customer_type, employment_type,
            net_monthly_income, avg_monthly_rent,
            loan_amount, loan_tenure
     FROM loan_booking_helium WHERE lan=?`,
    [lan]
  );

  if (!loanRows.length) {
    console.log("❌ Loan not found during BRE for LAN:", lan);
    return;
  }

  const loan = loanRows[0];

  // 3️⃣ Hard knockout checks
  const age = calculateAge(loan.dob);
  const hardFailReasons = [];

  if (!age || age < 21 || age > 60) hardFailReasons.push("AGE");
  if (loan.loan_amount < 25000 || loan.loan_amount > 500000)
    hardFailReasons.push("TICKET");
  if (Number(loan.loan_tenure) !== 12) hardFailReasons.push("TENURE");
  if (!loan.cibil_score || loan.cibil_score < 675)
    hardFailReasons.push("BUREAU_MIN");

  if (hardFailReasons.length > 0) {
    console.log("❌ BRE HARD FAIL for", lan, "reasons:", hardFailReasons);
    await pool.query(
      `UPDATE loan_booking_helium
       SET status='Rejected',
           helium_risk_score=NULL,
           helium_risk_band='Not Eligible',
           helium_risk_flag=0
       WHERE lan=?`,
      [lan]
    );
  }

  // 4️⃣ Compute Helium Risk Score + component scores/flags
  const { hrs, riskBand, components } = computeHeliumRiskScore({
    dob: loan.dob,
    cibilScore: loan.cibil_score,
    customerType: loan.customer_type,
    employmentType: loan.employment_type,
    netMonthlyIncome: loan.net_monthly_income,
    avgMonthlyRent: loan.avg_monthly_rent,
  });

  let finalStatus = "Approved";
  if (hrs < 50) finalStatus = "Rejected";

  await pool.query(
    `UPDATE loan_booking_helium
     SET 
       status = ?,
       helium_risk_score = ?,
       helium_risk_band = ?,

       helium_credit_score_comp = ?,
       helium_credit_score_flag = ?,

       helium_age_score = ?,
       helium_age_flag = ?,

       helium_customer_type_score = ?,
       helium_customer_type_flag = ?,

       helium_employment_score = ?,
       helium_employment_flag = ?,

       helium_income_score = ?,
       helium_income_flag = ?,

       helium_demographic_score = ?,
       helium_demographic_flag = ?,

       helium_risk_flag = ?
     WHERE lan = ?`,
    [
      finalStatus,
      hrs,
      riskBand,

      components.credit.score,
      components.credit.flag,

      components.age.score,
      components.age.flag,

      components.customerType.score,
      components.customerType.flag,

      components.employment.score,
      components.employment.flag,

      components.income.score,
      components.income.flag,

      components.demographic.score,
      components.demographic.flag,

      components.total.flag,
      lan,
    ]
  );

  console.log(
    `🎯 FINAL DECISION FOR ${lan}: ${finalStatus} | HRS=${hrs} | Band=${riskBand} | TotalFlag=${components.total.flag}`
  );
};
