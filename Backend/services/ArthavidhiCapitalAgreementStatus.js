const normalize = (value) =>
  String(value || "").trim().toUpperCase();

const signedStatuses = [
  "SIGNED",
  "COMPLETED",
  "SIGN_COMPLETE",
];

const retryStatuses = [
  "FAILED",
  "ERROR",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
];

// Keep the existing screen/API names while storing only the user's canonical
// Ya Money-style columns. No duplicate PAN, interest or disbursal columns.
const ARTHAVIDHI_BOOKING_FIELD_MAP = {
  pan_card:"pan_number",aadhar_number:"aadhaar_number",address_line_1:"customer_address",
  village:"customer_city",state:"customer_state",pincode:"customer_pincode",
  company_type:"business_type",udyam_registration:"udyam_number",business_village:"business_city",
  interest_rate:"interest",disbursal_amount:"net_disbursement",agreement_date:"sanction_date",e_mandate_no:"umrn",
};
function toArthavidhiBookingRecord(data) {
  const row={};
  for(const [key,value] of Object.entries(data))row[ARTHAVIDHI_BOOKING_FIELD_MAP[key]||key]=value;
  row.requested_amount=data.requested_amount??data.loan_amount;
  row.stage=data.status||"Login";
  row.loan_type="Business Loan";
  return row;
}
function fromArthavidhiBookingRecord(row) {
  if(!row)return row;
  const result={...row};
  for(const [alias,column] of Object.entries(ARTHAVIDHI_BOOKING_FIELD_MAP))if(row[column]!==undefined)result[alias]=row[column];
  if(row.id!==undefined)result.customer_id=row.id;
  result.dob=row.borrower_dob??row.dob;
  try{result.monthly_revenue=(typeof row.arthavidhi_capital_policy_inputs==="string"?JSON.parse(row.arthavidhi_capital_policy_inputs):row.arthavidhi_capital_policy_inputs)?.monthly_revenue??null;}catch{result.monthly_revenue=null;}
  result.permanent_address_line_1=result.address_line_1;
  result.permanent_village_city=result.village;
  result.permanent_state=result.state;
  result.permanent_pincode=result.pincode;
  return result;
}

async function loadArthavidhiCapitalAgreementStatus(db, rows) {
  if (!rows.length) return rows;
  rows=rows.map(fromArthavidhiBookingRecord);

  const [documents] = await db.query(
    `SELECT
       ed.lan,
       ed.document_id,
       ed.status,
       ed.raw_response,
       ed.created_at,
       EXISTS (
         SELECT 1
         FROM esign_documents signed
         WHERE signed.lan = ed.lan
           AND signed.document_type = 'AGREEMENT'
           AND UPPER(TRIM(signed.status)) IN (
             'SIGNED', 'COMPLETED', 'SIGN_COMPLETE'
           )
       ) AS has_signed
     FROM esign_documents ed
     WHERE ed.lan IN (?)
       AND ed.document_type = 'AGREEMENT'
       AND ed.id = (
         SELECT MAX(latest.id)
         FROM esign_documents latest
         WHERE latest.lan = ed.lan
           AND latest.document_type = 'AGREEMENT'
       )`,
    [rows.map((row) => row.lan)],
  );

  const byLan = new Map(
    documents.map((doc) => [doc.lan, doc]),
  );

  return rows.map((row) => {
    const doc = byLan.get(row.lan);

    let status = normalize(
      doc?.status || row.agreement_esign_status,
    );

    const documentId =
      doc?.document_id || row.agreement_esign_document_id;

    const sentAt =
      doc?.created_at || row.agreement_esign_sent_at;
    let response = {};
    try { response = typeof doc?.raw_response === "string" ? JSON.parse(doc.raw_response) : doc?.raw_response || {}; } catch { /* no usable saved link */ }

    if (
      Number(doc?.has_signed) === 1 ||
      signedStatuses.includes(
        normalize(row.agreement_esign_status),
      ) ||
      signedStatuses.includes(status)
    ) {
      status = "SIGNED";
    } else if (
      documentId &&
      ["", "PENDING", "REQUESTED", "NOT_INITIATED"].includes(status)
    ) {
      status = "INITIATED";
    }

    const canSend =
      retryStatuses.includes(status) ||
      (
        !documentId &&
        !sentAt &&
        ["", "PENDING", "NOT_INITIATED"].includes(status)
      );

    return {
      ...row,
      agreement_esign_status: status || "PENDING",
      agreement_esign_sent_at: sentAt || null,
      agreement_esign_document_id: documentId || null,
      agreement_sign_url: safeProviderUrl(response.sign_url),
      agreement_esign_can_send: canSend,
    };
  });
}

