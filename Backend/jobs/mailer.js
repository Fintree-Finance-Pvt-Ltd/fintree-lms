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

async function sendLoanStatusMail({
  to,
  customerName,
  batchId,
  loanAmount,
  status,
}) {
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
    from: process.env.SMTP_FROM_NAME || process.env.FROM_EMAIL,
    to,
    subject,
    text,
  };

  return transporter.sendMail(mailOptions);
}

async function sendAadhaarKycMail({ to, customerName, lan, kycUrl }) {
  if (!to) throw new Error("Missing email address for Aadhaar KYC mail");

  const subject = `Action Required: Complete your Aadhaar KYC - LAN ${lan}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Complete your Aadhaar KYC</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f4f8" style="background-color:#f0f4f8;padding:32px 16px;">
<tr><td align="center">

<table align="center" width="580" cellpadding="0" cellspacing="0" style="width:580px;background:#ffffff;border:1px solid #dde3ec;">

  <!-- HEADER -->
  <tr>
    <td bgcolor="#0f4c81" style="padding:28px 36px;text-align:center;background-color:#0f4c81;">
      <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">
        Fintree<span style="color:#7ec8f4;">Finance</span>
      </p>
      <p style="margin:5px 0 0;font-size:10px;color:#a8ccee;letter-spacing:2px;font-family:Arial,sans-serif;">
        SECURE DIGITAL LENDING
      </p>
    </td>
  </tr>

  <!-- ACCENT BAR -->
  <tr>
    <td bgcolor="#2563eb" style="height:5px;font-size:0;line-height:0;background-color:#2563eb;">&nbsp;</td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="padding:36px 40px 8px;">
      <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f2d4f;font-family:Arial,sans-serif;">Complete your Aadhaar KYC</p>
      <p style="margin:0 0 24px;font-size:14px;color:#5b7391;font-family:Arial,sans-serif;">
        Action required for LAN <strong style="color:#0f4c81;">${lan}</strong>
      </p>
      <p style="margin:0 0 6px;font-size:15px;color:#374151;font-family:Arial,sans-serif;">
        Dear <strong style="color:#0f2d4f;">${customerName || "Customer"}</strong>,
      </p>
      <p style="margin:0 0 0;font-size:15px;color:#374151;line-height:1.7;font-family:Arial,sans-serif;">
        Thank you for applying for a loan with <strong style="color:#0f4c81;">Fintree Finance</strong>.
        Your application is almost complete — just one final step remaining.
      </p>
    </td>
  </tr>

  <!-- KYC BOX -->
  <tr>
    <td style="padding:24px 40px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f7ff" style="background-color:#f0f7ff;border:2px solid #bfdbfe;">
        <tr>
          <td style="padding:20px 22px;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td valign="top" style="padding-right:16px;">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td bgcolor="#2563eb" style="width:42px;height:42px;background-color:#2563eb;text-align:center;vertical-align:middle;">
                    <span style="font-size:22px;color:#ffffff;font-weight:700;line-height:42px;display:block;">&#10003;</span>
                  </td>
                </tr></table>
              </td>
              <td valign="top">
                <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0f2d4f;font-family:Arial,sans-serif;">Aadhaar-based e-KYC Verification</p>
                <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;font-family:Arial,sans-serif;">
                  Complete your identity verification digitally using your Aadhaar number. This is mandatory to process your loan.
                </p>
              </td>
            </tr></table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- HOW IT WORKS -->
  <tr>
    <td style="padding:0 40px 8px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:#6b7280;font-family:Arial,sans-serif;">HOW IT WORKS</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td bgcolor="#eff6ff" style="width:28px;height:28px;background-color:#eff6ff;border:1px solid #bfdbfe;text-align:center;vertical-align:middle;font-size:13px;font-weight:700;color:#2563eb;font-family:Arial,sans-serif;">1</td>
              <td style="padding-left:14px;font-size:14px;color:#374151;font-family:Arial,sans-serif;">Click the button below to open the secure KYC portal</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td bgcolor="#eff6ff" style="width:28px;height:28px;background-color:#eff6ff;border:1px solid #bfdbfe;text-align:center;vertical-align:middle;font-size:13px;font-weight:700;color:#2563eb;font-family:Arial,sans-serif;">2</td>
              <td style="padding-left:14px;font-size:14px;color:#374151;font-family:Arial,sans-serif;">Enter your Aadhaar number and verify with OTP</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td bgcolor="#eff6ff" style="width:28px;height:28px;background-color:#eff6ff;border:1px solid #bfdbfe;text-align:center;vertical-align:middle;font-size:13px;font-weight:700;color:#2563eb;font-family:Arial,sans-serif;">3</td>
              <td style="padding-left:14px;font-size:14px;color:#374151;font-family:Arial,sans-serif;">Your KYC will be verified instantly and securely</td>
            </tr></table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CTA BUTTON -->
  <tr>
    <td style="padding:28px 40px 8px;" align="center">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#2563eb" style="background-color:#2563eb;padding:15px 40px;" align="center">
            <a href="${kycUrl}" target="_blank"
               style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;font-family:Arial,sans-serif;display:block;">
              Complete Aadhaar KYC &rarr;
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:10px 0 0;font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;">
        Opens a secure, UIDAI-authorized verification page
      </p>
    </td>
  </tr>

  <!-- URGENCY NOTICE -->
  <tr>
    <td style="padding:20px 40px 36px;">
      <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#fffbeb" style="background-color:#fffbeb;border-left:4px solid #f59e0b;">
        <tr>
          <td style="padding:14px 18px;font-size:13px;color:#92400e;line-height:1.6;font-family:Arial,sans-serif;">
            &#9203; <strong>This link is time-sensitive.</strong> Please complete your KYC at the earliest to avoid delays in your loan processing.
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- FOOTER DIVIDER -->
  <tr>
    <td style="padding:0 40px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="border-top:1px solid #e5eaf2;font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td bgcolor="#f8fafc" style="background-color:#f8fafc;padding:28px 40px 24px;">
      <p style="margin:0 0 2px;font-size:15px;color:#374151;font-family:Arial,sans-serif;">Warm regards,</p>
      <p style="margin:0 0 2px;font-size:16px;font-weight:700;color:#0f4c81;font-family:Arial,sans-serif;">Fintree Finance</p>
      <p style="margin:0 0 20px;font-size:13px;color:#6b7280;font-family:Arial,sans-serif;">Customer Operations Team</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="border-top:1px solid #e5eaf2;padding-bottom:16px;font-size:0;">&nbsp;</td></tr>
      </table>
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.8;text-align:center;font-family:Arial,sans-serif;">
        This is an automated email sent to you as part of your loan application process.<br/>
        If you did not apply for a loan, please ignore this email or contact us at
        <a href="mailto:support@fintreefinance.com" style="color:#2563eb;text-decoration:none;">support@fintreefinance.com</a><br/><br/>
        &copy; ${new Date().getFullYear()} Fintree Finance Pvt. Ltd. &middot; All rights reserved.
      </p>
    </td>
  </tr>

</table>

</td></tr>
</table>

</body>
</html>
`;

  const mailOptions = {
    from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions);
}

async function sendEnachMandateMail({
  to,
  customerName,
  lan,
  mandateUrl,
  amount,
}) {
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
Fintree Finance LMS System
  `.trim();

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to,
    subject,
    text,
  };

  return transporter.sendMail(mailOptions);
}

// 🔐 NEW: Send Reset Password OTP
async function sendResetOtp({ to, otp }) {
  if (!to || !otp) throw new Error("Missing email or OTP");

  const subject = "Your Fintree Password Reset OTP";
  const text = `Your password reset OTP is: ${otp}

This OTP is valid for 10 minutes only. Do not share it with anyone.

If you did not request this, please ignore this email.

Regards,
Fintree Finance`;

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
  sendResetOtp, // 🔐 NEW
};
