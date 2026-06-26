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
const {
  isCarepayLoanType,
  normalizeCarepayProduct,
} = require("./constant.js");

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
      Jan: 0,
      Feb: 1,
      Mar: 2,
      Apr: 3,
      May: 4,
      Jun: 5,
      Jul: 6,
      Aug: 7,
      Sep: 8,
      Oct: 9,
      Nov: 10,
      Dec: 11,
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
//         const firstDueDate = getFirstEmiDate(disbursementDate, null, lender, product);

//         console.log("Calling getFirstEmiDate (EV) with:", { disbursementDate, lender, product });
//         console.log("First Due Date (EV):", firstDueDate);

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

/////////////////////////////working ev of 20-09-2025//////////////////////////
// const generateRepaymentScheduleEV = async (
//   lan,
//   loanAmount,
//   interestRate,
//   tenure,
//   disbursementDate,
//   product,
//   lender
// ) => {
//   try {
//     const annualRate = interestRate / 100;
//     let remainingPrincipal = loanAmount;

//     // Calculate EMI
//     const emi = Math.round(
//       (loanAmount * (annualRate / 12) * Math.pow(1 + annualRate / 12, tenure)) /
//         (Math.pow(1 + annualRate / 12, tenure) - 1)
//     );

//     // Set RPS start date to same day of next month from disbursement
//     const firstDueRaw = getFirstEmiDate(
//       disbursementDate,
//       null,
//       lender,
//       product
//     );

//     console.log("Calling getFirstEmiDate (EV) with:", {
//       disbursementDate,
//       lender,
//       product,
//     });

//     console.log("First Due Date (EV):", firstDueRaw);

//     const firstDueDate = new Date(firstDueRaw);

//     if (Number.isNaN(firstDueDate.getTime())) {
//       throw new Error(
//         `Invalid first due date from getFirstEmiDate: ${firstDueRaw}`
//       );
//     }

//     const rpsData = [];
//     let dueDate = new Date(firstDueDate);

//     for (let i = 1; i <= tenure; i++) {
//       const interest = Math.ceil((remainingPrincipal * annualRate * 30) / 360);
//       console.log("annualRate:", annualRate);
//       console.log("Remaining Principal:", remainingPrincipal);
//       console.log("Interest:", interest);
//       console.log("EMI:", emi);
//       let principal = emi - interest;
//       if (i === tenure) principal = remainingPrincipal;

//       rpsData.push([
//         lan,
//         dueDate.toISOString().split("T")[0],
//         principal + interest,
//         interest,
//         principal,
//         principal, // ✅ This shows Remaining Principal = principal for that EMI
//         interest,
//         principal + interest,
//         "Pending",
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

//     // ➕ Update emi_amount in loan_bookings
//     await db.promise().query(
//       `UPDATE loan_booking_ev
//    SET emi_amount = ?
//    WHERE lan = ?`,
//       [emi, lan]
//     );

//     console.log(`✅ EV RPS generated from next month for ${lan}`);
//   } catch (err) {
//     console.error(`❌ EV RPS Error for ${lan}:`, err);
//   }
// };

///////////////////////////////////////////////////////////////////////////////////////////////////////

const generateRepaymentScheduleEV = async (
  conn, // <<<<<<<<<< ACCEPT TRANSACTION CONNECTION
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
  product,
  lender,
) => {
  // ❗ No outer try/catch here that swallows errors. Let them bubble to caller.

  const annualRate = interestRate / 100;
  let remainingPrincipal = loanAmount;

  // Calculate EMI
  const emi = Math.round(
    (loanAmount * (annualRate / 12) * Math.pow(1 + annualRate / 12, tenure)) /
      (Math.pow(1 + annualRate / 12, tenure) - 1),
  );

  // Set RPS start date to same day of next month from disbursement
  const firstDueRaw = getFirstEmiDate(disbursementDate, null, lender, product);

  console.log("Calling getFirstEmiDate (EV) with:", {
    disbursementDate,
    lender,
    product,
  });

  console.log("First Due Date (EV):", firstDueRaw);

  const firstDueDate = new Date(firstDueRaw);

  if (Number.isNaN(firstDueDate.getTime())) {
    throw new Error(
      `Invalid first due date from getFirstEmiDate: ${firstDueRaw}`,
    );
  }

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
      principal, // ✅ preserve your existing behavior: Remaining Principal = principal for that EMI
      interest,
      principal + interest,
      "Pending",
    ]);

    remainingPrincipal -= principal;
    dueDate.setMonth(dueDate.getMonth() + 1);
  }

  // Use the SAME TRANSACTION CONNECTION
  await conn.query(
    `INSERT INTO manual_rps_ev_loan
     (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
     VALUES ?`,
    [rpsData],
  );

  // ➕ Update emi_amount in loan_bookings (EV) within the same tx
  await conn.query(
    `UPDATE loan_booking_ev
     SET emi_amount = ?
     WHERE lan = ?`,
    [emi, lan],
  );

  console.log(`✅ EV RPS generated from next month for ${lan}`);
};
////////////////////// HELIUM  RPS ////////////////////////

const generateRepaymentScheduleHelium = async (
  conn, // transaction connection
  lan,
  loanAmount,
  interestRate, // annual rate e.g. 18
  tenure, // in months
  disbursementDate,
  product,
  lender,
) => {
  // 1️⃣ Convert annual → monthly interest
  const monthlyRate = interestRate / 100 / 12;

  // 2️⃣ First EMI date from rule = always 5th
  const firstDueRaw = getFirstEmiDate(
    disbursementDate,
    null,
    "HELIUM",
    product,
  );
  const firstDueDate = new Date(firstDueRaw);

  if (Number.isNaN(firstDueDate.getTime())) {
    throw new Error(
      `Invalid first EMI date returned for HELIUM: ${firstDueRaw}`,
    );
  }

  console.log(
    `💠 HELIUM first EMI date →`,
    firstDueDate.toISOString().split("T")[0],
  );

  let openingPrincipal = loanAmount;
  let dueDate = new Date(firstDueDate);

  const rpsData = [];

  for (let i = 1; i <= tenure; i++) {
    // 3️⃣ Interest-only EMI (no principal until last EMI)
    const interest = Math.round(openingPrincipal * monthlyRate);
    let principal = 0;
    let emiAmount = interest;

    // Final month — full settlement (principal + interest)
    if (i === tenure) {
      principal = openingPrincipal;
      emiAmount = principal + interest;
    }

    // Closing principal after this installment
    const closingPrincipal = Math.max(0, openingPrincipal - principal);

    // push row like EMICLUB style
    rpsData.push([
      lan,
      dueDate.toISOString().split("T")[0], // due_date
      emiAmount, // emi
      interest, // interest
      principal, // principal
      principal, // remaining_principal (same as principal paid)
      interest, // remaining_interest
      emiAmount, // remaining_emi
      openingPrincipal, // opening balance
      closingPrincipal, // closing balance
      "Pending",
    ]);

    openingPrincipal = closingPrincipal;
    dueDate.setMonth(dueDate.getMonth() + 1);
  }

  // 5️⃣ Insert into manual_rps_helium
  await conn.query(
    `INSERT INTO manual_rps_helium
     (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, opening, closing, status)
     VALUES ?`,
    [rpsData],
  );

  console.log(`📌 HELIUM RPS generated for ${lan}`);
};

////////////////// HEY EV RPS GENERATE START //////////////

const generateRepaymentScheduleHEYEV = async (
  conn,
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
  product,
  lender,
) => {
  // ❗ No outer try/catch here that swallows errors. Let them bubble to caller.

  const annualRate = interestRate / 100;
  let remainingPrincipal = loanAmount;

  // Calculate EMI
  const emi = Math.round(
    (loanAmount * (annualRate / 12) * Math.pow(1 + annualRate / 12, tenure)) /
      (Math.pow(1 + annualRate / 12, tenure) - 1),
  );

  // Set RPS start date to same day of next month from disbursement
  const firstDueRaw = getFirstEmiDate(disbursementDate, null, lender, product);

  console.log("Calling getFirstEmiDate (HEY EV) with:", {
    disbursementDate,
    lender,
    product,
  });

  console.log("First Due Date (HEYEV):", firstDueRaw);

  const firstDueDate = new Date(firstDueRaw);

  if (Number.isNaN(firstDueDate.getTime())) {
    throw new Error(
      `Invalid first due date from getFirstEmiDate: ${firstDueRaw}`,
    );
  }

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
      principal, // ✅ preserve your existing behavior: Remaining Principal = principal for that EMI
      interest,
      principal + interest,
      "Pending",
    ]);

    remainingPrincipal -= principal;
    dueDate.setMonth(dueDate.getMonth() + 1);
  }

  // Use the SAME TRANSACTION CONNECTION
  await conn.query(
    `INSERT INTO manual_rps_hey_ev
     (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
     VALUES ?`,
    [rpsData],
  );

  // ➕ Update emi_amount in loan_bookings (HEY EV) within the same tx
  await conn.query(
    `UPDATE loan_booking_hey_ev
     SET emi_amount = ?
     WHERE lan = ?`,
    [emi, lan],
  );

  console.log(`✅ EV RPS generated from next month for ${lan}`);
};

/////////////////////// HEY EV BATTERY RPS GENERATE START ////////////////////////
const generateRepaymentScheduleHEYEVBattery = async (
  conn,
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
  product,
  lender,
) => {
  const annualRate = interestRate / 100;
  let remainingPrincipal = loanAmount;

  // EMI
  const emi = Math.round(
    (loanAmount * (annualRate / 12) * Math.pow(1 + annualRate / 12, tenure)) /
      (Math.pow(1 + annualRate / 12, tenure) - 1),
  );

  // First EMI date
  const firstDueRaw = getFirstEmiDate(disbursementDate, null, lender, product);

  console.log("Calling getFirstEmiDate (HEY EV Battery) with:", {
    disbursementDate,
    lender,
    product,
  });
  console.log("First Due Date (HEYEV Battery):", firstDueRaw);

  const firstDueDate = new Date(firstDueRaw);
  if (Number.isNaN(firstDueDate.getTime())) {
    throw new Error(
      `Invalid first due date from getFirstEmiDate (Battery): ${firstDueRaw}`,
    );
  }

  const rpsData = [];
  let dueDate = new Date(firstDueDate);

  for (let i = 1; i <= tenure; i++) {
    const interest = Math.ceil((remainingPrincipal * annualRate * 30) / 360);
    let principal = emi - interest;
    if (i === tenure) principal = remainingPrincipal;

    rpsData.push([
      lan,
      dueDate.toISOString().split("T")[0],
      principal + interest, // emi
      interest,
      principal,
      principal, // keeping same behaviour as HEYEV: remaining_principal = principal
      interest,
      principal + interest,
      "Pending",
    ]);

    remainingPrincipal -= principal;
    dueDate.setMonth(dueDate.getMonth() + 1);
  }

  // Battery RPS table
  await conn.query(
    `INSERT INTO manual_rps_hey_ev_battery
     (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
     VALUES ?`,
    [rpsData],
  );

  // Update emi_amount in battery loan table
  await conn.query(
    `UPDATE loan_booking_hey_ev_battery
     SET emi_amount = ?
     WHERE lan = ?`,
    [emi, lan],
  );

  console.log(`✅ HEY EV Battery RPS generated from next month for ${lan}`);
};
///////////////////////////////////////
///////////////////////// ZYPAY LOAN RPS /////////////////////////
// const generateRepaymentScheduleZypay = async (
//   conn,           // Transaction connection
//   lan,
//   loanAmount,
//   interestRate,   // Annual % e.g. 45
//   tenure,         // in months
//   disbursementDate,
//   product,
//   lender
// ) => {
//   // 1️⃣ Convert annual → monthly rate
//   const monthlyRate = (interestRate / 100) / 12;

//   // 2️⃣ Compute EMI using PMT formula
//   const emi = Math.round(
//     (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
//       (Math.pow(1 + monthlyRate, tenure) - 1)
//   );

//   console.log(`✅ EMI (calculated for ${lan}):`, emi);

//   // 3️⃣ Get first due date
//   const firstDueRaw = getFirstEmiDate(disbursementDate, null, lender, product);
//   const firstDueDate = new Date(firstDueRaw);
//   if (Number.isNaN(firstDueDate.getTime())) {
//     throw new Error(`Invalid first due date from getFirstEmiDate: ${firstDueRaw}`);
//   }

//   // 4️⃣ Generate RPS using PMT/IPMT logic
//   let openingPrincipal = loanAmount;
//   let dueDate = new Date(firstDueDate);
//   const rpsData = [];

//   for (let i = 1; i <= tenure; i++) {
//     const interest = Math.round(openingPrincipal * monthlyRate);
//     let principal = emi - interest;

//     // ✅ Final month adjustment to close the loan cleanly
//     if (i === tenure) {
//       principal = openingPrincipal;
//     }

//     const closingPrincipal = Math.max(0, openingPrincipal - principal);
//     const actualEmi = Math.round(principal + interest);

//     // ✅ Remaining fields same as this installment’s EMI, interest & principal
//     const remainingPrincipal = principal;
//     const remainingInterest = interest;
//     const remainingEmi = actualEmi;

//     // Push full RPS data row
//     rpsData.push([
//       lan,
//       dueDate.toISOString().split("T")[0], // due_date
//       actualEmi,                           // emi
//       interest,                            // interest
//       principal,                           // principal
//       remainingPrincipal,                  // remaining_principal = principal
//       remainingInterest,                   // remaining_interest = interest
//       remainingEmi,                        // remaining_emi = emi
//       openingPrincipal,                    // opening
//       closingPrincipal,                    // closing
//       "Pending",                           // status
//     ]);

//     // Prepare next iteration
//     openingPrincipal = closingPrincipal;
//     dueDate.setMonth(dueDate.getMonth() + 1);
//   }

//   // 5️⃣ Insert into manual_rps_zypay (include all required fields)
//   await conn.query(
//     `INSERT INTO manual_rps_zypay
//      (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, opening, closing, status)
//      VALUES ?`,
//     [rpsData]
//   );

//   // 6️⃣ Update EMI in loan_booking_zypay_customer
//   await conn.query(
//     `UPDATE loan_booking_zypay_customer
//      SET emi_amount = ?
//      WHERE lan = ?`,
//     [emi, lan]
//   );

//   console.log(`✅ ZYPAY RPS generated  for ${lan}`);
// };

const generateRepaymentScheduleZypay = async (
  conn,
  lan,
  loanAmount,
  interestRate, // Annual % e.g. 36
  tenure, // months
  disbursementDate,
  product,
  lender,
) => {
  const annualRate = interestRate / 100;

  // EMI (PMT formula, rounded)
  const monthlyRate = annualRate / 12;
  const emi = Math.round(
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
      (Math.pow(1 + monthlyRate, tenure) - 1),
  );

  // First EMI date
  const firstDueRaw = getFirstEmiDate(disbursementDate, null, lender, product);
  const firstDueDate = new Date(firstDueRaw);
  if (Number.isNaN(firstDueDate.getTime())) {
    throw new Error(`Invalid first due date: ${firstDueRaw}`);
  }

  const disbDate = new Date(disbursementDate);

  const diffDays = (from, to) =>
    Math.max(0, Math.ceil((to - from) / (1000 * 60 * 60 * 24)));

  let openingPrincipal = loanAmount;
  let dueDate = new Date(firstDueDate);
  let periodStart = new Date(disbDate);

  const rpsData = [];

  for (let i = 1; i <= tenure; i++) {
    // ✅ Interest on ACTUAL DAYS / 365
    const days = diffDays(periodStart, dueDate);

    const interest = Math.round(openingPrincipal * annualRate * (days / 365));

    let principal = Math.round(emi - interest);

    // ✅ Last EMI adjustment
    if (i === tenure) {
      principal = Math.round(openingPrincipal);
    }

    const closingPrincipal = Math.max(
      0,
      Math.round(openingPrincipal - principal),
    );

    const actualEmi = Math.round(principal + interest);

    rpsData.push([
      lan,
      dueDate.toISOString().split("T")[0],
      actualEmi,
      interest,
      principal,
      principal,
      interest,
      actualEmi,
      openingPrincipal,
      closingPrincipal,
      "Pending",
    ]);

    // Move to next period
    openingPrincipal = closingPrincipal;
    periodStart = new Date(dueDate);
    dueDate.setMonth(dueDate.getMonth() + 1);
  }

  await conn.query(
    `INSERT INTO manual_rps_zypay
     (lan, due_date, emi, interest, principal,
      remaining_principal, remaining_interest, remaining_emi,
      opening, closing, status)
     VALUES ?`,
    [rpsData],
  );

  await conn.query(
    `UPDATE loan_booking_zypay_customer
     SET emi_amount = ?
     WHERE lan = ?`,
    [emi, lan],
  );

  console.log(`✅ ZYPAY RPS generated (365 basis) for ${lan}`);
};

///////////////////////////////////////////////////////////////////


////////// LOAN DIGIT//////////////////////

// const generateRepaymentScheduleLoanDigit = async (
//   conn,
//   lan,
//   loanAmount,
//   interestRate,
//   tenure,
//   disbursementDate,
//   product,
//   lender
// ) => {
//   try {

//     // ===============================
//     // STEP 0: SANITIZE & VALIDATE INPUTS
//     // ===============================

//     const principal = Number(loanAmount);
//     const rate = Number(interestRate);
//     const months = Number(tenure);

//     if (!principal || principal <= 0)
//       throw new Error(`Invalid loan amount for LAN ${lan}`);

//     if (!rate || rate <= 0)
//       throw new Error(`Invalid interest rate for LAN ${lan}`);

//     if (!months || months <= 0)
//       throw new Error(`Invalid tenure for LAN ${lan}`);

//     // ===============================
//     // STEP 1: TOTAL FLAT INTEREST
//     // ===============================

//     const totalInterest =
//       principal * (rate / 100) * (months / 12);

//     // ===============================
//     // STEP 2: EMI CALCULATION (FLAT EMI)
//     // ===============================

//     const emi = Math.round(
//       (principal + totalInterest) / months
//     );

//     console.log(`✅ EMI calculated (${lan}): ${emi}`);

//     // ===============================
//     // STEP 3: FIND MONTHLY REDUCING RATE
//     // (Matches Loan Digit amortization)
//     // ===============================

//     const getReducingMonthlyRate = () => {

//       let low = 0;
//       let high = 0.2;
//       let mid = 0;

//       for (let i = 0; i < 200; i++) {

//         mid = (low + high) / 2;

//         let balance = principal;
//         let totalInterestCheck = 0;

//         for (let j = 1; j <= months; j++) {

//           let interest = Math.round(balance * mid);
//           let principalComponent = emi - interest;

//           balance -= principalComponent;
//           totalInterestCheck += interest;
//         }

//         if (totalInterestCheck > totalInterest)
//           high = mid;
//         else
//           low = mid;
//       }

//       return mid;
//     };

//     const monthlyRate = getReducingMonthlyRate();

//     console.log(
//       `✅ Monthly reducing rate (${lan}): ${(monthlyRate * 100).toFixed(4)}%`
//     );

//     // ===============================
//     // STEP 4: FIRST EMI DATE
//     // ===============================

//     const firstDueRaw = getFirstEmiDate(
//       disbursementDate,
//       null,
//       lender,
//       product
//     );

//     const firstDueDate = new Date(firstDueRaw);

//     if (Number.isNaN(firstDueDate.getTime())) {
//       throw new Error(
//         `Invalid first EMI date returned: ${firstDueRaw}`
//       );
//     }

//     // ===============================
//     // STEP 5: GENERATE RPS
//     // ===============================

//     let openingPrincipal = principal;
//     let remainingPrincipal = principal;
//     let remainingInterest = totalInterest;

//     let dueDate = new Date(firstDueDate);

//     const rpsData = [];

//     for (let i = 1; i <= months; i++) {

//       let interest = Math.round(
//         openingPrincipal * monthlyRate
//       );

//       let principalComponent = emi - interest;

//       // Last EMI adjustment
//       if (i === months) {
//         interest = Math.round(remainingInterest);
//         principalComponent = Math.round(remainingPrincipal);
//       }

//       const closingPrincipal =
//         openingPrincipal - principalComponent;

//       remainingPrincipal -= principalComponent;
//       remainingInterest -= interest;

//       rpsData.push([
//         lan,
//         dueDate.toISOString().split("T")[0],
//         "Pending",
//         emi,
//         interest,
//         principalComponent,
//         openingPrincipal,
//         Math.max(0, Math.round(closingPrincipal)),
//         emi,
//         interest,
//         principalComponent,
//       ]);

//       openingPrincipal = closingPrincipal;

//       dueDate.setMonth(dueDate.getMonth() + 1);
//     }

//     // ===============================
//     // STEP 6: INSERT INTO DATABASE
//     // ===============================

