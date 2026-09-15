// Storage-layer errors that MySQL's own error message says to fix by
// restarting the transaction, not by failing the request outright:
// - ER_LOCK_DEADLOCK (1213): a genuine InnoDB deadlock victim.
// - ER_LOCK_WAIT_TIMEOUT (1205): waited too long for a row lock.
// - ER_CHECKREAD (1020): "record changed since last read" — seen in
//   production specifically on concurrent SELECT ... FOR UPDATE against
//   shared hot rows (loan_sequences, partner_monthly_limit) since moving
//   off shared hosting onto a self-managed VPS.
// All three are transient, single-request races — safe to retry a fresh
// transaction a couple of times with a short backoff rather than surface
// a 500 to the partner for what's usually a one-shot contention blip.
const RETRYABLE_DB_ERROR_CODES = new Set([
  "ER_CHECKREAD",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
]);

function isRetryableDbError(err) {
  return Boolean(err) && RETRYABLE_DB_ERROR_CODES.has(err.code);
}

module.exports = { RETRYABLE_DB_ERROR_CODES, isRetryableDbError };
