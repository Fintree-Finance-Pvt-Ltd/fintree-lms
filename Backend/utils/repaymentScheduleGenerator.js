// const db = require("../config/db");
// const { getFirstEmiDate } = require("../utils/emiDateCalculator");


// // const generateRepaymentScheduleEV = async (lan, loanAmount, interestRate, tenure, disbursementDate, product, lender) => {
// //     try {
// //         const annualRate = interestRate / 100;
// //         let remainingPrincipal = loanAmount;
// //         const firstDueDate = getFirstEmiDate(disbursementDate, lender, product);

// //         console.log("Calling getFirstEmiDate (EV) with:", { disbursementDate, lender, product });
// //         console.log("First Due Date (EV):", firstDueDate);
// //         console.log("Calling generateRepaymentSchedule with:", {
// //           lan: row["LAN"],
// //           loanAmount: row["Loan Amount"],
// //           interestRate: row["Interest Rate"],
// //           tenure: row["Tenure"],
// //           disbursementDate: row["Disbursement Date"],
// //           product: row["Product"],
// //           lender: row["Lender"]
// //         });


// //         const emi = Math.round(
// //             (loanAmount * (annualRate / 12) * Math.pow(1 + annualRate / 12, tenure)) /
// //             (Math.pow(1 + annualRate / 12, tenure) - 1)
// //         );

// //         const rpsData = [];
// //         let dueDate = new Date(firstDueDate);

// //         for (let i = 1; i <= tenure; i++) {
// //             const interest = Math.ceil((remainingPrincipal * annualRate * 30) / 360);
// //             let principal = emi - interest;

// //             if (i === tenure) principal = remainingPrincipal;

// //             rpsData.push([
// //                 lan,
// //                 dueDate.toISOString().split("T")[0],
// //                 principal + interest,
// //                 interest,
// //                 principal,
// //                 remainingPrincipal,
// //                 interest,
// //                 principal + interest,
// //                 "Pending"
// //             ]);

// //             remainingPrincipal -= principal;
// //             dueDate.setMonth(dueDate.getMonth() + 1);
// //         }

// //         await db.promise().query(
// //             `INSERT INTO manual_rps_ev_loan 
// //             (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
// //             VALUES ?`,
// //             [rpsData]
// //         );

// //         console.log(`✅ EV RPS (standard EMI) generated for ${lan}`);
// //     } catch (err) {
// //         console.error(`❌ EV RPS Error for ${lan}:`, err);
// //     }
// // };
// //////////////////////////// PRE EMI LOAN CALCULATION /////////////////////////////////////////
// // Calculate adjusted Pre-EMI gap days (subtract disb month days)


// const generateRepaymentScheduleEV = async (
//   lan, loanAmount, interestRate, tenure, disbursementDate, product, lender
// ) => {
//   try {
//     const annualRate = interestRate / 100;
//     let remainingPrincipal = loanAmount;
//     const disbDate = new Date(disbursementDate);

//    // Get first EMI due date based on lender/product rules
//    const firstDueDate = getFirstEmiDate(disbursementDate, lender, product);

//    console.log("Calling generateRepaymentSchedule with:", {
//      lan,    
//      loanAmount,
//      interestRate,
//      tenure,
//      disbursementDate,
//      product,
//      lender
//    });

//    const getTotalDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
//    console.log("Total Days in Month:", getTotalDaysInMonth(disbDate));



//    // Calculate gap days from disbursement to 4th of EMI month
//    const totalDaysInMonth = getTotalDaysInMonth(disbDate); // ✅ You missed declaring this
//    console.log("Total Days in Month:", totalDaysInMonth);

//      const preEmiEndDate = new Date(firstDueDate);


//    preEmiEndDate.setDate(5); // 5th of the EMI due month


//    const rawGapDays = Math.ceil((preEmiEndDate - disbDate) / (1000 * 60 * 60 * 24));
//    console.log("Raw Gap Days:", rawGapDays);
//    //const gapDays = Math.max(rawGapDays, 0); // Ensure not negative
//    const gapDays = Math.max(rawGapDays - totalDaysInMonth, 0);
//    console.log("Adjusted Gap Days:", gapDays);
//    const preEmiInterest = Math.ceil((loanAmount * annualRate * gapDays) / 360);
//    console.log("Pre-EMI Interest:", preEmiInterest);

//    // EMI Calculation
//    const emi = Math.round(
//      (loanAmount * (annualRate / 12) * Math.pow(1 + annualRate / 12, tenure)) /
//      (Math.pow(1 + annualRate / 12, tenure) - 1)
//    );

//    const rpsData = [];

//    // 🔹 Pre-EMI Row
//    if (gapDays > 0) {
//      rpsData.push([
//        lan,
//        disbDate.toISOString().split("T")[0],
//        preEmiInterest,
//        preEmiInterest,
//        0,
//        remainingPrincipal,
//        preEmiInterest,
//        preEmiInterest,
//        "Pre-EMI"
//      ]);
//    }
// console.log("Pre-EMI Data:", rpsData);
//    console.log("EMI Data:", emi);
//    console.log("Remaining Principal:", remainingPrincipal);
//    console.log("Tenure:", tenure);

//     // 🔹 Regular EMIs
//     let dueDate = new Date(firstDueDate);
//     for (let i = 1; i <= tenure; i++) {
//       const interest = Math.ceil((remainingPrincipal * annualRate * 30) / 360);
//       let principal = emi - interest;
//       if (i === tenure) principal = remainingPrincipal;

//          rpsData.push([
//         lan,
//         dueDate.toISOString().split("T")[0],
//         principal + interest,
//         interest,
//         principal,
//         principal, // ✅ This shows Remaining Principal = principal for that EMI
//         interest,
//         principal + interest,
//         "Pending"
//       ]);


//       remainingPrincipal -= principal;
//       dueDate.setMonth(dueDate.getMonth() + 1);
//     }

//     await db.promise().query(
//       `INSERT INTO manual_rps_ev_loan 
//       (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
//       VALUES ?`,
//       [rpsData]
//     );

//     console.log(`✅ EV RPS with Pre-EMI generated for ${lan}`);
//   } catch (err) {
//     console.error(`❌ EV RPS Error for ${lan}:`, err);
//   }
// };

// //SSSSSSSSSSSSSSSSSSSSS

// // const generateRepaymentScheduleEV = async (
// //   lan, loanAmount, interestRate, tenure, disbursementDate, product, lender
// // ) => {
// //   try {
// //     const annualRate = interestRate / 100;
// //     let remainingPrincipal = loanAmount;

// //     // Calculate EMI
// //     const emi = Math.round(
// //       (loanAmount * (annualRate / 12) * Math.pow(1 + annualRate / 12, tenure)) /
// //       (Math.pow(1 + annualRate / 12, tenure) - 1)
// //     );

// //     // Set RPS start date to same day of next month from disbursement
// //     const disbDate = new Date(disbursementDate);
// //     const firstDueDate = new Date(disbDate);
// //     firstDueDate.setMonth(disbDate.getMonth() + 1);

// //     const rpsData = [];
// //     let dueDate = new Date(firstDueDate);

// //     for (let i = 1; i <= tenure; i++) {
// //       const interest = Math.ceil((remainingPrincipal * annualRate * 30) / 360);
// //       let principal = emi - interest;
// //       if (i === tenure) principal = remainingPrincipal;

// //       rpsData.push([
// //         lan,
// //         dueDate.toISOString().split("T")[0],
// //         principal + interest,
// //         interest,
// //         principal,
// //         principal, // ✅ This shows Remaining Principal = principal for that EMI
// //         interest,
// //         principal + interest,
// //         "Pending"
// //       ]);


// //       remainingPrincipal -= principal;
// //       dueDate.setMonth(dueDate.getMonth() + 1);
// //     }

