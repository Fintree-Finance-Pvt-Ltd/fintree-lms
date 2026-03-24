/**
 * WhatsAppDueDateReminderService
 *
 * Automated service to send WhatsApp reminders to customers whose EMI due_date has passed
 * but payment has NOT been made yet.
 *
 * Trigger conditions:
 * - Send reminder when: due_date < TODAY AND payment_date IS NULL
 * - Do NOT send reminder when: payment_date IS NOT NULL
 *
 * IMPORTANT: Does NOT rely on status column.
 */

const axios = require("axios");
const db = require("../config/db");

// RapBooster API Configuration
const {
  RAPBOOSTER_AUTH_KEY,
  RAPBOOSTER_CHANNEL_ID,
  RAPBOOSTER_API_URL = "https://app.rapbooster.com/api/send/msg",
} = process.env;

// Configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

// List of manual_rps_* tables to scan
const RPS_TABLES = [
  "manual_rps_adikosh",
  "manual_rps_bl_loan",
  "manual_rps_circlepe",
  "manual_rps_ev_loan",
  "manual_rps_finso_loan",
  "manual_rps_gq_non_fsf",
  "manual_rps_helium",
  "manual_rps_wctl",
  "manual_rps_embifi_loan",
  "manual_rps_emiclub",
  "manual_rps_gq_fsf",
  "manual_rps_hey_ev",
];

// LAN prefix to loan booking table mapping
const LAN_TABLE_MAP = {
  WCTL: "loan_bookings_wctl",
  BL: "loan_bookings",
  EV: "loan_booking_ev",
  ADK: "loan_booking_adikosh",
  ADKF: "loan_booking_adikosh",
  GQFSF: "loan_booking_gq_fsf",
  GQNSF: "loan_booking_gq_non_fsf",
  EMB: "loan_booking_embifi",
  FINE: "loan_booking_emiclub",
  CLAY: "loan_booking_clayyo",
  HEY: "loan_booking_hey_ev",
  CIRCLE: "loan_booking_circle_pe",
  HELIUM: "loan_booking_helium",
  FINSO: "loan_booking_finso",
};

/**
 * Get the loan booking table name based on LAN prefix
 */
function getLoanTableByLAN(lan) {
  if (!lan) return "loan_bookings";

  const prefix = lan.match(/^[A-Z]+/)?.[0] || "";

  // Check for specific prefixes
  if (prefix.startsWith("WCTL")) return "loan_bookings_wctl";
  if (prefix.startsWith("BL")) return "loan_bookings";
  if (prefix.startsWith("EV")) return "loan_booking_ev";
  if (prefix.startsWith("ADK")) return "loan_booking_adikosh";
  if (prefix.startsWith("GQFSF")) return "loan_booking_gq_fsf";
  if (prefix.startsWith("GQN") || prefix.startsWith("GQNF"))
    return "loan_booking_gq_non_fsf";
  if (prefix.startsWith("EMB")) return "loan_booking_embifi";
  if (prefix.startsWith("FINE") || prefix.startsWith("EMIC"))
    return "loan_booking_emiclub";
  if (prefix.startsWith("CLAY")) return "loan_booking_clayyo";
  if (prefix.startsWith("HEY")) return "loan_booking_hey_ev";
  if (prefix.startsWith("CIRC")) return "loan_booking_circle_pe";
  if (prefix.startsWith("HEL")) return "loan_booking_helium";
  //   if (prefix.startsWith("ZYP")) return "loan_booking_zypay_customer";
  if (prefix.startsWith("FIN")) return "loan_booking_finso";

  // Default fallback
  return "loan_bookings";
}

/**
 * Get lender name by LAN from loan booking table
 */
async function getLenderByLAN(lan) {
  const loanTable = getLoanTableByLAN(lan);
  
  try {
    // Try to get lender from loan_booking tables
    const [rows] = await db
      .promise()
      .query(
        `SELECT lender FROM \`${loanTable}\` WHERE lan = ? LIMIT 1`,
        [lan],
      );
    
    if (rows.length > 0 && rows[0].lender) {
      return rows[0].lender;
    }
    
    return "Fintree Finance Pvt Ltd"; // Default fallback
  } catch (error) {
    console.error(
      `Error fetching lender for LAN ${lan} from ${loanTable}:`,
      error.message,
    );
    return "Fintree Finance Pvt Ltd"; // Default fallback
  }
}

