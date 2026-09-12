const db = require("../config/db");

const { getPanCardDetails } = require("../services/pancardapiservice");

const { runBureau } = require("../services/Bueraupullapiservice");

const { initAadhaarKyc } = require("../services/digitapaadharservice");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const {
  autoApproveMotionCorpIfAllVerified,
} = require("../routes/MotionCorp/motionCorpBRE");
const {
  autoApproveSampadaIfAllVerified,
} = require("../routes/Sampada/sampadaBRE");
const {
  autoApproveSevenFinCorpIfAllVerified,
} = require("../routes/Seven Fincorp/sevenFincorpBRE");
const { autoApproveSrbhIfAllVerified } = require("../routes/srbh/srbhBRE");
const {
  autoApproveBundelaIfAllVerified,
} = require("../routes/Bundela/bundelaBRE");
// const {
//   autoApproveFundifyIfAllVerified
// } = require("../routes/Fundify/fundigyBRE");

const joinAddress = (...parts) =>
  parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");

const generateAndStoreSampadaPanVerificationPdf = async ({
  connection,
  lan,
  applicantType,
  partyNo,
  panNumber,
  applicantName,
  response,
}) => {
  const outputDirectory = path.join(__dirname, "../uploads");
  await fs.promises.mkdir(outputDirectory, { recursive: true });

  const safeLan = String(lan ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const normalizedApplicantType = String(applicantType || "").trim().toUpperCase();
  const normalizedPartyNo = Number(partyNo) || 1;
  const fileName = `PAN_Verification_${safeLan}_${normalizedApplicantType}_${normalizedPartyNo}_${Date.now()}.pdf`;
  const filePath = path.join(outputDirectory, fileName);

  await new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 48 });
    const stream = fs.createWriteStream(filePath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    document.on("error", reject);
    document.pipe(stream);

    const pageWidth = document.page.width;
    const contentWidth = pageWidth - 96;
    const labelWidth = 190;
    const valueWidth = contentWidth - labelWidth;
    const left = 48;
    const bottomLimit = document.page.height - 48;

    const printableValue = (value) => {
      if (value === null || value === undefined || value === "") return "-";
      if (typeof value === "boolean") return value ? "Yes" : "No";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    };

    const readableLabel = (key) =>
      String(key || "")
        .replace(/\[(\d+)\]/g, " $1")
        .replace(/[._-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (character) => character.toUpperCase())
        .trim();

    const flattenResponse = (value, prefix = "") => {
      if (value === null || value === undefined || typeof value !== "object") {
        return [[prefix || "Response", printableValue(value)]];
      }

      const entries = [];
      for (const [key, nestedValue] of Object.entries(value)) {
        const field = prefix ? `${prefix}.${key}` : key;
        if (nestedValue !== null && typeof nestedValue === "object") {
          entries.push(...flattenResponse(nestedValue, field));
        } else {
          entries.push([field, printableValue(nestedValue)]);
        }
      }
      return entries.length ? entries : [[prefix || "Response", "-"]];
    };

    const ensureSpace = (height, repeatHeader) => {
      if (document.y + height <= bottomLimit) return;
      document.addPage();
      if (repeatHeader) repeatHeader();
    };

    const drawTableHeader = () => {
      const y = document.y;
      document.rect(left, y, contentWidth, 27).fill("#173866");
      document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
      document.text("FIELD", left + 9, y + 9, { width: labelWidth - 18 });
      document.text("VALUE", left + labelWidth + 9, y + 9, {
        width: valueWidth - 18,
      });
      document.y = y + 27;
    };

    const drawRows = (rows) => {
      drawTableHeader();
      rows.forEach(([rawLabel, rawValue], index) => {
        const label = readableLabel(rawLabel);
        const value = printableValue(rawValue);
        document.font("Helvetica").fontSize(9);
        const labelHeight = document.heightOfString(label, { width: labelWidth - 18 });
        const valueHeight = document.heightOfString(value, { width: valueWidth - 18 });
        const rowHeight = Math.max(28, labelHeight + 14, valueHeight + 14);
        ensureSpace(rowHeight, drawTableHeader);
        const y = document.y;
        document
          .rect(left, y, contentWidth, rowHeight)
          .fill(index % 2 === 0 ? "#f7faff" : "#ffffff");
        document
          .lineWidth(0.5)
          .strokeColor("#dbe4f0")
          .rect(left, y, contentWidth, rowHeight)
          .stroke();
        document
          .moveTo(left + labelWidth, y)
          .lineTo(left + labelWidth, y + rowHeight)
          .stroke();
        document.fillColor("#41536d").font("Helvetica-Bold").fontSize(9);
        document.text(label, left + 9, y + 7, { width: labelWidth - 18 });
        document.fillColor("#17233b").font("Helvetica").fontSize(9);
        document.text(value, left + labelWidth + 9, y + 7, {
          width: valueWidth - 18,
        });
        document.y = y + rowHeight;
      });
    };

    const drawSectionTitle = (title) => {
      ensureSpace(34);
      document.moveDown(0.8);
      document.fillColor("#173866").font("Helvetica-Bold").fontSize(12).text(title);
      document.moveDown(0.45);
    };

    document.rect(0, 0, pageWidth, 92).fill("#173866");
    document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20);
    document.text("PAN Verification Report", left, 31, {
      width: contentWidth,
      align: "center",
    });
    document.fillColor("#dbeafe").font("Helvetica").fontSize(9);
    document.text("Sampada | Identity Verification Record", left, 59, {
      width: contentWidth,
      align: "center",
    });
    document.y = 112;

    drawSectionTitle("Applicant Details");
    drawRows([
      ["LAN", lan],
      ["Applicant Type", normalizedApplicantType],
      ["Party Number", normalizedPartyNo],
      ["Applicant Name", applicantName || "-"],
      ["PAN Number", panNumber],
      ["Verification Status", "VERIFIED"],
      ["Generated At", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })],
    ]);

    drawSectionTitle("PAN Provider Response");
    drawRows(flattenResponse(response));

    document.moveDown();
    document.fillColor("#718096").font("Helvetica").fontSize(8);
    document.text("This is a system-generated PAN verification report.", {
      width: contentWidth,
      align: "center",
    });
    document.end();
  });

  await connection.query(
    `INSERT INTO loan_documents
     (lan, doc_name, file_name, original_name, uploaded_at)
     VALUES (?, 'PAN_VERIFICATION_RESPONSE', ?, ?, NOW())`,
    [lan, fileName, fileName],
  );

  return { fileName, filePath };
};

