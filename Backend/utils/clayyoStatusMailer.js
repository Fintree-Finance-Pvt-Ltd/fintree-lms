const nodemailer = require("nodemailer");

const STATUS_MAIL_MAP = {
  "Login": (loan) => ({
    to: process.env.CLAYYO_LOGIN_MAILS || "",
    subject: `New Clayyo Login - ${loan.lan}`,
    html: `
      <h3>New Clayyo Login Created</h3>
      <p><b>Customer:</b> ${loan.customer_name || "-"}</p>
      <p><b>LAN:</b> ${loan.lan}</p>
      <p><b>Loan Amount:</b> ₹${loan.loan_amount || 0}</p>
    `,
  }),

  "BRE APPROVED": (loan) => ({
    to: process.env.CLAYYO_BRE_APPROVED_MAILS || "",
    subject: `BRE Approved - ${loan.lan}`,
    html: `
      <h3>BRE Approved</h3>
      <p><b>Customer:</b> ${loan.customer_name || "-"}</p>
      <p><b>LAN:</b> ${loan.lan}</p>
    `,
  }),

  "BRE FAILED": (loan) => ({
    to: process.env.CLAYYO_BRE_FAILED_MAILS || "",
    subject: `BRE Failed - ${loan.lan}`,
    html: `
      <h3>BRE Failed</h3>
      <p><b>Customer:</b> ${loan.customer_name || "-"}</p>
      <p><b>LAN:</b> ${loan.lan}</p>
    `,
  }),

  "CREDIT APPROVED": (loan) => ({
    to: process.env.CLAYYO_CREDIT_APPROVED_MAILS || "",
    subject: `Credit Approved - ${loan.lan}`,
    html: `
      <h3>Credit Approved</h3>
      <p><b>Customer:</b> ${loan.customer_name || "-"}</p>
      <p><b>LAN:</b> ${loan.lan}</p>
    `,
  }),

  "REJECTED": (loan) => ({
    to: process.env.CLAYYO_REJECTED_MAILS || "",
    subject: `Loan Rejected - ${loan.lan}`,
    html: `
      <h3>Loan Rejected</h3>
      <p><b>Customer:</b> ${loan.customer_name || "-"}</p>
      <p><b>LAN:</b> ${loan.lan}</p>
    `,
  }),

  "LIMIT REQUESTED": (loan) => ({
    to: process.env.CLAYYO_LIMIT_REQUESTED_MAILS || "",
    subject: `Limit Requested - ${loan.lan}`,
    html: `
      <h3>Limit Requested</h3>
      <p><b>Customer:</b> ${loan.customer_name || "-"}</p>
      <p><b>LAN:</b> ${loan.lan}</p>
      <p><b>Final Limit:</b> ₹${loan.final_limit || 0}</p>
    `,
  }),

  "OPS APPROVED": (loan) => ({
    to: process.env.CLAYYO_OPS_APPROVED_MAILS || "",
    subject: `OPS Approved - ${loan.lan}`,
    html: `
      <h3>OPS Approved</h3>
      <p><b>Customer:</b> ${loan.customer_name || "-"}</p>
      <p><b>LAN:</b> ${loan.lan}</p>
      <p><b>Approved Limit:</b> ₹${loan.approved_limit || 0}</p>
    `,
  }),

  "DISBURSEMENT INITIATED": (loan) => ({
    to: process.env.OPS_DISBURSEMENT_MAIL || "",
    subject: `Disbursement Initiation Request ${loan.lan}`,
    html: `
      <h3>Disbursement Initiation Required</h3>
      <p><b>Customer:</b> ${loan.customer_name || "-"}</p>
      <p><b>LAN:</b> ${loan.lan}</p>
      <p><b>Approved Limit:</b> ₹${loan.approved_limit || 0}</p>
      <p><b>Product:</b> CLAYYO</p>
      <small>Auto-generated notification from LMS</small>
    `,
  }),

  "DISBURSED": (loan) => ({
    to: process.env.CLAYYO_DISBURSED_MAILS || "",
    subject: `Loan Disbursed - ${loan.lan}`,
    html: `
      <h3>Loan Disbursed</h3>
      <p><b>Customer:</b> ${loan.customer_name || "-"}</p>
      <p><b>LAN:</b> ${loan.lan}</p>
      <p><b>Approved Limit:</b> ₹${loan.approved_limit || 0}</p>
    `,
  }),
};

function getTransporter() {
  return nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendStatusMailIfNeeded({ db, lan, status, loan }) {
  const builder = STATUS_MAIL_MAP[status];
  if (!builder) {
    return { skipped: true, reason: "No mail mapping for status" };
  }

  const [existing] = await db.promise().query(
    `SELECT id FROM loan_status_mail_log WHERE lan = ? AND status = ?`,
    [lan, status]
  );

  if (existing.length > 0) {
    return { skipped: true, reason: "Mail already sent for this LAN and status" };
  }

  const mail = builder(loan);
  if (!mail.to || !String(mail.to).trim()) {
    return { skipped: true, reason: "Recipient list empty" };
  }

  const transporter = getTransporter();

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: mail.to.split(",").map((x) => x.trim()).filter(Boolean),
    subject: mail.subject,
    html: mail.html,
  });

  await db.promise().query(
    `INSERT INTO loan_status_mail_log (lan, status, mailed_to) VALUES (?, ?, ?)`,
    [lan, status, mail.to]
  );

  return { skipped: false };
}

async function updateLoanStatusAndNotify({
  db,
  lan,
  newStatus,
  newStage,
  extraUpdate = {},
}) {
  const [[loan]] = await db.promise().query(
    `
    SELECT
      lan,
      customer_name,
      loan_amount,
      final_limit,
      approved_limit,
      status,
      stage
    FROM loan_booking_clayyo
    WHERE lan = ?
    `,
    [lan]
  );

  if (!loan) {
    throw new Error("Loan not found");
  }

  if (loan.status === newStatus && (!newStage || loan.stage === newStage)) {
    return {
      success: true,
      alreadyUpdated: true,
      message: "Status already updated",
    };
  }

  const fields = ["status = ?"];
  const values = [newStatus];

  if (newStage) {
    fields.push("stage = ?");
    values.push(newStage);
  }

  Object.entries(extraUpdate).forEach(([key, value]) => {
    fields.push(`${key} = ?`);
    values.push(value);
  });

  values.push(lan);

  await db.promise().query(
    `
    UPDATE loan_booking_clayyo
    SET ${fields.join(", ")}
    WHERE lan = ?
    `,
    values
  );

  const [[updatedLoan]] = await db.promise().query(
    `
    SELECT
      lan,
      customer_name,
      loan_amount,
      final_limit,
      approved_limit,
      status,
      stage
    FROM loan_booking_clayyo
    WHERE lan = ?
    `,
    [lan]
  );

  const mailResult = await sendStatusMailIfNeeded({
    db,
    lan,
    status: newStatus,
    loan: updatedLoan,
  });

  return {
    success: true,
    alreadyUpdated: false,
    mailSent: !mailResult.skipped,
    mailReason: mailResult.reason || null,
  };
}

module.exports = {
  sendStatusMailIfNeeded,
  updateLoanStatusAndNotify,
};