// const express = require("express");
// const router = express.Router();
// const multer = require("multer");
// const xlsx = require("xlsx");
// const db = require("../config/db"); // adjust path to your DB config
// const { sendLoanWebhook } = require("../utils/webhook");
// const {
//   generateRepaymentSchedule,
// } = require("../utils/repaymentScheduleGenerator");

// const upload = multer();

// function excelDateToJSDate(serial) {
//   const utc_days = Math.floor(serial - 25569);
//   const utc_value = utc_days * 86400;
//   const date_info = new Date(utc_value * 1000);
//   return new Date(
//     date_info.getFullYear(),
//     date_info.getMonth(),
//     date_info.getDate()
//   );
// }

// function toClientError(err) {
//   return { message: err.message || String(err) };
// }

// router.post("/upload-utr", upload.single("file"), async (req, res) => {
//   if (!req.file) return res.status(400).json({ message: "No file uploaded" });

//   // New: collect detailed issues
//   const rowErrors = []; // {lan, utr, reason, stage}

//   try {
//     const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
//     const sheetData = xlsx.utils.sheet_to_json(
//       workbook.Sheets[workbook.SheetNames[0]]
//     );

//     let processedCount = 0;
//     const duplicateUTRs = [];
//     const missingLANs = [];
//     const insertedLANs = new Set();

//     for (const row of sheetData) {
//       const disbursementUTR = row["Disbursement UTR"];
//       const disbursementDate = excelDateToJSDate(row["Disbursement Date"]);
//       const lan = row["LAN"];

//       console.log(
//         `Processing row: LAN=${lan}, UTR=${disbursementUTR}, Date=${disbursementDate}`
//       );

//       if (!disbursementUTR || !disbursementDate || !lan) {
//         const reason = `Missing required fields: ${!disbursementUTR ? "Disbursement UTR " : ""
//           }${!disbursementDate ? "Disbursement Date " : ""}${!lan ? "LAN" : ""
//           }`.trim();
//         rowErrors.push({
//           lan: lan || null,
//           utr: disbursementUTR || null,
//           reason,
//           stage: "validation",
//         });
//         continue;
//       }

//       // Fetch loan details
//       let loanRes = [];
//       try {
//         if (lan.startsWith("GQN")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount_sanctioned AS loan_amount, emi_day AS emi_date, interest_percent AS interest_rate, loan_tenure_months AS loan_tenure, subvention_amount, no_of_advance_emis, product, lender 
//              FROM loan_booking_gq_non_fsf WHERE lan = ?`,
//             [lan]
//           );
//         } else if (lan.startsWith("GQF")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount_sanctioned AS loan_amount, emi_day AS emi_date, interest_percent AS interest_rate, loan_tenure_months AS loan_tenure, subvention_amount, no_of_advance_emis,retention_percentage, product, lender 
//              FROM loan_booking_gq_fsf WHERE lan = ?`,
//             [lan]
//           );
//         } else if (lan.startsWith("E10")) {
//           [loanRes] = await db.promise().query(
//             `SELECT approved_loan_amount AS loan_amount, new_interest AS interest_rate, loan_tenure_months AS loan_tenure, product, lender 
//              FROM loan_booking_embifi WHERE lan = ?`,
//             [lan]
//           );
//         } else if (lan.startsWith("ADK")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount, interest_rate, loan_tenure, salary_day, product, lender 
//              FROM loan_booking_adikosh WHERE lan = ?`,
//             [lan]
//           );
//         } else if (lan.startsWith("EV")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount, interest_rate, loan_tenure, product, lender 
//              FROM loan_booking_ev WHERE lan = ?`,
//             [lan]
//           );
//         } else if (lan.startsWith("HEYEV")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount, interest_rate, loan_tenure, product, lender 
//              FROM loan_booking_hey_ev WHERE lan = ?`,
//             [lan]
//           );
//         } else if (lan.startsWith("HEYBF1")) {
//           // 🔋 HeyEV Battery loans
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount, interest_rate, tenure AS loan_tenure, product, lender 
//              FROM loan_booking_hey_ev_battery WHERE lan = ?`,
//             [lan]
//           );
//         } else if (lan.startsWith("FINS")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount, interest_rate, loan_tenure, product, lender 
//              FROM loan_booking_finso WHERE lan = ?`,
//             [lan]
//           );
//         } else if (lan.startsWith("CIRF")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount, interest_rate, loan_tenure, product, lender 
//              FROM loan_booking_circle_pe WHERE lan = ?`,
//             [lan]
//           );
//         }
//         ///////   this is for ZYPAY ////
//           else if (lan.startsWith("ZYPF")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount, interest_rate, loan_tenure, product, lender 
//              FROM loan_booking_zypay_customer WHERE lan = ?`,
//             [lan]
//           );
//         }
//         ////// this for EMI CLUB ////////
//         else if (lan.startsWith("FINE")) {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount, roi_apr AS interest_rate, loan_tenure, product, lender 
//              FROM loan_booking_emiclub WHERE lan = ?`,
//             [lan]
//           );
//         }
//         else if (lan.startsWith("HEL")) {   // You can change prefix to whatever you use for Helium
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount, interest_rate, loan_tenure, product, lender
//      FROM loan_booking_helium WHERE lan = ?`,
//             [lan]
//           );
//         } else {
//           [loanRes] = await db.promise().query(
//             `SELECT loan_amount, interest_rate, loan_tenure, product, lender 
//              FROM loan_bookings WHERE lan = ?`,
//             [lan]
//           );
//         }
//       } catch (err) {
//         rowErrors.push({
//           lan,
//           utr: disbursementUTR,
//           reason: `DB query error: ${toClientError(err).message}`,
//           stage: "fetch-loan",
//         });
//         continue;
//       }