function safeProviderUrl(value) {
  try { const url = new URL(String(value || "")); return url.protocol === "https:" ? url.href : null; }
  catch { return null; }
}

// Authenticated staff diagnostics: show the reason, never a whole provider
// payload, SQL query, credentials, customer identifiers or stack trace.
function arthavidhiSigningErrorDetails(error) {
  const redact = value => {
    if (typeof value !== "string") return null;
    let text = value;
    for (const [key, secret] of Object.entries(process.env)) {
      if (/KEY|SECRET|PASSWORD|TOKEN|PASS/.test(key) && secret && secret.length >= 4)
        text = text.split(secret).join("[redacted]");
    }
    return text
      .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, "[redacted authentication]")
      .replace(/\b(?:api[-_ ]?key|secret[-_ ]?key|password|token)\b\s*[:=]\s*["']?[^\s,"';]+/gi, "[redacted credential]")
      .replace(/https?:\/\/[^\s<>"']+/gi, "[redacted URL]")
      .replace(/[A-Z]:\\[^\r\n]+/gi, "[redacted local path]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
      .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, "[redacted PAN]")
      .replace(/\b\d(?:[ -]?\d){9,}\b/g, "[redacted number]")
      .replace(/[A-Za-z0-9+/=_-]{80,}/g, "[redacted data]")
      .replace(/[\r\n\t]+/g, " ").slice(0, 600);
  };
  const provider = error.provider_error;
  const messages = provider && typeof provider === "object"
    ? [provider.message, provider.detail, provider.error?.message, typeof provider.error === "string" ? provider.error : null]
    : [];
  const validation = Array.isArray(provider?.errors)
    ? provider.errors.slice(0, 3).map(item => redact(typeof item === "string" ? item : item?.message)).filter(Boolean) : [];
  const reason = messages.map(redact).find(Boolean) || validation[0]
    || (error.arthavidhi_step === "provider_order" ? null : redact(error.message));
  const code = provider?.code ?? provider?.error_code;
  return { reason, provider_code: typeof code === "number" || (typeof code === "string" && /^[A-Z0-9_.-]{1,64}$/i.test(code)) ? code : null, validation_errors: validation };
}

async function loadArthavidhiCapitalMandateStatus(db, rows) {
  if (!rows.length) return rows;
  const [mandates] = await db.query(`SELECT m.id,m.lan,m.document_id,m.status,m.umrn,m.mandate_amount,m.account_no,m.ifsc,m.auth_url
    FROM enach_mandates m WHERE m.lan IN (?) AND m.id=(SELECT MAX(latest.id) FROM enach_mandates latest WHERE latest.lan=m.lan)`,
    [rows.map(r => r.lan)]);
  const byLan = new Map(mandates.map(m => [m.lan,m]));
  return rows.map(loan => {
    const m = byLan.get(loan.lan);
    const state = normalize(m?.status);
    const matchesBank = Boolean(m && String(loan.account_number || "").trim() && normalize(loan.ifsc) && String(m.account_no || "").trim() === String(loan.account_number || "").trim() &&
      normalize(m.ifsc) === normalize(loan.ifsc));
    const coversPayment = Number(m?.mandate_amount) >= Number(loan.emi_amount) && Number(loan.emi_amount) > 0;
    const active = ["ACTIVE","REGISTERED","SUCCESS","COMPLETED","REGISTER_SUCCESS","REGISTERSUCCESS"].includes(state);
    const ready = Boolean(matchesBank && coversPayment && active && String(m?.document_id || "").trim() && String(m?.umrn || "").trim());
    const canSend = !m || ["FAILED","REJECTED","CANCELLED","CANCELED","REVOKED","EXPIRED"].includes(state);
    return { ...loan, mandate_status: m ? (ready ? "ACTIVE" : state || "PENDING") : "NOT_INITIATED",
      mandate_document_id: m?.document_id || null, mandate_umrn: m?.umrn || null,
      mandate_amount: m?.mandate_amount ?? null, mandate_auth_url: safeProviderUrl(m?.auth_url),
      mandate_ready: ready, mandate_can_send: canSend,
      mandate_block_reason: ready ? null : !m ? "Mandate has not been initiated" : !matchesBank ? "Mandate bank details do not match the final loan bank"
        : !coversPayment ? "Mandate amount does not cover the monthly EMI" : "Customer authorisation and registered UMRN are required" };
  });
}

async function requireArthavidhiActiveMandate(db, loan) {
  const [current] = await loadArthavidhiCapitalMandateStatus(db,[loan]);
  if (!current.mandate_ready) throw Object.assign(new Error(current.mandate_block_reason),{status:409});
  return current;
}

// Called after either provider callback and on queue refresh. The conditional
// update is idempotent: only this product's signing-stage cases can advance.
async function advanceArthavidhiSigningIfComplete(db, lan = null) {
  if (lan !== null && !/^AVCL\d+$/.test(lan)) return 0;
  const [pending] = await db.query(`SELECT * FROM loan_booking_arthavidhi
    WHERE LOWER(TRIM(status))='signing_pending' ${lan === null ? "" : "AND lan=?"}`,
    lan === null ? [] : [lan]);
  const cases = await loadArthavidhiCapitalMandateStatus(db,
    await loadArthavidhiCapitalAgreementStatus(db, pending));
  const ready = cases.filter(row => normalize(row.status) === "SIGNING_PENDING"
    && row.agreement_esign_status === "SIGNED" && row.mandate_ready
    && row.tenure_unit === "months" && row.repayment_frequency === "monthly"
    && Number(row.net_disbursement) > 0);
  if (!ready.length) return 0;
  // Recheck persisted completion in the write itself in case a mandate was
  // cancelled between reading the provider records and acquiring the row lock.
  const [result] = await db.query(`UPDATE loan_booking_arthavidhi l
    JOIN enach_mandates m ON m.lan=l.lan
      AND m.id=(SELECT MAX(latest.id) FROM enach_mandates latest WHERE latest.lan=l.lan)
    SET l.status='ops_initiate',l.stage='ops_initiate',l.umrn=m.umrn
    WHERE l.lan LIKE 'AVCL%' AND LOWER(TRIM(l.status))='signing_pending'
      AND l.lan IN (?)
      AND l.tenure_unit='months' AND l.repayment_frequency='monthly'
      AND l.emi_amount>0 AND l.net_disbursement>0
      AND TRIM(COALESCE(l.account_number,''))<>''
      AND TRIM(m.account_no)=TRIM(l.account_number)
      AND UPPER(TRIM(m.ifsc))=UPPER(TRIM(l.ifsc))
      AND m.mandate_amount>=l.emi_amount
      AND UPPER(TRIM(m.status)) IN ('ACTIVE','REGISTERED','SUCCESS','COMPLETED','REGISTER_SUCCESS','REGISTERSUCCESS')
      AND TRIM(COALESCE(m.document_id,''))<>'' AND TRIM(COALESCE(m.umrn,''))<>''
      AND EXISTS (SELECT 1 FROM esign_documents e WHERE e.lan=l.lan
        AND e.document_type='AGREEMENT'
        AND UPPER(TRIM(e.status)) IN ('SIGNED','COMPLETED','SIGN_COMPLETE'))`,
    [ready.map(row => row.lan)]);
  return result.affectedRows;
}

function hasApprovedArthavidhiNoHit(loan) {
  try {const p=typeof loan.arthavidhi_capital_policy_result==="string"?JSON.parse(loan.arthavidhi_capital_policy_result):loan.arthavidhi_capital_policy_result;return Boolean(p?.eligible&&p.ho_approved_by&&p.deviations?.includes("NO_HIT_REQUIRES_BUSINESS_MANAGER_AND_HO_REVIEW"));}catch{return false;}
}
function requireArthavidhiPolicyApproval(loan) {
  let policy;try{policy=typeof loan.arthavidhi_capital_policy_result==="string"?JSON.parse(loan.arthavidhi_capital_policy_result):loan.arthavidhi_capital_policy_result;}catch{}
  if(policy?.synthetic||!policy?.eligible||!policy.ho_approved_by||loan.tenure_unit!=="months"||loan.repayment_frequency!=="monthly")throw Object.assign(new Error("Current Arthavidhi policy and HO approval with monthly terms are required"),{status:409});
}
function isArthavidhiPreBureauStage(loan) {
  return String(loan.status||"").trim().toLowerCase()==="draft";
}
async function loadArthavidhiBookingEditability(db,rows) {
  return rows.map(row=>({...row,can_edit_booking:isArthavidhiPreBureauStage(row)}));
}
module.exports = { arthavidhiSigningErrorDetails,advanceArthavidhiSigningIfComplete,isArthavidhiPreBureauStage,loadArthavidhiBookingEditability,hasApprovedArthavidhiNoHit,requireArthavidhiPolicyApproval,loadArthavidhiCapitalAgreementStatus,loadArthavidhiCapitalMandateStatus,requireArthavidhiActiveMandate,
  ARTHAVIDHI_BOOKING_FIELD_MAP,toArthavidhiBookingRecord,fromArthavidhiBookingRecord };
