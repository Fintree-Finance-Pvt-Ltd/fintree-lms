// const fs = require("fs");
// const path = require("path");
// const { ToWords } = require("to-words");


// /* ============================================================
//    TO WORDS
// ============================================================ */

// const toWords = new ToWords({
//     localeCode: "en-IN",

//     converterOptions: {
//         currency: false,
//         ignoreDecimal: false,
//         doNotAddOnly: true,
//     },
// });


// /* ============================================================
//    ESCAPE HTML
// ============================================================ */

// function escapeHtml(value) {
//     return String(value ?? "")
//         .replace(/&/g, "&amp;")
//         .replace(/</g, "&lt;")
//         .replace(/>/g, "&gt;")
//         .replace(/"/g, "&quot;")
//         .replace(/'/g, "&#039;");
// }


// /* ============================================================
//    FORMAT AMOUNT
// ============================================================ */

// function formatAmount(amount) {
//     return new Intl.NumberFormat("en-IN", {
//         minimumFractionDigits: 2,
//         maximumFractionDigits: 2,
//     }).format(Number(amount || 0));
// }


// /* ============================================================
//    FORMAT DATE
// ============================================================ */

// function formatDate(value) {
//     if (!value) {
//         return "";
//     }

//     const date = new Date(value);

//     if (Number.isNaN(date.getTime())) {
//         return "";
//     }

//     const day = String(
//         date.getDate()
//     ).padStart(2, "0");

//     const months = [
//         "Jan",
//         "Feb",
//         "Mar",
//         "Apr",
//         "May",
//         "Jun",
//         "Jul",
//         "Aug",
//         "Sep",
//         "Oct",
//         "Nov",
//         "Dec",
//     ];

//     const month =
//         months[date.getMonth()];

//     const year =
//         date.getFullYear();

//     return `${day}-${month}-${year}`;
// }


// /* ============================================================
//    IMAGE MIME TYPE
// ============================================================ */

// function getImageMimeType(filePath) {
//     const extension = path
//         .extname(filePath || "")
//         .toLowerCase();

//     switch (extension) {
//         case ".jpg":
//         case ".jpeg":
//             return "image/jpeg";

//         case ".webp":
//             return "image/webp";

//         case ".svg":
//             return "image/svg+xml";

//         default:
//             return "image/png";
//     }
// }


// /* ============================================================
//    IMAGE TO BASE64
// ============================================================ */

// function imageToBase64(filePath) {
//     try {
//         if (!filePath) {
//             console.warn(
//                 "Receipt logo path is empty"
//             );

//             return "";
//         }

//         if (!fs.existsSync(filePath)) {
//             console.warn(
//                 "Fintree logo not found:",
//                 filePath
//             );

//             return "";
//         }

//         const imageBuffer =
//             fs.readFileSync(filePath);

//         const mimeType =
//             getImageMimeType(filePath);

//         return `data:${mimeType};base64,${imageBuffer.toString(
//             "base64"
//         )}`;
//     } catch (error) {
//         console.error(
//             "Unable to read Fintree logo:",
//             error
//         );

//         return "";
//     }
// }


// /* ============================================================
//    AMOUNT IN WORDS
// ============================================================ */

// function amountInWords(amount) {
//     try {
//         const value =
//             Number(amount);

//         if (!Number.isFinite(value)) {
//             return "";
//         }

//         const words =
//             toWords.convert(value);

//         return `${words} Only`;
//     } catch (error) {
//         console.error(
//             "Amount to words error:",
//             error
//         );

//         return "";
//     }
// }


// /* ============================================================
//    BUILD ONE RECEIPT COPY

//    Used for:
//    1. CUSTOMER COPY
//    2. FINANCIER COPY
// ============================================================ */

// function buildReceiptCopy(
//     receipt,
//     config,
//     copyName,
//     logoDataUri
// ) {
//     const words =
//         amountInWords(
//             receipt.amount
//         );

//     return `

//     <section class="receipt-copy">

//       <!-- COPY NAME -->

//       <div class="copy-name">
//         ${escapeHtml(copyName)}
//       </div>


//       <!-- HEADER -->

//       <div class="header">

//         <div class="logo-section">

//           ${logoDataUri
//             ? `
//                 <img
//                   src="${logoDataUri}"
//                   alt="Fintree Logo"
//                   class="logo"
//                 />
//               `
//             : ""
//         }

//           <div class="branch-name">
//             <strong>
//               Branch:
//             </strong>

//             ${escapeHtml(
//             config.branchName || ""
//         )}
//           </div>

//         </div>


//         <div class="company-section">

//           <div class="company-name">

//             ${escapeHtml(
//             config.legalName || ""
//         )}

//           </div>


//           <div class="company-address">

//             ${escapeHtml(
//             config.branchAddress || ""
//         )}

//           </div>


//           <div class="company-email">

//             ${escapeHtml(
//             config.email || ""
//         )}

//           </div>


//           <div class="registration">

//             <span>

//               GSTIN/UIN No.:

