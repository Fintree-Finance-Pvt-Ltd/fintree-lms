

const db = require("../config/db");

const {
  generateNoc,
} = require("../services/noc.service");

async function generateNocForFullyPaidLoans() {
  try {
    console.log(
      "🔍 Checking Fully Paid WCTL FFPL loans...",
    );

    const [loans] = await db.promise().query(
      `
      SELECT
        lan,
        status,
        customer_name,
        email
      FROM loan_booking_switch_my_loan
      WHERE LOWER(TRIM(status)) = 'fully paid'
        AND lan IS NOT NULL
        AND TRIM(lan) <> ''
      ORDER BY id ASC
      `,
    );

    console.log(
      `📋 Total Fully Paid loans found: ${loans.length}`,
    );

    if (!loans.length) {
      console.log("No Fully Paid loans found.");

      return {
        success: true,
        message: "No Fully Paid WCTL FFPL loans found.",
        summary: {
          totalFullyPaidLoans: 0,
          generated: 0,
          skipped: 0,
          failed: 0,
        },
        results: [],
      };
    }

    let generatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const results = [];

    for (const loan of loans) {
      const lan = String(loan.lan)
        .trim()
        .toUpperCase();

      try {
        /*
         * Prevent duplicate NOC generation
         * and duplicate email.
         */
        const [existingNoc] = await db
          .promise()
          .query(
            `
            SELECT
              id,
              file_name,
              original_name
            FROM loan_documents
            WHERE lan = ?
              AND (
                original_name = ?
                OR file_name LIKE ?
              )
            LIMIT 1
            `,
            [
              lan,
              `NOC - ${lan}`,
              `NOC_${lan}_%`,
            ],
          );

        if (existingNoc.length > 0) {
          skippedCount++;

          console.log(
            `⏭️ NOC already exists, skipped: ${lan}`,
          );

          results.push({
            lan,
            status: "SKIPPED",
            reason: "NOC already exists",
            fileName:
              existingNoc[0].file_name,
          });

          continue;
        }

        console.log(
          `📄 Generating NOC for LAN: ${lan}`,
        );

        const nocResult = await generateNoc({
          lan,
          baseUrl:
            process.env.BACKEND_URL || "",
        });

        generatedCount++;

        console.log(
          `✅ NOC completed for LAN: ${lan}`,
          {
            fileUrl:
              nocResult.fileUrl || null,
            emailStatus:
              nocResult.email?.status || null,
            recipient:
              nocResult.email?.recipient || null,
          },
        );

        results.push({
          lan,
          status: "GENERATED",
          fileUrl:
            nocResult.fileUrl || null,
          emailStatus:
            nocResult.email?.status || null,
          recipient:
            nocResult.email?.recipient || null,
          emailError:
            nocResult.email?.error || null,
        });
      } catch (error) {
        failedCount++;

        console.error(
          `❌ NOC failed for LAN ${lan}:`,
          error.message,
        );

        results.push({
          lan,
          status: "FAILED",
          error: error.message,
        });
      }
    }

    const summary = {
      totalFullyPaidLoans: loans.length,
      generated: generatedCount,
      skipped: skippedCount,
      failed: failedCount,
    };

    console.log(
      "\n========== NOC SCRIPT SUMMARY ==========",
    );

    console.log(summary);
    console.table(results);

    return {
      success: true,
      message:
        "Fully Paid WCTL FFPL NOC process completed.",
      summary,
      results,
    };
  } catch (error) {
    console.error(
      "❌ NOC script failed:",
      error,
    );

    // Send the error back to the Express route.
    throw error;
  }
}

module.exports = {
  generateNocForFullyPaidLoans,
};