/**
 * Get customer mobile number by LAN
 */
async function getCustomerMobileByLAN(lan) {
  const loanTable = getLoanTableByLAN(lan);

  try {
    // First try to get mobile from loan_booking tables
    const [rows] = await db
      .promise()
      .query(
        `SELECT mobile_number FROM \`${loanTable}\` WHERE lan = ? LIMIT 1`,
        [lan],
      );

    if (rows.length > 0 && rows[0].mobile_number) {
      return rows[0].mobile_number;
    }

    // Try with customer table as fallback
    const [customerRows] = await db
      .promise()
      .query(
        `SELECT mobile_number FROM customer WHERE lan = ? OR partner_loan_id = ? LIMIT 1`,
        [lan, lan],
      );

    if (customerRows.length > 0 && customerRows[0].mobile_number) {
      return customerRows[0].mobile_number;
    }

    return null;
  } catch (error) {
    console.error(
      `Error fetching mobile for LAN ${lan} from ${loanTable}:`,
      error.message,
    );
    return null;
  }
}

/**
 * Clean and format mobile number for WhatsApp
 */
function cleanMobileNumber(mobile) {
  if (!mobile) return null;

  // Remove all non-digit characters
  const digits = String(mobile).replace(/\D/g, "");

  // If it's 10 digits, add 91 (India)
  if (digits.length === 10) {
    return "91" + digits;
  }

  // If it already starts with 91 and is 12 digits
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }

  // If it's already in international format
  if (digits.length > 10) {
    return digits;
  }

  return null;
}

/**
 * Format date for display in message
 */
function formatDateForMessage(date) {
  if (!date) return "";

  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][d.getMonth()];
  const year = d.getFullYear();

  return `${day}-${month}-${year}`;
}

/**
 * Generate reminder message based on EMI details
 * @param {Object} emiRecord - EMI record with lan, emi, dpd, due_date
 * @param {string} lender - Lender name from loan_booking table
 */
function generateReminderMessage(emiRecord, lender = "Fintree Finance Pvt Ltd") {
  const { lan, emi, dpd, due_date } = emiRecord;
  const formattedDueDate = formatDateForMessage(due_date);

  if (dpd && parseInt(dpd) > 0) {
    // Overdue message with DPD
    return `Dear Customer, Your EMI of ₹${emi} for ${lender} is overdue by ${dpd} days. Kindly clear your dues urgently. - Fintree Finance Pvt Ltd`;
  } else {
    // Due but not yet overdue
    return `Dear Customer, Your EMI of ₹${emi} for ${lender} was due on ${formattedDueDate}. Please make the payment immediately to avoid penalties. - Fintree Finance Pvt Ltd`;
  }
}

/**
 * Send WhatsApp message via RapBooster API
 */
async function sendWhatsAppMessage(mobile, message, retryCount = 0) {
  const cleanedMobile = cleanMobileNumber(mobile);
  console.log("Cleaned mobile number:", cleanedMobile);
  if (!cleanedMobile) {
    throw new Error("Invalid mobile number");
  }
  const formData = new URLSearchParams();
  formData.append("channelId", RAPBOOSTER_CHANNEL_ID);
  formData.append("mobile", cleanedMobile);
  formData.append("msg", message);
   if (!RAPBOOSTER_AUTH_KEY || !RAPBOOSTER_CHANNEL_ID) {
    throw new Error("RapBooster API authKey or channelId is not configured");
  }
  try {
    const response = await axios.post(
      `${RAPBOOSTER_API_URL}?authKey=${RAPBOOSTER_AUTH_KEY}`,
      formData.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 30000,
      },
    );
    console.log("successfully sent msg on whatsapp");
    return {
      success: true,
      data: response.data,
      statusCode: response.status,
    };
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;

    // Retry logic
    if (retryCount < MAX_RETRY_ATTEMPTS - 1) {
      console.log(
        `Retrying WhatsApp send (attempt ${retryCount + 2}/${MAX_RETRY_ATTEMPTS}) for ${cleanedMobile}...`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)),
      );
      return sendWhatsAppMessage(mobile, message, retryCount + 1);
    }

    return {
      success: false,
      error: errorMessage,
      statusCode: error.response?.status,
    };
  }
}

