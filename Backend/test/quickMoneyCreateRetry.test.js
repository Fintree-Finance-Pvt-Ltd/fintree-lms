const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { isRetryableDbError } = require("../utils/retryableDbError");

// Exercise the actual handler without loading providers or opening a database.
const source = fs.readFileSync(path.join(__dirname, "../routes/QuickMoney/quickMoneyRoutes.js"), "utf8");
const start = source.indexOf('router.post("/v1/create"');
const end = source.indexOf("async function verifyQuickMoneyBankAndStoreResult", start);

async function run({ failures = [], rollbackFails = false, duplicateOnRetry = false } = {}) {
  const events = [];
  let handler;
  let attempt = 0;
  const db = { promise: () => ({ getConnection: async () => {
    const current = ++attempt;
    events.push(`${current}:acquire`);
    return {
      beginTransaction: async () => events.push(`${current}:begin`),
      query: async (sql) => {
        if (sql.includes("SELECT")) {
          events.push(`${current}:lookup`);
          return [duplicateOnRetry && current > 1 ? [{ id: 1 }] : []];
        }
        events.push(`${current}:insert`);
        if (failures[current - 1]) throw Object.assign(new Error("database failure"), { code: failures[current - 1] });
        return [{ affectedRows: 1 }];
      },
      commit: async () => events.push(`${current}:commit`),
      rollback: async () => {
        events.push(`${current}:rollback`);
        if (rollbackFails) throw new Error("connection lost");
      },
      release: () => events.push(`${current}:release`),
      destroy: () => events.push(`${current}:destroy`),
    };
  } }) };
  vm.runInNewContext(source.slice(start, end), {
    router: { post: (_path, _auth, fn) => { handler = fn; } },
    verifyApiKey: () => {}, db, isRetryableDbError,
    normalizeQuickMoneyPayload: () => ({}),
    generateApplicationId: () => "application",
    generateLoanIdentifiers: async () => ({ lan: "QML1011000" }),
    console: { error() {}, warn() {} },
    setTimeout: (fn) => { events.push("backoff"); fn(); },
  });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ body: { partner_loan_id: "partner", lenderType: "QUICKMONEY" } }, res);
  return { events, res, attempts: attempt };
}

for (const code of ["ER_LOCK_WAIT_TIMEOUT", "ER_LOCK_DEADLOCK", "ER_CHECKREAD"]) {
  test(`${code} rolls back all writes and releases before retry`, async () => {
    const { events, res, attempts } = await run({ failures: [code] });
    assert.equal(res.code, 200);
    assert.equal(attempts, 2);
    assert.deepEqual(events, ["1:acquire", "1:begin", "1:lookup", "1:insert", "1:rollback", "1:release", "backoff", "2:acquire", "2:begin", "2:lookup", "2:insert", "2:commit", "2:release"]);
  });
}

test("persistent contention stops after three attempts", async () => {
  const { attempts, res, events } = await run({ failures: Array(3).fill("ER_LOCK_WAIT_TIMEOUT") });
  assert.equal(attempts, 3);
  assert.equal(res.code, 500);
  assert.equal(events.filter((e) => e.endsWith(":rollback")).length, 3);
  assert.equal(events.filter((e) => e === "backoff").length, 2);
});

test("non-transient errors are not retried", async () => {
  const { attempts, res } = await run({ failures: ["ER_BAD_FIELD_ERROR"] });
  assert.equal(attempts, 1);
  assert.equal(res.code, 500);
});

test("failed rollback destroys the connection and prevents retry", async () => {
  const { attempts, res, events } = await run({ failures: ["ER_LOCK_WAIT_TIMEOUT"], rollbackFails: true });
  assert.equal(attempts, 1);
  assert.equal(res.code, 500);
  assert.equal(events.at(-1), "1:destroy");
  assert.ok(!events.includes("1:release"));
});

test("duplicate check runs again after rollback", async () => {
  const { attempts, res, events } = await run({ failures: ["ER_LOCK_WAIT_TIMEOUT"], duplicateOnRetry: true });
  assert.equal(attempts, 2);
  assert.equal(res.code, 409);
  assert.ok(!events.includes("2:insert"));
});
