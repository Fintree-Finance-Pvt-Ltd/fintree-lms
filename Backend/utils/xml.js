const { parseStringPromise } = require('xml2js');

function get(node, pathArr) {
  let cur = node;
  for (const p of pathArr) {
    if (!cur || typeof cur !== 'object') return '';
    const v = cur[p];
    if (!v) return '';
    cur = Array.isArray(v) ? v[0] : v;
  }
  if (typeof cur === 'string') return cur.trim();
  return (cur?._ ?? cur ?? '').toString().trim();
}

function fmtDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd || '';
  const yyyy = yyyymmdd.slice(0,4), mm = yyyymmdd.slice(4,6), dd = yyyymmdd.slice(6,8);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${dd}-${months[parseInt(mm,10)-1]}-${yyyy}`;
}

async function extractSummary(xmlText) {
  const obj = await parseStringPromise(xmlText, { explicitArray: true, explicitCharkey: true, trim: true });
  const root = obj?.INProfileResponse || {};

  const reportNo   = get(root, ['CreditProfileHeader','ReportNumber']);
  const reportDate = get(root, ['CreditProfileHeader','ReportDate']);
  const reportTime = get(root, ['CreditProfileHeader','ReportTime']);
  const score      = get(root, ['SCORE','BureauScore']);

  const first = get(root, ['Current_Application','Current_Application_Details','Current_Applicant_Details','First_Name']);
  const last  = get(root, ['Current_Application','Current_Application_Details','Current_Applicant_Details','Last_Name']);
  const dob   = get(root, ['Current_Application','Current_Application_Details','Current_Applicant_Details','Date_Of_Birth_Applicant']);
  const pan   = get(root, ['Current_Application','Current_Application_Details','Current_Applicant_Details','IncomeTaxPan']);
  const phone = get(root, ['Current_Application','Current_Application_Details','Current_Applicant_Details','Telephone_Number_Applicant_1st']);

  const addrFlat  = get(root, ['Current_Application','Current_Application_Details','Current_Applicant_Address_Details','FlatNoPlotNoHouseNo']);
  const addrCity  = get(root, ['Current_Application','Current_Application_Details','Current_Applicant_Address_Details','City']);
  const addrState = get(root, ['Current_Application','Current_Applicant_Address_Details','State']); // fallback
  const addrPIN   = get(root, ['Current_Application','Current_Application_Details','Current_Applicant_Address_Details','PINCode']);

  const outstandingAll   = get(root, ['CAIS_Account','CAIS_Summary','Total_Outstanding_Balance','Outstanding_Balance_All']);
  const outstandingUnsec = get(root, ['CAIS_Account','CAIS_Summary','Total_Outstanding_Balance','Outstanding_Balance_UnSecured']);
  const creditTotal      = get(root, ['CAIS_Account','CAIS_Summary','Credit_Account','CreditAccountTotal']);
  const creditActive     = get(root, ['CAIS_Account','CAIS_Summary','Credit_Account','CreditAccountActive']);

  const acc = root?.CAIS_Account?.CAIS_Account_DETAILS?.[0] ?? {};
  const openDate = get(acc, ['Open_Date']);
  const currBal  = get(acc, ['Current_Balance']);
  const lastPay  = get(acc, ['Date_of_Last_Payment']);

  const capsLast30 = get(root, ['CAPS','CAPS_Summary','CAPSLast30Days']);

  return {
    reportNo,
    reportDate: fmtDate(reportDate),
    reportTime,
    score,
    applicant: {
      first, last, dob: fmtDate(dob), pan, phone,
      address: `${addrFlat}, ${addrCity}, StateCode ${addrState} - ${addrPIN}`.replace(/^,\s*/,'').trim()
    },
    creditSummary: { creditTotal, creditActive, outstandingAll, outstandingUnsec },
    latestAccount: { openDate: fmtDate(openDate), currBal, lastPay: fmtDate(lastPay) },
    caps: { last30: capsLast30 }
  };
}

module.exports = { extractSummary };
