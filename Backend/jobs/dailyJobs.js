// const cron = require("node-cron");
// const db = require("../config/db");
// const { generateAllPending } = require("./cibilPdfService");

// // Run every day at 12:05 AM server time
// cron.schedule("*/2 * * * *", async () => {
//   console.log("⏰ Running DPD update (every 2 min)...");

//   // List of tables to update, matching the stored procedure
//   const tables = [
//     "manual_rps_ev_loan",
//     "manual_rps_wctl",
//     "manual_rps_gq_non_fsf",
//     "manual_rps_gq_non_fsf_fintree",
//     "manual_rps_gq_fsf",
//     "manual_rps_adikosh",
//     "manual_rps_adikosh_fintree",
//     "manual_rps_adikosh_partner",
//     "manual_rps_adikosh_fintree_roi",
//     "manual_rps_embifi_loan",
//     "manual_rps_emiclub",
//     "manual_rps_bl_loan",
//     "manual_rps_circlepe",
//     "manual_rps_finso_loan",
//     "manual_rps_hey_ev",
//     "manual_rps_gq_fsf_fintree"

//   ];

//   try {
//     for (const table of tables) {
//       //console.log(`🔄 Updating table: ${table}`);

//       // Single UPDATE query with CASE statements, matching the stored procedure
//       await db.promise().query(`
//         UPDATE ${table}
//         SET
//           status = CASE
//     WHEN remaining_principal = 0 AND remaining_interest = 0 THEN 'Paid'

//     WHEN (
//         (emi > 0 AND remaining_emi < 0)
//            ) THEN 'Part Paid'

//     WHEN due_date < CURDATE() AND remaining_principal > 0 THEN 'Late'
//     WHEN due_date = CURDATE() AND remaining_principal > 0 THEN 'Due'
//     WHEN due_date > CURDATE() THEN 'Not Set'

//     ELSE status
// END,
//           dpd = CASE
//             WHEN remaining_principal = 0 AND remaining_interest = 0 THEN 0
//             WHEN due_date > CURDATE() THEN 0
//             WHEN due_date <= CURDATE() THEN GREATEST(DATEDIFF(CURDATE(), due_date), 0)
//             ELSE dpd
//           END
//       `);

//     }

//     console.log("✅ All tables updated successfully");
//     // 2️⃣ Call your OOD ledger procedure for all LANs (yesterday’s date)
//     const sql = `CALL sp_cc_ood_generate_all(
//       DATE_SUB(CURDATE(), INTERVAL 1 DAY),
//       DATE_SUB(CURDATE(), INTERVAL 1 DAY)
//     )`;
//     await db.promise().query(sql);

//     console.log("✅ OOD ledger generated successfully for all LANs");

//   } catch (err) {
//     console.error("❌ Cron job failed:", err.sqlMessage || err.message);
//   }
// });

// cron.schedule("*/2 * * * *", async () => {
//   console.log("🧾 Running CIBIL PDF generator (every 2 min)...");
//   try {
//     const results = await generateAllPending(150);
//     const ok = results.filter(r => r.ok).length;
//     const fail = results.length - ok;
//     console.log(`✅ PDF job finished | processed: ${results.length}, success: ${ok}, failed: ${fail}`);
//     results.filter(r => !r.ok).forEach(r => console.error(`  ↳ id=${r.id} error=${r.error}`));
//   } catch (e) {
//     console.error("❌ PDF cron failed:", e.message);
//   }
// });

// cron.schedule("*/2 * * * *", async () => {
//   try {
//      const sql = `CALL update_risk_and_bucket()`;
//     await db.promise().query(sql);
//     console.log("✅ Risk done");
//   } catch (e) {
//     console.error("❌ Risk cron failed:", e.message);
//   }
// });

