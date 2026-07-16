// /**
//  * Screening service — orchestrates: build payload → audit row → call AS504
//  * → persist response + hits → return decision (PROCEED / REVIEW / STOP / ERROR).
//  */
// const pool = require('../../config/db');
// const { buildPurpose01Payload } = require('../../services/trackwizz/payloadBuilder');
// const { callAs504, parsePurpose01Response, As504Error } = require('./as504Client');

// // If TrackWizz is unreachable, what should the lead do?
// // 'BLOCK'  -> treat as REVIEW (safer, compliance-friendly default)
// // 'ALLOW'  -> let the lead through, flag for later re-screen
// const ON_ERROR_POLICY = process.env.TW_ON_ERROR_POLICY || 'BLOCK';

// const ACTION_MAP = { Proceed: 'PROCEED', Review: 'REVIEW', Stop: 'STOP' };

// async function screenLead(lead) {
//   const { requestId, payload } = buildPurpose01Payload(lead);

//   // 1. audit row first — never call an external compliance API without a trail
//   const [ins] = await pool.execute(
//     `INSERT INTO screening_requests
//        (request_id, lead_id, source_system_customer_code, purpose, request_payload, status)
//      VALUES (?, ?, ?, '01', ?, 'PENDING')`,
//     [
//       requestId,
//       lead.leadId,
//       payload.customerList[0].sourceSystemCustomerCode,
//       JSON.stringify(payload),
//     ]
//   );
//   const screeningRequestId = ins.insertId;

//   try {
//     // 2. call TrackWizz
//     const { httpStatus, body } = await callAs504(payload);
//     const result = parsePurpose01Response(body);

//     // 3. persist result (store raw response minus the bulky base64 report,
//     //    which goes to its own column)
//     const rawForAudit = JSON.parse(JSON.stringify(body));
//     try {
//       const d = rawForAudit.response?.customerResponse?.[0]?.purposeResponse?.[0]?.data;
//       if (d && d.reportData) d.reportData = '[stored in report_data column]';
//     } catch (_) { /* best effort */ }

//     await pool.execute(
//       `UPDATE screening_requests SET
//          response_payload = ?, http_status = ?, overall_status = ?,
//          validation_outcome = ?, suggested_action = ?, hits_detected = ?,
//          hits_count = ?, confirmed_hits = ?, profile_code = ?, report_data = ?,
//          case_id = ?, case_url = ?, validation_failure_count = ?, report_data = ?,
//          error_code = ?, error_message = ?,
//          status = ?
//        WHERE id = ?`,
//       [
//         JSON.stringify(rawForAudit),
//         httpStatus,
//         result.overallStatus,
//         result.validationOutcome,
//         result.suggestedAction,
//         result.hitsDetected,
//         result.hitsCount,
//         result.confirmedHits,
//         result.profileCode,
//         result.caseId,
//         result.caseUrl,
//         result.validationFailureCount ?? 0,
//         result.reportData,
//         result.validationCode || null,
//         result.validationDescription || null,
//         result.validationOutcome === 'Success' ? 'COMPLETED' : 'FAILED',
//         screeningRequestId,
//       ]
//     );

//     // 4. persist individual hits
//     if (result.hits.length) {
//       const values = result.hits.map(h => [
//         screeningRequestId, h.source, h.watchlistSourceId,
//         h.matchType, h.score, h.confirmedMatchingAttributes,
//       ]);
//       await pool.query(
//         `INSERT INTO screening_hits
//            (screening_request_id, source, watchlist_source_id, match_type, score, confirmed_matching_attributes)
//          VALUES ?`,
//         [values]
//       );
//     }

//     // 5. decision
//     if (result.validationOutcome !== 'Success') {
//       return {
//         decision: 'ERROR',
//         reason: `TrackWizz field validation failed: ${result.validationDescription || result.validationCode}`,
//         screeningRequestId,
//         requestId,
//         result,
//       };
//     }

//     return {
//       decision: ACTION_MAP[result.suggestedAction] || 'REVIEW',
//       screeningRequestId,
//       requestId,
//       hitsCount: result.hitsCount,
//       confirmedHits: result.confirmedHits === 'Yes',
//       hits: result.hits,
//       hasReport: Boolean(result.reportData),
//       result,
//     };
//   } catch (err) {
//     const isAs504 = err instanceof As504Error;
//     await pool.execute(
//   `UPDATE screening_requests SET
//      response_payload = ?, http_status = ?, overall_status = ?,
//      validation_outcome = ?, suggested_action = ?, hits_detected = ?,
//      hits_count = ?, confirmed_hits = ?, profile_code = ?,
//      case_id = ?, case_url = ?, validation_failure_count = ?,
//      report_data = ?, error_code = ?, error_message = ?, status = ?
//    WHERE id = ?`,
//   [
//     JSON.stringify(rawForAudit),
//     httpStatus ?? null,
//     result.overallStatus ?? null,          // "AcceptedByTW"
//     result.validationOutcome ?? null,      // "Success"
//     result.suggestedAction ?? null,        // "Review"
//     result.hitsDetected ?? null,           // "Yes"
//     result.hitsCount ?? 0,                 // 1
//     result.confirmedHits ?? null,          // "No"
//     result.profileCode ?? null,            // "CUSSP1"
//     result.caseId ?? null,                 // not returned for purpose 01
//     result.caseUrl ?? null,                // not returned for purpose 01
//     result.validationFailureCount ?? 0,    // 0
//     result.reportData ?? null,             // base64 PDF
//     result.validationCode || null,         // "" -> null
//     result.validationDescription || null,  // "" -> null
//     result.validationOutcome === 'Success' ? 'COMPLETED' : 'FAILED',
//     screeningRequestId,
//   ]
// );

//     return {
//       decision: ON_ERROR_POLICY === 'ALLOW' ? 'PROCEED' : 'REVIEW',
//       degraded: true, // screening did not complete — schedule a re-screen
//       reason: err.message,
//       retryable: isAs504 ? err.transient : false,
//       screeningRequestId,
//       requestId,
//     };
//   }
// }

// /** Fetch the base64 PDF screening report for a completed request. */
// async function getScreeningReport(screeningRequestId) {
//   const [rows] = await pool.execute(
//     'SELECT report_data FROM screening_requests WHERE id = ?',
//     [screeningRequestId]
//   );
//   return rows[0]?.report_data || null;
// }

