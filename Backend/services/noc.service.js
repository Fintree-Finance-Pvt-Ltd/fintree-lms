const {
  sendNocEmail,
} = require("../jobs/mailer");
console.log("sendNocEmail type:", typeof sendNocEmail);
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const db = require("../config/db");

const uploadPath = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, {
    recursive: true,
  });
}

function isValidEmail(email) {
  const normalizedEmail = String(email || "").trim();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    normalizedEmail,
  );
}

async function generateNoc({ lan, baseUrl }) {
  if (!lan) {
    const error = new Error("LAN is required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedLan = String(lan).trim().toUpperCase();

  // Pick loan table same as SOA
  let loanTable = "";
if (normalizedLan.startsWith("WCTLFFPL")) {
  loanTable = "loan_booking_wctl_ffpl";
} else if (normalizedLan.startsWith("GQN")) {
  loanTable = "loan_booking_gq_non_fsf";
}else if (normalizedLan.startsWith("GQN")) {
    loanTable = "loan_booking_gq_non_fsf";
  } else if (normalizedLan.startsWith("GQF")) {
    loanTable = "loan_booking_gq_fsf";
  } else if (normalizedLan.startsWith("ADK")) {
    loanTable = "loan_booking_adikosh";
  } else if (normalizedLan.startsWith("EV")) {
    loanTable = "loan_booking_ev";
  } else if (normalizedLan.startsWith("BL")) {
    loanTable = "loan_bookings";
  } else if (normalizedLan.startsWith("E1")) {
    loanTable = "loan_booking_embifi";
  } else if (normalizedLan.startsWith("FINE")) {
    loanTable = "loan_booking_emiclub";
  } else if (normalizedLan.startsWith("CARE")) {
    loanTable = "loan_booking_carepay";
  } else if (normalizedLan.startsWith("STRL")) {
    loanTable = "loan_booking_sterlion";
  } else if (normalizedLan.startsWith("HEYBF")) {
    loanTable = "loan_booking_hey_ev_battery";
  } else if (normalizedLan.startsWith("HEY")) {
    loanTable = "loan_booking_hey_ev";
  } else if (normalizedLan.startsWith("HEL")) {
    loanTable = "loan_booking_helium";
  } else if (normalizedLan.startsWith("FINS")) {
    loanTable = "loan_booking_finso";
  } else if (normalizedLan.startsWith("CIRF")) {
    loanTable = "loan_booking_circle_pe";
  } else if (normalizedLan.startsWith("MCL")) {
    loanTable = "loan_booking_motion_corp";
  } else if (normalizedLan.startsWith("SPL")) {
    loanTable = "loan_booking_sampada";
  } else if (normalizedLan.startsWith("SFL")) {
    loanTable = "loan_booking_seven_fincorp";
  } else if (normalizedLan.startsWith("BUN")) {
    loanTable = "loan_booking_bundela";
  } else if (normalizedLan.startsWith("LDF")) {
    loanTable = "loan_booking_loan_digit";
  } else if (normalizedLan.startsWith("SML")) {
    loanTable = "loan_booking_switch_my_loan";
  } else if (normalizedLan.startsWith("ZBR")) {
    loanTable = "loan_booking_zebrs";
  } else if (normalizedLan.startsWith("CLY")) {
    loanTable = "loan_booking_clayyo";
  } else if (normalizedLan.startsWith("SH")) {
    loanTable = "loan_booking_srbh";
  } else if (normalizedLan.startsWith("RML")) {
    loanTable = "loan_booking_switch_my_loan";
  }

  if (!loanTable) {
    const error = new Error(
      `Loan table mapping not found for LAN ${normalizedLan}`,
    );
    error.statusCode = 400;
    throw error;
  }

  try {
    const [loanRows] = await db.promise().query(
      `
      SELECT *
      FROM ??
      WHERE lan = ?
      LIMIT 1
      `,
      [loanTable, normalizedLan],
    );

    if (!loanRows.length) {
      const error = new Error("Loan not found for provided LAN");
      error.statusCode = 404;
      throw error;
    }

    const loan = loanRows[0];

    const customerEmail = String(
  loan.email ||
  loan.email_id ||
  loan.customer_email ||
  "",
).trim();

const customerName =
  loan.customer_name ||
  `${loan.first_name || ""} ${loan.last_name || ""}`.trim() ||
  "Customer";

    const allowedStatuses = [
      "fully paid",
      "foreclosed",
      "settled",
    ];

    const statusNorm = String(loan.status || "")
      .trim()
      .toLowerCase();

    if (!allowedStatuses.includes(statusNorm)) {
      const error = new Error(
        "NOC can be generated only when the loan is Fully Paid, Foreclosed, or Settled.",
      );

      error.statusCode = 400;
      error.currentStatus = loan.status || "-";

      throw error;
    }

    const filename = `NOC_${normalizedLan}_${Date.now()}.pdf`;
    const filePath = path.join(uploadPath, filename);

    const fmtDate = (dateValue) => {
      if (!dateValue) return "";

      const date = new Date(dateValue);

      if (Number.isNaN(date.getTime())) {
        return "";
      }

      return date.toLocaleDateString("en-IN");
    };

    const address = [
      loan.address_line_1,
      loan.address_line_2,
      loan.village,
      loan.district,
      loan.state,
      loan.pincode,
    ]
      .filter(Boolean)
      .join(", ");

    // Generate and save PDF
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 50,
      });

      const writeStream = fs.createWriteStream(filePath);

      writeStream.on("finish", resolve);

      writeStream.on("error", (error) => {
        reject(
          new Error(
            `Failed to write NOC PDF: ${error.message}`,
          ),
        );
      });

      doc.on("error", (error) => {
        reject(
          new Error(
            `Failed to generate NOC PDF: ${error.message}`,
          ),
        );
      });

      doc.pipe(writeStream);

      // Header
      const logoPath = path.join(
        __dirname,
        "../public/fintree-logo.png",
      );

      if (fs.existsSync(logoPath)) {
        doc
          .image(logoPath, {
            fit: [120, 120],
            align: "center",
          })
          .moveDown(0.5);
      }

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("No Dues Certificate", {
          align: "center",
        })
        .moveDown(0.8);

      // Body
      doc.font("Helvetica").fontSize(11);

      doc
        .text(`Date: ${fmtDate(new Date())}`)
        .moveDown(0.5);

      doc.text(
        `Name of the Borrower: ${customerName}`,
      );

      doc.text(
        `Ref.: Loan Account Number: ${loan.lan || ""}`,
      );

      doc.text(
        `Ref.: Partner Account Number: ${
          loan.partner_loan_id || ""
        }`,
      );

    //   doc.text(
    //     `Ref.: Partner Loan Account Number: ${
    //       loan.app_id || ""
    //     }`,
    //   );

      doc
        .text(`Address of the Borrower: ${address}`)
        .moveDown(1);

      doc.text("Dear Sir/Madam,").moveDown(0.8);

      const paragraph = (text) => {
        doc
          .text(text, {
            align: "justify",
          })
          .moveDown(0.8);
      };

      paragraph(
        "We would like to thank you for your patronage, and we hope your experience with us has been a rewarding one.",
      );

      paragraph(
        "We are pleased to confirm that there are no outstanding dues towards the captioned loan and the amount disbursed under the said loan account number has been closed in our books. The agreement signed by you in this regard stands terminated.",
      );

      paragraph(
        "We will be happy to welcome you back! Fintree Finance Pvt. Ltd. is a one-stop solution for all financial needs. Our offerings include Consumer Durable Loans, Personal Loans, Vehicle Loans, Business Loans, and Mortgage Loans.",
      );

      paragraph(
        "Thank you once again for selecting Fintree Finance Pvt. Ltd. as your preferred partner in helping you accomplish your financial goals.",
      );

      doc.moveDown(1.2);

      doc.text(
        "For and on behalf of Fintree Finance Pvt. Ltd.",
      );

      doc.moveDown(2);

      doc
        .fontSize(9)
        .text(
          "***This is a system generated letter and does not require a signature***",
          {
            align: "center",
          },
        );

      doc.end();
    });

