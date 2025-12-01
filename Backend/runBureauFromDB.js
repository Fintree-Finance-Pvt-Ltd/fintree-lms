require("dotenv").config();
// const mysql = require("mysql2/promise");
const db = require("../config/db");
const { autoApproveIfAllVerified } = require("../services/heliumValidationEngine");
const { runBureau } = require("../services/Bueraupullapiservice");

async function main() {
  const lan = process.argv[2];

  if (!lan) {
    console.log("❗ Usage: node runBureauFromDB.js <LAN>");
    process.exit(1);
  }

  console.log("🔍 Fetching loan for LAN:", lan);

  const [rows] = await db.promise().query(
    "SELECT * FROM loan_booking_helium WHERE lan = ? LIMIT 1",
    [lan]
  );

  if (rows.length === 0) {
    console.log("❌ No loan found for LAN:", lan);
    process.exit(1);
  }

  const loan = rows[0];

  console.log("📄 Loan Data Found:");
  console.log(loan);

  // Format DOB properly
  let dobStr = loan.dob;
  if (loan.dob instanceof Date) {
    dobStr = loan.dob.toISOString().split("T")[0];
  }

  // Build payload exactly like backend
  const payload = {
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
    loan_tenure: loan.loan_tenure,
  };

  console.log("\n🚀 Running Bureau with Payload:");
  console.log(payload);

  const result = await runBureau(payload);

  console.log("\n==============================");
  console.log("📌 BUREAU RESULT");
  console.log("==============================");

  console.log("✔ Success:", result.success);
  console.log("✔ Score:", result.score);
  console.log("✔ XML Report:\n", result.response);

   try {
    await db.promise().query(
      `INSERT INTO loan_cibil_reports 
      (lan, pan_number, score, report_xml, created_at)
      VALUES (?, ?, ?, ?, NOW())`,
      [
        lan,
        loan.pan_number,
        result.score,
        result.response ? String(result.response) : null,
      ]
    );

    console.log("🟢 CIBIL Report saved successfully!");
  } catch (err) {
    console.error("❌ Failed to save CIBIL report:", err);
  }

  await autoApproveIfAllVerified(lan);

  process.exit(0);

  
}

main();