//       if (loanRes.length === 0) {
//         console.warn(`🚫 LAN not found: ${lan}`);
//         missingLANs.push(lan);
//         rowErrors.push({
//           lan,
//           utr: disbursementUTR,
//           reason: "LAN not found",
//           stage: "fetch-loan",
//         });
//         continue;
//       }

//       const {
//         loan_amount,
//         emi_date,
//         interest_rate,
//         loan_tenure,
//         subvention_amount,
//         no_of_advance_emis,
//         retention_percentage,
//         salary_day,
//         product,
//         lender,
//       } = loanRes[0];

//       // Duplicate UTR check
//       try {
//         const [utrExists] = await db
//           .promise()
//           .query(
//             "SELECT 1 FROM ev_disbursement_utr WHERE Disbursement_UTR = ?",
//             [disbursementUTR]
//           );

//         if (utrExists.length > 0) {
//           console.warn(`⚠️ Duplicate UTR: ${disbursementUTR}`);
//           duplicateUTRs.push(disbursementUTR);
//           rowErrors.push({
//             lan,
//             utr: disbursementUTR,
//             reason: "Duplicate UTR",
//             stage: "pre-insert",
//           });
//           continue;
//         }
//       } catch (err) {
//         rowErrors.push({
//           lan,
//           utr: disbursementUTR,
//           reason: `DB check error: ${toClientError(err).message}`,
//           stage: "pre-insert",
//         });
//         continue;
//       }

//       // Transaction (UPDATED to make RPS + UTR + status atomic)
//       let conn;
//       try {
//         conn = await db.promise().getConnection();
//         await conn.beginTransaction();

//         try {
//           if (!insertedLANs.has(lan)) {
//             // 🔴 IMPORTANT: pass `conn` (transaction) into the RPS generator.
//             await generateRepaymentSchedule(
//               conn,
//               lan,
//               loan_amount,
//               emi_date,
//               interest_rate,
//               loan_tenure,
//               disbursementDate,
//               subvention_amount,
//               no_of_advance_emis,
//               retention_percentage,
//               salary_day,
//               product,
//               lender
//             );
//             insertedLANs.add(lan);
//           }
//         } catch (rpsErr) {
//           rowErrors.push({
//             lan,
//             utr: disbursementUTR,
//             reason: `RPS error: ${toClientError(rpsErr).message}`,
//             stage: "rps",
//           });
//           await conn.rollback();
//           continue;
//         }