// /**
//  * Screen a loan_booking_switch_my_loan row by id and write the outcome back
//  * to its aml_* columns:
//  *   aml_status         PROCEED / REVIEW / STOP / ERROR
//  *   aml_score          highest hit score (null when no hits)
//  *   aml_total_matches  hitsCount
//  *   aml_reason         short human-readable summary (<=255 chars)
//  *   aml_api_response   raw AS504 response JSON (reportData stripped — the
//  *                      full report lives in screening_requests.report_data)
//  *   aml_checked_at     NOW()
//  */
// async function screenLoanBooking(loanId) {
//   const { getLeadFromLoanBooking } = require('./loanBookingAdapter');
//   const lead = await getLeadFromLoanBooking(loanId);
//   const outcome = await screenLead(lead);

//   let amlScore = null;
//   let reason;

//   if (outcome.degraded) {
//     reason = `Screening unavailable: ${outcome.reason}`.slice(0, 255);
//   } else if (outcome.decision === 'ERROR') {
//     reason = (outcome.reason || 'TrackWizz validation failure').slice(0, 255);
//   } else if (outcome.hitsCount > 0) {
//     amlScore = Math.max(...outcome.hits.map(h => Number(h.score) || 0));
//     const top = outcome.hits
//       .slice()
//       .sort((a, b) => (b.score || 0) - (a.score || 0))
//       .slice(0, 3)
//       .map(h => `${h.source} (${h.matchType}, ${h.score})`)
//       .join('; ');
//     reason = `${outcome.hitsCount} hit(s): ${top}`.slice(0, 255);
//   } else {
//     reason = 'No watchlist hits';
//   }

//   const amlStatus = outcome.degraded ? 'ERROR' : outcome.decision; // fits varchar(20)

//   const rawResponse = outcome.result
//     ? JSON.stringify({ ...outcome.result, reportData: outcome.result.reportData ? '[see screening_requests.report_data]' : null })
//     : null;

//   await pool.execute(
//     `UPDATE loan_booking_switch_my_loan SET
//        aml_status = ?, aml_score = ?, aml_total_matches = ?,
//        aml_reason = ?, aml_api_response = ?, aml_checked_at = NOW()
//      WHERE id = ?`,
//     [amlStatus, amlScore, outcome.hitsCount ?? null, reason, rawResponse, loanId]
//   );

//   return { ...outcome, amlStatus, amlScore, amlReason: reason };
// }

// module.exports = { screenLead, screenLoanBooking, getScreeningReport };

/**
 * src/services/trackwizz/screeningService.js
 *
 * Partner-wise TrackWizz screening workflow:
 *
 * partnerKey + LAN
 *      ↓
 * Fetch canonical lead
 *      ↓
 * Build AS504 Purpose-01 payload
 *      ↓
 * Create screening audit row
 *      ↓
 * Call TrackWizz
 *      ↓
 * Store response and individual hits
 *      ↓
 * Update the partner's loan-booking AML columns
 */

// const pool = require("../../config/db");

// const { buildPurpose01Payload } = require("./payloadBuilder");

// const {
//   callAs504,
//   parsePurpose01Response,
//   As504Error,
// } = require("./as504Client");

// const { getLeadByLan, getPartnerConfig } = require("./loanBookingAdapter");

// /* ───────────────────────── Configuration ───────────────────────── */

// const ON_ERROR_POLICY = String(process.env.TW_ON_ERROR_POLICY || "BLOCK")
//   .trim()
//   .toUpperCase();

// const ACTION_MAP = Object.freeze({
//   proceed: "PROCEED",
//   review: "REVIEW",
//   stop: "STOP",
// });

// /* ───────────────────────── General helpers ───────────────────────── */

// function quoteIdentifier(identifier) {
//   if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
//     const err = new Error(`Invalid SQL identifier "${identifier}"`);

//     err.code = "INVALID_SQL_IDENTIFIER";
//     throw err;
//   }

//   return `\`${identifier}\``;
// }

// function truncate(value, length = 255) {
//   if (value === null || value === undefined) {
//     return "";
//   }

//   return String(value).slice(0, length);
// }

// function serializeJson(value) {
//   if (value === null || value === undefined) {
//     return null;
//   }

//   if (typeof value === "string") {
//     return value;
//   }

//   try {
//     return JSON.stringify(value);
//   } catch (_) {
//     return JSON.stringify({
//       serializationError: true,
//       message: "Unable to serialize value",
//     });
//   }
// }

// /**
//  * Remove the large base64 report from the raw response stored
//  * in response_payload.
//  *
//  * The original report is stored separately in report_data.
//  */
// function prepareResponseForAudit(body) {
//   if (body === null || body === undefined) {
//     return null;
//   }

//   let auditResponse;

//   try {
//     auditResponse = JSON.parse(JSON.stringify(body));
//   } catch (_) {
//     return body;
//   }

//   const customerResponses = auditResponse.response?.customerResponse;

//   if (!Array.isArray(customerResponses)) {
//     return auditResponse;
//   }

//   for (const customerResponse of customerResponses) {
//     const purposeResponses = customerResponse?.purposeResponse;

//     if (!Array.isArray(purposeResponses)) {
//       continue;
//     }

//     for (const purposeResponse of purposeResponses) {
//       if (purposeResponse?.data?.reportData) {
//         purposeResponse.data.reportData = "[stored in report_data column]";
//       }
//     }
//   }

//   return auditResponse;
// }

// function normalizeHits(result) {
//   return Array.isArray(result?.hits) ? result.hits : [];
// }

// function getDecision(suggestedAction) {
//   const normalized = String(suggestedAction || "")
//     .trim()
//     .toLowerCase();

//   return ACTION_MAP[normalized] || "REVIEW";
// }

// /* ───────────────────── Screening-request persistence ───────────────────── */

// async function createScreeningAudit({ requestId, lead, payload }) {
//   const customer = payload.customerList?.[0] || {};

//   const [insertResult] = await pool.execute(
//     `
//       INSERT INTO screening_requests
//       (
//         request_id,
//         lead_id,
//         source_system_customer_code,
//         purpose,
//         request_payload,
//         status
//       )
//       VALUES (?, ?, ?, '01', ?, 'PENDING')
//     `,
//     [
//       requestId,
//       lead.leadId,
//       customer.sourceSystemCustomerCode,
//       JSON.stringify(payload),
//     ],
//   );

//   return insertResult.insertId;
// }

// async function persistSuccessfulResponse({
//   screeningRequestId,
//   httpStatus,
//   body,
//   result,
// }) {
//   const rawForAudit = prepareResponseForAudit(body);

//   const status =
//     result.validationOutcome === "Success" ? "COMPLETED" : "FAILED";

