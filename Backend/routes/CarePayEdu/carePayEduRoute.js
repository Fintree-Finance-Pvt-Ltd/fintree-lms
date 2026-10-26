
const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const partnerLimitService = require("../../services/partnerLimitService");
const { getMonthYear } = require("../../utils/partnerHelpers");
const { runBureau } = require("../../services/Bueraupullapiservice");
const {
    evaluateCarePayEducationBre,
    buildCarePayEducationBreSnapshot,
} = require("./carepayEducationBre");
const loanBookingRouter = express.Router();

const TABLE_NAME = "loan_booking_carepay_education";

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getMissingFields(data, requiredFields) {
    return requiredFields.filter((field) => {
        const value = data[field];

        return (
            value === undefined ||
            value === null ||
            (typeof value === "string" && value.trim() === "")
        );
    });
}

function nullableString(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const trimmed = String(value).trim();

    return trimmed === "" ? null : trimmed;
}


function isCarePayPartner(req) {
    return (
        req.partner?.id === 23 &&
        String(req.partner?.name || "")
            .toLowerCase()
            .trim() === "carepayeducation"
    );
}


const isProvided = (value) =>
    value !== undefined &&
    value !== null &&
    String(value).trim() !== "";

const round2 = (value) =>
    Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const parseNonNegativeNumber = (value, fieldName) => {
    if (!isProvided(value)) return null;

    const num = Number(value);

    if (!Number.isFinite(num) || num < 0) {
        throw new Error(`Invalid ${fieldName}`);
    }

    return num;
};

// ==========================================
// PROCESSING FEE / SUBVENTION CALCULATION
// ==========================================

const calculateAmountPercentagePair = ({
    baseAmount,
    amountValue,
    percentageValue,
    amountField,
    percentageField,
}) => {
    const amount = parseNonNegativeNumber(
        amountValue,
        amountField,
    );

    const percentage = parseNonNegativeNumber(
        percentageValue,
        percentageField,
    );

    // Both amount and percentage provided
    if (amount !== null && percentage !== null) {
        const expectedAmount = round2(
            (baseAmount * percentage) / 100,
        );

        const givenAmount = round2(amount);

        if (Math.abs(expectedAmount - givenAmount) > 0.01) {
            throw new Error(
                `${amountField} does not match ${percentageField}. Expected ${expectedAmount}`,
            );
        }

        return {
            amount: givenAmount,
            percentage: round2(percentage),
        };
    }

    // Percentage provided
    if (percentage !== null) {
        return {
            percentage: round2(percentage),
            amount: round2((baseAmount * percentage) / 100),
        };
    }

    // Amount provided
    if (amount !== null) {
        return {
            amount: round2(amount),
            percentage: round2((amount / baseAmount) * 100),
        };
    }

    return {
        amount: 0,
        percentage: 0,
    };
};

// ==========================================
// EDUCATION REQUIRED FIELDS
// ==========================================

const CAREPAY_EDUCATION_REQUIRED_FIELDS = [
    "partner_loan_id",
    "first_name",
    "last_name",
    "mobile_number",
    "pan_number",
    "institute_name",
];