//         try {
//           await conn.query(
//             "INSERT INTO ev_disbursement_utr (Disbursement_UTR, Disbursement_Date, LAN) VALUES (?, ?, ?)",
//             [disbursementUTR, disbursementDate, lan]
//           );
//         } catch (insertErr) {
//           rowErrors.push({
//             lan,
//             utr: disbursementUTR,
//             reason: `UTR insert error: ${toClientError(insertErr).message}`,
//             stage: "utr-insert",
//           });
//           await conn.rollback();
//           continue;
//         }

//         try {
//           if (lan.startsWith("GQN")) {
//             await conn.query(
//               "UPDATE loan_booking_gq_non_fsf SET status = 'Disbursed' WHERE lan = ?",
//               [lan]
//             );
//           } else if (lan.startsWith("GQF")) {
//             await conn.query(
//               "UPDATE loan_booking_gq_fsf SET status = 'Disbursed' WHERE lan = ?",
//               [lan]
//             );
//           } else if (lan.startsWith("E10")) {
//             await conn.query(
//               "UPDATE loan_booking_embifi SET status = 'Disbursed' WHERE lan = ?",
//               [lan]
//             );
//           } else if (lan.startsWith("EV")) {
//             await conn.query(
//               "UPDATE loan_booking_ev SET status = 'Disbursed' WHERE lan = ?",
//               [lan]
//             );
//           } else if (lan.startsWith("CIRF")) {
//             await conn.query(
//               "UPDATE loan_booking_circle_pe SET status = 'Disbursed' WHERE lan = ?",
//               [lan]
//             );
//           } else if (lan.startsWith("HEYEV")) {
//             await conn.query(
//               "UPDATE loan_booking_hey_ev SET status = 'Disbursed' WHERE lan = ?",
//               [lan]
//             );
//           } else if (lan.startsWith("HEYBF1")) {
//             await conn.query(
//               "UPDATE loan_booking_hey_ev_battery SET status = 'Disbursed' WHERE lan = ?",
//               [lan]
//             );
//           } else if (lan.startsWith("FINS")) {
//             await conn.query(
//               "UPDATE loan_booking_finso SET status = 'Disbursed' WHERE lan = ?",
//               [lan]
//             );
//           }
//            else if (lan.startsWith("ZYPF")) {
//             await conn.query(
//               "UPDATE loan_booking_zypay_customer SET status = 'Disbursed' WHERE lan = ?",
//               [lan]
//             );
//           }
//           ///// this for EMI CLUB /////
//           else if (lan.startsWith("FINE")) {
//             await conn.query(
//               "UPDATE loan_booking_emiclub SET status = 'Disbursed' WHERE lan = ?",
//               [lan]
//             );
//           }
//           else if (lan.startsWith("HEL")) {

//             // 1️⃣ Mark loan as Disbursed
//             await conn.query(
//               "UPDATE loan_booking_helium SET status = 'Disbursed' WHERE lan = ?",
//               [lan]
//             );

//             // 2️⃣ Fetch ALL required data using JOIN
//             const [[loan]] = await conn.query(
//               `
//     SELECT 
//       lb.loan_amount,
//       lb.interest_rate,
//       eu.disbursement_date
//     FROM loan_booking_helium lb
//     JOIN ev_disbursement_utr eu 
//       ON eu.lan = lb.lan
//     WHERE lb.lan = ?
//     `,
//               [lan]
//             );

//             if (!loan) {
//               throw new Error("Helium loan or disbursement record not found");
//             }

//             // 3️⃣ DISBURSEMENT DATE
//             const disbDate = new Date(loan.disbursement_date);

//             // 4️⃣ FIRST EMI DATE (runtime only → not stored)
//             const firstEmiDate = new Date(
//               disbDate.getFullYear(),
//               disbDate.getMonth() + 1, // next month
//               5
//             );