// //     await db.promise().query(
// //       `INSERT INTO manual_rps_ev_loan 
// //       (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
// //       VALUES ?`,
// //       [rpsData]
// //     );

// //     console.log(`✅ EV RPS generated from next month for ${lan}`);
// //   } catch (err) {
// //     console.error(`❌ EV RPS Error for ${lan}:`, err);
// //   }
// // };




// ///////////////////////////////////////////////////////////////////////////////////////////////////////

// // const generateRepaymentScheduleBL = async (lan, loanAmount, interestRate, tenure, disbursementDate, product, lender) => {
// //     try {
// //         const annualRate = interestRate / 100;
// //         const monthlyRate = annualRate / 12;
// //         const dailyRate = annualRate / 360;
// //         let rpsData = [];
// //         let remainingPrincipal = loanAmount;
// //         const firstDueDate = getFirstEmiDate(disbursementDate, lender, product);

// //         console.log("Calling getFirstEmiDate (BL) with:", { disbursementDate, lender, product });
// //         console.log("First Due Date (BL):", firstDueDate);


// //         let dueDate = new Date(firstDueDate);

// //         if (product === "Daily Loan") {
// //             const emi = Math.round(loanAmount / tenure);

// //             for (let i = 1; i <= tenure; i++) {
// //                 const interest = (remainingPrincipal * dailyRate);
// //                 let principal = emi;

// //                 if (i === tenure) principal = remainingPrincipal;

// //                 rpsData.push([
// //                     lan,
// //                     dueDate.toISOString().split("T")[0],
// //                     principal + interest,
// //                     interest,
// //                     principal,
// //                     remainingPrincipal,
// //                     interest,
// //                     principal + interest,
// //                     "Pending"
// //                 ]);

// //                 remainingPrincipal -= principal;
// //                 dueDate.setDate(dueDate.getDate() + 1);
// //             }
// //         } else { // Monthly Loan
// //             const emi = Math.round(
// //                 (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
// //                 (Math.pow(1 + monthlyRate, tenure) - 1)
// //             );

// //             for (let i = 1; i <= tenure; i++) {
// //                 const interest = remainingPrincipal * monthlyRate;
// //                 let principal = emi - interest;

// //                 if (i === tenure) principal = remainingPrincipal;

// //                 rpsData.push([
// //                     lan,
// //                     dueDate.toISOString().split("T")[0],
// //                     principal + interest,
// //                     interest,
// //                     principal,
// //                     remainingPrincipal,
// //                     interest,
// //                     principal + interest,
// //                     "Pending"
// //                 ]);

// //                 remainingPrincipal -= principal;
// //                 dueDate.setMonth(dueDate.getMonth() + 1);
// //             }
// //         }

// //         await db.promise().query(
// //             `INSERT INTO manual_rps_ev_loan
// //             (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
// //             VALUES ?`,
// //             [rpsData]
// //         );

// //         console.log(`✅ BL RPS (${product}) generated for ${lan}`);
// //     } catch (err) {
// //         console.error(`❌ BL RPS Error for ${lan}:`, err);
// //     }
// // };
// ////////////////////////////////// UPDATE BL //////////////////////////////////////////////////////////
// // const generateRepaymentScheduleBL = async (
// //   lan, loanAmount, interestRate, tenure, disbursementDate, product, lender
// // ) => {
// //   try {
// //     const annualRate = interestRate / 100;
// //     const monthlyRate = annualRate / 12;
// //     const dailyRate = annualRate / 360;

// //     let rpsData = [];
// //     const firstDueDate = getFirstEmiDate(disbursementDate, lender, product);

// //     console.log("Calling getFirstEmiDate (BL) with:", { disbursementDate, lender, product });
// //     console.log("First Due Date (BL):", firstDueDate);

// //     let dueDate = new Date(firstDueDate);

// //     if (product === "Daily Loan") {
// //       const emiPrincipal = Math.round(loanAmount / tenure);

// //       for (let i = 1; i <= tenure; i++) {
// //         const interest = parseFloat((loanAmount * dailyRate).toFixed(2));
// //         const principal = (i === tenure) ? loanAmount : emiPrincipal;
// //         const totalEmi = principal + interest;

// //         rpsData.push([
// //           lan,
// //           dueDate.toISOString().split("T")[0],
// //           totalEmi,
// //           interest,
// //           principal,
// //           principal,          // ✅ This EMI’s principal
// //           totalEmi,           // ✅ Total due for this day
// //           totalEmi,
// //           "Pending"
// //         ]);

// //         loanAmount -= principal;
// //         dueDate.setDate(dueDate.getDate() + 1);
// //       }

// //     } else {
// //       // Monthly Loan
// //       const emi = Math.round(
// //         (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
// //         (Math.pow(1 + monthlyRate, tenure) - 1)
// //       );

// //       for (let i = 1; i <= tenure; i++) {
// //         const interest = parseFloat((loanAmount * monthlyRate).toFixed(2));
// //         let principal = emi - interest;
// //         if (i === tenure) principal = loanAmount;

// //         const totalEmi = principal + interest;

// //         rpsData.push([
// //           lan,
// //           dueDate.toISOString().split("T")[0],
// //           totalEmi,
// //           interest,
// //           principal,
// //           principal,          // ✅ This EMI’s principal
// //           totalEmi,           // ✅ Total due for this month
// //           totalEmi,
// //           "Pending"
// //         ]);

// //         loanAmount -= principal;
// //         dueDate.setMonth(dueDate.getMonth() + 1);
// //       }
// //     }

// //     await db.promise().query(
// //       `INSERT INTO manual_rps_ev_loan
// //       (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
// //       VALUES ?`,
// //       [rpsData]
// //     );

// //     console.log(`✅ BL RPS (${product}) generated for ${lan}`);
// //   } catch (err) {
// //     console.error(`❌ BL RPS Error for ${lan}:`, err);
// //   }
// // };

// const generateRepaymentScheduleBL = async (
//   lan, loanAmount, interestRate, tenure, disbursementDate, product, lender
// ) => {
//   try {
//     const annualRate = interestRate / 100;
//     const dailyRate = annualRate / 360;
//     const monthlyRate = annualRate / 12;

//     const rpsData = [];
//     let remainingPrincipal = parseFloat(loanAmount);

//     const firstDueDate = getFirstEmiDate(disbursementDate, lender, product);
//     let dueDate = new Date(firstDueDate);

//     if (product === "Daily Loan") {
//       const emi = parseFloat(
//         (loanAmount * dailyRate) / (1 - Math.pow(1 + dailyRate, -tenure))
//       ).toFixed(2);

//       for (let i = 1; i <= tenure; i++) {
//         const interest = parseFloat((remainingPrincipal * dailyRate).toFixed(2));
//         let principal = parseFloat((emi - interest).toFixed(2));

//         if (i === tenure) {
//           principal = parseFloat(remainingPrincipal.toFixed(2));
//         }

//         const totalEmi = parseFloat((principal + interest).toFixed(2));

//         rpsData.push([
//           lan,
//           dueDate.toISOString().split("T")[0],
//           totalEmi,
//           interest,
//           principal,
//           principal,
//           //parseFloat(remainingPrincipal.toFixed(2)),
//           interest,
//           totalEmi,
//           "Pending"
//         ]);

//         remainingPrincipal -= principal;
//         dueDate.setDate(dueDate.getDate() + 1);
//       }

//     } else if (product === "Monthly Loan") {
//       const emi = parseFloat(
//         (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -tenure))
//       ).toFixed(2);

//       for (let i = 1; i <= tenure; i++) {
//         const interest = parseFloat((remainingPrincipal * monthlyRate).toFixed(2));
//         let principal = parseFloat((emi - interest).toFixed(2));

//         if (i === tenure) {
//           principal = parseFloat(remainingPrincipal.toFixed(2));
//         }

//         const totalEmi = parseFloat((principal + interest).toFixed(2));