// ==========================================
// DUMMY BUREAU FOR TESTING ONLY
// ==========================================
async function persistCarePayEducationBureauResult(lan, data) {

    const bureauResult = {
        success: true,
        score: 750,
        response: {
            provider: "DUMMY_BUREAU",
            status: "SUCCESS",
            score: 750,
            enquiry_id: `DUMMY-${lan}-${Date.now()}`,
            pan_number: data.pan_number,
        },
    };

    const report = JSON.stringify(bureauResult.response);

    try {
        // 1. Save dummy bureau report
        await db.promise().query(
            `INSERT INTO loan_cibil_reports
       (lan, pan_number, score, report_xml, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
            [lan, data.pan_number, bureauResult.score, report]
        );

        // 2. Update Education loan CIBIL score
        await db.promise().query(
            `UPDATE loan_booking_carepay_education
       SET cibil_score_fintree = ?
       WHERE lan = ?`,
            [bureauResult.score, lan]
        );

        // 3. Create KYC verification row
        await db.promise().query(
            `INSERT IGNORE INTO kyc_verification_status (lan)
       VALUES (?)`,
            [lan]
        );

        // 4. Update bureau verification status
        await db.promise().query(
            `UPDATE kyc_verification_status
       SET bureau_status = ?,
           bureau_api_response = ?
       WHERE lan = ?`,
            ["VERIFIED", report, lan]
        );

        console.log("✅ CAREPAY EDUCATION DUMMY BUREAU:", {
            lan,
            score: bureauResult.score,
            status: "VERIFIED",
        });

        return {
            ...bureauResult,
            persistenceSuccess: true,
        };

    } catch (error) {
        console.error(
            "CarePay Education dummy bureau error:",
            error.message
        );

        return {
            ...bureauResult,
            success: false,
            persistenceSuccess: false,
        };
    }
}


// async function persistCarePayEducationBureauResult(lan, data) {
//     let bureauResult = {
//         success: false,
//         score: null,
//         response: null,
//     };

//     try {
//         // ==========================================
//         // 1. CALL BUREAU API
//         // ==========================================

//         bureauResult = await runBureau(data);

//         const score = bureauResult.score ?? null;
//         const report = bureauResult.response ?? null;

//         // Store the raw response in a DB-compatible format
//         const reportData =
//             report === null
//                 ? null
//                 : typeof report === "string"
//                     ? report
//                     : JSON.stringify(report);

//         // ==========================================
//         // 2. SAVE CIBIL REPORT
//         // ==========================================

//         if (reportData !== null) {
//             await db.promise().query(
//                 `INSERT INTO loan_cibil_reports
//          (lan, pan_number, score, report_xml, created_at)
//          VALUES (?, ?, ?, ?, NOW())`,
//                 [
//                     lan,
//                     data.pan_number,
//                     score,
//                     reportData,
//                 ],
//             );
//         }

//         // ==========================================
//         // 3. UPDATE EDUCATION LOAN CIBIL SCORE
//         // ==========================================

//         if (score !== null) {
//             await db.promise().execute(
//                 `UPDATE loan_booking_carepay_education
//          SET cibil_score_fintree = ?
//          WHERE lan = ?`,
//                 [score, lan],
//             );
//         }

//         // ==========================================
//         // 4. UPDATE KYC BUREAU STATUS
//         // ==========================================

//         try {
//             await db.promise().query(
//                 `INSERT IGNORE INTO kyc_verification_status (lan)
//          VALUES (?)`,
//                 [lan],
//             );

//             await db.promise().query(
//                 `UPDATE kyc_verification_status
//          SET bureau_status = ?,
//              bureau_api_response = ?
//          WHERE lan = ?`,
//                 [
//                     bureauResult.success ? "VERIFIED" : "FAILED",
//                     reportData,
//                     lan,
//                 ],
//             );

//         } catch (kycErr) {
//             console.error(
//                 "CarePay Education KYC bureau update failed:",
//                 kycErr.message,
//             );

//             return {
//                 ...bureauResult,
//                 persistenceSuccess: false,
//             };
//         }

//         console.log("CAREPAY EDUCATION BUREAU RESULT:", {
//             lan,
//             success: bureauResult.success,
//             score,
//         });

//         return {
//             ...bureauResult,
//             persistenceSuccess: true,
//         };

//     } catch (error) {
//         console.error(
//             "CarePay Education bureau failed:",
//             error.message,
//         );

//         // ==========================================
//         // 5. SAVE FAILED BUREAU STATUS
//         // ==========================================

//         try {
//             await db.promise().query(
//                 `INSERT IGNORE INTO kyc_verification_status (lan)
//          VALUES (?)`,
//                 [lan],
//             );

//             await db.promise().query(
//                 `UPDATE kyc_verification_status
//          SET bureau_status = 'FAILED',
//              bureau_api_response = ?
//          WHERE lan = ?`,
//                 [error.message, lan],
//             );

//         } catch (kycErr) {
//             console.error(
//                 "CarePay Education failed bureau status update:",
//                 kycErr.message,
//             );
//         }

//         return {
//             success: false,
//             score: bureauResult?.score ?? null,
//             response: bureauResult?.response ?? null,
//             persistenceSuccess: false,
//         };
//     }
// }

// ==========================================
// CAREPAY EDUCATION LOAN BOOKING API
// ==========================================



async function checkAndApproveCarePayEducationLoan(lan) {
    const cleanLan = String(lan || "").trim().toUpperCase();

    if (!/^CAREDU\d+$/.test(cleanLan)) {
        return {
            approved: false,
            reason: "INVALID_CAREPAY_EDUCATION_LAN",
        };
    }

    const conn = await db.promise().getConnection();

    try {
        await conn.beginTransaction();

        // ==========================================
        // 1. FETCH EDUCATION LOAN
        // ==========================================

        const [[loan]] = await conn.query(
            `SELECT
          lan,
          status,
          cibil_score_fintree,
          mandate_amount,
          umrn,
          father_name,
          bank_account_holder_name,
          bank_account_number,
          bank_name,
          bank_branch_name,
          bank_ifsc_code,
          bank_account_type
       FROM loan_booking_carepay_education
       WHERE lan = ?
       LIMIT 1
       FOR UPDATE`,
            [cleanLan]
        );

        if (!loan) {
            await conn.rollback();
            return {
                approved: false,
                reason: "EDUCATION_LOAN_NOT_FOUND",
            };
        }

        // ==========================================
        // 2. CHECK BRE STATUS
        // ==========================================

        const currentStatus = String(loan.status || "")
            .trim()
            .toUpperCase();

        if (currentStatus === "APPROVED") {
            await conn.commit();
            const approvalResult =
                await checkAndApproveCarePayEducationLoan(cleanLan);
            return {
                approved: true,
                status: loan.status,
                reason: "ALREADY_APPROVED",
            };
        }

        if (currentStatus !== "BRE APPROVED") {
            await conn.rollback();
            return {
                approved: false,
                status: loan.status,
                reason: "BRE_NOT_APPROVED",
            };
        }

        // ==========================================
        // 3. IDENTIFY NTC / ETC
        // ==========================================

        const score =
            loan.cibil_score_fintree == null
                ? null
                : Number(loan.cibil_score_fintree);

        const isNtc =
            Number.isFinite(score) &&
            score >= 1 &&
            score <= 200;

        const isEtc =
            Number.isFinite(score) &&
            score > 200;

        const customerType = isNtc
            ? "NTC"
            : isEtc
                ? "ETC"
                : "UNKNOWN";

        if (!isNtc && !isEtc) {
            await conn.rollback();
            return {
                approved: false,
                status: loan.status,
                customer_type: customerType,
                reason: "BUREAU_SCORE_MISSING",
            };
        }

        // ==========================================
        // 4. VALIDATE ALL MANDATE FIELDS
        // ==========================================

        const mandateFields = {
            mandate_amount: loan.mandate_amount,
            umrn: loan.umrn,
            father_name: loan.father_name,
            bank_account_holder_name:
                loan.bank_account_holder_name,
            bank_account_number:
                loan.bank_account_number,
            bank_name: loan.bank_name,
            bank_branch_name:
                loan.bank_branch_name,
            bank_ifsc_code:
                loan.bank_ifsc_code,
            bank_account_type:
                loan.bank_account_type,
        };

        const missingMandateFields = Object.entries(
            mandateFields
        )
            .filter(([field, value]) => {
                if (
                    value === null ||
                    value === undefined ||
                    String(value).trim() === ""
                ) {
                    return true;
                }

                if (
                    field === "mandate_amount" &&
                    (!Number.isFinite(Number(value)) ||
                        Number(value) <= 0)
                ) {
                    return true;
                }

                return false;
            })
            .map(([field]) => field);

        if (missingMandateFields.length > 0) {
            await conn.rollback();

            return {
                approved: false,
                status: loan.status,
                customer_type: customerType,
                reason: "MANDATE_DETAILS_MISSING",
                missing_fields: missingMandateFields,
            };
        }

        // ==========================================
        // 5. SALARY DECLARATION CHECK FOR NTC
        // ==========================================

        let salaryDeclarationUploaded = false;

        if (isNtc) {
            const [documents] = await conn.query(
                `SELECT doc_name, original_name, file_name
         FROM loan_documents
         WHERE lan = ?`,
                [cleanLan]
            );

            const normalizeDocName = (value) =>
                String(value || "")
                    .trim()
                    .replace(/\.[^/.]+$/, "")
                    .toLowerCase()
                    .replace(/[\s_-]/g, "");

            salaryDeclarationUploaded = documents.some(
                (doc) =>
                    Boolean(String(doc.file_name || "").trim()) &&
                    (
                        normalizeDocName(doc.doc_name) ===
                        "salarydeclaration" ||
                        normalizeDocName(doc.original_name) ===
                        "salarydeclaration"
                    )
            );

            if (!salaryDeclarationUploaded) {
                await conn.rollback();

                return {
                    approved: false,
                    status: loan.status,
                    customer_type: "NTC",
                    reason: "SALARY_DECLARATION_NOT_UPLOADED",
                    salary_declaration_uploaded: false,
                };
            }
        }

        // ==========================================
        // 6. APPROVE EDUCATION LOAN
        // ==========================================

        const [result] = await conn.query(
            `UPDATE loan_booking_carepay_education
       SET status = 'Approved',
           modified_at = NOW()
       WHERE lan = ?
         AND status = 'BRE Approved'`,
            [cleanLan]
        );

        await conn.commit();

        return {
            approved: result.affectedRows > 0,
            lan: cleanLan,
            status:
                result.affectedRows > 0
                    ? "Approved"
                    : loan.status,
            customer_type: customerType,
            salary_declaration_uploaded:
                salaryDeclarationUploaded,
            reason:
                result.affectedRows > 0
                    ? "ALL_REQUIREMENTS_COMPLETE"
                    : "APPROVAL_UPDATE_BLOCKED",
        };

    } catch (error) {
        try {
            await conn.rollback();
        } catch (rollbackError) {
            console.error(
                "CAREDU approval rollback failed:",
                rollbackError.message
            );
        }

        throw error;

    } finally {
        conn.release();
    }
}


loanBookingRouter.post("/v1/loan-booking", verifyApiKey,
    async (req, res) => {
        let conn;
        let transactionStarted = false;

        try {
            const data = req.body || {};
            console.log("CAREPAY EDUCATION AUTH DEBUG:", {
                partner: req.partner,
                partnerName: req.partner?.name,
            });

            // ======================================
            // 1. PARTNER VALIDATION
            // ======================================

            if (!isCarePayPartner(req)) {
                return res.status(403).json({
                    success: false,
                    message: "This route is only for CarePay partner.",
                });
            }

            // ======================================
            // 2. REQUIRED FIELD VALIDATION
            // ======================================

            const missing = getMissingFields(
                data,
                CAREPAY_EDUCATION_REQUIRED_FIELDS,
            );

            if (missing.length) {
                return res.status(400).json({
                    success: false,
                    message: `Missing fields: ${missing.join(", ")}`,
                });
            }

            // ======================================
            // 3. REQUEST AMOUNT VALIDATION
            // ======================================

            const rawRequestAmount = isProvided(data.request_amount)
                ? data.request_amount
                : data.loan_amount;

            if (!isProvided(rawRequestAmount)) {
                return res.status(400).json({
                    success: false,
                    message: "Missing fields: request_amount",
                });
            }

            const requestAmount = Number(rawRequestAmount);

            if (
                !Number.isFinite(requestAmount) ||
                requestAmount <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid request_amount",
                });
            }

            // ======================================
            // 4. CUSTOMER VALIDATION
            // ======================================

            const partnerLoanId = String(
                data.partner_loan_id,
            ).trim();

            const panNumber = String(data.pan_number)
                .trim()
                .toUpperCase();

            const mobileNumber = String(
                data.mobile_number,
            ).trim();

            const instituteName = String(
                data.institute_name,
            ).trim();

            if (
                partnerLoanId.length > 100 ||
                partnerLoanId.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid partner_loan_id",
                });
            }

            if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid pan_number",
                });
            }

            if (!/^[6-9][0-9]{9}$/.test(mobileNumber)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid mobile_number",
                });
            }

            if (
                instituteName.length === 0 ||
                instituteName.length > 255
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid institute_name",
                });
            }

            // ======================================
            // 5. PROCESSING FEE AND SUBVENTION
            // ======================================

            let processingFee;
            let subvention;

            try {
                processingFee = calculateAmountPercentagePair({
                    baseAmount: requestAmount,
                    amountValue: data.processing_fee,
                    percentageValue:
                        data.processing_fee_percentage,
                    amountField: "processing_fee",
                    percentageField:
                        "processing_fee_percentage",
                });

                subvention = calculateAmountPercentagePair({
                    baseAmount: requestAmount,
                    amountValue: data.subvention_amount,
                    percentageValue:
                        data.subvention_percentage,
                    amountField: "subvention_amount",
                    percentageField:
                        "subvention_percentage",
                });
            } catch (calculationError) {
                return res.status(400).json({
                    success: false,
                    message: calculationError.message,
                });
            }

            if (
                processingFee.amount > requestAmount ||
                subvention.amount > requestAmount
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Processing fee or subvention cannot exceed request amount",
                });
            }

            // Existing CarePay rule:
            // Net Disbursement = Loan Amount - Subvention
            // Processing fee is not deducted here.

            const netDisbursement = round2(
                requestAmount - subvention.amount,
            );

            // ======================================
            // 6. OPTIONAL NUMERIC VALIDATION
            // ======================================

            let interestRate;
            let loanTenure;
            let emiAmount;

            try {
                interestRate =
                    parseNonNegativeNumber(
                        data.interest_rate,
                        "interest_rate",
                    ) ?? 0;

                loanTenure = parseNonNegativeNumber(
                    data.loan_tenure,
                    "loan_tenure",
                );

                emiAmount = parseNonNegativeNumber(
                    data.emi_amount,
                    "emi_amount",
                );

                if (
                    loanTenure !== null &&
                    (!Number.isInteger(loanTenure) ||
                        loanTenure <= 0)
                ) {
                    throw new Error("Invalid loan_tenure");
                }
            } catch (validationError) {
                return res.status(400).json({
                    success: false,
                    message: validationError.message,
                });
            }

            // ======================================
            // 7. DATABASE CONNECTION
            // ======================================

            conn = await db.promise().getConnection();

            await conn.beginTransaction();
            transactionStarted = true;

            // ======================================
            // 8. DUPLICATE PARTNER LOAN ID CHECK
            // ======================================

            const [existing] = await conn.query(
                `SELECT lan, partner_loan_id
         FROM ${TABLE_NAME}
         WHERE partner_loan_id = ?
         LIMIT 1`,
                [partnerLoanId],
            );

            if (existing.length > 0) {
                await conn.rollback();
                transactionStarted = false;

                return res.status(409).json({
                    success: false,
                    message: "Duplicate Partner Loan ID",
                    existingLan: existing[0].lan,
                });
            }

            // ======================================
            // 9. PAN ACTIVE LOAN CHECK
            // ======================================

            const [panRecords] = await conn.query(
                `SELECT lan, status
         FROM ${TABLE_NAME}
         WHERE pan_number = ?`,
                [panNumber],
            );

            const allowedStatuses = new Set([
                "cancelled",
                "foreclosed",
                "fully paid",
                "rejected",
            ]);

            const hasActiveLoan = panRecords.some(
                (row) =>
                    !allowedStatuses.has(
                        String(row.status || "")
                            .trim()
                            .toLowerCase(),
                    ),
            );

            if (hasActiveLoan) {
                await conn.rollback();
                transactionStarted = false;

                return res.status(409).json({
                    success: false,
                    message:
                        "PAN already exists with an active Education Loan. New loan not allowed.",
                });
            }

            // ======================================
            // 10. PARTNER BOOKING LIMIT
            // ======================================

            const partnerName = "carepayEducation";
            const today = new Date();

            const { month, year } = getMonthYear(today);

            const partner =
                await partnerLimitService.getOrCreatePartner(
                    conn,
                    partnerName,
                );

            const limitCheck =
                await partnerLimitService.validatePartnerBookingLimit(
                    conn,
                    partner.partner_id,
                    requestAmount,
                    month,
                    year,
                );

            if (!limitCheck.valid) {
                await conn.rollback();
                transactionStarted = false;

                return res.status(403).json({
                    success: false,
                    message: "Monthly partner limit exceeded",
                    remaining_limit: limitCheck.remaining,
                    required: requestAmount,
                });
            }

            // ======================================
            // 11. GENERATE CAREPAY LAN
            // ======================================

            // Uses same CARE prefix and carepay sequence
            // as the existing CarePay loan booking.
            //
            // loan_sequences.lender_name must be UNIQUE.
            //
            // Example: CARE11000, CARE11001 ...

            const lenderType = "carepayEducation";

            await conn.query(
                `INSERT INTO loan_sequences
           (lender_name, last_sequence)
         VALUES (?, 11000)
         ON DUPLICATE KEY UPDATE
           last_sequence = last_sequence + 1`,
                [lenderType],
            );

            const [[sequenceRow]] = await conn.query(
                `SELECT last_sequence
         FROM loan_sequences
         WHERE lender_name = ?
         FOR UPDATE`,
                [lenderType],
            );

            if (!sequenceRow) {
                throw new Error(
                    "Unable to generate CarePay Education LAN",
                );
            }

            const lan = `CAREDU${sequenceRow.last_sequence}`;

            // ======================================
            // 12. CUSTOMER NAME
            // ======================================

            const customer_name = [
                data.first_name,
                data.middle_name,
                data.last_name,
            ]
                .filter(isProvided)
                .map((value) => String(value).trim())
                .join(" ");

            // ======================================
            // 13. LOGIN DATE
            // ======================================

            const loginDate = isProvided(data.login_date)
                ? String(data.login_date).trim()
                : new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Asia/Kolkata",
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                }).format(today);

            // ======================================
            // 14. DATABASE FIELDS
            // ======================================

            const fields = {
                lan,

                partner_loan_id: partnerLoanId,

                login_date: loginDate,

                // Customer information

                first_name:
                    nullableString(data.first_name),

                middle_name:
                    nullableString(data.middle_name),

                last_name:
                    nullableString(data.last_name),

                customer_name,

                gender:
                    nullableString(data.gender),

                dob:
                    nullableString(data.dob),

                mobile_number: mobileNumber,

                email_id:
                    nullableString(data.email_id),

                pan_number: panNumber,

                aadhar_number:
                    nullableString(data.aadhar_number),

                // Address information

                current_address:
                    nullableString(data.current_address),

                current_city:
                    nullableString(
                        data.current_city ||
                        data.current_village_city,
                    ),

                current_state:
                    nullableString(data.current_state),

                current_pincode:
                    nullableString(data.current_pincode),

                // Education information

                institute_name: instituteName,

                // Loan information

                request_amount: requestAmount,

                loan_amount: requestAmount,

                interest_rate: interestRate,

                loan_tenure: loanTenure,

                emi_amount: emiAmount,

                processing_fee_percentage:
                    processingFee.percentage,

                processing_fee:
                    processingFee.amount,

                subvention_percentage:
                    subvention.percentage,

                subvention_amount:
                    subvention.amount,

                net_disbursement:
                    netDisbursement,

                product: "Education Loan",

                lender: "CAREPAY",

                status: "Login",
            };

            // ======================================
            // 15. INSERT EDUCATION LOAN
            // ======================================

            const columns = Object.keys(fields)
                .map((field) => `\`${field}\``)
                .join(", ");

            const placeholders = Object.keys(fields)
                .map(() => "?")
                .join(", ");

            const values = Object.values(fields);

            await conn.query(
                `INSERT INTO ${TABLE_NAME}
         (${columns})
         VALUES (${placeholders})`,
                values,
            );

            // ======================================
            // 16. UPDATE PARTNER BOOKING LIMIT
            // ======================================

            await partnerLimitService.updateBookedLimit(
                conn,
                limitCheck.limitId,
                requestAmount,
                lan,
            );

            // ======================================
            // 17. COMMIT TRANSACTION
            // ======================================

            await conn.commit();
            transactionStarted = false;


            // ==========================================
            // 18. CAREPAY EDUCATION BUREAU PULL
            // ==========================================

            console.log("Starting CarePay Education bureau pull:", lan);

            const bureauResult = await persistCarePayEducationBureauResult(
                lan,
                {
                    ...data,

                    // Normalized customer information
                    first_name: nullableString(data.first_name),
                    middle_name: nullableString(data.middle_name),
                    last_name: nullableString(data.last_name),

                    pan_number: panNumber,
                    mobile_number: mobileNumber,

                    // Education loan information
                    loan_type: "Education Loan",
                    product: "Education Loan",
                    lender: "CAREPAY",

                    loan_amount: requestAmount,
                    request_amount: requestAmount,

                    processing_fee_percentage:
                        processingFee.percentage,

                    processing_fee:
                        processingFee.amount,

                    subvention_percentage:
                        subvention.percentage,

                    subvention_amount:
                        subvention.amount,

                    net_disbursement: netDisbursement,
                },
            );

            const bureauStatus =
                bureauResult.success &&
                    bureauResult.persistenceSuccess
                    ? "VERIFIED"
                    : "FAILED";

            console.log("CarePay Education bureau completed:", {
                lan,
                bureauStatus,
                score: bureauResult.score,
            });


            // ==========================================
            // RUN CAREPAY EDUCATION BRE
            // ==========================================


            const bureau = {
                success: bureauResult.success === true,
                provider: "EXPERIAN",
                verified:
                    bureauResult.success === true &&
                    bureauResult.persistenceSuccess === true,
                score: bureauResult.score ?? null,
                response: bureauResult.response ?? null,
            };


            const breData = {
                ...data,
                loan_tenure: loanTenure,
                request_amount: requestAmount,
                pan_number: panNumber,
            };

            // In a live workflow these fields should come
            // from verified onboarding/customer records.

            const breDecision = evaluateCarePayEducationBre({
                data: breData,
                requestAmount,
                bureau,
            });

            const breSnapshot = buildCarePayEducationBreSnapshot({
                data: breData,
                requestAmount,
                bureau,
                decision: breDecision,
            });

            // SAVE BRE STATUS IN EDUCATION LOAN TABLE

            await db.promise().query(
                `UPDATE loan_booking_carepay_education
   SET status = ?,
       bre_snapshot = ?
   WHERE lan = ?`,
                [
                    breDecision.caseStatus,
                    JSON.stringify(breSnapshot),
                    lan,
                ]
            );

            console.log("CAREPAY EDUCATION BRE RESULT:", {
                lan,
                status: breDecision.status,
                reasons: breDecision.reasons,
                pending: breDecision.pending,
            });


            // ======================================
            // 18. SUCCESS RESPONSE
            // ======================================

            return res.status(201).json({
                success: true,

                message:
                    "CAREPAY Education Loan saved successfully.",

                lan,

                partner_loan_id: partnerLoanId,

                customer_name,

                institute_name: instituteName,

                product: "Education Loan",

                lender: "CAREPAY",

                status: breDecision.caseStatus,

                request_amount: requestAmount,

                loan_amount: requestAmount,

                interest_rate: interestRate,

                loan_tenure: loanTenure,

                emi_amount: emiAmount,

                processing_fee_percentage:
                    processingFee.percentage,

                processing_fee:
                    processingFee.amount,

                subvention_percentage:
                    subvention.percentage,

                subvention_amount:
                    subvention.amount,

                net_disbursement:
                    netDisbursement,


                cibilScore: bureauResult.score ?? "Not Found",

                bureauStatus,

                bureauPersisted:
                    bureauResult.persistenceSuccess === true,

                bre: {
                    status: breDecision.status,
                    reason: breDecision.reason,
                    reasons: breDecision.reasons,
                    pending: breDecision.pending,
                },
            });

        }

        catch (error) {
            if (conn && transactionStarted) {
                try {
                    await conn.rollback();
                } catch (rollbackError) {
                    console.error("Rollback error:", rollbackError.message);
                }
            }

            console.error("❌ CAREPAY EDUCATION BOOKING ERROR:", {
                message: error.message,
                code: error.code,
                sqlMessage: error.sqlMessage,
                sqlState: error.sqlState,
                stack: error.stack,
            });

            return res.status(
                error.code === "ER_DUP_ENTRY" ? 409 : 500
            ).json({
                success: false,
                message: "CarePay Education loan booking failed.",

                ...(process.env.NODE_ENV === "development"
                    ? {
                        error: error.sqlMessage || error.message,
                        errorCode: error.code || null,
                    }
                    : {}),
            });
        }

        finally {
            if (conn) {
                conn.release();
            }
        }
    },
);

