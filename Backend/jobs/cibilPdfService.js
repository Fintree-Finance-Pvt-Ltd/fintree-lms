// /server/services/cibilPdfService.js
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const puppeteer = require('puppeteer');
const db = require('../config/db');

function makeOutputPath(lan) {
  const outDir = path.join(__dirname, "../uploads");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const filename = `EXPERIAN_CIBIL_${lan || 'NA'}_${Date.now()}.pdf`;
  const filePath = path.join(outDir, filename);
  return { filename, filePath };
}
// ---------------------------------------------------------------------------
// Helper: parse XML safely
// ---------------------------------------------------------------------------
function parseXml(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
  });
  return parser.parse(xml);
}

// ---------------------------------------------------------------------------
function mapFields(x) {
  const r = x?.INProfileResponse || {};
  const hdr = r?.CreditProfileHeader || {};
  const score = r?.SCORE || {};
  const cur = r?.Current_Application?.Current_Application_Details || {};
  const appl = cur?.Current_Applicant_Details || {};
  const addr = cur?.Current_Applicant_Address_Details || {};
  const cais = r?.CAIS_Account || {};
  const caisSummary = cais?.CAIS_Summary || {};
  const caps = r?.CAPS || {};
  const capsSummary = caps?.CAPS_Summary || {};
  const nonCreditCaps = r?.NonCreditCAPS || {};
  const totalCapsSummary = r?.TotalCAPS_Summary || {};

  // Handle single/multiple nodes safely
  const caisDetails = Array.isArray(cais?.CAIS_Account_DETAILS)
    ? cais.CAIS_Account_DETAILS
    : cais?.CAIS_Account_DETAILS
    ? [cais.CAIS_Account_DETAILS]
    : [];

  const capsDetails = Array.isArray(caps?.CAPS_Application_Details)
    ? caps.CAPS_Application_Details
    : caps?.CAPS_Application_Details
    ? [caps.CAPS_Application_Details]
    : [];

  const name = `${appl.First_Name || ''} ${appl.Middle_Name1 || ''} ${appl.Last_Name || ''}`
    .replace(/\s+/g, ' ')
    .trim();

  const address = [
    addr.FlatNoPlotNoHouseNo,
    addr.BldgNoSocietyName,
    addr.RoadNoNameAreaLocality,
    addr.City,
    addr.State,
    addr.PINCode,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    reportDate: hdr.ReportDate,
    reportTime: hdr.ReportTime,
    version: hdr.Version,
    reportNumber: hdr.ReportNumber,
    bureau: hdr.Subscriber_Name,
    name,
    dob: appl.Date_Of_Birth_Applicant,
    pan: appl.IncomeTaxPan,
    mobile: appl.Telephone_Number_Applicant_1st,
    address,
    score: score.BureauScore,

    caisSummary,
    caisDetails,
    capsSummary,
    capsDetails,
    nonCreditCapsSummary: nonCreditCaps?.NonCreditCAPS_Summary || {},
    totalCapsSummary,
  };
}


