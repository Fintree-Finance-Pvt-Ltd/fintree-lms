// One-off backfill for the aadhaarPdfGenerator.js "Invalid Date" bug.
//
// The old formatTimestamp() did `new Date(Number(ts))`, which produced
// "Invalid Date" whenever the source Aadhaar XML/JSON's timestamp was an
// ISO 8601 string (e.g. "2026-07-11T16:34:45.376+05:30") rather than a raw
// numeric epoch. Already-generated PDFs baked that wrong string in — this
// script re-reads each PDF's original source file, detects whether the old
// buggy logic would have mangled its timestamp, and if so regenerates the
// PDF in place with the fixed createAadhaarPDF().
//
// Two modes, run separately on purpose: "scan" only counts how many rows
// are actually affected (cheap: just parses the small source file, no PDF
// generation) so you know the real scope before committing to the
// expensive "fix" pass that rewrites files.
//
// Usage (run ON the production VPS, from Backend/):
//   node scripts/backfillAadhaarPdfTimestamp.js scan
//   node scripts/backfillAadhaarPdfTimestamp.js fix
//
// Both modes are resumable — progress is appended to
// scripts/aadhaar_pdf_backfill_progress.<mode>.jsonl, and a rerun skips
// any row id already recorded there. Delete that file to start over.
//
// Optional: BACKFILL_CONCURRENCY=<n> env var (default 8) controls how many
// rows are processed in parallel — keep this modest on a shared VPS.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const xml2js = require("xml2js");
const axios = require("axios");
const db = require("../config/db");
const { createAadhaarPDF } = require("../jobs/aadhaarPdfGenerator");

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
// Defaults are deliberately conservative — this runs on the same VPS as
// live traffic. Raise BACKFILL_CONCURRENCY/lower BACKFILL_DELAY_MS only if
// you've watched `pm2 monit` / `top` during a run and confirmed it's calm.
const CONCURRENCY = Number(process.env.BACKFILL_CONCURRENCY || 2);
const DELAY_MS = Number(process.env.BACKFILL_DELAY_MS || 200);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function progressFilePath(mode) {
  return path.join(__dirname, `aadhaar_pdf_backfill_progress.${mode}.jsonl`);
}

function loadDoneIds(mode) {
  const file = progressFilePath(mode);
  if (!fs.existsSync(file)) return new Set();
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const ids = new Set();
  for (const line of lines) {
    try {
      ids.add(JSON.parse(line).id);
    } catch {
      // ignore a torn last line from a previous interrupted run
    }
  }
  return ids;
}

function appendProgress(mode, entry) {
  fs.appendFileSync(progressFilePath(mode), JSON.stringify(entry) + "\n");
}

// Mirrors the OLD, buggy formatTimestamp()'s check — this is deliberately
// the broken logic, used only to detect which rows it broke.
function oldLogicWouldBreak(ts) {
  if (!ts) return false;
  return isNaN(Number(ts));
}

function extractTs(parsed) {
  if (parsed?.Certificate?.CertificateData?.KycRes) {
    return parsed.Certificate.CertificateData.KycRes.$?.ts;
  }
  return parsed?.["Digilocker_Aadhaar_Card:_TimeStamp"];
}

async function parseSourceBuffer(buffer) {
  const text = buffer.toString("utf8").trim();
  if (text.startsWith("{")) {
    return JSON.parse(text);
  }
  return xml2js.parseStringPromise(buffer.toString("utf8"), {
    explicitArray: false,
    trim: true,
  });
}

// Priority 1: local uploads/ file (same as the live cron). Priority 2:
// re-download from the source row's source_url and cache it locally.
async function loadSourceBuffer(sourceFileName, lan) {
  const localPath = path.join(UPLOADS_DIR, sourceFileName);
  if (fs.existsSync(localPath)) {
    return fs.readFileSync(localPath);
  }

  const [rows] = await db.promise().query(
    `SELECT source_url FROM loan_documents
     WHERE lan = ? AND file_name = ?
       AND doc_name IN ('OFFLINE_VERIFICATION_OF_AADHAAR','AADHAAR_XML_DIGILOCKER')
     LIMIT 1`,
    [lan, sourceFileName],
  );

  const sourceUrl = rows[0]?.source_url;
  if (!sourceUrl) return null;

  const response = await axios.get(sourceUrl, {
    responseType: "arraybuffer",
    timeout: 20000,
  });

  fs.writeFileSync(localPath, response.data);
  return response.data;
}

async function processRow(row, mode, counters) {
  try {
    const meta = JSON.parse(row.meta_json || "{}");
    const sourceFileName = meta.source_file;

    if (!sourceFileName) {
      appendProgress(mode, { id: row.id, status: "no_source_file" });
      counters.noSource++;
      return;
    }

    const buffer = await loadSourceBuffer(sourceFileName, row.lan);
    if (!buffer) {
      appendProgress(mode, { id: row.id, status: "source_missing", sourceFileName });
      counters.missing++;
      return;
    }

    const parsed = await parseSourceBuffer(buffer);
    const ts = extractTs(parsed);
    const affected = oldLogicWouldBreak(ts);

    if (!affected) {
      appendProgress(mode, { id: row.id, status: "ok" });
      counters.ok++;
      return;
    }

    counters.affected++;

    if (mode === "scan") {
      appendProgress(mode, { id: row.id, status: "affected", ts, file_name: row.file_name });
      return;
    }

    const pdfPath = path.join(UPLOADS_DIR, row.file_name);
    await createAadhaarPDF(parsed, pdfPath);
    appendProgress(mode, { id: row.id, status: "fixed" });
    counters.fixed++;
  } catch (err) {
    appendProgress(mode, { id: row.id, status: "error", error: err.message });
    counters.errors++;
  }
}

async function runPool(items, worker, concurrency, delayMs) {
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      await worker(items[i]);
      // Deliberate throttle so this doesn't compete with live traffic for
      // CPU/disk on the same box — see BACKFILL_DELAY_MS above.
      if (delayMs > 0) await sleep(delayMs);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
}

async function main() {
  const mode = process.argv[2];
  if (!["scan", "fix"].includes(mode)) {
    console.error("Usage: node scripts/backfillAadhaarPdfTimestamp.js <scan|fix>");
    process.exit(1);
  }

  const done = loadDoneIds(mode);
  console.log(`[${mode}] ${done.size} rows already processed in a previous run of this mode.`);

  const [rows] = await db.promise().query(
    `SELECT id, lan, file_name, meta_json FROM loan_documents WHERE doc_name = 'AADHAAR_PDF' ORDER BY id ASC`,
  );

  const todo = rows.filter((r) => !done.has(r.id));
  console.log(`[${mode}] ${todo.length} rows to process out of ${rows.length} total AADHAAR_PDF rows.`);

  const counters = { ok: 0, affected: 0, fixed: 0, missing: 0, noSource: 0, errors: 0 };
  let processed = 0;

  await runPool(
    todo,
    async (row) => {
      await processRow(row, mode, counters);
      processed++;
      if (processed % 500 === 0) {
        console.log(`[${mode}] Progress: ${processed}/${todo.length}`, counters);
      }
    },
    CONCURRENCY,
    DELAY_MS,
  );

  console.log(`[${mode}] DONE.`, counters);
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
