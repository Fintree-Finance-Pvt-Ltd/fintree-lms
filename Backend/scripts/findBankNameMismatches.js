// scripts/findBankNameMismatches.js
//
// Standalone, READ-ONLY script. It is NOT wired into server.js or any route
// — it never runs as part of the live app, only when you run it by hand.
//
// Scans loan_booking_switch_my_loan in small batches, using its own single
// dedicated connection (not the app's shared pool in config/db.js), and
// throttles between batches — so this never competes with production
// traffic for DB connections or adds sustained load while it runs against
// ~60k rows.
//
// It flags every row where customer_name does not match the bank account
// name, using the EXACT same bankNamesMatch() logic (copied verbatim) that
// PUT /v1/update-details enforces in
// routes/switchMyLoan/switchMyLoanRotues.js — so results here are
// consistent with what the live app actually accepts/rejects.
//
// The bank name compared against is Digio's confirmed
// beneficiary_name_with_bank (from bank_verification_response) when
// available, since that's the strongest signal (the bank's own record of
// the account holder's name); it falls back to the submitted bank_ac_name
// for rows that were never verified. The "source" column in the output
// tells you which one was used for each row.
//
// Usage:
//   node scripts/findBankNameMismatches.js
//
// Output:
//   scripts/bank_name_mismatches_<timestamp>.csv

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2");

// ============================================================
// Dedicated single connection — deliberately separate from the
// app's pool (config/db.js) and deliberately concurrency = 1.
// ============================================================

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl:
    String(process.env.DB_SSL || "").toLowerCase() === "true"
      ? { rejectUnauthorized: false }
      : undefined,
});