function html(fields) {
  const S = (v) => (v ? String(v) : '-');

  // Safe date formatter (fixes .slice() issue)
  const fmtDate = (d) => {
    if (!d) return '-';
    if (typeof d !== 'string') d = String(d);
    const clean = d.trim();
    return /^\d{8}$/.test(clean)
      ? `${clean.slice(6, 8)}-${clean.slice(4, 6)}-${clean.slice(0, 4)}`
      : clean || '-';
  };

  // --- CAIS Summary ---
  const caisSummary = fields.caisSummary?.Credit_Account || {};
  const outBal = fields.caisSummary?.Total_Outstanding_Balance || {};

  // --- CAIS Accounts ---
  const accountBlocks = fields.caisDetails
    .map((acc, i) => {
      const hist = Array.isArray(acc.CAIS_Account_History)
        ? acc.CAIS_Account_History
        : acc.CAIS_Account_History
        ? [acc.CAIS_Account_History]
        : [];

      const historyRows = hist
        .map(
          (h) => `
        <tr>
          <td>${S(h.Year)}</td>
          <td>${S(h.Month)}</td>
          <td>${S(h.Days_Past_Due)}</td>
          <td>${S(h.Asset_Classification)}</td>
        </tr>`
        )
        .join('');

      return `
      <div class="acc-block">
        <h4>Account ${i + 1}: ${S(acc.Account_Number)}</h4>
        <div class="grid">
          <div>Subscriber</div><div>${S(acc.Subscriber_Name)}</div>
          <div>Account Type</div><div>${S(acc.Account_Type)}</div>
          <div>Status</div><div>${S(acc.Account_Status)}</div>
          <div>Open Date</div><div>${fmtDate(acc.Open_Date)}</div>
          <div>Highest Credit</div><div>${S(acc.Highest_Credit_or_Original_Loan_Amount)}</div>
          <div>Current Balance</div><div>${S(acc.Current_Balance)}</div>
          <div>Amount Past Due</div><div>${S(acc.Amount_Past_Due)}</div>
          <div>Written Off Status</div><div>${S(acc.Written_off_Settled_Status)}</div>
          <div>Date Reported</div><div>${fmtDate(acc.Date_Reported)}</div>
        </div>
        <h5 style="margin-top:8px;">Days Past Due History</h5>
        <table>
          <thead><tr><th>Year</th><th>Month</th><th>Days Past Due</th><th>Asset Class</th></tr></thead>
          <tbody>${historyRows || '<tr><td colspan="4">No DPD data</td></tr>'}</tbody>
        </table>
      </div>`;
    })
    .join('<hr>');

  // --- CAPS Details ---
  const capsRows = fields.capsDetails
    .map(
      (c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${S(c.Subscriber_Name)}</td>
        <td>${fmtDate(c.Date_of_Request)}</td>
        <td>${S(c.Amount_Financed)}</td>
        <td>${S(c.Duration_Of_Agreement)}</td>
        <td>${S(c.Enquiry_Reason)}</td>
      </tr>`
    )
    .join('');

  // --- HTML Layout ---
  return `<!doctype html><html><head><meta charset="utf-8">
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#222;font-size:12px;line-height:1.4}
    .header{border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px}
    .title{font-size:18px;font-weight:700}
    .meta{margin-top:6px;display:flex;gap:24px;flex-wrap:wrap}
    .sec{margin:14px 0}.sec h3{margin:0 0 6px;font-size:14px;border-bottom:1px solid #999;padding-bottom:4px}
    .box{border:1px solid #bbb;padding:10px;border-radius:4px}
    .grid{display:grid;grid-template-columns:160px 1fr 160px 1fr;gap:6px 12px}
    table{width:100%;border-collapse:collapse;margin-top:4px}
    th,td{border:1px solid #bbb;padding:4px;text-align:left;font-size:11px}
    th{background:#eee}
    .acc-block{margin-bottom:16px}
    hr{border:none;border-top:1px dashed #aaa;margin:12px 0}
  </style></head><body>

    <div class="header">
      <div class="title">Experian Credit Report</div>
      <div class="meta">
        <div><b>Date:</b> ${fmtDate(fields.reportDate)}</div>
        <div><b>Time:</b> ${S(fields.reportTime)}</div>
        <div><b>Version:</b> ${S(fields.version)}</div>
        <div><b>Report #:</b> ${S(fields.reportNumber)}</div>
        <div><b>Subscriber:</b> ${S(fields.bureau)}</div>
      </div>
    </div>

    <div class="sec box">
      <h3>Applicant Details</h3>
      <div class="grid">
        <div>Name</div><div>${S(fields.name)}</div>
        <div>Date of Birth</div><div>${fmtDate(fields.dob)}</div>
        <div>PAN</div><div>${S(fields.pan)}</div>
        <div>Mobile</div><div>${S(fields.mobile)}</div>
        <div>Address</div><div style="grid-column:span 3">${S(fields.address)}</div>
      </div>
    </div>

    <div class="sec box">
      <h3>Score Summary</h3>
      <div><b>Bureau Score:</b> ${S(fields.score)}</div>
    </div>

    <div class="sec box">
      <h3>CAIS Summary</h3>
      <div class="grid">
        <div>Total Accounts</div><div>${S(caisSummary.CreditAccountTotal)}</div>
        <div>Active Accounts</div><div>${S(caisSummary.CreditAccountActive)}</div>
        <div>Closed Accounts</div><div>${S(caisSummary.CreditAccountClosed)}</div>
        <div>Default Accounts</div><div>${S(caisSummary.CreditAccountDefault)}</div>
        <div>Unsecured Outstanding</div><div>${S(outBal.Outstanding_Balance_UnSecured)}</div>
        <div>Secured Outstanding</div><div>${S(outBal.Outstanding_Balance_Secured)}</div>
        <div>Total Outstanding</div><div>${S(outBal.Outstanding_Balance_All)}</div>
      </div>
    </div>

    <div class="sec box">
      <h3>Account Details</h3>
      ${accountBlocks || '<p>No account data available.</p>'}
    </div>

    <div class="sec box">
      <h3>CAPS Enquiries</h3>
      <table>
        <thead><tr><th>#</th><th>Subscriber</th><th>Date of Request</th><th>Amount</th><th>Tenure</th><th>Reason</th></tr></thead>
        <tbody>${capsRows || '<tr><td colspan="6">No enquiry records</td></tr>'}</tbody>
      </table>
      <p style="font-size:11px;margin-top:8px;"><b>Summary:</b>
      Last 7 Days: ${S(fields.capsSummary?.CAPSLast7Days)} |
      Last 30 Days: ${S(fields.capsSummary?.CAPSLast30Days)} |
      Last 90 Days: ${S(fields.capsSummary?.CAPSLast90Days)} |
      Last 180 Days: ${S(fields.capsSummary?.CAPSLast180Days)}</p>
    </div>

    <div class="sec box">
      <h3>Total CAPS Summary</h3>
      <div class="grid">
        <div>Last 7 Days</div><div>${S(fields.totalCapsSummary?.TotalCAPSLast7Days)}</div>
        <div>Last 30 Days</div><div>${S(fields.totalCapsSummary?.TotalCAPSLast30Days)}</div>
        <div>Last 90 Days</div><div>${S(fields.totalCapsSummary?.TotalCAPSLast90Days)}</div>
        <div>Last 180 Days</div><div>${S(fields.totalCapsSummary?.TotalCAPSLast180Days)}</div>
      </div>
    </div>

    <div class="sec box">
      <h3>Non-Credit CAPS Summary</h3>
      <div class="grid">
        <div>Last 7 Days</div><div>${S(fields.nonCreditCapsSummary?.NonCreditCAPSLast7Days)}</div>
        <div>Last 30 Days</div><div>${S(fields.nonCreditCapsSummary?.NonCreditCAPSLast30Days)}</div>
        <div>Last 90 Days</div><div>${S(fields.nonCreditCapsSummary?.NonCreditCAPSLast90Days)}</div>
        <div>Last 180 Days</div><div>${S(fields.nonCreditCapsSummary?.NonCreditCAPSLast180Days)}</div>
      </div>
    </div>

    <div style="margin-top:16px;font-size:10px;color:#666">Generated automatically by system.</div>
  </body></html>`;
}

async function generatePdf(outPath, htmlStr) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(htmlStr, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
  } finally {
    await browser.close();
  }
}

async function generateForReport(reportId) {
  const conn = db.promise();
  const c = await conn.getConnection();
  try {
    await c.beginTransaction();

    const [rows] = await c.query('SELECT * FROM loan_cibil_reports WHERE id = ? FOR UPDATE', [reportId]);
    if (!rows.length) throw new Error('report not found');
    const r = rows[0];

    if (Number(r.pdf_generated) === 1) {
      await c.commit();
      return { skipped: true };
    }

    const data = parseXml(r.report_xml);
    const fields = mapFields(data);
    const { filename, filePath } = makeOutputPath(r.lan);

    await generatePdf(filePath, html(fields));

    await c.query(
      `INSERT INTO loan_documents (lan, doc_name, file_name, original_name, uploaded_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [r.lan, 'CIBIL_REPORT', filename, `CIBIL Report - ${r.lan || 'N/A'}.pdf`]
    );

    await c.query('UPDATE loan_cibil_reports SET pdf_generated = 1 WHERE id = ?', [r.id]);
    await c.commit();

    return { file_name: filename, url: `/uploads/${filename}` };
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}

// ---------------------------------------------------------------------------
// Bulk generator (for cron jobs)
// ---------------------------------------------------------------------------
async function generateAllPending(limit = 150) {
  const conn = db.promise();
  const [rows] = await conn.query(
    'SELECT id FROM loan_cibil_reports WHERE pdf_generated = 0 ORDER BY id ASC LIMIT ?',
    [limit]
  );
  const out = [];
  for (const row of rows) {
    try {
      const res = await generateForReport(row.id);
      out.push({ id: row.id, ok: true, ...res });
    } catch (err) {
      out.push({ id: row.id, ok: false, error: err.message });
    }
  }
  return out;
}

module.exports = { generateForReport, generateAllPending };
