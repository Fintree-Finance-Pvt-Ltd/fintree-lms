// // utils/emiDateCalculator.js
// const db = require("../config/db");

// function getFirstEmiDate(disbursementDate, lender, product) {
//     const disbDate = new Date(disbursementDate);
//     const disbDay = disbDate.getDate();

//     // ✅ EV Loan: Monthly Loan EMI due based on 5th cut-off logic
//     if (lender === "EV Loan" && product === "Monthly Loan") {
//         const dueDate = new Date(disbDate);

//         if (disbDay <= 5) {
//             dueDate.setMonth(dueDate.getMonth() + 1);
//         } else {
//             dueDate.setMonth(dueDate.getMonth() + 2);
//         }

//         dueDate.setDate(5);
//         console.log(`[EV Monthly Loan] EMI due: ${dueDate.toISOString().split("T")[0]}`);
//         return dueDate;
//     }

//     // ✅ BL Loan: Monthly Loan EMI due follows same 5th cut-off logic
//     else if (lender === "BL Loan" && product === "Monthly Loan") {
//         const dueDate = new Date(disbDate);

//         if (disbDay <= 5) {
//             dueDate.setMonth(dueDate.getMonth() + 1);
//         } else {
//             dueDate.setMonth(dueDate.getMonth() + 2);
//         }

//         dueDate.setDate(5);
//         console.log(`[BL Monthly Loan] EMI due: ${dueDate.toISOString().split("T")[0]}`);
//         return dueDate;
//     }

//     // ✅ GQ Non-FSF: EMI due follows 5th-of-month cutoff logic
// else if (lender === "GQ Non-FSF" && product === "Bureau Score Based") {
//     const dueDate = new Date(disbDate);
//     const disbDay = disbDate.getDate();

//     if (disbDay <= 5) {
//         dueDate.setMonth(dueDate.getMonth() + 1);
//     } else {
//         dueDate.setMonth(dueDate.getMonth() + 2);
//     }

//     dueDate.setDate(5); // Due on 5th of the month
//     console.log(`[GQ Non-FSF] EMI due: ${dueDate.toISOString().split("T")[0]}`);
//     return dueDate;
// }



//     // ✅ BL Loan: Daily Loan starts from next day
//     else if (lender === "BL Loan" && product === "Daily Loan") {
//         const dailyDue = new Date(disbDate);
//         dailyDue.setDate(disbDate.getDate() + 1);
//         console.log(`[Daily Loan] EMI due: ${dailyDue.toISOString().split("T")[0]}`);
//         return dailyDue;
//     }

//     // ❌ Fallback
//     const fallbackDue = new Date(disbDate);
//     fallbackDue.setMonth(fallbackDue.getMonth() + 1);
//     fallbackDue.setDate(5);
//     console.log(`[Fallback] EMI due: ${fallbackDue.toISOString().split("T")[0]}`);
//     return fallbackDue;
// }

// module.exports = {
//     getFirstEmiDate,
// };
//////////////////////////////////////////////

/**
 * Calculates the first EMI due date based on disbursement date, lender, product, and optional offset.
 * 
 * @param {string|Date} disbursementDate - The original disbursal date.
 * @param {string} lender - Lender type (e.g., "BL Loan", "EV Loan", "GQ Non-FSF").
 * @param {string} product - Product type (e.g., "Monthly Loan", "Daily Loan", "Bureau Score Based").
 * @param {number} monthOffset - Additional months to offset for EMI (used in RPS loops).
 * @returns {Date} - Calculated EMI due date.
 */



// utils/emiDateCalculator.js
const db = require("../config/db");
const { isCarepayLoanType } = require("./constant.js");

// ✅ Excel serial date to JS date (YYYY-MM-DD)
const excelSerialDateToJS = (value) => {
  if (!value) return null;

  if (!isNaN(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + value * 86400000)
      .toISOString()
      .split("T")[0];
  }

  if (typeof value === "string" && value.match(/^\d{2}-[A-Za-z]{3}-\d{2}$/)) {
    const [day, monthAbbr, yearShort] = value.split("-");
    const monthNames = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const month = monthNames[monthAbbr];
    const year = parseInt("20" + yearShort, 10);
    return new Date(Date.UTC(parseInt(day), month, year))
      .toISOString()
      .split("T")[0];
  }

  return null;
};