//               ${escapeHtml(
//             config.gstin || ""
//         )}

//             </span>


//             <span>

//               CIN No.:

//               ${escapeHtml(
//             config.cin || ""
//         )}

//             </span>

//           </div>

//         </div>

//       </div>


//       <!-- HEADER ACCOUNT -->

//       <table class="basic-table">

//         <tr>

//           <td>

//             <strong>
//               Header Account :
//             </strong>

//             ${escapeHtml(
//             config.headerAccount ||
//             ""
//         )}

//           </td>


//           <td class="right">

//             <strong>
//               Location :
//             </strong>

//             ${escapeHtml(
//             config.location ||
//             config.branchName ||
//             ""
//         )}

//           </td>

//         </tr>

//       </table>


//       <!-- RECEIPT INFORMATION -->

//       <table class="basic-table receipt-info">

//         <tr>

//           <td>

//             <strong>
//               Receipt No. :
//             </strong>

//             ${escapeHtml(
//             receipt.receipt_no ||
//             ""
//         )}

//           </td>


//           <td class="center">

//             <strong>
//               Payment ID :
//             </strong>

//             ${escapeHtml(
//             receipt.payment_id ||
//             ""
//         )}

//           </td>


//           <td class="right">

//             <strong>
//               Dated :
//             </strong>

//             ${escapeHtml(
//             formatDate(
//                 receipt.receipt_date
//             )
//         )}

//           </td>

//         </tr>

//       </table>


//       <!-- RECEIVED AMOUNT -->

//       <div class="received-row">

//         <strong>
//           Received a Sum of
//         </strong>

//         &nbsp;&nbsp;

//         <span class="amount">

//           ₹${formatAmount(
//             receipt.amount
//         )}

//         </span>

//         &nbsp;&nbsp;

//         <span>

//           (
//           ${escapeHtml(words)}
//           )

//         </span>

//       </div>


//       <!-- PROVISIONAL RECEIPT -->

//       <div class="provisional-row">

//         <span>

//           <strong>
//             In Lieu of Provisional Receipt
//             (if issued) No.
//           </strong>

//         </span>

//         <span>

//           <strong>
//             Dated:
//           </strong>

//         </span>

//       </div>


//       <!-- ACCOUNT DETAILS -->

//       <table class="account-table">

//         <thead>

//           <tr>

//             <th>
//               Account Head
//             </th>

//             <th>
//               Sub Account
//             </th>

//             <th class="right">
//               Credit
//             </th>

//           </tr>

//         </thead>


//         <tbody>

//           <tr>

//             <td>

//               ${escapeHtml(
//             config.accountHead ||
//             receipt.product ||
//             receipt.lender_type ||
//             "Installment (LAP)"
//         )}

//             </td>


//             <td>

//               ${escapeHtml(
//             receipt.loan_account_number ||
//             receipt.lan ||
//             ""
//         )}

//               /

//               ${escapeHtml(
//             receipt.customer_name ||
//             ""
//         )}

//             </td>


//             <td class="right">

//               ${formatAmount(
//             receipt.amount
//         )}

//             </td>

//           </tr>


//           <tr class="total-row">

//             <td></td>

//             <td class="right">

//               <strong>
//                 Total
//               </strong>

//             </td>

//             <td class="right">

//               <strong>

//                 ${formatAmount(
//             receipt.amount
//         )}

//               </strong>

//             </td>

//           </tr>

//         </tbody>

//       </table>


//       <!-- PAYMENT INFORMATION -->

//       <div class="payment-details">

//         <div>

//           <strong>
//             Payment ID :
//           </strong>

//           ${escapeHtml(
//             receipt.payment_id ||
//             ""
//         )}

//           <br/>

//           <strong>
//             LAN :
//           </strong>

//           ${escapeHtml(
//             receipt.lan ||
//             ""
//         )}

//           <br/>

//           <strong>
//             Customer :
//           </strong>

//           ${escapeHtml(
//             receipt.customer_name ||
//             ""
//         )}

//         </div>


//         <div>

//           <strong>
//             Product :
//           </strong>

//           ${escapeHtml(
//             receipt.product ||
//             ""
//         )}

//           <br/>

//           <strong>
//             Lender :
//           </strong>

//           ${escapeHtml(
//             receipt.lender ||
//             ""
//         )}

//         </div>

//       </div>


//       <!-- AUTHORIZED -->

//       <div class="authorized">

//         <div>
//           <strong>
//             User :
//           </strong>

//           System
//         </div>


//         <div class="right">

//           <strong>
//             Authorized By :
//           </strong>

//         </div>

//       </div>


//       <!-- SIGNATURE -->

//       <div class="signatures">

//         <div>
//           Payee's Sign
//         </div>

//         <div>
//           Cashier
//         </div>

//         <div>
//           Exec./Sect. Incharge
//         </div>

//         <div>
//           Manager
//         </div>

//         <div>
//           Director
//         </div>

//       </div>


//       <!-- NOTE -->

//       <div class="notes">

