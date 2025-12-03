const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const dayjs = require("dayjs");
const puppeteer = require("puppeteer");
 
// ---------- Load HTML file ----------
function loadTemplate(filename) {
  const filePath = path.join(__dirname, "../templates", filename);
  return fs.readFileSync(filePath, "utf-8");
}
 
// ---------- Template replace logic ----------
function fillTemplate(html, data) {
  return html.replace(/{{(.*?)}}/g, (_, key) => data[key.trim()] || "");
}
 
// ---------- Convert loan amount to words ----------
function numberToWords(num) {
  if (!num || num === 0) return "Zero Rupees Only";
 
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six",
    "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
 
  const b = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty",
    "Sixty", "Seventy", "Eighty", "Ninety"
  ];
 
  const convert = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
 
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  };
 
  return convert(num);
}
 
// ---------- Convert EMI array into <tr> rows ----------
function buildRpsTableRows(RPS) {
  return RPS.map(row => `
    <tr>
      <td>${row.id}</td>
      <td>${row.opening}</td>
      <td>${row.principal}</td>
      <td>${row.interest}</td>
      <td>${row.emi}</td>
      <td>${row.closing}</td>
    </tr>
  `).join("");
}
 
// ---------- PDF Generator ----------
async function generatePdfFromHtml(html, outputFile) {
  const outputPath = path.join(__dirname, "../generated", outputFile);
 
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
 
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (req) => req.continue());
 
  await page.setContent(html, {
    waitUntil: "networkidle0",
    timeout: 120000,
  });
 
  // await page.evaluate(async () => {
  //   const images = Array.from(document.images).map((img) => img.src);
 
  //   await Promise.all(
  //     images.map(
  //       (src) =>
  //         new Promise((resolve) => {
  //           const img = new Image();
  //           img.src = src;
  //           img.onload = resolve;
  //           img.onerror = resolve;
  //         })
  //     )
  //   );
  // });
 
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
  });
 
  await browser.close();
  fs.writeFileSync(outputPath, pdfBuffer);
 
  return outputFile;
}
 
/* ---------- DB fetch: SUMMARY + RPS ---------- */
async function getLoanData(lan) {
  const [summaryRows] = await db.promise().query(
    `SELECT
       lan, C_N, cur_add, per_add, L_A, I_R, L_T, B_Na, A_no, ifsc,
       DATE_FORMAT(L_date, '%d-%m-%Y') AS L_date,
       E_S, I_S, P_S, T_E, L_P
     FROM helium_loan_summary WHERE lan = ?`,
    [lan]
  );
 
  if (summaryRows.length === 0) return null;
 
  const summary = summaryRows[0];
 
  const L_A_W = numberToWords(summary.L_A);
  const CU_date = dayjs().format("DD-MM-YYYY");
 
  const [rpsRows] = await db.promise().query(
    `SELECT
       id, emi, interest, principal, opening, closing,
       remaining_emi, remaining_interest, remaining_principal
     FROM loan_rps_helium WHERE lan = ? ORDER BY id ASC`,
    [lan]
  );
 
  return {
    ...summary,
    L_A_W,
    CU_date,
    RPS: rpsRows
  };
}
 
/* ---------- SANCTION LETTER PDF ---------- */
exports.generateSanctionLetterPdf = async (lan) => {
  const loanData = await getLoanData(lan);
  if (!loanData) return null;
 
  loanData.RPS_ROWS = buildRpsTableRows(loanData.RPS);
 
  const templateHtml = loadTemplate("sanction_letter.html");
  const filledHtml = fillTemplate(templateHtml, loanData);
 
  const fileName = `sanction_${lan}.pdf`;
  await generatePdfFromHtml(filledHtml, fileName);
 
  return fileName;
};
 
/* ---------- AGREEMENT PDF ---------- */
exports.generateAgreementPdf = async (lan) => {
  const loanData = await getLoanData(lan);
  if (!loanData) return null;
 
  loanData.RPS_ROWS = buildRpsTableRows(loanData.RPS);
 
  const templateHtml = loadTemplate("helium_agreement.html");
  const filledHtml = fillTemplate(templateHtml, loanData);
 
  const fileName = `agreement_${lan}.pdf`;
  await generatePdfFromHtml(filledHtml, fileName);
 
  return fileName;
};