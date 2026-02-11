const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

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

async function sendWelcomeKitMail({
  to,
  customerName,
  lan,
  accountNumber,
  pdfPath,
}) {
  if (!to) throw new Error("Missing recipient email");
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    throw new Error("Signed PDF not found for Welcome Kit mail");
  }

  const subject = `Welcome to Fintree Finance – Loan Account ${accountNumber || lan}`;

  const text = `
Dear Customer,

Greeting from Fintree Finance Private Limited.

We thank you for choosing Fintree Finance Private Limited to serve your financial needs.
We are happy to have you as our valued customer.

We are enclosing herewith Welcome Kit for your Loan Account - ${accountNumber || "XXXXXXXXXXXX"}.

We value your relationship with us and assure you of the best services always.

Your Sincerely,

For Fintree Finance Private Limited
`.trim();

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to,
    subject,
    text,
    attachments: [
      {
        filename: path.basename(pdfPath),
        path: pdfPath,
        contentType: "application/pdf",
      },
    ],
  };

  return transporter.sendMail(mailOptions);
}

async function sendLowBalanceAlertMail({
  to,
  balanceAmount,
  thresholdAmount,
  virtualAccountNumber,
  virtualIfscNumber,
}) {
  if (!to) throw new Error("Missing recipient email for low balance alert");

  const subject = `⚠️ Low Balance Alert – Virtual Account ${virtualAccountNumber}`;

  const text = `
Dear Team,

This is to inform you that the balance of the following virtual account has fallen below the configured threshold.

Virtual Account Number: ${virtualAccountNumber}
Virtual IFSC: ${virtualIfscNumber}

Current Balance: ₹${balanceAmount}
Threshold Amount: ₹${thresholdAmount}

Kindly add funds from a whitelisted account to avoid service disruption.

Regards,
Fintree Finance System
  `.trim();

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
  sendWelcomeKitMail,
  sendLowBalanceAlertMail,
};

