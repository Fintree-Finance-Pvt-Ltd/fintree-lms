const normalize = (value) => String(value || "").trim().toUpperCase();
const signedStatuses = ["SIGNED", "COMPLETED", "SIGN_COMPLETE"];
const retryStatuses = ["FAILED", "ERROR", "REJECTED", "EXPIRED", "CANCELLED"];

async function loadSampadaAgreementStatus(db, rows) {
  if (!rows.length) return rows;
  const [documents] = await db.query(
    `SELECT ed.lan, ed.document_id, ed.status, ed.created_at,
       EXISTS (SELECT 1 FROM esign_documents signed
         WHERE signed.lan = ed.lan AND signed.document_type = 'AGREEMENT'
           AND UPPER(TRIM(signed.status)) IN ('SIGNED', 'COMPLETED', 'SIGN_COMPLETE')) AS has_signed
     FROM esign_documents ed
     WHERE ed.lan IN (?) AND ed.document_type = 'AGREEMENT'
       AND ed.id = (SELECT MAX(latest.id) FROM esign_documents latest
         WHERE latest.lan = ed.lan AND latest.document_type = 'AGREEMENT')`,
    [rows.map((row) => row.lan)],
  );
  const byLan = new Map(documents.map((doc) => [doc.lan, doc]));
  return rows.map((row) => {
    const doc = byLan.get(row.lan);
    let status = normalize(doc?.status || row.agreement_esign_status);
    const documentId = doc?.document_id || row.agreement_esign_document_id;
    const sentAt = doc?.created_at || row.agreement_esign_sent_at;
    if (doc?.has_signed || signedStatuses.includes(normalize(row.agreement_esign_status)) || signedStatuses.includes(status)) {
      status = "SIGNED";
    } else if (documentId && ["", "PENDING", "REQUESTED", "NOT_INITIATED"].includes(status)) {
      status = "INITIATED";
    }
    const canSend = retryStatuses.includes(status) ||
      (!documentId && !sentAt && ["", "PENDING"].includes(status));
    return {
      ...row,
      agreement_esign_status: status || "PENDING",
      agreement_esign_sent_at: sentAt || null,
      agreement_esign_document_id: documentId || null,
      agreement_esign_can_send: canSend,
    };
  });
}

module.exports = { loadSampadaAgreementStatus };