// require('../server');
///////////////
const cron = require("node-cron");
const db = require("../config/db");
const { generateAllPending } = require("./cibilPdfService");
const { runDailyInterestAccrual } = require( "./wctlccodinterestengine");
const startAadhaarCron = require("./aadhaarPdfCron");
const { sendLoanWebhook } = require("../utils/webhook");
const {
  retriggerFailedBureauBatch,
  PARTNERS,
} = require("../services/bureauRetriggerService");

// 1️⃣ DPD + OOD Cron
// cron.schedule("*/2 * * * *", async () => {
//   console.log("⏰ Running DPD update (every 2 min)...");

//   const tables = [
//     "manual_rps_ev_loan",
//     "manual_rps_wctl",
//     "manual_rps_gq_non_fsf",
//     "manual_rps_gq_non_fsf_fintree",
//     "manual_rps_gq_fsf",
//     "manual_rps_adikosh",
//     "manual_rps_adikosh_fintree",
//     "manual_rps_adikosh_partner",
//     "manual_rps_adikosh_fintree_roi",
//     "manual_rps_embifi_loan",
//     "manual_rps_emiclub",
//     "manual_rps_bl_loan",
//     "manual_rps_circlepe",
//     "manual_rps_finso_loan",
//     "manual_rps_hey_ev",
//     "manual_rps_gq_fsf_fintree",
//     "manual_rps_helium",
//     "manual_rps_hey_ev_battery",
//     "manual_rps_zypay",
//     "manual_rps_clayoo",
//     "manual_rps_motioncorp",
//     "manual_rps_loan_digit",
//     "manual_rps_circle_pe_houser",
//     "manual_rps_switch_my_loan",
//   ];

//   try {
//     for (const table of tables) {
//       await db.promise().query(`
//         UPDATE ${table}
//         SET
//           status = CASE
//               WHEN remaining_principal = 0 
//          AND remaining_interest = 0 
//     THEN 'Paid'

//    WHEN emi > 0
//      AND remaining_emi > 0
//      AND remaining_emi < emi
// THEN 'Part Paid'


//     WHEN due_date < CURDATE() 
//          AND (principal =remaining_principal  and interest= remaining_interest )
//     THEN 'Late'

//     WHEN due_date = CURDATE() 
//          AND (remaining_principal > 0 OR remaining_interest > 0)
//     THEN 'Due'

//     WHEN due_date > CURDATE() 
//     THEN 'Not Set'
//             ELSE status
//           END,
//           dpd = CASE
//             WHEN remaining_principal = 0 AND remaining_interest = 0 THEN 0
//             WHEN due_date > CURDATE() THEN 0
//             WHEN due_date <= CURDATE() THEN GREATEST(DATEDIFF(CURDATE(), due_date), 0)
//             ELSE dpd
//           END
//       `);
//     }

//     console.log("✅ All tables updated successfully");

//     const sql = `CALL sp_cc_ood_generate_all(
//       DATE_SUB(CURDATE(), INTERVAL 1 DAY),
//       DATE_SUB(CURDATE(), INTERVAL 1 DAY)
//     )`;
//     await db.promise().query(sql);

//     console.log("✅ OOD ledger generated successfully for all LANs");

//   } catch (err) {
//     console.error("❌ Cron job failed:", err.sqlMessage || err.message);
//   }
// });


let isDpdCronRunning = false;

const tables = [
  "manual_rps_ev_loan",
  "manual_rps_wctl",
  "manual_rps_gq_non_fsf",
  "manual_rps_gq_non_fsf_fintree",
  "manual_rps_gq_fsf",
  "manual_rps_adikosh",
  "manual_rps_adikosh_fintree",
  "manual_rps_adikosh_partner",
  "manual_rps_adikosh_fintree_roi",
  "manual_rps_embifi_loan",
  "manual_rps_emiclub",
  "manual_rps_bl_loan",
  "manual_rps_circlepe",
  "manual_rps_finso_loan",
  "manual_rps_hey_ev",
  "manual_rps_gq_fsf_fintree",
  "manual_rps_helium",
  "manual_rps_hey_ev_battery",
  "manual_rps_zypay",
  "manual_rps_clayoo",
  "manual_rps_motioncorp",
  "manual_rps_sampada",
  "manual_rps_loan_digit",
  "manual_rps_circle_pe_houser",
  "manual_rps_switch_my_loan",
  "manual_rps_wctl_ffpl",
  "manual_rps_sterlion_ubl",
  "manual_rps_claim_cure_buddy",
];

