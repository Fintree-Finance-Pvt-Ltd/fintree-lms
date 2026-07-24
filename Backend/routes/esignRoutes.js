const express = require("express");
const db = require("../config/db");
const dayjs = require("dayjs");
const puppeteer = require("puppeteer");
const authenticateUser = require("../middleware/verifyToken");
const fs = require("fs");
const path = require("path");

const {
  generateSanctionLetterPdf,
  generateAgreementPdf,
} = require("../services/pdfGenerationService");
const { initDoqfyEsign } = require("../services/doqfyEsignService");
const { getLoanContext } = require("../utils/lanHelper");
const { initEsign } = require("../services/esignService");

const router = express.Router();

/* ======================================================
   TEMPLATE LOADER
====================================================== */
function loadAgreementTemplate(templateFile) {
  const templatePath = path.join(__dirname, "../templates", templateFile);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Agreement template not found: ${templatePath}`);
  }

  return fs.readFileSync(templatePath, "utf-8");
}

/* ======================================================
   HELPERS
====================================================== */
function fillTemplate(html, data) {
  let out = html;
  for (const [key, value] of Object.entries(data)) {
    out = out.replace(
      new RegExp(`{{\\s*${key}\\s*}}`, "g"),
      value == null ? "" : String(value),
    );
  }
  return out;
}

function numberToWords(num) {
  if (!num || num === 0) return "Zero Rupees Only";

  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const convert = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000)
      return (
        a[Math.floor(n / 100)] +
        " Hundred" +
        (n % 100 ? " " + convert(n % 100) : "")
      );
    if (n < 100000)
      return (
        convert(Math.floor(n / 1000)) +
        " Thousand" +
        (n % 1000 ? " " + convert(n % 1000) : "")
      );
    if (n < 10000000)
      return (
        convert(Math.floor(n / 100000)) +
        " Lakh" +
        (n % 100000 ? " " + convert(n % 100000) : "")
      );
    return convert(Math.floor(n / 10000000)) + " Crore";
  };

  return convert(Number(num));
}

/* ======================================================
   FETCH ALL LOANS
====================================================== */
router.get("/api/loans", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT lan, C_N, L_A FROM helium_loan_summary
      UNION ALL
      SELECT lan, C_N, L_A FROM customer_loan_summary
      UNION ALL
      SELECT lan, CUST_NAME AS C_N, FINAL_LIMIT AS L_A FROM clayyo_loan_summary
      UNION ALL
SELECT
  lan,
  customer_name AS C_N,
  loan_amount AS L_A
FROM loan_booking_claim_cure_buddy
      ORDER BY lan DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================
   PDF PREVIEW (HTML → PDF)
====================================================== */
router.get("/:lan/pdfs", async (req, res) => {
  const { lan } = req.params;

  const { summaryTable, rpsTable, agreementTemplate, type } =
    getLoanContext(lan);

  try {
    if (type === "CLAIM_CURE_BUDDY") {
  const result = await generateAgreementPdf(lan);

  const pdfPath = path.join(
    __dirname,
    "../uploads",
    result.pdfName,
  );

  return res.download(
    pdfPath,
    `Agreement_${lan}.pdf`,
  );
}
    if (summaryTable === "clayyo_loan_summary") {
      await db.promise().query("CALL sp_generate_clayyo_summary(?)", [lan]);
    }
    const templateHtml = loadAgreementTemplate(agreementTemplate);

    let summaryRows;

    /* ======================================================
       CLAYYO AGREEMENT DATA
    ====================================================== */
    if (type === "CLAYYO") {
      [summaryRows] = await db.promise().query(
        `
        SELECT
          FINAL_LIMIT,
          PER_ADD,
          CUST_NAME,
          CUST_PAN,
          CUST_AGE,
          CUR_DATE,
          LAN,
          CUST_BANK,
          CUST_ACC_NO
        FROM ${summaryTable}
        WHERE lan = ?
        `,
        [lan],
      );
    } else {

    /* ======================================================
       HELIUM / CUSTOMER AGREEMENT DATA
    ====================================================== */
      [summaryRows] = await db.promise().query(
        `
        SELECT
          lan,
          C_N,
          cur_add,
          per_add,
          L_A,
          I_R,
          L_T,
          B_Na,
          A_no,
          ifsc,
          DATE_FORMAT(L_date,'%d-%m-%Y') AS L_date,
          E_S,
          I_S,
          P_S,
          T_E,
          L_P
        FROM ${summaryTable}
        WHERE lan = ?
        `,
        [lan],
      );
    }

    if (!summaryRows.length) {
      return res.status(404).json({ message: "Loan not found" });
    }

    const summary = summaryRows[0];

    /* ======================================================
       RPS DATA (NOT REQUIRED FOR CLAYYO)
    ====================================================== */

    let firstRps = {};

    if (type !== "CLAYYO") {
      const [rpsRows] = await db.promise().query(
        `
        SELECT
          id,
          emi,
          interest,
          principal,
          opening,
          closing
        FROM ${rpsTable}
        WHERE lan = ?
        ORDER BY id ASC
        `,
        [lan],
      );

      firstRps = rpsRows.length ? rpsRows[0] : {};
    }

    /* ======================================================
       TEMPLATE DATA OBJECT
    ====================================================== */

    const data = {
      ...summary,
      ...firstRps,
      CU_date: dayjs().format("DD-MM-YYYY"),
      L_A_W: summary.L_A ? numberToWords(summary.L_A) : "",
    };

    const html = fillTemplate(templateHtml, data);

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox"],
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        bottom: "20mm",
        left: "15mm",
        right: "15mm",
      },
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Agreement_${lan}.pdf"`,
    );

    res.send(pdf);
  } catch (err) {
    console.error("PDF generation failed:", err);

    res.status(500).json({
      message: "PDF generation failed",
      error: err.message,
    });
  }
});

