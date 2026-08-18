const fs = require("fs/promises");
const db = require("../config/db");

/*
|--------------------------------------------------------------------------
| NORMALIZATION FUNCTIONS
|--------------------------------------------------------------------------
*/

const normalizeText = (value) =>
    String(value || "")
        .trim()
        .toUpperCase()
        .replace(/&/g, "AND")
        .replace(/[^A-Z0-9]/g, "");

const normalizeAccountNumber = (value) =>
    String(value || "")
        .trim()
        .replace(/\D/g, "");

const normalizeIfsc = (value) =>
    String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

const normalizeAmount = (value) => {
    const cleaned = String(value || "")
        .replace(/[₹,\s]/g, "")
        .replace(/[^\d.-]/g, "");

    if (!cleaned) {
        return null;
    }

    const amount = Number(cleaned);

    return Number.isFinite(amount)
        ? Number(amount.toFixed(2))
        : null;
};

const normalizeTenure = (value) => {
    const match = String(value || "").match(/\d+/);

    if (!match) {
        return null;
    }

    const tenure = Number(match[0]);

    return Number.isInteger(tenure) ? tenure : null;
};

/*
|--------------------------------------------------------------------------
| PDF TEXT CLEANING
|--------------------------------------------------------------------------
*/

const cleanPdfText = (value) =>
    String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

 const detectDigioSignature = (pdfText) => {
  const text = String(pdfText || "")
    .replace(/\s+/g, " ")
    .trim();

  
  const signedByPresent =
    /\bsigned\s*by\b\s*[:\-]?/i.test(text);

  return {
    signature_present: signedByPresent,
    signature_type: signedByPresent
      ? "SIGNED_BY_MARKER"
      : null,
    detection_method: "PDF_TEXT",
  };
};
/*
|--------------------------------------------------------------------------
| PDF-PARSE COMPATIBILITY
|--------------------------------------------------------------------------
|
| This supports both:
| 1. Older pdf-parse versions
| 2. Newer pdf-parse versions
|
*/

const extractPdfText = async (filePath) => {
    const pdfBuffer = await fs.readFile(filePath);

    if (!pdfBuffer.length) {
        throw new Error("Uploaded agreement PDF is empty.");
    }

    const pdfParseModule = require("pdf-parse");

    // Older pdf-parse versions
    if (typeof pdfParseModule === "function") {
        const result = await pdfParseModule(pdfBuffer);

        return cleanPdfText(result?.text);
    }

    // Some CommonJS exports provide the function under default
    if (typeof pdfParseModule.default === "function") {
        const result = await pdfParseModule.default(pdfBuffer);

        return cleanPdfText(result?.text);
    }

    // Newer pdf-parse versions
    if (typeof pdfParseModule.PDFParse === "function") {
        const parser = new pdfParseModule.PDFParse({
            data: pdfBuffer,
        });

        try {
            const result = await parser.getText();

            return cleanPdfText(result?.text);
        } finally {
            if (typeof parser.destroy === "function") {
                await parser.destroy();
            }
        }
    }

    throw new Error(
        "Unsupported pdf-parse version. Unable to find PDF parser.",
    );
};

/*
|--------------------------------------------------------------------------
| REGEX EXTRACTION HELPER
|--------------------------------------------------------------------------
*/

const extractUsingPatterns = (text, patterns) => {
    for (const pattern of patterns) {
        const match = text.match(pattern);

        if (match?.[1]) {
            return String(match[1]).trim();
        }
    }

    return null;
};

/*
|--------------------------------------------------------------------------
| EXTRACT AGREEMENT VALUES
|--------------------------------------------------------------------------
|
| These patterns intentionally support multiple possible labels.
| If your agreement uses different labels, the patterns must be adjusted
| after checking one actual CarePay agreement.
|
*/