const tableColumnsCache = new Map();

function safeIdentifier(value) {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }

  return `\`${value}\``;
}

async function getTableColumns(tableName) {
  if (tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName);
  }

  const [rows] = await db.promise().query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName],
  );

  const columns = new Set(
    rows.map((row) => row.COLUMN_NAME),
  );

  tableColumnsCache.set(tableName, columns);

  return columns;
}

function buildStatusUpdateQuery(tableName, columns) {
  const requiredColumns = [
    "status",
    "due_date",
    "dpd",
  ];

  const missingRequiredColumns = requiredColumns.filter(
    (column) => !columns.has(column),
  );

  if (missingRequiredColumns.length > 0) {
    return {
      skip: true,
      reason: `Missing columns: ${missingRequiredColumns.join(", ")}`,
    };
  }

  /*
   * Use all remaining fields available in the table.
   */
  const remainingColumns = [
    "remaining_amount",
    "remaining_retention",
    "remaining_principal",
    "remaining_interest",
    "remaining_emi",
  ].filter((column) => columns.has(column));

  if (remainingColumns.length === 0) {
    return {
      skip: true,
      reason: "No remaining balance column found",
    };
  }

  /*
   * At least one remaining field is available and populated.
   */
  const hasRemainingData = remainingColumns
    .map((column) => `${safeIdentifier(column)} IS NOT NULL`)
    .join(" OR ");

  /*
   * Outstanding exists when any remaining field is greater than zero.
   */
  const hasOutstanding = remainingColumns
    .map(
      (column) =>
        `COALESCE(${safeIdentifier(column)}, 0) > 0`,
    )
    .join(" OR ");

  /*
   * Fully paid only when every available remaining field
   * is zero or negative.
   */
  const fullyPaid = remainingColumns
    .map(
      (column) =>
        `COALESCE(${safeIdentifier(column)}, 0) <= 0`,
    )
    .join(" AND ");

  const partialPaymentConditions = [];

  /*
   * EMI partially paid.
   */
  if (
    columns.has("emi") &&
    columns.has("remaining_emi")
  ) {
    partialPaymentConditions.push(`
      (
        COALESCE(emi, 0) > 0
        AND COALESCE(remaining_emi, 0) > 0
        AND COALESCE(remaining_emi, 0) < COALESCE(emi, 0)
      )
    `);
  }

  /*
   * Remaining amount reduced from EMI.
   */
  if (
    columns.has("emi") &&
    columns.has("remaining_amount")
  ) {
    partialPaymentConditions.push(`
      (
        COALESCE(emi, 0) > 0
        AND COALESCE(remaining_amount, 0) > 0
        AND COALESCE(remaining_amount, 0) < COALESCE(emi, 0)
      )
    `);
  }

  /*
   * Principal partially paid.
   */
  if (
    columns.has("principal") &&
    columns.has("remaining_principal")
  ) {
    partialPaymentConditions.push(`
      (
        COALESCE(principal, 0) > 0
        AND COALESCE(remaining_principal, 0) >= 0
        AND COALESCE(remaining_principal, 0)
            < COALESCE(principal, 0)
      )
    `);
  }

  /*
   * Retention partially paid.
   *
   * Example:
   * Retention amount    = 13,524.57
   * Remaining retention = 13,087.00
   * Result              = Part Paid
   */
  if (
    columns.has("retention_amount") &&
    columns.has("remaining_retention")
  ) {
    partialPaymentConditions.push(`
      (
        COALESCE(retention_amount, 0) > 0
        AND COALESCE(remaining_retention, 0) >= 0
        AND COALESCE(remaining_retention, 0)
            < COALESCE(retention_amount, 0)
      )
    `);
  }

  /*
   * Interest partially paid.
   */
  if (
    columns.has("interest") &&
    columns.has("remaining_interest")
  ) {
    partialPaymentConditions.push(`
      (
        COALESCE(interest, 0) > 0
        AND COALESCE(remaining_interest, 0) >= 0
        AND COALESCE(remaining_interest, 0)
            < COALESCE(interest, 0)
      )
    `);
  }

  const isPartPaid =
    partialPaymentConditions.length > 0
      ? partialPaymentConditions.join(" OR ")
      : "FALSE";

  const table = safeIdentifier(tableName);

  return {
    skip: false,

    sql: `
      UPDATE ${table}
      SET
        status = CASE

          /* ==========================================
             1. PAID
             All remaining balances are cleared
             ========================================== */
          WHEN (${hasRemainingData})
           AND (${fullyPaid})
          THEN 'Paid'

          /* ==========================================
             2. NOT SET
             Due date missing or future due date
             ========================================== */
          WHEN (
                due_date IS NULL
                OR due_date > CURDATE()
               )
           AND (${hasOutstanding})
          THEN 'Not Set'

          /* ==========================================
             3. DUE
             Outstanding instalment due today
             ========================================== */
          WHEN due_date = CURDATE()
           AND (${hasOutstanding})
          THEN 'Due'

          /* ==========================================
             4. PART PAID
             Past due, partially recovered, balance remains
             ========================================== */
          WHEN due_date < CURDATE()
           AND (${hasOutstanding})
           AND (${isPartPaid})
          THEN 'Part Paid'

          /* ==========================================
             5. LATE
             Past due, balance remains, no partial payment
             ========================================== */
          WHEN due_date < CURDATE()
           AND (${hasOutstanding})
          THEN 'Late'

          /*
           * Ensure no other status is retained.
           */
          ELSE 'Not Set'

        END,

        dpd = CASE

          /*
           * Missing due date.
           */
          WHEN due_date IS NULL
          THEN 0

          /*
           * Fully paid.
           */
          WHEN (${hasRemainingData})
           AND (${fullyPaid})
          THEN 0

          /*
           * Not Set and Due must have zero DPD.
           */
          WHEN due_date >= CURDATE()
          THEN 0

          /*
           * Calculate DPD only when:
           * 1. Due date has passed
           * 2. Any remaining balance is positive
           */
          WHEN due_date < CURDATE()
           AND (${hasOutstanding})
          THEN DATEDIFF(CURDATE(), due_date)

          ELSE 0

        END
    `,
  };
}