const formatDateYMD = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

// //// clampDay Function //////////////////
// function clampDay(year, month, day) {
//     // JS months are 0-indexed: 0=Jan, 1=Feb, ... 11=Dec
//     const lastDay = new Date(year, month + 1, 0).getDate(); 
//     return Math.min(day, lastDay);
// }





function getFirstEmiDate(disbursementDate, emiDate, lender, product, monthOffset = 0, salaryDay ) {
    const disbDate = new Date(disbursementDate);
    if (Number.isNaN(disbDate.getTime())) {
    throw new Error(`Invalid disbursementDate: ${disbursementDate}`);
  }
    const disbDay = disbDate.getDate();

/////////////////// EV Loan /////////////////

// ================= WCTL FFPL =================

const normalizedLender = String(lender || "")
  .trim()
  .toUpperCase()
  .replace(/[\s_-]/g, "");

const normalizedProduct = String(product || "")
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, "_")
  .replace(/_+/g, "_");

if (normalizedLender === "WCTLFFPL") {
  const dueDate = new Date(disbDate);

  const productIntervals = {
    monthly_360: {
      type: "MONTH",
      interval: 1,
      basis: 360,
    },
    quaterly_360: {
      type: "MONTH",
      interval: 3,
      basis: 360,
    },
    quarterly_360: {
      type: "MONTH",
      interval: 3,
      basis: 360,
    },
    half_yearly_360: {
      type: "MONTH",
      interval: 6,
      basis: 360,
    },
    yearly_360: {
      type: "MONTH",
      interval: 12,
      basis: 360,
    },

    monthly_365: {
      type: "MONTH",
      interval: 1,
      basis: 365,
    },
    quaterly_365: {
      type: "MONTH",
      interval: 3,
      basis: 365,
    },
    quarterly_365: {
      type: "MONTH",
      interval: 3,
      basis: 365,
    },
    half_yearly_365: {
      type: "MONTH",
      interval: 6,
      basis: 365,
    },
    yearly_365: {
      type: "MONTH",
      interval: 12,
      basis: 365,
    },

    daily_365: {
      type: "DAY",
      interval: 1,
      basis: 365,
    },
    daily_360: {
      type: "DAY",
      interval: 1,
      basis: 360,
    },
  };

  const config = productIntervals[normalizedProduct];

  if (!config) {
    throw new Error(
      `Unsupported WCTL FFPL product: ${product}`,
    );
  }

  const installmentOffset = Number(monthOffset || 0);

  if (
    !Number.isInteger(installmentOffset) ||
    installmentOffset < 0
  ) {
    throw new Error(
      `Invalid WCTL FFPL monthOffset: ${monthOffset}`,
    );
  }

  if (config.type === "DAY") {
    /*
     * Daily products:
     * First repayment  → next day
     * Second repayment → two days after disbursement
     */
    dueDate.setDate(
      dueDate.getDate() +
        config.interval * (installmentOffset + 1),
    );
  } else {
    const disbursementDay = disbDate.getDate();

    /*
     * WCTL FFPL cutoff:
     * Disbursed on or before 20th → normal frequency
     * Disbursed after 20th        → one extra month
     */
    const cutoffExtraMonth =
      disbursementDay <= 20 ? 0 : 1;

    const monthsToAdd =
      config.interval * (installmentOffset + 1) +
      cutoffExtraMonth;

    // Prevent JavaScript month rollover
    dueDate.setDate(1);

    dueDate.setMonth(
      dueDate.getMonth() + monthsToAdd,
    );

    // Repayment is always due on the 5th
    dueDate.setDate(5);
  }

  dueDate.setHours(12, 0, 0, 0);

  console.log("[WCTL FFPL EMI DATE]", {
    lender,
    product,
    normalizedProduct,
    frequency: config.type,
    interval: config.interval,
    dayCountBasis: config.basis,
    installmentNumber: installmentOffset + 1,
    disbursementDay: disbDate.getDate(),
    cutoffApplied:
      config.type === "MONTH" &&
      disbDate.getDate() > 20,
    disbursementDate: disbDate
      .toISOString()
      .split("T")[0],
    dueDate: dueDate
      .toISOString()
      .split("T")[0],
  });

  return dueDate;
}




    // ✅ EV Loan: Monthly Loan EMI due based on 5th cut-off logic
    if (lender === "Embifi" && product === "Monthly Loan") {
        const dueDate = new Date(disbDate);

        if (disbDay <= 5) {
            dueDate.setMonth(dueDate.getMonth() + 1);
        } else {
            dueDate.setMonth(dueDate.getMonth() + 2);
        }

        dueDate.setDate(5);
        console.log(`[Embifi Monthly Loan] EMI due: ${dueDate.toISOString().split("T")[0]}`);
        return dueDate;
    }