const extractAgreementValues = (pdfText) => {
    const singleLineText = pdfText
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const customerName = extractUsingPatterns(singleLineText, [
        /(?:borrower\s*name|customer\s*name|name\s*of\s*(?:the\s*)?borrower|applicant\s*name)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{1,150}?)(?=\s+(?:loan\s*amount|sanctioned\s*amount|tenure|mobile|pan|address|account\s*holder|bank\s*name|$))/i,

        /(?:borrower|customer|applicant)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{1,150}?)(?=\s+(?:loan\s*amount|sanctioned\s*amount|tenure|mobile|pan|address|bank|$))/i,
    ]);

    const loanAmount = extractUsingPatterns(singleLineText, [
        /(?:loan\s*amount|sanctioned\s*loan\s*amount|sanctioned\s*amount|principal\s*amount|amount\s*of\s*loan)\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    ]);

    const netDisbursement = extractUsingPatterns(
        singleLineText,
        [
            /(?:net\s*disbursement(?:\s*amount)?|net\s*disbursal(?:\s*amount)?|net\s*amount\s*disbursed|amount\s*disbursed)\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
        ],
    );

    const loanTenure = extractUsingPatterns(singleLineText, [
        /(?:loan\s*tenure|tenure\s*of\s*loan|repayment\s*tenure|tenure)\s*[:\-]?\s*(\d{1,3}(?:\s*(?:months?|month|instalments?|installments?))?)/i,
    ]);

    const accountHolderName = extractUsingPatterns(
        singleLineText,
        [
            /(?:bank\s*account\s*holder\s*name|account\s*holder\s*name|name\s*of\s*(?:the\s*)?account\s*holder|beneficiary\s*name)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{1,150}?)(?=\s+(?:(?:bank\s*)?account\s*(?:number|no\.?)|(?:bank\s*)?name|(?:bank\s*)?branch|(?:bank\s*)?ifsc|(?:bank\s*)?account\s*type|$))/i,
        ],
    );

    const accountNumber = extractUsingPatterns(singleLineText, [
        /(?:bank\s*account\s*(?:number|no\.?)|account\s*(?:number|no\.?)|a\/c\s*(?:number|no\.?))\s*[:\-]?\s*([0-9Xx* -]{4,40})/i,
    ]);

    const bankName = extractUsingPatterns(
        singleLineText,
        [
            /(?:bank\s*name|name\s*of\s*(?:the\s*)?bank)\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9 &.,'-]{1,150}?)(?=\s+(?:(?:bank\s*)?branch(?:\s*name)?|(?:bank\s*)?ifsc(?:\s*code)?|(?:bank\s*)?account\s*type|(?:bank\s*)?account\s*(?:number|no\.?)|$))/i,
        ],
    );

    const branchName = extractUsingPatterns(
        singleLineText,
        [
            /(?:bank\s*branch\s*name|bank\s*branch|branch\s*name|branch)\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9 &.,()'/-]{1,150}?)(?=\s+(?:(?:bank\s*)?ifsc(?:\s*code)?|(?:bank\s*)?account\s*type|(?:bank\s*)?account\s*(?:number|no\.?)|(?:bank\s*)?name|$))/i,
        ],
    );

    const ifscCode = extractUsingPatterns(singleLineText, [
        /(?:bank\s*ifsc\s*code|ifsc\s*code|ifsc)\s*[:\-]?\s*([A-Z]{4}\s*0\s*[A-Z0-9]{6})/i,

        /(?:bank\s*ifsc\s*code|ifsc\s*code|ifsc)\s*[:\-]?\s*([A-Z0-9]{11})/i,
    ]);

    const accountType = extractUsingPatterns(singleLineText, [
        /(?:bank\s*account\s*type|account\s*type|type\s*of\s*account)\s*[:\-]\s*(savings?|current|salary|overdraft|cash\s*credit)/i,
    ]);

    return {
        customer_name: customerName,
        loan_amount: loanAmount,
        net_disbursement: netDisbursement,
        loan_tenure: loanTenure,
        bank_account_holder_name: accountHolderName,
        bank_account_number: accountNumber,
        bank_name: bankName,
        bank_branch_name: branchName,
        bank_ifsc_code: ifscCode,
        bank_account_type: accountType,
    };
};