//     await conn.query(
//       `INSERT INTO manual_rps_loan_digit
//        (lan, due_date, status, emi, interest, principal,
//         opening, closing, remaining_emi,
//         remaining_interest, remaining_principal)
//        VALUES ?`,
//       [rpsData]
//     );

//     console.log(
//       `✅ Loan Digit RPS generated successfully for ${lan}`
//     );

//   } catch (err) {

//     console.error(
//       `❌ Loan Digit RPS generation failed (${lan}):`,
//       err
//     );

//     throw err;
//   }
// };

const generateRepaymentScheduleLoanDigit = async (
  conn,
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
  product,
  lender
) => {
  try {

    // ===============================
    // STEP 0: VALIDATION
    // ===============================

    const principal = Number(loanAmount);
    const rate = Number(interestRate);
    const months = Number(tenure);

    if (!principal || principal <= 0)
      throw new Error(`Invalid loan amount for LAN ${lan}`);

    if (!rate || rate <= 0)
      throw new Error(`Invalid interest rate for LAN ${lan}`);

    if (!months || months <= 0)
      throw new Error(`Invalid tenure for LAN ${lan}`);

    // ===============================
    // STEP 1: CALCULATE FLAT INTEREST
    // (Loan Digit adjustment logic)
    // ===============================

    const flatInterest =
      principal * (rate / 100) * (months / 12);

    // Adjustment factor used by lender engine
    const adjustedInterest = flatInterest * 0.6775;

    const totalRepayment =
      principal + adjustedInterest;

    const emi = Math.round(
      totalRepayment / months
    );

    console.log(`✅ EMI calculated (${lan}): ${emi}`);

    // ===============================
    // STEP 2: FIND REDUCING MONTHLY RATE
    // ===============================

    const getReducingMonthlyRate = () => {

      let low = 0;
      let high = 0.2;
      let mid = 0;

      for (let i = 0; i < 200; i++) {

        mid = (low + high) / 2;

        let balance = principal;
        let totalInterestCheck = 0;

        for (let j = 1; j <= months; j++) {

          let interest = Math.round(balance * mid);

          let principalComponent =
            emi - interest;

          balance -= principalComponent;

          totalInterestCheck += interest;
        }

        if (totalInterestCheck > adjustedInterest)
          high = mid;
        else
          low = mid;
      }

      return mid;
    };

    const monthlyRate =
      getReducingMonthlyRate();

    console.log(
      `✅ Derived reducing monthly rate (${lan}): ${
        (monthlyRate * 100).toFixed(4)
      }%`
    );

    // ===============================
    // STEP 3: FIRST EMI DATE
    // ===============================

    const firstDueRaw = getFirstEmiDate(
      disbursementDate,
      null,
      lender,
      product
    );

    const firstDueDate =
      new Date(firstDueRaw);

    if (Number.isNaN(firstDueDate.getTime())) {
      throw new Error(
        `Invalid first EMI date returned: ${firstDueRaw}`
      );
    }

    // ===============================
    // STEP 4: GENERATE RPS
    // ===============================

    let openingPrincipal = principal;
    let remainingPrincipal = principal;
    let remainingInterest = adjustedInterest;

    let dueDate =
      new Date(firstDueDate);

    const rpsData = [];

    for (let i = 1; i <= months; i++) {

      let interest = Math.round(
        openingPrincipal * monthlyRate
      );

      let principalComponent =
        emi - interest;

      if (i === months) {
        interest = Math.round(
          remainingInterest
        );
        principalComponent = Math.round(
          remainingPrincipal
        );
      }

      const closingPrincipal =
        openingPrincipal - principalComponent;

      remainingPrincipal -= principalComponent;
      remainingInterest -= interest;

      rpsData.push([
        lan,
        dueDate.toISOString().split("T")[0],
        "Pending",
        emi,
        interest,
        principalComponent,
        openingPrincipal,
        Math.max(
          0,
          Math.round(closingPrincipal)
        ),
        emi,
        interest,
        principalComponent,
      ]);

      openingPrincipal = closingPrincipal;

      dueDate.setMonth(
        dueDate.getMonth() + 1
      );
    }

    // ===============================
    // STEP 5: INSERT INTO DATABASE
    // ===============================

    await conn.query(
      `INSERT INTO manual_rps_loan_digit
       (lan, due_date, status, emi, interest, principal,
        opening, closing, remaining_emi,
        remaining_interest, remaining_principal)
       VALUES ?`,
      [rpsData]
    );

    console.log(
      `✅ Loan Digit RPS generated successfully for ${lan}`
    );

  } catch (err) {

    console.error(
      `❌ Loan Digit RPS generation failed (${lan}):`,
      err
    );

    throw err;
  }
};

////////// LOAN DIGIT END //////////////////////
/////////////////// EMI CLUB RPS ///////////////////////
const generateRepaymentScheduleEmiclub = async (
  conn, // Transaction connection
  lan,
  loanAmount,
  interestRate, // Annual % e.g. 45
  tenure, // in months
  disbursementDate,
  product,
  lender,
) => {
  // 1️⃣ Convert annual → monthly rate
  const monthlyRate = interestRate / 100 / 12;

  // 2️⃣ Compute EMI using PMT formula
  const emi = Math.round(
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
      (Math.pow(1 + monthlyRate, tenure) - 1),
  );

  console.log(`✅ EMI (calculated for ${lan}):`, emi);

  // 3️⃣ Get first due date
  const firstDueRaw = getFirstEmiDate(disbursementDate, null, lender, product);
  const firstDueDate = new Date(firstDueRaw);
  if (Number.isNaN(firstDueDate.getTime())) {
    throw new Error(
      `Invalid first due date from getFirstEmiDate: ${firstDueRaw}`,
    );
  }

  // 4️⃣ Generate RPS using PMT/IPMT logic
  let openingPrincipal = loanAmount;
  let dueDate = new Date(firstDueDate);
  const rpsData = [];

  for (let i = 1; i <= tenure; i++) {
    const interest = Math.round(openingPrincipal * monthlyRate);
    let principal = emi - interest;

    // ✅ Final month adjustment to close the loan cleanly
    if (i === tenure) {
      principal = openingPrincipal;
    }

    const closingPrincipal = Math.max(0, openingPrincipal - principal);
    const actualEmi = Math.round(principal + interest);

    // ✅ Remaining fields same as this installment’s EMI, interest & principal
    const remainingPrincipal = principal;
    const remainingInterest = interest;
    const remainingEmi = actualEmi;

    // Push full RPS data row
    rpsData.push([
      lan,
      dueDate.toISOString().split("T")[0], // due_date
      actualEmi, // emi
      interest, // interest
      principal, // principal
      remainingPrincipal, // remaining_principal = principal
      remainingInterest, // remaining_interest = interest
      remainingEmi, // remaining_emi = emi
      openingPrincipal, // opening
      closingPrincipal, // closing
      "Pending", // status
    ]);

    // Prepare next iteration
    openingPrincipal = closingPrincipal;
    dueDate.setMonth(dueDate.getMonth() + 1);
  }

  // 5️⃣ Insert into manual_rps_emiclub (include all required fields)
  await conn.query(
    `INSERT INTO manual_rps_emiclub
     (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, opening, closing, status)
     VALUES ?`,
    [rpsData],
  );

  // 6️⃣ Update EMI in loan_booking_emiclub
  await conn.query(
    `UPDATE loan_booking_emiclub
     SET emi_amount = ?
     WHERE lan = ?`,
    [emi, lan],
  );

  console.log(`✅ EMICLUB RPS generated  for ${lan}`);
};
////////// EMI CLUB end ////////

/////////////// CAREPAY START ///////////////////////

const round2 = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

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

const generateRepaymentScheduleCarepay = async (
  conn,
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
  product,
  lender,
   processingFee = 0, // ✅ pass processing fee
) => {
  if (!conn) {
    throw new Error(
      "Database transaction connection is required",
    );
  }

  const normalizedLan = String(lan || "")
    .trim()
    .toUpperCase();

  const normalizedProduct =
    normalizeCarepayProduct(product);

  if (!normalizedLan) {
    throw new Error("CarePay LAN is required");
  }

  if (!normalizedLan.startsWith("CARE")) {
    throw new Error(
      `Invalid CarePay LAN: ${normalizedLan}`,
    );
  }

  if (!isCarepayLoanType(normalizedProduct)) {
    throw new Error(
      `Invalid CarePay product: ${product}. Allowed products: No-Cost EMI, Low-Cost EMI, Standard EMI, Short-Term Personal Loan`,
    );
  }

  const numericLoanAmount = Number(loanAmount);
  const numericInterestRate = Number(
    interestRate || 0,
  );
  const numericTenure = Number(tenure);
  const numericProcessingFee = round2(
    Number(processingFee || 0),
  );
  if (
  !Number.isFinite(numericProcessingFee) ||
  numericProcessingFee < 0
) {
  throw new Error(
    `Invalid CarePay processing fee: ${processingFee}`,
  );
}

  if (
    !Number.isFinite(numericLoanAmount) ||
    numericLoanAmount <= 0
  ) {
    throw new Error(
      `Invalid CarePay loan amount: ${loanAmount}`,
    );
  }

  if (
    !Number.isFinite(numericInterestRate) ||
    numericInterestRate < 0
  ) {
    throw new Error(
      `Invalid CarePay interest rate: ${interestRate}`,
    );
  }

  if (
    !Number.isFinite(numericProcessingFee) ||
    numericProcessingFee < 0
  ) {
    throw new Error(
      `Invalid CarePay processing fee: ${processingFee}`,
    );
  }

  const isNoCostEmi =
    normalizedProduct === "no-cost emi";

  const isLowCostEmi =
    normalizedProduct === "low-cost emi";

  const isStandardEmi =
    normalizedProduct === "standard emi";

  const isShortTermPersonalLoan =
    normalizedProduct ===
    "short-term personal loan";

  let repaymentTenure;

  /*
   * Short-Term Personal Loan always has
   * exactly one repayment installment.
   */
  if (isShortTermPersonalLoan) {
    repaymentTenure = 1;
  } else {
    if (
      !Number.isInteger(numericTenure) ||
      numericTenure <= 0
    ) {
      throw new Error(
        `Invalid CarePay tenure: ${tenure}`,
      );
    }

    repaymentTenure = numericTenure;
  }

  /*
   * No-Cost EMI always has zero
   * customer interest.
   */
  const effectiveAnnualInterestRate =
    isNoCostEmi ? 0 : numericInterestRate;

  const monthlyRate =
    effectiveAnnualInterestRate / 100 / 12;

  let regularEmi;

  /*
   * Short-Term Personal Loan:
   *
   * Regular repayment amount excludes
   * the processing fee.
   *
   * Processing fee is added later only
   * to the first installment.
   */
  if (isShortTermPersonalLoan) {
    const oneMonthInterest = round2(
      numericLoanAmount * monthlyRate,
    );

    regularEmi = round2(
      numericLoanAmount + oneMonthInterest,
    );
  }

  /*
   * No-Cost EMI:
   *
   * Equal principal installments.
   * Last installment clears any rounding
   * difference.
   */
  else if (isNoCostEmi || monthlyRate === 0) {
    regularEmi = Math.round(
      numericLoanAmount / repaymentTenure,
    );
  }

  /*
   * Standard EMI and Low-Cost EMI:
   *
   * Reducing-balance PMT calculation.
   */
  else if (isStandardEmi || isLowCostEmi) {
    const rateFactor = Math.pow(
      1 + monthlyRate,
      repaymentTenure,
    );

    regularEmi = Math.round(
      (numericLoanAmount *
        monthlyRate *
        rateFactor) /
        (rateFactor - 1),
    );
  }

  if (
    !Number.isFinite(regularEmi) ||
    regularEmi <= 0
  ) {
    throw new Error(
      `Unable to calculate CarePay EMI for LAN ${normalizedLan}`,
    );
  }

  /*
   * Prevent duplicate RPS creation.
   *
   * A UNIQUE index on manual_rps_carepay.lan
   * is also recommended to prevent concurrent
   * duplicate insertions.
   */
  const [existingRps] = await conn.query(
    `SELECT 1
     FROM manual_rps_carepay
     WHERE lan = ?
     LIMIT 1`,
    [normalizedLan],
  );

  if (existingRps.length > 0) {
    throw new Error(
      `CarePay RPS already exists for LAN ${normalizedLan}`,
    );
  }

  let openingPrincipal = round2(
    numericLoanAmount,
  );

  const rpsData = [];

  for (
    let installmentNumber = 1;
    installmentNumber <= repaymentTenure;
    installmentNumber++
  ) {
   const dueDate = getFirstEmiDate(
  disbursementDate,
  null,
  lender || "CAREPAY",
  normalizedProduct,
  installmentNumber - 1,
);

    /*
     * Processing fee is collected only
     * in installment number 1.
     */
    const installmentProcessingFee =
      installmentNumber === 1
        ? numericProcessingFee
        : 0;

    /*
     * normalInterest excludes processing fee.
     *
     * This is important because principal must be:
     *
     * regular EMI - normal interest
     *
     * and not:
     *
     * regular EMI - normal interest - processing fee
     */
    let normalInterest = 0;
    let principal = 0;

    /*
     * Short-Term Personal Loan:
     *
     * One installment containing:
     * - Full principal
     * - One month's normal interest
     * - Processing fee
     */
    if (isShortTermPersonalLoan) {
      normalInterest = round2(
        openingPrincipal * monthlyRate,
      );

      principal = openingPrincipal;
    }

    /*
     * No-Cost EMI:
     *
     * No normal borrower interest.
     * Processing fee is charged only in EMI 1.
     */
    else if (
      isNoCostEmi ||
      monthlyRate === 0
    ) {
      normalInterest = 0;

      principal =
        installmentNumber === repaymentTenure
          ? openingPrincipal
          : Math.min(
              regularEmi,
              openingPrincipal,
            );
    }

    /*
     * Standard EMI and Low-Cost EMI:
     *
     * Calculate normal interest first.
     * Calculate principal without considering
     * the processing fee.
     */
    else {
      normalInterest = Math.round(
        openingPrincipal * monthlyRate,
      );

      principal =
        regularEmi - normalInterest;

      if (principal <= 0) {
        throw new Error(
          `Invalid principal calculated for LAN ${normalizedLan}, installment ${installmentNumber}`,
        );
      }

      /*
       * Last installment must clear the
       * remaining principal balance.
       */
      if (
        installmentNumber === repaymentTenure ||
        principal > openingPrincipal
      ) {
        principal = openingPrincipal;
      }
    }

    principal = round2(principal);
    normalInterest = round2(normalInterest);

    /*
     * The current table does not have a
     * separate processing_fee column.
     *
     * Therefore, for installment 1:
     *
     * interest =
     * normal interest + processing fee
     */
    const interest = round2(
      normalInterest +
        installmentProcessingFee,
    );

    const closingPrincipal = Math.max(
      0,
      round2(
        openingPrincipal - principal,
      ),
    );

    /*
     * First installment:
     *
     * principal
     * + normal interest
     * + processing fee
     *
     * Other installments:
     *
     * principal
     * + normal interest
     */
    const actualEmi = round2(
      principal + interest,
    );

    const remainingPrincipal = principal;
    const remainingInterest = interest;
    const remainingEmi = actualEmi;

    rpsData.push([
      normalizedLan,
      formatDateYMD(dueDate),
      actualEmi,
      interest,
      principal,
      remainingPrincipal,
      remainingInterest,
      remainingEmi,
      openingPrincipal,
      closingPrincipal,
      "Pending",
    ]);

    openingPrincipal = closingPrincipal;
  }

  /*
   * Ensure the schedule completely closes
   * the principal balance.
   */
  if (Math.abs(openingPrincipal) > 0.01) {
    throw new Error(
      `CarePay RPS did not close correctly. Remaining principal: ${openingPrincipal}`,
    );
  }

  await conn.query(
    `INSERT INTO manual_rps_carepay
     (
       lan,
       due_date,
       emi,
       interest,
       principal,
       remaining_principal,
       remaining_interest,
       remaining_emi,
       opening,
       closing,
       status
     )
     VALUES ?`,
    [rpsData],
  );

  /*
   * Store only the regular EMI.
   *
   * Do not include the processing fee because
   * it is a one-time first-installment charge.
   */
  await conn.query(
    `UPDATE loan_booking_carepay
     SET emi_amount = ?
     WHERE lan = ?`,
    [regularEmi, normalizedLan],
  );

  const firstInstallmentAmount =
    rpsData[0]?.[2] || 0;

  const totalExpectedRepayment = round2(
    rpsData.reduce(
      (total, installment) =>
        total + Number(installment[2] || 0),
      0,
    ),
  );

  console.log("✅ CAREPAY RPS generated", {
    lan: normalizedLan,
    product: normalizedProduct,
    loanAmount: numericLoanAmount,
    interestRate:
      effectiveAnnualInterestRate,
    processingFee:
      numericProcessingFee,
    tenure: repaymentTenure,
    regularEmi,
    firstInstallmentAmount,
    totalExpectedRepayment,
    installmentCount: rpsData.length,
  });

  return {
    lan: normalizedLan,
    product: normalizedProduct,
    loan_amount: numericLoanAmount,
    interest_rate:
      effectiveAnnualInterestRate,
    processing_fee:
      numericProcessingFee,
    tenure: repaymentTenure,
    emi_amount: regularEmi,
    first_installment_amount:
      firstInstallmentAmount,
    total_expected_repayment:
      totalExpectedRepayment,
    installment_count: rpsData.length,
  };
};


/////////// STERLION RPS ///////////////////////

const generateRepaymentScheduleSterlion = async (
  conn,
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
  product,
  lender,
) => {
  if (!conn) {
    throw new Error("Database transaction connection is required");
  }

  const normalizedLan = String(lan || "").trim().toUpperCase();
  const numericLoanAmount = Number(loanAmount);
  const numericInterestRate = Number(interestRate || 0);
  const numericTenure = Number(tenure);

  if (!normalizedLan.startsWith("STRL")) {
    throw new Error(`Invalid Sterlion LAN: ${normalizedLan}`);
  }

  if (!Number.isFinite(numericLoanAmount) || numericLoanAmount <= 0) {
    throw new Error(`Invalid Sterlion loan amount: ${loanAmount}`);
  }

  if (!Number.isInteger(numericTenure) || numericTenure <= 0) {
    throw new Error(`Invalid Sterlion tenure: ${tenure}`);
  }

  if (!Number.isFinite(numericInterestRate) || numericInterestRate < 0) {
    throw new Error(`Invalid Sterlion interest rate: ${interestRate}`);
  }

  const [existingRps] = await conn.query(
    `SELECT 1
     FROM manual_rps_sterlion
     WHERE lan = ?
     LIMIT 1`,
    [normalizedLan],
  );

  if (existingRps.length > 0) {
    throw new Error(`Sterlion RPS already exists for LAN ${normalizedLan}`);
  }

  const monthlyRate = numericInterestRate / 100 / 12;
  const rateFactor = Math.pow(1 + monthlyRate, numericTenure);
  const regularEmi = monthlyRate
    ? Math.round((numericLoanAmount * monthlyRate * rateFactor) / (rateFactor - 1))
    : Math.round(numericLoanAmount / numericTenure);

  if (!Number.isFinite(regularEmi) || regularEmi <= 0) {
    throw new Error(`Unable to calculate Sterlion EMI for LAN ${normalizedLan}`);
  }

  let openingPrincipal = numericLoanAmount;
  const rpsData = [];

  for (
    let installmentNumber = 1;
    installmentNumber <= numericTenure;
    installmentNumber++
  ) {
    const dueDate = getFirstEmiDate(
      disbursementDate,
      null,
      lender || "STERLION",
      product || "Unsecured Business Loan",
      installmentNumber - 1,
    );

    let interest = monthlyRate
      ? Math.round(openingPrincipal * monthlyRate)
      : 0;
    let principal = monthlyRate
      ? regularEmi - interest
      : Math.min(regularEmi, openingPrincipal);

    if (
      installmentNumber === numericTenure ||
      principal > openingPrincipal
    ) {
      principal = openingPrincipal;
      interest = monthlyRate ? round2(regularEmi - principal) : 0;
    }

    principal = round2(principal);
    interest = round2(interest);

    const closingPrincipal = Math.max(
      0,
      round2(openingPrincipal - principal),
    );
    const actualEmi = round2(principal + interest);

    rpsData.push([
      normalizedLan,
      formatDateYMD(dueDate),
      actualEmi,
      interest,
      principal,
      principal,
      interest,
      actualEmi,
      actualEmi,
      openingPrincipal,
      closingPrincipal,
      "Pending",
    ]);

    openingPrincipal = closingPrincipal;
  }

  if (Math.abs(openingPrincipal) > 0.01) {
    throw new Error(
      `Sterlion RPS did not close correctly. Remaining principal: ${openingPrincipal}`,
    );
  }

  await conn.query(
    `INSERT INTO manual_rps_sterlion
     (
       lan,
       due_date,
       emi,
       interest,
       principal,
       remaining_principal,
       remaining_interest,
       remaining_emi,
       remaining_amount,
       opening,
       closing,
       status
     )
     VALUES ?`,
    [rpsData],
  );

  await conn.query(
    `UPDATE loan_booking_sterlion
     SET emi_amount = ?
     WHERE lan = ?`,
    [regularEmi, normalizedLan],
  );

  console.log("Sterlion RPS generated", {
    lan: normalizedLan,
    product,
    loanAmount: numericLoanAmount,
    interestRate: numericInterestRate,
    tenure: numericTenure,
    regularEmi,
    installmentCount: rpsData.length,
  });

  return {
    lan: normalizedLan,
    product,
    loan_amount: numericLoanAmount,
    interest_rate: numericInterestRate,
    tenure: numericTenure,
    emi_amount: regularEmi,
    installment_count: rpsData.length,
  };
};