//////////////// EMI CLUB EMI DATE ////////////////////
// ✅ EMI Club: Monthly EMI due based on 25th cut-off logic
if (lender === "EMICLUB" && product === "Monthly Loan") {
  const dueDate = new Date(disbDate);
  const disbDay = dueDate.getDate();

  if (disbDay <= 25) {
    // Disbursed between 1st–25th → Next month 5th
    dueDate.setMonth(dueDate.getMonth() + 1);
  } else {
    // Disbursed after 25th → Next-to-next month 5th
    dueDate.setMonth(dueDate.getMonth() + 2);
  }

  dueDate.setDate(5);
  console.log(
    `[EmiClub Monthly Loan] Disbursement Day: ${disbDay}, EMI Due: ${dueDate
      .toISOString()
      .split("T")[0]}`
  );
  return dueDate;
}

///////////////////////LOAN DIGIT ///////////////
// ✅ Loan Digit: Monthly EMI due based on 25th cut-off logic
if (lender === "LOAN-DIGIT" && product === "Loan Digit") {
  const dueDate = new Date(disbDate);
  const disbDay = dueDate.getDate();

  if (disbDay <= 5) {
    // Disbursed between 1st–25th → Next month 5th
    dueDate.setMonth(dueDate.getMonth() + 1);
  } else {
    // Disbursed after 25th → Next-to-next month 5th
    dueDate.setMonth(dueDate.getMonth() + 2);
  }

  dueDate.setDate(5);
  console.log(
    `[Loan Digit Monthly Loan] Disbursement Day: ${disbDay}, EMI Due: ${dueDate
      .toISOString()
      .split("T")[0]}`
  );
  return dueDate;
}

/////////////////// Loan Digit end///////////////

/////// Motion Corp ///////////////////

// ✅ Loan Digit: Monthly EMI due based on 15th cut-off logic
/////////////////////// MOTION CORP ///////////////////

// ✅ Motion Corp Monthly Loan EMI logic
if (lender === "Motion Corp" && product === "Monthly Loan") {

  const dueDate = new Date(disbDate);

  const disbDay = dueDate.getDate();

  // Set EMI day first to avoid JS rollover issues
  dueDate.setDate(5);

  if (disbDay <= 15) {

    // Disbursed between 1st–15th
    // → Next month 5th

    dueDate.setMonth(dueDate.getMonth() + 1);

  } else {

    // Disbursed between 16th–31st
    // → Next-to-next month 5th

    dueDate.setMonth(dueDate.getMonth() + 2);
  }

  console.log(
    `[Motion Corp Monthly Loan] Disbursement Day: ${disbDay}, EMI Due: ${
      dueDate.toISOString().split("T")[0]
    }`
  );

  return dueDate;
}

if (lender === "SRBH" && product === "Monthly Loan") {

  const dueDate = new Date(disbDate);

  const disbDay = dueDate.getDate();

  // Set EMI day first to avoid JS rollover issues
  dueDate.setDate(5);

  if (disbDay <= 15) {

    // Disbursed between 1st–15th
    // → Next month 5th

    dueDate.setMonth(dueDate.getMonth() + 1);

  } else {

    // Disbursed between 16th–31st
    // → Next-to-next month 5th

    dueDate.setMonth(dueDate.getMonth() + 2);
  }

  console.log(
    `[SRBH Monthly Loan] Disbursement Day: ${disbDay}, EMI Due: ${
      dueDate.toISOString().split("T")[0]
    }`
  );

  return dueDate;
}
///////////////////////ZYPAY FIRST EMI DATE /////////////////////////
if (lender === "ZYPAY" && product === "Monthly Loan") {
  const dueDate = new Date(disbDate);
  const disbDay = dueDate.getDate();

  if (disbDay <= 25) {
    // Disbursed between 1st–25th → Next month 5th
    dueDate.setMonth(dueDate.getMonth() + 1);
  } else {
    // Disbursed after 25th → Next-to-next month 5th
    dueDate.setMonth(dueDate.getMonth() + 2);
  }

  dueDate.setDate(5);
  console.log(
    `[EmiClub Monthly Loan] Disbursement Day: ${disbDay}, EMI Due: ${dueDate
      .toISOString()
      .split("T")[0]}`
  );
  return dueDate;
}