/*
|--------------------------------------------------------------------------
| SAFE VALIDATION DETAILS
|--------------------------------------------------------------------------
|
| Do not store complete PDF text in the database.
|
*/

const buildSafeExtractedValues = (extractedValues) => ({
    customer_name: extractedValues.customer_name,
    loan_amount: extractedValues.loan_amount,
    net_disbursement:
        extractedValues.net_disbursement,
    loan_tenure: extractedValues.loan_tenure,
    bank_account_holder_name:
        extractedValues.bank_account_holder_name,

    // Do not expose the complete account number in validation details
    bank_account_number: extractedValues.bank_account_number
        ? `****${normalizeAccountNumber(
            extractedValues.bank_account_number,
        ).slice(-4)}`
        : null,

    bank_name: extractedValues.bank_name,
    bank_branch_name: extractedValues.bank_branch_name,
    bank_ifsc_code: extractedValues.bank_ifsc_code,
    bank_account_type: extractedValues.bank_account_type,
});

/*
|--------------------------------------------------------------------------
| DATABASE UPDATE
|--------------------------------------------------------------------------
*/

const updateAgreementValidation = async ({
    lan,
    status,
    reason,
    details,
}) => {
    await db.promise().query(
        `UPDATE loan_booking_carepay
     SET agreement_validation_status = ?,
         agreement_validation_reason = ?,
         agreement_validation_details = ?,
         agreement_validated_at = NOW()
     WHERE lan = ?`,
        [
            status,
            reason || null,
            details ? JSON.stringify(details) : null,
            lan,
        ],
    );
};

/*
|--------------------------------------------------------------------------
| ADD MISMATCH
|--------------------------------------------------------------------------
*/

const addMismatch = ({
    mismatches,
    field,
    databaseValue,
    agreementValue,
    maskValues = false,
}) => {
    let safeDatabaseValue = databaseValue;
    let safeAgreementValue = agreementValue;

    if (maskValues) {
        const dbDigits = normalizeAccountNumber(databaseValue);
        const agreementDigits =
            normalizeAccountNumber(agreementValue);

        safeDatabaseValue = dbDigits
            ? `****${dbDigits.slice(-4)}`
            : null;

        safeAgreementValue = agreementDigits
            ? `****${agreementDigits.slice(-4)}`
            : null;
    }

    mismatches.push({
        field,
        database_value: safeDatabaseValue ?? null,
        agreement_value: safeAgreementValue ?? null,
    });
};

/*
|--------------------------------------------------------------------------
| COMPARE AGREEMENT WITH DATABASE
|--------------------------------------------------------------------------
*/

