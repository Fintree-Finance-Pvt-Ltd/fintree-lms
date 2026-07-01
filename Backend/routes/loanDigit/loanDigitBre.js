// const db = require("../../config/db");
// const { XMLParser } = require("fast-xml-parser");

// const parser = new XMLParser({
//   ignoreAttributes: false,
//   parseTagValue: true,
//   trimValues: true,
// });

// const toArray = (v) => {
//   if (!v) return [];
//   return Array.isArray(v) ? v : [v];
// };

// const toNumber = (v, fallback = 0) => {
//   if (v === null || v === undefined || v === "") return fallback;
//   const n = Number(v);
//   return Number.isFinite(n) ? n : fallback;
// };

// const parseDateYYYYMMDD = (s) => {
//   if (!s || String(s).length !== 8) return null;
//   const str = String(s);
//   const y = Number(str.slice(0, 4));
//   const m = Number(str.slice(4, 6)) - 1;
//   const d = Number(str.slice(6, 8));
//   const dt = new Date(y, m, d);
//   return Number.isNaN(dt.getTime()) ? null : dt;
// };

// const monthsDiff = (fromDate, toDate = new Date()) => {
//   if (!fromDate) return null;
//   return (
//     (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
//     (toDate.getMonth() - fromDate.getMonth())
//   );
// };

// const calculateAge = (dob) => {
//   if (!dob) return null;
//   const birthDate = new Date(dob);
//   if (Number.isNaN(birthDate.getTime())) return null;

//   const today = new Date();
//   let age = today.getFullYear() - birthDate.getFullYear();
//   const m = today.getMonth() - birthDate.getMonth();

//   if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
//     age--;
//   }
//   return age;
// };

// /**
//  * Extract LoanDigit bureau facts from bureau XML
//  *
//  * Based on policy:
//  * - Min score 700
//  * - Enquiries <= 5 in last 6 months
//  * - No DPD in last 6 months
//  * - No loans >30 DPD in last 12 months
//  * - No loan >60 DPD ever
//  * - No more than 1 PAN reported
//  * - Deviation possible only if DPD loan closed and fresh loan granted after that
//  */
// const extractLoanDigitBureauFacts = (reportXml) => {
//   if (!reportXml) {
//     return {
//       score: null,
//       enquiries6m: null,
//       hasDpdIn6M: false,
//       hasGt30Dpd12M: false,
//       hasGt60DpdEver: false,
//       totalPanReported: 0,
//       closedLoanWithOldDpd: false,
//       newLoanAfterOldDpd: false,
//       deviationEligible: false,
//     };
//   }

//   const json = parser.parse(reportXml);
//   const profile = json?.INProfileResponse || {};

//   const score =
//   toNumber(profile?.SCORE?.BureauScore, null) ??
//   toNumber(profile?.Score?.BureauScore, null) ??
//   toNumber(profile?.Score?.Value, null);

//   const enquiries6m =
//     toNumber(profile?.CAPS?.CAPS_Summary?.CAPSLast180Days, null) ??
//     toNumber(profile?.CAPS?.CAPS_Summary?.CAPSLast6Months, null);

//   const accounts = toArray(profile?.CAIS_Account?.CAIS_Account_DETAILS);

//   let activeLoanCountExcludingCreditCards = 0;

// for (const acc of accounts) {
//   const accountStatus = String(acc?.Account_Status || "").trim();

//   // Account_Type 05 = Credit Card (CIBIL standard)
//   const accountType = String(acc?.Account_Type || "").trim();

//   // Active account status usually = 11 (Active)
//   const isActive = accountStatus === "11";

//   const isCreditCard = accountType === "05";

//   if (isActive && !isCreditCard) {
//     activeLoanCountExcludingCreditCards++;
//   }
// }

//   let hasDpdIn6M = false;
//   let hasGt30Dpd12M = false;
//   let hasGt60DpdEver = false;
//   let closedLoanWithOldDpd = false;
//   let newLoanAfterOldDpd = false;

//   const now = new Date();
//   let latestOldDpdClosedDate = null;

//   const panReportedRaw =
//   profile?.Current_Application
//     ?.Current_Application_Details
//     ?.Current_Applicant_Details
//     ?.IncomeTaxPan || null;

//  const totalPanReported = panReportedRaw ? 1 : 0;

//   const debug = {
//     score,
//     enquiries6m,
//     accountsAnalyzed: accounts.length,
//     details: [],
//     flags: {},
//   };

//   for (const acc of accounts) {
//     const histories = toArray(acc?.CAIS_Account_History);

//     const dateOpened =
//       parseDateYYYYMMDD(acc?.Date_Opened_Or_Disbursed) ||
//       parseDateYYYYMMDD(acc?.DateOpenedDisbursed) ||
//       parseDateYYYYMMDD(acc?.Date_Opened) ||
//       parseDateYYYYMMDD(acc?.Open_Date);

//     const dateClosed =
//       parseDateYYYYMMDD(acc?.Date_Closed) ||
//       parseDateYYYYMMDD(acc?.DateClosed) ||
//       parseDateYYYYMMDD(acc?.Date_Closed_Or_Settled)

//     const accountStatus = String(acc?.Account_Status || "").toUpperCase();

//     const accountDebug = {
//       accountNumber: acc?.Account_Number || "NA",
//       accountStatus,
//       dateOpened: acc?.Date_Opened_Or_Disbursed || acc?.DateOpenedDisbursed || acc?.Date_Opened || null,
//       dateClosed: acc?.Date_Closed || acc?.DateClosed || null,
//       dpdHistory: [],
//     };

//     let accountHadDpd = false;

//     for (const hist of histories) {
//       const year = toNumber(hist?.Year, null);
//       const month = toNumber(hist?.Month, null);
//       const dpd = toNumber(hist?.Days_Past_Due, 0);

//       if (!year || !month) continue;

//       const histDate = new Date(year, month - 1, 1);
//       const diff = monthsDiff(histDate, now);

//       if (diff === null || diff < 0) continue;

//       accountDebug.dpdHistory.push({
//         year,
//         month,
//         dpd,
//         monthsAgo: diff,
//       });

//       if (diff < 6 && dpd > 0) {
//         hasDpdIn6M = true;
//       }

//       if (diff < 12 && dpd > 30) {
//         hasGt30Dpd12M = true;
//       }

//       if (dpd > 60) {
//         hasGt60DpdEver = true;
//       }

//       if (dpd > 0) {
//         accountHadDpd = true;
//       }
//     }