// 1️⃣ DPD + OOD Cron
cron.schedule(
  "*/2 * * * *",
  async () => {
    if (isDpdCronRunning) {
      console.log(
        "⏭️ Previous DPD cron is still running. Skipping this execution.",
      );
      return;
    }

    isDpdCronRunning = true;

    console.log(
      "⏰ Running DPD and status update every 2 minutes...",
    );

    let successfulTables = 0;
    let skippedTables = 0;
    let failedTables = 0;

    try {
      /*
       * Ensure CURDATE() follows India time.
       */
      await db.promise().query(
        "SET time_zone = '+05:30'",
      );

      for (const table of tables) {
        try {
          const columns = await getTableColumns(table);

          if (columns.size === 0) {
            skippedTables += 1;

            console.warn(
              `⚠️ ${table}: table does not exist`,
            );

            continue;
          }

          const queryData = buildStatusUpdateQuery(
            table,
            columns,
          );

          if (queryData.skip) {
            skippedTables += 1;

            console.warn(
              `⚠️ ${table}: ${queryData.reason}`,
            );

            continue;
          }

          const [result] = await db
            .promise()
            .query(queryData.sql);

          successfulTables += 1;

          console.log(
            `✅ ${table}: affected=${result.affectedRows}, changed=${result.changedRows}`,
          );
        } catch (tableError) {
          failedTables += 1;

          console.error(
            `❌ ${table}:`,
            tableError.sqlMessage ||
              tableError.message,
          );
        }
      }

      console.log(
        `✅ Status/DPD update completed. Success=${successfulTables}, Skipped=${skippedTables}, Failed=${failedTables}`,
      );

      /*
       * Existing OOD procedure.
       *
       * This will execute every two minutes because it is
       * inside this cron.
       */
      const sql = `
        CALL sp_cc_ood_generate_all(
          DATE_SUB(CURDATE(), INTERVAL 1 DAY),
          DATE_SUB(CURDATE(), INTERVAL 1 DAY)
        )
      `;

      await db.promise().query(sql);

      console.log(
        "✅ OOD ledger generated successfully for all LANs",
      );
    } catch (error) {
      console.error(
        "❌ DPD/OOD cron failed:",
        error.sqlMessage || error.message,
      );
    } finally {
      isDpdCronRunning = false;
    }
  },
  {
    timezone: "Asia/Kolkata",
  },
);