/* ======================================================
   ESIGN INIT
====================================================== */
router.post("/:lan/esign/:type", authenticateUser, async (req, res) => {
  const { lan, type } = req.params;
  const { bookingTable } = getLoanContext(lan);

  try {
    if (type === "agreement") {
      const [rows] = await db
        .promise()
        .query(
          `SELECT sanction_esign_status FROM ${bookingTable} WHERE lan=?`,
          [lan],
        );
    }

    const out = await initDoqfyEsign(lan, type.toUpperCase());

    // const out = await initEsign(lan, type.toUpperCase());

    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});



router.post("/test/:lan/esign/:type", authenticateUser, async (req, res) => {
  const { lan, type } = req.params;
  const { bookingTable } = getLoanContext(lan);

  try {
    if (type === "agreement") {
      const [rows] = await db
        .promise()
        .query(
          `SELECT sanction_esign_status FROM ${bookingTable} WHERE lan=?`,
          [lan],
        );
    }

    const out = await initDoqfyEsign(lan, type.toUpperCase());

    // const out = await initEsign(lan, type.toUpperCase());

    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =====================================================
   DIGIO WEBHOOK
====================================================== */
// router.post("/v1/digio-esign-webhook", async (req, res) => {
//   try {
//     const event = req.body;
//      console.log("[Webhook] Raw event body:", JSON.stringify(event));

//     const docId = event.id;
//     const status = event.state;

//     const [rows] = await db.promise().query(
//       "SELECT lan, document_type FROM esign_documents WHERE document_id=?",
//       [docId]
//     );
//     if (!rows.length) return res.send("ignored");

//     const { lan, document_type } = rows[0];
//     const { bookingTable } = getLoanContext(lan);

//     await db.promise().query(
//       "UPDATE esign_documents SET status=?, raw_response=? WHERE document_id=?",
//       [status, JSON.stringify(event), docId]
//     );

//     const col =
//       document_type === "SANCTION"
//         ? "sanction_esign_status"
//         : "agreement_esign_status";

//     await db.promise().query(
//       `UPDATE ${bookingTable} SET ${col}=? WHERE lan=?`,
//       [status === "signed" ? "SIGNED" : status, lan]
//     );

//     res.send("ok");
//   } catch (err) {
//     console.error("Webhook error:", err);
//     res.status(500).send("error");
//   }
// });


function decodeDoqfyPdf(orderDocument) {
  if (!orderDocument) {
    throw new Error("Missing order_document from Doqfy");
  }

  let base64Pdf = String(orderDocument).trim();

  // Doqfy is sending Python bytes format: b'JVBER...'
  if (
    (base64Pdf.startsWith("b'") && base64Pdf.endsWith("'")) ||
    (base64Pdf.startsWith('b"') && base64Pdf.endsWith('"'))
  ) {
    base64Pdf = base64Pdf.slice(2, -1);
  }

  // In case they send data URL format
  if (base64Pdf.includes(",")) {
    base64Pdf = base64Pdf.split(",").pop();
  }

  // Remove whitespace/new lines
  base64Pdf = base64Pdf.replace(/\s/g, "");

  const pdfBuffer = Buffer.from(base64Pdf, "base64");

  // Validate PDF header
  const header = pdfBuffer.slice(0, 5).toString("ascii");
  if (header !== "%PDF-") {
    throw new Error(`Invalid Doqfy PDF. Header received: ${header}`);
  }

  return pdfBuffer;
}

router.post("/v1/digio-esign-webhook", async (req, res) => {
  console.log("[Webhook] Received Digio eSign webhook");

  try {
    const event = req.body;
    console.log("[Webhook] Raw event body:", JSON.stringify(event));

    const docId = event.id;
    const status = event.state;

    console.log("[Webhook] Extracted docId:", docId);
    console.log("[Webhook] Extracted status:", status);

    console.log("[DB] Fetching document details from esign_documents");
    const [rows] = await db
      .promise()
      .query(
        "SELECT lan, document_type FROM esign_documents WHERE document_id=?",
        [docId],
      );

    console.log("[DB] Query result:", rows);

    if (!rows.length) {
      console.log("[Webhook] No matching document found. Ignoring webhook.");
      return res.send("ignored");
    }

    const { lan, document_type } = rows[0];
    console.log("[Webhook] LAN:", lan);
    console.log("[Webhook] Document Type:", document_type);

    const { bookingTable } = getLoanContext(lan);
    console.log("[Webhook] Resolved booking table:", bookingTable);

    console.log("[DB] Updating esign_documents status and raw_response");
    await db
      .promise()
      .query(
        "UPDATE esign_documents SET status=?, raw_response=? WHERE document_id=?",
        [status, JSON.stringify(event), docId],
      );

    console.log("[DB] esign_documents updated successfully");

    const col =
      document_type === "SANCTION"
        ? "sanction_esign_status"
        : "agreement_esign_status";

    console.log("[Webhook] Target booking table column:", col);

    const finalStatus = status === "signed" ? "SIGNED" : status;
    console.log("[Webhook] Final status to be stored:", finalStatus);

    console.log("[DB] Updating booking table eSign status");
    await db
      .promise()
      .query(`UPDATE ${bookingTable} SET ${col}=? WHERE lan=?`, [
        finalStatus,
        lan,
      ]);

    console.log("[DB] Booking table updated successfully");
    console.log("[Webhook] Processing completed successfully");

    res.send("ok");
  } catch (err) {
    console.error("[Webhook] Error occurred:", err);
    res.status(500).send("error");
  }
});

router.post("/v1/doqfy-esign-webhook", async (req, res) => {
  console.log("[DOQFY WEBHOOK] Received");

  try {
    const event = req.body;

    console.log("[DOQFY WEBHOOK] Raw payload:", JSON.stringify(event));

    /* --------------------------------------------------- */
    /* EXTRACT DATA */
    /* --------------------------------------------------- */

    const orderId = event.order_id;
    const orderStatus = event.order_status;

    console.log("[DOQFY WEBHOOK] Order ID:", orderId);
    console.log("[DOQFY WEBHOOK] Order Status:", orderStatus);

    if (!orderId) {
      console.log("[DOQFY WEBHOOK] Missing order_id");
      return res.status(400).send("invalid payload");
    }

    /* --------------------------------------------------- */
    /* FETCH DOCUMENT */
    /* --------------------------------------------------- */

    const [rows] = await db.promise().query(
      `
      SELECT lan, document_type
      FROM esign_documents
      WHERE document_id = ?
      `,
      [orderId],
    );

    if (!rows.length) {
      console.log("[DOQFY WEBHOOK] No matching document found");

      return res.send("ignored");
    }

    const { lan, document_type } = rows[0];

    console.log("[DOQFY WEBHOOK] LAN:", lan);
    console.log("[DOQFY WEBHOOK] Document Type:", document_type);

    /* --------------------------------------------------- */
    /* RESOLVE BOOKING TABLE */
    /* --------------------------------------------------- */

    const { bookingTable } = getLoanContext(lan);

    console.log("[DOQFY WEBHOOK] Booking Table:", bookingTable);

    /* --------------------------------------------------- */
    /* DETERMINE FINAL STATUS */
    /* --------------------------------------------------- */

    let finalStatus = "INITIATED";

    // Check signatory status
    const signatory = event.signatory_data?.[0];

    const signStatus = signatory?.status || "";

    console.log("[DOQFY WEBHOOK] Signatory Status:", signStatus);

    /*
      Possible statuses:
      REQUESTED
      IN_PROGRESS
      SIGNED
      REJECTED
      EXPIRED
    */

    if (
  orderStatus === "Completed" ||
  orderStatus === "COMPLETED" ||
  signStatus === "SIGNED" ||
  signStatus === "COMPLETED"
) {
      finalStatus = "SIGNED";
    } else if (signStatus === "REJECTED") {
      finalStatus = "REJECTED";
    } else if (signStatus === "EXPIRED") {
      finalStatus = "EXPIRED";
    } else {
      finalStatus = orderStatus;
    }

    console.log("[DOQFY WEBHOOK] Final Status:", finalStatus);

    /* --------------------------------------------------- */
    /* UPDATE ESIGN DOCUMENTS */
    /* --------------------------------------------------- */

    await db.promise().query(
      `
      UPDATE esign_documents
      SET
        status = ?,
        raw_response = ?
      WHERE document_id = ?
      `,
      [finalStatus, JSON.stringify(event), orderId],
    );

    console.log("[DOQFY WEBHOOK] esign_documents updated");

    /* --------------------------------------------------- */
    /* UPDATE BOOKING TABLE */
    /* --------------------------------------------------- */

    /* --------------------------------------------------- */
/* HANDLE SIGNED DOCUMENT */
/* --------------------------------------------------- */

if (
  finalStatus === "SIGNED" &&
  event.order_document
) {
  console.log(
    "[DOQFY WEBHOOK] Processing signed PDF"
  );

  /**
   * Decode PDF
   */
  const pdfBuffer = decodeDoqfyPdf(event.order_document);

  /**
   * Save PDF
   * SAME STRUCTURE AS DIGIO
   */
  const folderPath = path.join(
    __dirname,
    "../uploads"
  );

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, {
      recursive: true,
    });
  }

  const fileName =
    `signed_${lan}_${document_type}_${Date.now()}.pdf`;

  const savePath = path.join(
    folderPath,
    fileName
  );

  fs.writeFileSync(savePath, pdfBuffer);

  console.log(
    "[DOQFY WEBHOOK] PDF saved:",
    savePath
  );

  /**
   * TRANSACTION SAFE DB UPDATE
   */
  const connection =
    await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    /**
     * UPDATE ESIGN DOCUMENTS
     */
    await connection.query(
      `
      UPDATE esign_documents
      SET
        status = 'SIGNED',
        signed_file_path = ?,
        raw_response = ?
      WHERE document_id = ?
      `,
      [
        savePath,
        JSON.stringify(event),
        orderId
      ]
    );

    /**
     * INSERT INTO loan_documents
     * SAME AS DIGIO
     */
    await connection.query(
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
        lan,
        fileName,
        `${document_type}_SIGNED`
      ]
    );

    /**
     * UPDATE BOOKING TABLE
     */
    const col =
      document_type === "SANCTION"
        ? "sanction_esign_status"
        : "agreement_esign_status";

    await connection.query(
      `
      UPDATE ${bookingTable}
      SET ${col} = 'SIGNED'
      WHERE lan = ?
      `,
      [lan]
    );

    await connection.commit();

    console.log(
      "[DOQFY WEBHOOK] Transaction committed"
    );

  } catch (dbErr) {

    await connection.rollback();

    console.error(
      "[DOQFY WEBHOOK] Transaction rollback:",
      dbErr
    );

    throw dbErr;

  } finally {

    connection.release();
  }
}

    console.log("[DOQFY WEBHOOK] Completed successfully");

    res.send("ok");
  } catch (err) {
    console.error("[DOQFY WEBHOOK] ERROR:", err);

    res.status(500).send("error");
  }
});