//         rpsData.push([
//           lan,
//           dueDate.toISOString().split("T")[0],
//           totalEmi,
//           interest,
//           principal,
//           principal,
//           //parseFloat(remainingPrincipal.toFixed(2)),
//           interest,
//           totalEmi,
//           "Pending"
//         ]);

//         remainingPrincipal -= principal;
//         dueDate.setMonth(dueDate.getMonth() + 1);
//       }
//     }

//     await db.promise().query(
//       `INSERT INTO manual_rps_ev_loan
//       (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
//       VALUES ?`,
//       [rpsData]
//     );

//     console.log(`✅ RPS (${product}) generated for ${lan}`);
//   } catch (err) {
//     console.error(`❌ Error generating RPS for ${lan}:`, err);
//   }
// };



// ///////////////////////////////////////////////////////////////////////////////////////////////////////

// const generateRepaymentSchedule = async (lan, loanAmount, interestRate, tenure, disbursementDate, product, lender) => {
//     if (lender === "BL Loan") {
//         await generateRepaymentScheduleBL(lan, loanAmount, interestRate, tenure, disbursementDate, product, lender);
//     } else if (lender === "EV Loan") {
//         await generateRepaymentScheduleEV(lan, loanAmount, interestRate, tenure, disbursementDate, product, lender);
//     } else {
//         console.warn(`⚠️ Unknown lender type: ${lender}. Skipping RPS generation.`);
//     }
// };

// module.exports = {
//     generateRepaymentScheduleEV,
//     generateRepaymentScheduleBL,
//     generateRepaymentSchedule
// };
/////////////////////////////////////    NEW   ///////////////////////
const db = require("../config/db");
const { getFirstEmiDate } = require("../utils/emiDateCalculator");

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


// const generateRepaymentScheduleEV = async (lan, loanAmount, interestRate, tenure, disbursementDate, product, lender) => {
//     try {
//         const annualRate = interestRate / 100;
//         let remainingPrincipal = loanAmount;
//         const firstDueDate = getFirstEmiDate(disbursementDate, lender, product);

//         console.log("Calling getFirstEmiDate (EV) with:", { disbursementDate, lender, product });
//         console.log("First Due Date (EV):", firstDueDate);
//         console.log("Calling generateRepaymentSchedule with:", {
//           lan: row["LAN"],
//           loanAmount: row["Loan Amount"],
//           interestRate: row["Interest Rate"],
//           tenure: row["Tenure"],
//           disbursementDate: row["Disbursement Date"],
//           product: row["Product"],
//           lender: row["Lender"]
//         });


//         const emi = Math.round(
//             (loanAmount * (annualRate / 12) * Math.pow(1 + annualRate / 12, tenure)) /
//             (Math.pow(1 + annualRate / 12, tenure) - 1)
//         );

//         const rpsData = [];
//         let dueDate = new Date(firstDueDate);

//         for (let i = 1; i <= tenure; i++) {
//             const interest = Math.ceil((remainingPrincipal * annualRate * 30) / 360);
//             let principal = emi - interest;

//             if (i === tenure) principal = remainingPrincipal;

//             rpsData.push([
//                 lan,
//                 dueDate.toISOString().split("T")[0],
//                 principal + interest,
//                 interest,
//                 principal,
//                 remainingPrincipal,
//                 interest,
//                 principal + interest,
//                 "Pending"
//             ]);

//             remainingPrincipal -= principal;
//             dueDate.setMonth(dueDate.getMonth() + 1);
//         }

//         await db.promise().query(
//             `INSERT INTO manual_rps_ev_loan 
//             (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
//             VALUES ?`,
//             [rpsData]
//         );

//         console.log(`✅ EV RPS (standard EMI) generated for ${lan}`);
//     } catch (err) {
//         console.error(`❌ EV RPS Error for ${lan}:`, err);
//     }
// };
//////////////////////////// PRE EMI LOAN CALCULATION /////////////////////////////////////////
// Calculate adjusted Pre-EMI gap days (subtract disb month days)


const generateRepaymentScheduleEV = async (
  lan, loanAmount, interestRate, tenure, disbursementDate, product, lender
) => {
  try {
    const annualRate = interestRate / 100;
    let remainingPrincipal = loanAmount;

    // Calculate EMI
    const emi = Math.round(
      (loanAmount * (annualRate / 12) * Math.pow(1 + annualRate / 12, tenure)) /
      (Math.pow(1 + annualRate / 12, tenure) - 1)
    );

    // Set RPS start date to same day of next month from disbursement
    const disbDate = new Date(disbursementDate);
    const firstDueDate = new Date(disbDate);
    firstDueDate.setMonth(disbDate.getMonth() + 1);

    const rpsData = [];
    let dueDate = new Date(firstDueDate);

    for (let i = 1; i <= tenure; i++) {
      const interest = Math.ceil((remainingPrincipal * annualRate * 30) / 360);
      console.log("annualRate:", annualRate);
      console.log("Remaining Principal:", remainingPrincipal);
      console.log("Interest:", interest);
      console.log("EMI:", emi);
      let principal = emi - interest;
      if (i === tenure) principal = remainingPrincipal;

      rpsData.push([
        lan,
        dueDate.toISOString().split("T")[0],
        principal + interest,
        interest,
        principal,
        principal, // ✅ This shows Remaining Principal = principal for that EMI
        interest,
        principal + interest,
        "Pending"
      ]);


      remainingPrincipal -= principal;
      dueDate.setMonth(dueDate.getMonth() + 1);
    }

    await db.promise().query(
      `INSERT INTO manual_rps_ev_loan
      (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
      VALUES ?`,
      [rpsData]
    );

    // ➕ Update emi_amount in loan_bookings
    await db.promise().query(
      `UPDATE loan_booking_ev
   SET emi_amount = ?
   WHERE lan = ?`,
      [emi, lan]
    );

    console.log(`✅ EV RPS generated from next month for ${lan}`);
  } catch (err) {
    console.error(`❌ EV RPS Error for ${lan}:`, err);
  }
};


///////////////////////////////////////////////////////////////////////////////////////////////////////

// const generateRepaymentScheduleBL = async (lan, loanAmount, interestRate, tenure, disbursementDate, product, lender) => {
//     try {
//         const annualRate = interestRate / 100;
//         const monthlyRate = annualRate / 12;
//         const dailyRate = annualRate / 360;
//         let rpsData = [];
//         let remainingPrincipal = loanAmount;
//         const firstDueDate = getFirstEmiDate(disbursementDate, lender, product);

//         console.log("Calling getFirstEmiDate (BL) with:", { disbursementDate, lender, product });
//         console.log("First Due Date (BL):", firstDueDate);


//         let dueDate = new Date(firstDueDate);

//         if (product === "Daily Loan") {
//             const emi = Math.round(loanAmount / tenure);

//             for (let i = 1; i <= tenure; i++) {
//                 const interest = (remainingPrincipal * dailyRate);
//                 let principal = emi;

//                 if (i === tenure) principal = remainingPrincipal;

//                 rpsData.push([
//                     lan,
//                     dueDate.toISOString().split("T")[0],
//                     principal + interest,
//                     interest,
//                     principal,
//                     remainingPrincipal,
//                     interest,
//                     principal + interest,
//                     "Pending"
//                 ]);

//                 remainingPrincipal -= principal;
//                 dueDate.setDate(dueDate.getDate() + 1);
//             }
//         } else { // Monthly Loan
//             const emi = Math.round(
//                 (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
//                 (Math.pow(1 + monthlyRate, tenure) - 1)
//             );

//             for (let i = 1; i <= tenure; i++) {
//                 const interest = remainingPrincipal * monthlyRate;
//                 let principal = emi - interest;

//                 if (i === tenure) principal = remainingPrincipal;