//         <strong>
//           Note:
//         </strong>

//         &nbsp;

//         (1) Receipt cancels and supersedes
//         provisional receipt

//         &nbsp;&nbsp;

//         (2) Subject to encashment of cheque

//       </div>

//     </section>

//   `;
// }


// /* ============================================================
//    BUILD COMPLETE PDF HTML
// ============================================================ */

// function buildPaymentReceiptHtml(
//     receipt,
//     config
// ) {
//     const logoDataUri =
//         imageToBase64(
//             config.logoPath
//         );

//     const customerCopy =
//         buildReceiptCopy(
//             receipt,
//             config,
//             "CUSTOMER COPY",
//             logoDataUri
//         );

//     const financierCopy =
//         buildReceiptCopy(
//             receipt,
//             config,
//             "FINANCIER COPY",
//             logoDataUri
//         );


//     return `

// <!DOCTYPE html>

// <html lang="en">

// <head>

//   <meta charset="UTF-8">

//   <title>
//     ${escapeHtml(
//         receipt.receipt_no ||
//         "Payment Receipt"
//     )}
//   </title>


//   <style>

//     @page {
//       size: A4;
//       margin: 7mm;
//     }


//     * {
//       box-sizing: border-box;
//     }


//     body {
//       margin: 0;
//       padding: 0;

//       font-family:
//         Arial,
//         Helvetica,
//         sans-serif;

//       color: #000;

//       background: #fff;

//       font-size: 10px;
//     }


//     .receipt-copy {
//       position: relative;

//       width: 100%;

//       min-height: 132mm;

//       overflow: hidden;
//     }


//     .copy-name {
//       text-align: right;

//       font-size: 10px;

//       font-weight: 700;

//       margin-bottom: 4px;
//     }


//     /* HEADER */

//     .header {
//       display: flex;

//       align-items: center;

//       width: 100%;

//       min-height: 58px;
//     }


//     .logo-section {
//       width: 145px;

//       min-width: 145px;
//     }


//     .logo {
//       width: 105px;

//       max-height: 50px;

//       object-fit: contain;

//       object-position:
//         left center;
//     }


//     .branch-name {
//       font-size: 9px;

//       margin-top: 2px;
//     }


//     .company-section {
//       flex: 1;

//       text-align: center;

//       padding-right: 145px;
//     }


//     .company-name {
//       font-size: 21px;

//       font-weight: 700;

//       margin-bottom: 2px;
//     }


//     .company-address,
//     .company-email,
//     .registration {
//       font-size: 9px;

//       line-height: 1.4;
//     }


//     .registration {
//       margin-top: 2px;
//     }


//     .registration span {
//       margin:
//         0
//         5px;
//     }


//     /* TABLES */

//     table {
//       width: 100%;

//       border-collapse:
//         collapse;
//     }


//     .basic-table {
//       border-top:
//         1px solid #000;

//       border-bottom:
//         1px solid #000;
//     }


//     .basic-table td {
//       padding:
//         3px
//         2px;
//     }


//     .receipt-info td {
//       width: 33.33%;
//     }


//     /* AMOUNT */

//     .received-row {
//       display: flex;

//       align-items: center;

//       min-height: 25px;

//       padding:
//         4px
//         2px;

//       border-bottom:
//         1px solid #000;
//     }


//     .received-row .amount {
//       font-weight: 700;
//     }


//     /* PROVISIONAL */

//     .provisional-row {
//       display: flex;

//       justify-content:
//         space-between;

//       padding:
//         3px
//         2px;

//       border-bottom:
//         1px solid #000;
//     }


//     /* ACCOUNT TABLE */

//     .account-table thead {
//       border-bottom:
//         1px solid #000;
//     }


//     .account-table th {
//       text-align: left;

//       padding:
//         4px
//         2px;
//     }


//     .account-table td {
//       padding:
//         5px
//         2px;
//     }


//     .account-table th:nth-child(1),
//     .account-table td:nth-child(1) {
//       width: 40%;
//     }


//     .account-table th:nth-child(2),
//     .account-table td:nth-child(2) {
//       width: 45%;
//     }


//     .account-table th:nth-child(3),
//     .account-table td:nth-child(3) {
//       width: 15%;
//     }


//     .total-row {
//       border-top:
//         1px solid #000;
//     }


//     /* PAYMENT DETAILS */

//     .payment-details {
//       display: grid;

//       grid-template-columns:
//         1fr
//         1fr;

//       gap: 20px;

//       border-top:
//         1px solid #000;

//       padding:
//         7px
//         2px;

//       line-height: 1.5;
//     }


//     /* AUTH */

//     .authorized {
//       display: grid;

//       grid-template-columns:
//         1fr
//         1fr;

//       border-bottom:
//         2px solid #000;

//       padding:
//         4px
//         2px;
//     }


//     /* SIGNATURE */

//     .signatures {
//       display: grid;

//       grid-template-columns:
//         repeat(
//           5,
//           1fr
//         );

//       text-align: center;