/* ======================================================
   SANCTION & AGREEMENT GENERATION
====================================================== */
router.get("/:lan/generate-sanction", async (req, res) => {
  const { lan } = req.params;
  const { bookingTable } = getLoanContext(lan);

  try {
    const [rows] = await db
      .promise()
      .query(`SELECT * FROM ${bookingTable} WHERE lan=?`, [lan]);
    if (!rows.length)
      return res.status(404).json({ message: "Loan not found" });

    const pdfName = await generateSanctionLetterPdf(lan);
    res.json({ success: true, pdfName, url: `/uploads/${pdfName}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Sanction generation failed",
      error: err.message,
    });
  }
});

router.get("/:lan/generate-agreement", async (req, res) => {
  const { lan } = req.params;

  try {
    const result = await generateAgreementPdf(lan);

    if (!result || !result.pdfName) {
      return res.status(500).json({
        success: false,
        message: "Agreement PDF generation returned empty result",
      });
    }

    res.json({
      success: true,
      pdfName: result.pdfName,
      url: `/uploads/${result.pdfName}`,
    });
  } catch (err) {
    console.error("Generate agreement failed:", err);
    res.status(500).json({
      success: false,
      message: "Generate agreement failed",
      error: err.message,
    });
  }
});

module.exports = router;
