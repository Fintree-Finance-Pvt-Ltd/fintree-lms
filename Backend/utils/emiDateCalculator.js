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


function getFirstEmiDate(disbursementDate, emiDate, lender, product, monthOffset = 0, salaryDay ) {
    const disbDate = new Date(disbursementDate);
    if (Number.isNaN(disbDate.getTime())) {
    throw new Error(`Invalid disbursementDate: ${disbursementDate}`);
  }
    const disbDay = disbDate.getDate();

    // ✅ EV Loan: Monthly Loan EMI due based on 5th cut-off logic
    if (lender === "EV Loan" && product === "Monthly Loan") {
        const dueDate = new Date(disbDate);

        if (disbDay <= 5) {
            dueDate.setMonth(dueDate.getMonth() + 1);
        } else {
            dueDate.setMonth(dueDate.getMonth() + 2);
        }

        dueDate.setDate(5);
        console.log(`[EV Monthly Loan] EMI due: ${dueDate.toISOString().split("T")[0]}`);
        return dueDate;
    }
    
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
else if (lender === "GQ Non-FSF" && product === "Bureau Score Based") {
    const disbDate = new Date(disbursementDate); // use original disbursementDate param
    const disbDay = disbDate.getDate();
    const dueDate = new Date(disbDate);
    if (disbDay <= 20) {
        dueDate.setMonth(dueDate.getMonth() + 1 + monthOffset);
      } else {
        dueDate.setMonth(dueDate.getMonth() + 2 + monthOffset);
      }
    dueDate.setDate(5); // Always due on the 5th
    console.log(`[GQ Non-FSF] EMI due (cutoff logic): ${dueDate.toISOString().split("T")[0]}`);

    return dueDate;
}

// ✅ GQ Non-FSF: EMI due follows 5th-of-month cutoff logic
else if (lender === "GQ FSF") {
    const disbDate = new Date(disbursementDate); // use original disbursementDate param
    const disbDay = disbDate.getDate();
    const dueDate = new Date(disbDate);

    if (disbDay <= 20) {
        dueDate.setMonth(dueDate.getMonth() + 1 + monthOffset);
      } else {
        dueDate.setMonth(dueDate.getMonth() + 2 + monthOffset);
      }
    dueDate.setDate(emiDate); // Always due on the 5th
    console.log(`[GQ FSF] EMI due (cutoff logic): ${dueDate.toISOString().split("T")[0]}`);
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