/**
 * Check if a reminder was already sent today for this LAN/table combination
 */
async function checkDuplicateReminder(lan, tableName, dueDate) {
  const today = new Date().toISOString().split("T")[0];

  try {
    const [rows] = await db.promise().query(
      `SELECT id FROM whatsapp_logs 
       WHERE lan = ? AND source_table = ? AND DATE(sent_at) = ? 
       LIMIT 1`,
      [lan, tableName, today],
    );

    return rows.length > 0;
  } catch (error) {
    console.error("Error checking duplicate:", error.message);
    return false; // If error, allow sending
  }
}

/**
 * Log WhatsApp message to database
 */
async function logWhatsAppMessage(
  lan,
  tableName,
  mobile,
  message,
  apiResponse,
  status,
) {
  try {
    await db.promise().query(
      `INSERT INTO whatsapp_logs (lan, source_table, mobile_number, message, api_response, status, sent_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [lan, tableName, mobile, message, JSON.stringify(apiResponse), status],
    );
  } catch (error) {
    console.error("Error logging WhatsApp message:", error.message);
  }
}

/**
 * Fetch overdue EMIs from a specific table
 */
async function fetchOverdueEMIs(tableName) {
  try {
    // Check if table exists
    const [tableCheck] = await db
      .promise()
      .query(`SHOW TABLES LIKE ?`, [tableName]);

    if (tableCheck.length === 0) {
      console.log(`Table ${tableName} does not exist, skipping...`);
      return [];
    }

    // Query for overdue EMIs: due_date < TODAY AND payment_date IS NULL
    const [rows] = await db.promise().query(
      `SELECT lan, due_date, emi, dpd, payment_date 
       FROM \`${tableName}\` 
       WHERE due_date < CURDATE() 
       AND payment_date IS NULL`,
      [],
    );

    return rows;
  } catch (error) {
    console.error(
      `Error fetching overdue EMIs from ${tableName}:`,
      error.message,
    );
    return [];
  }
}

/**
 * Process a single EMI record - send WhatsApp if eligible
 */
async function processEMIRecord(emiRecord, tableName) {
  const { lan, emi } = emiRecord;

  // Check for duplicate reminder
  const isDuplicate = await checkDuplicateReminder(
    lan,
    tableName,
    emiRecord.due_date,
  );
  if (isDuplicate) {
    console.log(`Skipping duplicate reminder for LAN ${lan} from ${tableName}`);
    return { status: "skipped", reason: "duplicate" };
  }

  // Get customer mobile number
  const mobile = await getCustomerMobileByLAN(lan);
  
  // Get lender name from loan_booking table
  const lender = await getLenderByLAN(lan);
  
  if (!mobile) {
    console.log(`No mobile number found for LAN ${lan}`);
    await logWhatsAppMessage(
      lan,
      tableName,
      null,
      generateReminderMessage(emiRecord, lender),
      { error: "Mobile not found" },
      "failed",
    );
    return { status: "skipped", reason: "no_mobile" };
  }

  // Generate message with lender name
  const message = generateReminderMessage(emiRecord, lender);

  // Send WhatsApp message
  const result = await sendWhatsAppMessage(mobile, message);

  // Log the result
  await logWhatsAppMessage(
    lan,
    tableName,
    mobile,
    message,
    result,
    result.success ? "sent" : "failed",
  );

  return {
    status: result.success ? "sent" : "failed",
    lan,
    mobile,
    result,
  };
}

/**
 * Main function to process all overdue EMIs across all tables
 */
