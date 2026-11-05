// // Arthavidhi only: annual reducing interest, daily instalments, actual/365.
// // Currency balances are held in integer paise so the last instalment closes exactly.
// function buildDailySchedule(loanAmount, annualRate, tenureDays, disbursementDate) {
//   const principal = Number(loanAmount);
//   const rate = Number(annualRate);
//   const days = Number(tenureDays);
//   if (loanAmount == null || annualRate == null || !Number.isFinite(principal) || principal <= 0 ||
//       !Number.isFinite(rate) || rate < 0 || rate > 100 ||
//       !Number.isInteger(days) || days < 1 || days > 3660) {
//     throw new Error("Invalid Arthavidhi amount, annual interest rate or tenure in days");
//   }
//   const dateText = disbursementDate instanceof Date
//     ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(disbursementDate)
//     : String(disbursementDate || "");
//   const start = new Date(`${dateText}T00:00:00Z`);
//   if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== dateText) {
//     throw new Error("Invalid Arthavidhi disbursement date");
//   }
//   let balance = Math.round(principal * 100);
//   if (!Number.isSafeInteger(balance) || Math.abs(balance / 100 - principal) > 1e-7) throw new Error("Principal must have at most two decimal places");
//   const dailyRate = rate / 365 / 100;
//   const factor = Math.pow(1 + dailyRate, days);
//   const payment = Math.round(dailyRate === 0 ? balance / days : balance * dailyRate * factor / (factor - 1));
//   if (payment < 1) throw new Error("Daily instalment must be at least one paisa");
//   const rows = [];
//   let interestTotal = 0;
//   for (let i = 1; i <= days; i++) {
//     const opening = balance;
//     const interest = Math.round(opening * dailyRate);
//     const principalPart = i === days ? opening : Math.min(opening, payment - interest);
//     if (principalPart <= 0) throw new Error("Daily instalment does not amortize the loan");
//     balance -= principalPart;
//     interestTotal += interest;
//     const due = new Date(start);
//     due.setUTCDate(due.getUTCDate() + i);
//     rows.push({ emi_no: i, due_date: due.toISOString().slice(0, 10), opening: opening / 100,
//       principal: principalPart / 100, interest: interest / 100, emi: (principalPart + interest) / 100,
//       closing: balance / 100, status: "Pending" });
//   }
//   return { principal, flatRate: rate, tenureDays: days, emi: payment / 100, totalFlatInterest: interestTotal / 100,
//     preEmiInterest: 0, preEmiDays: 0, totalRepayment: (Math.round(principal * 100) + interestTotal) / 100,
//     reducingAnnualRate: rate, firstDueDate: rows[0].due_date, rpsData: rows };
// }

// // Current uploaded policy: monthly reducing EMI, due on the 5th. The first
// // instalment is on the 5th of the month following disbursement. The legacy daily
// // calculator above is retained only for inspecting historical daily schedules.
// function buildMonthlySchedule(amount,annualRate,tenureMonths,date) {
//   const principal=Number(amount),rate=Number(annualRate),months=Number(tenureMonths);
//   if(amount==null||annualRate==null||!Number.isFinite(principal)||principal<=0||!Number.isFinite(rate)||rate<0||rate>100||!Number.isInteger(months)||months<6||months>18)throw new Error("Invalid Arthavidhi monthly amount, rate or tenure (6-18 months)");
//   const text=date instanceof Date?new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(date):String(date||"");
//   const start=new Date(`${text}T00:00:00Z`);
//   if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==text)throw new Error("Invalid Arthavidhi schedule date");
//   let balance=Math.round(principal*100);
//   if(!Number.isSafeInteger(balance)||Math.abs(balance/100-principal)>1e-7)throw new Error("Principal must have at most two decimal places");
//   const monthlyRate=rate/1200,factor=Math.pow(1+monthlyRate,months);
//   const payment=Math.round(monthlyRate===0?balance/months:balance*monthlyRate*factor/(factor-1));
//   const rows=[];let totalInterest=0;
//   for(let i=1;i<=months;i++){
//     const opening=balance,interest=Math.round(opening*monthlyRate),principalPart=i===months?opening:Math.min(opening,payment-interest);
//     if(principalPart<=0)throw new Error("Monthly EMI does not amortize the loan");
//     balance-=principalPart;totalInterest+=interest;
//     const due=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+i,5));
//     rows.push({emi_no:i,due_date:due.toISOString().slice(0,10),opening:opening/100,interest:interest/100,principal:principalPart/100,emi:(principalPart+interest)/100,closing:balance/100,status:"Pending"});
//   }
//   return {principal,flatRate:rate,tenureMonths:months,tenureUnit:"months",repaymentFrequency:"monthly",emi:payment/100,totalFlatInterest:totalInterest/100,preEmiInterest:0,preEmiDays:0,totalRepayment:(Math.round(principal*100)+totalInterest)/100,reducingAnnualRate:rate,firstDueDate:rows[0].due_date,rpsData:rows};
// }