//       font-weight: 700;

//       padding-top: 38px;

//       padding-bottom: 16px;
//     }


//     /* NOTES */

//     .notes {
//       font-size: 8.5px;
//     }


//     .right {
//       text-align:
//         right !important;
//     }


//     .center {
//       text-align:
//         center !important;
//     }


//     /* CUSTOMER / FINANCIER SEPARATOR */

//     .copy-separator {
//       border: 0;

//       border-top:
//         1px dashed #555;

//       margin:
//         2mm
//         0;
//     }

//   </style>

// </head>


// <body>

//   ${customerCopy}


//   <hr class="copy-separator">


//   ${financierCopy}


// </body>

// </html>

//   `;
// }


// /* ============================================================
//    EXPORT
// ============================================================ */

// module.exports = {
//     buildPaymentReceiptHtml,
// };








const fs = require("fs");
const path = require("path");
// const { ToWords } = require("to-words");

let ToWords;

try {
  const toWordsPackage = require("to-words");

  ToWords =
    toWordsPackage.ToWords ||
    toWordsPackage.default ||
    toWordsPackage;

} catch (error) {
  console.error("Unable to load to-words package:", error.message);
}
/* ============================================================
   TO WORDS
============================================================ */

// const toWords = new ToWords({
//   localeCode: "en-IN",

//   converterOptions: {
//     currency: false,
//     ignoreDecimal: false,
//     doNotAddOnly: true,
//   },
// });


const toWords = ToWords
  ? new ToWords({
      localeCode: "en-IN",

      converterOptions: {
        currency: false,
        ignoreDecimal: false,
        doNotAddOnly: true,
      },
    })
  : null;

/* ============================================================
   ESCAPE HTML
============================================================ */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* ============================================================
   FORMAT AMOUNT
============================================================ */

function formatAmount(amount) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}


/* ============================================================
   FORMAT DATE
============================================================ */

function formatDate(value) {
  if (!value) {
    return "";
  }

  const cleanValue =
    String(value).trim();


  /*
    Handles:
    2026-09-07

    without timezone conversion.
  */
  const match =
    cleanValue.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );


  if (match) {
    const year =
      match[1];

    const monthNumber =
      Number(match[2]);

    const day =
      match[3];


    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];


    const month =
      months[
        monthNumber - 1
      ];


    if (!month) {
      return cleanValue;
    }


    return `${day}-${month}-${year}`;
  }


  return cleanValue;
}


/* ============================================================
   IMAGE MIME TYPE
============================================================ */

function getImageMimeType(filePath) {
  const extension = path
    .extname(filePath || "")
    .toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";

    case ".webp":
      return "image/webp";

    case ".svg":
      return "image/svg+xml";

    default:
      return "image/png";
  }
}


/* ============================================================
   IMAGE TO BASE64
============================================================ */

function imageToBase64(filePath) {
  try {
    if (!filePath) {
      console.warn(
        "Receipt logo path is empty"
      );

      return "";
    }

    if (!fs.existsSync(filePath)) {
      console.warn(
        "Fintree logo not found:",
        filePath
      );

      return "";
    }

    const imageBuffer =
      fs.readFileSync(filePath);

    const mimeType =
      getImageMimeType(filePath);

    return `data:${mimeType};base64,${imageBuffer.toString(
      "base64"
    )}`;
  } catch (error) {
    console.error(
      "Unable to read Fintree logo:",
      error
    );

    return "";
  }
}


/* ============================================================
   AMOUNT IN WORDS
============================================================ */

function amountInWords(amount) {
  try {
    const value =
      Number(amount);

    if (!Number.isFinite(value)) {
      return "";
    }

    // const words =
    //   toWords.convert(value);

    if (!toWords) {
  return "";
}

const words = toWords.convert(value);

    return `${words} Only`;
  } catch (error) {
    console.error(
      "Amount to words error:",
      error
    );

    return "";
  }
}


/* ============================================================
   BUILD SINGLE RECEIPT COPY
============================================================ */