//             // 5️⃣ PRE-EMI DAYS
//             const diffMs = firstEmiDate - disbDate;
//             const preEmiDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

//             // 6️⃣ PRE-EMI CALCULATION
//             const loanAmount = Number(loan.loan_amount);
//             const interestRate = Number(loan.interest_rate);

//             const preEmi =
//               (loanAmount * interestRate * preEmiDays) / (100 * 365);

//             const preEmiAmount = Number(preEmi.toFixed(2));

//             // 7️⃣ NET DISBURSEMENT
//             const netDisbursement = Number(
//               (loanAmount - preEmiAmount).toFixed(2)
//             );

//             // 8️⃣ UPDATE ONLY FINANCIALS (NO EMI DATE)
//             await conn.query(
//               `
//     UPDATE loan_booking_helium
//     SET 
//       pre_emi_days = ?,
//       pre_emi = ?,
//       net_disbursement = ?
//     WHERE lan = ?
//     `,
//               [preEmiDays, preEmiAmount, netDisbursement, lan]
//             );
//           } else {
//             await conn.query(
//               "UPDATE loan_booking_adikosh SET status = 'Disbursed' WHERE lan = ?",
//               [lan]
//             );
//           }
//         } catch (statusErr) {
//           rowErrors.push({
//             lan,
//             utr: disbursementUTR,
//             reason: `Status update error: ${toClientError(statusErr).message}`,
//             stage: "status-update",
//           });
//           await conn.rollback();
//           continue;
//         }

//         await conn.commit();
//         processedCount++;

//         // ✅ Call webhook for FINE (EMI CLUB) loans only
//         if (lan.startsWith("FINE")) {
//           try {
//             // Fetch partner_loan_id for external_ref_no
//             const [partnerData] = await db
//               .promise()
//               .query(
//                 "SELECT partner_loan_id FROM loan_booking_emiclub WHERE lan = ?",
//                 [lan]
//               );

//             const partnerLoanId =
//               partnerData.length > 0 ? partnerData[0].partner_loan_id : null;

//             await sendLoanWebhook({
//               external_ref_no: partnerLoanId, // use partner_loan_id if available
//               utr: disbursementUTR,
//               disbursement_date: disbursementDate.toISOString().split("T")[0],
//               reference_number: lan,
//               status: "DISBURSED",
//               reject_reason: null,
//             });
//           } catch (webhookErr) {
//             console.error(
//               `⚠️ Webhook failed for ${partnerLoanId}:`,
//               webhookErr.message
//             );
//             rowErrors.push({
//               partnerLoanId,
//               lan,
//               utr: disbursementUTR,
//               reason: `Webhook failed: ${webhookErr.message}`,
//               stage: "webhook",
//             });
//           }
//         }

//         // ✅ Call webhook for FINE (Finso) loans only
//         if (lan.startsWith("FINS")) {
//           try {
//             // Fetch partner_loan_id for external_ref_no
//             const [partnerData] = await db
//               .promise()
//               .query(
//                 "SELECT partner_loan_id FROM loan_booking_finso WHERE lan = ?",
//                 [lan]
//               );

//             const partnerLoanId =
//               partnerData.length > 0 ? partnerData[0].partner_loan_id : null;

//             await sendLoanWebhook({
//               external_ref_no: partnerLoanId, // use partner_loan_id if available
//               utr: disbursementUTR,
//               disbursement_date: disbursementDate.toISOString().split("T")[0],
//               reference_number: lan,
//               status: "DISBURSED",
//               reject_reason: null,
//             });
//           } catch (webhookErr) {
//             console.error(
//               `⚠️ Webhook failed for ${partnerLoanId}:`,
//               webhookErr.message
//             );
//             rowErrors.push({
//               partnerLoanId,
//               lan,
//               utr: disbursementUTR,
//               reason: `Webhook failed: ${webhookErr.message}`,
//               stage: "webhook",
//             });
//           }
//         }
//       } catch (txErr) {
//         rowErrors.push({
//           lan,
//           utr: disbursementUTR,
//           reason: `Transaction error: ${toClientError(txErr).message}`,
//           stage: "transaction",
//         });
//         try {
//           if (conn) await conn.rollback();
//         } catch (_) { }
//       } finally {
//         try {
//           if (conn) conn.release();
//         } catch (_) { }
//       }
//     }