//     if (
//       accountHadDpd &&
//       (accountStatus.includes("CLOSED") || dateClosed)
//     ) {
//       closedLoanWithOldDpd = true;

//       if (!latestOldDpdClosedDate || (dateClosed && dateClosed > latestOldDpdClosedDate)) {
//         latestOldDpdClosedDate = dateClosed || latestOldDpdClosedDate;
//       }
//     }

//     debug.details.push(accountDebug);
//   }

//   if (latestOldDpdClosedDate) {
//     for (const acc of accounts) {
//       const dateOpened =
//         parseDateYYYYMMDD(acc?.Date_Opened_Or_Disbursed) ||
//         parseDateYYYYMMDD(acc?.DateOpenedDisbursed) ||
//         parseDateYYYYMMDD(acc?.Date_Opened) ||
//         parseDateYYYYMMDD(acc?.Open_Date);

//       if (dateOpened && dateOpened > latestOldDpdClosedDate) {
//         newLoanAfterOldDpd = true;
//         break;
//       }
//     }
//   }

//   const deviationEligible = closedLoanWithOldDpd && newLoanAfterOldDpd;

//   debug.flags = {
//     hasDpdIn6M,
//     hasGt30Dpd12M,
//     hasGt60DpdEver,
//     totalPanReported,
//     closedLoanWithOldDpd,
//     newLoanAfterOldDpd,
//     deviationEligible,
//   };

//   if (process.env.NODE_ENV !== "production") {
//     console.log("📊 LoanDigit Bureau Debug:");
//     console.dir(debug, { depth: null });
//   }

//   return {
//     score,
//     enquiries6m,
//     hasDpdIn6M,
//     hasGt30Dpd12M,
//     hasGt60DpdEver,
//     totalPanReported,
//     closedLoanWithOldDpd,
//     newLoanAfterOldDpd,
//     deviationEligible,
//     activeLoanCountExcludingCreditCards,
//   };
// };

// const evaluateLoanDigitPolicy = ({ loan, bureauFacts }) => {
//   const reasons = [];
//   const deviations = [];

//   const age = calculateAge(loan.dob);
// const monthlyIncome = toNumber(loan.monthly_salary, 0);
// const companyContinuity = toNumber(loan.years_in_current_job, 0);
// const occupation = String(loan.employment || "").trim().toLowerCase();

//   const bureauScore = toNumber(bureauFacts.score, null);

//   /**
//    * AGE CHECK
//    */
//   if (age === null) {
//     reasons.push("AGE_MISSING");
//   } else {
//     if (age < 23) reasons.push("AGE_BELOW_23");
//     if (age > 45) reasons.push("AGE_ABOVE_45");
//   }

//   /**
//    * OCCUPATION CHECK
//    */
// if (!occupation.includes("salary")) {
//   reasons.push("ONLY_SALARIED_ALLOWED");
// }

//   /**
//    * COMPANY CONTINUITY
//    */
//   if (companyContinuity < 6) {
//     reasons.push("COMPANY_CONTINUITY_BELOW_6M");
//   }

//   /**
//    * MONTHLY INCOME
//    */
//   if (monthlyIncome < 20000) {
//     reasons.push("MONTHLY_INCOME_BELOW_20000");
//   }

//   /**
//    * CIBIL SCORE
//    */
//   if (bureauScore === null) {
//     reasons.push("CIBIL_MISSING");
//   } else if (bureauScore < 680) {
//     reasons.push("CIBIL_BELOW_680");
//   }

//   /**
//    * ENQUIRIES CHECK
//    */
//   if (
//     bureauFacts.enquiries6m !== null &&
//     bureauFacts.enquiries6m > 5
//   ) {
//     reasons.push("ENQUIRIES_GT_5_IN_6M");
//   }

//   /**
//    * DPD LAST 6 MONTHS
//    */
//   if (bureauFacts.hasDpdIn6M) {
//     reasons.push("DPD_PRESENT_LAST_6M");
//   }

//   /**
//    * DPD >30 LAST 12 MONTHS
//    */
//   if (bureauFacts.hasGt30Dpd12M) {
//     if (bureauFacts.deviationEligible) {
//       deviations.push("GT30_DPD_12M_DEVIATION");
//     } else {
//       reasons.push("GT30_DPD_LAST_12M");
//     }
//   }

//   /**
//    * DPD >60 EVER
//    */
//   if (bureauFacts.hasGt60DpdEver) {
//     if (bureauFacts.deviationEligible) {
//       deviations.push("GT60_DPD_EVER_DEVIATION");
//     } else {
//       reasons.push("GT60_DPD_EVER");
//     }
//   }

//   /**
//    * MULTIPLE PAN CHECK
//    */
//   if (bureauFacts.totalPanReported > 1) {
//     reasons.push("MULTIPLE_PAN_REPORTED");
//   }

//   /**
//  * ACTIVE LOAN COUNT CHECK (excluding credit cards)
//  */
// if (
//   bureauFacts.activeLoanCountExcludingCreditCards !== null &&
//   bureauFacts.activeLoanCountExcludingCreditCards > 3
// ) {
//   reasons.push("ACTIVE_LOANS_GT_3_EXCL_CREDIT_CARD");
// }

//   /**
//    * FINAL STATUS
//    */
//   let status = "BRE APPROVED";

//   if (reasons.length > 0) {
//     status = "BRE FAILED";
//   } else if (deviations.length > 0) {
//     status = "Credit Recheck";
//   }

//   return {
//     status,
//     reasons,
//     deviations,
//     bureauScore,
//   };
// };

// const autoApproveLoanDigitIfAllVerified = async (lan) => {
//   const pool = db.promise();

//   // 1) KYC row
//   const [kycRows] = await pool.query(
//     `SELECT bureau_status
//      FROM kyc_verification_status
//      WHERE lan = ?`,
//     [lan]
//   );

//   if (!kycRows.length) {
//     console.log("No KYC row found for LAN:", lan);
//     return;
//   }

//   const kyc = kycRows[0];

// if (kyc.bureau_status !== "VERIFIED") {
//   await pool.query(
//     `UPDATE loan_booking_loan_digit
//      SET loandigit_bre_status = ?,
//          loandigit_bre_reason = ?,
//          loandigit_bre_checked_at = NOW()
//      WHERE lan = ?`,
//     ["Pending", `BUREAU_STATUS=${kyc.bureau_status || "NA"}`, lan]
//   );

//   return;
// }