//                 rpsData.push([
//                     lan,
//                     dueDate.toISOString().split("T")[0],
//                     principal + interest,
//                     interest,
//                     principal,
//                     remainingPrincipal,
//                     interest,
//                     principal + interest,
//                     "Pending"
//                 ]);

//                 remainingPrincipal -= principal;
//                 dueDate.setMonth(dueDate.getMonth() + 1);
//             }
//         }

//         await db.promise().query(
//             `INSERT INTO manual_rps_ev_loan
//             (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
//             VALUES ?`,
//             [rpsData]
//         );

//         console.log(`✅ BL RPS (${product}) generated for ${lan}`);
//     } catch (err) {
//         console.error(`❌ BL RPS Error for ${lan}:`, err);
//     }
// };
////////////////////////////////// UPDATE BL //////////////////////////////////////////////////////////
const generateRepaymentScheduleBL = async (
  lan, loanAmount, interestRate, tenure, disbursementDate, product, lender
) => {
  try {
    const annualRate = interestRate / 100;
    const monthlyRate = annualRate / 12;
    const dailyRate = annualRate / 360;

    let rpsData = [];
    const firstDueDate = getFirstEmiDate(disbursementDate, lender, product);

    console.log("Calling getFirstEmiDate (BL) with:", { disbursementDate, lender, product });
    console.log("First Due Date (BL):", firstDueDate);

    let dueDate = new Date(firstDueDate);

    if (product === "Daily Loan") {
      const emiPrincipal = Math.round(loanAmount / tenure);

      for (let i = 1; i <= tenure; i++) {
        const interest = parseFloat((loanAmount * dailyRate).toFixed(2));
        const principal = (i === tenure) ? loanAmount : emiPrincipal;
        const totalEmi = principal + interest;

        rpsData.push([
          lan,
          dueDate.toISOString().split("T")[0],
          totalEmi,
          interest,
          principal,
          principal,
          totalEmi,
          totalEmi,
          "Pending"
        ]);

        loanAmount -= principal;
        dueDate.setDate(dueDate.getDate() + 1);
      }

    } else {
      // Monthly Loan
      const emi = Math.round(
        (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
        (Math.pow(1 + monthlyRate, tenure) - 1)
      );

      let outstandingPrincipal = loanAmount;

      // Calculate gap days from disbursement date to first EMI date
      const disbDate = new Date(disbursementDate);
      const gapDays = Math.ceil((new Date(firstDueDate) - disbDate) / (1000 * 60 * 60 * 24));

      for (let i = 1; i <= tenure; i++) {
        let interest, principal;

        if (i === 1) {
          // First EMI interest for gap days
          interest = parseFloat(((outstandingPrincipal * annualRate * gapDays) / 360).toFixed(2));
          principal = parseFloat((emi - interest).toFixed(2));
        } else {
          interest = parseFloat((outstandingPrincipal * monthlyRate).toFixed(2));
          principal = parseFloat((emi - interest).toFixed(2));
        }

        // Final EMI adjustment
        if (i === tenure) {
          principal = parseFloat(outstandingPrincipal.toFixed(2));
          interest = parseFloat((emi - principal).toFixed(2));
        }

        const totalEmi = principal + interest;

        rpsData.push([
          lan,
          dueDate.toISOString().split("T")[0],
          totalEmi,
          interest,
          principal,
          principal,
          totalEmi,
          totalEmi,
          "Pending"
        ]);

        outstandingPrincipal -= principal;
        dueDate.setMonth(dueDate.getMonth() + 1);
      }

      // ➕ Update emi_amount in loan_bookings for monthly loans
      await db.promise().query(
        `UPDATE loan_bookings
         SET emi_amount = ?
         WHERE lan = ?`,
        [emi, lan]
      );
    }

    // Insert into manual_rps_ev_loan
    await db.promise().query(
      `INSERT INTO manual_rps_ev_loan
       (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
       VALUES ?`,
      [rpsData]
    );

    console.log(`✅ BL RPS (${product}) generated for ${lan}`);
  } catch (err) {
    console.error(`❌ BL RPS Error for ${lan}:`, err);
  }
};

///////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////// GQ NON-FSF LOAN CALCULATION /////////////////////////////////////////
// const generateRepaymentScheduleGQNonFSF = async (
//   lan,
//   approvedAmount,
//   interestRate,
//   tenure,
//   disbursementDate,
//   subventionAmount,
//   product,
//   lender
// ) => {
//   try {
//     console.log(`\n🚀 Generating GQ NON-FSF RPS for LAN: ${lan}`);
//     console.log(`📝 Input: ApprovedAmount=${approvedAmount}, InterestRate=${interestRate}, Tenure=${tenure}, DisbursementDate=${disbursementDate}, SubventionAmount=${subventionAmount}`);

//     const annualRate = interestRate / 100;

//     const firstDueDate = getFirstEmiDate(disbursementDate, lender, product);

//     console.log("Calling getFirstEmiDate (BL) with:", { disbursementDate, lender, product });
//     console.log("First Due Date (BL):", firstDueDate);


//     console.log(`📅 First due date calculated: ${firstDueDate.toISOString().split("T")[0]}`);

//     let remainingPrincipal = approvedAmount;
//     const rpsData = [];
//     let dueDate = new Date(firstDueDate);

//     // ➤ EMI calculations
//     const isZeroInterest = annualRate === 0;
//     const emiPrincipal = Math.round(approvedAmount / tenure);
//     let emiInterest = 0;
//     let emiTotal = emiPrincipal;

//     if (isZeroInterest) {
//       console.log("💡 Interest is 0%. Pure subvention loan. EMI = Principal only.");
//     } else {
//       emiInterest = Math.ceil(approvedAmount * annualRate /tenure) ; // Flat monthly interest
//       emiTotal = emiPrincipal + emiInterest;
//       console.log(`💰 EMI breakdown — Principal: ₹${emiPrincipal}, Interest: ₹${emiInterest}, Total: ₹${emiTotal}`);
//     }

//     for (let i = 1; i <= tenure; i++) {
//       let principal = emiPrincipal;
//       let interest = emiInterest;

//       if (i === tenure) {
//         principal = remainingPrincipal;
//         emiTotal = principal + interest;
//         console.log(`🔧 Adjusting final EMI (Month ${i}) — Principal: ₹${principal}, Interest: ₹${interest}, Total: ₹${emiTotal}`);
//       }

//       rpsData.push([
//         lan,
//         dueDate.toISOString().split("T")[0],
//         emiTotal,
//         interest,
//         principal,
//         principal,
//         interest,
//         emiTotal,
//         "Pending"
//       ]);

//       console.log(`📌 Month ${i}: DueDate=${dueDate.toISOString().split("T")[0]}, EMI=₹${emiTotal}, Principal=₹${principal}, Interest=₹${interest}`);

//       remainingPrincipal -= principal;
//       dueDate.setMonth(dueDate.getMonth() + 1);
//     }

//     console.log(`📤 Inserting ${rpsData.length} RPS rows into manual_rps_gq_non_fsf...`);
//     await db.promise().query(
//       `INSERT INTO manual_rps_gq_non_fsf
//       (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
//       VALUES ?`,
//       [rpsData]
//     );

//     console.log(`✅ GQ NON-FSF RPS successfully generated for ${lan}\n`);
//   } catch (err) {
//     console.error(`❌ GQ NON-FSF RPS Error for ${lan}:`, err);
//   }
// };

// const generateRepaymentScheduleGQNonFSF = async (
//   lan,
//   approvedAmount,
//   interestRate,
//   tenure,
//   disbursementDate,
//   subventionAmount,
//   product,
//   lender,
//   no_of_advance_emis = 0
// ) => {
//   try {
//     console.log(`\n🚀 Generating GQ NON-FSF RPS for LAN: ${lan}`);
//     console.log(`📝 Inputs → ApprovedAmount: ₹${approvedAmount}, InterestRate: ${interestRate}%, Tenure: ${tenure}, DisbursementDate: ${disbursementDate}, SubventionAmount: ₹${subventionAmount}, Product: ${product}, Lender: ${lender}, AdvanceEMIs: ${no_of_advance_emis}`);

//     const annualRate = interestRate / 100;
//     let remainingPrincipal = approvedAmount;

//     const isZeroInterest = annualRate === 0;
//     const emiPrincipal = Math.round(approvedAmount / tenure);
//     let emiInterest = isZeroInterest ? 0 : Math.ceil((approvedAmount * annualRate) / tenure);
//     let emiTotal = emiPrincipal + emiInterest;

//     if (isZeroInterest) {
//       console.log("💡 Interest-free loan — EMI = Principal only");
//     } else {
//       console.log(`💰 EMI Breakdown → Principal: ₹${emiPrincipal}, Interest: ₹${emiInterest}, Total: ₹${emiTotal}`);
//     }

//     const rpsData = [];

//     for (let i = 1; i <= tenure; i++) {
//       let principal = emiPrincipal;
//       let interest = emiInterest;

//       if (i === tenure) {
//         principal = remainingPrincipal;
//         emiTotal = principal + interest;
//         console.log(`🔧 Adjusted Final EMI (Month ${i}): ₹${emiTotal} (P: ₹${principal}, I: ₹${interest})`);
//       }

//       // ✅ Calculate due date
//       let dueDate;
//       console.log(`💰 Month ${i} breakdown — Principal: ₹${principal}, Interest: ₹${interest}, Total: ₹${emiTotal}`);
//       console.log(`no of advance emis`, no_of_advance_emis);
//       if (no_of_advance_emis > 0 && i === 1) {
//         // Only the first EMI on disbursement date

//         dueDate = new Date(disbursementDate);
//       } else {
//         const offset = no_of_advance_emis > 0 ? i - 2 : i - 1;
//         dueDate = getFirstEmiDate(disbursementDate, lender, product, offset);
//       }

//       rpsData.push([
//         lan,
//         dueDate.toISOString().split("T")[0],
//         emiTotal,
//         interest,
//         principal,
//         principal,
//         interest,
//         emiTotal,
//         "Pending"
//       ]);

//       console.log(`📌 Month ${i}: DueDate=${dueDate.toISOString().split("T")[0]}, EMI=₹${emiTotal}`);
//       remainingPrincipal -= principal;
//     }

//     await db.promise().query(
//       `INSERT INTO manual_rps_gq_non_fsf
//       (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
//       VALUES ?`,
//       [rpsData]
//     );

//     // ➕ Update emi_amount in loan_bookings
//   //   await db.promise().query(
//   //     `UPDATE loan_booking_gq_non_fsf
//   //  SET emi_amount = ?
//   //  WHERE lan = ?`,
//   //     [emi, lan]
//   //   );

//     console.log(`✅ GQ NON-FSF RPS generated successfully for ${lan}\n`);
//   } catch (err) {
//     console.error(`❌ GQ NON-FSF RPS Error for ${lan}:`, err);
//   }
// };


////////////////// GQ NON-FSF LOAN CALCULATION /////////////////////////////////////////

const generateRepaymentScheduleGQNonFSF = async (
  lan,
  approvedAmount,
  emiDate,
  interestRate ,
  tenure,
  disbursementDate,
  subventionAmount,
  product,
  lender,
  no_of_advance_emis = 0
) => {
  try {
    console.log(`\n🚀 Generating GQ NON-FSF RPS for LAN: ${lan}`);
    console.log(`📝 Inputs → ApprovedAmount: ₹${approvedAmount}, InterestRate: ${interestRate}%, Tenure: ${tenure}, DisbursementDate: ${disbursementDate}, EMI Date: ${emiDate}, SubventionAmount: ₹${subventionAmount}, Product: ${product}, Lender: ${lender}, AdvanceEMIs: ${no_of_advance_emis}`);

    const annualRate = Number(interestRate ?? 0) / 100; ;
    let remainingPrincipal = approvedAmount;

    const isZeroInterest = annualRate === 0;
    const emiPrincipal = Math.round(approvedAmount / tenure);
    let emiInterest = isZeroInterest ? 0 : Math.ceil((approvedAmount * annualRate) / tenure);
    let emiTotal = emiPrincipal + emiInterest;

    const rpsData = [];

    for (let i = 1; i <= tenure; i++) {
      let principal = emiPrincipal;
      let interest = emiInterest;

      if (i === tenure) {
        principal = remainingPrincipal;
        emiTotal = principal + interest;
      }

      // Determine due date
      let dueDate;
      if (no_of_advance_emis > 0 && i === 1) {
        dueDate = new Date(disbursementDate); // first EMI date
      } else {
        const offset = no_of_advance_emis > 0 ? i - 2 : i - 1;
        dueDate = getFirstEmiDate(disbursementDate, emiDate, lender, product, offset);
      }

      rpsData.push([
        lan,
        dueDate.toISOString().split("T")[0],
        emiTotal,
        interest,
        principal,
        principal,
        interest,
        emiTotal,
        "Pending"
      ]);

      remainingPrincipal -= principal;
    }

    await db.promise().query(
      `INSERT INTO manual_rps_gq_non_fsf
      (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
      VALUES ?`,
      [rpsData]
    );

    console.log(`✅ GQ NON-FSF RPS generated successfully for ${lan}\n`);
  } catch (err) {
    console.error(`❌ GQ NON-FSF RPS Error for ${lan}:`, err);
  }
};

// const generateRepaymentScheduleGQNonFSF = async (
//   lan,
//   approvedAmount,         // P
//   emiDate,
//   interestRate,           // % per annum
//   tenure,                 // n
//   disbursementDate,
//   subventionAmount,
//   product,
//   lender,
//   no_of_advance_emis = 0  // k
// ) => {
//   try {
//     console.log(`\n🚀 Generating GQ NON-FSF RPS for LAN: ${lan}`);

//     const P = Number(approvedAmount || 0);
//     const k = Number(no_of_advance_emis || 0);
//     const n = Number(tenure || 0);
//     const annual = Number(interestRate || 0) / 100;
//     const r = annual / 12;                       // monthly
//     const m = n - k;                             // months after advance EMIs
//     if (n <= 0 || P <= 0) throw new Error("Invalid principal/tenure");

//     // --- EMI with advance formula ---
//     let emi;
//     if (r === 0) {
//       emi = Math.round(P / n);
//     } else {
//       const pow = Math.pow(1 + r, m);
//       const a = (r * pow) / (pow - 1);          // standard annuity factor
//       emi = Math.round((a * P) / (1 + a * k));  // handles advance EMIs
//     }

//     // Build rows
//     const rows = [];
//     let opening = P;

//     // 1) Advance EMI rows (pure principal)
//     for (let i = 1; i <= k; i++) {
//       const interest = 0;
//       const principal = emi;
//       const closing = +(opening - principal).toFixed(2);

//       // due date: on disbursement day for the advance EMI
//       const dueDate = new Date(disbursementDate);

//       rows.push({
//         seq: `ADV-${i}`,
//         dueDate: dueDate.toISOString().split("T")[0],
//         emi,
//         interest,
//         principal,
//         closing,
//       });

//       opening = closing;
//     }

//     // 2) Regular schedule for remaining months
//     for (let i = 1; i <= m; i++) {
//       let interest = r === 0 ? 0 : Math.round(opening * r);
//       let principal = emi - interest;

//       // last row: force close to zero (handles rounding)
//       if (i === m) {
//         principal = Math.round(opening * 100) / 100;
//         interest = emi - principal;
//       }

//       const closing = +(opening - principal).toFixed(2);

//       // due date: month offsets after disbursement/first EMI date
//       const offset = i - 1; // 0 for first post-advance EMI, 1 for next, etc.
//       const dueDate = getFirstEmiDate(disbursementDate, emiDate, lender, product, offset);

//       rows.push({
//         seq: i,
//         dueDate: dueDate.toISOString().split("T")[0],
//         emi,
//         interest,
//         principal: Math.round(principal),  // store as ₹ rounded if you prefer
//         closing,
//       });

//       opening = closing;
//     }

//     // Optional: compute running "remaining_*" totals from the bottom up
//     let remEmi = 0, remInterest = 0;
//     for (let i = rows.length - 1; i >= 0; i--) {
//       remEmi += rows[i].emi;
//       remInterest += rows[i].interest;
//       rows[i].remaining_emi = remEmi;
//       rows[i].remaining_interest = remInterest;
//       rows[i].remaining_principal = rows[i].closing;
//     }

//     // Prepare bulk insert payload
//     const rpsData = rows.map(r => ([
//       lan,
//       r.dueDate,
//       r.emi,
//       r.interest,
//       r.principal,
//       r.remaining_principal,
//       r.remaining_interest,
//       r.remaining_emi,
//       "Pending"
//     ]));

//     await db.promise().query(
//       `INSERT INTO manual_rps_gq_non_fsf
//        (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
//        VALUES ?`,
//       [rpsData]
//     );

//     console.log(`✅ GQ NON-FSF RPS generated successfully for ${lan}\n`);
//   } catch (err) {
//     console.error(`❌ GQ NON-FSF RPS Error for ${lan}:`, err);
//   }
// };



//////////GQ FSF LOAN CALCULATION /////////////////////////////////////////
const generateRepaymentScheduleGQFSF = async (
  lan,
  approvedAmount,
  emiDate,
  interestRate,
  tenure,
  disbursementDate,
  subventionAmount,
  product,
  lender,
  no_of_advance_emis
) => {
  try {
    console.log(`\n🚀 Generating GQ FSF RPS for LAN: ${lan}`);
    console.log(`📝 Inputs → ApprovedAmount: ₹${approvedAmount}, InterestRate: ${interestRate}%, Tenure: ${tenure}, DisbursementDate: ${disbursementDate}, SubventionAmount: ₹${subventionAmount}, Product: ${product}, Lender: ${lender}, AdvanceEMIs: ${no_of_advance_emis}`);

    const annualRate = interestRate / 100;
    let remainingPrincipal = approvedAmount;

    const isZeroInterest = annualRate === 0;
    const emiPrincipal = Math.round(approvedAmount / tenure);
    let emiInterest = isZeroInterest ? 0 : Math.ceil((approvedAmount * annualRate) / tenure);
    let emiTotal = emiPrincipal + emiInterest;

    if (isZeroInterest) {
      console.log("💡 Interest-free loan — EMI = Principal only");
    } else {
      console.log(`💰 EMI Breakdown → Principal: ₹${emiPrincipal}, Interest: ₹${emiInterest}, Total: ₹${emiTotal}`);
    }

    const rpsData = [];

    for (let i = 1; i <= tenure; i++) {
      let principal = emiPrincipal;
      let interest = emiInterest;

      if (i === tenure) {
        principal = remainingPrincipal;
        emiTotal = principal + interest;
        console.log(`🔧 Adjusted Final EMI (Month ${i}): ₹${emiTotal} (P: ₹${principal}, I: ₹${interest})`);
      }

      // ✅ Calculate due date
      let dueDate;
      console.log(`💰 Month ${i} breakdown — Principal: ₹${principal}, Interest: ₹${interest}, Total: ₹${emiTotal}`);
      console.log(`no of advance emis`, no_of_advance_emis);
      if (no_of_advance_emis > 0 && i === 1) {
        // Only the first EMI on disbursement date

        dueDate = new Date(disbursementDate);
      } else {
        const offset = no_of_advance_emis > 0 ? i - 2 : i - 1;
        dueDate = getFirstEmiDate(disbursementDate, emiDate, lender, product, offset);
      }

      rpsData.push([
        lan,
        dueDate.toISOString().split("T")[0],
        emiTotal,
        interest,
        principal,
        principal,
        interest,
        emiTotal,
        "Pending"
      ]);

      console.log(`📌 Month ${i}: DueDate=${dueDate.toISOString().split("T")[0]}, EMI=₹${emiTotal}`);
      remainingPrincipal -= principal;
    }

    await db.promise().query(
      `INSERT INTO manual_rps_gq_fsf
      (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
      VALUES ?`,
      [rpsData]
    );

    // ➕ Update emi_amount in loan_bookings
  //   await db.promise().query(
  //     `UPDATE loan_bookings_gq_fsf
  //  SET emi_amount = ?
  //  WHERE lan = ?`,
  //     [emiTotal, lan]
  //   );

    console.log(`✅ GQ FSF RPS generated successfully for ${lan}\n`);
  } catch (err) {
    console.error(`❌ GQ FSF RPS Error for ${lan}:`, err);
  }
};

///////////////////////////// ADIKOSH LOAN CALCULATION /////////////////////////////////////////
/////// Without PRE EMI /////////////

// const generateRepaymentScheduleAdikosh = async (
//   lan,
//   loanAmount,
//   interestRate,
//   tenure,
//   disbursementDate,
//   salaryDay
// ) => {
//   try {
//     const annualRate = interestRate / 100;
//     const firstDueDate = getFirstEmiDate(disbursementDate, "Adikosh", "Adikosh", 0, salaryDay);

//     const tables = [
//       { name: "manual_rps_adikosh", factor: 1.0, customRate: null },
//       { name: "manual_rps_adikosh_fintree", factor: 0.8, customRate: null },
//       { name: "manual_rps_adikosh_partner", factor: 0.2, customRate: null },
//       { name: "manual_rps_adikosh_fintree_roi", factor: 0.8, customRate: 21.5 }, // NEW entry
//     ];

//     for (const table of tables) {
//       const rpsData = [];
//       const baseAmount = loanAmount * table.factor;
//       const tableAnnualRate = (table.customRate ?? interestRate) / 100;

//       let remainingPrincipal = baseAmount;
//       let dueDate = new Date(firstDueDate);

  
//       const emi = Math.ceil(
//         (baseAmount * (tableAnnualRate / 12) * Math.pow(1 + tableAnnualRate / 12, tenure)) /
//         (Math.pow(1 + tableAnnualRate / 12, tenure) - 1)
//       );

//       for (let i = 1; i <= tenure; i++) {
//         const interest = Math.ceil((remainingPrincipal * tableAnnualRate * 30) / 360);
//         let principal = emi - interest;
//         if (i === tenure) principal = remainingPrincipal;

//         rpsData.push([
//           lan,
//           dueDate.toISOString().split("T")[0],
//           principal + interest,
//           interest,
//           principal,
//           principal,
//           interest,
//           principal + interest,
//           "Pending"
//         ]);

//         remainingPrincipal -= principal;
//         dueDate.setMonth(dueDate.getMonth() + 1);
//       }

//       await db.promise().query(
//         `INSERT INTO ${table.name}
//          (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
//          VALUES ?`,
//         [rpsData]
//       );

//       console.log(`✅ ${table.name} RPS generated for ${lan}`);
//     }
//   } catch (err) {
//     console.error(`❌ Adikosh RPS Error for ${lan}:`, err);
//   }
// };

// const generateRepaymentScheduleAdikosh = async (
//   lan,
//   loanAmount,
//   interestRate,
//   tenure,
//   disbursementDate,
//   salaryDay
// ) => {
//   try {
//     const firstDueDate = getFirstEmiDate(disbursementDate, "Adikosh", "Adikosh", 0, salaryDay);

//     const tables = [
//       { name: "manual_rps_adikosh", factor: 1.0, customRate: null },
//       { name: "manual_rps_adikosh_fintree", factor: 0.8, customRate: null },
//       { name: "manual_rps_adikosh_partner", factor: 0.2, customRate: null },
//       { name: "manual_rps_adikosh_fintree_roi", factor: 0.8, customRate: 21.5 }, // NEW entry
//     ];

//     for (const table of tables) {
//       const rpsData = [];
//       const baseAmount = loanAmount * table.factor;
//       const annualRate = (table.customRate ?? interestRate) / 100;
//       const monthlyRate = annualRate / 12;

//       let remainingPrincipal = baseAmount;
//       let dueDate = new Date(firstDueDate);

//       const emi = Math.ceil(
//         (baseAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
//         (Math.pow(1 + monthlyRate, tenure) - 1)
//       );

//       for (let i = 1; i <= tenure; i++) {
//         const interest = Math.ceil((remainingPrincipal * annualRate * 30) / 360);
//         let principal = emi - interest;

//         // ❌ DO NOT adjust principal to match remaining on last EMI
//         // If the last EMI overpays, remainingPrincipal may go negative, that’s fine

//         rpsData.push([
//           lan,
//           dueDate.toISOString().split("T")[0],
//           emi,
//           interest,
//           principal,
//           Math.max(remainingPrincipal - principal, 0), // remaining_principal cannot be negative
//           interest,
//           emi,
//           "Pending"
//         ]);

//         remainingPrincipal -= principal;
//         dueDate.setMonth(dueDate.getMonth() + 1);
//       }

//       await db.promise().query(
//         `INSERT INTO ${table.name}
//          (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
//          VALUES ?`,
//         [rpsData]
//       );

//       console.log(`✅ ${table.name} RPS generated for ${lan}`);
//     }
//   } catch (err) {
//     console.error(`❌ Adikosh RPS Error for ${lan}:`, err);
//   }
// };
/////////////////////////EMBIFI START///////////////////////////////////////
const generateRepaymentScheduleEmbifi = async (
  lan, loanAmount, interestRate, tenure, disbursementDate, product, lender
) => {
  try {
    const annualRate = interestRate / 100;
    let remainingPrincipal = loanAmount;

    const emi = Math.round(
      (loanAmount * (annualRate / 12) * Math.pow(1 + annualRate / 12, tenure)) /
      (Math.pow(1 + annualRate / 12, tenure) - 1)
    );

    const disbDate = new Date(disbursementDate);
    const firstDueDate = new Date(disbDate);
    firstDueDate.setMonth(disbDate.getMonth() + 1);

    const rpsData = [];
    let dueDate = new Date(firstDueDate);

    for (let i = 1; i <= tenure; i++) {
      const interest = Math.ceil((remainingPrincipal * annualRate * 30) / 360);
      let principal = emi - interest;

      if (i === tenure) principal = remainingPrincipal;

      rpsData.push([
        lan,
        dueDate.toISOString().split("T")[0],
        emi,
        interest,
        principal,
        remainingPrincipal - principal,
        Math.max(interest * (tenure - i), 0),
        tenure - i,
        "Pending",
      ]);

      remainingPrincipal -= principal;
      dueDate.setMonth(dueDate.getMonth() + 1);
    }

    await db.promise().query(
      `INSERT INTO manual_rps_embifi_loan
        (lan, due_date, emi, interest, principal,
         remaining_principal, remaining_interest, remaining_emi, status)
       VALUES ?`,
      [rpsData]
    );

    await db.promise().query(
      `UPDATE loan_booking_embifi
         SET emi_amount = ?
       WHERE lan = ?`,
      [emi, lan]
    );

    console.log(`✅ Embifi RPS generated from next month for ${lan}`);
  } catch (err) {
    console.error(`❌ Embifi RPS Error for ${lan}:`, err);
  }
};



////////////////////////ADIKOSH START //////////////////////////////////
// Assumes:
//  - mysql2 connection exported as `db`
//  - a working getFirstEmiDate(disbursementDate, _, lender, product, _, salaryDay)

// Assumes: mysql2 connection as `db` and a valid getFirstEmiDate()

const fmt2 = (n) => Number((n ?? 0).toFixed(2));

const generateRepaymentScheduleAdikosh = async (
  lan,
  loanAmount,
  interestRate,      // annual % (e.g., 24 => 24% p.a.)
  tenure,            // months
  disbursementDate,  // "YYYY-MM-DD"
  salaryDay          // integer day-of-month for first EMI alignment
) => {
  try {
    const firstDueDate = getFirstEmiDate(
      disbursementDate,
      null,
      "Adikosh",
      "Adikosh",
      0,
      salaryDay
    );

    console.log({ lan, loanAmount, interestRate, tenure, salaryDay, firstDueDate });

    const tables = [
      { name: "manual_rps_adikosh",         factor: 1.0, customRate: null, hasOC: true  },
      { name: "manual_rps_adikosh_fintree", factor: 0.8, customRate: null, hasOC: false },
      { name: "manual_rps_adikosh_partner", factor: 0.2, customRate: null, hasOC: false },
    ];

    for (const table of tables) {
      const rpsData = [];
      const baseAmount  = loanAmount * table.factor;
      const annualRate  = (table.customRate ?? interestRate) / 100; // e.g., 24 => 0.24
      const monthlyRate = annualRate / 12;

      let openingPrincipal = fmt2(baseAmount);
      let dueDate = new Date(firstDueDate);

      // EMI is fixed for all periods
      const baseEmi = Math.ceil(
        (baseAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
        (Math.pow(1 + monthlyRate, tenure) - 1)
      );

      for (let i = 1; i <= tenure; i++) {
        const opening = fmt2(openingPrincipal);

        // Default month: 30/360 interest on opening
        let interest  = Math.round((opening * annualRate * 30) / 360);
        let emi       = baseEmi;
        let principal = emi - interest;

        // LAST INSTALLMENT: keep EMI constant; clear residue in principal, adjust interest
        if (i === tenure) {
          principal = Math.round(opening);
          interest  = emi - principal;
          if (interest < 0) {              // safety guard (very unlikely)
            interest  = 0;
            principal = emi;
          }
        }

        const closing = fmt2(Math.max(opening - principal, 0));

        // Column meanings:
        const remainingAmountField    = fmt2(emi);        // period EMI
        const remainingPrincipalField = fmt2(principal);  // period principal only
        const remainingInterestField  = fmt2(interest);   // period interest only
        const remainingEmiAmount      = remainingPrincipalField + remainingInterestField;       // count of EMIs left

        if (table.hasOC) {
          // MAIN TABLE (has opening/closing/remaining_amount)
          rpsData.push([
            lan,
            dueDate.toISOString().split("T")[0],
            fmt2(emi),                    // emi
            fmt2(interest),               // interest (period)
            fmt2(principal),              // principal (period)
            opening,                      // opening
            closing,                      // closing
            remainingEmiAmount,            // remaining_emi (count)
            remainingAmountField,         // remaining_amount (EMI of period)
            remainingPrincipalField,      // remaining_principal (period principal)
            remainingInterestField,       // remaining_interest  (period interest)
            "Pending"
          ]);
        } else {
          // SPLIT TABLES (no opening/closing/remaining_amount)
          rpsData.push([
            lan,
            dueDate.toISOString().split("T")[0],
            fmt2(emi),                    // emi
            fmt2(interest),               // interest (period)
            fmt2(principal),              // principal (period)
            remainingPrincipalField,      // remaining_principal (period principal)
            remainingInterestField,       // remaining_interest  (period interest)
            remainingEmiAmount,            // remaining_emi (Amount)
            "Pending"
          ]);
        }

        openingPrincipal = closing;
        dueDate.setMonth(dueDate.getMonth() + 1);
      }

      if (table.hasOC) {
        await db.promise().query(
          `INSERT INTO ${table.name}
           (lan, due_date, emi, interest, principal, opening, closing,
            remaining_emi, remaining_amount, remaining_principal, remaining_interest, status)
           VALUES ?`,
          [rpsData]
        );
      } else {
        await db.promise().query(
          `INSERT INTO ${table.name}
           (lan, due_date, emi, interest, principal,
            remaining_principal, remaining_interest, remaining_emi, status)
           VALUES ?`,
          [rpsData]
        );
      }

      console.log(`✅ ${table.name} RPS generated for ${lan}`);
    }

    // ROI table from MAIN (period values; EMI not adjusted)
    const [mainRows] = await db.promise().query(
      `SELECT lan, due_date, emi, interest, principal
         FROM manual_rps_adikosh
        WHERE lan = ?
        ORDER BY due_date ASC`,
      [lan]
    );

    const fintreeRoiData = [];
    for (const row of mainRows) {
      const scaledPrincipal = Math.round(row.principal * 0.8);
      const scaledInterest  = Math.round(row.interest  * 0.8 * (21.5 / 33));
      const roiEmi          = scaledPrincipal + scaledInterest;

      fintreeRoiData.push([
        lan,
        row.due_date,
        fmt2(roiEmi),
        fmt2(scaledInterest),
        fmt2(scaledPrincipal),
        fmt2(scaledPrincipal), // remaining_principal = period principal (scaled)
        fmt2(scaledInterest),  // remaining_interest  = period interest  (scaled)
        0,                     // remaining_emi (set if you need)
        "Pending",
      ]);
    }

    await db.promise().query(
      `INSERT INTO manual_rps_adikosh_fintree_roi
       (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
       VALUES ?`,
      [fintreeRoiData]
    );

    console.log(`✅ manual_rps_adikosh_fintree_roi generated for ${lan}`);
  } catch (err) {
    console.error(`❌ Adikosh RPS Error for ${lan}:`, err);
    throw err;
  }
};






////////////////////////ADIKOSH END //////////////////////////////////




///// WIth PRE EMI /////////////
// const generateRepaymentScheduleAdikosh = async (
//   lan,
//   loanAmount,
//   interestRate,
//   tenure,
//   disbursementDate,
//   salaryDay
// ) => {
//   try {
//     const annualRate = interestRate / 100;
//     const firstDueDate = getFirstEmiDate(disbursementDate, "Adikosh", "Adikosh", 0, salaryDay);
//     const disbDate = new Date(disbursementDate);
//     const firstEMIDate = new Date(firstDueDate);

//     let gapDays = Math.floor((firstEMIDate - disbDate) / (1000 * 60 * 60 * 24));
//     console.log("Gap Days:", gapDays);

//     // If gapDays > 30, subtract the days in the disbursement month
//     if (gapDays > 30) {
//       const daysInDisbMonth = new Date(disbDate.getFullYear(), disbDate.getMonth() + 1, 0).getDate();
//       gapDays = gapDays - daysInDisbMonth;
//     }
//     console.log("Adjusted Gap DaysSSS:", gapDays);

//     // Pre-EMI calculation
//     const preEmiAmount = Math.round((loanAmount * annualRate * gapDays) / 365);
//     console.log("Pre-EMI Amount:", preEmiAmount);
//     console.log("First EMI Date:", firstEMIDate.toISOString().split("T")[0]);

//     // Save pre-emi to loan_bookings table (optional - depending on your flow)
//     await db.promise().query(
//       `UPDATE loan_booking_adikosh SET pre_emi = ? WHERE lan = ?`,
//       [preEmiAmount, lan]
//     );

//     const tables = [
//       { name: "manual_rps_adikosh", factor: 1.0, customRate: null },
//       { name: "manual_rps_adikosh_fintree", factor: 0.8, customRate: null },
//       { name: "manual_rps_adikosh_partner", factor: 0.2, customRate: null },
//       { name: "manual_rps_adikosh_fintree_roi", factor: 0.8, customRate: 20.25 },
//     ];

//     for (const table of tables) {
//       const rpsData = [];
//       const baseAmount = loanAmount * table.factor;
//       const tableAnnualRate = (table.customRate ?? interestRate) / 100;

//       let remainingPrincipal = baseAmount;
//       let dueDate = new Date(firstDueDate);

//       const emi = Math.round(
//         (baseAmount * (tableAnnualRate / 12) * Math.pow(1 + tableAnnualRate / 12, tenure)) /
//         (Math.pow(1 + tableAnnualRate / 12, tenure) - 1)
//       );
//       //   // 🔹 with out Add pre-EMI to first EMI's interest
//       // for (let i = 1; i <= tenure; i++) {
//       //   const interest = Math.ceil((remainingPrincipal * tableAnnualRate * 30) / 360);
//       //   let principal = emi - interest;
//       //   if (i === tenure) principal = remainingPrincipal;

//       //   // 🔹 Add pre-EMI to first EMI's interest
//       for (let i = 1; i <= tenure; i++) {
//         let interest = Math.ceil((remainingPrincipal * tableAnnualRate * 30) / 360);

//         // 🔹 Add pre-EMI to first EMI's interest
//         if (i === 1) interest += preEmiAmount;


//         rpsData.push([
//           lan,
//           dueDate.toISOString().split("T")[0],
//           principal + interest,
//           interest,
//           principal,
//           principal,
//           interest,
//           principal + interest,
//           "Pending"
//         ]);

//         remainingPrincipal -= principal;
//         dueDate.setMonth(dueDate.getMonth() + 1);
//       }

//       await db.promise().query(
//         `INSERT INTO ${table.name}
//          (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
//          VALUES ?`,
//         [rpsData]
//       );

//       // ➕ Update emi_amount in loan_bookings
//       await db.promise().query(
//         `UPDATE loan_booking_adikosh
//    SET emi_amount = ?
//    WHERE lan = ?`,
//         [emi, lan]
//       );

//       console.log(`✅ ${table.name} RPS generated for ${lan}`);
//     }

//     console.log(`💡 Pre-EMI calculated: ₹${preEmiAmount} for ${gapDays} days`);

//   } catch (err) {
//     console.error(`❌ Adikosh RPS Error for ${lan}:`, err);
//   }
// };


///////////////////////////////////////////////////////////////////////////////////////////////////////

const generateRepaymentSchedule = async (
  lan,
  loanAmount,
  emiDate,
  interestRate,
  tenure,
  disbursementDate,
  subventionAmount,
  no_of_advance_emis,
  salary_day,
  product,
  lender
) => {
  console.log("lender testing", lender);

  if (lender === "BL Loan") {
    await generateRepaymentScheduleBL(
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender
    );

  } else if (lender === "EV Loan" && product === "Monthly Loan") {
    await generateRepaymentScheduleEV(
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender
    );

  } else if (lender === "GQ Non-FSF") {
    await generateRepaymentScheduleGQNonFSF(
      lan,
      loanAmount,
      emiDate,
      interestRate,
      tenure,
      disbursementDate,
      subventionAmount,
      product,
      lender,
      no_of_advance_emis
    );

  }  else if (lender === "GQ FSF") {
    await generateRepaymentScheduleGQFSF(
      lan,
      loanAmount,
      emiDate,
      interestRate,
      tenure,
      disbursementDate,
      subventionAmount,
      product,
      lender,
      no_of_advance_emis
    );
   } else if (lender === "Adikosh") {
    await generateRepaymentScheduleAdikosh(
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      salary_day
    );
  }
    else if (lender === "Embifi") {
    await generateRepaymentScheduleEmbifi(
       lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender
    );

  } else {
    console.warn(`⚠️ Unknown lender type: ${lender}. Skipping RPS generation.`);
  }
};

module.exports = {
  generateRepaymentScheduleEV,
  generateRepaymentScheduleBL,
  generateRepaymentScheduleGQNonFSF,
  generateRepaymentScheduleGQFSF,
  generateRepaymentScheduleAdikosh,
  generateRepaymentSchedule,
  generateRepaymentScheduleEmbifi,
  excelSerialDateToJS
};
