const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { loadSampadaAgreementStatus } = require("../services/sampadaAgreementStatus");

const loan = { lan: "SPL001", agreement_esign_status: "PENDING" };
const document = { lan: loan.lan, document_id: "order-1", status: "INITIATED", created_at: "2026-09-16T10:00:00Z" };

test("refresh recovers an existing agreement from the database", async () => {
  const [row] = await loadSampadaAgreementStatus({ query: async () => [[document]] }, [loan]);
  assert.equal(row.agreement_esign_status, "INITIATED");
  assert.equal(row.agreement_esign_sent_at, document.created_at);
  assert.equal(row.agreement_esign_can_send, false);
});

test("new loans can send; active, unknown, and signed documents cannot resend", async () => {
  const [fresh] = await loadSampadaAgreementStatus({ query: async () => [[]] }, [loan]);
  assert.equal(fresh.agreement_esign_can_send, true);
  for (const status of ["PENDING", "REQUESTED", "INITIATED", "IN_PROGRESS", "SIGNED", "COMPLETED", "UNKNOWN"]) {
    const [row] = await loadSampadaAgreementStatus({ query: async () => [[{ ...document, status }]] }, [loan]);
    assert.equal(row.agreement_esign_can_send, false, status);
  }
  for (const status of ["FAILED", "ERROR", "REJECTED", "EXPIRED", "CANCELLED"]) {
    const [row] = await loadSampadaAgreementStatus({ query: async () => [[{ ...document, status }]] }, [loan]);
    assert.equal(row.agreement_esign_can_send, true, status);
  }
});

test("a signed agreement cannot be overridden by a later failed attempt", async () => {
  for (const signedLoan of [false, true]) {
    const [row] = await loadSampadaAgreementStatus({ query: async () => [[{ ...document, status: "FAILED", has_signed: signedLoan ? 0 : 1 }]] },
      [{ ...loan, agreement_esign_status: signedLoan ? "Signed" : "PENDING" }]);
    assert.equal(row.agreement_esign_status, "SIGNED");
    assert.equal(row.agreement_esign_can_send, false);
  }
});

function serviceWithMocks({ acquired = 1, documents = [document] } = {}) {
  const calls = [];
  const connection = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes("GET_LOCK")) return [[{ acquired }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("FROM loan_booking_sampada")) return [[loan]];
      if (sql.includes("FROM esign_documents ed")) return [documents];
      throw new Error(`Unexpected query: ${sql}`);
    },
    release: () => calls.push("released"),
  };
  const exports = {};
  const mocks = {
    "../config/db": { promise: () => ({ getConnection: async () => connection }) },
    "./doqfyClient": { post: () => { throw new Error("Must not send duplicate agreement"); } },
    "../utils/lanHelper": { getLoanContext: () => ({ type: "SAMPADA" }) },
    "./pdfGenerationService": {},
    "./sampadaAgreementStatus": { loadSampadaAgreementStatus },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../services/doqfyEsignService.js"), "utf8"), {
    exports, console,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (["fs", "path"].includes(name)) return require(name);
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { initiate: exports.initDoqfyEsign, calls };
}

test("duplicate send returns persisted status without contacting the provider", async () => {
  const { initiate, calls } = serviceWithMocks();
  const result = await initiate(loan.lan, "AGREEMENT");
  assert.equal(result.already_initiated, true);
  assert.equal(result.agreement_esign_status, "INITIATED");
  assert.ok(calls.some((sql) => sql.includes("RELEASE_LOCK")));
  assert.equal(calls.at(-1), "released");
});

test("a concurrent send is blocked before reading or sending the agreement", async () => {
  const { initiate, calls } = serviceWithMocks({ acquired: 0 });
  await assert.rejects(initiate(loan.lan, "AGREEMENT"), /already processing/);
  assert.equal(calls.length, 2);
  assert.equal(calls.at(-1), "released");
});
