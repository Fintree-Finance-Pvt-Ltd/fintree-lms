// smsTest.js
require("dotenv").config();
const { sendSms } = require("./smsService"); // adjust path

async function main() {
  try {
    const mobile = "7409553871"; 
    const customer_name = "sajag jain";
    const kycUrl = "https://klr.bz/DIGITAP/jhpEib";
    const loanName = "Personal Loan"; 
    const validityMinutes = 10; 
    const message = `Dear ${customer_name}, to complete your Aadhaar DigiLocker KYC for ${loanName}, please click ${kycUrl}. This link is valid for ${validityMinutes} minutes. Do not share this link or any OTP with anyone. - Regards Fintree Finance Pvt Ltd.`;
    const dltTemplateId = process.env.DLT_TEMPLATE_ID_AADHAAR_KYC; // or any valid template

    console.log("🚀 Sending test SMS...");
    const resp = await sendSms({ mobile, message, dltTemplateId });

    console.log("✅ SMS sent! Provider response snippet:");
    console.log(resp);
  } catch (err) {
    console.error("❌ SMS test failed:", err.message || err);
  }
}

main();