const extractBureauReportXml = (response) => {
  if (!response) {
    return null;
  }

  const candidates = [
    response,
    response.data,
    response.response,
    response.result,
    response.payload,

    response.report_xml,
    response.reportXml,
    response.xml,
    response.rawXml,
    response.raw_response,

    response.data?.report_xml,
    response.data?.reportXml,
    response.data?.xml,
    response.data?.rawXml,
    response.data?.response,

    response.response?.report_xml,
    response.response?.xml,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const value = candidate.trim();

    if (value.startsWith("<") && value.includes(">")) {
      return value;
    }
  }

  return null;
};

async function runApplicantValidation({
  pool,
  lan,
  table,
  applicantType,
  partyNo = 1,
  applicantData,
  validations = {},
}) {
  try {
    console.log(`🚀 Running ${applicantType} validations for ${lan}`);
    const normalizedPartyNo = Number(partyNo);

    if (!Number.isInteger(normalizedPartyNo) || normalizedPartyNo <= 0) {
      throw new Error(`Invalid party number for ${applicantType}`);
    }

    const runPanValidation = validations.pan !== false;
    const runAadhaarValidation = validations.aadhaar !== false;
    const runBureauValidation = validations.bureau !== false;

    // Ensure row exists
    await pool.query(
      `
      INSERT IGNORE INTO kyc_verification_status (
        lan,
        applicant_type,
        party_no,
        applicant_name,
        mobile_number,
        pan_number
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        lan,
        applicantType,
        normalizedPartyNo,
        applicantData.customer_name,
        applicantData.mobile_number,
        applicantData.pan_number,
      ],
    );

    const shouldRunValidation = (status) => {
      const normalizedStatus = String(status || "").toUpperCase();

      return (
        !normalizedStatus ||
        normalizedStatus === "PENDING" ||
        normalizedStatus === "FAILED"
      );
    };

    const [statusRows] = await pool.query(
      `
      SELECT
        pan_status,
        aadhaar_status,
        aadhaar_transaction_id,
        aadhaar_kyc_url,
        aadhaar_unique_id,
        bureau_status,
        bureau_api_response
      FROM kyc_verification_status
      WHERE lan = ?
      AND applicant_type = ?
      AND party_no = ?
      LIMIT 1
      `,
      [lan, applicantType, normalizedPartyNo],
    );

    const currentStatus = statusRows[0] || {};

    // =========================
    // PAN VALIDATION
    // =========================

    if (runPanValidation && shouldRunValidation(currentStatus.pan_status)) {
      await pool.query(
        `
        UPDATE kyc_verification_status
        SET pan_status = 'INITIATED'
        WHERE lan = ?
        AND applicant_type = ?
        AND party_no = ?
        `,
        [lan, applicantType, normalizedPartyNo],
      );

      const panResult = await getPanCardDetails(
        applicantData.pan_number,
        applicantData.customer_name,
      ).catch((err) => {
        console.error(
          `❌ ${applicantType} PAN Error:`,
          err?.response?.data || err,
        );

        return {
          success: false,
          response: err?.response?.data || {
            error: err.message || String(err),
          },
        };
      });

      await pool.query(
        `
        UPDATE kyc_verification_status
        SET
          pan_status = ?,
          pan_api_response = ?
        WHERE lan = ?
        AND applicant_type = ?
        AND party_no = ?
        `,
        [
          panResult.success ? "VERIFIED" : "FAILED",
          JSON.stringify(panResult.response || {}),
          lan,
          applicantType,
          normalizedPartyNo,
        ],
      );

      console.log(
        `📌 ${applicantType} PAN:`,
        panResult.success ? "VERIFIED" : "FAILED",
      );

      if (panResult.success && lan.startsWith("SPL")) {
        try {
          await generateAndStoreSampadaPanVerificationPdf({
            connection: pool,
            lan,
            applicantType,
            partyNo: normalizedPartyNo,
            panNumber: applicantData.pan_number,
            applicantName: applicantData.customer_name,
            response: panResult.response || panResult,
          });
        } catch (pdfError) {
          console.error(`Sampada PAN PDF generation failed for ${lan}:`, pdfError);
        }
      }
    } else if (runPanValidation) {
      console.log(
        `⏭️ ${applicantType} PAN skipped. Existing status: ${currentStatus.pan_status}`,
      );
    } else {
      console.log(`⏭️ ${applicantType} PAN skipped for this request`);
    }

    // =========================
    // AADHAAR INIT
    // =========================

    const currentAadhaarStatus = String(
      currentStatus.aadhaar_status || "",
    ).toUpperCase();

    // const hasExistingAadhaarSession =
    //   currentStatus.aadhaar_transaction_id ||
    //   currentStatus.aadhaar_kyc_url ||
    //   currentStatus.aadhaar_unique_id;
    const hasExistingAadhaarSession =
      currentAadhaarStatus === "INITIATED" &&
      Boolean(
        currentStatus.aadhaar_transaction_id ||
        currentStatus.aadhaar_kyc_url ||
        currentStatus.aadhaar_unique_id,
      );

    if (
      runAadhaarValidation &&
      shouldRunValidation(currentAadhaarStatus) &&
      !hasExistingAadhaarSession
    ) {
      await pool.query(
        `
        UPDATE kyc_verification_status
        SET aadhaar_status = 'INITIATED'
        WHERE lan = ?
        AND applicant_type = ?
        AND party_no = ?
        `,
        [lan, applicantType, normalizedPartyNo],
      );

      const aadhaarInit = await initAadhaarKyc(
        lan,
        applicantData.mobile_number,
        applicantData.email,
        applicantData.customer_name,
      );

      if (aadhaarInit.success) {
        await pool.query(
          `
          UPDATE kyc_verification_status
          SET
            aadhaar_status = 'INITIATED',
            aadhaar_transaction_id = ?,
            aadhaar_kyc_url = ?,
            aadhaar_unique_id = ?
          WHERE lan = ?
          AND applicant_type = ?
          AND party_no = ?
          `,
          [
            aadhaarInit.unifiedTransactionId,
            aadhaarInit.kycUrl,
            aadhaarInit.uniqueId,
            lan,
            applicantType,
            normalizedPartyNo,
          ],
        );

        console.log(`📨 ${applicantType} Aadhaar INIT success`);
      } else {
        await pool.query(
          `
          UPDATE kyc_verification_status
          SET aadhaar_status = 'FAILED'
          WHERE lan = ?
          AND applicant_type = ?
          AND party_no = ?
          `,
          [lan, applicantType, normalizedPartyNo],
        );

        console.log(`❌ ${applicantType} Aadhaar Failed`);
      }
    } else if (runAadhaarValidation) {
      console.log(
        `⏭️ ${applicantType} Aadhaar skipped. Existing status: ${
          currentStatus.aadhaar_status || "EMPTY"
        }`,
      );
    } else {
      console.log(`⏭️ ${applicantType} Aadhaar skipped for this request`);
    }

    // =========================
    // BUREAU
    // =========================

    // if (
    //   runBureauValidation &&
    //   shouldRunValidation(currentStatus.bureau_status)
    // ) {
    //   await pool.query(
    //     `
    //     UPDATE kyc_verification_status
    //     SET bureau_status = 'INITIATED'
    //     WHERE lan = ?
    //     AND applicant_type = ?
    //     `,
    //     [lan, applicantType],
    //   );

    //   let dobStr = applicantData.dob;

    //   if (dobStr instanceof Date) {
    //     dobStr = dobStr.toISOString().split("T")[0];
    //   }

    //   const bureauResult = await runBureau({
    //     enquiry_reason: "01", // 05 - Credit Assessment
    //     customer_name: applicantData.customer_name,
    //     first_name: applicantData.first_name,
    //     last_name: applicantData.last_name,
    //     dob: dobStr,
    //     gender: applicantData.gender,
    //     pan_number: applicantData.pan_number,
    //     mobile_number: applicantData.mobile_number,
    //     current_address: applicantData.current_address,
    //     current_village_city: applicantData.current_village_city,
    //     current_state: applicantData.current_state,
    //     current_pincode: applicantData.current_pincode,
    //     loan_amount: applicantData.loan_amount,
    //     loan_tenure: applicantData.loan_tenure,
    //   }).catch((err) => {
    //     console.error(`❌ ${applicantType} Bureau Error:`, err);

    //     return {
    //       success: false,
    //       score: null,
    //       response: {
    //         error: err.message || String(err),
    //       },
    //     };
    //   });

    //   const bureauReportXml = extractBureauReportXml(bureauResult.response);

    //   await pool.query(
    //     `
    //     UPDATE kyc_verification_status
    //     SET
    //       bureau_status = ?,
    //       bureau_api_response = ?
    //     WHERE lan = ?
    //     AND applicant_type = ?
    //     `,
    //     [
    //       bureauResult.success ? "VERIFIED" : "FAILED",
    //       JSON.stringify(bureauResult.response || {}),
    //       lan,
    //       applicantType,
    //     ],
    //   );

    //   await pool.query(
    //     `
    //     INSERT INTO loan_cibil_reports (
    //       lan,
    //       applicant_type,
    //       pan_number,
    //       score,
    //       report_xml,
    //       created_at
    //     )
    //     VALUES (?, ?, ?, ?, ?, NOW())
    //     `,
    //     [
    //       lan,
    //       applicantType,
    //       applicantData.pan_number,
    //       bureauResult.score,
    //       bureauReportXml,
    //     ],
    //   );

    //   console.log(
    //     `📌 ${applicantType} Bureau:`,
    //     bureauResult.success ? "VERIFIED" : "FAILED",
    //   );

    //   if (bureauResult.score != null && applicantType === "BORROWER") {
    //     await pool.query(
    //       `
    //       UPDATE ${table}
    //       SET cibil_score = ?
    //       WHERE lan = ?
    //       `,
    //       [bureauResult.score, lan],
    //     );
    //   }
    // } else if (runBureauValidation) {
    //   console.log(
    //     `⏭️ ${applicantType} Bureau skipped. Existing status: ${currentStatus.bureau_status}`,
    //   );
    // } else {
    //   console.log(`⏭️ ${applicantType} Bureau skipped for this request`);
    // }
    // =========================
    // BUREAU
    // =========================

    let storedBureauResponse = currentStatus.bureau_api_response;

    if (storedBureauResponse) {
      try {
        storedBureauResponse = JSON.parse(storedBureauResponse);
      } catch (error) {
        // Already an XML/string response.
      }
    }

    const storedBureauXml = extractBureauReportXml(storedBureauResponse);

    const hasReusableBureau =
      String(currentStatus.bureau_status || "").toUpperCase() === "VERIFIED" &&
      Boolean(storedBureauXml);

    if (runBureauValidation && !hasReusableBureau) {
      await pool.query(
        `
    UPDATE kyc_verification_status
    SET
      bureau_status = 'INITIATED',
      bureau_api_response = NULL
      WHERE lan = ?
      AND applicant_type = ?
      AND party_no = ?
    `,
        [lan, applicantType, normalizedPartyNo],
      );

      let dobStr = applicantData.dob;

      if (dobStr instanceof Date) {
        dobStr = dobStr.toISOString().split("T")[0];
      }

      const bureauResult = await runBureau({
        enquiry_reason: "01",
        customer_name: applicantData.customer_name,
        first_name: applicantData.first_name,
        last_name: applicantData.last_name,
        dob: dobStr,
        gender: applicantData.gender,
        pan_number: applicantData.pan_number,
        mobile_number: applicantData.mobile_number,
        current_address: applicantData.current_address,
        current_village_city: applicantData.current_village_city,
        current_state: applicantData.current_state,
        current_pincode: applicantData.current_pincode,
        loan_amount: applicantData.loan_amount,
        loan_tenure: applicantData.loan_tenure,
      }).catch((err) => {
        console.error(`❌ ${applicantType} Bureau Error:`, err);

        return {
          success: false,
          score: null,
          response: {
            error: err.message || String(err),
          },
        };
      });

      const bureauReportXml = extractBureauReportXml(bureauResult.response);

      const bureauVerified =
        bureauResult.success === true &&
        bureauResult.score !== null &&
        bureauResult.score !== undefined &&
        Boolean(bureauReportXml);

      await pool.query(
        `
    UPDATE kyc_verification_status
    SET
      bureau_status = ?,
      bureau_api_response = ?
      WHERE lan = ?
      AND applicant_type = ?
      AND party_no = ?
    `,
        [
          bureauVerified ? "VERIFIED" : "FAILED",
          JSON.stringify(bureauResult.response || {}),
          lan,
          applicantType,
          normalizedPartyNo,
        ],
      );

      if (bureauVerified) {
        await pool.query(
          `
      INSERT INTO loan_cibil_reports (
        lan,
        applicant_type,
        party_no,
        pan_number,
        score,
        report_xml,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NOW())
      `,
          [
            lan,
            applicantType,
            normalizedPartyNo,
            applicantData.pan_number,
            bureauResult.score,
            bureauReportXml,
          ],
        );

        if (applicantType === "BORROWER") {
          await pool.query(
            `
        UPDATE ${table}
        SET cibil_score = ?
        WHERE lan = ?
        `,
            [bureauResult.score, lan],
          );
        }
      }

      console.log(
        `📌 ${applicantType} Bureau:`,
        bureauVerified ? "VERIFIED" : "FAILED",
      );
    } else if (runBureauValidation && hasReusableBureau) {
      /*
       * KYC is the bureau source of truth.
       * Reuse stored response and recreate loan_cibil_reports only if missing.
       */
      const [existingReports] = await pool.query(
        `
    SELECT id, report_xml
    FROM loan_cibil_reports
    WHERE lan = ?
      AND applicant_type = ?
      AND party_no = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
        [lan, applicantType, normalizedPartyNo],
      );

      if (!existingReports.length) {
        await pool.query(
          `
      INSERT INTO loan_cibil_reports (
        lan,
        applicant_type,
        party_no,
        pan_number,
        score,
        report_xml,
        created_at
      )
      VALUES (?, ?, ?, ?, NULL, ?, NOW())
      `,
          [
            lan,
            applicantType,
            normalizedPartyNo,
            applicantData.pan_number,
            storedBureauXml,
          ],
        );
      } else if (!existingReports[0].report_xml) {
        await pool.query(
          `
      UPDATE loan_cibil_reports
      SET report_xml = ?
      WHERE id = ?
      `,
          [storedBureauXml, existingReports[0].id],
        );
      }

      console.log(`♻️ ${applicantType} Bureau reused for ${lan}`);
    } else {
      console.log(`⏭️ ${applicantType} Bureau skipped for this request`);
    }
  } catch (err) {
    console.error(`❌ ${applicantType} Validation Failed:`, err);
  }
}

exports.runApplicantValidation = runApplicantValidation;
exports.generateAndStoreSampadaPanVerificationPdf =
  generateAndStoreSampadaPanVerificationPdf;

exports.universalRunAllValidations = async (lan, options = {}) => {
  try {
    console.log(`🚀 Starting Validation Engine for ${lan}`);

    let table = "";

    if (lan.startsWith("HEL")) {
      table = "loan_booking_helium";
    } else if (lan.startsWith("MC")) {
      table = "loan_booking_motion_corp";
    } else if (lan.startsWith("SPL")) {
      table = "loan_booking_sampada";
    } else if (lan.startsWith("SFL")) {
      table = "loan_booking_seven_fincorp";
    } else if (lan.startsWith("SBU")) {
      table = "loan_booking_bundela";
    } else if (lan.startsWith("FUN")) {
      table = "loan_booking_fundify";
    } else if (lan.startsWith("SH")) {
      table = "loan_booking_srbh";
    } else {
      console.log("❌ Invalid LAN");
      return;
    }

    const pool = db.promise();

    const [loanRows] = await pool.query(
      `
    SELECT *
    FROM ${table}
    WHERE lan=?
    `,
      [lan],
    );

    if (!loanRows.length) {
      console.log("❌ Loan not found");

      return;
    }

    const loan = loanRows[0];

    // =========================
    // BORROWER
    // =========================

    await runApplicantValidation({
      pool,
      lan,
      table,

      applicantType: "BORROWER",
      partyNo: 1,

      applicantData: {
        customer_name: loan.customer_name,

        first_name: loan.first_name,

        last_name: loan.last_name,

        dob: loan.dob,

        gender: loan.gender,

        pan_number: loan.pan_card,

        mobile_number: loan.mobile_number,

        email: loan.email,

        current_address: loan.permanent_address_line_1,

        current_village_city: loan.permanent_village_city,

        current_state: loan.permanent_state,

        current_pincode: loan.permanent_pincode,

        loan_amount: loan.requested_loan_amount,

        loan_tenure: loan.loan_tenure,
      },
    });

    // =========================
    // GUARANTOR
    // =========================

    if (loan.guarantor_name && loan.guarantor_pan) {
      await runApplicantValidation({
        pool,
        lan,
        table,

        applicantType: "GUARANTOR",
        partyNo: 1,

        applicantData: {
          customer_name: loan.guarantor_name,

          first_name: loan.guarantor_name,

          last_name: "",

          dob: loan.guarantor_dob,

          gender: loan.gender,

          pan_number: loan.guarantor_pan,

          mobile_number: loan.guarantor_mobile,

          email: loan.guarantor_email,

          current_address: loan.guarantor_address_line_1,

          current_village_city: loan.guarantor_village_city,

          current_state: loan.guarantor_state,

          current_pincode: loan.guarantor_pincode,

          loan_amount: loan.requested_loan_amount,

          loan_tenure: loan.loan_tenure,
        },
      });
    }

    // =========================
    // CO-APPLICANT
    // =========================

    if (loan.co_applicant_name && loan.co_applicant_pan) {
      await runApplicantValidation({
        pool,
        lan,
        table,

        applicantType: "CO_APPLICANT",
        partyNo: 1,

        applicantData: {
          customer_name: loan.co_applicant_name,

          first_name: loan.co_applicant_name,

          last_name: "",

          dob: loan.co_applicant_dob,

          gender: loan.gender,

          pan_number: loan.co_applicant_pan,

          mobile_number: loan.co_applicant_mobile,

          email: loan.co_applicant_email,

          current_address: loan.co_applicant_address_line_1,

          current_village_city: loan.co_applicant_village_city,

          current_state: loan.co_applicant_state,

          current_pincode: loan.co_applicant_pincode,

          loan_amount: loan.requested_loan_amount,

          loan_tenure: loan.loan_tenure,
        },
      });
    }

    if (lan.startsWith("MC")) {
      console.log(`🚀 Running Motion Corp BRE for ${lan}`);

      await autoApproveMotionCorpIfAllVerified(lan);

      console.log(`✅ Motion Corp BRE finished for ${lan}`);
    }

    if (lan.startsWith("SPL")) {
      console.log(`Running Sampada BRE for ${lan}`);

      await autoApproveSampadaIfAllVerified(lan);

      console.log(`Sampada BRE finished for ${lan}`);
    }

    if (lan.startsWith("SFL")) {
      console.log(`🚀 Running Seven FinCorp BRE for ${lan}`);

      await autoApproveSevenFinCorpIfAllVerified(lan);

      console.log(`✅ Seven FinCorp BRE finished for ${lan}`);
    }

    if (lan.startsWith("SBU") || lan.startsWith("BUNCL")) {
      console.log(`🚀 Running Bundela BRE for ${lan}`);
      await autoApproveBundelaIfAllVerified(lan);
      console.log(`✅ Bundela BRE finished for ${lan}`);
    }
    if (lan.startsWith("SH") && !options.skipSrbhFinalBre) {
      console.log(`🚀 Running SRBH BRE for ${lan}`);
      await autoApproveSrbhIfAllVerified(lan);
      console.log(`✅ SRBH BRE finished for ${lan}`);
    }
    console.log(`✅ Validation Engine Completed for ${lan}`);
  } catch (err) {
    console.error("❌ Validation Engine Failed:", err);
  }
};
