const ExcelJS = require("exceljs");
// const { formatDateLikeYYYYMMDD, autofitColumns } = require("../utils/excelHelpers");


function autofitColumns(worksheet) {
  worksheet.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const v =
        cell.value == null
          ? ""
          : typeof cell.value === "object" && cell.value.text
          ? cell.value.text
          : String(cell.value);
      maxLen = Math.max(maxLen, v.length + 2);
    });
    col.width = Math.min(maxLen, 60);
  });
}

function formatDateLikeYYYYMMDD(val) {
  if (!(val instanceof Date)) return val;
  const y = val.getFullYear();
  const m = String(val.getMonth() + 1).padStart(2, "0");
  const d = String(val.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function exportBankPaymentFile(finalRows, filePath) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Bank Payment File");

  if (!finalRows.length) throw new Error("No data to export");

  const headers = Object.keys(finalRows[0]);
  worksheet.columns = headers.map((key) => ({ header: key, key }));

  for (const row of finalRows) {
    const out = {};
    for (const k of headers) {
      const lower = k.toLowerCase();
      let v = row[k];

      // ✅ Blank Email & Mobile columns (keep header)
      if (lower === "email" || lower === "mobile") {
        out[k] = "";
        continue;
      }

      // ✅ Keep A/c numbers as text (preserve leading zeros)
      if (lower.includes("debit a/c number") || lower.includes("credit a/c number")) {
        out[k] = String(v || "").trim();
        continue;
      }

      // ✅ Format date to string
      if (v instanceof Date) {
        out[k] = formatDateLikeYYYYMMDD(v);
        continue;
      }

      // ✅ Numeric conversion for numbers
      if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.replace(/,/g, ""))) {
        out[k] = Number(v.replace(/,/g, ""));
        continue;
      }

      out[k] = v ?? "";
    }
    worksheet.addRow(out);
  }

  // ✅ Format numbers (Indian comma style, no decimals)
  worksheet.eachRow((row) => {
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1]?.toLowerCase();
      if (!header) return;

      // ✅ Text columns
      if (header.includes("debit a/c number") || header.includes("credit a/c number")) {
        cell.numFmt = "@";
      }

      // ✅ Amount formatting (no decimals)
      if (header === "amount") {
        cell.numFmt = "#,##0";
      }
    });
  });

  // ✅ Header styling – no background color
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // ✅ Add borders to all rows
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  });

  autofitColumns(worksheet);
  await workbook.xlsx.writeFile(filePath);
}

module.exports = exportBankPaymentFile;