function buildReceiptCopy(
  receipt,
  config,
  copyName,
  logoDataUri
) {
  const words =
    amountInWords(
      receipt.amount
    );

  return `

<section class="receipt-copy">

  <!-- ======================================================
       MODERN FINTREE HEADER
  ======================================================= -->

  <div class="modern-header">

    <div class="header-accent"></div>


    <div class="header-main">

      <!-- FINTREE LOGO -->

      <div class="header-logo-section">

        ${
          logoDataUri
            ? `
              <img
                src="${logoDataUri}"
                alt="Fintree Finance"
                class="header-logo"
              />
            `
            : `
              <div class="logo-fallback">
                FINTREE
              </div>
            `
        }

        <div class="brand-tagline">
          FINANCE
        </div>

      </div>


      <!-- COMPANY -->

      <div class="header-company-section">

        <div class="header-company-name">

          ${escapeHtml(
            config.legalName ||
            "Fintree Finance Pvt. Ltd."
          )}

        </div>


        <div class="receipt-title-pill">
          PAYMENT RECEIPT
        </div>


        <div class="header-address">

          ${escapeHtml(
            config.branchAddress ||
            "Engineering Centre, 4th Floor, 9 Matthew Road, Opera House, Mumbai - 400004"
          )}

        </div>


        ${
          config.email
            ? `
              <div class="header-email">
                ${escapeHtml(
                  config.email
                )}
              </div>
            `
            : ""
        }

      </div>


      <!-- COPY TYPE -->

      <div class="header-copy-section">

        <div class="copy-badge">
          ${escapeHtml(
            copyName
          )}
        </div>


        <div class="receipt-number-box">

          <div class="mini-label">
            RECEIPT NO.
          </div>

          <div class="mini-value">
            ${escapeHtml(
              receipt.receipt_no ||
              "-"
            )}
          </div>

        </div>

      </div>

    </div>


    <!-- GST / CIN / LOCATION -->

    <div class="company-info-strip">

      <div class="info-item">

        <span class="info-icon">
          GST
        </span>

        <div>

          <div class="info-label">
            GSTIN
          </div>

          <div class="info-value">
            ${escapeHtml(
              config.gstin ||
              "-"
            )}
          </div>

        </div>

      </div>


      <div class="info-item">

        <span class="info-icon">
          CIN
        </span>

        <div>

          <div class="info-label">
            CIN
          </div>

          <div class="info-value">
            ${escapeHtml(
              config.cin ||
              "-"
            )}
          </div>

        </div>

      </div>


      <div class="info-item">

        <span class="info-icon">
          LOC
        </span>

        <div>

          <div class="info-label">
            LOCATION
          </div>

          <div class="info-value">
            ${escapeHtml(
              config.location ||
              config.branchName ||
              "Mumbai"
            )}
          </div>

        </div>

      </div>

    </div>

  </div>


  <!-- ======================================================
       RECEIPT QUICK SUMMARY
  ======================================================= -->

  <div class="receipt-summary">

    <div class="summary-card">

      <div class="summary-label">
        LAN
      </div>

      <div class="summary-value">
        ${escapeHtml(
          receipt.lan ||
          "-"
        )}
      </div>

    </div>


    <div class="summary-card">

      <div class="summary-label">
        PAYMENT ID
      </div>

      <div class="summary-value">
        ${escapeHtml(
          receipt.payment_id ||
          "-"
        )}
      </div>

    </div>


    <div class="summary-card">

  <div class="summary-label">
    PAYMENT DATE
  </div>

  <div class="summary-value">

    ${escapeHtml(
      formatDate(
        receipt.payment_date ||
        receipt.receipt_date
      )
    )}

  </div>

</div>

  </div>


  <!-- ======================================================
       HEADER ACCOUNT
  ======================================================= -->

  <div class="account-header-strip">

    <div>

      <span class="strip-label">
        Header Account
      </span>

      <span class="strip-value">
        ${escapeHtml(
          config.headerAccount ||
          ""
        )}
      </span>

    </div>


    <div>

      <span class="strip-label">
        Partner
      </span>

      <span class="strip-value">
        ${escapeHtml(
          config.partnerName ||
          "Saswat"
        )}
      </span>

    </div>

  </div>


  <!-- ======================================================
       RECEIVED AMOUNT
  ======================================================= -->

  <div class="amount-section">

    <div class="amount-title">
      Amount Received
    </div>


    <div class="amount-main">

      ₹${formatAmount(
        receipt.amount
      )}

    </div>


    <div class="amount-words">

      ${escapeHtml(
        words
      )}

    </div>

  </div>


  <!-- ======================================================
       CUSTOMER INFORMATION
  ======================================================= -->

  <div class="customer-section">

    <div class="section-heading">
      Payment Details
    </div>


    <div class="customer-grid">

      <div class="detail-item">

        <div class="detail-label">
          Customer Name
        </div>

        <div class="detail-value">
          ${escapeHtml(
            receipt.customer_name ||
            "-"
          )}
        </div>

      </div>


      <div class="detail-item">

        <div class="detail-label">
          Loan Account Number
        </div>

        <div class="detail-value">
          ${escapeHtml(
            receipt.loan_account_number ||
            receipt.lan ||
            "-"
          )}
        </div>

      </div>


      <div class="detail-item">

        <div class="detail-label">
          Product
        </div>

        <div class="detail-value">
          ${escapeHtml(
            receipt.product ||
            receipt.lender_type ||
            "-"
          )}
        </div>

      </div>


      <div class="detail-item">

        <div class="detail-label">
          Lender
        </div>

        <div class="detail-value">
          ${escapeHtml(
            receipt.lender ||
            "-"
          )}
        </div>

      </div>

    </div>

  </div>


  <!-- ======================================================
       ACCOUNT TABLE
  ======================================================= -->

  <table class="account-table">

    <thead>

      <tr>

        <th>
          Account Head
        </th>

        <th>
          Sub Account
        </th>

        <th class="right">
          Credit
        </th>

      </tr>

    </thead>


    <tbody>

      <tr>

        <td>

          ${escapeHtml(
            config.accountHead ||
            receipt.product ||
            receipt.lender_type ||
            "Installment (LAP)"
          )}

        </td>


        <td>

          ${escapeHtml(
            receipt.loan_account_number ||
            receipt.lan ||
            ""
          )}

          /

          ${escapeHtml(
            receipt.customer_name ||
            ""
          )}

        </td>


        <td class="right">

          ₹${formatAmount(
            receipt.amount
          )}

        </td>

      </tr>


      <tr class="total-row">

        <td></td>

        <td class="right">

          <strong>
            Total
          </strong>

        </td>

        <td class="right total-amount">

          ₹${formatAmount(
            receipt.amount
          )}

        </td>

      </tr>

    </tbody>

  </table>


  <!-- ======================================================
       SYSTEM / AUTHORIZED
  ======================================================= -->

  <div class="authorization-strip">

    <div>

      <span class="authorization-label">
        Generated By
      </span>

      <span class="authorization-value">
        System
      </span>

    </div>


    <div class="right">

      <span class="authorization-label">
        Authorized By
      </span>

      <span class="authorization-value">
        __________________
      </span>

    </div>

  </div>


  <!-- ======================================================
       SIGNATURES
  ======================================================= -->

  <div class="signatures">

    <div class="signature-item">

      <div class="signature-line"></div>

      Payee's Sign

    </div>


    <div class="signature-item">

      <div class="signature-line"></div>

      Cashier

    </div>


    <div class="signature-item">

      <div class="signature-line"></div>

      Exec./Sect. Incharge

    </div>


    <div class="signature-item">

      <div class="signature-line"></div>

      Manager

    </div>


    <div class="signature-item">

      <div class="signature-line"></div>

      Director

    </div>

  </div>


  <!-- ======================================================
       FOOTER NOTE
  ======================================================= -->

  <div class="receipt-footer">

    <div class="footer-icon">
      i
    </div>

    <div>

      <strong>
        Note:
      </strong>

      This is a computer-generated payment receipt.

      Receipt is subject to realization of payment.

    </div>

  </div>

</section>

  `;
}