//   await pool.execute(
//     `
//       UPDATE screening_requests
//       SET
//         response_payload = ?,
//         http_status = ?,
//         overall_status = ?,
//         validation_outcome = ?,
//         suggested_action = ?,
//         hits_detected = ?,
//         hits_count = ?,
//         confirmed_hits = ?,
//         profile_code = ?,
//         case_id = ?,
//         case_url = ?,
//         validation_failure_count = ?,
//         report_data = ?,
//         error_code = ?,
//         error_message = ?,
//         status = ?
//       WHERE id = ?
//     `,
//     [
//       serializeJson(rawForAudit),
//       httpStatus ?? null,
//       result.overallStatus ?? null,
//       result.validationOutcome ?? null,
//       result.suggestedAction ?? null,
//       result.hitsDetected ?? null,
//       result.hitsCount ?? 0,
//       result.confirmedHits ?? null,
//       result.profileCode ?? null,
//       result.caseId ?? null,
//       result.caseUrl ?? null,
//       result.validationFailureCount ?? 0,
//       result.reportData ?? null,
//       result.validationCode || null,
//       result.validationDescription || null,
//       status,
//       screeningRequestId,
//     ],
//   );

//   return rawForAudit;
// }

// async function persistScreeningFailure({ screeningRequestId, error }) {
//   const httpStatus =
//     error.httpStatus ?? error.status ?? error.response?.status ?? null;

//   const errorPayload =
//     error.body ?? error.responseBody ?? error.response?.data ?? null;

//   const errorCode =
//     error.code ||
//     (error instanceof As504Error ? "AS504_ERROR" : "SCREENING_ERROR");

//   await pool.execute(
//     `
//       UPDATE screening_requests
//       SET
//         response_payload = ?,
//         http_status = ?,
//         error_code = ?,
//         error_message = ?,
//         status = 'FAILED'
//       WHERE id = ?
//     `,
//     [
//       serializeJson(errorPayload),
//       httpStatus,
//       errorCode,
//       truncate(error.message || "TrackWizz screening failed", 1000),
//       screeningRequestId,
//     ],
//   );
// }

// async function persistScreeningHits(screeningRequestId, hits) {
//   if (!Array.isArray(hits) || !hits.length) {
//     return;
//   }

//   const values = hits.map((hit) => [
//     screeningRequestId,
//     hit.source ?? null,
//     hit.watchlistSourceId ?? null,
//     hit.matchType ?? null,
//     hit.score ?? null,
//     serializeJson(hit.confirmedMatchingAttributes),
//   ]);

//   await pool.query(
//     `
//       INSERT INTO screening_hits
//       (
//         screening_request_id,
//         source,
//         watchlist_source_id,
//         match_type,
//         score,
//         confirmed_matching_attributes
//       )
//       VALUES ?
//     `,
//     [values],
//   );
// }

// /* ───────────────────────── Main screening call ───────────────────────── */

// /**
//  * Screen an already-built canonical lead.
//  *
//  * The lead should contain:
//  *
//  * {
//  *   partner,
//  *   leadId,
//  *   lan,
//  *   customerCode,
//  *   applicationRefNumber,
//  *   fullName,
//  *   fatherName,
//  *   pan,
//  *   mobile,
//  *   email,
//  *   dob,
//  *   gender,
//  *   createdAt
//  * }
//  */
// async function screenLead(lead) {
//   /*
//    * Payload validation happens before inserting the audit row.
//    * No external API call occurs if payload creation fails.
//    */
//   const { requestId, payload } = buildPurpose01Payload(lead);

//   /*
//    * Always create the audit row before calling TrackWizz.
//    */
//   const screeningRequestId = await createScreeningAudit({
//     requestId,
//     lead,
//     payload,
//   });

//   try {
//     const { httpStatus, body } = await callAs504(payload);

//     const result = parsePurpose01Response(body);

//     const hits = normalizeHits(result);

//     const rawResponse = await persistSuccessfulResponse({
//       screeningRequestId,
//       httpStatus,
//       body,
//       result,
//     });

//     await persistScreeningHits(screeningRequestId, hits);

//     /*
//      * TrackWizz accepted the HTTP request but rejected
//      * one or more payload fields.
//      */
//     if (result.validationOutcome !== "Success") {
//       const validationReason =
//         result.validationDescription ||
//         result.validationCode ||
//         "Unknown TrackWizz validation error";

//       return {
//         decision: "ERROR",
//         degraded: false,

//         reason: `TrackWizz field validation failed: ` + validationReason,

//         partner: lead.partner,
//         leadId: lead.leadId,
//         lan: lead.lan,

//         screeningRequestId,
//         requestId,

//         hitsCount: result.hitsCount ?? hits.length,

//         confirmedHits: result.confirmedHits === "Yes",

//         hits,
//         hasReport: Boolean(result.reportData),

//         rawResponse,
//         result,
//       };
//     }

//     return {
//       decision: getDecision(result.suggestedAction),

//       degraded: false,

//       partner: lead.partner,
//       leadId: lead.leadId,
//       lan: lead.lan,

//       screeningRequestId,
//       requestId,

//       hitsCount: result.hitsCount ?? hits.length,

//       confirmedHits: result.confirmedHits === "Yes",

//       hits,

//       hasReport: Boolean(result.reportData),

//       rawResponse,
//       result,
//     };
//   } catch (error) {
//     const isAs504Error = error instanceof As504Error;

//     /*
//      * Do not allow an audit persistence failure to hide
//      * the original TrackWizz/API error.
//      */
//     try {
//       await persistScreeningFailure({
//         screeningRequestId,
//         error,
//       });
//     } catch (auditError) {
//       console.error("Unable to persist TrackWizz screening failure", {
//         screeningRequestId,
//         originalError: error.message,
//         auditError: auditError.message,
//       });
//     }

//     return {
//       decision: ON_ERROR_POLICY === "ALLOW" ? "PROCEED" : "REVIEW",

//       degraded: true,

//       reason: error.message || "TrackWizz screening failed",

//       retryable: isAs504Error ? Boolean(error.transient) : false,

//       partner: lead.partner,
//       leadId: lead.leadId,
//       lan: lead.lan,

//       screeningRequestId,
//       requestId,

//       hitsCount: null,
//       confirmedHits: false,
//       hits: [],
//       hasReport: false,

//       rawResponse: null,
//       result: null,
//     };
//   }
// }

// /* ───────────────────────── AML result helpers ───────────────────────── */

// function getHighestAmlScore(outcome) {
//   const hits = Array.isArray(outcome.hits) ? outcome.hits : [];

//   if (!hits.length) {
//     return null;
//   }

//   const scores = hits.map((hit) => Number(hit.score)).filter(Number.isFinite);

//   if (!scores.length) {
//     return null;
//   }

//   return Math.max(...scores);
// }

// function buildAmlReason(outcome) {
//   const hits = Array.isArray(outcome.hits) ? outcome.hits : [];