//     // Return structured summary
//     return res.json({
//       message: `UTR upload completed. ${processedCount} record(s) inserted.`,
//       processed_count: processedCount,
//       duplicate_utr: duplicateUTRs,
//       missing_lans: missingLANs,
//       row_errors: rowErrors,
//     });
//   } catch (error) {
//     console.error("❌ Error during UTR upload:", error);
//     return res.status(500).json({
//       message: "Upload failed",
//       details: toClientError(error),
//     });
//   }
// });

// module.exports = router;


//////////////////
const express = require("express");
const router = express.Router();
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("../config/db"); // adjust path to your DB config
const { sendLoanWebhook } = require("../utils/webhook");
const {
  generateRepaymentSchedule,
} = require("../utils/repaymentScheduleGenerator");

const upload = multer();

function excelDateToJSDate(serial) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return new Date(
    date_info.getFullYear(),
    date_info.getMonth(),
    date_info.getDate()
  );
}

function toClientError(err) {
  return { message: err.message || String(err) };
}

router.post("/upload-utr", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  // New: collect detailed issues
  const rowErrors = []; // {lan, utr, reason, stage}

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetData = xlsx.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]]
    );

    let processedCount = 0;
    const duplicateUTRs = [];
    const missingLANs = [];
    const insertedLANs = new Set();

    for (const row of sheetData) {
      const disbursementUTR = row["Disbursement UTR"];
      const disbursementDate = excelDateToJSDate(row["Disbursement Date"]);
      const lan = row["LAN"];

      console.log(
        `Processing row: LAN=${lan}, UTR=${disbursementUTR}, Date=${disbursementDate}`
      );

      if (!disbursementUTR || !disbursementDate || !lan) {
        const reason = `Missing required fields: ${!disbursementUTR ? "Disbursement UTR " : ""
          }${!disbursementDate ? "Disbursement Date " : ""}${!lan ? "LAN" : ""
          }`.trim();
        rowErrors.push({
          lan: lan || null,
          utr: disbursementUTR || null,
          reason,
          stage: "validation",
        });
        continue;
      }

      // Fetch loan details
      let loanRes = [];
      try {
        if (lan.startsWith("GQN")) {
          [loanRes] = await db.promise().query(
            `SELECT loan_amount_sanctioned AS loan_amount, emi_day AS emi_date, interest_percent AS interest_rate, loan_tenure_months AS loan_tenure, subvention_amount, no_of_advance_emis, product, lender 
             FROM loan_booking_gq_non_fsf WHERE lan = ?`,
            [lan]
          );
        } else if (lan.startsWith("GQF")) {
          [loanRes] = await db.promise().query(
            `SELECT loan_amount_sanctioned AS loan_amount, emi_day AS emi_date, interest_percent AS interest_rate, loan_tenure_months AS loan_tenure, subvention_amount, no_of_advance_emis, product, lender 
             FROM loan_booking_gq_fsf WHERE lan = ?`,
            [lan]
          );
        } else if (lan.startsWith("E10")) {
          [loanRes] = await db.promise().query(
            `SELECT approved_loan_amount AS loan_amount, new_interest AS interest_rate, loan_tenure_months AS loan_tenure, product, lender 
             FROM loan_booking_embifi WHERE lan = ?`,
            [lan]
          );
        } else if (lan.startsWith("ADK")) {
          [loanRes] = await db.promise().query(
            `SELECT loan_amount, interest_rate, loan_tenure, salary_day, product, lender 
             FROM loan_booking_adikosh WHERE lan = ?`,
            [lan]
          );
        } else if (lan.startsWith("EV")) {
          [loanRes] = await db.promise().query(
            `SELECT loan_amount, interest_rate, loan_tenure, product, lender 
             FROM loan_booking_ev WHERE lan = ?`,
            [lan]
          );
        } else if (lan.startsWith("HEYEV")) {
          [loanRes] = await db.promise().query(
            `SELECT loan_amount, interest_rate, loan_tenure, product, lender 
             FROM loan_booking_hey_ev WHERE lan = ?`,
            [lan]
          );
        } else if (lan.startsWith("HEYBF1")) {
          // 🔋 HeyEV Battery loans
          [loanRes] = await db.promise().query(
            `SELECT loan_amount, interest_rate, tenure AS loan_tenure, product, lender 
             FROM loan_booking_hey_ev_battery WHERE lan = ?`,
            [lan]
          );
        } else if (lan.startsWith("FINS")) {
          [loanRes] = await db.promise().query(
            `SELECT loan_amount, interest_rate, loan_tenure, product, lender 
             FROM loan_booking_finso WHERE lan = ?`,
            [lan]
          );
        } else if (lan.startsWith("CIRF")) {
          [loanRes] = await db.promise().query(
            `SELECT loan_amount, interest_rate, loan_tenure, product, lender 
             FROM loan_booking_circle_pe WHERE lan = ?`,
            [lan]
          );
        }
        ///////   this is for ZYPAY ////
          else if (lan.startsWith("ZYPF")) {
          [loanRes] = await db.promise().query(
            `SELECT loan_amount, interest_rate, loan_tenure, product, lender 
             FROM loan_booking_zypay_customer WHERE lan = ?`,
            [lan]
          );
        }
        ////// this for EMI CLUB ////////
        else if (lan.startsWith("FINE")) {
          [loanRes] = await db.promise().query(
            `SELECT loan_amount, roi_apr AS interest_rate, loan_tenure, product, lender 
             FROM loan_booking_emiclub WHERE lan = ?`,
            [lan]
          );
        }
        else if (lan.startsWith("HEL")) {   // You can change prefix to whatever you use for Helium
          [loanRes] = await db.promise().query(
            `SELECT loan_amount, interest_rate, loan_tenure, product, lender
     FROM loan_booking_helium WHERE lan = ?`,
            [lan]
          );
        } else {
          [loanRes] = await db.promise().query(
            `SELECT loan_amount, interest_rate, loan_tenure, product, lender 
             FROM loan_bookings WHERE lan = ?`,
            [lan]
          );
        }
      } catch (err) {
        rowErrors.push({
          lan,
          utr: disbursementUTR,
          reason: `DB query error: ${toClientError(err).message}`,
          stage: "fetch-loan",
        });
        continue;
      }

      if (loanRes.length === 0) {
        console.warn(`🚫 LAN not found: ${lan}`);
        missingLANs.push(lan);
        rowErrors.push({
          lan,
          utr: disbursementUTR,
          reason: "LAN not found",
          stage: "fetch-loan",
        });
        continue;
      }

      const {
        loan_amount,
        emi_date,
        interest_rate,
        loan_tenure,
        subvention_amount,
        no_of_advance_emis,
        salary_day,
        product,
        lender,
      } = loanRes[0];

      // Duplicate UTR check
      try {
        const [utrExists] = await db
          .promise()
          .query(
            "SELECT 1 FROM ev_disbursement_utr WHERE Disbursement_UTR = ?",
            [disbursementUTR]
          );

        if (utrExists.length > 0) {
          console.warn(`⚠️ Duplicate UTR: ${disbursementUTR}`);
          duplicateUTRs.push(disbursementUTR);
          rowErrors.push({
            lan,
            utr: disbursementUTR,
            reason: "Duplicate UTR",
            stage: "pre-insert",
          });
          continue;
        }
      } catch (err) {
        rowErrors.push({
          lan,
          utr: disbursementUTR,
          reason: `DB check error: ${toClientError(err).message}`,
          stage: "pre-insert",
        });
        continue;
      }

      // Transaction (UPDATED to make RPS + UTR + status atomic)
      let conn;
      try {
        conn = await db.promise().getConnection();
        await conn.beginTransaction();

        try {
          if (!insertedLANs.has(lan)) {
            // 🔴 IMPORTANT: pass `conn` (transaction) into the RPS generator.
            await generateRepaymentSchedule(
              conn,
              lan,
              loan_amount,
              emi_date,
              interest_rate,
              loan_tenure,
              disbursementDate,
              subvention_amount,
              no_of_advance_emis,
              salary_day,
              product,
              lender
            );
            insertedLANs.add(lan);
          }
        } catch (rpsErr) {
          rowErrors.push({
            lan,
            utr: disbursementUTR,
            reason: `RPS error: ${toClientError(rpsErr).message}`,
            stage: "rps",
          });
          await conn.rollback();
          continue;
        }

        try {
          await conn.query(
            "INSERT INTO ev_disbursement_utr (Disbursement_UTR, Disbursement_Date, LAN) VALUES (?, ?, ?)",
            [disbursementUTR, disbursementDate, lan]
          );
        } catch (insertErr) {
          rowErrors.push({
            lan,
            utr: disbursementUTR,
            reason: `UTR insert error: ${toClientError(insertErr).message}`,
            stage: "utr-insert",
          });
          await conn.rollback();
          continue;
        }

        try {
          if (lan.startsWith("GQN")) {
            await conn.query(
              "UPDATE loan_booking_gq_non_fsf SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          } else if (lan.startsWith("GQF")) {
            await conn.query(
              "UPDATE loan_booking_gq_fsf SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          } else if (lan.startsWith("E10")) {
            await conn.query(
              "UPDATE loan_booking_embifi SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          } else if (lan.startsWith("EV")) {
            await conn.query(
              "UPDATE loan_booking_ev SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          } else if (lan.startsWith("CIRF")) {
            await conn.query(
              "UPDATE loan_booking_circle_pe SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          } else if (lan.startsWith("HEYEV")) {
            await conn.query(
              "UPDATE loan_booking_hey_ev SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          } else if (lan.startsWith("HEYBF1")) {
            await conn.query(
              "UPDATE loan_booking_hey_ev_battery SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          } else if (lan.startsWith("FINS")) {
            await conn.query(
              "UPDATE loan_booking_finso SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          }
           else if (lan.startsWith("ZYPF")) {
            await conn.query(
              "UPDATE loan_booking_zypay_customer SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          }
          ///// this for EMI CLUB /////
          else if (lan.startsWith("FINE")) {
            await conn.query(
              "UPDATE loan_booking_emiclub SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          }
          else if (lan.startsWith("HEL")) {

            // 1️⃣ Mark loan as Disbursed
            await conn.query(
              "UPDATE loan_booking_helium SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );

            // 2️⃣ Fetch ALL required data using JOIN
            const [[loan]] = await conn.query(
              `
    SELECT 
      lb.loan_amount,
      lb.interest_rate,
      eu.disbursement_date
    FROM loan_booking_helium lb
    JOIN ev_disbursement_utr eu 
      ON eu.lan = lb.lan
    WHERE lb.lan = ?
    `,
              [lan]
            );

            if (!loan) {
              throw new Error("Helium loan or disbursement record not found");
            }

            // 3️⃣ DISBURSEMENT DATE
            const disbDate = new Date(loan.disbursement_date);

            // 4️⃣ FIRST EMI DATE (runtime only → not stored)
            const firstEmiDate = new Date(
              disbDate.getFullYear(),
              disbDate.getMonth() + 1, // next month
              5
            );

            // 5️⃣ PRE-EMI DAYS
            const diffMs = firstEmiDate - disbDate;
            const preEmiDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

            // 6️⃣ PRE-EMI CALCULATION
            const loanAmount = Number(loan.loan_amount);
            const interestRate = Number(loan.interest_rate);

            const preEmi =
              (loanAmount * interestRate * preEmiDays) / (100 * 365);

            const preEmiAmount = Number(preEmi.toFixed(2));

            // 7️⃣ NET DISBURSEMENT
            const netDisbursement = Number(
              (loanAmount - preEmiAmount).toFixed(2)
            );

            // 8️⃣ UPDATE ONLY FINANCIALS (NO EMI DATE)
            await conn.query(
              `
    UPDATE loan_booking_helium
    SET 
      pre_emi_days = ?,
      pre_emi = ?,
      net_disbursement = ?
    WHERE lan = ?
    `,
              [preEmiDays, preEmiAmount, netDisbursement, lan]
            );
          } else {
            await conn.query(
              "UPDATE loan_booking_adikosh SET status = 'Disbursed' WHERE lan = ?",
              [lan]
            );
          }
        } catch (statusErr) {
          rowErrors.push({
            lan,
            utr: disbursementUTR,
            reason: `Status update error: ${toClientError(statusErr).message}`,
            stage: "status-update",
          });
          await conn.rollback();
          continue;
        }

        await conn.commit();
        processedCount++;

        // ✅ Call webhook for FINE (EMI CLUB) loans only
        if (lan.startsWith("FINE")) {
          try {
            // Fetch partner_loan_id for external_ref_no
            const [partnerData] = await db
              .promise()
              .query(
                "SELECT partner_loan_id FROM loan_booking_emiclub WHERE lan = ?",
                [lan]
              );

            const partnerLoanId =
              partnerData.length > 0 ? partnerData[0].partner_loan_id : null;

            await sendLoanWebhook({
              external_ref_no: partnerLoanId, // use partner_loan_id if available
              utr: disbursementUTR,
              disbursement_date: disbursementDate.toISOString().split("T")[0],
              reference_number: lan,
              status: "DISBURSED",
              reject_reason: null,
            });
          } catch (webhookErr) {
            console.error(
              `⚠️ Webhook failed for ${partnerLoanId}:`,
              webhookErr.message
            );
            rowErrors.push({
              partnerLoanId,
              lan,
              utr: disbursementUTR,
              reason: `Webhook failed: ${webhookErr.message}`,
              stage: "webhook",
            });
          }
        }

        // ✅ Call webhook for FINE (Finso) loans only
        if (lan.startsWith("FINS")) {
          try {
            // Fetch partner_loan_id for external_ref_no
            const [partnerData] = await db
              .promise()
              .query(
                "SELECT partner_loan_id FROM loan_booking_finso WHERE lan = ?",
                [lan]
              );

            const partnerLoanId =
              partnerData.length > 0 ? partnerData[0].partner_loan_id : null;

            await sendLoanWebhook({
              external_ref_no: partnerLoanId, // use partner_loan_id if available
              utr: disbursementUTR,
              disbursement_date: disbursementDate.toISOString().split("T")[0],
              reference_number: lan,
              status: "DISBURSED",
              reject_reason: null,
            });
          } catch (webhookErr) {
            console.error(
              `⚠️ Webhook failed for ${partnerLoanId}:`,
              webhookErr.message
            );
            rowErrors.push({
              partnerLoanId,
              lan,
              utr: disbursementUTR,
              reason: `Webhook failed: ${webhookErr.message}`,
              stage: "webhook",
            });
          }
        }
      } catch (txErr) {
        rowErrors.push({
          lan,
          utr: disbursementUTR,
          reason: `Transaction error: ${toClientError(txErr).message}`,
          stage: "transaction",
        });
        try {
          if (conn) await conn.rollback();
        } catch (_) { }
      } finally {
        try {
          if (conn) conn.release();
        } catch (_) { }
      }
    }

    // Return structured summary
    return res.json({
      message: `UTR upload completed. ${processedCount} record(s) inserted.`,
      processed_count: processedCount,
      duplicate_utr: duplicateUTRs,
      missing_lans: missingLANs,
      row_errors: rowErrors,
    });
  } catch (error) {
    console.error("❌ Error during UTR upload:", error);
    return res.status(500).json({
      message: "Upload failed",
      details: toClientError(error),
    });
  }
});

module.exports = router;