/* ============================================================
   BUILD COMPLETE PDF
============================================================ */

function buildPaymentReceiptHtml(
  receipt,
  config
) {
  const logoDataUri =
    imageToBase64(
      config.logoPath
    );


  const customerCopy =
    buildReceiptCopy(
      receipt,
      config,
      "CUSTOMER COPY",
      logoDataUri
    );


  const financierCopy =
    buildReceiptCopy(
      receipt,
      config,
      "FINANCIER COPY",
      logoDataUri
    );


  return `

<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<title>
  ${escapeHtml(
    receipt.receipt_no ||
    "Payment Receipt"
  )}
</title>


<style>

/* ============================================================
   PAGE
============================================================ */

@page {
  size: A4;
  margin: 6mm;
}


* {
  box-sizing: border-box;
}


html,
body {
  margin: 0;
  padding: 0;

  background: #ffffff;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  color: #172033;

  font-size: 9px;

  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}


/* ============================================================
   RECEIPT COPY
============================================================ */

.receipt-copy {
  width: 100%;

  min-height: 133mm;

  page-break-inside: avoid;

  overflow: hidden;
}


/* ============================================================
   MODERN HEADER
============================================================ */

.modern-header {
  width: 100%;

  border:
    1px solid #d7e1ea;

  border-radius:
    8px;

  overflow:
    hidden;

  background:
    #ffffff;

  margin-bottom:
    6px;
}


.header-accent {
  height: 5px;

  background:
    linear-gradient(
      90deg,
      #143c61 0%,
      #1e5e90 55%,
      #2d82b7 100%
    );
}


.header-main {
  display: grid;

  grid-template-columns:
    130px
    1fr
    145px;

  min-height:
    78px;

  align-items:
    center;

  padding:
    8px 10px;
}


/* LOGO */

.header-logo-section {
  min-height:
    58px;

  display:
    flex;

  flex-direction:
    column;

  justify-content:
    center;

  align-items:
    flex-start;

  padding-right:
    12px;

  border-right:
    1px solid #e2e8f0;
}


.header-logo {
  width:
    105px;

  max-height:
    44px;

  object-fit:
    contain;

  object-position:
    left center;
}


.logo-fallback {
  color:
    #143c61;

  font-size:
    19px;

  font-weight:
    900;

  letter-spacing:
    1px;
}


.brand-tagline {
  margin-top:
    2px;

  margin-left:
    2px;

  color:
    #718096;

  font-size:
    6px;

  font-weight:
    800;

  letter-spacing:
    3px;
}


/* COMPANY */

.header-company-section {
  min-width: 0;

  text-align:
    center;

  padding:
    0 14px;
}


.header-company-name {
  color:
    #173955;

  font-size:
    19px;

  font-weight:
    800;

  line-height:
    1.1;
}


.receipt-title-pill {
  display:
    inline-block;

  margin-top:
    4px;

  padding:
    2px 11px;

  border-radius:
    20px;

  background:
    #eaf3fa;

  color:
    #1e5d8c;

  font-size:
    7px;

  font-weight:
    800;

  letter-spacing:
    1.2px;
}


.header-address {
  max-width:
    400px;

  margin:
    5px auto
    0;

  color:
    #52606d;

  font-size:
    8px;

  line-height:
    1.35;
}


.header-email {
  margin-top:
    2px;

  color:
    #607284;

  font-size:
    7.5px;
}


/* COPY */

.header-copy-section {
  min-width: 0;

  min-height:
    58px;

  display:
    flex;

  flex-direction:
    column;

  justify-content:
    center;

  align-items:
    flex-end;

  padding-left:
    12px;

  border-left:
    1px solid #e2e8f0;
}


.copy-badge {
  padding:
    5px 10px;

  border-radius:
    20px;

  background:
    #173f63;

  color:
    #ffffff;

  font-size:
    7px;

  font-weight:
    800;

  letter-spacing:
    0.6px;

  white-space:
    nowrap;
}


.receipt-number-box {
  margin-top:
    7px;

  text-align:
    right;
}


.mini-label {
  color:
    #7b8794;

  font-size:
    6px;

  font-weight:
    800;

  letter-spacing:
    0.7px;
}


.mini-value {
  max-width:
    140px;

  margin-top:
    2px;

  overflow-wrap:
    anywhere;

  color:
    #152c42;

  font-size:
    7px;

  font-weight:
    700;
}


/* INFO STRIP */

.company-info-strip {
  display:
    grid;

  grid-template-columns:
    1fr
    1.25fr
    0.7fr;

  border-top:
    1px solid #e5edf3;

  background:
    #f7fafc;
}


.info-item {
  min-width: 0;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  gap:
    6px;

  min-height:
    32px;

  padding:
    4px 8px;

  border-right:
    1px solid #e5edf3;
}


.info-item:last-child {
  border-right:
    none;
}


.info-icon {
  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  min-width:
    27px;

  height:
    20px;

  padding:
    0 4px;

  border-radius:
    4px;

  background:
    #e8f0f6;

  color:
    #315d7e;

  font-size:
    5.5px;

  font-weight:
    900;
}


.info-label {
  color:
    #7a8996;

  font-size:
    5.5px;

  font-weight:
    700;

  letter-spacing:
    0.5px;
}


.info-value {
  margin-top:
    1px;

  color:
    #273b4d;

  font-size:
    7px;

  font-weight:
    700;

  overflow-wrap:
    anywhere;
}


/* ============================================================
   SUMMARY CARDS
============================================================ */

.receipt-summary {
  display:
    grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap:
    5px;

  margin-bottom:
    5px;
}


.summary-card {
  min-width:
    0;

  padding:
    5px 8px;

  border:
    1px solid #e2e8f0;

  border-radius:
    6px;

  background:
    #fbfcfd;
}


.summary-label {
  color:
    #7a8996;

  font-size:
    5.5px;

  font-weight:
    800;

  letter-spacing:
    0.7px;
}


.summary-value {
  margin-top:
    2px;

  color:
    #18334a;

  font-size:
    8px;

  font-weight:
    700;

  overflow-wrap:
    anywhere;
}


/* ============================================================
   HEADER ACCOUNT STRIP
============================================================ */

.account-header-strip {
  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap:
    12px;

  padding:
    4px 8px;

  border:
    1px solid #e2e8f0;

  border-radius:
    5px;

  background:
    #f8fafc;

  margin-bottom:
    5px;
}


.strip-label {
  margin-right:
    5px;

  color:
    #7a8996;

  font-size:
    6px;

  font-weight:
    700;
}


.strip-value {
  color:
    #24394c;

  font-size:
    7.5px;

  font-weight:
    700;
}


/* ============================================================
   AMOUNT
============================================================ */

.amount-section {
  display:
    grid;

  grid-template-columns:
    100px
    125px
    1fr;

  align-items:
    center;

  min-height:
    31px;

  padding:
    5px 9px;

  margin-bottom:
    5px;

  border-radius:
    6px;

  background:
    linear-gradient(
      90deg,
      #f4f8fb,
      #fbfdff
    );

  border:
    1px solid #dfe9f0;
}


.amount-title {
  color:
    #657784;

  font-size:
    7px;

  font-weight:
    800;

  text-transform:
    uppercase;

  letter-spacing:
    0.5px;
}


.amount-main {
  color:
    #173e5f;

  font-size:
    14px;

  font-weight:
    900;
}


.amount-words {
  color:
    #536574;

  font-size:
    7px;

  font-style:
    italic;
}


/* ============================================================
   PAYMENT DETAILS
============================================================ */

.customer-section {
  margin-bottom:
    5px;

  border:
    1px solid #e4eaf0;

  border-radius:
    6px;

  overflow:
    hidden;
}


.section-heading {
  padding:
    4px 8px;

  background:
    #f4f7f9;

  border-bottom:
    1px solid #e4eaf0;

  color:
    #30485c;

  font-size:
    7px;

  font-weight:
    800;

  text-transform:
    uppercase;

  letter-spacing:
    0.6px;
}


.customer-grid {
  display:
    grid;

  grid-template-columns:
    repeat(4, 1fr);
}


.detail-item {
  min-width:
    0;

  padding:
    5px 7px;

  border-right:
    1px solid #edf1f4;
}


.detail-item:last-child {
  border-right:
    none;
}


.detail-label {
  color:
    #8895a2;

  font-size:
    5.5px;

  font-weight:
    700;

  text-transform:
    uppercase;
}


.detail-value {
  margin-top:
    2px;

  color:
    #273a4b;

  font-size:
    7.5px;

  font-weight:
    700;

  overflow-wrap:
    anywhere;
}


/* ============================================================
   ACCOUNT TABLE
============================================================ */

.account-table {
  width:
    100%;

  border-collapse:
    collapse;

  margin-bottom:
    5px;

  border:
    1px solid #dfe6ec;
}


.account-table thead {
  background:
    #eef4f8;
}


.account-table th {
  padding:
    5px 7px;

  border-bottom:
    1px solid #dce5eb;

  color:
    #345065;

  font-size:
    6.5px;

  font-weight:
    800;

  text-align:
    left;

  text-transform:
    uppercase;

  letter-spacing:
    0.4px;
}


.account-table td {
  padding:
    6px 7px;

  color:
    #2f4150;

  font-size:
    7.5px;

  vertical-align:
    top;
}


.account-table th:nth-child(1),
.account-table td:nth-child(1) {
  width:
    32%;
}


.account-table th:nth-child(2),
.account-table td:nth-child(2) {
  width:
    50%;
}


.account-table th:nth-child(3),
.account-table td:nth-child(3) {
  width:
    18%;
}


.total-row {
  border-top:
    1px solid #dce5eb;

  background:
    #fafcfd;
}


.total-amount {
  color:
    #173e5f !important;

  font-weight:
    900;
}


/* ============================================================
   AUTHORIZATION
============================================================ */

.authorization-strip {
  display:
    grid;

  grid-template-columns:
    1fr
    1fr;

  align-items:
    center;

  padding:
    4px 7px;

  border-top:
    1px solid #e1e7ec;

  border-bottom:
    1px solid #e1e7ec;

  background:
    #fbfcfd;
}


.authorization-label {
  margin-right:
    5px;

  color:
    #84909a;

  font-size:
    6px;

  font-weight:
    700;

  text-transform:
    uppercase;
}


.authorization-value {
  color:
    #32495b;

  font-size:
    7px;

  font-weight:
    700;
}


/* ============================================================
   SIGNATURE
============================================================ */

.signatures {
  display:
    grid;

  grid-template-columns:
    repeat(5, 1fr);

  gap:
    8px;

  margin-top:
    11px;

  margin-bottom:
    6px;
}


.signature-item {
  color:
    #44596a;

  font-size:
    6.5px;

  font-weight:
    700;

  text-align:
    center;
}


.signature-line {
  height:
    14px;

  margin-bottom:
    3px;

  border-bottom:
    1px solid #9ba8b3;
}


/* ============================================================
   FOOTER
============================================================ */

.receipt-footer {
  display:
    flex;

  align-items:
    center;

  gap:
    6px;

  padding:
    4px 7px;

  border-radius:
    5px;

  background:
    #f6f9fb;

  border:
    1px solid #e5ebf0;

  color:
    #637482;

  font-size:
    6px;
}


.footer-icon {
  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  width:
    16px;

  height:
    16px;

  border-radius:
    50%;

  background:
    #e3edf4;

  color:
    #315b79;

  font-size:
    9px;

  font-weight:
    900;
}


/* ============================================================
   COMMON
============================================================ */

.right {
  text-align:
    right !important;
}


.center {
  text-align:
    center !important;
}


/* ============================================================
   CUSTOMER / FINANCIER SEPARATOR
============================================================ */

.copy-separator {
  border:
    none;

  border-top:
    1px dashed #9aa7b2;

  margin:
    2mm
    0;
}


.copy-separator-label {
  text-align:
    center;

  font-size:
    6px;

  color:
    #8b98a4;
}


/* ============================================================
   PRINT
============================================================ */

@media print {

  .modern-header,
  .summary-card,
  .amount-section,
  .account-table,
  .customer-section,
  .receipt-footer {
    break-inside:
      avoid;
  }

}

</style>

</head>


<body>


${customerCopy}


<div class="copy-separator-label">
  ✂ CUSTOMER COPY / FINANCIER COPY
</div>

<hr class="copy-separator">


${financierCopy}


</body>

</html>

  `;
}


/* ============================================================
   EXPORT
============================================================ */

module.exports = {
  buildPaymentReceiptHtml,
};