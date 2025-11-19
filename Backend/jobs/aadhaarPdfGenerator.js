const PDFDocument = require("pdfkit");
const fs = require("fs");

function formatTimestamp(ts) {
  if (!ts) return "-";

  try {
    const date = new Date(ts);

    const options = {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata"
    };

    const formatted = date.toLocaleString("en-IN", options);
    return formatted.replace(",", "");  // Cleanup
  } catch (e) {
    return ts; // fallback
  }
}


async function createAadhaarPDF(json, outputPath) {
  const doc = new PDFDocument({ margin: 40 });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  const kyc = json.Certificate.CertificateData.KycRes;
  const uid = kyc.UidData;

  const poi = uid.Poi?.$ || {};
  const poa = uid.Poa?.$ || {};

  // Aadhaar number
  const aadhaarRaw = uid.$?.uid || null;
  const aadhaarMasked = aadhaarRaw
    ? `XXXX XXXX ${aadhaarRaw.slice(-4)}`
    : "-";

  // Title
  doc.fontSize(20).text("Offline Aadhaar KYC", { align: "center" });
  doc.moveDown(1.5);

  const startX = 40;
  let y = doc.y;
  const tableWidth = doc.page.width - 80;
  const col1Width = tableWidth * 0.35;
  const col2Width = tableWidth * 0.65;
  const rowHeight = 35;

  function drawRow(label, value) {
    doc.rect(startX, y, col1Width, rowHeight).stroke();
    doc.rect(startX + col1Width, y, col2Width, rowHeight).stroke();
    doc.fontSize(12).text(label, startX + 10, y + 10);
    doc.text(value, startX + col1Width + 10, y + 10);
    y += rowHeight;
  }

  drawRow("Name", poi.name || "-");
  drawRow("Aadhaar Number", aadhaarMasked);
  drawRow("Gender", poi.gender || "-");
  drawRow("Date of birth", poi.dob || "-");
  const rawTimestamp = kyc.$?.ts || "-";
const formattedTimestamp = formatTimestamp(rawTimestamp);
drawRow("KYC Timestamp", formattedTimestamp);

  // ADDRESS
  let address = `
${poa.co || ""}
${poa.house || ""} ${poa.street || ""} ${poa.lm || ""}
${poa.loc || ""}, ${poa.vtc || ""}, ${poa.subdist || ""}, ${poa.dist || ""}
${poa.state || ""} ${poa.pc || ""}
`.trim();

  if (!address.replace(/[\s,]/g, "")) address = "-";

  const addressHeight = 90;

  doc.rect(startX, y, col1Width, addressHeight).stroke();
  doc.rect(startX + col1Width, y, col2Width, addressHeight).stroke();

  doc.fontSize(12).text("Address", startX + 10, y + 10);
  doc.fontSize(11).text(address, startX + col1Width + 10, y + 10, {
    width: col2Width - 20,
  });

  y += addressHeight;

  // IMAGE ROW
  const imgHeight = 200;

  doc.rect(startX, y, col1Width, imgHeight).stroke();
  doc.rect(startX + col1Width, y, col2Width, imgHeight).stroke();
  doc.fontSize(12).text("Image", startX + 10, y + 10);

  // UNIVERSAL PHOTO EXTRACTION
  let photoBase64 = null;

  if (uid.Pht) {
    if (typeof uid.Pht === "string") photoBase64 = uid.Pht;
    else if (uid.Pht._) photoBase64 = uid.Pht._;
    else if (Array.isArray(uid.Pht)) photoBase64 = uid.Pht[0];
  }

  if (photoBase64) {
    try {
      const img = Buffer.from(photoBase64, "base64");

      // Draw image (NO ROTATION)
      const imgW = 150;
      const imgH = 180;

      const imgX = startX + col1Width + 20;
      const imgY = y + 10;

      doc.image(img, imgX, imgY, { width: imgW, height: imgH });

    } catch (err) {
      console.log("❌ Image decode error:", err.message);
    }
  } else {
    console.log("⚠ No image found in XML");
  }

  y += imgHeight;

  doc.end();
  return new Promise((resolve) => stream.on("finish", resolve));
}

module.exports = { createAadhaarPDF };