//   // 2) Loan row
//   const [loanRows] = await pool.query(
//     `SELECT
//     lan,
//     dob,
//     employment,
//     years_in_current_job,
//     monthly_salary,
//     cibil_score
//      FROM loan_booking_loan_digit
//      WHERE lan = ?`,
//     [lan]
//   );

//   if (!loanRows.length) {
//     console.log("LoanDigit loan not found for LAN:", lan);
//     return;
//   }

//   const loan = loanRows[0];

//   // 3) Latest bureau XML
//   const [cibilRows] = await pool.query(
//     `SELECT score, report_xml, created_at
//      FROM loan_cibil_reports
//      WHERE lan = ?
//      ORDER BY created_at DESC, id DESC
//      LIMIT 1`,
//     [lan]
//   );

//   if (!cibilRows.length || !cibilRows[0].report_xml) {
//     await pool.query(
//       `UPDATE loan_booking_loan_digit
//        SET loandigit_bre_status = ?,
//            loandigit_bre_reason = ?,
//            loandigit_bre_checked_at = NOW()
//        WHERE lan = ?`,
//       ["Pending", "BUREAU_REPORT_MISSING", lan]
//     );
//     return;
//   }

//   const bureauFacts = extractLoanDigitBureauFacts(cibilRows[0].report_xml);
//   const decision = evaluateLoanDigitPolicy({ loan, bureauFacts });

//   const reasonText = [
//     ...(decision.reasons || []),
//     ...(decision.deviations || []),
//   ].length
//     ? [...decision.reasons, ...decision.deviations].join(", ")
//     : "ELIGIBLE";

//   let finalStage = "BRE_APPROVED";
//   if (decision.status === "BRE FAILED") finalStage = "BRE_REJECTED";
//   if (decision.status === "Credit Recheck") finalStage = "CREDIT_RECHECK";

//   await pool.query(
//   `UPDATE loan_booking_loan_digit
//    SET
//      loandigit_bre_status = ?,
//      loandigit_bre_reason = ?,
//      loandigit_bre_checked_at = NOW(),

//      fintree_cibil_score = ?,
//      loandigit_enquiries_6m = ?,
//      loandigit_dpd_6m_flag = ?,
//      loandigit_dpd_gt30_12m_flag = ?,
//      loandigit_dpd_gt60_ever_flag = ?,
//      loandigit_multi_pan_flag = ?,
//      loandigit_deviation_flag = ?,

//      status = ?
//    WHERE lan = ?`,
//   [
//     decision.status,
//     reasonText,

//     decision.bureauScore,
//     bureauFacts.enquiries6m,
//     bureauFacts.hasDpdIn6M ? 1 : 0,
//     bureauFacts.hasGt30Dpd12M ? 1 : 0,
//     bureauFacts.hasGt60DpdEver ? 1 : 0,
//     bureauFacts.totalPanReported > 1 ? 1 : 0,
//     bureauFacts.deviationEligible ? 1 : 0,

//     decision.status,
//     lan,
//   ]
// );

//   console.log(
//     `LoanDigit BRE completed for ${lan}: ${decision.status} | ${reasonText}`
//   );
// };

// module.exports = {
//   autoApproveLoanDigitIfAllVerified,
//   extractLoanDigitBureauFacts,
//   evaluateLoanDigitPolicy,
// };

// const db = require("../../config/db");
// const { XMLParser } = require("fast-xml-parser");

// const parser = new XMLParser({
//   ignoreAttributes: false,
//   attributeNamePrefix: "",
//   trimValues: true,

//   // Keep entity processing enabled, but raise limits for valid large bureau XML.
//   processEntities: {
//     enabled: true,
//     maxTotalExpansions: 500000,
//     maxExpandedLength: 50_000_000,
//     maxEntityCount: 500000,
//     maxEntitySize: 500000,
//   },
// });

// const toArray = (v) => {
//   if (!v) return [];
//   return Array.isArray(v) ? v : [v];
// };

// const toNumber = (v, fallback = 0) => {
//   if (v === null || v === undefined || v === "") return fallback;
//   const n = Number(v);
//   return Number.isFinite(n) ? n : fallback;
// };

// const parseDateYYYYMMDD = (s) => {
//   if (!s || String(s).length !== 8) return null;

//   const str = String(s);
//   const y = Number(str.slice(0, 4));
//   const m = Number(str.slice(4, 6)) - 1;
//   const d = Number(str.slice(6, 8));

//   const dt = new Date(y, m, d);
//   return Number.isNaN(dt.getTime()) ? null : dt;
// };

// const monthsDiff = (fromDate, toDate = new Date()) => {
//   if (!fromDate) return null;

//   return (
//     (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
//     (toDate.getMonth() - fromDate.getMonth())
//   );
// };

// const calculateAge = (dob) => {
//   if (!dob) return null;

//   const birthDate = new Date(dob);
//   if (Number.isNaN(birthDate.getTime())) return null;

//   const today = new Date();

//   let age = today.getFullYear() - birthDate.getFullYear();
//   const m = today.getMonth() - birthDate.getMonth();

//   if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
//     age--;
//   }

//   return age;
// };

// /**
//  * Extract LoanDigit bureau facts from CIBIL XML
//  *
//  * Final LoanDigit BRE:
//  * - TransUnion CIBIL score >= 680
//  * - Number of inquiries in last 3 months <= 12
//  * - DPD < 30 days, subject to no CURRENT overdue -> eligible
//  * - DPD < 60 days, subject to no CURRENT overdue -> only 1 account allowed
//  * - Any account with DPD >= 60 in last 12 months -> reject
//  * - ZERO Write-off / Settlement in last 12 months
//  */
// const extractLoanDigitBureauFacts = (reportXml) => {
//   if (!reportXml) {
//     return {
//       score: null,
//       enquiries3m: null,
//       accountsWith30To59Dpd12M: 0,
//       accountsWithDpd60Plus12M: 0,
//       hasCurrentOverdue: false,
//       hasWriteOffOrSettlement12M: false,
//     };
//   }

//   const json = parser.parse(reportXml);
//   const profile = json?.INProfileResponse || {};

//   /**
//    * TransUnion CIBIL score
//    */
//   const score =
//     toNumber(profile?.SCORE?.BureauScore, null) ??
//     toNumber(profile?.Score?.BureauScore, null) ??
//     toNumber(profile?.Score?.Value, null);