//   if (outcome.degraded) {
//     return truncate(
//       `Screening unavailable: ${outcome.reason || "Unknown error"}`,
//     );
//   }

//   if (outcome.decision === "ERROR") {
//     return truncate(outcome.reason || "TrackWizz validation failure");
//   }

//   if (Number(outcome.hitsCount) > 0) {
//     if (!hits.length) {
//       return truncate(
//         `${outcome.hitsCount} hit(s) reported; ` + "hit details unavailable",
//       );
//     }

//     const topHits = hits
//       .slice()
//       .sort(
//         (left, right) => (Number(right.score) || 0) - (Number(left.score) || 0),
//       )
//       .slice(0, 3)
//       .map((hit) => {
//         const source = hit.source || "Unknown source";

//         const matchType = hit.matchType || "Unknown match";

//         const score = hit.score ?? 0;

//         return `${source} ` + `(${matchType}, ${score})`;
//       })
//       .join("; ");

//     return truncate(`${outcome.hitsCount} hit(s): ${topHits}`);
//   }

//   return "No watchlist hits";
// }

// function buildAmlApiResponse(outcome) {
//   if (!outcome.rawResponse) {
//     return null;
//   }

//   return serializeJson(outcome.rawResponse);
// }

// /* ───────────────────── Partner loan-table update ───────────────────── */

// /**
//  * Update the AML columns of the resolved partner booking row.
//  *
//  * Required partner configuration:
//  *
//  * amlColumns: {
//  *   status: "aml_status",
//  *   score: "aml_score",
//  *   totalMatches: "aml_total_matches",
//  *   reason: "aml_reason",
//  *   apiResponse: "aml_api_response",
//  *   checkedAt: "aml_checked_at"
//  * }
//  */
// async function updatePartnerAmlResult({ partnerKey, lead, outcome }) {
//   const cfg = getPartnerConfig(partnerKey);

//   if (!cfg.amlColumns) {
//     const err = new Error(`[${partnerKey}] AML columns are not configured`);

//     err.code = "AML_COLUMNS_NOT_CONFIGURED";

//     throw err;
//   }

//   const requiredAmlFields = [
//     "status",
//     "score",
//     "totalMatches",
//     "reason",
//     "apiResponse",
//     "checkedAt",
//   ];

//   const missingFields = requiredAmlFields.filter(
//     (field) => !cfg.amlColumns[field],
//   );

//   if (missingFields.length) {
//     const err = new Error(
//       `[${partnerKey}] missing AML column mappings: ` +
//         missingFields.join(", "),
//     );

//     err.code = "AML_COLUMN_MAPPING_INCOMPLETE";

//     throw err;
//   }

//   const amlStatus = outcome.degraded ? "ERROR" : outcome.decision;

//   const amlScore = getHighestAmlScore(outcome);

//   const amlReason = buildAmlReason(outcome);

//   const amlApiResponse = buildAmlApiResponse(outcome);

//   const table = quoteIdentifier(cfg.table);

//   const primaryKey = quoteIdentifier(cfg.primaryKey || "id");

//   const statusColumn = quoteIdentifier(cfg.amlColumns.status);

//   const scoreColumn = quoteIdentifier(cfg.amlColumns.score);

//   const totalMatchesColumn = quoteIdentifier(cfg.amlColumns.totalMatches);

//   const reasonColumn = quoteIdentifier(cfg.amlColumns.reason);

//   const apiResponseColumn = quoteIdentifier(cfg.amlColumns.apiResponse);

//   const checkedAtColumn = quoteIdentifier(cfg.amlColumns.checkedAt);

//   await pool.execute(
//     `
//       UPDATE ${table}
//       SET
//         ${statusColumn} = ?,
//         ${scoreColumn} = ?,
//         ${totalMatchesColumn} = ?,
//         ${reasonColumn} = ?,
//         ${apiResponseColumn} = ?,
//         ${checkedAtColumn} = NOW()
//       WHERE ${primaryKey} = ?
//       LIMIT 1
//     `,
//     [
//       amlStatus,
//       amlScore,
//       outcome.hitsCount ?? null,
//       amlReason,
//       amlApiResponse,
//       lead.leadId,
//     ],
//   );

//   return {
//     amlStatus,
//     amlScore,
//     amlReason,
//   };
// }

// /* ───────────────────── Partner-wise LAN workflow ───────────────────── */

// /**
//  * Screen any registered partner's loan using LAN.
//  *
//  * Examples:
//  *
//  * screenLoanBooking(
//  *   "switch_my_loan",
//  *   "SML000123"
//  * );
//  *
//  * screenLoanBooking(
//  *   "partner_two",
//  *   "PARTNER000456"
//  * );
//  */
// async function screenLoanBooking(partnerKey, lan) {
//   /*
//    * getLeadByLan uses the PARTNERS registry to choose
//    * the correct table and LAN column.
//    */
//   const lead = await getLeadByLan(partnerKey, lan);

//   const outcome = await screenLead(lead);

//   const amlResult = await updatePartnerAmlResult({
//     partnerKey,
//     lead,
//     outcome,
//   });

//   return {
//     ...outcome,

//     partner: partnerKey,
//     leadId: lead.leadId,
//     lan: lead.lan,

//     ...amlResult,
//   };
// }

// /* ───────────────────────── Report retrieval ───────────────────────── */

// /**
//  * Return the stored TrackWizz base64 PDF report.
//  */
// async function getScreeningReport(screeningRequestId) {
//   const normalizedId = String(screeningRequestId || "").trim();

//   if (!/^\d+$/.test(normalizedId)) {
//     const err = new Error("Valid screening request ID is required");

//     err.code = "INVALID_SCREENING_REQUEST_ID";

//     throw err;
//   }

//   const [rows] = await pool.execute(
//     `
//       SELECT report_data
//       FROM screening_requests
//       WHERE id = ?
//       LIMIT 1
//     `,
//     [normalizedId],
//   );

//   return rows[0]?.report_data || null;
// }

// module.exports = {
//   screenLead,
//   screenLoanBooking,
//   getScreeningReport,

//   // Exported for unit tests.
//   getHighestAmlScore,
//   buildAmlReason,
//   prepareResponseForAudit,
// };

/**
 * src/services/trackwizz/screeningService.js
 *
 * Partner-wise TrackWizz AML screening:
 *
 * partnerKey + LAN
 *      ↓
 * Fetch canonical lead
 *      ↓
 * Build Purpose-01 payload
 *      ↓
 * Create audit record
 *      ↓
 * Call TrackWizz
 *      ↓
 * Parse AML response
 *      ↓
 * Convert base64 reportData to PDF Buffer
 *      ↓
 * Store PDF against partnerKey + LAN
 *      ↓
 * Store hits and update partner AML columns
 */