const compareAgreementValues = ({
    loan,
    extractedValues,
}) => {
    const mismatches = [];

    if (
        normalizeText(loan.customer_name) !==
        normalizeText(extractedValues.customer_name)
    ) {
        addMismatch({
            mismatches,
            field: "customer_name",
            databaseValue: loan.customer_name,
            agreementValue: extractedValues.customer_name,
        });
    }

    if (
        normalizeAmount(loan.loan_amount) !==
        normalizeAmount(extractedValues.loan_amount)
    ) {
        addMismatch({
            mismatches,
            field: "loan_amount",
            databaseValue: loan.loan_amount,
            agreementValue: extractedValues.loan_amount,
        });
    }

    if (
        normalizeAmount(loan.net_disbursement) !==
        normalizeAmount(
            extractedValues.net_disbursement,
        )
    ) {
        addMismatch({
            mismatches,
            field: "net_disbursement",
            databaseValue: loan.net_disbursement,
            agreementValue:
                extractedValues.net_disbursement,
        });
    }

    if (
        normalizeTenure(loan.loan_tenure) !==
        normalizeTenure(extractedValues.loan_tenure)
    ) {
        addMismatch({
            mismatches,
            field: "loan_tenure",
            databaseValue: loan.loan_tenure,
            agreementValue: extractedValues.loan_tenure,
        });
    }

    if (
        normalizeText(loan.bank_account_holder_name) !==
        normalizeText(
            extractedValues.bank_account_holder_name,
        )
    ) {
        addMismatch({
            mismatches,
            field: "bank_account_holder_name",
            databaseValue: loan.bank_account_holder_name,
            agreementValue:
                extractedValues.bank_account_holder_name,
        });
    }

    if (
        normalizeAccountNumber(loan.bank_account_number) !==
        normalizeAccountNumber(
            extractedValues.bank_account_number,
        )
    ) {
        addMismatch({
            mismatches,
            field: "bank_account_number",
            databaseValue: loan.bank_account_number,
            agreementValue:
                extractedValues.bank_account_number,
            maskValues: true,
        });
    }

    if (
        normalizeText(loan.bank_name) !==
        normalizeText(extractedValues.bank_name)
    ) {
        addMismatch({
            mismatches,
            field: "bank_name",
            databaseValue: loan.bank_name,
            agreementValue: extractedValues.bank_name,
        });
    }

    if (
        normalizeText(loan.bank_branch_name) !==
        normalizeText(extractedValues.bank_branch_name)
    ) {
        addMismatch({
            mismatches,
            field: "bank_branch_name",
            databaseValue: loan.bank_branch_name,
            agreementValue:
                extractedValues.bank_branch_name,
        });
    }

    if (
        normalizeIfsc(loan.bank_ifsc_code) !==
        normalizeIfsc(extractedValues.bank_ifsc_code)
    ) {
        addMismatch({
            mismatches,
            field: "bank_ifsc_code",
            databaseValue: loan.bank_ifsc_code,
            agreementValue:
                extractedValues.bank_ifsc_code,
        });
    }

    if (
        normalizeText(loan.bank_account_type) !==
        normalizeText(extractedValues.bank_account_type)
    ) {
        addMismatch({
            mismatches,
            field: "bank_account_type",
            databaseValue: loan.bank_account_type,
            agreementValue:
                extractedValues.bank_account_type,
        });
    }

    return mismatches;
};

/*
|--------------------------------------------------------------------------
| MAIN VALIDATION FUNCTION
|--------------------------------------------------------------------------
*/

