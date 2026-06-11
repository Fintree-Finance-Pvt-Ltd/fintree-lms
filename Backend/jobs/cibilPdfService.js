
// /server/services/cibilPdfService.js
const { 
  getExperianDescription,
  ACCOUNT_TYPE,ACCOUNT_STATUS,
  ACCOUNT_HOLDER_TYPE,
  PAYMENT_HISTORY_PROFILE,
  TYPE_OF_COLLATERAL,
  PORTFOLIO_TYPE,
  SUTI_FILLED_WILL_FULL_DEFAULT_WRITTEN_OFF_STATUS,
  SUTI_FILLED_WILL_FULL_DEFAULT,
  WRITTEN_OFF_SETTLED_STATUS,

} = require ('../utils/experian_description');

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

function findBackendDir(startDir) {
  let dir = startDir;

  while (dir && dir !== path.dirname(dir)) {
    if (path.basename(dir).toLowerCase() === "backend") {
      return dir;
    }

    dir = path.dirname(dir);
  }

  throw new Error(`Backend folder not found from: ${startDir}`);
}


// ---------------------------------------------------------------------------
// Helper: parse XML safely
// ---------------------------------------------------------------------------
function parseXml(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
    processEntities: {
      enabled: true,
      maxTotalExpansions: 10000,
      maxExpandedLength: 5_000_000,
      maxEntityCount: 10000,
      maxEntitySize: 10000,
    },
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
  const backendDir = findBackendDir(__dirname);
  const projectRoot = path.dirname(backendDir);

  const logoPath = path.join(
    projectRoot,
    "Frontend",
    "src",
    "assets",
    "fintree_logo.png"
  );

  let logoSrc = "";

try {
  if (fs.existsSync(logoPath)) {
    const ext = path.extname(logoPath).toLowerCase();

    const mimeType =
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";

    const logoBase64 = fs.readFileSync(logoPath).toString("base64");

    logoSrc = `data:${mimeType};base64,${logoBase64}`;
  } else {
    console.log("Fintree logo not found at:", logoPath);
  }
} catch (logoErr) {
  console.log("Fintree logo load error:", logoErr.message);
}

  const S = (v) => {
    if (v === null || v === undefined || v === "") 
     return "-";
    return String(v);
  };

  const fmtDate = (d) => {
    if (!d) return "-";
    if (typeof d !== "string") d = String(d);

    const clean = d.trim();

    return /^\d{8}$/.test(clean)
      ? `${clean.slice(6, 8)}-${clean.slice(4, 6)}-${clean.slice(0, 4)}`
      : clean || "-";
  };

  const money = (v) => {
    if (v === null || v === undefined || v === "") return "-";

    const n = Number(String(v).replace(/,/g, ""));

    if (Number.isNaN(n)) return String(v);

    return "₹ " + n.toLocaleString("en-IN");
  };

  const getScoreStatus = (score) => {
    const n = Number(score);

    if (Number.isNaN(n)) return "Not Available";
    if (n >= 750) return "Excellent";
    if (n >= 700) return "Good";
    if (n >= 650) return "Fair";
    if (n >= 550) return "Risky";

    return "Poor";
  };

  const getScorePercent = (score) => {
    const n = Number(score);

    if (Number.isNaN(n)) return 0;

    const percent = ((n - 300) / 600) * 100;

    return Math.max(0, Math.min(100, percent));
  };

  const dpdClass = (dpd) => {
    const n = Number(dpd);

    if (Number.isNaN(n) || n <= 0) return "dpd-good";
    if (n <= 30) return "dpd-warn";

    return "dpd-bad";
  };

  const countClass = (value) => {
    const n = Number(value);

    if (Number.isNaN(n) || n === 0) return "zero";
    if (n >= 4) return "high";
    if (n >= 2) return "warn";

    return "";
  };

  const countBadge = (value) => {
    return `<span class="count-badge ${countClass(value)}">${S(value)}</span>`;
  };

  const totalOf = (arr) => {
    return arr.reduce((sum, value) => {
      const n = Number(value);
      return sum + (Number.isNaN(n) ? 0 : n);
    }, 0);
  };

  const caisSummary = fields.caisSummary?.Credit_Account || {};
  const outBal = fields.caisSummary?.Total_Outstanding_Balance || {};
  const scoreStatus = getScoreStatus(fields.score);
  const scoreLeft = getScorePercent(fields.score);

  const metaItem = (label, value) => {
    return `
      <div class="meta-item">
        <span class="meta-label">${label}</span>
        <span class="meta-value">${value}</span>
      </div>
    `;
  };

const detailField = (label, value, extraClass = "") => {
  return `
    <div class="applicant-field ${extraClass}">
      <span class="field-label">${label}</span>
      <span class="field-value">${value}</span>
    </div>
  `;
};

  const snapshotBox = (label, value, className = "") => {
    return `
      <div class="snapshot-box ${className}">
        <span class="snapshot-label">${label}</span>
        <span class="snapshot-value">${value}</span>
      </div>
    `;
  };

  const summaryCard = (label, value) => {
    return `
      <div class="summary-card">
        <span class="summary-label">${label}</span>
        <span class="summary-value">${S(value)}</span>
      </div>
    `;
  };

  const balanceCard = (label, value) => {
    return `
      <div class="balance-card">
        <span class="summary-label">${label}</span>
        <span class="balance-value">${money(value)}</span>
      </div>
    `;
  };

  const capsBox = (label, value) => {
    return `
      <div class="caps-box">
        <span class="summary-label">${label}</span>
        <div class="caps-count">${S(value)}</div>
      </div>
    `;
  };



  const capsCountClass = (value) => {
  const n = Number(value);

  if (Number.isNaN(n) || n === 0) return "zero";
  if (n >= 4) return "high";
  if (n >= 2) return "warn";

  return "";
};

const capsCount = (value) => {
  return `<span class="caps-count ${capsCountClass(value)}">${S(value)}</span>`;
};

const compactCapsSummary = (title, subtitle, summary, prefix) => {
  const last7 = summary?.[`${prefix}Last7Days`];
  const last30 = summary?.[`${prefix}Last30Days`];
  const last90 = summary?.[`${prefix}Last90Days`];
  const last180 = summary?.[`${prefix}Last180Days`];

  const total = [last7, last30, last90, last180].reduce((sum, value) => {
    const n = Number(value);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  return `
    <div class="caps-compact-card">
      <div class="caps-compact-head">
        <div>
          <div class="caps-compact-title">${title}</div>
          <div class="caps-compact-sub">${subtitle}</div>
        </div>

        <div class="caps-compact-total">
          <span class="caps-compact-total-label">Total</span>
          <span class="caps-compact-total-value">${total}</span>
        </div>
      </div>

      <div class="caps-compact-body">
        <table class="caps-compact-table">
          <thead>
            <tr>
              <th>Summary Type</th>
              <th>Last 7 Days</th>
              <th>Last 30 Days</th>
              <th>Last 90 Days</th>
              <th>Last 180 Days</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td>${title}</td>
              <td>${capsCount(last7)}</td>
              <td>${capsCount(last30)}</td>
              <td>${capsCount(last90)}</td>
              <td>${capsCount(last180)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
};

  const renderCapsRows = (capsDetails) => {
    if (!capsDetails || capsDetails.length === 0) {
      return '<tr><td colspan="6">No enquiry records</td></tr>';
    }

    return capsDetails
      .map((c, i) => {
         const enquiryReason = getExperianDescription(
          ACCOUNT_TYPE,
          c.Enquiry_Reason
        );
        return `
          <tr>
            <td>${i + 1}</td>
            <td>${S(c.Subscriber_Name)}</td>
            <td>${fmtDate(c.Date_of_Request)}</td>
            <td>${money(c.Amount_Financed)}</td>
            <td>${S(c.Duration_Of_Agreement)}</td>
            <td>${S(c.Enquiry_Reason)}</td>
          </tr>
        `;
      })
      .join("");
  };

  const renderAccountBlocks = (accounts) => {
    if (!accounts || accounts.length === 0) {
      return '<div class="empty-state">No account data available.</div>';
    }

    return accounts
      .map((acc, i) => {
        const hist = Array.isArray(acc.CAIS_Account_History)
          ? acc.CAIS_Account_History
          : acc.CAIS_Account_History
          ? [acc.CAIS_Account_History]
          : [];

        const accountType = getExperianDescription(
          ACCOUNT_TYPE,
          acc.Account_Type
        );

        
        const accountStatus = getExperianDescription(
          ACCOUNT_STATUS,
          acc.Account_Status
        );

        const writtenOffStatus = getExperianDescription(
          WRITTEN_OFF_SETTLED_STATUS,
          acc.Written_off_Settled_Status
        );

        const historyRows = hist
          .map((h) => {
            const dpd = S(h.Days_Past_Due);

            return `
              <tr>
                <td>${S(h.Year)}</td>
                <td>${S(h.Month)}</td>
                <td><span class="dpd-badge ${dpdClass(dpd)}">${dpd}</span></td>
                <td>${S(h.Asset_Classification)}</td>
              </tr>
            `;
          })
          .join("");

        return `
          <div class="account-card">
            <div class="account-head">
              <div>
                <div class="account-title">
                  Account ${i + 1}: ${S(acc.Account_Number)}
                </div>
                <div class="account-sub">
                  ${S(acc.Subscriber_Name)} • ${S(accountType)}
                </div>
              </div>

              <div class="status-pill">${S(accountStatus)}</div>
            </div>

            <div class="account-body">
              <div class="detail-grid">
                <div class="detail-box">
                  <div class="detail-label">Subscriber</div>
                  <div class="detail-value">${S(acc.Subscriber_Name)}</div>
                </div>

                <div class="detail-box">
                  <div class="detail-label">Account Type</div>
                  <div class="detail-value">${S(accountType)}</div>
                </div>

                <div class="detail-box">
                  <div class="detail-label">Status</div>
                  <div class="detail-value">${S(accountStatus)}</div>
                </div>

                <div class="detail-box">
                  <div class="detail-label">Open Date</div>
                  <div class="detail-value">${fmtDate(acc.Open_Date)}</div>
                </div>

                <div class="detail-box">
                  <div class="detail-label">Highest Credit</div>
                  <div class="detail-value">${money(
                    acc.Highest_Credit_or_Original_Loan_Amount
                  )}</div>
                </div>

                <div class="detail-box">
                  <div class="detail-label">Current Balance</div>
                  <div class="detail-value">${money(acc.Current_Balance)}</div>
                </div>

                <div class="detail-box">
                  <div class="detail-label">Amount Past Due</div>
                  <div class="detail-value">${money(acc.Amount_Past_Due)}</div>
                </div>

                <div class="detail-box">
                  <div class="detail-label">Written Off Status</div>
                  <div class="detail-value">${S(writtenOffStatus)}</div>
                </div>

                <div class="detail-box">
                  <div class="detail-label">Date Reported</div>
                  <div class="detail-value">${fmtDate(acc.Date_Reported)}</div>
                </div>
              </div>

              <div class="subheading">Days Past Due History</div>

              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Month</th>
                      <th>Days Past Due</th>
                      <th>Asset Class</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${
                      historyRows ||
                      '<tr><td colspan="4">No DPD data</td></tr>'
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  };

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />

  <style>
    :root {
      --navy: #0b1633;
      --navy-soft: #14284f;
      --blue: #1262b3;
      --green: #16a34a;
      --orange: #f59e0b;
      --red: #dc2626;
      --paper: #ffffff;
      --ink: #172033;
      --muted: #667085;
      --line: #d9e1ec;
      --line-soft: #edf1f6;
      --soft: #f8fafc;
      --soft-blue: #eff6ff;
      --soft-green: #ecfdf5;
      --soft-orange: #fffbeb;
      --soft-red: #fef2f2;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #ffffff;
      color: var(--ink);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11.5px;
      line-height: 1.5;
      font-weight: 400;
    }

    .page {
      width: 100%;
      background: var(--paper);
      overflow: hidden;
    }

    .top-line {
      height: 6px;
      background: linear-gradient(
        90deg,
        var(--navy) 0%,
        var(--blue) 48%,
        var(--green) 100%
      );
    }

    .header {
      padding: 17px 24px 14px;
      background: #ffffff;
      border-bottom: 1px solid var(--line);
    }

    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 210px;
    }

    .brand-logo-img {
      height: 48px;
      width: auto;
      object-fit: contain;
      display: block;
      background: transparent;
    }

    .brand-caption {
      padding-left: 10px;
      border-left: 1px solid var(--line);
      color: var(--muted);
      font-size: 9.5px;
      line-height: 1.35;
      letter-spacing: 0.2px;
    }

    .report-title-block {
      text-align: right;
    }

    .report-title {
      margin: 0;
      color: var(--navy);
      font-size: 20px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }

    .report-sub {
      margin-top: 4px;
      color: var(--muted);
      font-size: 10.5px;
      font-weight: 400;
    }

    .report-chip {
      display: inline-block;
      margin-top: 7px;
      border: 1px solid #b8d8ff;
      border-radius: 999px;
      padding: 4px 9px;
      color: var(--blue);
      background: var(--soft-blue);
      font-size: 9.5px;
      font-weight: 500;
    }

    .meta-panel {
      margin-top: 14px;
      display: grid;
      grid-template-columns: 0.9fr 0.9fr 0.8fr 1.4fr 1.8fr;
      border: 1px solid var(--line);
      border-radius: 10px;
      overflow: hidden;
      background: #ffffff;
    }

    .meta-item {
      padding: 8px 10px;
      border-right: 1px solid var(--line);
      min-height: 46px;
    }

    .meta-item:last-child {
      border-right: none;
    }

    .meta-label,
    .field-label,
    .summary-label,
    .detail-label {
      color: var(--muted);
      font-size: 8.8px;
      font-weight: 500;
      letter-spacing: 0.25px;
      text-transform: uppercase;
    }

    .meta-value {
      display: block;
      margin-top: 3px;
      color: var(--ink);
      font-size: 11px;
      font-weight: 400;
      word-break: break-word;
    }

    .content {
      padding: 18px 24px 24px;
    }

    .overview-grid {
      display: grid;
      grid-template-columns: 1fr 220px;
      gap: 13px;
      margin-bottom: 14px;
      align-items: stretch;
    }

   

    .card,
.score-card,
.snapshot-box,
.caps-compact-card {
  page-break-inside: avoid;
  break-inside: avoid;
}

.section,
.account-details-section,
.account-card,
.account-body,
.table-wrap,
table {
  page-break-inside: auto;
  break-inside: auto;
}

.detail-box,
tr {
  page-break-inside: avoid;
  break-inside: avoid;
}

    .card {
      border-radius: 12px;
      overflow: hidden;
      page-break-inside: avoid;
    }

    .card-head {
      padding: 9px 12px;
      background: #fbfcff;
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }

    .card-title {
      margin: 0;
      color: var(--navy);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }

    .card-hint {
      color: var(--muted);
      font-size: 9.5px;
      font-weight: 400;
    }

    .card-body {
      padding: 12px;
    }

    .applicant-name {
      color: var(--navy);
      font-size: 17px;
      font-weight: 600;
      margin-bottom: 10px;
      padding-bottom: 7px;
      border-bottom: 1px dashed var(--line);
    }

    .details-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px 18px;
  align-items: start;
}

.applicant-field {
  min-height: 42px;
}

.applicant-field.address-full {
  grid-column: 1 / -1;
  min-height: auto;
}

.field-label {
  display: block;
  color: var(--muted);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.35px;
  text-transform: uppercase;
  margin-bottom: 5px;
}

.field-value {
  display: block;
  color: var(--ink);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.45;
  word-break: break-word;
}

.applicant-field.address-full .field-value {
  font-size: 12px;
  line-height: 1.5;
}

    .score-card {
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
      page-break-inside: avoid;
    }

    .score-top {
      padding: 10px 12px;
      color: #ffffff;
      background: var(--navy);
    }

    .score-top-label {
      color: #c4d2e6;
      font-size: 9.5px;
      font-weight: 500;
      letter-spacing: 0.25px;
    }

    .score-body {
      padding: 14px 12px 11px;
      text-align: center;
    }

    .score-number {
      color: var(--navy);
      font-size: 42px;
      line-height: 1;
      font-weight: 600;
    }

    .score-status {
      margin: 9px auto 0;
      width: fit-content;
      border-radius: 999px;
      padding: 5px 11px;
      background: var(--soft-green);
      color: #166534;
      border: 1px solid #bbf7d0;
      font-size: 10.5px;
      font-weight: 500;
    }

    .score-scale {
      padding: 0 13px 13px;
    }

    .scale-track {
      height: 7px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--red), var(--orange), var(--green));
      position: relative;
      overflow: visible;
    }

    .scale-dot {
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: #ffffff;
      border: 3px solid var(--navy);
      position: absolute;
      top: -3px;
      left: var(--score-left, 70%);
      transform: translateX(-50%);
    }

    .scale-labels {
      display: flex;
      justify-content: space-between;
      margin-top: 5px;
      color: var(--muted);
      font-size: 9px;
      font-weight: 400;
    }

    .snapshot-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 9px;
      margin-bottom: 14px;
    }

    .snapshot-box {
      border: 1px solid var(--line);
      border-radius: 11px;
      padding: 9px 10px;
      background: #ffffff;
      border-top: 3px solid var(--blue);
      page-break-inside: avoid;
    }

    .snapshot-box.green {
      border-top-color: var(--green);
    }

    .snapshot-box.orange {
      border-top-color: var(--orange);
    }

    .snapshot-box.red {
      border-top-color: var(--red);
    }

    .snapshot-label {
      color: var(--muted);
      font-size: 8.8px;
      text-transform: uppercase;
      letter-spacing: 0.25px;
    }

    .snapshot-value {
      display: block;
      margin-top: 5px;
      color: var(--navy);
      font-size: 14px;
      font-weight: 500;
      word-break: break-word;
    }

   .section {
  margin-top: 14px;
  page-break-inside: auto;
  break-inside: auto;
}