const pool = require("../../config/db");
const fs = require("fs");
const path = require("path");

const { buildPurpose01Payload } = require("./payloadBuilder");

const {
  callAs504,
  parsePurpose01Response,
  As504Error,
} = require("./as504Client");

const { getLeadByLan, getPartnerConfig } = require("./loanBookingAdapter");

/* ───────────────────────── Configuration ───────────────────────── */

const ON_ERROR_POLICY =
  String(process.env.TW_ON_ERROR_POLICY || "BLOCK")
    .trim()
    .toUpperCase() === "ALLOW"
    ? "ALLOW"
    : "BLOCK";

const parsedMaxReportBytes = Number(process.env.TW_MAX_REPORT_BYTES);

const MAX_REPORT_BYTES =
  Number.isFinite(parsedMaxReportBytes) && parsedMaxReportBytes > 0
    ? parsedMaxReportBytes
    : 25 * 1024 * 1024;

const ACTION_MAP = Object.freeze({
  proceed: "PROCEED",
  review: "REVIEW",
  stop: "STOP",
});

/* ───────────────────────── Generic helpers ───────────────────────── */

function quoteIdentifier(identifier) {
  const value = String(identifier || "");

  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    const err = new Error(`Invalid SQL identifier "${value}"`);

    err.code = "INVALID_SQL_IDENTIFIER";
    throw err;
  }

  return `\`${value}\``;
}

function truncate(value, maxLength = 255) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).slice(0, maxLength);
}

function serializeJson(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch (_) {
      return JSON.stringify({
        raw: value,
      });
    }
  }

  try {
    return JSON.stringify(value);
  } catch (_) {
    return JSON.stringify({
      serializationError: true,
      message: "Unable to serialize value",
    });
  }
}

function equalsIgnoreCase(left, right) {
  return (
    String(left || "")
      .trim()
      .toLowerCase() ===
    String(right || "")
      .trim()
      .toLowerCase()
  );
}

function normalizeHits(result) {
  return Array.isArray(result?.hits) ? result.hits : [];
}

function normalizeHitsCount(result, hits) {
  const value = Number(result?.hitsCount);

  return Number.isFinite(value) ? value : hits.length;
}

function getDecision(suggestedAction) {
  const action = String(suggestedAction || "")
    .trim()
    .toLowerCase();

  return ACTION_MAP[action] || "REVIEW";
}

function safeFilePart(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "unknown";
}

function makeReportOutputPath(partnerKey, lan) {
  const outDir = path.join(__dirname, "../../uploads");

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const filename =
    `${safeFilePart(lan)}_${Date.now()}.pdf`;

  return { filename, filePath: path.join(outDir, filename) };
}

function buildReportFileName(partnerKey, lan) {
  return `${safeFilePart(partnerKey)}-` + `${safeFilePart(lan)}-aml-report.pdf`;
}

/* ───────────────────── Base64 PDF conversion ───────────────────── */

/**
 * Convert TrackWizz reportData into an actual PDF Buffer.
 *
 * Supports:
 *   JVBERi0xLjQK...
 *
 * and:
 *   data:application/pdf;base64,JVBERi0xLjQK...
 */
function base64ToPdfBuffer(reportData) {
  if (!reportData) {
    return null;
  }

  let pdfBuffer;

  if (Buffer.isBuffer(reportData)) {
    pdfBuffer = reportData;
  } else {
    let base64 = String(reportData)
      .trim()
      .replace(/^data:application\/pdf;base64,/i, "")
      .replace(/\s+/g, "");

    if (!base64) {
      return null;
    }

    /*
     * A valid base64 string cannot have a remainder of 1.
     */
    if (base64.length % 4 === 1) {
      const err = new Error("TrackWizz reportData contains invalid base64");

      err.code = "INVALID_REPORT_BASE64";
      throw err;
    }

    /*
     * Add missing padding where necessary.
     */
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }

    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      const err = new Error(
        "TrackWizz reportData contains invalid base64 characters",
      );

      err.code = "INVALID_REPORT_BASE64";
      throw err;
    }

    pdfBuffer = Buffer.from(base64, "base64");
  }

  if (!pdfBuffer.length) {
    const err = new Error("TrackWizz PDF report is empty");

    err.code = "EMPTY_REPORT_PDF";
    throw err;
  }

  if (pdfBuffer.length > MAX_REPORT_BYTES) {
    const err = new Error(
      `TrackWizz PDF exceeds maximum size of ` + `${MAX_REPORT_BYTES} bytes`,
    );

    err.code = "REPORT_PDF_TOO_LARGE";
    throw err;
  }

  /*
   * PDF files start with the ASCII signature %PDF-
   */
  const pdfSignature = pdfBuffer.subarray(0, 5).toString("ascii");

  if (pdfSignature !== "%PDF-") {
    const err = new Error("Decoded TrackWizz report is not a valid PDF");

    err.code = "INVALID_REPORT_PDF";
    throw err;
  }

  return pdfBuffer;
}

/* ───────────────────── Response redaction ───────────────────── */

/**
 * Remove base64 reportData before storing the raw JSON response.
 *
 * The decoded PDF is stored separately in report_pdf.
 */
function prepareResponseForAudit(body) {
  if (body === null || body === undefined) {
    return null;
  }

  let auditResponse;

  try {
    if (typeof body === "string") {
      auditResponse = JSON.parse(body);
    } else {
      auditResponse = JSON.parse(JSON.stringify(body));
    }
  } catch (_) {
    return body;
  }

  const customerResponses = auditResponse?.response?.customerResponse;

  if (!Array.isArray(customerResponses)) {
    return auditResponse;
  }

  for (const customerResponse of customerResponses) {
    const purposeResponses = customerResponse?.purposeResponse;

    if (!Array.isArray(purposeResponses)) {
      continue;
    }

    for (const purposeResponse of purposeResponses) {
      if (purposeResponse?.data?.reportData) {
        purposeResponse.data.reportData =
          "[stored in screening_requests.report_pdf]";
      }
    }
  }

  return auditResponse;
}

/* ───────────────────────── Error helpers ───────────────────────── */

function getErrorHttpStatus(error) {
  return error?.httpStatus ?? error?.status ?? error?.response?.status ?? null;
}

function getErrorPayload(error) {
  return error?.body ?? error?.responseBody ?? error?.response?.data ?? null;
}

/* ───────────────────── Audit-row creation ───────────────────── */