// 2️⃣ PDF generator cron
cron.schedule("*/2 * * * *", async () => {
  console.log("🧾 Running CIBIL PDF generator (every 2 min)...");
  try {
    const results = await generateAllPending(150);
    const ok = results.filter(r => r.ok).length;
    const fail = results.length - ok;
    console.log(`✅ PDF job finished | processed: ${results.length}, success: ${ok}, failed: ${fail}`);
    results.filter(r => !r.ok).forEach(r => console.error(`  ↳ id=${r.id} error=${r.error}`));
  } catch (e) {
    console.error("❌ PDF cron failed:", e.message);
  }
});

// 3️⃣ Risk & Bucket cron
cron.schedule("*/2 * * * *", async () => {
  try {
    const sql = `CALL update_risk_and_bucket()`;
    await db.promise().query(sql);
    console.log("✅ Risk done");
  } catch (e) {
    console.error("❌ Risk cron failed:", e.message);
  }
});

// 4️⃣ WhatsApp Due Date Reminder Cron
// Runs every day at 9:00 AM server time
// cron.schedule(
//   "0 9 * * *",
//   async () => {
//     console.log("📱 Running WhatsApp Due Date Reminder Service...");
//     try {
//       const { triggerReminderService } = require("../services/WhatsAppDueDateReminderService");

//       const result = await triggerReminderService();

//       if (result.success) {
//         console.log("✅ WhatsApp reminder job completed:", result);
//       } else {
//         console.error("❌ WhatsApp reminder job failed:", result.message);
//       }
//     } catch (e) {
//       console.error("❌ WhatsApp reminder cron failed:", e.message);
//     }
//   },
//   {
//     timezone: "Asia/Kolkata",
//   }
// );



///////////////////// EMI CLUB CRON JOB /////////////////////
// cron.schedule("*/2 * * * *", async () => {
//   console.log("⏰ Document validation cron started");

//   try {
//     const checkMissingDocsQuery = `
//       SELECT lb.lan
//       FROM loan_booking_emiclub lb
//       WHERE lb.status = 'Login'
//       AND lb.login_at <= NOW() - INTERVAL 5 MINUTE
//       AND EXISTS (
//           SELECT 1
//           FROM (
//               SELECT 'KYC' AS doc_name UNION ALL
//               SELECT 'PAN_CARD' UNION ALL
//               SELECT 'OFFLINE_VERIFICATION_OF_AADHAAR' UNION ALL
//               SELECT 'PROFILE_IMAGE' UNION ALL
//               SELECT 'INVOICE' UNION ALL
//               SELECT 'AGREEMENT' UNION ALL
//               SELECT 'KFS_DOCUMENT' UNION ALL
//               SELECT 'AUDIT_REPORT' UNION ALL
//               SELECT 'PAN_VERIFICATION_AUDIT_TRAIL' UNION ALL
//               SELECT 'CIBIL_REPORT'
//           ) required_docs
//           WHERE NOT EXISTS (
//               SELECT 1
//               FROM loan_documents ld
//               WHERE ld.lan = lb.lan
//               AND ld.doc_name = required_docs.doc_name
//           )
//       );
//     `;

