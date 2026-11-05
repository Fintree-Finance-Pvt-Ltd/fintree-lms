const dayjs = require("dayjs");

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const formatDate = (value) => value && dayjs(value).isValid()
  ? dayjs(value).format("DD-MM-YYYY") : "";

function buildOmrajPayDocumentData(summary, rows) {
  if (!summary) throw new Error("OmrajPay agreement summary is unavailable");
  const amount = Number(summary.LOAN_AMOUNT);
  const months = Number(summary.TENURE);
  if (!(amount > 0) || !Number.isInteger(months) || months < 1 || rows.length !== months) {
    throw new Error("OmrajPay agreement terms and repayment schedule do not match");
  }
  const principal = rows.reduce((total, row) => total + Number(row.principal), 0);
  if (Math.abs(principal - amount) > 0.011 || Number(rows.at(-1).closing) !== 0) {
    throw new Error("OmrajPay agreement repayment principal does not reconcile");
  }
  const data = { ...summary };
  for (const key of ["CUR_DATE", "DOB", "CO_APPLICANT_DOB", "GUARANTOR_DOB", "SALE_INVOICE_DATE",
    "POLICY_ISSUED_DATE", "REPAYMENT_START_DATE", "GUARANTOR_DATE_OF_FORMATION_INCORPORATION"]) {
    data[key] = formatDate(summary[key]);
  }
  data.MANIFACTURING_YEAR = summary.MANUFACTURING_YEAR;
  data["CO_APPLICANT_NAME / GUARANTOR_NAME"] = [summary.CO_APPLICANT_NAME, summary.GUARANTOR_NAME].filter(Boolean).join(" / ");
  Object.assign(data, {
    lan: summary.LAN, C_N: summary.CUSTOMER_NAME, cur_add: summary.PERMANENT_ADDRESS,
    per_add: summary.PERMANENT_ADDRESS, L_A: summary.LOAN_AMOUNT, L_T: summary.TENURE,
    I_R: summary.ROI, I_S: summary.SUM_OF_INTEREST, P_S: summary.SUM_OF_PROCESSING_FEE,
    B_Na: summary.BANK_NAME, A_no: summary.BANK_ACCOUNT_NUMBER, ifsc: summary.BANK_IFSC_CODE,
    CU_date: data.CUR_DATE, ...rows[0],
  });
  const escaped = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, escapeHtml(value)]));
  escaped.RPS = rows;
  escaped.RPS_TABLE_ROWS = rows.map((row) => `<tr>${[
    row.emi_no, row.opening, row.principal, row.interest, row.emi, row.closing,
  ].map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
  escaped.RPS_ROWS = escaped.RPS_TABLE_ROWS;
  return escaped;
}

// Same preparation order as Sampada, on one connection and transaction. These
// document tables are separate from manual_rps_omrajpay used for collections.
async function getOmrajPayLoanDocumentData(db, lan) {
  const cleanLan = String(lan || "").trim().toUpperCase();
  if (!/^OMR\d+$/.test(cleanLan)) throw new Error("Invalid OmrajPay customer LAN");
  const ownsConnection = typeof db.getConnection === "function";
  const connection = ownsConnection ? await db.getConnection() : db;
  let locked = false;
  let transaction = false;
  const lockName = `omrajpay-document:${cleanLan}`;
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK(?, 10) AS acquired", [lockName]);
    locked = Number(lock?.acquired) === 1;
    if (!locked) throw new Error("OmrajPay agreement preparation is already running. Please retry.");
    if (ownsConnection) { await connection.beginTransaction(); transaction = true; }
    const [[loan]] = await connection.query("SELECT lan, loan_amount FROM loan_booking_omrajpay WHERE lan = ?", [cleanLan]);
    if (!loan) {
      if (transaction) { await connection.rollback(); transaction = false; }
      return null;
    }
    if (!(Number(loan.loan_amount) > 0)) throw new Error("OmrajPay approved loan amount is required before generating documents");
    await connection.query("CALL sp_generate_omrajpay_rps(?)", [cleanLan]);
    await connection.query("CALL sp_create_omrajpay_loan_summary(?)", [cleanLan]);
    const [[summary]] = await connection.query("SELECT * FROM omrajpay_loan_summary WHERE LAN = ?", [cleanLan]);
    const [rows] = await connection.query("SELECT * FROM loan_rps_omrajpay WHERE lan = ? ORDER BY emi_no ASC", [cleanLan]);
    const data = buildOmrajPayDocumentData(summary, rows);
    if (transaction) { await connection.commit(); transaction = false; }
    return data;
  } catch (error) {
    if (transaction) await connection.rollback();
    throw error;
  } finally {
    try { if (locked) await connection.query("SELECT RELEASE_LOCK(?)", [lockName]); }
    finally { if (ownsConnection) connection.release(); }
  }
}

module.exports = { getOmrajPayLoanDocumentData, buildOmrajPayDocumentData };