const query = (sql, params) =>
  new Promise((resolve, reject) => {
    connection.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

// ============================================================
// getBankNameParts / bankNameTokenMatches / bankNameSequenceMatches /
// compoundBankNameInitialMatch / extraBankSurnameMatch /
// omittedBankMiddleNameMatch / bankNamesMatch
//
// Copied verbatim from routes/switchMyLoan/switchMyLoanRotues.js
// (the active copy used by PUT /v1/update-details). Keep these in
// sync if that file's matching logic ever changes.
// ============================================================

function getBankNameParts(value) {
  const ignoredWords = new Set([
    "mr",
    "mrs",
    "ms",
    "miss",
    "master",
    "shri",
    "smt",
    "dr",
  ]);

  let name = String(value || "")
    .trim()
    .toLowerCase();

  /*
   * Remove relationship text.
   *
   * Example:
   *
   * RAMBHAJAN SAINI S/O BADRI NARAYAN SAINI
   *
   * becomes:
   *
   * RAMBHAJAN SAINI
   */
  name = name.replace(
    /\b(?:s\/o|d\/o|w\/o|c\/o|son\s+of|daughter\s+of|wife\s+of|care\s+of)\b.*$/i,
    "",
  );

  return name
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !ignoredWords.has(part));
}

// ============================================================
// TOKEN MATCH
// ============================================================

function bankNameTokenMatches(a, b) {
  if (!a || !b) {
    return false;
  }

  // Exact word match
  if (a === b) {
    return true;
  }

  /*
   * Initial matching
   *
   * S ↔ SANTOSH
   * C ↔ CHANDRANNA
   * A ↔ ADESH
   */

  if (a.length === 1 && b.startsWith(a)) {
    return true;
  }

  if (b.length === 1 && a.startsWith(b)) {
    return true;
  }

  return false;
}

// ============================================================
// SEQUENCE MATCH
// ============================================================

function bankNameSequenceMatches(
  customerParts,
  bankParts,
  customerIndex = 0,
  bankIndex = 0,
) {
  if (
    customerIndex === customerParts.length &&
    bankIndex === bankParts.length
  ) {
    return true;
  }

  if (
    customerIndex >= customerParts.length ||
    bankIndex >= bankParts.length
  ) {
    return false;
  }

  /*
   * Maximum 3 words can be joined.
   *
   * VEENA + RAJ
   * becomes
   * VEENARAJ
   *
   * SHIVA + SHANKAR
   * becomes
   * SHIVASHANKAR
   */

  const maxCustomerJoin = Math.min(
    3,
    customerParts.length - customerIndex,
  );

  const maxBankJoin = Math.min(3, bankParts.length - bankIndex);

  for (
    let customerCount = 1;
    customerCount <= maxCustomerJoin;
    customerCount++
  ) {
    const customerJoined = customerParts
      .slice(customerIndex, customerIndex + customerCount)
      .join("");

    for (let bankCount = 1; bankCount <= maxBankJoin; bankCount++) {
      const bankJoined = bankParts
        .slice(bankIndex, bankIndex + bankCount)
        .join("");

      let currentMatch = false;

      /*
       * Single token:
       * allow exact + initial match.
       */
      if (customerCount === 1 && bankCount === 1) {
        currentMatch = bankNameTokenMatches(customerJoined, bankJoined);
      } else {
        /*
         * Joined words:
         * require exact combined value.
         */
        currentMatch = customerJoined === bankJoined;
      }

      if (!currentMatch) {
        continue;
      }

      if (
        bankNameSequenceMatches(
          customerParts,
          bankParts,
          customerIndex + customerCount,
          bankIndex + bankCount,
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================
// COMPOUND NAME + INITIAL
// ============================================================

function compoundBankNameInitialMatch(customerParts, bankParts) {
  if (customerParts.length !== 1 || bankParts.length !== 2) {
    return false;
  }

  const compoundCustomerName = customerParts[0];

  /*
   * Check both:
   *
   * A SAJANA
   * SAJANA A
   */
  const possibleOrders = [bankParts, [...bankParts].reverse()];

  for (const parts of possibleOrders) {
    const first = parts[0];
    const second = parts[1];

    /*
     * SAJANAAYYAPPANASARI
     *
     * SAJANA + A
     */
    if (
      first.length >= 4 &&
      second.length === 1 &&
      compoundCustomerName.startsWith(`${first}${second}`)
    ) {
      return true;
    }
  }

  return false;
}

// ============================================================
// EXTRA BANK SURNAME
// ============================================================

function extraBankSurnameMatch(customerParts, bankParts) {
  if (customerParts.length < 2 || bankParts.length < 2) {
    return false;
  }

  /*
   * Allow maximum one additional
   * bank surname.
   */
  if (bankParts.length > customerParts.length + 1) {
    return false;
  }

  /*
   * Example:
   *
   * Customer:
   * RAM BHAJAN
   *
   * Bank:
   * RAMBHAJAN SAINI
   *
   * Remove SAINI and compare:
   *
   * RAM BHAJAN
   * RAMBHAJAN
   */
  const bankWithoutLast = bankParts.slice(0, -1);

  return bankNameSequenceMatches(customerParts, bankWithoutLast);
}

// ============================================================
// OMITTED MIDDLE NAME
// ============================================================

function omittedBankMiddleNameMatch(customerParts, bankParts) {
  if (customerParts.length < 2 || bankParts.length < 2) {
    return false;
  }

  /*
   * At least one side should contain
   * first + last only.
   */
  if (customerParts.length !== 2 && bankParts.length !== 2) {
    return false;
  }

  const customerFirst = customerParts[0];
  const customerLast = customerParts[customerParts.length - 1];
  const bankFirst = bankParts[0];
  const bankLast = bankParts[bankParts.length - 1];

  return (
    bankNameTokenMatches(customerFirst, bankFirst) &&
    bankNameTokenMatches(customerLast, bankLast)
  );
}

// ============================================================
// FINAL BANK NAME MATCH FUNCTION
// ============================================================

function bankNamesMatch(customerName, accountName) {
  const customerParts = getBankNameParts(customerName);
  const bankParts = getBankNameParts(accountName);

  if (!customerParts.length || !bankParts.length) {
    return false;
  }

  // RULE 1: NORMAL ORDER
  if (bankNameSequenceMatches(customerParts, bankParts)) {
    return true;
  }

  // RULE 2: REVERSED BANK NAME
  if (
    bankNameSequenceMatches(customerParts, [...bankParts].reverse())
  ) {
    return true;
  }

  // RULE 3: OMITTED MIDDLE NAME
  if (omittedBankMiddleNameMatch(customerParts, bankParts)) {
    return true;
  }

  // RULE 4: EXTRA SURNAME IN BANK NAME
  if (extraBankSurnameMatch(customerParts, bankParts)) {
    return true;
  }

  // RULE 5: COMPOUND NAME + INITIAL
  if (compoundBankNameInitialMatch(customerParts, bankParts)) {
    return true;
  }

  return false;
}

// ============================================================
// BATCH SCAN
// ============================================================

const BATCH_SIZE = 1000;
// Throttle between batches so this read-only scan never adds sustained
// load to the production DB while it's serving live traffic.
const DELAY_MS_BETWEEN_BATCHES = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractBeneficiaryName(bankVerificationResponse) {
  if (!bankVerificationResponse) return null;

  try {
    const parsed =
      typeof bankVerificationResponse === "string"
        ? JSON.parse(bankVerificationResponse)
        : bankVerificationResponse;

    const name = parsed?.beneficiary_name_with_bank;
    return name ? String(name).trim() : null;
  } catch (parseError) {
    return null;
  }
}

async function run() {
  let lastId = 0;
  let totalScanned = 0;
  let totalMismatches = 0;
  let totalSkippedNoName = 0;
  const mismatches = [];

  console.log("Starting bank name mismatch scan (read-only)...");

  while (true) {
    // Keyset pagination (WHERE id > lastId) instead of OFFSET — stays fast
    // and consistent even as the scan progresses through ~60k rows.
    const rows = await query(
      `SELECT
         id,
         lan,
         application_id,
         partner_loan_id,
         customer_name,
         bank_ac_name,
         bank_verification_response,
         bank_verification_status,
         status
       FROM loan_booking_switch_my_loan
       WHERE id > ?
       ORDER BY id ASC
       LIMIT ?`,
      [lastId, BATCH_SIZE],
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      totalScanned++;
      lastId = row.id;

      const beneficiaryName = extractBeneficiaryName(
        row.bank_verification_response,
      );

      const bankName = beneficiaryName || row.bank_ac_name;
      const customerName = row.customer_name;

      if (!customerName || !bankName) {
        totalSkippedNoName++;
        continue;
      }

      const matched = bankNamesMatch(customerName, bankName);

      if (!matched) {
        totalMismatches++;
        mismatches.push({
          lan: row.lan,
          application_id: row.application_id,
          partner_loan_id: row.partner_loan_id,
          customer_name: customerName,
          bank_ac_name: row.bank_ac_name,
          beneficiary_name_with_bank: beneficiaryName,
          name_compared: bankName,
          source: beneficiaryName
            ? "digio_verified_name"
            : "submitted_bank_ac_name",
          bank_verification_status: row.bank_verification_status,
          loan_status: row.status,
        });
      }
    }

    console.log(
      `Scanned ${totalScanned} rows so far... (${totalMismatches} mismatches found)`,
    );

    // Batch is smaller than BATCH_SIZE only on the last page — safe to loop
    // once more regardless, the next query will just return zero rows.
    await sleep(DELAY_MS_BETWEEN_BATCHES);
  }

  // ============================================================
  // WRITE RESULTS TO CSV
  // ============================================================

  const outPath = path.join(
    __dirname,
    `bank_name_mismatches_${Date.now()}.csv`,
  );

  const headers = [
    "lan",
    "application_id",
    "partner_loan_id",
    "customer_name",
    "bank_ac_name",
    "beneficiary_name_with_bank",
    "name_compared",
    "source",
    "bank_verification_status",
    "loan_status",
  ];

  const csvEscape = (value) => {
    const str = value === null || value === undefined ? "" : String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.join(",")];
  for (const row of mismatches) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");

  console.log("");
  console.log("========================================");
  console.log(`Total rows scanned:      ${totalScanned}`);
  console.log(`Skipped (no name/bank):  ${totalSkippedNoName}`);
  console.log(`Total name mismatches:   ${totalMismatches}`);
  console.log(`Output written to:       ${outPath}`);
  console.log("========================================");

  connection.end();
}

run().catch((err) => {
  console.error("Scan failed:", err);
  connection.end();
  process.exit(1);
});