.account-details-section {
  page-break-inside: auto;
  break-inside: auto;
}

    .section-title {
      margin: 0 0 8px;
      color: var(--navy);
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-title::before {
      content: "";
      width: 4px;
      height: 16px;
      border-radius: 99px;
      background: linear-gradient(180deg, var(--blue), var(--green));
      display: inline-block;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 9px;
    }

    .summary-card {
      border-radius: 11px;
      padding: 10px;
      min-height: 66px;
      background: #ffffff;
      position: relative;
      overflow: hidden;
      page-break-inside: avoid;
    }

    .summary-card::after {
      content: "";
      position: absolute;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      right: -15px;
      top: -15px;
      background: rgba(18, 98, 179, 0.09);
    }

    .summary-value {
      margin-top: 7px;
      display: block;
      color: var(--navy);
      font-size: 18px;
      font-weight: 500;
      word-break: break-word;
      position: relative;
      z-index: 1;
    }

    .balance-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 9px;
      margin-top: 9px;
    }

    .balance-card {
      border-left: 3px solid var(--green);
      border-radius: 11px;
      padding: 10px;
      background: var(--soft-green);
      min-height: 64px;
      page-break-inside: avoid;
    }

    .balance-value {
      margin-top: 7px;
      display: block;
      color: var(--navy);
      font-size: 14px;
      font-weight: 500;
      word-break: break-word;
    }

    .account-card {
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 11px;
      page-break-inside: avoid;
        break-inside: auto;

    }


    .account-head {
  page-break-after: avoid;
  break-after: avoid;
}

