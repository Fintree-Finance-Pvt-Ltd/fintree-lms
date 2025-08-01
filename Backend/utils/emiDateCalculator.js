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

function getFirstEmiDate(disbursementDate, emiDate, lender, product, monthOffset = 0, salaryDay = null) {
    const disbDate = new Date(disbursementDate);
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
    if (lender === "Adikosh" && typeof salaryDay === "number") {
        const emiStartDay = salaryDay + 2;
        const emiMonthOffset = disbDay <= salaryDay ? 1 + monthOffset : 2 + monthOffset;

        const emiDate = new Date(disbDate); // clone original date
        emiDate.setMonth(disbDate.getMonth() + emiMonthOffset);
        emiDate.setDate(emiStartDay); // always set to salaryDay + 2

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

    // ❌ Fallback
    const fallbackDue = new Date(disbDate);
    fallbackDue.setMonth(fallbackDue.getMonth() + 1);
    fallbackDue.setDate(5);
    console.log(`[Fallback] EMI due: ${fallbackDue.toISOString().split("T")[0]}`);
    return fallbackDue;
}

module.exports = {
    getFirstEmiDate,
};