async function processAllOverdueEMIs() {
  console.log("===========================================");
  console.log("Starting WhatsApp Due Date Reminder Service");
  console.log("Time:", new Date().toISOString());
  console.log("===========================================");

  const results = {
    tablesScanned: 0,
    totalEMIsFound: 0,
    messagesSent: 0,
    messagesFailed: 0,
    skipped: 0,
    details: [],
  };

  for (const tableName of RPS_TABLES) {
    console.log(`\nProcessing table: ${tableName}`);

    const overdueEMIs = await fetchOverdueEMIs(tableName);
    console.log("overdueEMIs",overdueEMIs)
    if (overdueEMIs.length === 0) {
      console.log(`No overdue EMIs found in ${tableName}`);
      continue;
    }

    results.tablesScanned++;
    results.totalEMIsFound += overdueEMIs.length;

    console.log(
      `Found ${overdueEMIs.length} overdue EMI records in ${tableName}`,
    );

    // Process each EMI record
    for (const emiRecord of overdueEMIs) {
      const result = await processEMIRecord(emiRecord, tableName);

      if (result.status === "sent") {
        results.messagesSent++;
      } else if (result.status === "failed") {
        results.messagesFailed++;
      } else {
        results.skipped++;
      }

      results.details.push({
        table: tableName,
        lan: emiRecord.lan,
        ...result,
      });

      // Small delay between messages to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log("\n===========================================");
  console.log("WhatsApp Reminder Service Complete");
  console.log("Tables Scanned:", results.tablesScanned);
  console.log("Total EMIs Found:", results.totalEMIsFound);
  console.log("Messages Sent:", results.messagesSent);
  console.log("Messages Failed:", results.messagesFailed);
  console.log("Skipped:", results.skipped);
  console.log("===========================================\n");

  return results;
}

/**
 * Initialize WhatsApp logs table if it doesn't exist
 */
async function initializeWhatsAppLogsTable() {
  try {
    await db.promise().query(`
      CREATE TABLE IF NOT EXISTS whatsapp_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lan VARCHAR(50) NOT NULL,
        source_table VARCHAR(100) NOT NULL,
        mobile_number VARCHAR(20),
        message TEXT NOT NULL,
        api_response TEXT,
        status ENUM('sent', 'failed', 'skipped') NOT NULL,
        sent_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_lan (lan),
        INDEX idx_source_table (source_table),
        INDEX idx_sent_at (sent_at),
        INDEX idx_lan_date (lan, sent_at)
      )
    `);
    console.log("WhatsApp logs table initialized successfully");
  } catch (error) {
    console.error("Error initializing WhatsApp logs table:", error.message);
  }
}

/**
 * Manual trigger function - can be called via API or cron
 */
async function triggerReminderService() {
  try {
    // Initialize logs table
    await initializeWhatsAppLogsTable();

    // Process all overdue EMIs
    const results = await processAllOverdueEMIs();

    return {
      success: true,
      message: "WhatsApp reminder service completed",
      ...results,
    };
  } catch (error) {
    console.error("Error in WhatsApp reminder service:", error);
    return {
      success: false,
      message: error.message,
    };
  }
}

/**
 * Get WhatsApp logs (for debugging/tracking)
 */
async function getWhatsAppLogs(options = {}) {
  const { limit = 50, offset = 0, lan, status, date } = options;

  let query = "SELECT * FROM whatsapp_logs WHERE 1=1";
  const params = [];

  if (lan) {
    query += " AND lan = ?";
    params.push(lan);
  }

  if (status) {
    query += " AND status = ?";
    params.push(status);
  }

  if (date) {
    query += " AND DATE(sent_at) = ?";
    params.push(date);
  }

  query += " ORDER BY sent_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  try {
    const [rows] = await db.promise().query(query, params);
    return rows;
  } catch (error) {
    console.error("Error fetching WhatsApp logs:", error.message);
    return [];
  }
}

module.exports = {
  triggerReminderService,
  processAllOverdueEMIs,
  initializeWhatsAppLogsTable,
  getWhatsAppLogs,
  sendWhatsAppMessage,
  generateReminderMessage,
  cleanMobileNumber,
  RPS_TABLES,
};