const validateCarePayLoanAgreement = async ({
    lan,
    filePath,
}) => {
    const cleanLan = String(lan || "")
        .trim()
        .toUpperCase();

    if (!cleanLan) {
        throw new Error("LAN is required for agreement validation.");
    }

    if (!filePath) {
        throw new Error(
            "Agreement file path is required for validation.",
        );
    }

    // Immediately reset old validation.
    await db.promise().query(
        `UPDATE loan_booking_carepay
     SET agreement_validation_status = 'PENDING',
         agreement_validation_reason = NULL,
         agreement_validation_details = NULL,
         agreement_validated_at = NULL,
          agreement_esign_status = 'PENDING'
     WHERE lan = ?`,
        [cleanLan],
    );

    try {
        const [[loan]] = await db.promise().query(
            `SELECT
          lan,
          customer_name,
          loan_amount,
          net_disbursement,
          loan_tenure,
          bank_account_holder_name,
          bank_account_number,
          bank_name,
          bank_branch_name,
          bank_ifsc_code,
          bank_account_type
       FROM loan_booking_carepay
       WHERE lan = ?
       LIMIT 1`,
            [cleanLan],
        );

        if (!loan) {
            throw new Error(
                `CarePay loan not found for LAN ${cleanLan}.`,
            );
        }

        const pdfText = await extractPdfText(filePath);

        if (!pdfText) {
            throw new Error(
                "No readable text was extracted from the agreement. The PDF may be scanned, corrupted or password-protected.",
            );
        }

        const signatureValidation =
  detectDigioSignature(pdfText);

if (!signatureValidation.signature_present) {
  const details = {
    signature_validation:
      signatureValidation,
  };

  await db.promise().query(
    `UPDATE loan_booking_carepay
     SET agreement_validation_status = 'FAILED',
         agreement_validation_reason =
           'Digio Aadhaar e-sign stamp not detected in loan agreement.',
         agreement_validation_details = ?,
         agreement_validated_at = NOW(),
         agreement_esign_status = 'PENDING'
     WHERE lan = ?`,
    [
      JSON.stringify(details),
      cleanLan,
    ],
  );

  return {
    matched: false,
    status: "FAILED",
    reason: "LOAN_AGREEMENT_NOT_SIGNED",
    signature_present: false,
    signature_validation:
      signatureValidation,
    mismatches: [],
  };
}
        const extractedValues =
            extractAgreementValues(pdfText);

        const requiredFields = [
            "customer_name",
            "loan_amount",
            "net_disbursement",
            "loan_tenure",
            "bank_account_holder_name",
            "bank_account_number",
            "bank_name",
            "bank_branch_name",
            "bank_ifsc_code",
            "bank_account_type",
        ];

        const missingFields = requiredFields.filter(
            (field) =>
                extractedValues[field] === null ||
                extractedValues[field] === undefined ||
                String(extractedValues[field]).trim() === "",
        );

        if (missingFields.length) {
            const details = {
                missing_fields: missingFields,
                extracted_values:
                    buildSafeExtractedValues(extractedValues),
            };

            await updateAgreementValidation({
                lan: cleanLan,
                status: "FAILED",
                reason:
                    "Required values could not be extracted from the agreement.",
                details,
            });

            return {
                matched: false,
                status: "FAILED",
                reason: "REQUIRED_FIELDS_NOT_EXTRACTED",
                missing_fields: missingFields,
                extracted_values:
                    buildSafeExtractedValues(extractedValues),
                mismatches: [],
            };
        }

        const mismatches = compareAgreementValues({
            loan,
            extractedValues,
        });

        if (mismatches.length) {
            const details = {
                extracted_values:
                    buildSafeExtractedValues(extractedValues),
                mismatches,
            };

            await updateAgreementValidation({
                lan: cleanLan,
                status: "MISMATCHED",
                reason:
                    "Agreement values do not match the CarePay loan data.",
                details,
            });

            return {
                matched: false,
                status: "MISMATCHED",
                reason: "LOAN_AGREEMENT_MISMATCH",
                mismatches,
            };
        }

        const details = {
            extracted_values:
                buildSafeExtractedValues(extractedValues),
            matched_fields: requiredFields,
        };

       await db.promise().query(
  `UPDATE loan_booking_carepay
   SET agreement_validation_status = 'MATCHED',
       agreement_validation_reason = NULL,
       agreement_validation_details = ?,
       agreement_validated_at = NOW(),
       agreement_esign_status = 'Signed'
   WHERE lan = ?`,
  [
    JSON.stringify({
      ...details,
      signature_validation:
        signatureValidation,
    }),
    cleanLan,
  ],
);

        return {
  matched: true,
  status: "MATCHED",
  reason: null,
  signature_present: true,
  signature_type:
    signatureValidation.signature_type,
  signed_by:
    signatureValidation.signed_by,
  signed_at:
    signatureValidation.signed_at,
  matched_fields: requiredFields,
  mismatches: [],
};
    } catch (error) {
        console.error(
            "CarePay agreement validation error:",
            {
                lan: cleanLan,
                message: error.message,
                stack: error.stack,
            },
        );

        await updateAgreementValidation({
            lan: cleanLan,
            status: "FAILED",
            reason: error.message,
            details: {
                error_code:
                    "AGREEMENT_VALIDATION_PROCESS_FAILED",
            },
        });

        return {
            matched: false,
            status: "FAILED",
            reason: "AGREEMENT_VALIDATION_PROCESS_FAILED",
            error: error.message,
            mismatches: [],
        };
    }
};

module.exports = {
    validateCarePayLoanAgreement,
};