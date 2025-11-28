const express = require("express");
const db = require("../config/db");
const dayjs = require("dayjs");
const CU_date = dayjs().format("DD-MM-YYYY");
const handlebars = require("handlebars");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");


const router = express.Router();

// Load & compile template once

const templatePath = path.join(
  __dirname,
  "../templates",
  "helium_agreement.html"
);

const templateHtml = fs.readFileSync(templatePath, "utf-8");

const template = handlebars.compile(templateHtml);

const rawTemplateHtml = fs.readFileSync(templatePath, "utf-8");

// Helper: replace all {{KEY}} with data[KEY]

function fillTemplate(html, data) {
  let out = html;

  for (const [key, value] of Object.entries(data)) {
    const safe = value == null ? "" : String(value);

    // matches {{key}} or {{ key }} anywhere

    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, "g");

    out = out.replace(pattern, safe);
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

    return (
      convert(Math.floor(n / 10000000)) +
      " Crore" +
      (n % 10000000 ? " " + convert(n % 10000000) : "")
    );
  };

  return convert(num);
}

/**

 * 1) List all loans from helium_loan_summary

 *    -> used for table in React

 */





router.get("/api/loans", async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT

         id,

         lan,

         C_N,

         L_A

       FROM helium_loan_summary

       ORDER BY id DESC`
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching loans:", err);

    res.status(500).json({ message: "Server error" });
  }
});

/**

 * 2) Generate PDF by LAN (lan is UNIQUE in your table)

 *    URL pattern: /api/loans/:lan/pdf

 */

router.get("/:lan/pdf", async (req, res) => {
  const lan = req.params.lan;

  try {
    // STEP A: Get summary row from helium_loan_summary

    const [summaryRows] = await db.promise().query(
      `SELECT

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

         DATE_FORMAT(L_date, '%d-%m-%Y') AS L_date,

         E_S,

         I_S,

         P_S,

         T_E,

         L_P

       FROM helium_loan_summary

       WHERE lan = ?`,

      [lan]
    );

    if (summaryRows.length === 0) {
      return res.status(404).json({ message: "Loan summary not found" });
    }

    const summary = summaryRows[0];

    // ⭐ NEW: Convert loan amount to words

    const L_A_W = numberToWords(summary.L_A);

    // ⭐ Insert current date (DD-MM-YYYY)

    const CU_date = dayjs().format("DD-MM-YYYY");

    // STEP B: Get EMI (and schedule info) from loan_rps_helium

    const [rpsRows] = await db.promise().query(
      `SELECT

      id,

         emi,

         interest,

         principal,

         opening,

         closing,

         remaining_emi,

         remaining_interest,

         remaining_principal

       FROM loan_rps_helium

       WHERE lan = ?

       ORDER BY id ASC`,

      [lan]
    );

    const rps = rpsRows[0] || {};

    // STEP C: Data for template – match keys to {{placeholders}}

    const dataForTemplate = {
      lan: summary.lan,

      C_N: summary.C_N,

      cur_add: summary.cur_add,

      per_add: summary.per_add,

      L_A: summary.L_A,

      L_A_W,

      CU_date,

      I_R: summary.I_R,

      L_T: summary.L_T,

      B_Na: summary.B_Na,

      A_no: summary.A_no,

      ifsc: summary.ifsc,

      L_date: summary.L_date,

      E_S: summary.E_S,

      I_S: summary.I_S,

      P_S: summary.P_S,

      T_E: summary.T_E, // total EMI

      L_P: summary.L_P, // loan principal

      // from RPS:

      id: rps.id || "",

      emi: rps.emi || 0,

      opening: rps.opening || 0,

      closing: rps.closing || 0,

      remaining_emi: rps.remaining_emi || 0,

      remaining_interest: rps.remaining_interest || 0,

      remaining_principal: rps.remaining_principal || 0,

      interest: rps.interest || 0,

      principal: rps.principal || 0,
    };

    // STEP D: fill the Word-exported HTML template

    const filledHtml = fillTemplate(rawTemplateHtml, dataForTemplate);

    // STEP E: HTML → PDF with full logo/header formatting

    const browser = await puppeteer.launch({
      headless: "new",

      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    await page.setContent(filledHtml, {
      waitUntil: "networkidle0",
      timeout: 120000,
    });

    const pdfBuffer = await page.pdf({
      format: "A4",

      printBackground: true,

      displayHeaderFooter: false, // IMPORTANT

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

      `attachment; filename="Rental_Agreement_${lan}.pdf"`
    );

    res.send(pdfBuffer);
  } catch (err) {
    console.error("Error generating PDF:", err);

    res.status(500).json({ message: "Error generating PDF" });
  }
});


module.exports = router;