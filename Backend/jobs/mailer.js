const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === "true", // STARTTLS when false
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendLoanStatusMail({ to, customerName, batchId, loanAmount, status }) {
  let subject, text;

  if (status === "Disburse initiate") {
    subject = `Loan Approved - Batch ID ${batchId}`;
    text = `Dear Team,\n\nThe case for ${customerName} with Batch ID ${batchId} has been approved.\nLoan Amount: ₹${loanAmount}\n\nRegards,\nFintree Finance`;
  } else if (status === "Rejected") {
    subject = `Loan Rejected - Batch ID ${batchId}`;
    text = `Dear Team,\n\nThe case for ${customerName} with Batch ID ${batchId} has been rejected.\nLoan Amount: ₹${loanAmount}\n\nRegards,\nFintree Finance`;
  } else {
    // return or throw error if status is not valid
    throw new Error(`Invalid loan status: ${status}`);
    // OR if you prefer not to throw:
    // return { success: false, message: `Invalid loan status: ${status}` };
  }

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to,
    subject,
    text,
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { sendLoanStatusMail };
