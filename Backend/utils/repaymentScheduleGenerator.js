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
  no_of_advance_emis = 0
) => {
  try {
    console.log(`\n🚀 Generating GQ NON-FSF RPS for LAN: ${lan}`);
    console.log(`📝 Inputs → ApprovedAmount: ₹${approvedAmount}, InterestRate: ${interestRate}%, Tenure: ${tenure}, DisbursementDate: ${disbursementDate}, EMI Date: ${emiDate}, SubventionAmount: ₹${subventionAmount}, Product: ${product}, Lender: ${lender}, AdvanceEMIs: ${no_of_advance_emis}`);

    const annualRate = interestRate / 100;
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

const generateRepaymentScheduleAdikosh = async (
  lan,
  loanAmount,
  interestRate,
  tenure,
  disbursementDate,
  salaryDay
) => {
  try {
    const firstDueDate = getFirstEmiDate(disbursementDate, "Adikosh", "Adikosh", 0, salaryDay);

    // 1️⃣ Normal 3 tables first
    const tables = [
      { name: "manual_rps_adikosh", factor: 1.0, customRate: null },
      { name: "manual_rps_adikosh_fintree", factor: 0.8, customRate: null },
      { name: "manual_rps_adikosh_partner", factor: 0.2, customRate: null },
    ];

    for (const table of tables) {
      const rpsData = [];
      const baseAmount = loanAmount * table.factor;
      const annualRate = (table.customRate ?? interestRate) / 100;
      const monthlyRate = annualRate / 12;

      let remainingPrincipal = baseAmount;
      let dueDate = new Date(firstDueDate);

      const baseEmi = Math.ceil(
        (baseAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
        (Math.pow(1 + monthlyRate, tenure) - 1)
      );

      for (let i = 1; i <= tenure; i++) {
        let interest = Math.round((remainingPrincipal * annualRate * 30) / 360);
        let principal, emi;

        if (i === tenure) {
          // 🔧 Adjust last EMI
          principal = Math.round(remainingPrincipal);
          emi = baseEmi;
          interest = emi - principal;
        } else {
          emi = baseEmi;
          principal = emi - interest;
        }

        rpsData.push([
          lan,
          dueDate.toISOString().split("T")[0],
          emi,
          interest,
          principal,
          Math.max(remainingPrincipal - principal, 0),
          interest,
          emi,
          "Pending"
        ]);

        remainingPrincipal -= principal;
        dueDate.setMonth(dueDate.getMonth() + 1);
      }

      await db.promise().query(
        `INSERT INTO ${table.name}
         (lan, due_date, emi, interest, principal, remaining_principal, remaining_interest, remaining_emi, status)
         VALUES ?`,
        [rpsData]
      );

      console.log(`✅ ${table.name} RPS generated for ${lan}`);
    }

    // 2️⃣ ✅ Generate manual_rps_adikosh_fintree_roi using manual_rps_adikosh rows
    const [adikoshRows] = await db.promise().query(
      `SELECT * FROM manual_rps_adikosh WHERE lan = ? ORDER BY due_date ASC`,
      [lan]
    );

    const fintreeRoiData = [];
    for (const row of adikoshRows) {
      const basePrincipal = row.principal * 0.8;
      const rawInterest = row.interest * 0.8 * (21.5 / 33);
      const roundedInterest = Math.round(rawInterest);
      const roundedPrincipal = Math.round(basePrincipal);
      const roiEmi = roundedInterest + roundedPrincipal;

      fintreeRoiData.push([
        lan,
        row.due_date,
        roiEmi,
        roundedInterest,
        roundedPrincipal,
        Math.max(row.remaining_principal * 0.8, 0),
        roundedInterest,
        roiEmi,
        "Pending"
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
  }
};



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
  generateRepaymentSchedule
};
