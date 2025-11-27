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


async function sendAadhaarKycMail({ to, customerName, lan, kycUrl }) {
  if (!to) throw new Error("Missing email address for Aadhaar KYC mail");

  const subject = `Complete your Aadhaar KYC - LAN ${lan}`;
  const text = `
Dear ${customerName || "Customer"},

Thank you for applying for a loan with Fintree Finance.

To complete your Aadhaar-based KYC, please click on the link below:

${kycUrl}

This link is valid for a limited time. Kindly complete your KYC at the earliest.

Regards,
Fintree Finance
  `.trim();

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to,
    subject,
    text,
  };

  return transporter.sendMail(mailOptions);
}

async function sendEnachMandateMail({ to, customerName, lan, mandateUrl, amount }) {
  if (!to || !mandateUrl) {
    throw new Error("Missing to or mandateUrl for eNACH mail");
  }

  const subject = `eNACH Mandate Authorisation - LAN ${lan}`;
  const text = `Dear ${customerName || "Customer"},

To complete the auto-debit (eNACH) setup for your loan (LAN: ${lan}), please click the link below and complete the mandate authorisation:

${mandateUrl}

Mandate Amount: ₹${amount}

Please complete this step as soon as possible. Do not share this link or any OTP with anyone.

Regards,
Fintree Finance Pvt Ltd`;

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to,
    subject,
    text,
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { 
  sendLoanStatusMail,
  sendAadhaarKycMail,
  sendEnachMandateMail,
};