async function createScreeningAudit({ requestId, lead, payload }) {
  const customer = payload?.customerList?.[0];

  if (!customer) {
    const err = new Error("TrackWizz payload customerList is empty");

    err.code = "INVALID_SCREENING_PAYLOAD";
    throw err;
  }

  if (!customer.sourceSystemCustomerCode) {
    const err = new Error("sourceSystemCustomerCode is required");

    err.code = "CUSTOMER_CODE_REQUIRED";
    throw err;
  }

  const [insertResult] = await pool.execute(
    `
      INSERT INTO screening_requests
      (
        request_id,
        lead_id,
        partner_key,
        lan,
        source_system_customer_code,
        purpose,
        request_payload,
        status
      )
      VALUES (?, ?, ?, ?, ?, '01', ?, 'PENDING')
    `,
    [
      requestId,
      lead.leadId,
      lead.partner,
      lead.lan,
      customer.sourceSystemCustomerCode,
      JSON.stringify(payload),
    ],
  );

  return insertResult.insertId;
}

/* ───────────────────── Successful response storage ───────────────────── */

async function persistTrackWizzResponse({
  screeningRequestId,
  httpStatus,
  body,
  result,
  lead,
}) {
  const rawResponse = prepareResponseForAudit(body);

  let reportPdf = null;
  let reportFileName = null;
  let reportMimeType = null;
  let reportStorageError = null;

  /*
   * Do not fail the AML decision when the report PDF cannot
   * be decoded. Store the screening response and record the
   * report conversion error separately.
   */
  if (result.reportData) {
    try {
      reportPdf = base64ToPdfBuffer(result.reportData);

      if (reportPdf) {
        reportMimeType = "application/pdf";

        reportFileName = buildReportFileName(lead.partner, lead.lan);

        // ── auto-save to disk ──
        try {
          const { filename, filePath } = makeReportOutputPath(
            lead.partner,
            lead.lan,
          );
          fs.writeFileSync(filePath, reportPdf);
          reportFileName = filename; // store the actual saved name
          console.log("AML report saved:", filePath);
        } catch (fsError) {
          // disk failure must not block screening; DB copy still exists
          console.error("Unable to write AML report to disk", {
            lan: lead.lan,
            error: fsError.message,
          });
        }
      }
    } catch (error) {
      reportStorageError = truncate(
        `${error.code || "REPORT_ERROR"}: ` + `${error.message}`,
        1000,
      );

      console.error("Unable to convert TrackWizz reportData to PDF", {
        screeningRequestId,
        partner: lead.partner,
        lan: lead.lan,
        error: reportStorageError,
      });
    }
  }

  const validationSuccessful = equalsIgnoreCase(
    result.validationOutcome,
    "Success",
  );

  await pool.execute(
    `
      UPDATE screening_requests
      SET
        response_payload = ?,
        http_status = ?,
        overall_status = ?,
        validation_outcome = ?,
        suggested_action = ?,
        hits_detected = ?,
        hits_count = ?,
        confirmed_hits = ?,
        profile_code = ?,
        case_id = ?,
        case_url = ?,
        validation_failure_count = ?,
        report_pdf = ?,
        report_mime_type = ?,
        report_file_name = ?,
        report_storage_error = ?,
        error_code = ?,
        error_message = ?,
        status = ?
      WHERE id = ?
    `,
    [
      serializeJson(rawResponse),
      httpStatus ?? null,
      result.overallStatus ?? null,
      result.validationOutcome ?? null,
      result.suggestedAction ?? null,
      result.hitsDetected ?? null,
      result.hitsCount ?? 0,
      result.confirmedHits ?? null,
      result.profileCode ?? null,
      result.caseId ?? null,
      result.caseUrl ?? null,
      result.validationFailureCount ?? 0,
      reportPdf,
      reportMimeType,
      reportFileName,
      reportStorageError,
      result.validationCode || null,
      result.validationDescription || null,
      validationSuccessful ? "COMPLETED" : "FAILED",
      screeningRequestId,
    ],
  );

  return {
    rawResponse,
    reportStored: Boolean(reportPdf),
    reportFileName,
    reportStorageError,
  };
}

/* ───────────────────── Failure persistence ───────────────────── */

async function persistScreeningFailure({ screeningRequestId, error }) {
  const errorPayload = prepareResponseForAudit(getErrorPayload(error));

  const errorCode =
    error?.code ||
    (error instanceof As504Error ? "AS504_ERROR" : "SCREENING_ERROR");

  await pool.execute(
    `
      UPDATE screening_requests
      SET
        response_payload = ?,
        http_status = ?,
        error_code = ?,
        error_message = ?,
        status = 'FAILED'
      WHERE id = ?
    `,
    [
      serializeJson(errorPayload),
      getErrorHttpStatus(error),
      truncate(errorCode, 100),
      truncate(error?.message || "TrackWizz screening failed", 1000),
      screeningRequestId,
    ],
  );

  return errorPayload;
}

/* ───────────────────── Individual hit storage ───────────────────── */

async function persistScreeningHits(screeningRequestId, hits) {
  if (!Array.isArray(hits) || hits.length === 0) {
    return;
  }

  const values = hits.map((hit) => [
    screeningRequestId,
    hit?.source ?? null,
    hit?.watchlistSourceId ?? null,
    hit?.matchType ?? null,
    hit?.score ?? null,

    hit?.confirmedMatchingAttributes === null ||
    hit?.confirmedMatchingAttributes === undefined
      ? null
      : serializeJson(hit.confirmedMatchingAttributes),
  ]);

  await pool.query(
    `
      INSERT INTO screening_hits
      (
        screening_request_id,
        source,
        watchlist_source_id,
        match_type,
        score,
        confirmed_matching_attributes
      )
      VALUES ?
    `,
    [values],
  );
}

/* ───────────────────────── Main AML screening ───────────────────────── */

