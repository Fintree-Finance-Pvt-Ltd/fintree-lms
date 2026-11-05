const { requireArthavidhiPolicyApproval, requireArthavidhiActiveMandate, fromArthavidhiBookingRecord } = require("./ArthavidhiCapitalAgreementStatus");
const db = require("../config/db");
const { generateRepaymentScheduleArthavidhiCapital } = require("./arthavidhiDailySchedule");

// Handles manual UTR confirmation and historical API callbacks. The row lock makes
// repeated callbacks harmless without ever deleting a partially paid schedule.
async function processArthavidhiCapitalDisbursement({ lan, disbursementUTR, disbursementDate, mode = "API", actorId }) {
  if (!/^AVCL\d+$/.test(lan) || !String(disbursementUTR || "").trim()) throw new Error("Valid Arthavidhi LAN and UTR required");
  if (!["API", "MANUAL"].includes(mode)) throw new Error("Unsupported settlement mode");
  if (mode === "MANUAL" && (actorId == null || !String(actorId).trim()))
    throw Object.assign(new Error("Authenticated staff identity required for manual UTR"), {status:401});
  const date = disbursementDate instanceof Date ? disbursementDate : new Date(String(disbursementDate));
  if (!Number.isFinite(date.getTime())) throw new Error("Valid disbursement date required");
  const formatDate = value => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(value);
  const dateText = formatDate(date);
  if (mode === "MANUAL" && dateText > formatDate(new Date())) throw new Error("Manual payment date cannot be in the future");
  const conn = await db.promise().getConnection();
  const utrLock = mode === "MANUAL" ? "avcl-manual-utr:" + require("crypto").createHash("sha256").update(String(disbursementUTR).trim()).digest("hex").slice(0,40) : null;
  let committed = false, released = false, utrLocked = false;
  try {
    if (mode === "MANUAL") {
      const [[lock]] = await conn.query("SELECT GET_LOCK(?,0) AS acquired", [utrLock]);
      utrLocked = Number(lock?.acquired) === 1;
      if (!utrLocked) throw new Error("This bank UTR is already processing; retry after status refresh");
    }
    await conn.beginTransaction();
    const [[storedLoan]] = await conn.query("SELECT * FROM loan_booking_arthavidhi WHERE lan=? FOR UPDATE", [lan]);
    const loan = fromArthavidhiBookingRecord(storedLoan);
    if (!loan) throw new Error("Arthavidhi loan not found");
    const [utrs] = await conn.query("SELECT LAN,Disbursement_UTR FROM ev_disbursement_utr WHERE LAN=? OR Disbursement_UTR=? FOR UPDATE", [lan, String(disbursementUTR).trim()]);
    if (String(loan.status).toLowerCase() === "disbursed") {
      if (!utrs.some(r => r.LAN === lan && r.Disbursement_UTR === String(disbursementUTR).trim())) throw new Error("Disbursed loan has a conflicting UTR");
      await conn.commit();committed=true;
      return { success: true, skipped: true, reason: "ALREADY_DISBURSED" };
    }
    if (mode === "MANUAL") {
      if (String(loan.status).toLowerCase() !== "disburse_initiate" || !loan.ops_checker_id || !loan.ops_maker_id)
        throw new Error("Checker approval for manual payment is required before UTR upload");
      if (String(loan.ops_checker_id) === String(loan.ops_maker_id)) throw new Error("Separate maker and checker approvals required");
      if (!Number.isFinite(Number(loan.disbursal_amount)) || Number(loan.disbursal_amount)<=0 || Number(loan.disbursal_amount)>Number(loan.loan_amount))
        throw new Error("Valid net disbursement amount required before manual payment confirmation");
      requireArthavidhiPolicyApproval(loan);
      if (String(loan.aml_status).toUpperCase() !== "PROCEED") throw new Error("AML clearance required before manual disbursement");
      const [[kyc]] = await conn.query("SELECT pan_status,aadhaar_status,bureau_status FROM kyc_verification_status WHERE lan=? AND applicant_type='BORROWER' AND party_no=1", [lan]);
      if (!kyc || ![kyc.pan_status,kyc.aadhaar_status,kyc.bureau_status].every(status=>String(status).toUpperCase()==="VERIFIED"))
        throw new Error("Borrower PAN, Aadhaar and bureau must be verified before manual disbursement");
      const [signed] = await conn.query("SELECT id FROM esign_documents WHERE lan=? AND document_type='AGREEMENT' AND UPPER(TRIM(status)) IN ('SIGNED','COMPLETED','SIGN_COMPLETE') LIMIT 1", [lan]);
      if (!signed.length) throw new Error("Signed agreement required before manual disbursement");
      await requireArthavidhiActiveMandate(conn,loan);
      const [transfers] = await conn.query("SELECT id FROM quick_transfers WHERE lan=? LIMIT 1", [lan]);
      const [attempts] = await conn.query("SELECT request_id FROM arthavidhi_capital_payout_attempts WHERE lan=? LIMIT 1", [lan]);
      if (transfers.length || attempts.length) throw new Error("Legacy API payout exists; reconcile before uploading a manual UTR");
      const limits = require("./partnerLimitService");
      const posGate = await limits.checkPartnerPosGate(conn,{partnerName:"Arthavidhi Capital",amount:Number(loan.loan_amount),posTableName:"manual_rps_arthavidhi_capital"});
      if (posGate.blocked) throw new Error(posGate.message || "Partner POS limit exceeded");
      const {getMonthYear} = require("../utils/partnerHelpers");
      const {month,year} = getMonthYear(date);
      const partner = await limits.getOrCreatePartner(conn,"Arthavidhi Capital");
      const limit = await limits.validatePartnerDisbursementLimit(conn,partner.partner_id,Number(loan.disbursal_amount),month,year);
      if (!limit.valid) throw new Error(limit.message || "Manual disbursement limit exceeded");
      await limits.updateDisbursedLimit(conn,limit.limitId,Number(loan.disbursal_amount),lan);
    } else if (!["approved", "api approved"].includes(String(loan.status).toLowerCase())) throw new Error("Arthavidhi loan is not approved for payout");
    if (utrs.some(r => r.LAN !== lan || r.Disbursement_UTR !== String(disbursementUTR).trim())) throw new Error("Conflicting disbursement UTR; reconciliation required");
    if (mode === "API") {
    const [[transfer]] = await conn.query(`SELECT amount FROM quick_transfers WHERE lan=? AND utr=? AND
      LOWER(COALESCE(payout_status,status)) IN ('success','completed','processed') ORDER BY id DESC LIMIT 1`, [lan, String(disbursementUTR).trim()]);
    if (!transfer || Math.round(Number(transfer.amount) * 100) !== Math.round(Number(loan.disbursal_amount) * 100)) throw new Error("Confirmed payout matching disbursal amount required");
    }
    const schedule = await generateRepaymentScheduleArthavidhiCapital(conn, lan, loan.loan_amount, loan.interest_rate, loan.loan_tenure, dateText, loan.product, loan.lender);
    if (!utrs.length) await conn.query("INSERT INTO ev_disbursement_utr (LAN,Disbursement_UTR,Disbursement_Date) VALUES (?,?,?)", [lan, String(disbursementUTR).trim(), dateText]);
    await conn.query("UPDATE loan_booking_arthavidhi SET status='Disbursed',stage='Disbursed' WHERE lan=?", [lan]);
    if (mode === "API") await conn.query("UPDATE arthavidhi_capital_payout_attempts SET state='SETTLED' WHERE lan=?", [lan]);
    await conn.query("INSERT INTO arthavidhi_capital_audit (lan,event_type,actor_id,details) VALUES (?,'DISBURSED',?,?)", [lan,String(actorId || "SYSTEM"),JSON.stringify({utr:String(disbursementUTR).trim(),payment_mode:mode,net_disbursement:loan.disbursal_amount,disbursement_date:dateText})]);
    await conn.commit();committed=true;
    if (utrLocked) { await conn.query("SELECT RELEASE_LOCK(?)", [utrLock]);utrLocked=false; }
    conn.release();released=true;
    await require("../routes/ArthavidhiCapital/arthavidhiWebhook").sendArthavidhiWebhook(lan, "DISBURSED", { external_ref_no: loan.partner_loan_id, utr: String(disbursementUTR).trim(), disbursement_date: dateText, payment_mode:mode });
    return { success: true, rowsInserted: schedule.rpsData.length };
  } catch (e) { if (!committed) await conn.rollback(); throw e; }
  finally {
    if (!released) {
      try { if (utrLocked) await conn.query("SELECT RELEASE_LOCK(?)", [utrLock]); }
      finally { conn.release(); }
    }
  }
}
module.exports = { processArthavidhiCapitalDisbursement };
