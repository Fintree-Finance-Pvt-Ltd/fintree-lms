// testRapidMoneyWebhook.js

require("dotenv").config();

const {
  sendRejectionWebhook,
  sendDisbursementWebhook,
} = require("./switchMyLoanWebhook");
// change this path if your file location is different

async function main() {
  const type = process.argv[2];

  if (!type) {
    console.log("Usage:");
    console.log("node testRapidMoneyWebhook.js rejected <applicationId>");
    console.log(
      "node testRapidMoneyWebhook.js disbursed <applicationId> <transactionId> <disbursementDate> <repaymentDate>",
    );
    process.exit(1);
  }

  if (type === "rejected") {
    const applicationId = process.argv[3];

    if (!applicationId) {
      console.error("applicationId is required");
      console.log("Example:");
      console.log("node testRapidMoneyWebhook.js rejected RM-12098901");
      process.exit(1);
    }

    const result = await sendRejectionWebhook(applicationId);
    console.log("Rejection webhook result:", result);
    return;
  }

  if (type === "disbursed") {
    const applicationId = process.argv[3];
    const transactionId = process.argv[4];
    const disbursementDate = process.argv[5];
    const repaymentDate = process.argv[6];

    if (!applicationId || !transactionId || !disbursementDate || !repaymentDate) {
      console.error(
        "applicationId, transactionId, disbursementDate and repaymentDate are required",
      );
      console.log("Example:");
      console.log(
        "node testRapidMoneyWebhook.js disbursed RM-12098901 TXN123456 2026-07-09 2026-08-09",
      );
      process.exit(1);
    }

    const result = await sendDisbursementWebhook({
      applicationId,
      transactionId,
      disbursementDate,
      repaymentDate,
    });

    console.log("Disbursement webhook result:", result);
    return;
  }

  console.error("Invalid type. Use rejected or disbursed");
  process.exit(1);
}

main().catch((error) => {
  console.error("Webhook test failed:", error);
  process.exit(1);
});