//     const [rows] = await db.promise().query(checkMissingDocsQuery);

//     if (rows.length === 0) {
//       console.log("✅ No LANs eligible for rejection");
//       return;
//     }

//     console.log(`⚠️ ${rows.length} LAN(s) eligible for rejection`);

//     for (const { lan } of rows) {
//       try {
//         // Reject only once
//         const updateQuery = `
//           UPDATE loan_booking_emiclub
//           SET status = 'Rejected'
//           WHERE lan = ?
//           AND status = 'Login'
//         `;

//         const [result] = await db.promise().query(updateQuery, [lan]);

//         if (result.affectedRows === 0) {
//           console.log(`ℹ️ LAN ${lan} already processed`);
//           continue;
//         }

//         console.log(`❌ LAN ${lan} rejected`);

//         // Send webhook only for rejection
//         await sendLoanWebhook({
//           external_ref_no: lan,
//           utr: null,
//           disbursement_date: null,
//           reference_number: lan,
//           status: "REJECTED",
//           reject_reason: "Required KYC documents not uploaded within 5 minutes",
//         });

//         console.log(`📡 Rejection webhook sent for LAN ${lan}`);
//       } catch (lanErr) {
//         console.error(`❌ LAN ${lan} error:`, lanErr.message);
//       }
//     }
//   } catch (e) {
//     console.error("❌ Document validation cron failed:", e.message);
//   }
// });



// 4️⃣ NEW: Allocation bank_date update cron (every 2 minutes)
// 4️⃣ NEW: Allocation bank_date update cron (every 2 minutes)
cron.schedule("*/2 * * * *", async () => {
  console.log("🏦 Running Allocation bank_date update...");
  try {
    const sqlAllocation = `
      UPDATE allocation a
      JOIN repayments_upload ru 
        ON a.payment_id = ru.payment_id 
       AND a.lan = ru.lan
      SET a.bank_date_allocation = ru.bank_date
      WHERE ru.bank_date IS NOT NULL
    `;

    const sqlAllocationAdikosh = `
      UPDATE allocation_adikosh a
      JOIN repayments_upload_adikosh ru 
        ON a.payment_id = ru.payment_id 
       AND a.lan = ru.lan
      SET a.bank_date_allocation = ru.bank_date
      WHERE ru.bank_date IS NOT NULL
    `;

    /* 🔵 allocation_fintree_fsf → only LAN starting with 'GQFSF' */
    const sqlAllocationFintreeFSF = `
      UPDATE allocation_fintree_fsf a
      JOIN repayments_upload ru 
        ON a.payment_id = ru.payment_id 
       AND a.lan = ru.lan
      SET a.bank_date_allocation = ru.bank_date
      WHERE ru.bank_date IS NOT NULL
        AND ru.lan LIKE 'GQFSF%'
    `;

    /* 🟢 allocation_fintree → only LAN starting with 'GQNonFSF' */
    const sqlAllocationFintree = `
      UPDATE allocation_fintree a
      JOIN repayments_upload ru 
        ON a.payment_id = ru.payment_id 
       AND a.lan = ru.lan
      SET a.bank_date_allocation = ru.bank_date
      WHERE ru.bank_date IS NOT NULL
        AND ru.lan LIKE 'GQNonFSF%'
    `;

    await db.promise().query(sqlAllocation);
    await db.promise().query(sqlAllocationAdikosh);
    await db.promise().query(sqlAllocationFintreeFSF);
    await db.promise().query(sqlAllocationFintree);

    console.log("✅ allocation, adikosh, fintree_fsf, fintree bank_date_allocation updated");
  } catch (err) {
    console.error("❌ Allocation cron failed:", err.sqlMessage || err.message);
  }
});

/////////////////   RAPID MONEY WEBHOOK CALL FOR INACTIVE CASES ////////