let emailStatus = "NOT_SENT";
let emailMessageId = null;
let emailError = null;

// Store NOC record in loan_documents
try {
  await db.promise().query(
    `
    INSERT INTO loan_documents
    (
      lan,
      file_name,
      original_name,
      uploaded_at
    )
    VALUES (?, ?, ?, NOW())
    `,
    [
      normalizedLan,
      filename,
      `NOC - ${normalizedLan}`,
    ],
  );

  console.log(
    `✅ NOC document record inserted for LAN ${normalizedLan}`,
  );
} catch (documentError) {
  console.error(
    `❌ loan_documents insert failed for LAN ${normalizedLan}:`,
    documentError.message,
  );

  // Non-fatal because PDF has already been generated
}

// Send NOC email to customer
// if (!customerEmail) {
//   emailStatus = "SKIPPED";
//   emailError = "Customer email is not available";

//   console.warn(
//     `⚠️ NOC generated but email is missing for LAN ${normalizedLan}`,
//   );
// } else if (typeof sendNocEmail !== "function") {
//   emailStatus = "FAILED";
//   emailError =
//     "sendNocEmail is not exported correctly from mailer.js";

//   console.error(`❌ ${emailError}`);
// } else {
//   try {
//     console.log("📧 Sending NOC email", {
//       lan: normalizedLan,
//       recipient: customerEmail,
//       filePath,
//     });

