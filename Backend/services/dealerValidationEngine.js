const db = require("../config/db");
const { getPanCardDetails } = require("./pancardapiservice");
const { initAadhaarKyc } = require("./digitapaadharservice");
const { runBureau } = require("./Bueraupullapiservice");

exports.runDealerValidations = async (dealerLan) => {
  try {
    console.log(`🚀 Dealer Validation Started: ${dealerLan}`);
    const pool = db.promise();

    // ------------------------------------------------
    // 0️⃣ Fetch dealer
    // ------------------------------------------------
    const [dealerRows] = await pool.query(
      "SELECT * FROM dealer_onboarding WHERE dealer_LAN = ?",
      [dealerLan]
    );

    if (!dealerRows.length) {
      console.log("❌ Dealer not found:", dealerLan);
      return;
    }

    const dealer = dealerRows[0];

    // ------------------------------------------------
    // Ensure KYC row exists
    // ------------------------------------------------
    await pool.query(
      "INSERT IGNORE INTO dealer_kyc_verification_status (dealer_lan) VALUES (?)",
      [dealerLan]
    );

    const [kycRows] = await pool.query(
      `SELECT pan_status, aadhaar_status, bureau_status
       FROM dealer_kyc_verification_status
       WHERE dealer_lan=?`,
      [dealerLan]
    );

    const kyc = kycRows[0];

    // ------------------------------------------------
    // 1️⃣ PAN VERIFICATION
    // ------------------------------------------------
    if (kyc.pan_status !== "VERIFIED") {
      await pool.query(
        "UPDATE dealer_kyc_verification_status SET pan_status='INITIATED' WHERE dealer_lan=?",
        [dealerLan]
      );

      const panRes = await getPanCardDetails(
        dealer.pan_number,
        dealer.pan_name
      ).catch(err => ({
        success: false,
        response: err?.response?.data || { error: err.message }
      }));

      await pool.query(
        `UPDATE dealer_kyc_verification_status
         SET pan_status=?, pan_api_response=?
         WHERE dealer_lan=?`,
        [
          panRes.success ? "VERIFIED" : "FAILED",
          JSON.stringify(panRes.response || {}),
          dealerLan
        ]
      );

      console.log(`📌 Dealer PAN: ${panRes.success ? "VERIFIED" : "FAILED"}`);
    } else {
      console.log("⏭️ PAN already VERIFIED, skipping");
    }

    // ------------------------------------------------
    // 2️⃣ AADHAAR INIT (Digitap)
    // ------------------------------------------------
    if (kyc.aadhaar_status !== "VERIFIED") {
      await pool.query(
        `UPDATE dealer_kyc_verification_status
         SET aadhaar_status='INITIATED'
         WHERE dealer_lan=? AND aadhaar_status='PENDING'`,
        [dealerLan]
      );

      const fullName = `${dealer.first_name} ${dealer.last_name}`.trim();

      const aadhaarInit = await initAadhaarKyc(
        dealerLan,
        dealer.mobile_number,
        dealer.email_id,
        fullName
      );

      if (aadhaarInit?.success) {
        await pool.query(
          `UPDATE dealer_kyc_verification_status
           SET aadhaar_transaction_id=?,
               aadhaar_kyc_url=?,
               aadhaar_unique_id=?,
               aadhaar_api_response=?
           WHERE dealer_lan=?`,
          [
            aadhaarInit.unifiedTransactionId,
            aadhaarInit.kycUrl,
            aadhaarInit.uniqueId,
            JSON.stringify(aadhaarInit.raw || aadhaarInit),
            dealerLan
          ]
        );

        console.log("📨 Aadhaar KYC link generated");
      } else {
        await pool.query(
          `UPDATE dealer_kyc_verification_status
           SET aadhaar_status='FAILED',
               aadhaar_api_response=?
           WHERE dealer_lan=?`,
          [JSON.stringify(aadhaarInit?.error || aadhaarInit), dealerLan]
        );

        console.log("❌ Aadhaar INIT failed");
      }
    } else {
      console.log("⏭️ Aadhaar already VERIFIED, skipping");
    }
// ------------------------------------------------
// 3️⃣ BUREAU VALIDATION
// ------------------------------------------------
if (kyc.bureau_status !== "VERIFIED") {
  await pool.query(
    "UPDATE dealer_kyc_verification_status SET bureau_status='INITIATED' WHERE dealer_lan=?",
    [dealerLan]
  );

  let dobStr = dealer.dob;
  if (dealer.dob instanceof Date) {
    dobStr = dealer.dob.toISOString().split("T")[0];
  }

  const bureauRes = await runBureau({
    customer_name: `${dealer.first_name} ${dealer.last_name}`.trim(),
    first_name: dealer.first_name,
    last_name: dealer.last_name,
    dob: dobStr,
    gender: dealer.gender,
    pan_number: dealer.business_pan_number,
    mobile_number: dealer.mobile_number,
    current_address: dealer.current_address,
    current_state: dealer.current_state,
    current_pincode: dealer.current_pincode,
    loan_amount: dealer.loan_amount,
    loan_tenure: dealer.loan_tenure
  }).catch(err => ({
    success: false,
    score: null,
    response: { error: err.message }
  }));

  await pool.query(
    `UPDATE dealer_kyc_verification_status
     SET bureau_status=?,
         bureau_api_response=?,
         bureau_score=?
     WHERE dealer_lan=?`,
    [
      bureauRes.success ? "VERIFIED" : "FAILED",
      JSON.stringify(bureauRes.response || {}),
      bureauRes.score || null,
      dealerLan
    ]
  );

  await pool.query(
    `INSERT INTO loan_cibil_reports
     (lan, pan_number, score, report_xml, created_at)
     VALUES (?,?,?,?, NOW())`,
    [
      dealerLan,   // ✅ dealer LAN stored in lan column
      dealer.business_pan_number,
      bureauRes.score,
      bureauRes.response ? JSON.stringify(bureauRes.response) : null
    ]
  );

  console.log(`📌 Dealer Bureau: ${bureauRes.success ? "VERIFIED" : "FAILED"}`);
}
 // Final Snapshot
    // ------------------------------------------------
    const [finalRows] = await pool.query(
      "SELECT pan_status, aadhaar_status, bureau_status FROM dealer_kyc_verification_status WHERE dealer_lan=?",
      [dealerLan]
    );

    console.log("✅ Dealer Validation Completed:", {
      dealer_lan: dealerLan,
      pan: finalRows[0].pan_status,
      aadhaar: finalRows[0].aadhaar_status,
      bureau: finalRows[0].bureau_status
    });

  } catch (err) {
    console.error("❌ Dealer validation engine error:", err);
  }
};