///////////////////// ADIKOSH /////////////////

    // ✅ Adikosh Logic: EMI day based on salaryDay + 2
    // if (lender === "Adikosh" && typeof salaryDay === "number") {
    //     console.log(`[Adikosh] Salary Day: ${salaryDay}`);
    //     const emiStartDay = salaryDay + 2;
    //     const emiMonthOffset = disbDay <= salaryDay ? 1 + monthOffset : 2 + monthOffset;

    //     const emiDate = new Date(disbDate); // clone original date
    //     emiDate.setMonth(disbDate.getMonth() + emiMonthOffset);
    //     emiDate.setDate(emiStartDay); // always set to salaryDay + 2

    //     console.log(`[Adikosh] EMI due: ${emiDate.toISOString().split("T")[0]} (Salary Day: ${salaryDay})`);
    //     return emiDate;
    // }

   // Wrap a day on a 31-day cycle: e.g., 31+2=33 → 2
const wrapOn31 = (d) => ((d - 1) % 31) + 1;

if (lender === "Adikosh" && Number.isFinite(Number(salaryDay))) {
  const sDay = Number(salaryDay);
  const disb = new Date(disbursementDate);
  const disbDay = disb.getDate();

  // target month: next if disbDay <= salaryDay, else month after next
  const monthOffsetEff = (disbDay <= sDay ? 1 : 2) + (monthOffset || 0);

  // desired EMI day using 31-wrap rule (salaryDay + 2, wrap at 31)
  const desiredDay = wrapOn31(sDay + 2); // if sDay=31 -> 2

  // build date safely (avoid overflow)
  const emiDate = new Date(disb);
  emiDate.setHours(12,0,0,0);
  emiDate.setDate(1);                               // prevent carryover issues
  emiDate.setMonth(emiDate.getMonth() + monthOffsetEff);
  emiDate.setDate(desiredDay);                      // e.g., 2

  // e.g., for disb=2025-08-30, sDay=31 => 2025-09-02 ✅


    console.log(`[Adikosh] EMI due: ${emiDate.toISOString().split("T")[0]} (Salary Day: ${salaryDay})`);
    return emiDate;
}


    // ✅ BL Loan: Monthly Loan EMI due follows same 5th cut-off logic
    else if (lender === "BL Loan" && product === "Monthly Loan") {
        const dueDate = new Date(disbDate);

        if (disbDay <= 20) {
            dueDate.setMonth(dueDate.getMonth() + 1);
        } else {
            dueDate.setMonth(dueDate.getMonth() + 2);
        }
        
        dueDate.setDate(5);
        console.log(`[BL Monthly Loan] EMI due: ${dueDate.toISOString().split("T")[0]}`);
        return dueDate;
    }

// ✅ GQ Non-FSF: EMI due follows 5th-of-month cutoff logic
// else if (lender === "GQ Non-FSF" && product === "Bureau Score Based") {
//     const disbDate = new Date(disbursementDate); // use original disbursementDate param
//     console.log("disbdate", disbDate);
//     const disbDay = disbDate.getDate();
//     console.log("disbDay", disbDay)
//     const dueDate = new Date(emiDate);
//     console.log("Due Date before adjustment:", dueDate);
//     if (disbDay <= 20) {
//         dueDate.setMonth(dueDate.getMonth() + 1 + monthOffset);
//       } else {
//         dueDate.setMonth(dueDate.getMonth() + 2 + monthOffset);
//       }
//     dueDate.setDate(emiDate); // Always due on the emi day basis
//     console.log(`[GQ Non-FSF] EMI due (cutoff logic): ${dueDate.toISOString().split("T")[0]}`);