// async function generateRepaymentScheduleArthavidhiCapital(conn, lan, amount, rate, tenure, date, product, lender, { persist = true } = {}) {
//   if (!/^AVCL\d+$/.test(lan)) throw new Error("Invalid Arthavidhi LAN");
//   const result = buildMonthlySchedule(amount, rate, tenure, date);
//   if (persist) {
//     if (!conn || typeof conn.query !== "function") throw new Error("Database connection required");
//     const [existing] = await conn.query("SELECT id FROM manual_rps_arthavidhi_capital WHERE lan=? LIMIT 1", [lan]);
//     if (existing.length) throw new Error("Arthavidhi repayment schedule already exists; reconcile before regenerating");
//     await conn.query(`INSERT INTO manual_rps_arthavidhi_capital
//       (lan,due_date,status,emi,interest,principal,opening,closing,remaining_emi,remaining_interest,remaining_principal,remaining_amount)
//       VALUES ?`, [result.rpsData.map(r => [lan,r.due_date,r.status,r.emi,r.interest,r.principal,r.opening,r.closing,r.emi,r.interest,r.principal,r.emi])]);
//     await conn.query(`UPDATE loan_booking_arthavidhi SET emi_amount=?,reducing_roi=?,flat_interest=?,total_repayment=? WHERE lan=?`,
//       [result.emi,rate,result.totalFlatInterest,result.totalRepayment,lan]);
//   }
//   return result;
// }
// module.exports = { buildDailySchedule, buildMonthlySchedule, generateRepaymentScheduleArthavidhiCapital };





// =====================================================
// DAILY SCHEDULE — retained for historical schedules
// Annual reducing interest, daily instalments, actual/365.
// Calculations use integer paise.
// =====================================================

function buildDailySchedule(
  loanAmount,
  annualRate,
  tenureDays,
  disbursementDate,
) {
  const principal = Number(loanAmount);
  const rate = Number(annualRate);
  const days = Number(tenureDays);

  // Validate loan terms.
  if (
    loanAmount == null ||
    annualRate == null ||
    !Number.isFinite(principal) ||
    principal <= 0 ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 100 ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 3660
  ) {
    throw new Error(
      "Invalid Arthavidhi amount, annual interest rate or tenure in days",
    );
  }

  // Convert the disbursement date to YYYY-MM-DD.
  const dateText =
    disbursementDate instanceof Date
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(disbursementDate)
      : String(disbursementDate || "");

  const start = new Date(`${dateText}T00:00:00Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateText) ||
    !Number.isFinite(start.getTime()) ||
    start.toISOString().slice(0, 10) !== dateText
  ) {
    throw new Error("Invalid Arthavidhi disbursement date");
  }

  // Store the principal balance in paise.
  let balance = Math.round(principal * 100);

  if (
    !Number.isSafeInteger(balance) ||
    Math.abs(balance / 100 - principal) > 1e-7
  ) {
    throw new Error(
      "Principal must have at most two decimal places",
    );
  }

  // Calculate the regular daily instalment.
  const dailyRate = rate / 365 / 100;
  const factor = Math.pow(1 + dailyRate, days);

  const payment = Math.round(
    dailyRate === 0
      ? balance / days
      : (balance * dailyRate * factor) / (factor - 1),
  );

  if (payment < 1) {
    throw new Error(
      "Daily instalment must be at least one paisa",
    );
  }

  const rows = [];
  let interestTotal = 0;

  for (let i = 1; i <= days; i++) {
    const opening = balance;
    const interest = Math.round(opening * dailyRate);

    // The last instalment clears the remaining principal.
    const principalPart =
      i === days
        ? opening
        : Math.min(opening, payment - interest);

    if (principalPart <= 0) {
      throw new Error(
        "Daily instalment does not amortize the loan",
      );
    }

    balance -= principalPart;
    interestTotal += interest;

    // First daily instalment is due one day after disbursement.
    const due = new Date(start);
    due.setUTCDate(due.getUTCDate() + i);

    rows.push({
      emi_no: i,
      due_date: due.toISOString().slice(0, 10),
      opening: opening / 100,
      principal: principalPart / 100,
      interest: interest / 100,
      emi: (principalPart + interest) / 100,
      closing: balance / 100,
      status: "Pending",
    });
  }

  return {
    principal,
    flatRate: rate,
    tenureDays: days,
    emi: payment / 100,
    totalFlatInterest: interestTotal / 100,
    preEmiInterest: 0,
    preEmiDays: 0,
    totalRepayment:
      (Math.round(principal * 100) + interestTotal) / 100,
    reducingAnnualRate: rate,
    firstDueDate: rows[0].due_date,
    rpsData: rows,
  };
}

// =====================================================
// MONTHLY SCHEDULE — used by the active RPS generator
// Monthly reducing EMI, due on the 5th.
// First EMI: 5th of the month after disbursement.
// =====================================================

function buildMonthlySchedule(
  amount,
  annualRate,
  tenureMonths,
  date,
) {
  const principal = Number(amount);
  const rate = Number(annualRate);
  const months = Number(tenureMonths);

  // Validate loan terms.
  if (
    amount == null ||
    annualRate == null ||
    !Number.isFinite(principal) ||
    principal <= 0 ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 100 ||
    !Number.isInteger(months) ||
    months < 6 ||
    months > 18
  ) {
    throw new Error(
      "Invalid Arthavidhi monthly amount, rate or tenure (6-18 months)",
    );
  }

  // Convert the disbursement date to YYYY-MM-DD.
  const text =
    date instanceof Date
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(date)
      : String(date || "");

  const start = new Date(`${text}T00:00:00Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    !Number.isFinite(start.getTime()) ||
    start.toISOString().slice(0, 10) !== text
  ) {
    throw new Error("Invalid Arthavidhi schedule date");
  }

  // Store the principal balance in paise.
  let balance = Math.round(principal * 100);

  if (
    !Number.isSafeInteger(balance) ||
    Math.abs(balance / 100 - principal) > 1e-7
  ) {
    throw new Error(
      "Principal must have at most two decimal places",
    );
  }

  // Calculate the regular monthly EMI.
  const monthlyRate = rate / 1200;
  const factor = Math.pow(1 + monthlyRate, months);

  const payment = Math.round(
    monthlyRate === 0
      ? balance / months
      : (balance * monthlyRate * factor) / (factor - 1),
  );

  const rows = [];
  let totalInterest = 0;

  for (let i = 1; i <= months; i++) {
    const opening = balance;
    const interest = Math.round(opening * monthlyRate);

    // The last instalment clears the remaining principal.
    const principalPart =
      i === months
        ? opening
        : Math.min(opening, payment - interest);

    if (principalPart <= 0) {
      throw new Error(
        "Monthly EMI does not amortize the loan",
      );
    }

    balance -= principalPart;
    totalInterest += interest;

    // Each instalment falls on the 5th of its month.
    const due = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth() + i,
        5,
      ),
    );

    rows.push({
      emi_no: i,
      due_date: due.toISOString().slice(0, 10),
      opening: opening / 100,
      interest: interest / 100,
      principal: principalPart / 100,
      emi: (principalPart + interest) / 100,
      closing: balance / 100,
      status: "Pending",
    });
  }

  return {
    principal,
    flatRate: rate,
    tenureMonths: months,
    tenureUnit: "months",
    repaymentFrequency: "monthly",
    emi: payment / 100,
    totalFlatInterest: totalInterest / 100,
    preEmiInterest: 0,
    preEmiDays: 0,
    totalRepayment:
      (Math.round(principal * 100) + totalInterest) / 100,
    reducingAnnualRate: rate,
    firstDueDate: rows[0].due_date,
    rpsData: rows,
  };
}