async function screenLead(lead) {
  const { requestId, payload } = buildPurpose01Payload(lead);

  /*
   * Create the audit row before making the external call.
   */
  const screeningRequestId = await createScreeningAudit({
    requestId,
    lead,
    payload,
  });

  try {
    const { httpStatus, body } = await callAs504(payload);

    const parsedResult = parsePurpose01Response(body);

    if (!parsedResult || typeof parsedResult !== "object") {
      const err = new Error("Unable to parse TrackWizz response");

      err.code = "INVALID_TRACKWIZZ_RESPONSE";

      err.body = body;

      throw err;
    }

    const hits = normalizeHits(parsedResult);

    const hitsCount = normalizeHitsCount(parsedResult, hits);

    const result = {
      ...parsedResult,
      hits,
      hitsCount,
    };

    const persisted = await persistTrackWizzResponse({
      screeningRequestId,
      httpStatus,
      body,
      result,
      lead,
    });

    await persistScreeningHits(screeningRequestId, hits);

    const validationSuccessful = equalsIgnoreCase(
      result.validationOutcome,
      "Success",
    );

    if (!validationSuccessful) {
      const validationReason =
        result.validationDescription ||
        result.validationCode ||
        "Unknown TrackWizz validation error";

      return {
        decision: "ERROR",
        degraded: false,

        reason: "TrackWizz field validation failed: " + validationReason,

        partner: lead.partner,
        leadId: lead.leadId,
        lan: lead.lan,

        screeningRequestId,
        requestId,

        hitsCount,

        confirmedHits: equalsIgnoreCase(result.confirmedHits, "Yes"),

        hits,

        hasReport: Boolean(result.reportData),

        reportStored: persisted.reportStored,

        reportFileName: persisted.reportFileName,

        reportStorageError: persisted.reportStorageError,

        rawResponse: persisted.rawResponse,

        result,
      };
    }

    return {
      decision: getDecision(result.suggestedAction),

      degraded: false,

      partner: lead.partner,
      leadId: lead.leadId,
      lan: lead.lan,

      screeningRequestId,
      requestId,

      hitsCount,

      confirmedHits: equalsIgnoreCase(result.confirmedHits, "Yes"),

      hits,

      hasReport: Boolean(result.reportData),

      reportStored: persisted.reportStored,

      reportFileName: persisted.reportFileName,

      reportStorageError: persisted.reportStorageError,

      rawResponse: persisted.rawResponse,

      result,
    };
  } catch (error) {
    const isAs504Error = error instanceof As504Error;

    let rawResponse = null;

    try {
      rawResponse = await persistScreeningFailure({
        screeningRequestId,
        error,
      });
    } catch (auditError) {
      console.error("Unable to persist TrackWizz screening failure", {
        screeningRequestId,
        originalError: error?.message,
        auditError: auditError?.message,
      });
    }

    return {
      decision: ON_ERROR_POLICY === "ALLOW" ? "PROCEED" : "REVIEW",

      degraded: true,

      reason: error?.message || "TrackWizz screening failed",

      retryable: isAs504Error
        ? Boolean(error.transient ?? error.retryable)
        : false,

      partner: lead.partner,
      leadId: lead.leadId,
      lan: lead.lan,

      screeningRequestId,
      requestId,

      hitsCount: null,
      confirmedHits: false,
      hits: [],

      hasReport: false,
      reportStored: false,
      reportFileName: null,
      reportStorageError: null,

      rawResponse,
      result: null,
    };
  }
}

/* ───────────────────────── AML summary helpers ───────────────────────── */

function getHighestAmlScore(outcome) {
  const hits = Array.isArray(outcome?.hits) ? outcome.hits : [];

  const scores = hits.map((hit) => Number(hit?.score)).filter(Number.isFinite);

  return scores.length ? Math.max(...scores) : null;
}

function buildAmlReason(outcome) {
  const hits = Array.isArray(outcome?.hits) ? outcome.hits : [];

  if (outcome.degraded) {
    return truncate(
      `Screening unavailable: ${outcome.reason || "Unknown error"}`,
    );
  }

  if (outcome.decision === "ERROR") {
    return truncate(outcome.reason || "TrackWizz validation failure");
  }

  const hitsCount = Number(outcome.hitsCount) || 0;

  if (hitsCount > 0) {
    if (!hits.length) {
      return truncate(
        `${hitsCount} hit(s) reported; ` + "hit details unavailable",
      );
    }

    const topHits = hits
      .slice()
      .sort(
        (left, right) =>
          (Number(right?.score) || 0) - (Number(left?.score) || 0),
      )
      .slice(0, 3)
      .map((hit) => {
        const source = hit?.source || "Unknown source";

        const matchType = hit?.matchType || "Unknown match";

        const score = hit?.score ?? 0;

        return `${source} ` + `(${matchType}, ${score})`;
      })
      .join("; ");

    return truncate(`${hitsCount} hit(s): ${topHits}`);
  }

  return outcome.decision === "PROCEED"
    ? "No watchlist hits"
    : truncate(`TrackWizz suggested ${outcome.decision}`);
}

function buildAmlApiResponse(outcome) {
  if (outcome.rawResponse === null || outcome.rawResponse === undefined) {
    return null;
  }

  return serializeJson(outcome.rawResponse);
}

/* ───────────────────── Partner booking update ───────────────────── */

async function updatePartnerAmlResult({ partnerKey, lead, outcome }) {
  const cfg = getPartnerConfig(partnerKey);

  if (!cfg.amlColumns) {
    const err = new Error(`[${partnerKey}] AML columns are not configured`);

    err.code = "AML_COLUMNS_NOT_CONFIGURED";

    throw err;
  }

  const requiredMappings = [
    "status",
    "score",
    "totalMatches",
    "reason",
    "apiResponse",
    "checkedAt",
  ];

  const missingMappings = requiredMappings.filter(
    (mapping) => !cfg.amlColumns[mapping],
  );

  if (missingMappings.length) {
    const err = new Error(
      `[${partnerKey}] missing AML column mappings: ` +
        missingMappings.join(", "),
    );

    err.code = "AML_COLUMN_MAPPING_INCOMPLETE";

    throw err;
  }

  if (lead.leadId === null || lead.leadId === undefined) {
    const err = new Error(`[${partnerKey}] leadId is required`);

    err.code = "LEAD_ID_REQUIRED";
    throw err;
  }

  /*
   * The database records ERROR when screening was unavailable,
   * even when ON_ERROR_POLICY=ALLOW temporarily returns PROCEED.
   */
  const amlStatus = outcome.degraded ? "ERROR" : outcome.decision;

  const amlScore = getHighestAmlScore(outcome);

  const amlReason = buildAmlReason(outcome);

  const amlApiResponse = buildAmlApiResponse(outcome);

  const hitsValue = Number(outcome.hitsCount);

  const amlTotalMatches = outcome.degraded
    ? null
    : Number.isFinite(hitsValue)
      ? hitsValue
      : 0;

  const table = quoteIdentifier(cfg.table);

  const primaryKey = quoteIdentifier(cfg.primaryKey || "id");

  const statusColumn = quoteIdentifier(cfg.amlColumns.status);

  const scoreColumn = quoteIdentifier(cfg.amlColumns.score);

  const totalMatchesColumn = quoteIdentifier(cfg.amlColumns.totalMatches);

  const reasonColumn = quoteIdentifier(cfg.amlColumns.reason);

  const apiResponseColumn = quoteIdentifier(cfg.amlColumns.apiResponse);

  const checkedAtColumn = quoteIdentifier(cfg.amlColumns.checkedAt);

  const [updateResult] = await pool.execute(
    `
        UPDATE ${table}
        SET
          ${statusColumn} = ?,
          ${scoreColumn} = ?,
          ${totalMatchesColumn} = ?,
          ${reasonColumn} = ?,
          ${apiResponseColumn} = ?,
          ${checkedAtColumn} = NOW()
        WHERE ${primaryKey} = ?
        LIMIT 1
      `,
    [
      amlStatus,
      amlScore,
      amlTotalMatches,
      amlReason,
      amlApiResponse,
      lead.leadId,
    ],
  );

  /*
   * MySQL can return zero affected rows when values did not
   * materially change, so verify that the row still exists.
   */
  if (!updateResult.affectedRows) {
    const [existingRows] = await pool.execute(
      `
          SELECT 1
          FROM ${table}
          WHERE ${primaryKey} = ?
          LIMIT 1
        `,
      [lead.leadId],
    );

    if (!existingRows.length) {
      const err = new Error(`[${partnerKey}] booking row no longer exists`);

      err.code = "AML_UPDATE_ROW_NOT_FOUND";

      throw err;
    }
  }

  return {
    amlStatus,
    amlScore,
    amlTotalMatches,
    amlReason,
  };
}