//     return dueDate;
// }
else if (lender === "GQ Non-FSF" && product === "Bureau Score Based") {
  // --- Step 1: Parse disbursementDate manually ---
  let disbDate;

  if (typeof disbursementDate === "string" && disbursementDate.includes("-")) {
    //const [day, monthAbbr, yearShort] = value.split("-");
     const [day, monthAbbr, yearShort] = disbursementDate.split("-"); // ✅ FIXED: use correct variable
    const monthNames = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const month = monthNames[monthAbbr];
    const year = parseInt("20" + yearShort, 10);
 
  disbDate = new Date(year, month, day, 12, 0, 0, 0);

  } else {
    disbDate = new Date(disbursementDate);
    disbDate.setHours(12, 0, 0, 0); // ensure local noon
  }

 

  // --- Step 2: Calculate disbDay and base due date ---
  const disbDay = disbDate.getDate();

  const dueDate = new Date(disbDate);

  // --- Step 3: Apply cutoff logic ---
  if (disbDay <= 20) {
    dueDate.setMonth(dueDate.getMonth() + 1 + monthOffset);
  } else {
    dueDate.setMonth(dueDate.getMonth() + 2 + monthOffset);
  }

  // --- Step 4: Set EMI date (same day each month) ---
  dueDate.setDate(Number(emiDate));
  dueDate.setHours(12, 0, 0, 0);

  // --- Step 5: Log clean local date ---
  const formattedDisbDate = disbDate.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });

  const formattedDueDate = dueDate.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });


  return dueDate;
}


// ✅ GQ Non-FSF: EMI due follows 5th-of-month cutoff logic
// else if (lender === "GQ FSF") {
//     const disbDate = new Date(disbursementDate); // use original disbursementDate param
//     const disbDay = disbDate.getDate();
//     const dueDate = new Date(emiDate);
// console.log("Due Date before adjustment:", dueDate.toISOString().split("T")[0]);
//     if (disbDay <= 20) {
//         dueDate.setMonth(dueDate.getMonth() + 1 + monthOffset);
//       } else {
//         dueDate.setMonth(dueDate.getMonth() + 2 + monthOffset);
//       }
//     dueDate.setDate(emiDate); // Always due on the emi days basis
//     console.log(`[GQ FSF] EMI due (cutoff logic): ${dueDate.toISOString().split("T")[0]}`);
//     return dueDate;
// }
else if (lender === "GQ FSF" ) {
  // --- Step 1: Parse disbursementDate manually ---
  let disbDate;

  if (typeof disbursementDate === "string" && disbursementDate.includes("-")) {
    const [day, monthAbbr, yearShort] = value.split("-");
    const monthNames = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const month = monthNames[monthAbbr];
    const year = parseInt("20" + yearShort, 10);
 
    disbDate = new Date(year, monthMap[monthStr], Number(day), 12, 0, 0, 0); // set to noon to avoid UTC shift
  } else {
    disbDate = new Date(disbursementDate);
    disbDate.setHours(12, 0, 0, 0); // ensure local noon
  }

 

  // --- Step 2: Calculate disbDay and base due date ---
  const disbDay = disbDate.getDate();

  const dueDate = new Date(disbDate);

  // --- Step 3: Apply cutoff logic ---
  if (disbDay <= 20) {
    dueDate.setMonth(dueDate.getMonth() + 1 + monthOffset);
  } else {
    dueDate.setMonth(dueDate.getMonth() + 2 + monthOffset);
  }

  // --- Step 4: Set EMI date (same day each month) ---
  dueDate.setDate(Number(emiDate));
  dueDate.setHours(12, 0, 0, 0);

  // --- Step 5: Log clean local date ---
  const formattedDisbDate = disbDate.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });

  const formattedDueDate = dueDate.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });


  return dueDate;
}



/////////////////// 
  // ✅ EV Loan : Monthly Loan