// =====================================================
// GENERATE AND SAVE ARTHAVIDHI MONTHLY RPS
// persist: false → calculate and return without DB writes.
// persist: true  → insert RPS and update the booking.
// =====================================================

async function generateRepaymentScheduleArthavidhiCapital(
  conn,
  lan,
  amount,
  rate,
  tenure,
  date,
  product,
  lender,
  { persist = true } = {},
) {
  if (!/^AVCL\d+$/.test(lan)) {
    throw new Error("Invalid Arthavidhi LAN");
  }

  const result = buildMonthlySchedule(
    amount,
    rate,
    tenure,
    date,
  );

  if (persist) {
    if (!conn || typeof conn.query !== "function") {
      throw new Error("Database connection required");
    }

    // Prevent replacement of an existing schedule.
    const [existing] = await conn.query(
      `
      SELECT id
      FROM manual_rps_arthavidhi_capital
      WHERE lan = ?
      LIMIT 1
      `,
      [lan],
    );

    if (existing.length) {
      throw new Error(
        "Arthavidhi repayment schedule already exists; reconcile before regenerating",
      );
    }

    // Save instalments and their outstanding balances.
    await conn.query(
      `
      INSERT INTO manual_rps_arthavidhi_capital (
        lan,
        due_date,
        status,
        emi,
        interest,
        principal,
        opening,
        closing,
        remaining_emi,
        remaining_interest,
        remaining_principal,
        remaining_amount
      )
      VALUES ?
      `,
      [
        result.rpsData.map((row) => [
          lan,
          row.due_date,
          row.status,
          row.emi,
          row.interest,
          row.principal,
          row.opening,
          row.closing,
          row.emi,
          row.interest,
          row.principal,
          row.emi,
        ]),
      ],
    );

    // Save repayment totals against the loan.
    await conn.query(
      `
      UPDATE loan_booking_arthavidhi
      SET
        emi_amount = ?,
        reducing_roi = ?,
        flat_interest = ?,
        total_repayment = ?
      WHERE lan = ?
      `,
      [
        result.emi,
        rate,
        result.totalFlatInterest,
        result.totalRepayment,
        lan,
      ],
    );
  }

  return result;
}

module.exports = {
  buildDailySchedule,
  buildMonthlySchedule,
  generateRepaymentScheduleArthavidhiCapital,
};