/**
 * Loan Rejection Webhook
 * Existing function - NO CHANGES
 */
async function sendRejectionWebhook({ applicationId }) {
  if (!applicationId) {
    throw new Error("applicationId is required");
  }

  const [[loan]] = await db.promise().query(
    `
      SELECT lan
      FROM loan_booking_switch_my_loan
      WHERE application_id = ?
      LIMIT 1
    `,
    [applicationId],
  );

  const webhookUrl =
    `${BASE_URL}/api-api/v1/webhooks/fintree/` + "loan-rejected";

  const requestBody = {
    payload: {
      status: "Rejected",
      lead_id: applicationId,
    },
  };

  const log = await createWebhookLog({
    webhookType: "REJECTION",
    applicationId,
    lan: loan?.lan || null,
    webhookUrl,
    requestBody,
  });

  return sendWebhookLog(log.id);
}


/**
 * Reject loans inactive for more than 30 days.
 *
 * Excluded statuses:
 * - DISBURSED
 * - Fully Paid
 * - REJECTED
 *
 * Updates:
 * - status = REJECTED
 * - sml_bre_status = INACTIVITY
 */
async function rejectInactiveLoans() {
  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    /**
     * First fetch the loans.
     *
     * Important:
     * updated_at has ON UPDATE CURRENT_TIMESTAMP,
     * so we need application_id before updating the records.
     */
    const [loans] = await connection.query(`
      SELECT
        id,
        lan,
        application_id,
        status,
        sml_bre_status,
        updated_at
      FROM loan_booking_switch_my_loan
      WHERE updated_at < NOW() - INTERVAL 30 DAY
        AND (
          status IS NULL
          OR status NOT IN (
            'DISBURSED',
            'DISBURSE_INITIATED',
            'Fully Paid',
            'REJECTED'
          )
        )
      FOR UPDATE
    `);

    if (loans.length === 0) {
      await connection.commit();

      return {
        updated: 0,
        loans: [],
      };
    }

    const ids = loans.map((loan) => loan.id);

    /**
     * Update all selected inactive loans.
     */
    const [updateResult] = await connection.query(
      `
        UPDATE loan_booking_switch_my_loan
        SET
          status = 'REJECTED',
          sml_bre_status = 'INACTIVITY'
        WHERE id IN (?)
      `,
      [ids],
    );

    await connection.commit();

    return {
      updated: updateResult.affectedRows,
      loans,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


/**
 * Inactive Loan Rejection Cron
 *
 * Runs every day at 11:40 AM IST.
 */
cron.schedule(
  "40 11 * * *",
  async () => {
    console.log(
      "🚫 Running inactive loan rejection cron...",
    );

    try {
      /**
       * 1. Find loans inactive for > 30 days
       * 2. Update status = REJECTED
       * 3. Update sml_bre_status = INACTIVITY
       */
      const result = await rejectInactiveLoans();

      if (result.loans.length === 0) {
        console.log(
          "ℹ️ No applications inactive for more than 30 days found.",
        );
        return;
      }

      console.log(
        `✅ Inactive applications updated | count: ${result.updated}`,
      );

      let webhookSuccess = 0;
      let webhookFailed = 0;
      let webhookSkipped = 0;

      /**
       * Call rejection webhook for every updated loan.
       */
      for (const loan of result.loans) {
        /**
         * Webhook requires application_id.
         */
        if (!loan.application_id) {
          webhookSkipped++;

          console.error(
            `⚠️ Rejection webhook skipped | ` +
            `id=${loan.id} | ` +
            `lan=${loan.lan || "NULL"} | ` +
            `application_id missing`,
          );

          continue;
        }

        try {
          /**
           * Existing webhook function.
           * Do not pass LAN because the function itself
           * gets LAN using application_id.
           */
          await sendRejectionWebhook({
            applicationId: loan.application_id,
          });

          webhookSuccess++;

          console.log(
            `✅ Rejection webhook sent | ` +
            `id=${loan.id} | ` +
            `lan=${loan.lan || "NULL"} | ` +
            `applicationId=${loan.application_id}`,
          );
        } catch (webhookError) {
          webhookFailed++;

          /**
           * One webhook failure will NOT stop
           * webhooks for the remaining loans.
           */
          console.error(
            `❌ Rejection webhook failed | ` +
            `id=${loan.id} | ` +
            `lan=${loan.lan || "NULL"} | ` +
            `applicationId=${loan.application_id} | ` +
            `error=${webhookError.message}`,
          );
        }
      }

      console.log(
        `✅ Inactive loan rejection cron finished | ` +
        `updated=${result.updated} | ` +
        `webhook_success=${webhookSuccess} | ` +
        `webhook_failed=${webhookFailed} | ` +
        `webhook_skipped=${webhookSkipped}`,
      );
    } catch (error) {
      console.error(
        "❌ Inactive loan rejection cron failed:",
        error.message,
      );
    }
  },
  {
    timezone: "Asia/Kolkata",
  },
);






// 5️⃣ WCTL CCOD Interest Accrual Cron

cron.schedule("*/2 * * * *", () => {
  runDailyInterestAccrual();
});

// startAadhaarCron();


////// SUPPLY CHAIN DEMAND CRON - every day at 00:05 
cron.schedule("5 0 * * *", async () => {
  // Runs daily at 00:05
  const today = new Date().toISOString().split("T")[0];
  console.log("🕒 Daily supply chain demand cron running for:", today);

  const [invoices] = await db.promise().query(
    `SELECT
       partner_loan_id,
       lan,
       invoice_number,
       invoice_due_date,
       roi_percentage,
       penal_rate,
       disbursement_amount,
       disbursement_date
     FROM invoice_disbursements
     WHERE status = 'Active'`
  );

  for (const inv of invoices) {
    try {
      await generateDailySupplyChainDemandOneRow(db.promise(), inv, today);
    } catch (e) {
      console.error(`❌ Demand insert failed for ${inv.invoice_number}:`, e.message);
    }
  }

  console.log("✅ Daily supply chain demand cron completed");
});

// ============================================================
// Bureau FAILED Retry Cron
// Runs every 1 minutes
// ============================================================
// let isBureauRetryRunning = false;

// cron.schedule(
//   "* * * * *",
//   async () => {
//     if (isBureauRetryRunning) {
//       console.log(
//         "⏭️ [BUREAU-RETRY] Previous retry still running. Skipping."
//       );
//       return;
//     }

//     isBureauRetryRunning = true;

//     console.log(
//       "🔄 [BUREAU-RETRY] Automatic FAILED bureau retry started"
//     );

//     try {
//       for (const partnerKey of Object.keys(PARTNERS)) {
//         try {
//           const result = await retriggerFailedBureauBatch(
//             partnerKey,
//             10
//           );

//           console.log(
//             `✅ [BUREAU-RETRY] ${partnerKey}`,
//             {
//               selected: result.selected,
//               processed: result.processed,
//               successful: result.successful,
//               failed: result.failed,
//               skipped: result.skipped,
//             }
//           );

//           if (result.failed > 0) {
//             console.log(
//               `⚠️ [BUREAU-RETRY] ${partnerKey} failed cases:`,
//               result.results
//                 .filter(
//                   (r) =>
//                     !r.success &&
//                     !r.skipped
//                 )
//                 .map((r) => ({
//                   lan: r.lan,
//                   reason: r.reason,
//                 }))
//             );
//           }
//         } catch (err) {
//           console.error(
//             `❌ [BUREAU-RETRY] ${partnerKey}:`,
//             err.message
//           );
//         }
//       }
//     } catch (err) {
//       console.error(
//         "❌ [BUREAU-RETRY] Cron failed:",
//         err.message
//       );
//     } finally {
//       isBureauRetryRunning = false;
//     }
//   },
//   {
//     timezone: "Asia/Kolkata",
//   }
// );