//   /**
//    * Number of inquiry in 3 months.
//    *
//    * Keeping multiple fallbacks because XML tag names may differ
//    * depending on the CIBIL response format.
//    */
//   const enquiries3m =
//     toNumber(profile?.CAPS?.CAPS_Summary?.CAPSLast90Days, null) ??
//     toNumber(profile?.CAPS?.CAPS_Summary?.CAPSLast3Months, null) ??
//     toNumber(profile?.CAPS?.CAPS_Summary?.CAPSLastThreeMonths, null);

//   const accounts = toArray(profile?.CAIS_Account?.CAIS_Account_DETAILS);

//   let hasCurrentOverdue = false;
//   let hasWriteOffOrSettlement12M = false;
//   let accountsWithDpd60Plus12M = 0;
//   let accountsWith30To59Dpd12M = 0;
//   const now = new Date();

//   const debug = {
//     score,
//     enquiries3m,
//     accountsAnalyzed: accounts.length,
//     details: [],
//     flags: {},
//   };

//   for (const acc of accounts) {
//     const histories = toArray(acc?.CAIS_Account_History);

//     const accountStatus = String(acc?.Account_Status || "")
//       .trim()
//       .toUpperCase();

//     const suitFiledOrWrittenOffStatus = String(
//       acc?.SuitFiled_WillfulDefault_WrittenOffStatus ||
//         acc?.Suit_Filed_Wilful_Default ||
//         acc?.Written_off_Settled_Status ||
//         acc?.Written_Off_Settled_Status ||
//         "",
//     )
//       .trim()
//       .toUpperCase();

//     const writtenOffAmountTotal = toNumber(
//       acc?.Written_Off_Amt_Total ?? acc?.Written_Off_Amount_Total,
//       0,
//     );
//     const writtenOffAmountPrincipal = toNumber(
//       acc?.Written_Off_Amt_Principal ?? acc?.Written_Off_Amount_Principal,
//       0,
//     );
//     const settlementAmount = toNumber(acc?.Settlement_Amount, 0);
//     const amountPastDue = toNumber(acc?.Amount_Past_Due, 0);

//     const dateReported =
//       parseDateYYYYMMDD(acc?.Date_Reported) ||
//       parseDateYYYYMMDD(acc?.DateReported) ||
//       parseDateYYYYMMDD(acc?.Date_of_Last_Payment) ||
//       parseDateYYYYMMDD(acc?.Date_Closed) ||
//       parseDateYYYYMMDD(acc?.DateClosed);

//     const reportedMonthsAgo = monthsDiff(dateReported, now);

//     const accountDebug = {
//       accountNumber: acc?.Account_Number || "NA",
//       accountStatus,
//       suitFiledOrWrittenOffStatus,
//       writtenOffAmountTotal,
//       writtenOffAmountPrincipal,
//       settlementAmount,
//       amountPastDue,
//       dateReported,
//       reportedMonthsAgo,
//       dpdHistory: [],
//     };

//     /**
//      * ZERO Write-off / Settlement in last 12 months
//      *
//      * If write-off / settlement is found but date is missing,
//      * fail it to keep the BRE conservative.
//      */
//     const hasWriteOffOrSettlement =
//       writtenOffAmountTotal > 0 ||
//       writtenOffAmountPrincipal > 0 ||
//       settlementAmount > 0 ||
//       accountStatus.includes("WRITTEN") ||
//       accountStatus.includes("WRITE") ||
//       accountStatus.includes("SETTLED") ||
//       accountStatus.includes("SETTLEMENT") ||
//       suitFiledOrWrittenOffStatus.includes("WRITTEN") ||
//       suitFiledOrWrittenOffStatus.includes("WRITE") ||
//       suitFiledOrWrittenOffStatus.includes("SETTLED") ||
//       suitFiledOrWrittenOffStatus.includes("SETTLEMENT");

//     if (
//       hasWriteOffOrSettlement &&
//       (reportedMonthsAgo === null || reportedMonthsAgo < 12)
//     ) {
//       hasWriteOffOrSettlement12M = true;
//     }

//     /**
//      * ZERO Overdue in last 12 months
//      */
//     if (
//       amountPastDue > 0 &&
//       (reportedMonthsAgo === null || reportedMonthsAgo < 12)
//     ) {
//       hasOverdue12M = true;
//     }

//     /**
//      * ZERO DPD in last 12 months
//      */
//     // Replace the DPD extraction & rule with something like this

//     // In extractLoanDigitBureauFacts, for each account:
//     let accountMaxDpd12M = 0;
//     for (const hist of histories) {
//       const year = toNumber(hist?.Year, null);
//       const month = toNumber(hist?.Month, null);
//       const dpd = toNumber(hist?.Days_Past_Due, 0);
//       if (!year || !month) continue;
//       const histDate = new Date(year, month - 1, 1);
//       const diff = monthsDiff(histDate, now);
//       if (diff === null || diff < 0 || diff >= 12) continue;
//       if (dpd > accountMaxDpd12M) accountMaxDpd12M = dpd;
//     }

//     accountDebug.dpdHistory.push({ year, month, dpd, monthsAgo: diff });
//     if (dpd > 29) hasDpd30Plus12M = true;
//     // Push per-account outcome into arrays returned by the extractor:
//     if (accountMaxDpd12M >= 60) accountsWithDpd60Plus12M++;
//     else if (accountMaxDpd12M >= 30) accountsWith30To59Dpd12M++;
//     // accountMaxDpd12M < 30 → fine

//     debug.details.push(accountDebug);
//   }

//   debug.flags = {
//     hasDpd30Plus12M,
//     hasOverdue12M,
//     hasWriteOffOrSettlement12M,
//   };

//   if (process.env.NODE_ENV !== "production") {
//     console.log("📊 LoanDigit Bureau Debug:");
//     console.dir(debug, { depth: null });
//   }

//   return {
//     score,
//     enquiries3m,
//     hasDpd30Plus12M,
//     hasOverdue12M,
//     hasWriteOffOrSettlement12M,
//     accountsWithDpd60Plus12M,
//     accountsWith30To59Dpd12M,
//   };
// };

// /**
//  * Final LoanDigit BRE evaluation
//  *
//  * Rules:
//  * - Age minimum 23, maximum 55
//  * - Occupation only salaried
//  * - Minimum continuity of last 6 months in current company
//  * - TransUnion CIBIL 680+
//  * - Number of inquiries in 3 months maximum 12
//  * - Salary INR 20,000 and above
//  * - 30 DPD or more in last 12 months -- Reject Zero Overdue in last 12 months
//  * - ZERO Write-off / Settlement last 12 months
//  */

