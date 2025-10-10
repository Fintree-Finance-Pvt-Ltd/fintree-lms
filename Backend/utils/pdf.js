const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generateCibilPdf(summary, outPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, left: 40, right: 40, bottom: 40 } });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const add = (t='') => doc.text(t);

    doc.font('Helvetica-Bold').fontSize(14).text('CIBIL Report (Rendered from XML)');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    add('============================================================');
    add(`Report Number : ${summary.reportNo}`);
    add(`Report Date   : ${summary.reportDate} ${summary.reportTime}`);
    add(`Bureau Score  : ${summary.score}`);
    doc.moveDown(0.3);

    doc.font('Helvetica-Bold').text('Applicant'); doc.font('Helvetica');
    add('------------------------------------------------------------');
    add(`Name          : ${summary.applicant.first} ${summary.applicant.last}`.trim());
    add(`DOB           : ${summary.applicant.dob}`);
    add(`PAN           : ${summary.applicant.pan}`);
    add(`Phone         : ${summary.applicant.phone}`);
    add(`Address       : ${summary.applicant.address}`);
    doc.moveDown(0.3);

    doc.font('Helvetica-Bold').text('Credit Summary'); doc.font('Helvetica');
    add('------------------------------------------------------------');
    add(`Total Accounts         : ${summary.creditSummary.creditTotal}  (Active: ${summary.creditSummary.creditActive})`);
    add(`Outstanding (All)      : ₹${summary.creditSummary.outstandingAll}`);
    add(`Outstanding (Unsecured): ₹${summary.creditSummary.outstandingUnsec}`);
    doc.moveDown(0.3);

    doc.font('Helvetica-Bold').text('Latest Account'); doc.font('Helvetica');
    add('------------------------------------------------------------');
    add(`Open Date      : ${summary.latestAccount.openDate}`);
    add(`Current Balance: ₹${summary.latestAccount.currBal}`);
    add(`Last Payment   : ${summary.latestAccount.lastPay}`);
    doc.moveDown(0.3);

    doc.font('Helvetica-Bold').text('Recent Enquiries'); doc.font('Helvetica');
    add('------------------------------------------------------------');
    add(`Inquiries (last 30 days): ${summary.caps.last30}`);
    doc.moveDown(0.6);

    doc.font('Helvetica-Oblique').fontSize(9)
       .text('Note: Auto-rendered summary from raw report_xml. Refer to XML for full detail.');

    doc.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}

module.exports = { generateCibilPdf };
