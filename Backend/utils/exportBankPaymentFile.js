
// const xl = require("excel4node");
// const fs = require("fs");

// function formatDateLikeDDMMYYYY(val) {
//   if (!(val instanceof Date)) return val;
//   const d = String(val.getDate()).padStart(2, "0");
//   const m = String(val.getMonth() + 1).padStart(2, "0");
//   const y = val.getFullYear();
//   return `${d}/${m}/${y}`;
// }

// async function exportBankPaymentFile(finalRows, filePath) {
//   if (!finalRows || !finalRows.length)
//     throw new Error("No data to export for Bank Payment File");

//   const wb = new xl.Workbook();
//   const ws = wb.addWorksheet("Bank Payment File");

//   // Normal text style (no bold, all text)
//   const textStyle = wb.createStyle({
//     numberFormat: "@",
//     font: { bold: false },
//   });

//   // Get headers
//   const headers = Object.keys(finalRows[0]);

//   // Write headers — make “Blank Column” header cell blank
//   headers.forEach((header, i) => {
//     const displayHeader =
//       header.toLowerCase().includes("blank") ? "" : header;
//     ws.cell(1, i + 1).string(displayHeader).style(textStyle);
//   });

//   // Write data rows
//   finalRows.forEach((row, rowIndex) => {
//     headers.forEach((key, colIndex) => {
//       let v = row[key];
//       const lower = key.toLowerCase();

//       // Remove Email & Mobile
//       if (lower === "email" || lower === "mobile") v = "";

//       // Format date
//       if (v instanceof Date) v = formatDateLikeDDMMYYYY(v);

//       // Strip .00 for numeric values
//       if (typeof v === "number" || /^[0-9]+(\.00)?$/.test(String(v))) {
//         v = String(v).replace(/\.00$/, "");
//       }

//       if (v === null || v === undefined) v = "";
//       const strVal = String(v).replace(/,/g, "").trim();

//       ws.cell(rowIndex + 2, colIndex + 1).string(strVal).style(textStyle);
//     });
//   });

//   // Auto-fit column widths
//   headers.forEach((key, i) => {
//     let maxLength = key.length + 2;
//     finalRows.forEach((row) => {
//       const len = String(row[key] ?? "").length + 2;
//       if (len > maxLength) maxLength = len;
//     });
//     ws.column(i + 1).setWidth(Math.min(maxLength, 60));
//   });

//   // Write to .xls
//   await new Promise((resolve, reject) => {
//     wb.write(filePath, (err) => {
//       if (err) reject(err);
//       else resolve();
//     });
//   });
// }

// module.exports = exportBankPaymentFile;



const xl = require("excel4node");
const fs = require("fs");

function formatDateLikeDDMMYYYY(val) {
  if (!(val instanceof Date)) return val;
  const d = String(val.getDate()).padStart(2, "0");
  const m = String(val.getMonth() + 1).padStart(2, "0");
  const y = val.getFullYear();
  return `${d}/${m}/${y}`;
}

async function exportBankPaymentFile(finalRows, filePath) {
  if (!finalRows || !finalRows.length)
    throw new Error("No data to export for Bank Payment File");

  const wb = new xl.Workbook();
  const ws = wb.addWorksheet("Bank Payment File");

  // ✅ Styles
  const textStyle = wb.createStyle({
    numberFormat: "@", // Text format
    font: { bold: false },
  });

  const numberStyle = wb.createStyle({
    numberFormat: "0", // ✅ Plain number, no commas, no decimals
    alignment: { horizontal: "right" },
  });

  // ✅ Get headers
  const headers = Object.keys(finalRows[0]);

  // Write headers
  headers.forEach((header, i) => {
    const displayHeader =
      header.toLowerCase().includes("blank") ? "" : header;
    ws.cell(1, i + 1).string(displayHeader).style(textStyle);
  });

  // ✅ Write data rows
  finalRows.forEach((row, rowIndex) => {
    headers.forEach((key, colIndex) => {
      let v = row[key];
      const lower = key.toLowerCase();

      // Blank out Email & Mobile
      if (lower === "email" || lower === "mobile") v = "";

      // Format date
      if (v instanceof Date) v = formatDateLikeDDMMYYYY(v);

      if (v === null || v === undefined) v = "";
      let strVal = String(v).trim();

      // ✅ Numeric field: Amount (no commas, no decimals)
      if (lower === "amount") {
        const numVal = parseFloat(String(v).replace(/,/g, ""));
        if (!isNaN(numVal)) {
          ws.cell(rowIndex + 2, colIndex + 1).number(numVal).style(numberStyle);
        } else {
          ws.cell(rowIndex + 2, colIndex + 1).string(strVal).style(textStyle);
        }
      } else {
        // ✅ Everything else stays text
        ws.cell(rowIndex + 2, colIndex + 1).string(strVal).style(textStyle);
      }
    });
  });

  // ✅ Auto-fit column widths
  headers.forEach((key, i) => {
    let maxLength = key.length + 2;
    finalRows.forEach((row) => {
      const len = String(row[key] ?? "").length + 2;
      if (len > maxLength) maxLength = len;
    });
    ws.column(i + 1).setWidth(Math.min(maxLength, 60));
  });

  // ✅ Write to .xls file
  await new Promise((resolve, reject) => {
    wb.write(filePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = exportBankPaymentFile;