// ==========================================
// RERUN CAREPAY EDUCATION BRE LOAN BY LAN
// ==========================================
loanBookingRouter.post("/v1/carepay-education/:lan/rerun-bre",
    verifyApiKey,
    async (req, res) => {
        try {
            if (!isCarePayPartner(req)) {
                return res.status(403).json({
                    success: false,
                    message: "Only CarePay Education partner is allowed",
                });
            }

            const lan = String(req.params.lan || "").trim().toUpperCase();

            if (!/^CAREDU\d+$/.test(lan)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid CarePay Education LAN",
                });
            }

            // Fetch existing loan
            const [[loan]] = await db.promise().query(
                `SELECT *
         FROM loan_booking_carepay_education
         WHERE lan = ?
         LIMIT 1`,
                [lan]
            );

            if (!loan) {
                return res.status(404).json({
                    success: false,
                    message: "Loan not found",
                });
            }

            const allowedStatuses = new Set([
                "login",
                "bre pending",
                "bre approved",
                "rejected",
            ]);

            if (
                !allowedStatuses.has(
                    String(loan.status || "").trim().toLowerCase()
                )
            ) {
                return res.status(409).json({
                    success: false,
                    message: "BRE rerun is not allowed for this loan status.",
                    currentStatus: loan.status,
                });
            }
            // Fetch existing bureau report
            const [[bureauRow]] = await db.promise().query(
                `SELECT score, report_xml
         FROM loan_cibil_reports
         WHERE lan = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
                [lan]
            );

            let bureauResponse = null;

            if (bureauRow?.report_xml) {
                const raw = Buffer.isBuffer(bureauRow.report_xml)
                    ? bureauRow.report_xml.toString("utf8")
                    : bureauRow.report_xml;

                if (typeof raw === "string") {
                    try {
                        bureauResponse = JSON.parse(raw);
                    } catch {
                        bureauResponse = raw;
                    }
                } else {
                    bureauResponse = raw;
                }
            }


            // Use the saved bureau result only after confirming
            // its original authenticated Experian provenance.


            const [[kycRow]] = await db.promise().query(
                `SELECT bureau_status
   FROM kyc_verification_status
   WHERE lan = ?
   LIMIT 1`,
                [lan]
            );

            const bureauStatus = String(
                kycRow?.bureau_status || ""
            ).trim().toUpperCase();

            // These checks prevent missing or test reports
            // from being treated as authenticated bureau results.
            const isTestReport =
                typeof bureauResponse === "object" &&
                bureauResponse !== null &&
                (
                    String(bureauResponse.provider || "")
                        .toUpperCase().includes("DUMMY") ||
                    String(bureauResponse.enquiry_id || "")
                        .toUpperCase().startsWith("DUMMY-")
                );

            const reportAvailable =
                bureauResponse !== null &&
                bureauRow?.score != null;

            // IMPORTANT:
            // Must be populated by your trusted live bureau integration.
            // A KYC status alone does not prove Experian provenance.
            const experianSourceVerified = false;

            const verified =
                bureauStatus === "VERIFIED" &&
                reportAvailable &&
                !isTestReport &&
                experianSourceVerified;

            const bureau = {
                success: verified,
                provider: verified ? "EXPERIAN" : "UNCONFIRMED",
                verified,
                score: bureauRow?.score ?? null,
                response: bureauResponse,
            };

            const requestAmount = loan.request_amount ?? loan.loan_amount;

            const breDecision = evaluateCarePayEducationBre({
                data: loan,
                requestAmount,
                bureau,
            });

            const breSnapshot = buildCarePayEducationBreSnapshot({
                data: loan,
                requestAmount,
                bureau,
                decision: breDecision,
            });

            await db.promise().query(
                `UPDATE loan_booking_carepay_education
         SET status = ?, bre_snapshot = ?
         WHERE lan = ?`,
                [
                    breDecision.caseStatus,
                    JSON.stringify(breSnapshot),
                    lan,
                ]
            );

            return res.status(200).json({
                success: true,
                message: "CarePay Education BRE rerun successfully",
                lan,
                previousStatus: loan.status,
                status: breDecision.caseStatus,
                bre: {
                    status: breDecision.status,
                    reason: breDecision.reason,
                    reasons: breDecision.reasons,
                    pending: breDecision.pending,
                },
            });
        } catch (error) {
            console.error("CarePay Education BRE rerun error:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to rerun CarePay Education BRE",
            });
        }
    }
);

// ==========================================
// FETCH CAREPAY EDUCATION LOAN BY LAN
// ==========================================

loanBookingRouter.get("/v1/carepay-education/:lan", verifyApiKey,
    async (req, res) => {
        try {
            // ======================================
            // 1. VERIFY PARTNER
            // ======================================

            if (!isCarePayPartner(req)) {
                return res.status(403).json({
                    success: false,
                    message:
                        "This route is only for CarePay partner.",
                });
            }

            // ======================================
            // 2. VALIDATE LAN
            // ======================================

            const lan = String(
                req.params.lan || "",
            )
                .trim()
                .toUpperCase();

            if (!lan || !/^CAREDU\d+$/.test(lan)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid CarePay Education LAN is required",
                });
            }

            // ======================================
            // 3. FETCH LOAN DETAILS
            // ======================================

            const [[loan]] = await db.promise().query(
                `SELECT *
         FROM ${TABLE_NAME}
         WHERE lan = ?
         LIMIT 1`,
                [lan],
            );

            if (!loan) {
                return res.status(404).json({
                    success: false,
                    message:
                        "CarePay Education Loan not found",
                });
            }

            // ======================================
            // 4. SUCCESS RESPONSE
            // ======================================

            return res.status(200).json({
                success: true,

                message:
                    "CarePay Education Loan fetched successfully.",

                data: loan,
            });

        } catch (error) {
            console.error(
                "CarePay Education loan fetch error:",
                error,
            );

            return res.status(500).json({
                success: false,
                message: "Internal server error",
            });
        }
    },
);


loanBookingRouter.post("/mandate/update-umrn", verifyApiKey,
    async (req, res) => {
        let conn;

        try {
            // ==========================================
            // 1. VERIFY CAREPAY EDUCATION PARTNER
            // ==========================================

            if (!isCarePayPartner(req)) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Only CarePay Education partner is allowed",
                });
            }

            const {
                lan,
                amount,
                umrn,
                fatherName,
                motherName,
                bank_account_holder_name,
                bank_account_number,
                bank_name,
                bank_branch_name,
                bank_ifsc_code,
                bank_account_type,
            } = req.body || {};

            // ==========================================
            // 2. NORMALIZE INPUT
            // ==========================================

            const cleanLan = String(lan || "")
                .trim()
                .toUpperCase();

            const cleanUmrn = String(umrn || "").trim();

            const cleanIfsc = String(
                bank_ifsc_code || ""
            ).trim().toUpperCase();

            const cleanAccountNumber = String(
                bank_account_number || ""
            ).trim();

            const cleanHolderName = String(
                bank_account_holder_name || ""
            ).trim();

            const cleanBankName = String(
                bank_name || ""
            ).trim();

            const cleanBranchName = String(
                bank_branch_name || ""
            ).trim();

            const cleanAccountType = String(
                bank_account_type || ""
            ).trim();

            // ==========================================
            // 3. VALIDATE LAN
            // ==========================================

            if (!/^CAREDU\d+$/.test(cleanLan)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid CarePay Education LAN is required",
                });
            }

            // ==========================================
            // 4. VALIDATE BANK DETAILS
            // ==========================================

            if (
                !cleanHolderName ||
                !cleanAccountNumber ||
                !cleanBankName ||
                !cleanIfsc ||
                !cleanAccountType
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Bank account holder name, account number, bank name, IFSC and account type are mandatory",
                });
            }

            if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid bank IFSC code",
                });
            }

            if (!/^[0-9]{6,30}$/.test(cleanAccountNumber)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid bank account number",
                });
            }

            // ==========================================
            // 5. VALIDATE MANDATE AMOUNT
            // ==========================================

            const mandateAmount =
                amount === undefined ||
                    amount === null ||
                    String(amount).trim() === ""
                    ? null
                    : Number(amount);

            if (
                mandateAmount !== null &&
                (!Number.isFinite(mandateAmount) ||
                    mandateAmount <= 0)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid mandate amount",
                });
            }

            // ==========================================
            // 6. START TRANSACTION
            // ==========================================

            conn = await db.promise().getConnection();
            await conn.beginTransaction();

            // ==========================================
            // 7. FETCH EXISTING LOAN
            // ==========================================

            const [[existingLoan]] = await conn.query(
                `SELECT lan, status , cibil_score_fintree
         FROM loan_booking_carepay_education
         WHERE lan = ?
         LIMIT 1
         FOR UPDATE`,
                [cleanLan]
            );

            if (!existingLoan) {
                await conn.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        "No CarePay Education record found for given LAN",
                });
            }

            // ==========================================
            // 8. BRE APPROVAL VALIDATION
            // ==========================================

            const currentStatus = String(
                existingLoan.status || ""
            ).trim().toLowerCase();

            if (currentStatus !== "bre approved") {
                await conn.rollback();

                return res.status(403).json({
                    success: false,
                    message:
                        "Bank details can be updated only after BRE approval",
                    lan: cleanLan,
                    current_status: existingLoan.status,
                });
            }

            // ==========================================
            // 9. UPDATE MANDATE AND BANK DETAILS
            // ==========================================

            await conn.query(
                `UPDATE loan_booking_carepay_education
         SET
           mandate_amount =
             COALESCE(?, mandate_amount),

           umrn =
             COALESCE(
               NULLIF(TRIM(?), ''),
               umrn
             ),

           father_name =
             COALESCE(
               NULLIF(TRIM(?), ''),
               father_name
             ),

           mother_name =
             COALESCE(
               NULLIF(TRIM(?), ''),
               mother_name
             ),

           bank_account_holder_name = ?,

           bank_account_number = ?,

           bank_name = ?,

           bank_branch_name =
             COALESCE(
               NULLIF(TRIM(?), ''),
               bank_branch_name
             ),

           bank_ifsc_code = ?,

          bank_account_type = ?,
              
          modified_at = NOW()

         WHERE lan = ?
           AND status = 'BRE Approved'`,
                [
                    mandateAmount,
                    cleanUmrn,
                    fatherName ?? null,
                    motherName ?? null,
                    cleanHolderName,
                    cleanAccountNumber,
                    cleanBankName,
                    cleanBranchName || null,
                    cleanIfsc,
                    cleanAccountType,

                    cleanLan,
                ]
            );

            // ==========================================
            // 10. COMMIT
            // ==========================================

            await conn.commit();
            const approvalResult =
                await checkAndApproveCarePayEducationLoan(cleanLan);

            const approved = approvalResult.approved === true;

            const approvalMessages = {
                SALARY_DECLARATION_NOT_UPLOADED:
                    "Salary declaration document is required for NTC customers.",

                MANDATE_DETAILS_MISSING:
                    "Mandatory mandate or bank details are missing.",

                BRE_NOT_APPROVED:
                    "Loan must be BRE Approved before final approval.",

                BUREAU_SCORE_MISSING:
                    "Customer bureau score is missing or invalid.",

                APPROVAL_UPDATE_BLOCKED:
                    "Loan status could not be updated to Approved.",

                EDUCATION_LOAN_NOT_FOUND:
                    "CarePay Education loan record was not found.",

                ALREADY_APPROVED:
                    "Loan is already approved.",
            };

            return res.status(200).json({
                success: true,

                message: approved
                    ? "CarePay Education mandate updated and loan approved successfully"
                    : "CarePay Education mandate updated, but loan approval is pending",

                lan: cleanLan,

                mandate_updated: true,
                bank_details_updated: true,
                umrn_updated: Boolean(cleanUmrn),

                customer_type:
                    approvalResult.customer_type || null,

                approved,

                status:
                    approvalResult.status || existingLoan.status,

                approval_reason: approved
                    ? null
                    : approvalResult.reason || "APPROVAL_PENDING",

                approval_message: approved
                    ? "All required approval conditions are complete."
                    : approvalMessages[approvalResult.reason] ||
                    "Loan approval requirements are not complete.",

                missing_fields:
                    approvalResult.missing_fields || [],

                salary_declaration_uploaded:
                    approvalResult.salary_declaration_uploaded === true,

                carepay_education_approval: approvalResult,
            });

        } catch (error) {
            if (conn) {
                try {
                    await conn.rollback();
                } catch (rollbackError) {
                    console.error(
                        "CarePay Education rollback error:",
                        rollbackError
                    );
                }
            }

            console.error("CAREDU MANDATE UPDATE ERROR:", {
                message: error.message,
                code: error.code,
                errno: error.errno,
                sqlMessage: error.sqlMessage,
                stack: error.stack,
            });

            return res.status(500).json({
                success: false,
                message: error.sqlMessage || error.message,
                error_code: error.code || "INTERNAL_ERROR",

                // Detailed diagnostics only for local/UAT debugging
                ...(process.env.NODE_ENV !== "production" && {
                    error_details: {
                        errno: error.errno || null,
                        sql_message: error.sqlMessage || null,
                    },
                }),
            });
        } finally {
            if (conn) {
                conn.release();
            }
        }
    }
);


/*
|--------------------------------------------------------------------------
| CAREPAY EDUCATION - OPS L1 Approved
|--------------------------------------------------------------------------
*/

loanBookingRouter.put(  "/v1/carepay-edu-ops-l1-status/:lan",
  verifyApiKey,
  async (req, res) => {
    try {
      if (!isCarePayPartner(req)) {
        return res.status(403).json({
          status: "FAILED",
          message: "Unauthorized CarePay Education partner",
        });
      }

      const lan = String(req.params.lan || "")
        .trim()
        .toUpperCase();

      const { ops_checker_id, ops_checker_name, status } =
        req.body || {};

      const requestedStatus = String(status || "")
        .trim()
        .toLowerCase();

      if (!/^CAREDU\d+$/.test(lan)) {
        return res.status(400).json({
          status: "FAILED",
          message: "Invalid CarePay Education LAN",
        });
      }

      if (
        !["disburse initiate", "rejected"].includes(
          requestedStatus
        )
      ) {
        return res.status(400).json({
          status: "FAILED",
          message: "Invalid Ops L1 status",
          allowed_status: ["Disburse initiate", "Rejected"],
        });
      }

      if (!ops_checker_id || !String(ops_checker_name || "").trim()) {
        return res.status(400).json({
          status: "FAILED",
          message: "Ops checker ID and name are required",
        });
      }

      const finalStatus =
        requestedStatus === "disburse initiate"
          ? "ops_l1_approved"
          : "Rejected";

      // Only Approved loans can be processed.
      // Conditional UPDATE prevents double transitions.
      const [result] = await db.promise().query(
        `UPDATE loan_booking_carepay_education
         SET status = ?,
             modified_at = NOW()
         WHERE lan = ?
           AND UPPER(TRIM(status)) = 'APPROVED'`,
        [finalStatus, lan]
      );

      if (result.affectedRows === 0) {
        const [[loan]] = await db.promise().query(
          `SELECT status
           FROM loan_booking_carepay_education
           WHERE lan = ?
           LIMIT 1`,
          [lan]
        );

        return res.status(loan ? 409 : 404).json({
          status: "FAILED",
          message: loan
            ? "Only Approved Education loans can be handled by Ops L1"
            : "CarePay Education loan not found",
          current_status: loan?.status || null,
        });
      }

      return res.status(200).json({
        status: "SUCCESS",
        lan,
        ops_checker_id,
        ops_checker_name,
        previous_status: "Approved",
        final_status: finalStatus,
        message:
          finalStatus === "Disburse initiate"
            ? "Education loan moved to Disburse initiate successfully"
            : "Education loan rejected by Ops L1",
      });

    } catch (error) {
      console.error("CAREDU OPS L1 ERROR:", error);

      return res.status(500).json({
        status: "FAILED",
        message: "Failed to update Education Ops L1 status",
        ...(
          process.env.NODE_ENV !== "production"
            ? { error: error.message }
            : {}
        ),
      });
    }
  }
);


/*
|--------------------------------------------------------------------------
| CAREPAY EDUCATION - OPS L2  Disbursed
|--------------------------------------------------------------------------
*/


loanBookingRouter.put( "/v1/carepay-edu-ops-l2-status/:lan",
  verifyApiKey,
  async (req, res) => {
    try {
      // ==========================================
      // 1. VERIFY CAREPAY EDUCATION PARTNER
      // ==========================================

      if (!isCarePayPartner(req)) {
        return res.status(403).json({
          status: "FAILED",
          message: "Unauthorized CarePay Education partner",
        });
      }

      // ==========================================
      // 2. NORMALIZE INPUT
      // ==========================================

      const lan = String(req.params.lan || "")
        .trim()
        .toUpperCase();

      const {
        ops_checker_id,
        ops_checker_name,
        status,
      } = req.body || {};

      const requestedStatus = String(status || "")
        .trim()
        .toUpperCase();

      // ==========================================
      // 3. VALIDATE INPUT
      // ==========================================

      if (!/^CAREDU\d+$/.test(lan)) {
        return res.status(400).json({
          status: "FAILED",
          message: "Invalid CarePay Education LAN",
        });
      }

      if (
        !["APPROVED", "OPS_REJECTED"].includes(
          requestedStatus
        )
      ) {
        return res.status(400).json({
          status: "FAILED",
          message: "Invalid Ops L2 status",
          allowed_status: [
            "APPROVED",
            "OPS_REJECTED",
          ],
        });
      }

      if (
        !ops_checker_id ||
        !String(ops_checker_name || "").trim()
      ) {
        return res.status(400).json({
          status: "FAILED",
          message:
            "Ops checker ID and name are required",
        });
      }

      // ==========================================
      // 4. FETCH EXISTING LOAN
      // ==========================================

      const [[loan]] = await db.promise().query(
        `SELECT lan, status
         FROM loan_booking_carepay_education
         WHERE lan = ?
         LIMIT 1`,
        [lan]
      );

      if (!loan) {
        return res.status(404).json({
          status: "FAILED",
          message: "CarePay Education loan not found",
        });
      }

      // ==========================================
      // 5. VERIFY OPS L1 APPROVAL
      // ==========================================

      const currentStatus = String(
        loan.status || ""
      )
        .trim()
        .toLowerCase();

      if (currentStatus !== "ops_l1_approved") {
        return res.status(409).json({
          status: "FAILED",
          message:
            "Ops L2 can process only Ops L1 Approved Education loans",
          lan,
          current_status: loan.status,
          required_status: "ops_l1_approved",
        });
      }

      // ==========================================
      // 6. DETERMINE FINAL STATUS
      // ==========================================

      const finalStatus =
        requestedStatus === "APPROVED"
          ? "Disburse_Initiated"
          : "OPS_REJECTED";

      // ==========================================
      // 7. UPDATE LOAN STATUS
      // ==========================================

      const [result] = await db.promise().query(
        `UPDATE loan_booking_carepay_education
         SET status = ?,
             modified_at = NOW()
         WHERE lan = ?
           AND LOWER(TRIM(status)) = 'ops_l1_approved'`,
        [finalStatus, lan]
      );

      if (result.affectedRows === 0) {
        const [[latestLoan]] =
          await db.promise().query(
            `SELECT status
             FROM loan_booking_carepay_education
             WHERE lan = ?
             LIMIT 1`,
            [lan]
          );

        return res.status(409).json({
          status: "FAILED",
          message:
            "Loan status changed before Ops L2 approval",
          lan,
          current_status:
            latestLoan?.status || null,
        });
      }

      // ==========================================
      // 8. SUCCESS RESPONSE
      // ==========================================

      return res.status(200).json({
        status: "SUCCESS",
        lan,

        ops_checker_id,
        ops_checker_name,

        previous_status: "ops_l1_approved",
        final_status: finalStatus,

        message:
          finalStatus === "disburse_initiated"
            ? "CarePay Education loan approved by Ops L2 successfully"
            : "CarePay Education loan rejected by Ops L2",
      });

    } catch (error) {
      console.error(
        "CAREDU OPS L2 ERROR:",
        error
      );

      return res.status(500).json({
        status: "FAILED",
        message:
          "Failed to process CarePay Education Ops L2 status",

        ...(
          process.env.NODE_ENV !== "production"
            ? {
                error: error.sqlMessage ||
                  error.message,
              }
            : {}
        ),
      });
    }
  }
);



module.exports = loanBookingRouter;
module.exports.checkAndApproveCarePayEducationLoan =
    checkAndApproveCarePayEducationLoan;