// const getCompanyContinuityMonths = (value) => {
//   const continuityInput = String(value ?? "0").trim();

//   const [yearsPart = "0", monthsPart = "0"] = continuityInput.split(".");

//   const years = Number(yearsPart || 0);
//   const months = Number(monthsPart || 0);

//   if (Number.isNaN(years) || Number.isNaN(months)) {
//     return 0;
//   }

//   return years * 12 + months;
// };

// const evaluateLoanDigitPolicy = ({ loan, bureauFacts }) => {
//   const reasons = [];

//   const age = calculateAge(loan.dob);
//   const occupation = String(loan.employment || "")
//     .trim()
//     .toLowerCase();

//   const companyContinuityMonths = getCompanyContinuityMonths(
//     loan.years_in_current_job,
//   );

//   const monthlyIncome = toNumber(loan.monthly_salary, 0);
//   const bureauScore = toNumber(bureauFacts.score, null);

//   /**
//    * Age minimum 23, maximum 52
//    */
//   if (age === null) {
//     reasons.push("AGE_MISSING");
//   } else {
//     if (age < 23) reasons.push("AGE_BELOW_23");
//     if (age > 52) reasons.push("AGE_ABOVE_52");
//   }

//   /**
//    * Occupation only salaried
//    */
//   const normalizedOccupation = occupation.replace(/[-_\s]+/g, "").toLowerCase();

//   const eligibleOccupations = new Set(["salaried", "salary", "selfemployed"]);
//   if (!eligibleOccupations.some((o) => occupation.includes(o))) {
//     reasons.push("OCCUPATION_NOT_ELIGIBLE");
//   }

//   /**
//    * Minimum continuity of last 6 months in current company
//    */
//   if (companyContinuityMonths < 6) {
//     reasons.push("COMPANY_CONTINUITY_BELOW_6M");
//   }

//   /**
//    * Salary INR 15,000 and above
//    */
//   if (monthlyIncome < 15000) reasons.push("MONTHLY_INCOME_BELOW_15000");

//   /**
//    * TransUnion CIBIL 680+
//    */
//   if (bureauScore === null) {
//     reasons.push("CIBIL_MISSING");
//   } else if (bureauScore < 680) {
//     reasons.push("CIBIL_BELOW_680");
//   }

//   /**
//    * Number of inquiry in 3 months 12 minimum
//    */
//   if (bureauFacts.enquiries3m === null) {
//     reasons.push("ENQUIRIES_3M_MISSING");
//   } else if (bureauFacts.enquiries3m > 12) {
//     reasons.push("ENQUIRIES_GT_12_IN_3M");
//   }

//   /**
//    * ZERO DPD / Overdue last 12 months
//    */
//   if (bureauFacts.hasDpd30Plus12M) {
//     reasons.push("DPD_30_PLUS_LAST_12M");
//   }

//   if (bureauFacts.hasOverdue12M) {
//     reasons.push("OVERDUE_LAST_12M");
//   }

//   /**
//    * ZERO Write-off / Settlement last 12 months
//    */
//   if (bureauFacts.hasWriteOffOrSettlement12M) {
//     reasons.push("WRITE_OFF_OR_SETTLEMENT_LAST_12M");
//   }

//   const status = reasons.length > 0 ? "BRE FAILED" : "BRE APPROVED";

//   return {
//     status,
//     reasons,
//     bureauScore,
//   };
// };

// const autoApproveLoanDigitIfAllVerified = async (lan) => {
//   const pool = db.promise();

//   /**
//    * 1) KYC row
//    */
//   const [kycRows] = await pool.query(
//     `SELECT bureau_status
//      FROM kyc_verification_status
//      WHERE lan = ?`,
//     [lan],
//   );

//   if (!kycRows.length) {
//     console.log("No KYC row found for LAN:", lan);
//     return;
//   }

//   const kyc = kycRows[0];

//   if (kyc.bureau_status !== "VERIFIED") {
//     await pool.query(
//       `UPDATE loan_booking_loan_digit
//        SET loandigit_bre_status = ?,
//            loandigit_bre_reason = ?,
//            loandigit_bre_checked_at = NOW()
//        WHERE lan = ?`,
//       ["Pending", `BUREAU_STATUS=${kyc.bureau_status || "NA"}`, lan],
//     );

//     return;
//   }

//   /**
//    * 2) Loan row
//    *
//    * Required loan fields for final BRE:
//    * - dob
//    * - employment
//    * - years_in_current_job
//    * - monthly_salary
//    */
//   const [loanRows] = await pool.query(
//     `SELECT
//        lan,
//        dob,
//        employment,
//        years_in_current_job,
//        monthly_salary,
//        cibil_score
//      FROM loan_booking_loan_digit
//      WHERE lan = ?`,
//     [lan],
//   );

//   if (!loanRows.length) {
//     console.log("LoanDigit loan not found for LAN:", lan);
//     return;
//   }

//   const loan = loanRows[0];

//   /**
//    * 3) Latest bureau XML
//    */
//   const [cibilRows] = await pool.query(
//     `SELECT score, report_xml, created_at
//      FROM loan_cibil_reports
//      WHERE lan = ?
//      ORDER BY created_at DESC, id DESC
//      LIMIT 1`,
//     [lan],
//   );

//   if (!cibilRows.length || !cibilRows[0].report_xml) {
//     await pool.query(
//       `UPDATE loan_booking_loan_digit
//        SET loandigit_bre_status = ?,
//            loandigit_bre_reason = ?,
//            loandigit_bre_checked_at = NOW()
//        WHERE lan = ?`,
//       ["Pending", "BUREAU_REPORT_MISSING", lan],
//     );

//     return;
//   }

//   const bureauFacts = extractLoanDigitBureauFacts(cibilRows[0].report_xml);
//   const decision = evaluateLoanDigitPolicy({ loan, bureauFacts });

//   const reasonText =
//     decision.reasons && decision.reasons.length
//       ? decision.reasons.join(", ")
//       : "ELIGIBLE";

//   // const finalStage =
//   //   decision.status === "BRE FAILED" ? "BRE_REJECTED" : "BRE_APPROVED";

//   const finalStatus =
//     decision.status === "BRE APPROVED" ? "CREDIT_APPROVED" : "BRE_REJECTED";

//   /**
//    * 4) Update LoanDigit BRE result
//    *
//    * This update uses only final BRE fields.
//    */
//   await pool.query(
//     `UPDATE loan_booking_loan_digit
//      SET
//        loandigit_bre_status = ?,
//        loandigit_bre_reason = ?,
//        loandigit_bre_checked_at = NOW(),

