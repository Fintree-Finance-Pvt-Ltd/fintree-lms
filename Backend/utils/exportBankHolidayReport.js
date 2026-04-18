const xl = require("excel4node");

/**
 * Formats dates to DD/MM/YYYY
 */
function formatDate(val) {
  if (!(val instanceof Date)) return val;
  const d = String(val.getDate()).padStart(2, "0");
  const m = String(val.getMonth() + 1).padStart(2, "0");
  const y = val.getFullYear();
  return `${d}/${m}/${y}`;
}

async function exportBankHolidayReport(finalRows, filePath) {
  if (!finalRows || !finalRows.length)
    throw new Error("No data available for Bank Holiday Report");

  const wb = new xl.Workbook();
  const ws = wb.addWorksheet("Bank Holiday Report");

  // --- Normal Professional Styles ---
  const headerStyle = wb.createStyle({
    font: { 
      bold: true, 
      color: "#000000", // Black text
      size: 11 
    },
    alignment: { horizontal: "center" },
    border: { 
        bottom: { style: "thin", color: "#000000" } 
    }
  });

  const textStyle = wb.createStyle({
    numberFormat: "@", // Force text format to keep leading zeros in Ref Nos
    font: { size: 10 }
  });

  const amountStyle = wb.createStyle({
    // Standard number format without forced currency symbols
    numberFormat: "#,##0.00", 
    alignment: { horizontal: "right" },
    font: { size: 10 }
  });

  const headers = Object.keys(finalRows[0]);

  // --- Write Headers (Black & Bold) ---
  headers.forEach((header, i) => {
    ws.cell(1, i + 1)
      .string(header) // Kept original casing
      .style(headerStyle);
  });

  // --- Write Data ---
  finalRows.forEach((row, rowIndex) => {
    headers.forEach((key, colIndex) => {
      let val = row[key];
      const lowerKey = key.toLowerCase();

      // Format Dates
      if (val instanceof Date) {
        val = formatDate(val);
      }

      if (val === null || val === undefined) val = "";
      
      // Amount Logic
      if (lowerKey.includes("amount")) {
        const numVal = typeof val === "string" 
          ? parseFloat(val.replace(/,/g, "")) 
          : parseFloat(val);

        if (!isNaN(numVal)) {
          ws.cell(rowIndex + 2, colIndex + 1)
            .number(numVal)
            .style(amountStyle);
        } else {
          ws.cell(rowIndex + 2, colIndex + 1)
            .string(String(val))
            .style(textStyle);
        }
      } 
      // Everything else as Text
      else {
        ws.cell(rowIndex + 2, colIndex + 1)
          .string(String(val).trim())
          .style(textStyle);
      }
    });
  });

  // --- Auto-fit Columns ---
  headers.forEach((key, i) => {
    let maxLen = key.length + 5;
    finalRows.forEach(row => {
      const len = String(row[key] ?? "").length + 2;
      if (len > maxLen) maxLen = len;
    });
    ws.column(i + 1).setWidth(Math.min(maxLen, 50));
  });

  return new Promise((resolve, reject) => {
    wb.write(filePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = exportBankHolidayReport;