.account-body {
  page-break-inside: auto;
  break-inside: auto;
}

.detail-grid {
  page-break-inside: auto;
  break-inside: auto;
}

.detail-box {
  page-break-inside: avoid;
  break-inside: avoid;
}

.table-wrap {
  page-break-inside: auto;
  break-inside: auto;
}

table {
  page-break-inside: auto;
  break-inside: auto;
}

tr {
  page-break-inside: avoid;
  break-inside: avoid;
}

thead {
  display: table-header-group;
}

tbody {
  display: table-row-group;
}
    .account-card:last-child {
      margin-bottom: 0;
    }

    .account-head {
      padding: 9px 11px;
      background: linear-gradient(90deg, var(--soft-blue), #ffffff);
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }

    .account-title {
      color: var(--navy);
      font-size: 12px;
      font-weight: 600;
    }

    .account-sub {
      margin-top: 2px;
      color: var(--muted);
      font-size: 9.8px;
      font-weight: 400;
    }

    .status-pill {
      border-radius: 999px;
      padding: 4px 8px;
      color: #075985;
      background: #e0f2fe;
      border: 1px solid #bae6fd;
      font-size: 9.5px;
      font-weight: 500;
      white-space: nowrap;
    }

    .account-body {
      padding: 11px;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 7px;
      margin-bottom: 10px;
    }

    .detail-box {
      border: 1px solid var(--line-soft);
      border-radius: 9px;
      padding: 7px;
      background: #ffffff;
    }

    .detail-value {
      margin-top: 4px;
      color: var(--ink);
      font-size: 10.8px;
      font-weight: 400;
      word-break: break-word;
    }

    .subheading {
      margin: 7px 0 6px;
      color: var(--navy);
      font-size: 10.5px;
      font-weight: 500;
    }

    .table-wrap {
      border: 1px solid var(--line);
      border-radius: 10px;
      overflow: hidden;
      background: #ffffff;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      background: var(--navy);
      color: #ffffff;
      padding: 6px 7px;
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 0.2px;
      text-align: left;
      border-right: 1px solid rgba(255, 255, 255, 0.14);
    }

    th:last-child {
      border-right: none;
    }

    td {
      padding: 6px 7px;
      border-bottom: 1px solid var(--line-soft);
      font-size: 10.8px;
      color: var(--ink);
      vertical-align: top;
      word-break: break-word;
    }

    tr:nth-child(even) td {
      background: #fbfdff;
    }

    tr:last-child td {
      border-bottom: none;
    }

    .dpd-badge {
      display: inline-block;
      min-width: 40px;
      text-align: center;
      border-radius: 999px;
      padding: 3px 6px;
      font-size: 9.5px;
      font-weight: 500;
    }

    .dpd-good {
      background: var(--soft-green);
      color: #166534;
    }

    .dpd-warn {
      background: var(--soft-orange);
      color: #92400e;
    }

    .dpd-bad {
      background: var(--soft-red);
      color: #991b1b;
    }

    .caps-summary-line {
      margin-top: 9px;
      background: var(--soft);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px 9px;
      font-size: 10.5px;
      color: #344054;
      font-weight: 400;
    }

    .caps-box {
      border-radius: 11px;
      padding: 10px;
      text-align: center;
      border-top: 3px solid var(--blue);
    }

    .caps-count {
      margin-top: 7px;
      color: var(--navy);
      font-size: 20px;
      font-weight: 500;
    }

    .enquiry-overview {
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
      background: #ffffff;
      page-break-inside: avoid;
    }

    .enquiry-overview-head {
      padding: 10px 12px;
      background: linear-gradient(90deg, var(--navy), var(--navy-soft));
      color: #ffffff;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .enquiry-title {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }

    .enquiry-subtitle {
      margin-top: 2px;
      color: #c4d2e6;
      font-size: 9.3px;
      font-weight: 400;
    }

    .enquiry-total-pill {
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 999px;
      padding: 5px 10px;
      color: #ffffff;
      background: rgba(255, 255, 255, 0.09);
      font-size: 9.5px;
      font-weight: 500;
      white-space: nowrap;
    }

    .enquiry-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .enquiry-table th {
      background: #f8fafc;
      color: var(--muted);
      border-bottom: 1px solid var(--line);
      border-right: 1px solid var(--line-soft);
      padding: 8px 9px;
      text-align: center;
      font-size: 8.8px;
      font-weight: 500;
      letter-spacing: 0.25px;
      text-transform: uppercase;
    }

    .enquiry-table th:first-child {
      width: 26%;
      text-align: left;
    }

    .enquiry-table th:last-child {
      border-right: none;
      width: 13%;
    }

    .enquiry-table td {
      padding: 9px;
      border-bottom: 1px solid var(--line-soft);
      border-right: 1px solid var(--line-soft);
      text-align: center;
      font-size: 10.8px;
      vertical-align: middle;
      background: #ffffff;
    }

    .enquiry-table td:first-child {
      text-align: left;
    }

    .enquiry-table td:last-child {
      border-right: none;
    }

    .enquiry-table tr:last-child td {
      border-bottom: none;
    }

    .enquiry-row-title {
      display: block;
      color: var(--navy);
      font-size: 11px;
      font-weight: 600;
    }

    .enquiry-row-sub {
      display: block;
      margin-top: 2px;
      color: var(--muted);
      font-size: 9px;
      font-weight: 400;
    }

    .count-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 30px;
      height: 24px;
      border-radius: 999px;
      background: var(--soft-blue);
      color: var(--blue);
      font-weight: 500;
      font-size: 10.8px;
    }

    .count-badge.zero {
      background: var(--soft);
      color: var(--muted);
    }

    .count-badge.warn {
      background: var(--soft-orange);
      color: #92400e;
    }

    .count-badge.high {
      background: var(--soft-red);
      color: #991b1b;
    }

    .total-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 34px;
      height: 26px;
      border-radius: 8px;
      background: var(--navy);
      color: #ffffff;
      font-size: 11px;
      font-weight: 600;
    }

    .enquiry-note {
      padding: 8px 10px;
      background: #fbfcff;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 9.5px;
      line-height: 1.4;
    }

    .empty-state {
      border: 1px dashed var(--line);
      border-radius: 10px;
      padding: 11px;
      background: var(--soft);
      color: var(--muted);
      text-align: center;
      font-weight: 400;
    }

    .footer-note {
      margin-top: 17px;
      padding-top: 9px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      display: flex;
      justify-content: space-between;
      gap: 16px;
      font-size: 9.8px;
      font-weight: 400;
    }

    @page {
      size: A4;
      margin: 12mm;
    }

    .top-line,
    .score-top,
    th,
    .brand-logo-img,
    .enquiry-overview-head,
    .total-count,
    .count-badge {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .caps-compact-card {
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: #ffffff;
  page-break-inside: avoid;
}

.caps-compact-head {
  padding: 10px 12px;
  background: linear-gradient(90deg, var(--soft-blue), #ffffff);
  border-bottom: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.caps-compact-title {
  color: var(--navy);
  font-size: 12px;
  font-weight: 600;
}

.caps-compact-sub {
  margin-top: 2px;
  color: var(--muted);
  font-size: 9.5px;
  font-weight: 400;
}

.caps-compact-total {
  min-width: 82px;
  text-align: center;
  border-left: 1px solid var(--line);
  padding-left: 12px;
}

.caps-compact-total-label {
  display: block;
  color: var(--muted);
  font-size: 8.8px;
  text-transform: uppercase;
  letter-spacing: 0.25px;
}

.caps-compact-total-value {
  display: block;
  margin-top: 2px;
  color: var(--navy);
  font-size: 18px;
  font-weight: 600;
}

.caps-compact-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.caps-compact-table th {
  background: #fbfcff;
  color: var(--muted);
  font-size: 8.8px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.25px;
  padding: 8px 10px;
  border-right: 1px solid var(--line-soft);
  border-bottom: 1px solid var(--line);
  text-align: center;
}

.caps-compact-table th:first-child {
  text-align: left;
  width: 30%;
}

.caps-compact-table td {
  padding: 9px 10px;
  border-right: 1px solid var(--line-soft);
  text-align: center;
  font-size: 11px;
  background: #ffffff;
}

.caps-compact-table td:first-child {
  text-align: left;
  color: var(--ink);
  font-weight: 500;
}

.caps-compact-table th:last-child,
.caps-compact-table td:last-child {
  border-right: none;
}

.caps-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  border-radius: 999px;
  background: var(--soft-blue);
  color: var(--blue);
  font-weight: 600;
  font-size: 11px;
}

.caps-count.zero {
  background: var(--soft);
  color: var(--muted);
}

.caps-count.warn {
  background: var(--soft-orange);
  color: #92400e;
}

.caps-count.high {
  background: var(--soft-red);
  color: #991b1b;
}


  .appendix-sections {
  margin-top: 18px;
  page-break-inside: avoid;
  break-inside: avoid;
}

.appendix-cards {
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: #ffffff;
}

.appendix-notes {
  padding: 10px 12px;
  background: var(--soft);
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  font-size: 10.5px;
  line-height: 1.45;
}

.appendix-table-wraps {
  border: none;
  border-radius: 0;
}

.appendix-tables {
  margin: 0;
}

.appendix-table th:first-child,
.appendix-table td:first-child {
  width: 36%;
  text-align: center;
  font-weight: 500;
}

.appendix-table th {
  background: var(--navy);
  color: #ffffff;
}

.appendix-table td {
  font-size: 10.5px;
}


/* Applicant Details card border only */
.overview-grid > article.card {
  border: 1px solid var(--line);
  border-radius: 14px;
}

.overview-grid > article.card .card-head {
  border-bottom: 1px solid var(--line);
}

 .card,
    .score-card,
    .account-card,
    .summary-card,
    .balance-card,
    .caps-box {
      border: 1px solid var(--line);
      background: #ffffff;
    }

  </style>
</head>

<body>
  <div class="page">
    <div class="top-line"></div>

    <header class="header">
      <div class="header-row">
        <div class="brand">
          ${
            logoSrc
              ? `<img class="brand-logo-img" src="${logoSrc}" alt="Fintree Logo">`
              : `<div class="logo-fallback">Fintree</div>`
          }
          <div class="brand-caption">
            Finance Private Limited<br>
            Internal Credit Bureau Report
          </div>
        </div>

        <div class="report-title-block">
          <h1 class="report-title">Experian Credit Report</h1>
          <div class="report-sub">Generated automatically by system</div>
          <span class="report-chip">Credit Bureau Report</span>
        </div>
      </div>

      <div class="meta-panel">
        ${metaItem("Date", fmtDate(fields.reportDate))}
        ${metaItem("Time", S(fields.reportTime))}
        ${metaItem("Version", S(fields.version))}
        ${metaItem("Report #", S(fields.reportNumber))}
        ${metaItem("Subscriber", S(fields.bureau))}
      </div>
    </header>

    <main class="content">
      <section class="overview-grid">
        <article class="card">
          <div class="card-head">
            <h2 class="card-title">Applicant Details</h2>
            <span class="card-hint">Primary Details</span>
          </div>

          <div class="card-body">
            <div class="applicant-name">${S(fields.name)}</div>

           <div class="details-grid applicant-details-grid">
  ${detailField("Date of Birth", fmtDate(fields.dob))}
  ${detailField("PAN", S(fields.pan))}
  ${detailField("Mobile", S(fields.mobile))}
  ${detailField("Address", S(fields.address), "address-full")}
</div>
          </div>
        </article>

        <aside class="score-card" style="--score-left:${scoreLeft}%">
          <div class="score-top">
            <div class="score-top-label">Bureau Score</div>
          </div>

          <div class="score-body">
            <div class="score-number">${S(fields.score)}</div>
            <div class="score-status">${scoreStatus}</div>
          </div>

          <div class="score-scale">
            <div class="scale-track">
              <div class="scale-dot"></div>
            </div>

            <div class="scale-labels">
              <span>300</span>
              <span>900</span>
            </div>
          </div>
        </aside>
      </section>

      <section class="snapshot-grid">
        ${snapshotBox("Score Status", scoreStatus, "green")}
        ${snapshotBox(
          "Active Accounts",
          S(caisSummary.CreditAccountActive),
          "green"
        )}
        ${snapshotBox(
          "Total Outstanding",
          money(outBal.Outstanding_Balance_All),
          "orange"
        )}
        ${snapshotBox(
          "Last 30 Days Enquiries",
          S(fields.totalCapsSummary?.TotalCAPSLast30Days),
          "red"
        )}
      </section>

      <section class="section">
        <h3 class="section-title">CAIS Summary</h3>

        <div class="summary-grid">
          ${summaryCard("Total Accounts", caisSummary.CreditAccountTotal)}
          ${summaryCard("Active Accounts", caisSummary.CreditAccountActive)}
          ${summaryCard("Closed Accounts", caisSummary.CreditAccountClosed)}
          ${summaryCard("Default Accounts", caisSummary.CreditAccountDefault)}
        </div>

        <div class="balance-grid">
          ${balanceCard(
            "Unsecured Outstanding",
            outBal.Outstanding_Balance_UnSecured
          )}
          ${balanceCard(
            "Secured Outstanding",
            outBal.Outstanding_Balance_Secured
          )}
          ${balanceCard("Total Outstanding", outBal.Outstanding_Balance_All)}
        </div>
      </section>

      <section class="section account-details-section">
        <h3 class="section-title ">Account Details</h3>
        ${renderAccountBlocks(fields.caisDetails)}
      </section>

      <section class="section">
        <h3 class="section-title">CAPS Enquiries</h3>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Subscriber</th>
                <th>Date of Request</th>
                <th>Amount</th>
                <th>Tenure</th>
                <th>Reason</th>
              </tr>
            </thead>

            <tbody>
              ${renderCapsRows(fields.capsDetails)}
            </tbody>
          </table>
        </div>

        <div class="caps-summary-line">
          <b>CAPS Summary:</b>
          Last 7 Days: ${S(fields.capsSummary?.CAPSLast7Days)} |
          Last 30 Days: ${S(fields.capsSummary?.CAPSLast30Days)} |
          Last 90 Days: ${S(fields.capsSummary?.CAPSLast90Days)} |
          Last 180 Days: ${S(fields.capsSummary?.CAPSLast180Days)}
        </div>
      </section>

   <section class="section">
  <h3 class="section-title">Total CAPS Summary</h3>

  ${compactCapsSummary(
    "Total CAPS Summary",
    "All bureau enquiries grouped by period",
    fields.totalCapsSummary,
    "TotalCAPS"
  )}
</section>

<section class="section">
  <h3 class="section-title">Non-Credit CAPS Summary</h3>

  ${compactCapsSummary(
    "Non-Credit CAPS Summary",
    "Non-credit enquiry activity grouped by period",
    fields.nonCreditCapsSummary,
    "NonCreditCAPS"
  )}
</section>

    

      <section class="section appendix-sections">
  <h3 class="section-title">Appendix N - Payment Status and Payment History Profile Values</h3>

  <div class="appendix-cards">
    <div class="appendix-notes">
      <b>Response Tag:</b> &lt;Payment_History_Profile&gt;, &lt;Asset_Classification&gt;<br>
      Payment Status appears for reported month and Payment History Profile appears for the past 36 months.
      Its code and values are as follows:
    </div>

    <div class="table-wraps appendix-table-wraps">
      <table class="appendix-table">
        <thead>
          <tr>
            <th>Payment Status / Payment History Profile</th>
            <th>Description</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>N / ?</td>
            <td>Value not available</td>
          </tr>

          <tr>
            <td>0</td>
            <td>0–29 days past the due date</td>
          </tr>

          <tr>
            <td>1</td>
            <td>30–59 days past the due date</td>
          </tr>

          <tr>
            <td>2</td>
            <td>60–89 days past the due date</td>
          </tr>

          <tr>
            <td>3</td>
            <td>90–119 days past the due date</td>
          </tr>

          <tr>
            <td>4</td>
            <td>120–149 days past the due date</td>
          </tr>

          <tr>
            <td>5</td>
            <td>150–179 days past the due date</td>
          </tr>

          <tr>
            <td>6</td>
            <td>180 or more days past the due date</td>
          </tr>

          <tr>
            <td>S</td>
            <td>Asset Classification is Standard</td>
          </tr>

          <tr>
            <td>B</td>
            <td>Asset Classification is Substandard</td>
          </tr>

          <tr>
            <td>D</td>
            <td>Asset Classification is Doubtful</td>
          </tr>

          <tr>
            <td>M</td>
            <td>Asset Classification is Special Mention Account</td>
          </tr>

          <tr>
            <td>L</td>
            <td>Asset Classification is Loss</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</section>

<footer class="footer-note">
  <span>Generated automatically by system.</span>
  <span>Confidential Credit Bureau Report</span>
</footer>
    </main>
  </div>
</body>
</html>`;
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
        console.log(`PDF already generated for report id ${r.id}. Skipping.`);

      await c.commit();
      return { skipped: true };
    }
// if (Number(r.pdf_generated) === 1) {
//   const backendDir = findBackendDir(__dirname);
//   const uploadDir = path.join(backendDir, "uploads");

//   const [docs] = await c.query(
//     `SELECT file_name 
//      FROM loan_documents 
//      WHERE lan = ? AND doc_name = 'CIBIL_REPORT'
//      ORDER BY uploaded_at DESC 
//      LIMIT 1`,
//     [r.lan]
//   );

//   const existingFileName = docs?.[0]?.file_name;
//   const existingFilePath = existingFileName
//     ? path.join(uploadDir, existingFileName)
//     : null;

//   if (existingFilePath && fs.existsSync(existingFilePath)) {
//     console.log(`PDF already exists for report id ${r.id}: ${existingFilePath}`);
//     await c.commit();
//     return { skipped: true, existing_file: existingFileName };
//   }

//   console.log(`pdf_generated = 1 but file missing for report id ${r.id}. Regenerating PDF...`);
// }
    const data = parseXml(r.report_xml);
    const fields = mapFields(data);
    const { filename, filePath } = makeOutputPath(r.lan);

    await generatePdf(filePath, html(fields));

// if (!fs.existsSync(filePath)) {
//   throw new Error(`PDF not stored at expected path: ${filePath}`);
// }

// const pdfStat = fs.statSync(filePath);

// if (!pdfStat.size || pdfStat.size <= 0) {
//   throw new Error(`PDF file created but empty: ${filePath}`);
// }

// console.log("PDF STORED SUCCESSFULLY =>", filePath);
// console.log("PDF SIZE =>", pdfStat.size, "bytes");

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