//        fintree_cibil_score = ?,
//        loandigit_enquiries_3m = ?,
//        loandigit_dpd_or_overdue_12m_flag = ?,
//        loandigit_writeoff_settlement_12m_flag = ?,

//        status = ?
//      WHERE lan = ?`,
//     [
//       decision.status,
//       reasonText,

//       decision.bureauScore,
//       bureauFacts.enquiries3m,
//       bureauFacts.hasDpd30Plus12M || bureauFacts.hasOverdue12M ? 1 : 0,
//       bureauFacts.hasWriteOffOrSettlement12M ? 1 : 0,

//       finalStatus,
//       lan,
//     ],
//   );

//   console.log(
//     `LoanDigit BRE completed for ${lan}: ${decision.status} | ${reasonText}`,
//   );
// };

// module.exports = {
//   autoApproveLoanDigitIfAllVerified,
//   extractLoanDigitBureauFacts,
//   evaluateLoanDigitPolicy,
// };

const db = require("../../config/db");
const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,

  // Keep entity processing enabled, but raise limits for valid large bureau XML.
  processEntities: {
    enabled: true,
    maxTotalExpansions: 500000,
    maxExpandedLength: 50_000_000,
    maxEntityCount: 500000,
    maxEntitySize: 500000,
  },
});

const toArray = (v) => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