////////////////////////////// RPS FOR CIRCLE PE START ///////////////////////////////////

const generateRepaymentScheduleCirclePE = async (
  conn, // Transaction connection
  lan,
  loanAmount,
  interestRate, // Annual % e.g. 20.5
  tenure, // in months (for Monthly Loan)
  disbursementDate, // e.g. "2025-10-14"
  product,
  lender,
) => {
  // 🧠 Determine repayment type
  const isBullet = product?.toLowerCase() === "bullet loan";
  const isEMI = product?.toLowerCase() === "monthly loan";

  if (!isBullet && !isEMI) {
    throw new Error(`❌ Unknown product type: ${product}`);
  }

  console.log(
    `🔍 Generating ${isBullet ? "Bullet" : "EMI"} repayment schedule for ${lan}`,
  );

  // 🧮 Convert annual → monthly rate
  const monthlyRate = interestRate / 100 / 12;

  // 🧾 Compute EMI (only for Monthly Loan)
  const emi = isEMI
    ? Math.round(
        (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
          (Math.pow(1 + monthlyRate, tenure) - 1),
      )
    : 0;

  // ===================================================
  // 📅 CIRCLEPE due date logic (applies to both EMI & Bullet)
  // ===================================================
  let firstDueDate;
  const disb = new Date(disbursementDate);
  const day = disb.getDate();

  if (lender === "Circlepe") {
    const due = new Date(disb);
    if (day >= 1 && day <= 25) {
      // Disbursed 1–25 → next month 5th
      due.setMonth(due.getMonth() + 1);
      due.setDate(5);
    } else {
      // Disbursed 26–end → month after next 5th
      due.setMonth(due.getMonth() + 2);
      due.setDate(5);
    }
    firstDueDate = due;
  } else {
    // Fallback if other lender
    const due = new Date(disbursementDate);
    due.setMonth(due.getMonth() + 1);
    firstDueDate = due;
  }

  console.log(
    `[Circlepe] Disbursed: ${disbursementDate} | First Due: ${firstDueDate.toISOString().split("T")[0]}`,
  );

  // ===================================================
  // 🧮 Build RPS Data
  // ===================================================
  let openingPrincipal = loanAmount;
  let dueDate = new Date(firstDueDate);
  const rpsData = [];

  // ============ MONTHLY LOAN (EMI) ============
  if (isEMI) {
    for (let i = 1; i <= tenure; i++) {
      const interest = Math.round(openingPrincipal * monthlyRate);
      let principal = emi - interest;

      if (i === tenure) principal = openingPrincipal;

      const closingPrincipal = Math.max(0, openingPrincipal - principal);
      const actualEmi = Math.round(principal + interest);

      rpsData.push([
        lan,
        dueDate.toISOString().split("T")[0],
        actualEmi, // emi
        interest, // interest
        principal, // principal
        principal, // remaining_principal
        interest, // remaining_interest
        actualEmi, // remaining_emi
        openingPrincipal, // opening
        closingPrincipal, // closing
        "Pending", // status
      ]);

      openingPrincipal = closingPrincipal;
      dueDate.setMonth(dueDate.getMonth() + 1);
    }
  }

  // ============ BULLET LOAN (Single Payment) ============
  if (isBullet) {
    const bulletTenure = 12; // Always 12 months
    const totalInterest = Math.round(
      loanAmount * (interestRate / 100) * (bulletTenure / 12),
    );
    const totalPayable = loanAmount + totalInterest;

    // Final due date = firstDueDate + 11 months (1st due based on rule)
    const finalDue = new Date(firstDueDate);
    finalDue.setMonth(finalDue.getMonth() + bulletTenure - 1);

    rpsData.push([
      lan,
      finalDue.toISOString().split("T")[0],
      Number(totalInterest) + Number(loanAmount),
      // emi (single payment)
      totalInterest, // interest
      loanAmount, // principal
      loanAmount, // remaining_principal
      totalInterest, // remaining_interest
      Number(totalInterest) + Number(loanAmount), // remaining_emi
      openingPrincipal, // opening
      0, // closing
      "Pending", // status
    ]);
  }

  // ===================================================
  // 🗄️ Insert RPS into manual_rps_circlepe
  // ===================================================
  await conn.query(
    `INSERT INTO manual_rps_circlepe
     (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, opening, closing, status)
     VALUES ?`,
    [rpsData],
  );

  // ===================================================
  // 💾 Update EMI in loan_booking_circle_pe
  // ===================================================
  const updateEmiValue = isBullet ? 0 : emi;
  await conn.query(
    `UPDATE loan_booking_circle_pe
     SET emi_amount = ?
     WHERE lan = ?`,
    [updateEmiValue, lan],
  );

  console.log(
    `✅ Circlepe RPS generated for ${lan} (${isBullet ? "Bullet (one-time)" : "Monthly Loan"})`,
  );
};

///////////////// RPS for CIRCLE PE HOUSER START //////////////////////
const generateRepaymentScheduleCirclePeHouser = async (
  conn, // Transaction connection
  lan,
  loanAmount,
  interestRate, // Annual % e.g. 20.5
  tenure, // in months (for Monthly Loan)
  disbursementDate, // e.g. "2025-10-14"
  product,
  lender,
) => {
  // 🧠 Determine repayment type
  const isBullet = product?.toLowerCase() === "bullet loan";
  const isEMI = product?.toLowerCase() === "monthly loan";

  if (!isBullet && !isEMI) {
    throw new Error(`❌ Unknown product type: ${product}`);
  }

  console.log(
    `🔍 Generating ${isBullet ? "Bullet" : "EMI"} repayment schedule for ${lan}`,
  );

  // 🧮 Convert annual → monthly rate
  const monthlyRate = interestRate / 100 / 12;

  // 🧾 Compute EMI (only for Monthly Loan)
  const emi = isEMI
    ? Math.round(
        (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
          (Math.pow(1 + monthlyRate, tenure) - 1),
      )
    : 0;

  // ===================================================
  // 📅 CIRCLEPE due date logic (applies to both EMI & Bullet)
  // ===================================================
  let firstDueDate;
  const disb = new Date(disbursementDate);
  const day = disb.getDate();

  
    const due = new Date(disb);
    if (day >= 1 && day <= 25) {
      // Disbursed 1–25 → next month 5th
      due.setMonth(due.getMonth() + 1);
      due.setDate(5);
    } else {
      // Disbursed 26–end → month after next 5th
      due.setMonth(due.getMonth() + 2);
      due.setDate(5);
    }
    firstDueDate = due;
  

  console.log(
    `[Circlepe Houser] Disbursed: ${disbursementDate} | First Due: ${firstDueDate.toISOString().split("T")[0]}`,
  );

  // ===================================================
  // 🧮 Build RPS Data
  // ===================================================
  let openingPrincipal = loanAmount;
  let dueDate = new Date(firstDueDate);
  const rpsData = [];

  // ============ MONTHLY LOAN (EMI) ============
  if (isEMI) {
    for (let i = 1; i <= tenure; i++) {
      const interest = Math.round(openingPrincipal * monthlyRate);
      let principal = emi - interest;

      if (i === tenure) principal = openingPrincipal;

      const closingPrincipal = Math.max(0, openingPrincipal - principal);
      const actualEmi = Math.round(principal + interest);

      rpsData.push([
        lan,
        dueDate.toISOString().split("T")[0],
        actualEmi, // emi
        interest, // interest
        principal, // principal
        principal, // remaining_principal
        interest, // remaining_interest
        actualEmi, // remaining_emi
        openingPrincipal, // opening
        closingPrincipal, // closing
        "Pending", // status
      ]);

      openingPrincipal = closingPrincipal;
      dueDate.setMonth(dueDate.getMonth() + 1);
    }
  }

  // ============ BULLET LOAN (Single Payment) ============
  if (isBullet) {
    const bulletTenure = 12; // Always 12 months
    const totalInterest = Math.round(
      loanAmount * (interestRate / 100) * (bulletTenure / 12),
    );
    const totalPayable = loanAmount + totalInterest;

    // Final due date = firstDueDate + 11 months (1st due based on rule)
    const finalDue = new Date(firstDueDate);
    finalDue.setMonth(finalDue.getMonth() + bulletTenure - 1);

    rpsData.push([
      lan,
      finalDue.toISOString().split("T")[0],
      Number(totalInterest) + Number(loanAmount),
      // emi (single payment)
      totalInterest, // interest
      loanAmount, // principal
      loanAmount, // remaining_principal
      totalInterest, // remaining_interest
      Number(totalInterest) + Number(loanAmount), // remaining_emi
      openingPrincipal, // opening
      0, // closing
      "Pending", // status
    ]);
  }

  // ===================================================
  // 🗄️ Insert RPS into manual_rps_circlepe
  // ===================================================
  await conn.query(
    `INSERT INTO manual_rps_circle_pe_houser
     (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, opening, closing, status)
     VALUES ?`,
    [rpsData],
  );

  // ===================================================
  // 💾 Update EMI in loan_booking_circle_pe_houser
  // ===================================================
  const updateEmiValue = isBullet ? 0 : emi;
  await conn.query(
    `UPDATE loan_booking_circle_pe_houser
     SET emi_amount = ?
     WHERE lan = ?`,
    [updateEmiValue, lan],
  );

  console.log(
    `✅ Circlepe houser RPS generated for ${lan} (${isBullet ? "Bullet (one-time)" : "Monthly Loan"})`,
  );
};

//////////////////////////////////// RPS END OF CIRCLE PE /////////////////////////////////////

///////////////// BL RPS CODE OLD ////////////////////////////////
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
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
  product,
  lender,
) => {
  try {
    const annualRate = interestRate / 100;
    const monthlyRate = annualRate / 12;
    const dailyRate = annualRate / 360;

    let rpsData = [];
    const firstDueDate = getFirstEmiDate(disbursementDate, lender, product);

    console.log("Calling getFirstEmiDate (BL) with:", {
      disbursementDate,
      lender,
      product,
    });
    console.log("First Due Date (BL):", firstDueDate);

    let dueDate = new Date(firstDueDate);

    if (product === "Daily Loan") {
      const emiPrincipal = Math.round(loanAmount / tenure);

      for (let i = 1; i <= tenure; i++) {
        const interest = parseFloat((loanAmount * dailyRate).toFixed(2));
        const principal = i === tenure ? loanAmount : emiPrincipal;
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
          "Pending",
        ]);

        loanAmount -= principal;
        dueDate.setDate(dueDate.getDate() + 1);
      }
    } else {
      // Monthly Loan
      const emi = Math.round(
        (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
          (Math.pow(1 + monthlyRate, tenure) - 1),
      );

      let outstandingPrincipal = loanAmount;

      // Calculate gap days from disbursement date to first EMI date
      const disbDate = new Date(disbursementDate);
      const gapDays = Math.ceil(
        (new Date(firstDueDate) - disbDate) / (1000 * 60 * 60 * 24),
      );

      for (let i = 1; i <= tenure; i++) {
        let interest, principal;

        if (i === 1) {
          // First EMI interest for gap days
          interest = parseFloat(
            ((outstandingPrincipal * annualRate * gapDays) / 360).toFixed(2),
          );
          principal = parseFloat((emi - interest).toFixed(2));
        } else {
          interest = parseFloat(
            (outstandingPrincipal * monthlyRate).toFixed(2),
          );
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
          "Pending",
        ]);

        outstandingPrincipal -= principal;
        dueDate.setMonth(dueDate.getMonth() + 1);
      }

      // ➕ Update emi_amount in loan_bookings for monthly loans
      await db.promise().query(
        `UPDATE loan_bookings
         SET emi_amount = ?
         WHERE lan = ?`,
        [emi, lan],
      );
    }

    // Insert into manual_rps_ev_loan
    await db.promise().query(
      `INSERT INTO manual_rps_ev_loan
       (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
       VALUES ?`,
      [rpsData],
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

// const generateRepaymentScheduleGQNonFSF = async (
//   lan,
//   approvedAmount,
//   emiDate,
//   interestRate ,
//   tenure,
//   disbursementDate,
//   subventionAmount,
//   product,
//   lender,
//   no_of_advance_emis = 0
// ) => {
//   try {
//     console.log(`\n🚀 Generating GQ NON-FSF RPS for LAN: ${lan}`);
//     console.log(`📝 Inputs → ApprovedAmount: ₹${approvedAmount}, InterestRate: ${interestRate}%, Tenure: ${tenure}, DisbursementDate: ${disbursementDate}, EMI Date: ${emiDate}, SubventionAmount: ₹${subventionAmount}, Product: ${product}, Lender: ${lender}, AdvanceEMIs: ${no_of_advance_emis}`);

//     const annualRate = Number(interestRate ?? 0) / 100; ;
//     let remainingPrincipal = approvedAmount;

//     const isZeroInterest = annualRate === 0;
//     const emiPrincipal = Math.round(approvedAmount / tenure);
//     let emiInterest = isZeroInterest ? 0 : Math.ceil((approvedAmount * annualRate) / tenure);
//     let emiTotal = emiPrincipal + emiInterest;

//     const rpsData = [];

//     for (let i = 1; i <= tenure; i++) {
//       let principal = emiPrincipal;
//       let interest = emiInterest;

//       if (i === tenure) {
//         principal = remainingPrincipal;
//         emiTotal = principal + interest;
//       }

//       // Determine due date
//       let dueDate;
//       if (no_of_advance_emis > 0 && i === 1) {
//         dueDate = new Date(disbursementDate); // first EMI date
//       } else {
//         const offset = no_of_advance_emis > 0 ? i - 2 : i - 1;
//         dueDate = getFirstEmiDate(disbursementDate, emiDate, lender, product, offset);
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

//       remainingPrincipal -= principal;
//     }

//     await db.promise().query(
//       `INSERT INTO manual_rps_gq_non_fsf
//       (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
//       VALUES ?`,
//       [rpsData]
//     );

//     console.log(`✅ GQ NON-FSF RPS generated successfully for ${lan}\n`);
//   } catch (err) {
//     console.error(`❌ GQ NON-FSF RPS Error for ${lan}:`, err);
//   }
// };
//////////////////////,,,,,,/////////////////

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

// helper: round to 2 decimals
///////////////// OLD CODE DUE TO INTEREST ISSUE IN POINT //////////////////////

// const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

// // solve for the *implied* monthly rate that amortizes `prem` with fixed `emi` in `m` months
// // (keeps all EMIs = the flat/₹20,127 value you want)
// function solveMonthlyRate(prem, emi, m) {
//   // Bisection: find r where PV(emi, r, m) - prem = 0
//   let lo = 0,
//     hi = 0.05; // 0%..5% per month is a safe bracket
//   for (let t = 0; t < 80; t++) {
//     const r = (lo + hi) / 2;
//     const pow = Math.pow(1 + r, -m);
//     const pv = (emi * (1 - pow)) / (r || 1e-9);
//     if (pv > prem) lo = r;
//     else hi = r;
//   }
//   return (lo + hi) / 2;
// }

// const generateRepaymentScheduleGQNonFSF = async (
//   lan,
//   approvedAmount,
//   emiDate,
//   interestRate,
//   tenure,
//   disbursementDate,
//   subventionAmount,
//   product,
//   lender,
//   no_of_advance_emis = 1 // we’ll support k >= 1, but your case is k=1
// ) => {
//   try {
//     console.log(
//       `\n🚀 Generating GQ NON-FSF RPS (flat-advance EMI, reducing thereafter) for LAN: ${lan}`
//     );

//     console.log("Data came from utr",lan,
//   approvedAmount,
//   emiDate,
//   interestRate,
//   tenure,
//   disbursementDate,
//   subventionAmount,
//   product,
//   lender,
//   no_of_advance_emis )

//     // --- inputs ---
//     const P = Number(approvedAmount || 0);
//     const n = Number(tenure || 0);
//     const k = Number(no_of_advance_emis || 0);
//     if (n <= 0 || P <= 0) throw new Error("Invalid principal/tenure");
//     // if (k <= 0 || k > n) throw new Error("Invalid no_of_advance_emis");

//     // --- 1) Advance EMI = flat rule you requested ---
//     // EMI_flat = (P/n) + (annual% * P / n). We ROUND TO RUPEES for the EMI value,
//     // but we book the *advance principal* to 2 decimals like in your sheet.
//     const annual = Number(interestRate || 0) / 100;
//     console.log("interst rate", interestRate) // kept only for record
//     const emiFlatExact = P / n + (annual * P) / n; // e.g. 20,126.6931…
//     const EMI = Math.round(emiFlatExact); // e.g. 20,127 (used for *all* 24 EMIs)
//     const advPrincipalOne = r2(emiFlatExact); // e.g. 20,126.69
//     const m = n - k; // remaining months after advance

//     const rows = [];
//     let opening = P;
//     if (k > 0) {
//       // --- 1a) Record k advance EMIs (interest = 0, principal = advPrincipalOne each) ---
//       for (let i = 1; i <= k; i++) {
//         const interest = 0;
//         const principal = advPrincipalOne;
//         const closing = r2(opening - principal);

//         const dueDate = new Date(disbursementDate); // on disbursement day
//         rows.push({
//           seq: `ADV-${i}`,
//           dueDate: dueDate.toISOString().split("T")[0],
//           emi: EMI,
//           interest: interest,
//           principal: r2(principal),
//           closing: r2(closing),
//         });

//         opening = closing;
//       }
//     }
//     // --- 2) Regular schedule with *fixed* EMI (= EMI from step 1) on reducing balance ---
//     // To keep EMI fixed at ₹20,127 *and* amortize in m months, we use the *implied monthly rate*.
//     // (This reproduces the pattern in your screenshot and typically leaves a tiny residual.)
//     const r = solveMonthlyRate(opening, EMI, m); // ~0.00805945 for your case (≈9.67% p.a. effective)
// console.log("DEBUG: r (monthly rate) =", r);
//     for (let i = 1; i <= m; i++) {

//       const interest = r2(opening * r); // interest rounded to paise as shown
//       const principal = r2(EMI - interest); // principal is the rest
//       const closing = r2(opening - principal); // do NOT force last row to zero

//       const offset = i - 1;
//       const dueDate = getFirstEmiDate(
//         disbursementDate,
//         emiDate,
//         lender,
//         product,
//         offset
//       );

//       rows.push({
//         seq: i,
//         dueDate: dueDate.toISOString().split("T")[0],
//         emi: EMI,
//         interest,
//         principal,
//         closing,
//       });

//       console.log("RPS Data", dueDate, EMI, interest, principal, closing)

//       opening = closing;
//     }

//     // (optional) remaining_* totals bottom-up, if you need them for UI
//     let remEmi = 0,
//       remInterest = 0;
//     for (let i = rows.length - 1; i >= 0; i--) {
//       remEmi = r2(remEmi + rows[i].emi);
//       remInterest = r2(remInterest + rows[i].interest);
//       rows[i].remaining_emi = remEmi;
//       rows[i].remaining_interest = remInterest;
//       rows[i].remaining_principal = rows[i].closing;
//     }

//     // --- 3) Bulk insert into DB as before ---
//     const rpsData = rows.map((rw) => [
//       lan,
//       rw.dueDate,
//       rw.emi,
//       rw.interest,
//       rw.principal,
//       rw.principal,
//       rw.interest,
//       rw.emi,
//       "Pending",
//     ]);

//     console.log("Remaining RPS data", rpsData );

//     await db.promise().query(
//       `INSERT INTO manual_rps_gq_non_fsf
//        (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
//        VALUES ?`,
//       [rpsData]
//     );

//     console.log(`✅ RPS generated successfully for ${lan}\n`);
//   } catch (err) {
//     console.error(`❌ RPS Error for ${lan}:`, err);
//   }
// };
//////////// ADD NEW CODE FOR INTEREST ISSUE FIX ////////////////////////////
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

// solve for the *implied* monthly rate that amortizes `prem` with fixed `emi` in `m` months
function solveMonthlyRate(prem, emi, m) {
  let lo = 0,
    hi = 0.05; // 0%..5% per month is a safe bracket
  for (let t = 0; t < 80; t++) {
    const r = (lo + hi) / 2;
    const pow = Math.pow(1 + r, -m);
    const pv = (emi * (1 - pow)) / (r || 1e-9);
    if (pv > prem) lo = r;
    else hi = r;
  }
  return (lo + hi) / 2;
}

const generateRepaymentScheduleGQNonFSF = async (
  lan,
  approvedAmount,
  emiDate,
  interestRate,
  tenure,
  disbursementDate,
  subventionAmount,
  product,
  lender,
  no_of_advance_emis = 1,
) => {
  try {
    console.log(
      `\n🚀 Generating GQ NON-FSF RPS (flat-advance EMI, reducing thereafter) for LAN: ${lan} disbdate : ${disbursementDate}`,
    );

    // --- inputs ---
    const P = Number(approvedAmount || 0);
    const n = Number(tenure || 0);
    const k = Number(no_of_advance_emis || 0);
    if (n <= 0 || P <= 0) throw new Error("Invalid principal/tenure");

    // --- 1) Advance EMI = flat rule you requested ---
    const annual = Number(interestRate || 0) / 100;
    const emiFlatExact = P / n + (annual * P) / n;
    const EMI = Math.round(emiFlatExact); // rounded for all EMIs
    const advPrincipalOne = r2(emiFlatExact);
    const m = n - k; // remaining months after advance

    const rows = [];
    let opening = P;

    if (k > 0) {
      // advance EMIs: only principal, no interest
      for (let i = 1; i <= k; i++) {
        const principal = advPrincipalOne;
        const closing = r2(opening - principal);
        const dueDate = new Date(disbursementDate);
        console.log("Advance RPS Data", dueDate, EMI, 0, principal, closing);
        rows.push({
          seq: `ADV-${i}`,
          dueDate: dueDate.toLocaleDateString("en-CA"),
          emi: EMI,
          interest: 0,
          principal: r2(principal),
          closing: r2(closing),
        });

        opening = closing;
      }
    }

    // --- 2) Regular schedule ---
    let r = 0;
    if (annual > 0) {
      r = solveMonthlyRate(opening, EMI, m); // implied monthly rate
    }

    for (let i = 1; i <= m; i++) {
      let interest, principal;

      if (r === 0) {
        // Zero-interest case
        interest = 0;
        if (i < m) {
          principal = EMI;
        } else {
          principal = opening; // last EMI takes whatever is left
        }
      } else {
        // Interest-bearing case
        interest = r2(opening * r);
        principal = r2(EMI - interest);
      }

      const closing = r2(opening - principal);

      const dueDate = getFirstEmiDate(
        disbursementDate,
        emiDate,
        lender,
        product,
        i - 1,
      );

      rows.push({
        seq: i,
        dueDate: dueDate.toISOString().split("T")[0],
        emi: EMI,
        interest,
        principal,
        closing,
      });

      opening = closing;
    }

    // --- 3) Remaining totals ---
    let remEmi = 0,
      remInterest = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      remEmi = r2(remEmi + rows[i].emi);
      remInterest = r2(remInterest + rows[i].interest);
      rows[i].remaining_emi = remEmi;
      rows[i].remaining_interest = remInterest;
      rows[i].remaining_principal = rows[i].closing;
    }

    // --- 4) Bulk insert into DB ---
    const rpsData = rows.map((rw) => [
      lan,
      rw.dueDate,
      rw.emi,
      rw.interest,
      rw.principal,
      rw.principal,
      rw.interest,
      rw.emi,
      "Pending",
    ]);

    await db.promise().query(
      `INSERT INTO manual_rps_gq_non_fsf
       (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
       VALUES ?`,
      [rpsData],
    );

    console.log(`✅ RPS generated successfully for ${lan}\n`);
  } catch (err) {
    console.error(`❌ RPS Error for ${lan}:`, err);
  }
};

/////////////////////// Fintree Schedule Generation ////////////
//const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

function computeEmiSimpleInterest(loanAmount, annualPercent, tenureMonths) {
  const interestFee = loanAmount * (annualPercent / 100); // loanAmount * interestRate
  const emi = loanAmount / tenureMonths + interestFee / tenureMonths;
  return r2(emi);
}

// solve for implied monthly rate given prem, emi, m (bisection)
function solveMonthlyRate(prem, emi, m) {
  let lo = 0,
    hi = 0.05;
  for (let t = 0; t < 120; t++) {
    const r = (lo + hi) / 2;
    const pow = Math.pow(1 + r, -m);
    const pv = (emi * (1 - pow)) / (r || 1e-12);
    if (pv > prem) lo = r;
    else hi = r;
  }
  return (lo + hi) / 2;
}

async function generateRepaymentScheduleGQNonFSF_Fintree(
  lan,
  approvedAmount,
  emiDate,
  interestRate,
  tenure,
  disbursementDate,
  subventionAmount,
  product,
  lender,
  no_of_advance_emis = 1,
) {
  console.log(
    `\n--- generateRepaymentScheduleGQNonFSF_Fintree START for LAN=${lan} ---`,
  );
  console.log("Inputs:", {
    approvedAmount,
    emiDate,
    interestRate,
    tenure,
    disbursementDate,
    subventionAmount,
    product,
    lender,
    no_of_advance_emis,
  });

  try {
    const P = Math.abs(Number(approvedAmount || 0)); // treat negative as positive
    const n = Math.floor(Number(tenure || 0));
    const k = Math.max(0, Math.floor(Number(no_of_advance_emis || 0)));
    console.log(`Parsed values -> P: ${P}, n: ${n}, k: ${k}`);

    if (n <= 0 || P <= 0) {
      console.error(
        "Validation failed: Invalid principal or tenure. Aborting schedule generation.",
      );
      throw new Error("Invalid principal/tenure");
    }

    const subAmt = Number(subventionAmount || 0);
    const retentionAmount = 0;
    let opening = r2(P - subAmt - retentionAmount);
    console.log(
      `Subvention: ${subAmt}, Retention: ${retentionAmount}, Net opening: ${opening}`,
    );

    if (opening <= 0) {
      console.error("Net disbursal to lender is zero or negative. Aborting.");
      throw new Error("Net disbursal to lender is zero or negative");
    }

    // --- compute EMI using the simple-interest rule on the approved amount ---
    const EMI = computeEmiSimpleInterest(P, Number(interestRate || 0), n);
    console.log(
      `Computed EMI using simple-interest rule on approvedAmount: EMI = ₹${EMI} (interestRate ${interestRate}%, tenure ${n})`,
    );

    const rows = [];

    // 1) apply k advance EMIs (principal-only)
    console.log(`Applying ${k} advance EMI(s)...`);
    for (let a = 1; a <= k && opening > 0; a++) {
      const advPrincipal = r2(Math.min(EMI, opening));
      const beforeOpening = opening;
      opening = r2(opening - advPrincipal);

      const usingGetFirst = typeof getFirstEmiDate === "function";
      // ✅ FIX: Advance EMI uses disbursement date directly

      const advDate = new Date(disbursementDate);

      advDate.setHours(12, 0, 0, 0);

      console.log(
        `ADV-${a}: date=${advDate.toISOString().split("T")[0]}, advPrincipal=${advPrincipal}, opening(before)=${beforeOpening} -> opening(after)=${opening}, usedGetFirstEmiDate=${usingGetFirst}`,
      );

      rows.push({
        seq: `ADV-${a}`,
        dueDate: advDate.toISOString().split("T")[0],
        emi: EMI,
        interest: 0,
        principal: advPrincipal,
        closing: opening,
      });

      if (opening <= 0) {
        console.log(
          "Opening reached zero after advances; stopping advance application.",
        );
        break;
      }
    }

    // 2) infer implied monthly r so same EMI amortizes remaining opening in m months
    const m = Math.max(0, n - k);
    console.log(
      `Remaining months after advances: m = ${m}, opening = ${opening}`,
    );
    let r = 0;
    if (m > 0 && opening > 0) {
      console.log(
        `Solving implied monthly rate for prem=${opening}, emi=${EMI}, m=${m} ...`,
      );
      r = solveMonthlyRate(opening, EMI, m);
      console.log(
        `Solved implied monthly r = ${(r * 100).toFixed(6)}% (approx annual simple ${(r * 12 * 100).toFixed(6)}%)`,
      );
    } else {
      console.log(
        "No remaining months or opening <= 0 => skipping rate solve.",
      );
    }

    // 3) build remaining schedule using implied r
    console.log("Building amortization rows...");
    for (let i = 1; i <= m && opening > 0; i++) {
      const beforeOpening = opening;
      let interest = 0,
        principal = 0;
      if (r === 0) {
        interest = 0;
        principal = i < m ? EMI : opening;
      } else {
        interest = r2(opening * r);
        principal = r2(EMI - interest);
      }

      // last EMI: absorb rounding to make closing exactly zero
      if (i === m) {
        principal = r2(opening);
        interest = r2(EMI - principal);
      }

      const closing = r2(opening - principal);

      // const usingGetFirst = (typeof getFirstEmiDate === "function");
      const dueDate = getFirstEmiDate(
        disbursementDate,
        emiDate,
        lender,
        product,
        i - 1,
      );

      rows.push({
        seq: i,
        dueDate: dueDate.toISOString().split("T")[0],
        emi: EMI,
        interest,
        principal,
        closing,
      });

      opening = closing;
    }

    // 4) running totals & log summary
    console.log("Computing running totals...");
    let remEmi = 0,
      remInterest = 0,
      totalEmi = 0,
      totalInterest = 0,
      totalPrincipal = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      remEmi = r2(remEmi + rows[i].emi);
      remInterest = r2(remInterest + rows[i].interest);
      rows[i].remaining_emi = remEmi;
      rows[i].remaining_interest = remInterest;
      rows[i].remaining_principal = rows[i].closing;

      totalEmi += rows[i].emi;
      totalInterest += rows[i].interest;
      totalPrincipal += rows[i].principal;
    }
    totalEmi = r2(totalEmi);
    totalInterest = r2(totalInterest);
    totalPrincipal = r2(totalPrincipal);

    console.log(`Rows built: ${rows.length}`);
    console.log(
      `Totals -> totalEmi: ₹${totalEmi}, totalInterest: ₹${totalInterest}, totalPrincipal: ₹${totalPrincipal}`,
    );
    console.log(`First 3 rows preview:`, rows.slice(0, 3));
    console.log(
      `Last 3 rows preview:`,
      rows.slice(Math.max(0, rows.length - 3)),
    );

    // 5) persist to DB
    const rpsData = rows.map((rw) => [
      lan,
      rw.dueDate,
      rw.emi,
      rw.interest,
      rw.principal,
      rw.principal,
      rw.interest,
      rw.emi,
      "Pending",
    ]);

    console.log(`Attempting DB insert. rpsData.length = ${rpsData.length}`);
    if (rpsData.length) {
      try {
        const [result] = await db.promise().query(
          `INSERT INTO manual_rps_gq_non_fsf_fintree
           (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
           VALUES ?`,
          [rpsData],
        );
        console.log(
          "DB insert success. result:",
          result && typeof result === "object"
            ? {
                affectedRows: result.affectedRows,
                insertId: result.insertId,
              }
            : result,
        );
      } catch (dbErr) {
        console.error("DB insert failed:", dbErr);
        throw dbErr;
      }
    } else {
      console.warn("No rows to insert. Skipping DB insert.");
    }

    console.log(
      `✅ RPS saved for ${lan}. EMI ₹${EMI}. Implied monthly r ${(r * 100).toFixed(6)}%`,
    );
    console.log(
      `--- generateRepaymentScheduleGQNonFSF_Fintree END for LAN=${lan} ---\n`,
    );
    return rows;
  } catch (err) {
    console.error(`❌ RPS Error for ${lan}:`, err);
    console.log(
      `--- generateRepaymentScheduleGQNonFSF_Fintree ABORT for LAN=${lan} ---\n`,
    );
    throw err;
  }
}

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
  no_of_advance_emis,
  retentionPercent = 0, // ✅ add
  manualRetentionAmount = 0, // ✅ add
) => {
  try {
    console.log(`\n🚀 Generating GQ FSF RPS for LAN: ${lan}`);
    console.log(
      `📝 Inputs → ApprovedAmount: ₹${approvedAmount}, InterestRate: ${interestRate}%, Tenure: ${tenure}, DisbursementDate: ${disbursementDate}, SubventionAmount: ₹${subventionAmount}, Product: ${product}, Lender: ${lender}, AdvanceEMIs: ${no_of_advance_emis}`,
    );

    const annualRate = interestRate / 100;
    let remainingPrincipal = approvedAmount;

    const isZeroInterest = annualRate === 0;
    const emiPrincipal = Math.round(approvedAmount / tenure);
    let emiInterest = isZeroInterest
      ? 0
      : Math.ceil((approvedAmount * annualRate) / tenure);
    let emiTotal = emiPrincipal + emiInterest;

    if (isZeroInterest) {
      console.log("💡 Interest-free loan — EMI = Principal only");
    } else {
      console.log(
        `💰 EMI Breakdown → Principal: ₹${emiPrincipal}, Interest: ₹${emiInterest}, Total: ₹${emiTotal}`,
      );
    }

    const rpsData = [];

    for (let i = 1; i <= tenure; i++) {
      let principal = emiPrincipal;
      let interest = emiInterest;

      if (i === tenure) {
        principal = remainingPrincipal;
        emiTotal = principal + interest;
        console.log(
          `🔧 Adjusted Final EMI (Month ${i}): ₹${emiTotal} (P: ₹${principal}, I: ₹${interest})`,
        );
      }

      // ✅ Calculate due date
      let dueDate;
      console.log(
        `💰 Month ${i} breakdown — Principal: ₹${principal}, Interest: ₹${interest}, Total: ₹${emiTotal}`,
      );
      console.log(`no of advance emis`, no_of_advance_emis);
      if (no_of_advance_emis > 0 && i === 1) {
        // Only the first EMI on disbursement date

        dueDate = new Date(disbursementDate);
      } else {
        const offset = no_of_advance_emis > 0 ? i - 2 : i - 1;
        dueDate = getFirstEmiDate(
          disbursementDate,
          emiDate,
          lender,
          product,
          offset,
        );
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
        "Pending",
      ]);

      console.log(
        `📌 Month ${i}: DueDate=${
          dueDate.toISOString().split("T")[0]
        }, EMI=₹${emiTotal}`,
      );
      remainingPrincipal -= principal;
    }

    await db.promise().query(
      `INSERT INTO manual_rps_gq_fsf
      (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
      VALUES ?`,
      [rpsData],
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

/////////////////////////// GQ FSF FINTREE RPS ////////////////////////////
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// GQ FSF Loan Calculation - Fintree (Dynamic EMI + IRR)
//////////////////////////////////////////////////////////

// --- IRR Helper ---
// function calculateIRR(cashflows, guess = 0.01) {
//   const maxIter = 1000;
//   const precision = 1e-7;
//   let rate = guess;
//   for (let i = 0; i < maxIter; i++) {
//     let npv = 0, dnpv = 0;
//     for (let t = 0; t < cashflows.length; t++) {
//       npv += cashflows[t] / Math.pow(1 + rate, t);
//       dnpv -= (t * cashflows[t]) / Math.pow(1 + rate, t + 1);
//     }
//     const newRate = rate - npv / dnpv;
//     if (Math.abs(newRate - rate) < precision) return rate;
//     rate = newRate;
//   }
//   return rate;
// }

// // --- EMI Helper ---
// function calculateEMI(principal, monthlyRate, tenure) {
//   if (monthlyRate === 0) return principal / tenure;
//   const factor = Math.pow(1 + monthlyRate, tenure);
//   return +(principal * monthlyRate * factor / (factor - 1)).toFixed(2);
// }

// //////////////////////////////////////////////////////////
// // MAIN FUNCTION (Dynamic)
// //////////////////////////////////////////////////////////
// const generateRepaymentScheduleGQFSF_Fintree = async (
//   lan,
//   approvedAmount,      // from DB or input
//   emiDate,             // e.g. 10
//   interestRate,        // if 0, we derive via IRR or APR
//   tenure,              // months
//   disbursementDate,    // e.g. '2025-08-26'
//   subventionAmount,    // from DB
//   product,
//   lender,
//   no_of_advance_emis,  // from DB
//   retentionPercent,    // from DB (or null)
//   manualRetentionAmount // optional
// ) => {
//   try {
//     console.log(`\n🚀 Generating Fintree RPS for LAN: ${lan}`);

//     //---------------------------------------------------------
//     // 1️⃣ INPUT PREP
//     //---------------------------------------------------------
//     const subvention = Number(subventionAmount || 0);
//     const netLoanForLender = Number(approvedAmount) - subvention;
//     const retentionAmount =
//       manualRetentionAmount
//         ? Number(manualRetentionAmount)
//         : retentionPercent
//         ? +(netLoanForLender * retentionPercent).toFixed(2)
//         : 0;
//     const netDisbursement = +(netLoanForLender - retentionAmount).toFixed(2);
//     const advEmiCount = Number(no_of_advance_emis || 0);
//     const totalEmis = Number(tenure);

//     console.log(`💵 Approved Amount: ₹${approvedAmount}`);
//     console.log(`💸 Subvention: ₹${subvention}`);
//     console.log(`🏦 Retention: ₹${retentionAmount}`);
//     console.log(`💰 Net Disbursement: ₹${netDisbursement}`);

//     //---------------------------------------------------------
//     // 2️⃣ ESTIMATE RATE & EMI (Dynamic)
//     //---------------------------------------------------------
//     // If interestRate = 0, assume effective APR ≈ 10.56%
//     const annualRate = interestRate && interestRate > 0 ? interestRate : 10.56;
//     const monthlyRate = +(annualRate / 12 / 100).toFixed(6);

//     // EMI from lender’s principal (netLoanForLender)
//     const emiAmount = calculateEMI(netLoanForLender, monthlyRate, totalEmis);
//     console.log(`📆 EMI Calculated: ₹${emiAmount} (Rate: ${annualRate}% p.a.)`);

//     //---------------------------------------------------------
//     // 3️⃣ GENERATE RPS
//     //---------------------------------------------------------
//     let openingBal = netLoanForLender;
//     const rpsData = [];
//     const cashflows = [-netDisbursement];
//     let remainingEmi = totalEmis;

//     // Advance EMI (deducted on disbursement)
//     if (advEmiCount > 0) {
//       const advInterest = +(openingBal * monthlyRate).toFixed(2);
//       const advPrincipal = +(emiAmount - advInterest).toFixed(2);
//       const advClosing = +(openingBal - advPrincipal).toFixed(2);
//       const advDueDate = new Date(disbursementDate);

//       rpsData.push([
//         lan,
//         advDueDate.toISOString().split("T")[0],
//         "Pending",
//         emiAmount,
//         advInterest,
//         advPrincipal,
//         openingBal,
//         advClosing,
//         emiAmount,
//         advInterest,
//         advPrincipal,
//         emiAmount

//       ]);

//       cashflows.push(emiAmount);
//       openingBal = advClosing;
//     }

//     // Regular EMIs
//     const normalEmiCount = totalEmis - advEmiCount;
//     for (let i = 1; i <= normalEmiCount; i++) {
//       const interest = +(openingBal * monthlyRate).toFixed(2);
//       const principal = +(emiAmount - interest).toFixed(2);
//       const closingBal = +(openingBal - principal).toFixed(2);
//       const emiDueDate = new Date(disbursementDate);
//       emiDueDate.setMonth(emiDueDate.getMonth() + i);
//       emiDueDate.setDate(emiDate);

//       const remainingInterest = +(closingBal * monthlyRate).toFixed(2);

//       rpsData.push([
//         lan,
//         emiDueDate.toISOString().split("T")[0],
//         "Pending",
//         emiAmount,
//         interest,
//         principal,
//         openingBal,
//         closingBal,
//         emiAmount,
//         interest,
//         principal,
//         emiAmount

//       ]);

//       cashflows.push(emiAmount);
//       openingBal = closingBal;
//     }

//     //---------------------------------------------------------
//     // 4️⃣ DERIVE EFFECTIVE IRR / APR
//     //---------------------------------------------------------
//     const monthlyIRR = calculateIRR(cashflows);
//     const apr = ((1 + monthlyIRR) ** 12 - 1) * 100;
//     console.log(`📊 Derived APR = ${apr.toFixed(2)}%`);

//     //---------------------------------------------------------
//     // 5️⃣ INSERT TO DB
//     //---------------------------------------------------------
//     if (rpsData.length > 0) {
//       const sql = `
//         INSERT INTO manual_rps_gq_fsf_fintree
//         (lan, due_date, status, emi, interest, principal, opening, closing, remaining_emi,
//          remaining_interest, remaining_principal,remaining_amount)
//         VALUES ?
//       `;
//       await db.promise().query(sql, [rpsData]);
//       console.log(`✅ Inserted ${rpsData.length} rows for ${lan}`);
//     } else {
//       console.warn("⚠️ No rows generated — nothing inserted");
//     }

//     //---------------------------------------------------------
//     // 6️⃣ RETURN SUMMARY
//     //---------------------------------------------------------
//     return {
//       lan,
//       totalEmis,
//       advEmiCount,
//       emiAmount,
//       subventionAmount: subvention,
//       netLoanForLender,
//       retentionAmount,
//       netDisbursement,
//       apr: +apr.toFixed(2)
//     };
//   } catch (err) {
//     console.error(`❌ GQ FSF RPS Error for ${lan}:`, err);
//   }
// };

/////////////////////////// GQ FSF FINTREE RPS SAjag End////////////////////////////
/////////////////////////// GQ FSF FINTREE RPS Sajag New Start  ////////////////////////////

// ================= IRR HELPER =================
// ================= IRR HELPER =================
function calculateIRR(cashflows, guess = 0.01) {
  const MAX_ITER = 1000;
  const PRECISION = 1e-8;
  let rate = guess;

  for (let i = 0; i < MAX_ITER; i++) {
    let npv = 0;
    let dnpv = 0;

    for (let t = 0; t < cashflows.length; t++) {
      npv += cashflows[t] / Math.pow(1 + rate, t);
      dnpv -= (t * cashflows[t]) / Math.pow(1 + rate, t + 1);
    }

    if (Math.abs(dnpv) < 1e-12) break;

    const newRate = rate - npv / dnpv;
    if (Math.abs(newRate - rate) < PRECISION) return newRate;

    rate = newRate;
  }
  return rate;
}

// ================= DATE HELPERS =================
const toISO = (d, label = "date") => {
  if (!d) throw new Error(`toISO() received ${label}=undefined/null`);
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) {
    throw new Error(`toISO() received invalid ${label}: ${JSON.stringify(d)}`);
  }
  return dt.toISOString().split("T")[0];
};

const addMonthsWithEmiDate = (base, m, emiDate) => {
  const b = base instanceof Date ? base : new Date(base);
  if (!b || Number.isNaN(b.getTime())) return null;

  const d = new Date(b);
  d.setMonth(d.getMonth() + m);

  // If emiDate is missing/invalid, keep the day from base date
  const day = Number(emiDate);
  if (day && day >= 1 && day <= 31) d.setDate(day);

  // If date overflowed (e.g., Feb 31), JS auto-rolls; if you want clamp behavior,
  // we can implement it — but this keeps your current behavior.
  return d;
};

const generateRepaymentScheduleGQFSF_Fintree = async (
  lan,
  approvedAmount,
  emiDate,
  interestRate,
  tenure,
  disbursementDate,
  subventionAmount,
  product,
  lender,
  no_of_advance_emis,
  retentionPercent,
  manualRetentionAmount,
) => {
  // =====================================================
  // COMMON HELPERS
  // =====================================================

  const round2 = (value, label = "value") => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      throw new Error(
        `Invalid ${label} for LAN=${lan}: ${value}`,
      );
    }

    return (
      Math.round(
        (number + Number.EPSILON) * 100,
      ) / 100
    );
  };

  const parsePercentage = (
    value,
    label,
  ) => {
    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    ) {
      return 0;
    }

    const cleaned = String(value)
      .trim()
      .replace("%", "");

    const number = Number(cleaned);

    if (
      !Number.isFinite(number) ||
      number < 0
    ) {
      throw new Error(
        `Invalid ${label} for LAN=${lan}: ${value}`,
      );
    }

    /*
     * Supports:
     *
     * 20
     * "20%"
     * 0.20
     */
    return number > 1
      ? number / 100
      : number;
  };

  const parseDateOnly = (
    value,
    label = "date",
  ) => {
    if (!value) {
      throw new Error(
        `${label} is required for LAN=${lan}`,
      );
    }

    if (value instanceof Date) {
      if (
        Number.isNaN(
          value.getTime(),
        )
      ) {
        throw new Error(
          `Invalid ${label} for LAN=${lan}`,
        );
      }

      return new Date(
        Date.UTC(
          value.getFullYear(),
          value.getMonth(),
          value.getDate(),
        ),
      );
    }

    const text = String(value).trim();

    // YYYY-MM-DD
    let match = text.match(
      /^(\d{4})-(\d{2})-(\d{2})$/,
    );

    if (match) {
      const [
        ,
        year,
        month,
        day,
      ] = match;

      const date = new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
        ),
      );

      if (
        date.getUTCFullYear() !==
          Number(year) ||
        date.getUTCMonth() !==
          Number(month) - 1 ||
        date.getUTCDate() !==
          Number(day)
      ) {
        throw new Error(
          `Invalid ${label} for LAN=${lan}: ${value}`,
        );
      }

      return date;
    }

    // DD-MM-YYYY or DD/MM/YYYY
    match = text.match(
      /^(\d{2})[-/](\d{2})[-/](\d{4})$/,
    );

    if (match) {
      const [
        ,
        day,
        month,
        year,
      ] = match;

      const date = new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
        ),
      );

      if (
        date.getUTCFullYear() !==
          Number(year) ||
        date.getUTCMonth() !==
          Number(month) - 1 ||
        date.getUTCDate() !==
          Number(day)
      ) {
        throw new Error(
          `Invalid ${label} for LAN=${lan}: ${value}`,
        );
      }

      return date;
    }

    // DD-MMM-YY or DD-MMM-YYYY
    match = text.match(
      /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/,
    );

    if (match) {
      const [
        ,
        dayText,
        monthText,
        yearText,
      ] = match;

      const monthMap = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11,
      };

      const month =
        monthMap[
          monthText.toLowerCase()
        ];

      const year =
        yearText.length === 2
          ? 2000 + Number(yearText)
          : Number(yearText);

      const day = Number(dayText);

      if (
        month === undefined
      ) {
        throw new Error(
          `Invalid ${label} for LAN=${lan}: ${value}`,
        );
      }

      const date = new Date(
        Date.UTC(
          year,
          month,
          day,
        ),
      );

      if (
        date.getUTCFullYear() !==
          year ||
        date.getUTCMonth() !==
          month ||
        date.getUTCDate() !==
          day
      ) {
        throw new Error(
          `Invalid ${label} for LAN=${lan}: ${value}`,
        );
      }

      return date;
    }

    const parsed = new Date(text);

    if (
      Number.isNaN(
        parsed.getTime(),
      )
    ) {
      throw new Error(
        `Invalid ${label} for LAN=${lan}: ${value}`,
      );
    }

    return new Date(
      Date.UTC(
        parsed.getFullYear(),
        parsed.getMonth(),
        parsed.getDate(),
      ),
    );
  };

  const getEmiDay = (
    value,
  ) => {
    const directDay =
      Number(value);

    if (
      Number.isInteger(
        directDay,
      ) &&
      directDay >= 1 &&
      directDay <= 31
    ) {
      return directDay;
    }

    /*
     * Supports:
     *
     * "05-Oct-25"
     * "05-Oct-2025"
     */
    const match = String(
      value || "",
    )
      .trim()
      .match(/^(\d{1,2})/);

    if (match) {
      const day = Number(
        match[1],
      );

      if (
        day >= 1 &&
        day <= 31
      ) {
        return day;
      }
    }

    throw new Error(
      `Invalid emiDate for LAN=${lan}: ${value}`,
    );
  };

  const toISODate = (
    value,
    label = "date",
  ) =>
    parseDateOnly(
      value,
      label,
    )
      .toISOString()
      .slice(0, 10);

  const addMonthsClamped = (
    baseDate,
    monthsToAdd,
    requestedEmiDay,
  ) => {
    const base =
      parseDateOnly(
        baseDate,
        "disbursementDate",
      );

    const targetMonthStart =
      new Date(
        Date.UTC(
          base.getUTCFullYear(),
          base.getUTCMonth() +
            Number(monthsToAdd),
          1,
        ),
      );

    const targetYear =
      targetMonthStart.getUTCFullYear();

    const targetMonth =
      targetMonthStart.getUTCMonth();

    const lastDay =
      new Date(
        Date.UTC(
          targetYear,
          targetMonth + 1,
          0,
        ),
      ).getUTCDate();

    return new Date(
      Date.UTC(
        targetYear,
        targetMonth,
        Math.min(
          requestedEmiDay,
          lastDay,
        ),
      ),
    );
  };

  let connection;
  let transactionStarted =
    false;

  try {
    // =====================================================
    // INPUT VALIDATION
    // =====================================================

    if (
      !lan ||
      !String(lan).trim()
    ) {
      throw new Error(
        "LAN is required",
      );
    }

    const approved = round2(
      approvedAmount,
      "approvedAmount",
    );

    const tenureMonths =
      Number(tenure);

    const advanceEmiCount =
      Number(
        no_of_advance_emis ||
          0,
      );

    const subvention =
      round2(
        subventionAmount ||
          0,
        "subventionAmount",
      );

    const flatRate =
      parsePercentage(
        interestRate || 0,
        "interestRate",
      );

    const retentionRate =
      parsePercentage(
        retentionPercent || 0,
        "retentionPercent",
      );

    const disbursement =
      parseDateOnly(
        disbursementDate,
        "disbursementDate",
      );

    const emiDay =
      getEmiDay(emiDate);

    if (approved <= 0) {
      throw new Error(
        `approvedAmount must be greater than zero for LAN=${lan}`,
      );
    }

    if (
      !Number.isInteger(
        tenureMonths,
      ) ||
      tenureMonths <= 0
    ) {
      throw new Error(
        `Invalid tenure=${tenure} for LAN=${lan}`,
      );
    }

    if (
      !Number.isInteger(
        advanceEmiCount,
      ) ||
      advanceEmiCount < 0 ||
      advanceEmiCount >=
        tenureMonths
    ) {
      throw new Error(
        `Invalid no_of_advance_emis=${no_of_advance_emis} ` +
          `for LAN=${lan}`,
      );
    }

    if (
      subvention < 0 ||
      subvention > approved
    ) {
      throw new Error(
        `Invalid subventionAmount=${subventionAmount} ` +
          `for LAN=${lan}`,
      );
    }

    const hasManualRetention =
      manualRetentionAmount !==
        undefined &&
      manualRetentionAmount !==
        null &&
      String(
        manualRetentionAmount,
      ).trim() !== "";

    // =====================================================
    // NET LOAN VALUES
    // =====================================================

    const netLoanForLender =
      round2(
        approved -
          subvention,
      );

    /*
     * Manual retention has priority.
     *
     * Manual value 0 is also accepted.
     */
    const retentionAmount =
      hasManualRetention
        ? round2(
            manualRetentionAmount,
            "manualRetentionAmount",
          )
        : round2(
            netLoanForLender *
              retentionRate,
          );

    if (
      retentionAmount < 0 ||
      retentionAmount >
        netLoanForLender
    ) {
      throw new Error(
        `Invalid retentionAmount=${retentionAmount} ` +
          `for LAN=${lan}`,
      );
    }

    const netDisbursement =
      round2(
        netLoanForLender -
          retentionAmount,
      );

    // =====================================================
    // FIXED EMI
    // =====================================================

    /*
     * EMI remains unchanged.
     *
     * EMI =
     * Approved amount / tenure
     * +
     * Flat interest / tenure
     */
    const emiAmount =
      round2(
        approved /
          tenureMonths +
          (
            approved *
            flatRate
          ) /
            tenureMonths,
        "emiAmount",
      );

    if (emiAmount <= 0) {
      throw new Error(
        `Calculated EMI is invalid for LAN=${lan}`,
      );
    }

    // =====================================================
    // ADVANCE EMI
    // =====================================================

    const totalAdvanceAmount =
      round2(
        emiAmount *
          advanceEmiCount,
      );

    if (
      totalAdvanceAmount >
      netDisbursement + 0.01
    ) {
      throw new Error(
        `Advance EMI amount ${totalAdvanceAmount} exceeds ` +
          `net disbursement ${netDisbursement} for LAN=${lan}`,
      );
    }

    const netPrincipalOS =
      round2(
        netDisbursement -
          totalAdvanceAmount,
      );

    const normalEmis =
      tenureMonths -
      advanceEmiCount;

    if (normalEmis <= 0) {
      throw new Error(
        `Invalid normal EMI count for LAN=${lan}`,
      );
    }

    // =====================================================
    // IRR CASHFLOW
    // =====================================================

    /*
     * Retention-adjusted final cashflow is used only
     * for deriving the monthly IRR.
     *
     * It is not directly inserted in RPS.
     */
    const retentionAdjustedFinalCashflow =
      round2(
        emiAmount -
          retentionAmount,
      );

    const cashflows = [
      -netPrincipalOS,
    ];

    for (
      let installment = 1;
      installment <=
      normalEmis - 1;
      installment++
    ) {
      cashflows.push(
        emiAmount,
      );
    }

    cashflows.push(
      retentionAdjustedFinalCashflow,
    );

    const monthlyIRR =
      netPrincipalOS > 0
        ? calculateIRR(
            cashflows,
            0.01,
          )
        : 0;

    if (
      !Number.isFinite(
        monthlyIRR,
      ) ||
      monthlyIRR < 0 ||
      monthlyIRR <= -1
    ) {
      throw new Error(
        `Invalid monthlyIRR=${monthlyIRR} for LAN=${lan}`,
      );
    }

    const annualIRR =
      round2(
        monthlyIRR *
          12 *
          100,
      );

    // =====================================================
    // BUILD RPS
    // =====================================================

    const schedule = [];

    let openingBalance =
      netDisbursement;

    let retentionScheduled = 0;

    let grossPositiveInterest = 0;

    let totalInterest = 0;

    let totalPrincipal = 0;

    // =====================================================
    // ADVANCE EMI ROWS
    // =====================================================

    for (
      let advanceIndex = 0;
      advanceIndex <
      advanceEmiCount;
      advanceIndex++
    ) {
      const principal =
        round2(
          Math.min(
            openingBalance,
            emiAmount,
          ),
        );

      const retentionForRow =
        round2(
          Math.min(
            Math.max(
              0,
              emiAmount -
                principal,
            ),
            Math.max(
              0,
              retentionAmount -
                retentionScheduled,
            ),
          ),
        );

      const interest =
        round2(
          emiAmount -
            principal -
            retentionForRow,
        );

      const closingBalance =
        round2(
          Math.max(
            0,
            openingBalance -
              principal,
          ),
        );

      schedule.push({
        lan,

        dueDate:
          toISODate(
            disbursement,
            "disbursementDate",
          ),

        status: "Pending",

        emi: emiAmount,

        interest,

        principal,

        retentionAmount:
          retentionForRow,

        opening:
          openingBalance,

        closing:
          closingBalance,

        remainingEmi:
          emiAmount,

        remainingInterest:
          interest,

        remainingPrincipal:
          principal,

        remainingRetention:
          retentionForRow,

        remainingAmount:
          emiAmount,

        isInterestAdjustment:
          false,
      });

      if (interest > 0) {
        grossPositiveInterest =
          round2(
            grossPositiveInterest +
              interest,
          );
      }

      totalInterest =
        round2(
          totalInterest +
            interest,
        );

      totalPrincipal =
        round2(
          totalPrincipal +
            principal,
        );

      retentionScheduled =
        round2(
          retentionScheduled +
            retentionForRow,
        );

      openingBalance =
        closingBalance;
    }

    // =====================================================
    // NORMAL EMI ROWS
    //
    // Final row is reserved for retention adjustment.
    // =====================================================

    for (
      let installment = 1;
      installment <=
      normalEmis - 1;
      installment++
    ) {
      const rowOpening =
        openingBalance;

      const interest =
        rowOpening > 0
          ? round2(
              rowOpening *
                monthlyIRR,
            )
          : 0;

      const principal =
        round2(
          Math.min(
            rowOpening,
            Math.max(
              0,
              emiAmount -
                interest,
            ),
          ),
        );

      /*
       * If principal becomes zero before final row,
       * the remaining EMI amount goes to retention.
       */
      const retentionForRow =
        round2(
          Math.min(
            Math.max(
              0,
              emiAmount -
                interest -
                principal,
            ),
            Math.max(
              0,
              retentionAmount -
                retentionScheduled,
            ),
          ),
        );

      const closingBalance =
        round2(
          Math.max(
            0,
            rowOpening -
              principal,
          ),
        );

      const rowTotal =
        round2(
          interest +
            principal +
            retentionForRow,
        );

      if (
        Math.abs(
          rowTotal -
            emiAmount,
        ) > 0.01
      ) {
        throw new Error(
          `Normal EMI mismatch for LAN=${lan}, ` +
            `installment=${installment}, ` +
            `EMI=${emiAmount}, components=${rowTotal}`,
        );
      }

      const dueDate =
        addMonthsClamped(
          disbursement,
          installment,
          emiDay,
        );

      schedule.push({
        lan,

        dueDate:
          toISODate(
            dueDate,
            "dueDate",
          ),

        status: "Pending",

        emi: emiAmount,

        interest,

        principal,

        retentionAmount:
          retentionForRow,

        opening:
          rowOpening,

        closing:
          closingBalance,

        remainingEmi:
          emiAmount,

        remainingInterest:
          interest,

        remainingPrincipal:
          principal,

        remainingRetention:
          retentionForRow,

        remainingAmount:
          emiAmount,

        isInterestAdjustment:
          false,
      });

      if (interest > 0) {
        grossPositiveInterest =
          round2(
            grossPositiveInterest +
              interest,
          );
      }

      totalInterest =
        round2(
          totalInterest +
            interest,
        );

      totalPrincipal =
        round2(
          totalPrincipal +
            principal,
        );

      retentionScheduled =
        round2(
          retentionScheduled +
            retentionForRow,
        );

      openingBalance =
        closingBalance;
    }

    // =====================================================
    // FINAL RETENTION ADJUSTMENT ROW
    // =====================================================

    /*
     * Final row calculation:
     *
     * EMI =
     * final interest adjustment
     * + remaining principal
     * + remaining retention
     *
     * Example:
     *
     * EMI                 58,333.33
     * Principal                 0.00
     * Retention            58,524.37
     * Interest adjustment    -191.04
     */
    const finalPrincipal =
      round2(
        openingBalance,
      );

    const remainingRetention =
      round2(
        Math.max(
          0,
          retentionAmount -
            retentionScheduled,
        ),
      );

    const finalInterestAdjustment =
      round2(
        emiAmount -
          finalPrincipal -
          remainingRetention,
      );

    const finalClosingBalance =
      round2(
        Math.max(
          0,
          openingBalance -
            finalPrincipal,
        ),
      );

    const finalDueDate =
      addMonthsClamped(
        disbursement,
        normalEmis,
        emiDay,
      );

    const finalRowTotal =
      round2(
        finalInterestAdjustment +
          finalPrincipal +
          remainingRetention,
      );

    if (
      Math.abs(
        finalRowTotal -
          emiAmount,
      ) > 0.01
    ) {
      throw new Error(
        `Final EMI mismatch for LAN=${lan}. ` +
          `EMI=${emiAmount}, components=${finalRowTotal}`,
      );
    }

    schedule.push({
      lan,

      dueDate:
        toISODate(
          finalDueDate,
          "finalDueDate",
        ),

      status: "Pending",

      emi:
        emiAmount,

      interest:
        finalInterestAdjustment,

      principal:
        finalPrincipal,

      retentionAmount:
        remainingRetention,

      opening:
        openingBalance,

      closing:
        finalClosingBalance,

      remainingEmi:
        emiAmount,

      remainingInterest:
        finalInterestAdjustment,

      remainingPrincipal:
        finalPrincipal,

      remainingRetention:
        remainingRetention,

      remainingAmount:
        emiAmount,

      isInterestAdjustment:
        true,
    });

    totalInterest =
      round2(
        totalInterest +
          finalInterestAdjustment,
      );

    totalPrincipal =
      round2(
        totalPrincipal +
          finalPrincipal,
      );

    retentionScheduled =
      round2(
        retentionScheduled +
          remainingRetention,
      );

    openingBalance =
      finalClosingBalance;

    // =====================================================
    // TOTALS
    // =====================================================

    const totalScheduledEmi =
      round2(
        emiAmount *
          tenureMonths,
      );

    /*
     * Net interest must reconcile to:
     *
     * Total EMI
     * - principal
     * - retention
     */
    const expectedNetInterest =
      round2(
        totalScheduledEmi -
          netDisbursement -
          retentionAmount,
      );

    const totalRpsAmount =
      round2(
        schedule.reduce(
          (
            total,
            row,
          ) =>
            total +
            row.emi,
          0,
        ),
      );

    // =====================================================
    // ROW VALIDATIONS
    // =====================================================

    schedule.forEach(
      (
        row,
        index,
      ) => {
        const componentTotal =
          round2(
            row.interest +
              row.principal +
              row.retentionAmount,
          );

        const closingCheck =
          round2(
            row.opening -
              row.principal,
          );

        const isFinalAdjustmentRow =
          index ===
            schedule.length -
              1 &&
          row.isInterestAdjustment ===
            true;

        if (
          row.emi < 0 ||
          row.principal < 0 ||
          row.retentionAmount <
            0 ||
          row.opening < 0 ||
          row.closing < 0 ||
          (
            !isFinalAdjustmentRow &&
            row.interest < 0
          ) ||
          row.principal >
            row.opening +
              0.01 ||
          Math.abs(
            componentTotal -
              row.emi,
          ) > 0.01 ||
          Math.abs(
            closingCheck -
              row.closing,
          ) > 0.01
        ) {
          throw new Error(
            `Invalid RPS row ${index + 1} for LAN=${lan}: ` +
              JSON.stringify(
                row,
              ),
          );
        }
      },
    );

    if (
      schedule.length !==
      tenureMonths
    ) {
      throw new Error(
        `RPS row count mismatch for LAN=${lan}. ` +
          `Expected=${tenureMonths}, ` +
          `actual=${schedule.length}`,
      );
    }

    if (
      Math.abs(
        openingBalance,
      ) > 0.01
    ) {
      throw new Error(
        `Principal did not close for LAN=${lan}. ` +
          `Closing=${openingBalance}`,
      );
    }

    if (
      Math.abs(
        totalPrincipal -
          netDisbursement,
      ) > 0.01
    ) {
      throw new Error(
        `Principal mismatch for LAN=${lan}. ` +
          `Expected=${netDisbursement}, ` +
          `actual=${totalPrincipal}`,
      );
    }

    if (
      Math.abs(
        retentionScheduled -
          retentionAmount,
      ) > 0.01
    ) {
      throw new Error(
        `Retention mismatch for LAN=${lan}. ` +
          `Expected=${retentionAmount}, ` +
          `actual=${retentionScheduled}`,
      );
    }

    if (
      Math.abs(
        totalInterest -
          expectedNetInterest,
      ) > 0.01
    ) {
      throw new Error(
        `Interest mismatch for LAN=${lan}. ` +
          `Expected=${expectedNetInterest}, ` +
          `actual=${totalInterest}`,
      );
    }

    if (
      Math.abs(
        totalRpsAmount -
          totalScheduledEmi,
      ) > 0.01
    ) {
      throw new Error(
        `RPS total mismatch for LAN=${lan}. ` +
          `Expected=${totalScheduledEmi}, ` +
          `actual=${totalRpsAmount}`,
      );
    }

    // =====================================================
    // DATABASE INSERT DATA
    // =====================================================

    const rpsData =
      schedule.map(
        (row) => [
          row.lan,
          row.dueDate,
          row.status,
          row.emi,
          row.interest,
          row.principal,
          row.retentionAmount,
          row.opening,
          row.closing,
          row.remainingEmi,
          row.remainingInterest,
          row.remainingPrincipal,
          row.remainingRetention,
          row.remainingAmount,
        ],
      );

    // =====================================================
    // TRANSACTION
    // =====================================================

    connection =
      await db
        .promise()
        .getConnection();

    await connection.beginTransaction();

    transactionStarted = true;

    /*
     * Remove any previously generated RPS for the LAN.
     */
    await connection.query(
      `
        DELETE FROM manual_rps_gq_fsf_fintree
        WHERE lan = ?
      `,
      [lan],
    );

    if (
      rpsData.length > 0
    ) {
      await connection.query(
        `
          INSERT INTO manual_rps_gq_fsf_fintree
          (
            lan,
            due_date,
            status,
            emi,
            interest,
            principal,
            retention_amount,
            opening,
            closing,
            remaining_emi,
            remaining_interest,
            remaining_principal,
            remaining_retention,
            remaining_amount
          )
          VALUES ?
        `,
        [rpsData],
      );
    }

    await connection.commit();

    transactionStarted =
      false;

    // =====================================================
    // RETURN
    // =====================================================

    return {
      success: true,

      lan,
      product,
      lender,

      approvedAmount:
        approved,

      tenureMonths,

      advanceEmiCount,

      emiAmount,

      subventionAmount:
        subvention,

      netLoanForLender,

      retentionAmount,

      netDisbursement,

      netPrincipalOS,

      monthlyIRR,

      annualIRR,

      /*
       * Total positive interest before final adjustment.
       */
      grossPositiveInterest,

      /*
       * Final negative or positive interest adjustment.
       */
      finalInterestAdjustment,

      /*
       * Net interest after final adjustment.
       */
      totalInterest,

      totalPrincipal,

      totalRetention:
        retentionScheduled,

      totalScheduledEmi,

      totalRpsAmount,

      expectedNetInterest,

      cashflows,

      rpsRowsInserted:
        rpsData.length,

      schedule,
    };
  } catch (error) {
    if (
      connection &&
      transactionStarted
    ) {
      try {
        await connection.rollback();
      } catch (
        rollbackError
      ) {
        console.error(
          `RPS rollback failed for LAN=${lan}:`,
          rollbackError,
        );
      }
    }

    console.error(
      `RPS ERROR (GQFSF_Fintree) LAN=${lan}:`,
      error,
    );

    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


// const generateRepaymentScheduleGQFSF_Fintree = async (
//   lan,
//   approvedAmount,
//   emiDate,
//   interestRate, // flat % p.a. (EMI calc only)
//   tenure,
//   disbursementDate,
//   subventionAmount,
//   product,
//   lender,
//   no_of_advance_emis,
//   retentionPercent,
//   manualRetentionAmount,
// ) => {
//   try {
//     const approved = Number(approvedAmount);
//     const tenureMonths = Number(tenure);
//     const advEmiCount = Number(no_of_advance_emis || 0);
//     const subvention = Number(subventionAmount || 0);

//     const disb =
//       disbursementDate instanceof Date
//         ? disbursementDate
//         : new Date(disbursementDate);

//     if (!disb || Number.isNaN(disb.getTime())) {
//       throw new Error(
//         `Invalid disbursementDate for LAN=${lan}: ${JSON.stringify(disbursementDate)}`,
//       );
//     }

//     const safeRetentionPercent = Number(retentionPercent || 0);
//     const safeManualRetentionAmount = Number(manualRetentionAmount || 0);
    

//     // ---------- NET VALUES ----------
//     const netLoanForLender = approved - subvention;

//     const retentionAmount = safeManualRetentionAmount
//       ? +safeManualRetentionAmount.toFixed(2)
//       : safeRetentionPercent
//         ? +(netLoanForLender * safeRetentionPercent).toFixed(2)
//         : 0;

//     const netDisbursement = +(netLoanForLender - retentionAmount).toFixed(2);

//     // ---------- EMI (FLAT) ----------
//     const emiAmount = +(
//       approved / tenureMonths +
//       (approved * (Number(interestRate || 0) / 100)) / tenureMonths
//     ).toFixed(2);

//     // ---------- NET PRINCIPAL O/S ----------
//     const netPrincipalOS = +(netDisbursement - emiAmount).toFixed(2);

//     // ---------- CASHFLOWS ----------
//     const normalEmis = tenureMonths - advEmiCount;
//     if (normalEmis <= 0) {
//       throw new Error(
//         `Invalid normalEmis=${normalEmis} for LAN=${lan}. tenure=${tenureMonths}, adv=${advEmiCount}`,
//       );
//     }

//     const lastEmi = +(emiAmount - retentionAmount).toFixed(2);

//     const cashflows = [-netPrincipalOS];
//     for (let i = 1; i <= normalEmis - 1; i++) cashflows.push(emiAmount);
//     cashflows.push(lastEmi);

//     // ---------- IRR ----------
//     const monthlyIRR = calculateIRR(cashflows);
//     const annualIRR = +(monthlyIRR * 12 * 100).toFixed(2);

//     // ---------- RPS ----------
//     let openingBal = netPrincipalOS;
//     const rpsData = [];

//     // ---------- ADVANCE EMI ----------
//     if (advEmiCount > 0) {
//       rpsData.push([
//         lan,
//         toISO(disb, "disbursementDate"),
//         "Pending",
//         emiAmount,
//         0,
//         emiAmount,
//         +(netPrincipalOS + emiAmount).toFixed(2),
//         netPrincipalOS,
//         emiAmount,
//         0,
//         emiAmount,
//         emiAmount,
//       ]);
//     }

//     // ---------- NORMAL EMIs ----------
//     for (let i = 1; i <= normalEmis - 1; i++) {
//       const interest = +(openingBal * monthlyIRR).toFixed(2);
//       const principal = +(emiAmount - interest).toFixed(2);
//       const closingBal = +(openingBal - principal).toFixed(2);

//       const dueDate = addMonthsWithEmiDate(disb, i, emiDate);
//       if (!dueDate) {
//         throw new Error(`Could not compute dueDate for LAN=${lan}, i=${i}`);
//       }

//       rpsData.push([
//         lan,
//         toISO(dueDate, "dueDate"),
//         "Pending",
//         emiAmount,
//         interest,
//         principal,
//         openingBal,
//         closingBal,
//         emiAmount,
//         interest,
//         principal,
//         emiAmount,
//       ]);

//       openingBal = closingBal;
//     }

//     // ---------- LAST EMI (RETENTION ADJUSTED) ----------
//     const lastInterest = +(openingBal * monthlyIRR).toFixed(2);
//     const lastPrincipal = +(lastEmi - lastInterest).toFixed(2);
//     const lastClosing = +(openingBal - lastPrincipal).toFixed(2);

//     const lastDueDate = addMonthsWithEmiDate(disb, normalEmis, emiDate);
//     if (!lastDueDate) {
//       throw new Error(`Could not compute lastDueDate for LAN=${lan}`);
//     }

//     rpsData.push([
//       lan,
//       toISO(lastDueDate, "lastDueDate"),
//       "Pending",
//       lastEmi,
//       lastInterest,
//       lastPrincipal,
//       openingBal,
//       lastClosing,
//        lastEmi,
//   lastInterest,
//   lastPrincipal,
//   lastEmi,
//     ]);

//     // ---------- DB INSERT ----------
//     if (rpsData.length > 0) {
//       // Optional safety: remove old schedule
//       await db
//         .promise()
//         .query("DELETE FROM manual_rps_gq_fsf_fintree WHERE lan = ?", [lan]);

//       const insertSql = `
//         INSERT INTO manual_rps_gq_fsf_fintree
//         (
//           lan,
//           due_date,
//           status,
//           emi,
//           interest,
//           principal,
//           opening,
//           closing,
//           remaining_emi,
//           remaining_interest,
//           remaining_principal,
//           remaining_amount
//         )
//         VALUES ?
//       `;

//       await db.promise().query(insertSql, [rpsData]);
//     }

//     // ---------- RETURN ----------
//     return {
//       lan,
//       emiAmount,
//       netDisbursement,
//       netPrincipalOS,
//       retentionAmount,
//       monthlyIRR,
//       annualIRR,
//       cashflows,
//     };
//   } catch (err) {
//     console.error("❌ RPS ERROR (GQFSF_Fintree):", err);
//     throw err;
//   }
// };





///////////////////////// GQ FSF FINTREE RPS Sajag New End ////////////////////////////



//////////// CLAYOO LOAN CALCULATION - BULLET STRUCTURE (NO EMI, INTEREST ONLY AT END) ////////////////////////////


const generateRepaymentScheduleClayoo = async (
  conn,
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
) => {


  // Convert interest rate to decimal
  const annualRate = interestRate / 100;


console.log("disbursement dtae", disbursementDate);
  // Convert input dates
  const disbDate = new Date(disbursementDate);
  console.log("Parsed disbursementDate:", disbDate);
  const payDate = new Date(disbDate);
  payDate.setDate(payDate.getDate() + tenure); // paymentDate is disbursementDate + 90 days
  console.log("paydate means duedate", payDate);

  // Validate dates
  if (
    Number.isNaN(disbDate.getTime()) ||
    Number.isNaN(payDate.getTime())
  ) {
    throw new Error("Invalid disbursementDate or paymentDate");
  }

  /**
   * STEP 1: Calculate total loan usage days
   */
  const totalDays = Math.ceil(
    (payDate - disbDate) / (1000 * 60 * 60 * 24)
  );

  /**
   * STEP 2: Apply 90-day grace period
   * Interest starts only AFTER 90 days
   */
  const graceEndDate = new Date(disbDate);
  graceEndDate.setDate(graceEndDate.getDate() + 90);

  /**
   * STEP 3: Calculate interest-bearing days
   */
  const interestDays = Math.max(
    0,
    Math.ceil((payDate - graceEndDate) / (1000 * 60 * 60 * 24))
  );

  console.log("Total loan usage days:", totalDays);
  console.log("Interest-bearing days after 90-day grace:", interestDays);

  /**
   * STEP 4: Interest calculation (365-day basis)
   */
  const totalInterest = Math.ceil(
    (loanAmount * annualRate * interestDays) / 365
  );

  /**
   * STEP 5: Bullet repayment amount
   */
  const emi = loanAmount + totalInterest;

  /**
   * STEP 6: Prepare RPS row
   * Single repayment entry (bullet loan structure)
   */
  const rpsData = [[
    lan,
    payDate.toISOString().split("T")[0], // due_date
    emi,
    totalInterest,
    loanAmount,
    loanAmount,
    totalInterest,
    emi,
    "Pending"
  ]];

  /**
   * STEP 7: Insert into Clayoo RPS table
   */
  await conn.query(
    `INSERT INTO manual_rps_clayoo
     (lan, due_date, emi, interest, principal,
      remaining_principal, remaining_interest,
      remaining_emi, status)
     VALUES ?`,
    [rpsData]
  );

  /**
   * STEP 8: Update EMI amount in Clayoo loan booking table
   */
  await conn.query(
    `UPDATE loan_booking_clayyo
     SET emi_amount = ?
     WHERE lan = ?`,
    [emi, lan]
  );

  console.log(
    `✅ Clayoo RPS generated successfully for ${lan}
     Total Days: ${totalDays},
     Interest Days: ${interestDays},
     Interest: ${totalInterest},
     Payable Amount: ${emi}`
  );
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
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
  product,
  lender,
) => {
  try {
    const annualRate = interestRate / 100;
    let remainingPrincipal = loanAmount;

    const emi = Math.round(
      (loanAmount * (annualRate / 12) * Math.pow(1 + annualRate / 12, tenure)) /
        (Math.pow(1 + annualRate / 12, tenure) - 1),
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
      [rpsData],
    );

    await db.promise().query(
      `UPDATE loan_booking_embifi
         SET emi_amount = ?
       WHERE lan = ?`,
      [emi, lan],
    );

    console.log(`✅ Embifi RPS generated from next month for ${lan}`);
  } catch (err) {
    console.error(`❌ Embifi RPS Error for ${lan}:`, err);
  }
};

// const generateRepaymentScheduleFinso360 = async (
//   conn,
//   lan,
//   loanAmount,
//   interestRate,
//   tenure,
//   disbursementDate,
//   product,
//   lender,
// ) => {
//   try {
//     // validate / normalize
//     if (!lan) throw new Error("lan is required");
//     const P = Number(loanAmount);
//     if (!P || isNaN(P)) throw new Error("invalid loanAmount");
//     const n = Number(tenure);
//     if (!n || isNaN(n) || n <= 0) throw new Error("invalid tenure (days)");
//     let annualRate = Number(interestRate || 0);
//     if (annualRate > 1) annualRate = annualRate / 100.0; // accept 24 or 0.24

//     // 360-day basis
//     const dayCount = 360;
//     const dailyRate = annualRate / dayCount;

//     // daily annuity EMI A = P * r * (1+r)^n / ((1+r)^n - 1)
//     let dailyEmi;
//     if (dailyRate === 0) {
//       dailyEmi = Math.round(P / n);
//     } else {
//       const powv = Math.pow(1 + dailyRate, n);
//       dailyEmi = Math.round((P * dailyRate * powv) / (powv - 1));
//     }

//     // local helpers
//     const addDays = (d, days) => {
//       const tmp = new Date(d);
//       tmp.setDate(tmp.getDate() + days);
//       return tmp;
//     };
//     const fmt = (d) => d.toISOString().split("T")[0];

//     // prepare rows
//     const disb = new Date(disbursementDate);
//     if (isNaN(disb.getTime())) throw new Error("invalid disbursementDate");
//     let dueDate = addDays(disb, 1);
//     let remainingPrincipal = P;
//     const rows = [];

//     for (let i = 1; i <= n; i++) {
//       // interest per-day (360), rounded up
//       const interest =
//         Math.ceil((remainingPrincipal * annualRate * 1) / dayCount) || 0;
//       let principal = dailyEmi - interest;

//       // last installment: flush remainder
//       if (i === n) principal = remainingPrincipal;

//       const nextRemainingPrincipal = Math.max(
//         remainingPrincipal - principal,
//         0,
//       );
//       const remainingInterest = Math.max(interest * (n - i), 0);

//       rows.push([
//         lan,
//         fmt(dueDate),
//         dailyEmi,
//         interest,
//         principal,
//         principal,
//         interest,
//         dailyEmi,
//         "Pending",
//       ]);

//       remainingPrincipal = nextRemainingPrincipal;
//       dueDate = addDays(dueDate, 1);
//     }

//     // DB insert with transaction and chunking
//     conn = await db.promise().getConnection();
//     await conn.beginTransaction();

//     const CHUNK = 800;
//     for (let i = 0; i < rows.length; i += CHUNK) {
//       const chunk = rows.slice(i, i + CHUNK);
//       await conn.query(
//         `INSERT INTO manual_rps_finso_loan
//           (lan, due_date, emi, interest, principal,
//            remaining_principal, remaining_interest, remaining_emi, status)
//          VALUES ?`,
//         [chunk],
//       );
//     }

//     // update loan_booking_finso with computed daily EMI
//     try {
//       await conn.query(
//         `UPDATE loan_booking_finso SET emi_amount = ? WHERE lan = ?`,
//         [dailyEmi, lan],
//       );
//     } catch (updErr) {
//       console.warn(
//         "Warning updating loan_booking_finso:",
//         updErr.message || updErr,
//       );
//     }

//     await conn.commit();
//     conn.release();

//     return {
//       success: true,
//       lan,
//       basis: 360,
//       rowsInserted: rows.length,
//       dailyEmi,
//       sampleFirstRow: rows[0],
//     };
//   } catch (err) {
//     console.error(`❌ FINSO RPS 360 Error for ${lan}:`, err);
//     if (conn) {
//       try {
//         await conn.rollback();
//         conn.release();
//       } catch (e) {}
//     }
//     return { success: false, error: err.message || String(err) };
//   }
// };

///////////////////////   RPS for FINSO 365 Days ///////////////////////////////////
// const generateRepaymentScheduleFinso365 = async (
//   conn,
//   lan,
//   loanAmount,
//   interestRate,
//   tenure,
//   disbursementDate,
//   product,
//   lender,
// ) => {
//   try {
//     // validate / normalize
//     if (!lan) throw new Error("lan is required");
//     const P = Number(loanAmount);
//     if (!P || isNaN(P)) throw new Error("invalid loanAmount");
//     const n = Number(tenure);
//     if (!n || isNaN(n) || n <= 0) throw new Error("invalid tenure (days)");
//     let annualRate = Number(interestRate || 0);
//     if (annualRate > 1) annualRate = annualRate / 100.0; // accept 24 or 0.24

//     // 365-day basis
//     const dayCount = 365;
//     const dailyRate = annualRate / dayCount;

//     // daily annuity EMI A = P * r * (1+r)^n / ((1+r)^n - 1)
//     let dailyEmi;
//     if (dailyRate === 0) {
//       dailyEmi = Math.round(P / n);
//     } else {
//       const powv = Math.pow(1 + dailyRate, n);
//       dailyEmi = Math.round((P * dailyRate * powv) / (powv - 1));
//     }

//     // local helpers
//     const addDays = (d, days) => {
//       const tmp = new Date(d);
//       tmp.setDate(tmp.getDate() + days);
//       return tmp;
//     };
//     const fmt = (d) => d.toISOString().split("T")[0];

//     // prepare rows
//     const disb = new Date(disbursementDate);
//     if (isNaN(disb.getTime())) throw new Error("invalid disbursementDate");
//     let dueDate = addDays(disb, 2);
//     let remainingPrincipal = P;
//     const rows = [];

//     for (let i = 1; i <= n; i++) {
//       // interest per-day (365), rounded up
//       const interest =
//         Math.ceil((remainingPrincipal * annualRate * 1) / dayCount) || 0;
//       let principal = dailyEmi - interest;

//       // last installment: flush remainder
//       if (i === n) principal = remainingPrincipal;

//       const nextRemainingPrincipal = Math.max(
//         remainingPrincipal - principal,
//         0,
//       );
//       const remainingInterest = Math.max(interest * (n - i), 0);

//       rows.push([
//         lan,
//         fmt(dueDate),
//         dailyEmi,
//         interest,
//         principal,
//         principal,
//         interest,
//         dailyEmi,
//         "Pending",
//       ]);

//       remainingPrincipal = nextRemainingPrincipal;
//       dueDate = addDays(dueDate, 1);
//     }

//     // DB insert with transaction and chunking
//     conn = await db.promise().getConnection();
//     await conn.beginTransaction();

//     const CHUNK = 800;
//     for (let i = 0; i < rows.length; i += CHUNK) {
//       const chunk = rows.slice(i, i + CHUNK);
//       await conn.query(
//         `INSERT INTO manual_rps_finso_loan
//           (lan, due_date, emi, interest, principal,
//            remaining_principal, remaining_interest, remaining_emi, status)
//          VALUES ?`,
//         [chunk],
//       );
//     }

//     // update loan_booking_finso with computed daily EMI
//     try {
//       await conn.query(
//         `UPDATE loan_booking_finso SET emi_amount = ? WHERE lan = ?`,
//         [dailyEmi, lan],
//       );
//     } catch (updErr) {
//       console.warn(
//         "Warning updating loan_booking_finso:",
//         updErr.message || updErr,
//       );
//     }

//     await conn.commit();
//     conn.release();

//     return {
//       success: true,
//       lan,
//       basis: 365,
//       rowsInserted: rows.length,
//       dailyEmi,
//       sampleFirstRow: rows[0],
//     };
//   } catch (err) {
//     console.error(`❌ FINSO RPS 365 Error for ${lan}:`, err);
//     if (conn) {
//       try {
//         await conn.rollback();
//         conn.release();
//       } catch (e) {}
//     }
//     return { success: false, error: err.message || String(err) };
//   }
// };

const generateRepaymentScheduleFinso365 = async (
  conn,
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
  product,
  lender,
) => {
  let localConn = conn;
  let ownConnection = false;

  try {
    if (!lan) throw new Error("lan is required");

    const round2 = (num) =>
      Math.round((Number(num) + Number.EPSILON) * 100) / 100;

    const toNumber = (value, defaultValue = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : defaultValue;
    };

    const addDays = (d, days) => {
      const tmp = new Date(d);
      tmp.setDate(tmp.getDate() + days);
      return tmp;
    };

    const fmt = (d) => {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return null;
      return dt.toISOString().split("T")[0];
    };

    // -------------------------------
    // 1. Validate values
    // -------------------------------

    const P = round2(toNumber(loanAmount));

    if (!P || P <= 0) {
      throw new Error("invalid loanAmount");
    }

    let n = Math.round(toNumber(tenure));

    // Important safety because your log showed tenure = 50000
    if (!n || n <= 0 || n > 366) {
      console.warn("⚠️ Invalid Finso tenure received. Resetting to 365.", {
        lan,
        receivedTenure: tenure,
        loanAmount,
        product,
        lender,
      });

      n = 365;
    }

    let annualRate = toNumber(interestRate);

    // Accept both 31 and 0.31
    if (annualRate > 1) {
      annualRate = annualRate / 100;
    }

    if (annualRate < 0 || isNaN(annualRate)) {
      throw new Error("invalid interestRate");
    }

    const disb = new Date(disbursementDate);

    if (isNaN(disb.getTime())) {
      throw new Error("invalid disbursementDate");
    }

    // -------------------------------
    // 2. EMI calculation - 365 day basis
    // -------------------------------

    const dayCount = 365;
    const dailyRate = annualRate / dayCount;

    let regularDailyEmi;

    if (dailyRate === 0) {
      regularDailyEmi = round2(P / n);
    } else {
      const powv = Math.pow(1 + dailyRate, n);

      regularDailyEmi = round2(
        (P * dailyRate * powv) / (powv - 1),
      );
    }

    if (!regularDailyEmi || regularDailyEmi <= 0 || isNaN(regularDailyEmi)) {
      throw new Error("invalid calculated daily EMI");
    }

    // -------------------------------
    // 3. Generate schedule
    // -------------------------------

    let dueDate = addDays(disb, 2);
    let remainingPrincipal = P;

    const schedule = [];

    for (let i = 1; i <= n; i++) {
      const opening = round2(remainingPrincipal);

      let interest = round2(opening * dailyRate);
      let principal = round2(regularDailyEmi - interest);
      let actualEmi = regularDailyEmi;

      if (principal <= 0 && i !== n) {
        throw new Error(
          `Invalid RPS at row ${i}; interest is greater than or equal to EMI`,
        );
      }

      // Final row adjustment to close loan exactly
      if (i === n) {
        principal = round2(opening);
        actualEmi = round2(principal + interest);
      }

      if (principal > opening) {
        principal = opening;
        actualEmi = round2(principal + interest);
      }

      let closing = round2(opening - principal);

      if (i === n || closing < 0.01) {
        closing = 0;
      }

      schedule.push({
        emiNo: i,
        lan,
        dueDate: fmt(dueDate),
        status: "Pending",

        emi: actualEmi,
        interest,
        principal,

        opening,
        closing,

        remainingPrincipal: closing,
        remainingAmount: actualEmi,
      });

      remainingPrincipal = closing;
      dueDate = addDays(dueDate, 1);
    }

    // -------------------------------
    // 4. Calculate remaining interest and remaining EMI
    // -------------------------------

    let futureInterest = 0;

    for (let i = schedule.length - 1; i >= 0; i--) {
      const r = schedule[i];

      // Future pending interest after this row
      r.remainingInterest = round2(futureInterest);

      // Since DB column is INT, store remaining EMI count
      r.remainingEmi = n - r.emiNo;

      futureInterest = round2(futureInterest + r.interest);
    }

    // -------------------------------
    // 5. Prepare insert rows
    // -------------------------------

    const rows = schedule.map((r) => [
      r.lan,
      r.dueDate,
      r.status,
      r.emi,
      r.interest,
      r.principal,
      r.opening,
      r.closing,
      r.emi,
      r.interest,
      r.principal,
      r.remainingAmount,
    ]);

    // -------------------------------
    // 6. DB insert
    // -------------------------------

    if (!localConn) {
      localConn = await db.promise().getConnection();
      ownConnection = true;
      await localConn.beginTransaction();
    }

    // Avoid duplicate RPS rows for same LAN
    await localConn.query(
      `DELETE FROM manual_rps_finso_loan WHERE lan = ?`,
      [lan],
    );

    const CHUNK = 800;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);

      await localConn.query(
        `
        INSERT INTO manual_rps_finso_loan
          (
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
        [chunk],
      );
    }

    await localConn.query(
      `
      UPDATE loan_booking_finso
      SET emi_amount = ?
      WHERE lan = ?
      `,
      [regularDailyEmi, lan],
    );

    if (ownConnection) {
      await localConn.commit();
      localConn.release();
    }

    const totalPrincipal = round2(
      schedule.reduce((sum, r) => sum + r.principal, 0),
    );

    const totalInterest = round2(
      schedule.reduce((sum, r) => sum + r.interest, 0),
    );

    const totalPayable = round2(
      schedule.reduce((sum, r) => sum + r.emi, 0),
    );

    console.log(`✅ FINSO RPS 365 generated for ${lan}`, {
      rowsInserted: rows.length,
      regularDailyEmi,
      totalPrincipal,
      totalInterest,
      totalPayable,
      finalClosingPrincipal: schedule[schedule.length - 1]?.closing,
    });

    return {
      success: true,
      lan,
      basis: 365,
      rowsInserted: rows.length,
      dailyEmi: regularDailyEmi,
      totalPrincipal,
      totalInterest,
      totalPayable,
      finalClosingPrincipal: schedule[schedule.length - 1]?.closing || 0,
      sampleFirstRow: rows[0],
      sampleLastRow: rows[rows.length - 1],
    };
  } catch (err) {
    console.error(`❌ FINSO RPS 365 Error for ${lan}:`, err);

    if (ownConnection && localConn) {
      try {
        await localConn.rollback();
      } catch (e) {}

      try {
        localConn.release();
      } catch (e) {}
    }

    return {
      success: false,
      lan,
      error: err.message || String(err),
    };
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
  interestRate, // annual % (e.g., 24 => 24% p.a.)
  tenure, // months
  disbursementDate, // "YYYY-MM-DD"
  salaryDay, // integer day-of-month for first EMI alignment
) => {
  try {
    const firstDueDate = getFirstEmiDate(
      disbursementDate,
      null,
      "Adikosh",
      "Adikosh",
      0,
      salaryDay,
    );

    console.log({
      lan,
      loanAmount,
      interestRate,
      tenure,
      salaryDay,
      firstDueDate,
    });

    const tables = [
      {
        name: "manual_rps_adikosh",
        factor: 1.0,
        customRate: null,
        hasOC: true,
      },
      {
        name: "manual_rps_adikosh_fintree",
        factor: 0.8,
        customRate: 21.5,
        hasOC: false,
      },
      {
        name: "manual_rps_adikosh_partner",
        factor: 0.2,
        customRate: null,
        hasOC: false,
      },
    ];

    for (const table of tables) {
      const rpsData = [];
      const baseAmount = loanAmount * table.factor;
      const annualRate = (table.customRate ?? interestRate) / 100; // e.g., 24 => 0.24
      const monthlyRate = annualRate / 12;

      let openingPrincipal = fmt2(baseAmount);
      let dueDate = new Date(firstDueDate);

      // EMI is fixed for all periods
      const baseEmi = Math.ceil(
        (baseAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
          (Math.pow(1 + monthlyRate, tenure) - 1),
      );

      for (let i = 1; i <= tenure; i++) {
        const opening = fmt2(openingPrincipal);

        // Default month: 30/360 interest on opening
        let interest = Math.round((opening * annualRate * 30) / 360);
        let emi = baseEmi;
        let principal = emi - interest;

        // LAST INSTALLMENT: keep EMI constant; clear residue in principal, adjust interest
        if (i === tenure) {
          principal = Math.round(opening);
          interest = emi - principal;
          if (interest < 0) {
            // safety guard (very unlikely)
            interest = 0;
            principal = emi;
          }
        }

        const closing = fmt2(Math.max(opening - principal, 0));

        // Column meanings:
        const remainingAmountField = fmt2(emi); // period EMI
        const remainingPrincipalField = fmt2(principal); // period principal only
        const remainingInterestField = fmt2(interest); // period interest only
        const remainingEmiAmount =
          remainingPrincipalField + remainingInterestField; // count of EMIs left

        if (table.hasOC) {
          // MAIN TABLE (has opening/closing/remaining_amount)
          rpsData.push([
            lan,
            dueDate.toISOString().split("T")[0],
            fmt2(emi), // emi
            fmt2(interest), // interest (period)
            fmt2(principal), // principal (period)
            opening, // opening
            closing, // closing
            remainingEmiAmount, // remaining_emi (count)
            remainingAmountField, // remaining_amount (EMI of period)
            remainingPrincipalField, // remaining_principal (period principal)
            remainingInterestField, // remaining_interest  (period interest)
            "Pending",
          ]);
        } else {
          // SPLIT TABLES (no opening/closing/remaining_amount)
          rpsData.push([
            lan,
            dueDate.toISOString().split("T")[0],
            fmt2(emi), // emi
            fmt2(interest), // interest (period)
            fmt2(principal), // principal (period)
            remainingPrincipalField, // remaining_principal (period principal)
            remainingInterestField, // remaining_interest  (period interest)
            remainingEmiAmount, // remaining_emi (Amount)
            "Pending",
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
          [rpsData],
        );
      } else {
        await db.promise().query(
          `INSERT INTO ${table.name}
           (lan, due_date, emi, interest, principal,
            remaining_principal, remaining_interest, remaining_emi, status)
           VALUES ?`,
          [rpsData],
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
      [lan],
    );

    const fintreeRoiData = [];
    for (const row of mainRows) {
      const scaledPrincipal = Math.round(row.principal * 0.8);
      const scaledInterest = Math.round(row.interest * 0.8 * (21.5 / 33));
      const roiEmi = scaledPrincipal + scaledInterest;

      fintreeRoiData.push([
        lan,
        row.due_date,
        fmt2(roiEmi),
        fmt2(scaledInterest),
        fmt2(scaledPrincipal),
        fmt2(scaledPrincipal), // remaining_principal = period principal (scaled)
        fmt2(scaledInterest), // remaining_interest  = period interest  (scaled)
        0, // remaining_emi (set if you need)
        "Pending",
      ]);
    }

    await db.promise().query(
      `INSERT INTO manual_rps_adikosh_fintree_roi
       (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
       VALUES ?`,
      [fintreeRoiData],
    );

    console.log(`✅ manual_rps_adikosh_fintree_roi generated for ${lan}`);
  } catch (err) {
    console.error(`❌ Adikosh RPS Error for ${lan}:`, err);
    throw err;
  }
};

////////////////////////ADIKOSH END //////////////////////////////////

///////////////// Motion corp RPS Start /////////////////////////

const generateRepaymentScheduleMotionCorp = async (
  conn,
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
) => {
  console.log("inside MotionCorp RPS generate final");

  // =====================================================
  // HELPERS
  // =====================================================

  const toFiniteNumber = (value, fieldName) => {
    const num = Number(value);

    if (!Number.isFinite(num)) {
      throw new Error(
        `Invalid ${fieldName} for LAN ${lan}: ${value}`
      );
    }

    return num;
  };

  const round2 = (value, fieldName = "value") => {
    const num = Number(value);

    if (!Number.isFinite(num)) {
      throw new Error(
        `Invalid numeric ${fieldName} for LAN ${lan}: ${value}`
      );
    }

    return Number(num.toFixed(2));
  };

  // Whole number round for EMI, interest, principal
  const round0 = (value, fieldName = "value") => {
    const num = Number(value);

    if (!Number.isFinite(num)) {
      throw new Error(
        `Invalid numeric ${fieldName} for LAN ${lan}: ${value}`
      );
    }

    return Math.round(num);
  };

  const validateRpsNumber = (value, fieldName, emiNo) => {
    const num = Number(value);

    if (!Number.isFinite(num)) {
      throw new Error(
        `Invalid RPS ${fieldName} for LAN ${lan}, EMI No ${emiNo}: ${value}`
      );
    }

    return num;
  };

  // =====================================================
  // INPUTS
  // =====================================================

  const principal = round0(
    toFiniteNumber(loanAmount, "loanAmount"),
    "loanAmount"
  );

  const flatRate = toFiniteNumber(interestRate, "interestRate");
  const months = toFiniteNumber(tenure, "tenure");

  const disbDate = new Date(disbursementDate);

  if (
    principal <= 0 ||
    flatRate <= 0 ||
    months <= 0 ||
    !Number.isInteger(months) ||
    Number.isNaN(disbDate.getTime())
  ) {
    throw new Error(
      `Invalid inputs for LAN ${lan}: loanAmount=${loanAmount}, interestRate=${interestRate}, tenure=${tenure}, disbursementDate=${disbursementDate}`
    );
  }

  // =====================================================
  // STEP 1 : FLAT INTEREST
  // =====================================================

  const totalFlatInterest = round0(
    principal * (flatRate / 100) * (months / 12),
    "totalFlatInterest"
  );

  // =====================================================
  // STEP 2 : TOTAL REPAYMENT
  // =====================================================

  const totalRepayment = round0(
    principal + totalFlatInterest,
    "totalRepayment"
  );

  // =====================================================
  // STEP 3 : EMI - ROUNDED
  // =====================================================

  const emi = round0(
    totalRepayment / months,
    "emi"
  );

  // =====================================================
  // STEP 4 : FIRST EMI DATE
  // =====================================================

  const firstDueRaw = getFirstEmiDate(
    disbDate,
    null,
    "Motion Corp",
    "Monthly Loan",
  );

  const firstDueDate = new Date(firstDueRaw);

  if (Number.isNaN(firstDueDate.getTime())) {
    throw new Error(
      `Invalid MotionCorp first due date for LAN ${lan}: ${firstDueRaw}`
    );
  }

  // =====================================================
  // STEP 5 : PRE EMI DAYS
  // =====================================================
  
  const diffTime =
    firstDueDate.getTime() -
    disbDate.getTime();

  const preEmiDays = Math.ceil(
    diffTime / (1000 * 60 * 60 * 24)
  );

  if (!Number.isFinite(preEmiDays) || preEmiDays < 0) {
    throw new Error(
      `Invalid preEmiDays for LAN ${lan}: ${preEmiDays}`
    );
  }

  // =====================================================
  // STEP 6 : PRE EMI INTEREST - ROUNDED
  // =====================================================

  const preEmiInterest = round0(
    principal * (flatRate / 100) * (preEmiDays / 360),
    "preEmiInterest"
  );

  // =====================================================
  // STEP 7 : REDUCING ROI
  // =====================================================

  const calculateReducingMonthlyRate = (
    principalAmount,
    monthlyEmi,
    totalMonths
  ) => {
    const pmt = (rate) => {
      if (Math.abs(rate) < 1e-12) {
        return principalAmount / totalMonths;
      }

      const pow = Math.pow(1 + rate, totalMonths);

      return (
        principalAmount *
        rate *
        pow
      ) / (
        pow - 1
      );
    };

    const minEmi = principalAmount / totalMonths;

    if (monthlyEmi <= minEmi) {
      return 0;
    }

    let low = 0;
    let high = 0.01;

    while (pmt(high) < monthlyEmi && high < 10) {
      high *= 2;
    }

    if (!Number.isFinite(high) || pmt(high) < monthlyEmi) {
      throw new Error(
        `Unable to calculate reducing ROI for LAN ${lan}: principal=${principalAmount}, emi=${monthlyEmi}, months=${totalMonths}`
      );
    }

    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      const midPmt = pmt(mid);

      if (midPmt < monthlyEmi) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return (low + high) / 2;
  };

  const reducingMonthlyRate = calculateReducingMonthlyRate(
    principal,
    emi,
    months
  );

  const reducingAnnualRate = round2(
    reducingMonthlyRate * 12 * 100,
    "reducingAnnualRate"
  );

  // =====================================================
  // STEP 8 : GENERATE RPS
  // EMI, INTEREST, PRINCIPAL ALL ROUNDED
  // =====================================================

  let openingPrincipal = principal;
  let dueDate = new Date(firstDueDate);

  const rpsData = [];

  for (let i = 1; i <= months; i++) {
    let interest = round0(
      openingPrincipal * reducingMonthlyRate,
      `interest EMI ${i}`
    );

    let principalComponent = round0(
      emi - interest,
      `principal EMI ${i}`
    );

    let installmentEmi = emi;

    // Last EMI adjustment to close loan cleanly
    if (i === months) {
      principalComponent = round0(
        openingPrincipal,
        `last principal EMI ${i}`
      );

      installmentEmi = round0(
        principalComponent + interest,
        `last EMI ${i}`
      );
    }

    const closingPrincipal = round0(
      Math.max(0, openingPrincipal - principalComponent),
      `closing EMI ${i}`
    );

    rpsData.push({
      emi_no: i,

      due_date: dueDate
        .toISOString()
        .split("T")[0],

      opening: openingPrincipal,

      emi: installmentEmi,

      interest,

      principal: principalComponent,

      closing: closingPrincipal,

      status: "Pending",
    });

    openingPrincipal = closingPrincipal;

    dueDate.setMonth(
      dueDate.getMonth() + 1
    );
  }

  // =====================================================
  // STEP 9 : INSERT RPS
  // =====================================================

  const insertData = rpsData.map((row) => {
    const emiValue = validateRpsNumber(
      row.emi,
      "emi",
      row.emi_no
    );

    const interestValue = validateRpsNumber(
      row.interest,
      "interest",
      row.emi_no
    );

    const principalValue = validateRpsNumber(
      row.principal,
      "principal",
      row.emi_no
    );

    const openingValue = validateRpsNumber(
      row.opening,
      "opening",
      row.emi_no
    );

    const closingValue = validateRpsNumber(
      row.closing,
      "closing",
      row.emi_no
    );

    return [
      lan,
      row.due_date,
      row.status || "Pending",

      emiValue,
      interestValue,
      principalValue,
      openingValue,
      closingValue,

      emiValue,          // remaining_emi
      interestValue,     // remaining_interest
      principalValue,    // remaining_principal
      emiValue,          // remaining_amount
    ];
  });

  await conn.query(
    `
    INSERT INTO manual_rps_motioncorp
    (
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
    [insertData]
  );

  // =====================================================
  // STEP 10 : UPDATE MAIN TABLE
  // =====================================================

  await conn.query(
    `
    UPDATE loan_booking_motion_corp
    SET
      emi_amount = ?,
      reducing_roi = ?,
      flat_interest = ?,
      pre_emi_interest = ?,
      total_repayment = ?
    WHERE lan = ?
    `,
    [
      emi,
      reducingAnnualRate,
      totalFlatInterest,
      preEmiInterest,
      round0(totalRepayment + preEmiInterest, "finalTotalRepayment"),
      lan,
    ]
  );

  // =====================================================
  // FINAL RESPONSE
  // =====================================================

  return {
    principal,
    flatRate,
    months,
    emi,
    totalFlatInterest,
    preEmiInterest,

    totalRepayment: round0(
      totalRepayment + preEmiInterest,
      "returnTotalRepayment"
    ),

    reducingAnnualRate,

    firstDueDate: firstDueDate
      .toISOString()
      .split("T")[0],

    preEmiDays,

    rpsData,
  };
};




const generateRepaymentScheduleSrbh = async (
  conn,
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
) => {
  console.log("inside SRBH RPS generate final");

  // =====================================================
  // HELPERS
  // =====================================================

  const toFiniteNumber = (value, fieldName) => {
    const num = Number(value);

    if (!Number.isFinite(num)) {
      throw new Error(
        `Invalid ${fieldName} for LAN ${lan}: ${value}`
      );
    }

    return num;
  };

  const round2 = (value, fieldName = "value") => {
    const num = Number(value);

    if (!Number.isFinite(num)) {
      throw new Error(
        `Invalid numeric ${fieldName} for LAN ${lan}: ${value}`
      );
    }

    return Number(num.toFixed(2));
  };

  // Whole number round for EMI, interest, principal
  const round0 = (value, fieldName = "value") => {
    const num = Number(value);

    if (!Number.isFinite(num)) {
      throw new Error(
        `Invalid numeric ${fieldName} for LAN ${lan}: ${value}`
      );
    }

    return Math.round(num);
  };

  const validateRpsNumber = (value, fieldName, emiNo) => {
    const num = Number(value);

    if (!Number.isFinite(num)) {
      throw new Error(
        `Invalid RPS ${fieldName} for LAN ${lan}, EMI No ${emiNo}: ${value}`
      );
    }

    return num;
  };

  // =====================================================
  // INPUTS
  // =====================================================

  const principal = round0(
    toFiniteNumber(loanAmount, "loanAmount"),
    "loanAmount"
  );

  const flatRate = toFiniteNumber(interestRate, "interestRate");
  const months = toFiniteNumber(tenure, "tenure");

  const disbDate = new Date(disbursementDate);

  if (
    principal <= 0 ||
    flatRate <= 0 ||
    months <= 0 ||
    !Number.isInteger(months) ||
    Number.isNaN(disbDate.getTime())
  ) {
    throw new Error(
      `Invalid inputs for LAN ${lan}: loanAmount=${loanAmount}, interestRate=${interestRate}, tenure=${tenure}, disbursementDate=${disbursementDate}`
    );
  }

  // =====================================================
  // STEP 1 : FLAT INTEREST
  // =====================================================

  const totalFlatInterest = round0(
    principal * (flatRate / 100) * (months / 12),
    "totalFlatInterest"
  );

  // =====================================================
  // STEP 2 : TOTAL REPAYMENT
  // =====================================================

  const totalRepayment = round0(
    principal + totalFlatInterest,
    "totalRepayment"
  );

  // =====================================================
  // STEP 3 : EMI - ROUNDED
  // =====================================================

  const emi = round0(
    totalRepayment / months,
    "emi"
  );

  // =====================================================
  // STEP 4 : FIRST EMI DATE
  // =====================================================

  const firstDueRaw = getFirstEmiDate(
    disbDate,
    null,
    "SRBH",
    "Monthly Loan",
  );

  const firstDueDate = new Date(firstDueRaw);

  if (Number.isNaN(firstDueDate.getTime())) {
    throw new Error(
      `Invalid SRBH first due date for LAN ${lan}: ${firstDueRaw}`
    );
  }

  // =====================================================
  // STEP 5 : PRE EMI DAYS
  // =====================================================
  
  const diffTime =
    firstDueDate.getTime() -
    disbDate.getTime();

  const preEmiDays = Math.ceil(
    diffTime / (1000 * 60 * 60 * 24)
  );

  if (!Number.isFinite(preEmiDays) || preEmiDays < 0) {
    throw new Error(
      `Invalid preEmiDays for LAN ${lan}: ${preEmiDays}`
    );
  }

  // =====================================================
  // STEP 6 : PRE EMI INTEREST - ROUNDED
  // =====================================================

  const preEmiInterest = round0(
    principal * (flatRate / 100) * (preEmiDays / 360),
    "preEmiInterest"
  );

  // =====================================================
  // STEP 7 : REDUCING ROI
  // =====================================================

  const calculateReducingMonthlyRate = (
    principalAmount,
    monthlyEmi,
    totalMonths
  ) => {
    const pmt = (rate) => {
      if (Math.abs(rate) < 1e-12) {
        return principalAmount / totalMonths;
      }

      const pow = Math.pow(1 + rate, totalMonths);

      return (
        principalAmount *
        rate *
        pow
      ) / (
        pow - 1
      );
    };

    const minEmi = principalAmount / totalMonths;

    if (monthlyEmi <= minEmi) {
      return 0;
    }

    let low = 0;
    let high = 0.01;

    while (pmt(high) < monthlyEmi && high < 10) {
      high *= 2;
    }

    if (!Number.isFinite(high) || pmt(high) < monthlyEmi) {
      throw new Error(
        `Unable to calculate reducing ROI for LAN ${lan}: principal=${principalAmount}, emi=${monthlyEmi}, months=${totalMonths}`
      );
    }

    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      const midPmt = pmt(mid);

      if (midPmt < monthlyEmi) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return (low + high) / 2;
  };

  const reducingMonthlyRate = calculateReducingMonthlyRate(
    principal,
    emi,
    months
  );

  const reducingAnnualRate = round2(
    reducingMonthlyRate * 12 * 100,
    "reducingAnnualRate"
  );

  // =====================================================
  // STEP 8 : GENERATE RPS
  // EMI, INTEREST, PRINCIPAL ALL ROUNDED
  // =====================================================

  let openingPrincipal = principal;
  let dueDate = new Date(firstDueDate);

  const rpsData = [];

  for (let i = 1; i <= months; i++) {
    let interest = round0(
      openingPrincipal * reducingMonthlyRate,
      `interest EMI ${i}`
    );

    let principalComponent = round0(
      emi - interest,
      `principal EMI ${i}`
    );

    let installmentEmi = emi;

    // Last EMI adjustment to close loan cleanly
    if (i === months) {
      principalComponent = round0(
        openingPrincipal,
        `last principal EMI ${i}`
      );

      installmentEmi = round0(
        principalComponent + interest,
        `last EMI ${i}`
      );
    }

    const closingPrincipal = round0(
      Math.max(0, openingPrincipal - principalComponent),
      `closing EMI ${i}`
    );

    rpsData.push({
      emi_no: i,

      due_date: dueDate
        .toISOString()
        .split("T")[0],

      opening: openingPrincipal,

      emi: installmentEmi,

      interest,

      principal: principalComponent,

      closing: closingPrincipal,

      status: "Pending",
    });

    openingPrincipal = closingPrincipal;

    dueDate.setMonth(
      dueDate.getMonth() + 1
    );
  }

  // =====================================================
  // STEP 9 : INSERT RPS
  // =====================================================

  const insertData = rpsData.map((row) => {
    const emiValue = validateRpsNumber(
      row.emi,
      "emi",
      row.emi_no
    );

    const interestValue = validateRpsNumber(
      row.interest,
      "interest",
      row.emi_no
    );

    const principalValue = validateRpsNumber(
      row.principal,
      "principal",
      row.emi_no
    );

    const openingValue = validateRpsNumber(
      row.opening,
      "opening",
      row.emi_no
    );

    const closingValue = validateRpsNumber(
      row.closing,
      "closing",
      row.emi_no
    );

    return [
      lan,
      row.due_date,
      row.status || "Pending",

      emiValue,
      interestValue,
      principalValue,
      openingValue,
      closingValue,

      emiValue,          // remaining_emi
      interestValue,     // remaining_interest
      principalValue,    // remaining_principal
      emiValue,          // remaining_amount
    ];
  });

  await conn.query(
    `
    INSERT INTO manual_rps_srbh
    (
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
    [insertData]
  );

  // =====================================================
  // STEP 10 : UPDATE MAIN TABLE
  // =====================================================

  await conn.query(
    `
    UPDATE loan_booking_srbh
    SET
      emi_amount = ?,
      reducing_roi = ?,
      flat_interest = ?,
      pre_emi_interest = ?,
      total_repayment = ?
    WHERE lan = ?
    `,
    [
      emi,
      reducingAnnualRate,
      totalFlatInterest,
      preEmiInterest,
      round0(totalRepayment + preEmiInterest, "finalTotalRepayment"),
      lan,
    ]
  );

  // =====================================================
  // FINAL RESPONSE
  // =====================================================

  return {
    principal,
    flatRate,
    months,
    emi,
    totalFlatInterest,
    preEmiInterest,

    totalRepayment: round0(
      totalRepayment + preEmiInterest,
      "returnTotalRepayment"
    ),

    reducingAnnualRate,

    firstDueDate: firstDueDate
      .toISOString()
      .split("T")[0],

    preEmiDays,

    rpsData,
  };
};
/////////////// motion corp RPS End /////////////////////////

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
  conn,
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
  lender,
  retention_percentage,
  retention_amount,
  processingFee = 0,
) => {
  console.log("lender testing", lender);

 const safeProcessingFee = Number(processingFee ?? 0);

if (
  !Number.isFinite(safeProcessingFee) ||
  safeProcessingFee < 0
) {
  throw new Error(
    `Invalid processing fee for LAN ${lan}: ${processingFee}`,
  );
}

console.log("checking data", {
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
  lender,
  retention_percentage,
  retention_amount,
  processingFee,
  safeProcessingFee,
});

  // 🛡 HARD SAFETY (prevents ALL ReferenceErrors)
  const safeRetentionPercent = Number(retention_percentage || 0);
  const safeManualRetentionAmount = Number(retention_amount || 0);
  // ✅ Ensure disbursementDate is a valid Date object
  const disbDateObj =
    disbursementDate instanceof Date
      ? disbursementDate
      : new Date(disbursementDate);

  if (!disbDateObj || Number.isNaN(disbDateObj.getTime())) {
    throw new Error(
      `Invalid disbursementDate for LAN=${lan}. Received: ${JSON.stringify(disbursementDate)}`,
    );
  }

  if (lender === "BL Loan") {
    await generateRepaymentScheduleBL(
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
  } else if (lender === "EV Loan" && product.toLowerCase() === "monthly loan") {
    await generateRepaymentScheduleEV(
      conn,
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
      } else if(
    String(lender || "").trim().toUpperCase() ===
    "CAREPAY"
  ) {
    await generateRepaymentScheduleCarepay(
      conn,
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
      safeProcessingFee,
    );

  } else if (lender === "STERLION") {
    await generateRepaymentScheduleSterlion(
      conn,
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
  } else if (lender === "HEY EV Loan") {
    await generateRepaymentScheduleHEYEV(
      conn,
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
  } else if (lender === "HeyEV Battery") {
    await generateRepaymentScheduleHEYEVBattery(
      conn,
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
  } else if (lender === "Finso") {
    await generateRepaymentScheduleFinso365(
      conn,
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
  } else if (lender === "EMICLUB" && product === "Monthly Loan") {
    await generateRepaymentScheduleEmiclub(
      conn,
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
  } else if (lender === "ZYPAY" && product === "Monthly Loan") {
    await generateRepaymentScheduleZypay(
      conn,
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
  } else if (lender === "Circlepe") {
    await generateRepaymentScheduleCirclePE(
      conn,
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
  }
  else if(lender ==="circle pe houser"){
    await generateRepaymentScheduleCirclePeHouser(
      conn,
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
  }
  else if (lender === "CLAYOO") {
    await generateRepaymentScheduleClayoo(
      conn,
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
  } else if (lender === "LOAN-DIGIT") {
    await generateRepaymentScheduleLoanDigit(
      conn,
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
  } else if (lender === "GQ Non-FSF") {
    // === run generic GQ Non-FSF generator ===
    try {
      // coerce numeric-ish inputs and log
      const approvedAmountNum = Number(loanAmount);
      const interestRateNum = Number(interestRate);
      const tenureNum = Number(tenure);
      const noOfAdvanceNum = Number(no_of_advance_emis || 0);
      console.log("Calling generateRepaymentScheduleGQNonFSF with:", {
        lan,
        approvedAmount: approvedAmountNum,
        emiDate,
        interestRate: interestRateNum,
        tenure: tenureNum,
        disbursementDate,
        subventionAmount,
        product,
        lender,
        no_of_advance_emis: noOfAdvanceNum,
      });

      await generateRepaymentScheduleGQNonFSF(
        lan,
        approvedAmountNum,
        emiDate,
        interestRateNum,
        tenureNum,
        disbursementDate,
        subventionAmount,
        product,
        lender,
        noOfAdvanceNum,
      );
      console.log("✅ generateRepaymentScheduleGQNonFSF completed");
    } catch (err) {
      console.error("❌ generateRepaymentScheduleGQNonFSF failed:", err);
    }

    // === run Fintree variant ===
    try {
      // IMPORTANT: match the exact signature of generateRepaymentScheduleGQNonFSF_Fintree:
      // (lan, approvedAmount, emiDate, interestRate, tenure, disbursementDate, subventionAmount, product, lender, no_of_advance_emis = 1)
      const approvedAmountNum = Number(loanAmount);
      const interestRateNum = Number(interestRate);
      const tenureNum = Number(tenure);
      const noOfAdvanceNum = Number(no_of_advance_emis || 0);

      console.log("Calling generateRepaymentScheduleGQNonFSF_Fintree with:", {
        lan,
        approvedAmount: approvedAmountNum,
        emiDate,
        interestRate: interestRateNum,
        tenure: tenureNum,
        disbursementDate,
        subventionAmount,
        product,
        lender,
        no_of_advance_emis: noOfAdvanceNum,
      });

      await generateRepaymentScheduleGQNonFSF_Fintree(
        lan,
        approvedAmountNum, // approvedAmount
        emiDate, // emiDate (day)
        interestRateNum, // interestRate (annual %)
        tenureNum, // tenure (months)
        disbursementDate, // disbursementDate ("YYYY-MM-DD")
        subventionAmount, // subventionAmount
        product, // product
        lender, // lender
        noOfAdvanceNum, // no_of_advance_emis
      );

      console.log("✅ generateRepaymentScheduleGQNonFSF_Fintree completed");
    } catch (err) {
      console.error(
        "❌ generateRepaymentScheduleGQNonFSF_Fintree failed:",
        err,
      );
    }

    // } else if (lender === "GQ FSF") {
    //   await generateRepaymentScheduleGQFSF(
    //     lan,
    //     loanAmount,
    //     emiDate,
    //     interestRate,
    //     tenure,
    //     disbursementDate,
    //     subventionAmount,
    //     product,
    //     lender,
    //     no_of_advance_emis
    //   );
  } else if (lender === "GQ FSF" || lender === "FSF") {
    // === run generic GQ FSF generator ===
    try {
      // coerce numeric-ish inputs and log
      const approvedAmountNum = Number(loanAmount);
      const interestRateNum = Number(interestRate);
      const tenureNum = Number(tenure);
      const noOfAdvanceNum = Number(no_of_advance_emis || 0);

      console.log("Calling generateRepaymentScheduleGQFSF with:", {
        lan,
        approvedAmount: approvedAmountNum,
        emiDate,
        interestRate: interestRateNum,
        tenure: tenureNum,
        disbursementDate,
        subventionAmount,
        product,
        lender,
        no_of_advance_emis: noOfAdvanceNum,
        retentionPercentage: safeRetentionPercent, // ✅ pass this
        manualRetentionAmount: safeManualRetentionAmount, // ✅ if you have it
      });
      // ✅ If your generateRepaymentScheduleGQFSF supports retention, pass it.
      // If it doesn't, keep the function signature aligned (recommended to add params).
      await generateRepaymentScheduleGQFSF(
        lan,
        approvedAmountNum,
        emiDate,
        interestRateNum,
        tenureNum,
        disbursementDate,
        subventionAmount,
        product,
        lender,
        noOfAdvanceNum,
        safeRetentionPercent,
        safeManualRetentionAmount,
      );

      console.log("✅ generateRepaymentScheduleGQFSF completed");
    } catch (err) {
      console.error("❌ generateRepaymentScheduleGQFSF failed:", err);
    }

    // === run Fintree variant ===
    try {
      // IMPORTANT: match the exact signature of generateRepaymentScheduleGQFSF_Fintree:
      // (lan, approvedAmount, emiDate, interestRate, tenure, disbursementDate, subventionAmount, product, lender, no_of_advance_emis)
      const approvedAmountNum = Number(loanAmount);
      const interestRateNum = Number(interestRate);
      const tenureNum = Number(tenure);
      const noOfAdvanceNum = Number(no_of_advance_emis || 0);

      console.log("Calling generateRepaymentScheduleGQFSF_Fintree with:", {
        lan,
        approvedAmount: approvedAmountNum,
        emiDate,
        interestRate: interestRateNum,
        tenure: tenureNum,
        disbursementDate,
        subventionAmount,
        product,
        lender,
        no_of_advance_emis: noOfAdvanceNum,
        retentionPercent: safeRetentionPercent, // ✅
        manualRetentionAmount: safeManualRetentionAmount, // ✅
      });

      await generateRepaymentScheduleGQFSF_Fintree(
        lan,
        approvedAmountNum,
        emiDate,
        interestRateNum,
        tenureNum,
        disbursementDate,
        subventionAmount,
        product,
        lender,
        noOfAdvanceNum,
        safeRetentionPercent,
        safeManualRetentionAmount,
      );

      console.log("✅ generateRepaymentScheduleGQFSF_Fintree completed");
    } catch (err) {
      console.error("❌ generateRepaymentScheduleGQFSF_Fintree failed:", err);
    }
  } else if (lender === "Adikosh") {
    await generateRepaymentScheduleAdikosh(
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      salary_day,
    );
  } else if (lender === "Embifi") {
    await generateRepaymentScheduleEmbifi(
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
  }else if (lender === "Motion Corp" && product === "Monthly Loan") {

    console.log("inside rps genration");

  await generateRepaymentScheduleMotionCorp(
    conn,
    lan,
    loanAmount,
    interestRate,
    tenure,
    disbursementDate,
    product,
    lender,
  );


}else if (lender === "SRBH" && product === "Monthly Loan") {

    console.log("inside rps genration");

  await generateRepaymentScheduleSrbh(
    conn,
    lan,
    loanAmount,
    interestRate,
    tenure,
    disbursementDate,
    product,
    lender,
  );


} else if (lender === "HELIUM") {
    await generateRepaymentScheduleHelium(
      conn,
      lan,
      loanAmount,
      interestRate,
      tenure,
      disbursementDate,
      product,
      lender,
    );
  } else {
    console.warn(`⚠️ Unknown lender type: ${lender}. Skipping RPS generation.`);
  }
};

module.exports = {
  generateRepaymentScheduleEV,
  generateRepaymentScheduleHEYEV,
  generateRepaymentScheduleHEYEVBattery,
  // generateRepaymentScheduleFinso360,
  generateRepaymentScheduleFinso365,
  generateRepaymentScheduleBL,
  generateRepaymentScheduleGQNonFSF,
  generateRepaymentScheduleGQNonFSF_Fintree,
  generateRepaymentScheduleGQFSF,
  generateRepaymentScheduleAdikosh,
  generateRepaymentSchedule,
  generateRepaymentScheduleEmbifi,
  generateRepaymentScheduleEmiclub,
  generateRepaymentScheduleZypay,
  generateRepaymentScheduleCirclePE,
  generateRepaymentScheduleHelium,
  excelSerialDateToJS,
  generateRepaymentScheduleClayoo,
  generateRepaymentScheduleLoanDigit, 
  generateRepaymentScheduleCirclePeHouser,
  generateRepaymentScheduleMotionCorp,
  generateRepaymentScheduleCarepay,
  generateRepaymentScheduleSterlion,
  generateRepaymentScheduleSrbh,

};