else if (lender === "EV Loan" && product === "Monthly Loan") {
    const dueDate = new Date(disbDate);
    dueDate.setMonth(dueDate.getMonth() + 1 + (monthOffset || 0));

    // Keep the same day as disbursement
    dueDate.setDate(new Date(disbDate).getDate());

    console.log(`[EV Monthly Loan] EMI due: ${dueDate.toISOString().split("T")[0]}`);
    return dueDate;
}
////////////// CARE PAY EMI DATE /////////////////////// 
// ✅ CAREPAY EMI date rule
else if (
  String(lender || "").trim().toLowerCase() === "carepay" &&
  isCarepayLoanType(product)
) {
  const disbDate = new Date(disbursementDate);

  if (Number.isNaN(disbDate.getTime())) {
    throw new Error(
      `Invalid CarePay disbursement date: ${disbursementDate}`,
    );
  }

  const offset = Number(monthOffset || 0);

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error(`Invalid monthOffset: ${monthOffset}`);
  }

  const disbursementDay = disbDate.getDate();

  // 1st–25th: 5th of next month
  // 26th–month end: 5th of month after next
  const initialMonthGap = disbursementDay <= 20 ? 1 : 2;

  const dueDate = new Date(
    disbDate.getFullYear(),
    disbDate.getMonth() + initialMonthGap + offset,
    5,
  );

  console.log(
    `[CAREPAY ${product}] EMI due: ${formatDateYMD(dueDate)}`,
  );

  return dueDate;
}


/////// HELIUM ///////////////////

// ✅ HELIUM loan EMI date logic
else if (lender === "HELIUM") {
    const disb = new Date(disbursementDate);
    const disbDay = disb.getDate();
    const dueDate = new Date(disb);

    // Banking-style cutoff: 5th of every month
    if (disbDay <= 5) {
        dueDate.setMonth(dueDate.getMonth() + 1);
    } else {
        dueDate.setMonth(dueDate.getMonth() + 2);
    }

    // Always set EMI date to 5th
    dueDate.setDate(5);

    console.log(`[HELIUM EMI DATE] First EMI: ${dueDate.toISOString().split("T")[0]}`);

    return dueDate;
}



  // ✅ Circle pe Loan : Monthly Loan and Bullet Loan
// ✅ Circlepe Loan: Monthly Loan and Bullet Loan
else if (lender === "Circlepe" && (product === "Monthly Loan" || product === "Bullet Loan")) {
  const disb = new Date(disbDate);
  const day = disb.getDate();
  const dueDate = new Date(disb);

  if (day >= 1 && day <= 25) {
    // If disbursed on 1st–25th → next month 5th
    dueDate.setMonth(dueDate.getMonth() + 1);
    dueDate.setDate(5);
  } else {
    // If disbursed on 26th–end of month → month after next 5th
    dueDate.setMonth(dueDate.getMonth() + 2);
    dueDate.setDate(5);
  }

  console.log(
    `[EV Monthly Loan] Disbursed: ${disb.toISOString().split("T")[0]} | EMI due: ${dueDate.toISOString().split("T")[0]}`
  );

  return dueDate;
}


  // ✅ HEY EV Loan : Monthly Loan
else if (lender === "HEY EV Loan") {
    const dueDate = new Date(disbDate);
    dueDate.setMonth(dueDate.getMonth() + 1 + (monthOffset || 0));

    // Keep the same day as disbursement
    dueDate.setDate(new Date(disbDate).getDate());

    console.log(`[HEY EV Monthly Loan] EMI due: ${dueDate.toISOString().split("T")[0]}`);
    return dueDate;
}
    // /////////////////// HEY EV BATTERY LOAN /////////////////

// ✅ HeyEV Battery : Monthly Loan
else if (lender === "HeyEV Battery") {
  const dueDate = new Date(disbDate);
  dueDate.setMonth(dueDate.getMonth() + 1 + (monthOffset || 0));

  // Keep the same day as disbursement
  dueDate.setDate(new Date(disbDate).getDate());

  console.log(
    `[HeyEV Battery Monthly Loan] EMI due: ${dueDate
      .toISOString()
      .split("T")[0]}`
  );
  return dueDate;
}


    // ✅ BL Loan: Daily Loan starts from next day
    else if (lender === "BL Loan" && product === "Daily Loan") {
        const dailyDue = new Date(disbDate);
        dailyDue.setDate(disbDate.getDate() + 1);
        console.log(`[Daily Loan] EMI due: ${dailyDue.toISOString().split("T")[0]}`);
        return dailyDue;
    }

    // // ❌ Fallback
    // const fallbackDue = new Date(disbDate);
    // fallbackDue.setMonth(fallbackDue.getMonth() + 1);
    // fallbackDue.setDate(5);
    // console.log(`[Fallback] EMI due: ${fallbackDue.toISOString().split("T")[0]}`);
    // return fallbackDue;
}

module.exports = {
    getFirstEmiDate,
};