/* ───────────────────── Partner-wise LAN workflow ───────────────────── */

async function screenLoanBooking(partnerKey, lan) {
  const lead = await getLeadByLan(partnerKey, lan);

  const outcome = await screenLead(lead);

  const amlResult = await updatePartnerAmlResult({
    partnerKey,
    lead,
    outcome,
  });

  return {
    ...outcome,

    partner: partnerKey,
    leadId: lead.leadId,
    lan: lead.lan,

    ...amlResult,
  };
}

/* ───────────────────── PDF report retrieval ───────────────────── */

function normalizeScreeningRequestId(value) {
  const normalized = String(value || "").trim();

  if (!/^\d+$/.test(normalized)) {
    const err = new Error("Valid screening request ID is required");

    err.code = "INVALID_SCREENING_REQUEST_ID";

    throw err;
  }

  return normalized;
}

/**
 * Get a PDF by screening-request ID.
 *
 * Returns:
 * {
 *   partnerKey,
 *   lan,
 *   fileName,
 *   mimeType,
 *   pdfBuffer
 * }
 */
async function getScreeningReport(screeningRequestId) {
  const normalizedId = normalizeScreeningRequestId(screeningRequestId);

  const [rows] = await pool.execute(
    `
      SELECT
        id,
        partner_key,
        lan,
        report_pdf,
        report_mime_type,
        report_file_name
      FROM screening_requests
      WHERE id = ?
        AND report_pdf IS NOT NULL
      LIMIT 1
    `,
    [normalizedId],
  );

  if (!rows.length) {
    return null;
  }

  const row = rows[0];

  return {
    screeningRequestId: row.id,
    partnerKey: row.partner_key,
    lan: row.lan,

    fileName:
      row.report_file_name || buildReportFileName(row.partner_key, row.lan),

    mimeType: row.report_mime_type || "application/pdf",

    pdfBuffer: row.report_pdf,
  };
}

/**
 * Get the latest PDF report for a partner and LAN.
 */
async function getScreeningReportByLan(partnerKey, lan) {
  /*
   * Validate the partner against the registry.
   */
  getPartnerConfig(partnerKey);

  const normalizedLan = String(lan || "").trim();

  if (!normalizedLan) {
    const err = new Error("LAN is required");

    err.code = "INVALID_LAN";
    throw err;
  }

  const [rows] = await pool.execute(
    `
      SELECT
        id,
        request_id,
        partner_key,
        lan,
        report_pdf,
        report_mime_type,
        report_file_name
      FROM screening_requests
      WHERE partner_key = ?
        AND lan = ?
        AND report_pdf IS NOT NULL
      ORDER BY id DESC
      LIMIT 1
    `,
    [partnerKey, normalizedLan],
  );

  if (!rows.length) {
    return null;
  }

  const row = rows[0];

  return {
    screeningRequestId: row.id,
    requestId: row.request_id,
    partnerKey: row.partner_key,
    lan: row.lan,

    fileName:
      row.report_file_name || buildReportFileName(row.partner_key, row.lan),

    mimeType: row.report_mime_type || "application/pdf",

    pdfBuffer: row.report_pdf,
  };
}

/**
 * Express handler:
 * Download the latest stored AML PDF using partner key and LAN.
 *
 * Route example:
 * GET /aml/report/switch_my_loan/LAN000123
 */
async function downloadScreeningReportByLan(req, res) {
  try {
    const partnerKey = String(req.params.partnerKey || "").trim();

    const lan = String(req.params.lan || "").trim();

    if (!partnerKey) {
      return res.status(400).json({
        success: false,
        code: "PARTNER_REQUIRED",
        message: "partnerKey is required",
      });
    }

    if (!lan) {
      return res.status(400).json({
        success: false,
        code: "LAN_REQUIRED",
        message: "LAN is required",
      });
    }

    // Ensures the partner is registered.
    getPartnerConfig(partnerKey);

    const report = await getScreeningReportByLan(partnerKey, lan);

    if (!report?.pdfBuffer) {
      return res.status(404).json({
        success: false,
        code: "REPORT_NOT_FOUND",
        message:
          `AML report not found for partner ` +
          `"${partnerKey}" and LAN "${lan}"`,
      });
    }

    const pdfBuffer = Buffer.isBuffer(report.pdfBuffer)
      ? report.pdfBuffer
      : Buffer.from(report.pdfBuffer);

    const fileName = report.fileName || buildReportFileName(partnerKey, lan);

    res.setHeader("Content-Type", report.mimeType || "application/pdf");

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    res.setHeader("Content-Length", pdfBuffer.length);

    res.setHeader("Cache-Control", "private, no-store");

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error("AML report download failed", {
      partnerKey: req.params?.partnerKey,
      lan: req.params?.lan,
      error: error.message,
    });

    const isInputError = ["UNKNOWN_PARTNER", "INVALID_LAN"].includes(
      error.code,
    );

    return res.status(isInputError ? 400 : 500).json({
      success: false,
      code: error.code || "REPORT_DOWNLOAD_FAILED",
      message: error.message,
    });
  }
}

module.exports = {
  screenLead,
  screenLoanBooking,

  getScreeningReport,
  getScreeningReportByLan,

  // Exported for unit tests.
  base64ToPdfBuffer,
  prepareResponseForAudit,
  getHighestAmlScore,
  buildAmlReason,
  updatePartnerAmlResult,
  downloadScreeningReportByLan,
};