const toNumber = (v, fallback = 0) => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const parseDateYYYYMMDD = (s) => {
  if (!s || String(s).length !== 8) return null;

  const str = String(s);
  const y = Number(str.slice(0, 4));
  const m = Number(str.slice(4, 6)) - 1;
  const d = Number(str.slice(6, 8));

  const dt = new Date(y, m, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const monthsDiff = (fromDate, toDate = new Date()) => {
  if (!fromDate) return null;

  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
    (toDate.getMonth() - fromDate.getMonth())
  );
};

const calculateAge = (dob) => {
  if (!dob) return null;

  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};

/**
 * Extract LoanDigit bureau facts from CIBIL XML
 *
 * Final LoanDigit BRE (bureau side):
 * - TransUnion CIBIL score >= 680
 * - Number of inquiries in last 3 months <= 12
 * - DPD < 30 days, subject to no CURRENT overdue -> eligible
 * - DPD < 60 days, subject to no CURRENT overdue -> only 1 account allowed
 * - Any account with DPD >= 60 in last 12 months -> reject
 * - ZERO Write-off / Settlement in last 12 months
 */
const extractLoanDigitBureauFacts = (reportXml) => {
  if (!reportXml) {
    return {
      score: null,
      enquiries3m: null,
      hasCurrentOverdue: false,
      accountsWith30To59Dpd12M: 0,
      accountsWithDpd60Plus12M: 0,
      hasWriteOffOrSettlement12M: false,
    };
  }

  const json = parser.parse(reportXml);
  const profile = json?.INProfileResponse || {};

  /**
   * TransUnion CIBIL score
   */
  const score =
    toNumber(profile?.SCORE?.BureauScore, null) ??
    toNumber(profile?.Score?.BureauScore, null) ??
    toNumber(profile?.Score?.Value, null);

  /**
   * Number of inquiries in 3 months.
   * Keeping multiple fallbacks because XML tag names may differ
   * depending on the CIBIL response format.
   */
  const enquiries3m =
    toNumber(profile?.CAPS?.CAPS_Summary?.CAPSLast90Days, null) ??
    toNumber(profile?.CAPS?.CAPS_Summary?.CAPSLast3Months, null) ??
    toNumber(profile?.CAPS?.CAPS_Summary?.CAPSLastThreeMonths, null);

  const accounts = toArray(profile?.CAIS_Account?.CAIS_Account_DETAILS);

  let hasCurrentOverdue = false;
  let hasWriteOffOrSettlement12M = false;
  let accountsWith30To59Dpd12M = 0;
  let accountsWithDpd60Plus12M = 0;
  const now = new Date();

  const debug = {
    score,
    enquiries3m,
    accountsAnalyzed: accounts.length,
    details: [],
    flags: {},
  };

  for (const acc of accounts) {
    const histories = toArray(acc?.CAIS_Account_History);

    const accountStatus = String(acc?.Account_Status || "")
      .trim()
      .toUpperCase();

    // Verified against Experian ECICI spec v3.7 (Appendix P and Appendix R).
    // These two fields carry numeric STATUS CODES, not text like "WRITTEN OFF".
    //
    // Appendix P - SuitFiledWillfulDefaultWrittenOffStatus (1 char):
    //   0 Restructured, 1 Suit Filed, 2 Wilful Default, 3 Suit Filed (Wilful
    //   Default), 4 Written Off, 5 Suit Filed & Written Off, 6 Wilful Default
    //   & Written Off, 7 Suit Filed (Wilful Default) & Written Off,
    //   8 Settled, 9 Post (WO) Settled.
    //   -> codes 4-9 indicate an actual write-off/settlement.
    //
    // Appendix R - Written_off_Settled_Status / "Credit Facility Status" (2 char):
    //   00 Restructured Loan, 01 Restructured Loan (Govt Mandated),
    //   02 Written-off, 03 Settled, 04 Post (WO) Settled, 05 Account Sold,
    //   06 Written Off and Account Sold, 07 Account Purchased,
    //   08 Account Purchased and Written Off, 09 Account Purchased and Settled,
    //   10 Account Purchased and Restructured, 11 Restructured (Natural Calamity),
    //   12 Restructured (COVID-19), 13 Post Write Off Closed,
    //   14 Restructured & Closed, 15 Auctioned & Settled, 16 Repossessed & Settled,
    //   17 Guarantee Invoked, 99 Clear Existing Status (NOT a write-off).
    //   -> codes 02, 03, 04, 06, 08, 09, 13, 15, 16 indicate an actual
    //      write-off/settlement. Note: 99 ("Clear Existing Status") does NOT.
    const SUITFILED_WRITEOFF_CODES = new Set(["4", "5", "6", "7", "8", "9"]);
    const CREDIT_FACILITY_WRITEOFF_CODES = new Set([
      "02", "03", "04", "06", "08", "09", "13", "15", "16",
    ]);

    const suitFiledWrittenOffCode = String(
      acc?.SuitFiledWillfulDefaultWrittenOffStatus ?? "",
    ).trim();
    const creditFacilityStatusCode = String(
      acc?.Written_off_Settled_Status ?? "",
    )
      .trim()
      .padStart(2, "0");

    const writtenOffAmountTotal = toNumber(
      acc?.Written_Off_Amt_Total ?? acc?.Written_Off_Amount_Total,
      0,
    );
    const writtenOffAmountPrincipal = toNumber(
      acc?.Written_Off_Amt_Principal ?? acc?.Written_Off_Amount_Principal,
      0,
    );
    const settlementAmount = toNumber(acc?.Settlement_Amount, 0);
    const amountPastDue = toNumber(acc?.Amount_Past_Due, 0);

    const dateReported =
      parseDateYYYYMMDD(acc?.Date_Reported) ||
      parseDateYYYYMMDD(acc?.DateReported) ||
      parseDateYYYYMMDD(acc?.Date_of_Last_Payment) ||
      parseDateYYYYMMDD(acc?.Date_Closed) ||
      parseDateYYYYMMDD(acc?.DateClosed);

    const reportedMonthsAgo = monthsDiff(dateReported, now);

    const accountDebug = {
      accountNumber: acc?.Account_Number || "NA",
      accountStatus,
      suitFiledWrittenOffCode,
      creditFacilityStatusCode,
      writtenOffAmountTotal,
      writtenOffAmountPrincipal,
      settlementAmount,
      amountPastDue,
      dateReported,
      reportedMonthsAgo,
      accountMaxDpd12M: 0,
      dpdHistory: [],
    };

    /**
     * ZERO Write-off / Settlement in last 12 months.
     * If write-off / settlement is found but date is missing,
     * fail it to keep the BRE conservative.
     *
     * Account_Status (Appendix H) is a numeric lifecycle code (11=Active,
     * 13=Closed, etc.) and is NOT used here — write-off/settlement is
     * determined solely from the two dedicated status-code fields plus the
     * amount fields, matching how Experian itself defines
     * CAIS_Summary.Credit_Account.CreditAccountDefault.
     */
    const hasWriteOffOrSettlement =
      writtenOffAmountTotal > 0 ||
      writtenOffAmountPrincipal > 0 ||
      settlementAmount > 0 ||
      SUITFILED_WRITEOFF_CODES.has(suitFiledWrittenOffCode) ||
      CREDIT_FACILITY_WRITEOFF_CODES.has(creditFacilityStatusCode);

    if (
      hasWriteOffOrSettlement &&
      (reportedMonthsAgo === null || reportedMonthsAgo < 12)
    ) {
      hasWriteOffOrSettlement12M = true;
    }

    /**
     * CURRENT overdue (i.e. account is past due as of the latest
     * reported snapshot, within the last 12 months of data).
     * This is the gate for both the <30 and <60 DPD buckets.
     */
    if (
      amountPastDue > 0 &&
      (reportedMonthsAgo === null || reportedMonthsAgo < 12)
    ) {
      hasCurrentOverdue = true;
    }

    /**
     * Max DPD reported for this account within the last 12 months
     * of DPD history. Fixed: year/month/dpd/diff are now scoped
     * correctly and accumulated across the whole history array
     * instead of leaking out of the loop.
     */
    let accountMaxDpd12M = 0;
    for (const hist of histories) {
      const year = toNumber(hist?.Year, null);
      const month = toNumber(hist?.Month, null);
      const dpd = toNumber(hist?.Days_Past_Due, 0);

      if (!year || !month) continue;

      const histDate = new Date(year, month - 1, 1);
      const diff = monthsDiff(histDate, now);

      if (diff === null || diff < 0 || diff >= 12) continue;

      accountDebug.dpdHistory.push({ year, month, dpd, monthsAgo: diff });

      if (dpd > accountMaxDpd12M) accountMaxDpd12M = dpd;
    }

    accountDebug.accountMaxDpd12M = accountMaxDpd12M;

    /**
     * Bucket the account:
     * - >= 60 DPD in last 12M -> hard reject bucket
     * - 30-59 DPD in last 12M -> "only 1 allowed" bucket
     * - < 30 DPD -> fine (no bucket)
     */
    if (accountMaxDpd12M >= 60) {
      accountsWithDpd60Plus12M++;
    } else if (accountMaxDpd12M >= 30) {
      accountsWith30To59Dpd12M++;
    }

    debug.details.push(accountDebug);
  }

  debug.flags = {
    hasCurrentOverdue,
    accountsWith30To59Dpd12M,
    accountsWithDpd60Plus12M,
    hasWriteOffOrSettlement12M,
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("📊 LoanDigit Bureau Debug:");
    console.dir(debug, { depth: null });
  }

  return {
    score,
    enquiries3m,
    hasCurrentOverdue,
    accountsWith30To59Dpd12M,
    accountsWithDpd60Plus12M,
    hasWriteOffOrSettlement12M,
  };
};

/**
 * Final LoanDigit BRE evaluation
 *
 * Rules:
 * - Age 21-52 years
 * - Occupation: Salaried & Self Employed eligible
 * - Minimum continuity of last 6 months in current company
 * - Minimum income INR 15,000
 * - TransUnion CIBIL 680+
 * - Number of inquiries in 3 months maximum 12
 * - DPD < 30 days, subject to no current overdue -> eligible
 * - DPD < 60 days, subject to no current overdue -> only 1 account allowed
 * - No Write-off / Settlement in last 1 year
 */

const getCompanyContinuityMonths = (value) => {
  const continuityInput = String(value ?? "0").trim();

  const [yearsPart = "0", monthsPart = "0"] = continuityInput.split(".");

  const years = Number(yearsPart || 0);
  const months = Number(monthsPart || 0);

  if (Number.isNaN(years) || Number.isNaN(months)) {
    return 0;
  }

  return years * 12 + months;
};

const eligibleOccupations = new Set(["salaried", "salary", "selfemployed"]);

const evaluateLoanDigitPolicy = ({ loan, bureauFacts }) => {
  const reasons = [];

  const age = calculateAge(loan.dob);

  const occupation = String(loan.employment || "")
    .trim()
    .toLowerCase();
  const normalizedOccupation = occupation.replace(/[-_\s]+/g, "");

  const companyContinuityMonths = getCompanyContinuityMonths(
    loan.years_in_current_job,
  );

  const monthlyIncome = toNumber(loan.monthly_salary, 0);
  const bureauScore = toNumber(bureauFacts.score, null);

  /**
   * Age 21-52 years
   */
  if (age === null) {
    reasons.push("AGE_MISSING");
  } else {
    if (age < 21) reasons.push("AGE_BELOW_21");
    if (age > 52) reasons.push("AGE_ABOVE_52");
  }

  /**
   * Occupation: Salaried & Self Employed eligible
   * (bug fix: was referencing an undefined `allowed` variable before)
   */
  if (!eligibleOccupations.has(normalizedOccupation)) {
    reasons.push("OCCUPATION_NOT_ELIGIBLE");
  }

  /**
   * Minimum continuity of last 6 months in current company
   */
  if (companyContinuityMonths < 6) {
    reasons.push("COMPANY_CONTINUITY_BELOW_6M");
  }

  /**
   * Minimum income INR 15,000
   */
  if (monthlyIncome < 15000) reasons.push("MONTHLY_INCOME_BELOW_15000");

  /**
   * TransUnion CIBIL 680+
   */
  if (bureauScore === null) {
    reasons.push("CIBIL_MISSING");
  } else if (bureauScore < 680) {
    reasons.push("CIBIL_BELOW_680");
  }

  /**
   * Number of inquiries in 3 months, max 12
   */
  if (bureauFacts.enquiries3m === null) {
    reasons.push("ENQUIRIES_3M_MISSING");
  } else if (bureauFacts.enquiries3m > 12) {
    reasons.push("ENQUIRIES_GT_12_IN_3M");
  }

  /**
   * DPD / current overdue rules:
   * - Any account with DPD >= 60 in last 12M -> reject
   * - More than 1 account with DPD 30-59 in last 12M -> reject
   * - Any current overdue at all -> reject (gates both buckets above)
   */
  if (bureauFacts.hasCurrentOverdue) {
    reasons.push("CURRENT_OVERDUE");
  }

  if (bureauFacts.accountsWithDpd60Plus12M > 0) {
    reasons.push("DPD_60_PLUS_LAST_12M");
  }

  if (bureauFacts.accountsWith30To59Dpd12M > 1) {
    reasons.push("DPD_30_59_MORE_THAN_1_ACCOUNT");
  }

  /**
   * ZERO Write-off / Settlement in last 1 year
   */
  if (bureauFacts.hasWriteOffOrSettlement12M) {
    reasons.push("WRITE_OFF_OR_SETTLEMENT_LAST_12M");
  }

  const status = reasons.length > 0 ? "BRE FAILED" : "BRE APPROVED";

  return {
    status,
    reasons,
    bureauScore,
  };
};

const autoApproveLoanDigitIfAllVerified = async (lan) => {
  const pool = db.promise();

  /**
   * 1) KYC row
   */
  const [kycRows] = await pool.query(
    `SELECT bureau_status
     FROM kyc_verification_status
     WHERE lan = ?`,
    [lan],
  );

  if (!kycRows.length) {
    console.log("No KYC row found for LAN:", lan);
    return;
  }

  const kyc = kycRows[0];

  if (kyc.bureau_status !== "VERIFIED") {
    await pool.query(
      `UPDATE loan_booking_loan_digit
       SET loandigit_bre_status = ?,
           loandigit_bre_reason = ?,
           loandigit_bre_checked_at = NOW()
       WHERE lan = ?`,
      ["Pending", `BUREAU_STATUS=${kyc.bureau_status || "NA"}`, lan],
    );

    return;
  }

  /**
   * 2) Loan row
   *
   * Required loan fields for final BRE:
   * - dob
   * - employment
   * - years_in_current_job
   * - monthly_salary
   */
  const [loanRows] = await pool.query(
    `SELECT
       lan,
       dob,
       employment,
       years_in_current_job,
       monthly_salary,
       cibil_score
     FROM loan_booking_loan_digit
     WHERE lan = ?`,
    [lan],
  );

  if (!loanRows.length) {
    console.log("LoanDigit loan not found for LAN:", lan);
    return;
  }

  const loan = loanRows[0];

  /**
   * 3) Latest bureau XML
   */
  const [cibilRows] = await pool.query(
    `SELECT score, report_xml, created_at
     FROM loan_cibil_reports
     WHERE lan = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [lan],
  );

  if (!cibilRows.length || !cibilRows[0].report_xml) {
    await pool.query(
      `UPDATE loan_booking_loan_digit
       SET loandigit_bre_status = ?,
           loandigit_bre_reason = ?,
           loandigit_bre_checked_at = NOW()
       WHERE lan = ?`,
      ["Pending", "BUREAU_REPORT_MISSING", lan],
    );

    return;
  }

  const bureauFacts = extractLoanDigitBureauFacts(cibilRows[0].report_xml);
  const decision = evaluateLoanDigitPolicy({ loan, bureauFacts });

  const reasonText =
    decision.reasons && decision.reasons.length
      ? decision.reasons.join(", ")
      : "ELIGIBLE";

  const finalStatus =
    decision.status === "BRE APPROVED" ? "CREDIT_APPROVED" : "BRE_REJECTED";

  /**
   * 4) Update LoanDigit BRE result
   *
   * NOTE: `loandigit_dpd_or_overdue_12m_flag` now reflects the combined
   * DPD/overdue reject condition (current overdue OR 60+ DPD OR >1
   * account with 30-59 DPD). If you want these tracked as separate DB
   * columns instead of one flag, let me know and I'll split them out.
   */
  await pool.query(
    `UPDATE loan_booking_loan_digit
     SET
       loandigit_bre_status = ?,
       loandigit_bre_reason = ?,
       loandigit_bre_checked_at = NOW(),

       fintree_cibil_score = ?,
       loandigit_enquiries_3m = ?,
       loandigit_dpd_or_overdue_12m_flag = ?,
       loandigit_writeoff_settlement_12m_flag = ?,

       status = ?
     WHERE lan = ?`,
    [
      decision.status,
      reasonText,

      decision.bureauScore,
      bureauFacts.enquiries3m,
      bureauFacts.hasCurrentOverdue ||
      bureauFacts.accountsWithDpd60Plus12M > 0 ||
      bureauFacts.accountsWith30To59Dpd12M > 1
        ? 1
        : 0,
      bureauFacts.hasWriteOffOrSettlement12M ? 1 : 0,

      finalStatus,
      lan,
    ],
  );

  console.log(
    `LoanDigit BRE completed for ${lan}: ${decision.status} | ${reasonText}`,
  );
};

module.exports = {
  autoApproveLoanDigitIfAllVerified,
  extractLoanDigitBureauFacts,
  evaluateLoanDigitPolicy,
};