//     const emailResult = await sendNocEmail({
//       to: customerEmail,
//       customerName,
//       lan: normalizedLan,
//       filePath,
//     });

//     emailStatus = "SENT";
//     emailMessageId =
//       emailResult?.messageId || null;

//     console.log("✅ NOC email sent successfully", {
//       lan: normalizedLan,
//       recipient: customerEmail,
//       messageId: emailMessageId,
//     });
//   } catch (mailError) {
//     emailStatus = "FAILED";
//     emailError = mailError.message;

//     console.error(
//       `❌ NOC email failed for LAN ${normalizedLan}:`,
//       mailError,
//     );

//     // Do not throw.
//     // NOC PDF generation remains successful.
//   }
// }


if (!customerEmail) {
  emailStatus = "SKIPPED";
  emailError = "Customer email is not available";

  console.warn(
    `NOC generated but customer email is missing for LAN ${normalizedLan}`,
  );
} else if (!isValidEmail(customerEmail)) {
  emailStatus = "SKIPPED";
  emailError = `Invalid customer email address: ${customerEmail}`;

  console.warn("Invalid customer email", {
    lan: normalizedLan,
    customerEmail,
  });
} else if (typeof sendNocEmail !== "function") {
  emailStatus = "FAILED";
  emailError =
    "sendNocEmail is not exported correctly from mailer.js";
} else {
  try {
    const emailResult = await sendNocEmail({
      to: customerEmail,
      customerName,
      lan: normalizedLan,
      filePath,
    });

    emailStatus = "SENT";
    emailMessageId =
      emailResult?.messageId || null;
  } catch (mailError) {
    emailStatus = "FAILED";
    emailError = mailError.message;

    console.error(
      `NOC email failed for LAN ${normalizedLan}:`,
      mailError,
    );
  }
}
const normalizedBaseUrl = String(baseUrl || "")
  .trim()
  .replace(/\/$/, "");

const fileUrl = normalizedBaseUrl
  ? `${normalizedBaseUrl}/uploads/${filename}`
  : `/uploads/${filename}`;

return {
  success: true,

  message:
    emailStatus === "SENT"
      ? "NOC generated and emailed successfully"
      : emailStatus === "SKIPPED"
        ? "NOC generated, but customer email was not available"
        : "NOC generated, but email sending failed",

  lan: normalizedLan,
  loanTable,
  filename,
  filePath,
  fileUrl,

  email: {
    status: emailStatus,
    recipient: customerEmail || null,
    messageId: emailMessageId,
    error: emailError,
  },
};
  } catch (error) {
    console.error(
      `❌ NOC generation failed for LAN ${normalizedLan}:`,
      {
        message: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
        stack: error.stack,
      },
    );

    throw error;
  }
}


module.exports = {
  generateNoc,
};
