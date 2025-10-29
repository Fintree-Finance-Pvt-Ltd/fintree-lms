// const ExcelJS = require("exceljs");


// function autofitColumns(worksheet) {
//   worksheet.columns.forEach((col) => {
//     let maxLen = 10;
//     col.eachCell({ includeEmpty: true }, (cell) => {
//       const v =
//         cell.value == null
//           ? ""
//           : typeof cell.value === "object" && cell.value.text
//           ? cell.value.text
//           : String(cell.value);
//       maxLen = Math.max(maxLen, v.length + 2);
//     });
//     col.width = Math.min(maxLen, 60);
//   });
// }

// function formatDateLikeYYYYMMDD(val) {
//   if (!(val instanceof Date)) return val;
//   const y = val.getFullYear();
//   const m = String(val.getMonth() + 1).padStart(2, "0");
//   const d = String(val.getDate()).padStart(2, "0");
//   return `${y}-${m}-${d}`;
// }

// async function exportBankPaymentFile(finalRows, filePath) {
//   const workbook = new ExcelJS.Workbook();
//   const worksheet = workbook.addWorksheet("Bank Payment File");

//   if (!finalRows.length) throw new Error("No data to export");

//   const headers = Object.keys(finalRows[0]);
//   worksheet.columns = headers.map((key) => ({ header: key, key }));

//   for (const row of finalRows) {
//     const out = {};
//     for (const k of headers) {
//       const lower = k.toLowerCase();
//       let v = row[k];

//       // ✅ Blank Email & Mobile columns (keep header)
//       if (lower === "email" || lower === "mobile") {
//         out[k] = "";
//         continue;
//       }

//       // ✅ Keep A/c numbers as text (preserve leading zeros)
//       if (lower.includes("debit a/c number") || lower.includes("credit a/c number")) {
//         out[k] = String(v || "").trim();
//         continue;
//       }

//       // ✅ Format date to string
//       if (v instanceof Date) {
//         out[k] = formatDateLikeYYYYMMDD(v);
//         continue;
//       }

//       // ✅ Numeric conversion for numbers
//       if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.replace(/,/g, ""))) {
//         out[k] = Number(v.replace(/,/g, ""));
//         continue;
//       }

//       out[k] = v ?? "";
//     }
//     worksheet.addRow(out);
//   }

//   // ✅ Format numbers (Indian comma style, no decimals)
//   worksheet.eachRow((row) => {
//     row.eachCell((cell, colNumber) => {
//       const header = headers[colNumber - 1]?.toLowerCase();
//       if (!header) return;

//       // ✅ Text columns
//       if (header.includes("debit a/c number") || header.includes("credit a/c number")) {
//         cell.numFmt = "@";
//       }

//       // ✅ Amount formatting (no decimals)
//       if (header === "amount") {
//         cell.numFmt = "#,##0";
//       }
//     });
//   });

//   // ✅ Header styling – no background color
//   worksheet.getRow(1).eachCell((cell) => {
//     cell.font = { bold: true };
//     cell.border = {
//       top: { style: "thin" },
//       left: { style: "thin" },
//       bottom: { style: "thin" },
//       right: { style: "thin" },
//     };
//   });

//   // ✅ Add borders to all rows
//   worksheet.eachRow((row) => {
//     row.eachCell((cell) => {
//       cell.border = {
//         top: { style: "thin" },
//         left: { style: "thin" },
//         bottom: { style: "thin" },
//         right: { style: "thin" },
//       };
//     });
//   });

//   autofitColumns(worksheet);
//   await workbook.xlsx.writeFile(filePath);
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

  // Normal text style (no bold, all text)
  const textStyle = wb.createStyle({
    numberFormat: "@",
    font: { bold: false },
  });

  // Get headers
  const headers = Object.keys(finalRows[0]);

  // Write headers — make “Blank Column” header cell blank
  headers.forEach((header, i) => {
    const displayHeader =
      header.toLowerCase().includes("blank") ? "" : header;
    ws.cell(1, i + 1).string(displayHeader).style(textStyle);
  });

  // Write data rows
  finalRows.forEach((row, rowIndex) => {
    headers.forEach((key, colIndex) => {
      let v = row[key];
      const lower = key.toLowerCase();

      // Remove Email & Mobile
      if (lower === "email" || lower === "mobile") v = "";

      // Format date
      if (v instanceof Date) v = formatDateLikeDDMMYYYY(v);

      // Strip .00 for numeric values
      if (typeof v === "number" || /^[0-9]+(\.00)?$/.test(String(v))) {
        v = String(v).replace(/\.00$/, "");
      }

      if (v === null || v === undefined) v = "";
      const strVal = String(v).replace(/,/g, "").trim();

      ws.cell(rowIndex + 2, colIndex + 1).string(strVal).style(textStyle);
    });
  });

  // Auto-fit column widths
  headers.forEach((key, i) => {
    let maxLength = key.length + 2;
    finalRows.forEach((row) => {
      const len = String(row[key] ?? "").length + 2;
      if (len > maxLength) maxLength = len;
    });
    ws.column(i + 1).setWidth(Math.min(maxLength, 60));
  });

  // Write to .xls
  await new Promise((resolve, reject) => {
    wb.write(filePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = exportBankPaymentFile;

