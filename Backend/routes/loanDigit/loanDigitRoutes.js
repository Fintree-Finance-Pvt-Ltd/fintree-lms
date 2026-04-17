const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const he = require("he");
const {
  autoApproveLoanDigitIfAllVerified,
} = require("../../routes/loanDigit/loanDigitBre");

const partnerLimitService = require("../../services/partnerLimitService");
const partnerFldgService = require("../../services/partnerFldgService");
const router = express.Router();

/**
 * Generate LAN
 */

const generateLoanDigitLan = async (conn, lender) => {
  lender = lender.trim();

  const prefixLan = "LDF10";

  const [rows] = await conn.query(
    "SELECT last_sequence FROM loan_sequences WHERE lender_name = ? FOR UPDATE",
    [lender],
  );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;

    await conn.query(
      "UPDATE loan_sequences SET last_sequence = ? WHERE lender_name = ?",
      [newSequence, lender],
    );
  } else {
    newSequence = 11000;

    await conn.query(
      "INSERT INTO loan_sequences (lender_name, last_sequence) VALUES (?, ?)",
      [lender, newSequence],
    );
  }

  return `${prefixLan}${newSequence}`;
};

/**
 * State codes
 * Kept aligned with your EMI Club code.
 */
const STATE_CODES = {
  "JAMMU AND KASHMIR": "01",
  "JAMMU & KASHMIR": "01",
  "HIMACHAL PRADESH": "02",
  PUNJAB: "03",
  CHANDIGARH: "04",
  UTTRANCHAL: "05",
  UTTARAKHAND: "05",
  HARAYANA: "06",
  HARYANA: "06",
  DELHI: "07",
  RAJASTHAN: "08",
  "UTTAR PRADESH": "09",
  BIHAR: "10",
  SIKKIM: "11",
  "ARUNACHAL PRADESH": "12",
  NAGALAND: "13",
  MANIPUR: "14",
  MIZORAM: "15",
  TRIPURA: "16",
  MEGHALAYA: "17",
  ASSAM: "18",
  "WEST BENGAL": "19",
  JHARKHAND: "20",
  ORRISA: "21",
  ODISHA: "21",
  CHHATTISGARH: "22",
  "MADHYA PRADESH": "23",
  GUJRAT: "24",
  GUJARAT: "24",
  "DAMAN and DIU": "25",
  "DAMAN AND DIU": "25",
  "DADARA and NAGAR HAVELI": "26",
  "DADRA AND NAGAR HAVELI": "26",
  MAHARASHTRA: "27",
  "ANDHRA PRADESH": "28",
  KARNATAKA: "29",
  GOA: "30",
  LAKSHADWEEP: "31",
  KERALA: "32",
  "TAMIL NADU": "33",
  PONDICHERRY: "34",
  PUDUCHERRY: "34",
  "ANDAMAN and NICOBAR ISLANDS": "35",
  "ANDAMAN AND NICOBAR ISLANDS": "35",
  TELANGANA: "36",
};

/**
 * Upload Loan Digit Loan
 */
router.post("/add-loan-digit", verifyApiKey, async (req, res) => {
  let conn;

  try {
    const data = req.body || {};
    const requiredFields = [
      "partner_loan_id",
      "first_name",
      "mobile_number",
      "pan_number",
      "dob",
      "age",
      "gender",
      "current_address",
      "current_village_city",
      "current_state",
      "current_pincode",
      "permanent_address",
      "permanent_state",
      "permanent_pincode",
      "employment",
      "cibil_score",
      "mode_of_salary",
      "monthly_salary",
      "current_emi",
      "marital_status",
      "residential_status",
      "occupied_since",
      "years_in_current_city",
      "company_name",
      "company_address",
      "years_in_current_job",
      "total_work_experience",
      "bank_name",
      "name_in_bank",
      "account_number",
      "ifsc",
      "account_type",
      "loan_amount",
      "processing_fee",
      "interest_rate",
      "loan_tenure",
      "pre_emi",
      "net_disbursement_amount",
    ];

    // Validate required fields
    for (const field of requiredFields) {
      if (
        data[field] === undefined ||
        data[field] === null ||
        data[field] === ""
      ) {
        return res.status(400).json({
          status: "FAILED",
          message: `❌ Missing required field: ${field}`,
        });
      }
    }

    const partner_loan_id = String(data.partner_loan_id).trim();
    const first_name = String(data.first_name).trim();
    const middle_name = data.middle_name
      ? String(data.middle_name).trim()
      : null;
    const last_name = data.last_name ? String(data.last_name).trim() : null;
    const mobile_number = String(data.mobile_number).trim();
    const pan_number = String(data.pan_number).toUpperCase().trim();
    const dob = data.dob;
    const age = data.age;
    const gender = String(data.gender).trim();

    const current_address = String(data.current_address).trim();
    const current_village_city = String(data.current_village_city).trim();
    const current_district = data.current_district
      ? String(data.current_district).trim()
      : null;
    const current_state = String(data.current_state).trim();
    const current_pincode = String(data.current_pincode).trim();

    const permanent_address = String(data.permanent_address).trim();
    const permanent_village_city = data.permanent_village_city
      ? String(data.permanent_village_city).trim()
      : current_village_city;
    const permanent_district = data.permanent_district
      ? String(data.permanent_district).trim()
      : current_district;
    const permanent_state = String(data.permanent_state).trim();
    const permanent_pincode = String(data.permanent_pincode).trim();

    const employment = String(data.employment).trim();
    const mode_of_salary = String(data.mode_of_salary).trim();
    const monthly_salary = data.monthly_salary;
    const current_emi = data.current_emi;
    const marital_status = String(data.marital_status).trim();
    const residential_status = String(data.residential_status).trim();
    const occupied_since = data.occupied_since;
    const years_in_current_city = data.years_in_current_city;

    const company_name = String(data.company_name).trim();
    const company_address = String(data.company_address).trim();
    const years_in_current_job = data.years_in_current_job;
    const total_work_experience = data.total_work_experience;

    const bank_name = String(data.bank_name).trim();
    const name_in_bank = String(data.name_in_bank).trim();
    const account_number = String(data.account_number).trim();
    const ifsc = String(data.ifsc).trim();
    const account_type = String(data.account_type).trim();
    const cibil_score = Number(data.cibil_score);

    const loan_amount = Number(data.loan_amount);
    const processing_fee = Number(data.processing_fee);
    const interest_rate = Number(data.interest_rate);
    const loan_tenure = Number(data.loan_tenure);
    const pre_emi = Number(data.pre_emi);
    const net_disbursement_amount = Number(data.net_disbursement_amount);

    if (!loan_amount || loan_amount <= 0) {
      return res.status(400).json({
        status: "FAILED",
        message: "Invalid loan_amount",
      });
    }

    /*
     ===============================
     PAN FORMAT VALIDATION
     ===============================
    */
    const normalizedPan = pan_number.toUpperCase().trim();

    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

    if (!panRegex.test(normalizedPan)) {
      return res.status(400).json({
        status: "FAILED",
        message: "Invalid PAN format",
      });
    }

    conn = await db.promise().getConnection();
    await conn.beginTransaction();

    console.log("🔍 Checking existing Partner Loan ID:", partner_loan_id);

    const [existingLoan] = await conn.query(
      `
      SELECT lan, partner_loan_id, customer_name
      FROM loan_booking_loan_digit
      WHERE TRIM(partner_loan_id) = ?
      `,
      [partner_loan_id],
    );

    if (existingLoan.length > 0) {
      await conn.rollback();
      conn.release();

      return res.status(400).json({
        status: "FAILED",
        message: "Duplicate Partner Loan ID",
        existingLan: existingLoan[0].lan,
      });
    }

    /*
     ===============================
     PAN DUPLICATION CHECK
     ===============================
    */

    console.log("🔍 Checking PAN duplication:", normalizedPan);

    const [panRecords] = await conn.query(
      `
      SELECT status
      FROM loan_booking_loan_digit
      WHERE UPPER(pan_number) = ?
      `,
      [normalizedPan],
    );

    const allowedStatuses = [
      "Cancelled",
      "Foreclosed",
      "Fully Paid",
      "Rejected",
    ];

    if (panRecords.length > 0) {
      const hasActiveLoan = panRecords.some(
        (row) => !allowedStatuses.includes(row.status?.trim()),
      );

      if (hasActiveLoan) {
        console.error("❌ Active case exists for PAN:", normalizedPan);

        return res.status(400).json({
          status: "Failed",
          message:
            "PAN already exists with an active loan. New loan not allowed.",
        });
      }

      console.log("✅ PAN exists but previous loans are closed. Proceeding.");
    }

    /*
     * Partner limit logic
     * EMI Club does this before insert; same applied here.
     */
    const partnerName = "Loan Digit";
    const today = new Date();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();

    const partner = await partnerLimitService.getOrCreatePartner(
      conn,
      partnerName,
    );

    const limitCheck = await partnerLimitService.validatePartnerLimit(
      conn,
      partner.partner_id,
      loan_amount,
      month,
      year,
    );

    if (!limitCheck.valid) {
      await conn.rollback();
      conn.release();

      return res.status(403).json({
        status: "FAILED",
        message: "Monthly partner limit exceeded",
        remaining_limit: limitCheck.remaining,
        required: loan_amount,
      });
    }

    /*
     * FLDG check
     */
    const [[partnerConfig]] = await conn.query(
      `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
      [partner.partner_id],
    );

    if (!partnerConfig) {
      await conn.rollback();
      conn.release();

      return res.status(500).json({
        status: "FAILED",
        message: "Partner configuration not found",
      });
    }

    let requiredFldg = 0;

    if (partnerConfig?.fldg_status === 1) {
      const fldgPercent = Number(partnerConfig?.fldg_percent || 0);
      requiredFldg = Number(((loan_amount * fldgPercent) / 100).toFixed(2));
    }

    if (requiredFldg > 0) {
      const fldgCheck = await partnerFldgService.validateFldgAvailability(
        conn,
        partner.partner_id,
        requiredFldg,
      );

      if (!fldgCheck.valid) {
        await conn.rollback();
        conn.release();

        return res.status(403).json({
          status: "FAILED",
          message: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,
        });
      }
    }

    const lender = "LOAN-DIGIT";
    const product = "Loan Digit";
    const loan_type = "Monthly";
    const status = "Login";

    // Generate LAN
    const lan = await generateLoanDigitLan(conn, lender);

    const customer_name =
      `${first_name} ${middle_name || ""} ${last_name}`.trim();

    await conn.query(
      `
      INSERT INTO loan_booking_loan_digit (
        lan,
        partner_loan_id,

        first_name,
        middle_name,
        last_name,
        customer_name,
        mobile_number,
        pan_number,
        dob,
        age,
        gender,

        current_address,
        current_village_city,
        current_district,
        current_state,
        current_pincode,

        permanent_address,
        permanent_village_city,
        permanent_district,
        permanent_state,
        permanent_pincode,

        employment,
        mode_of_salary,
        monthly_salary,
        current_emi,
        marital_status,
        residential_status,
        cibil_score,

        occupied_since,
        years_in_current_city,

        company_name,
        company_address,
        years_in_current_job,
        total_work_experience,

        bank_name,
        name_in_bank,
        account_number,
        ifsc,
        account_type,

        loan_amount,
        processing_fee,
        interest_rate,
        loan_tenure,
        pre_emi,
        net_disbursement_amount,

        lender,
        product,
        loan_type,
        status
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        lan,
        partner_loan_id,

        first_name,
        middle_name,
        last_name,
        customer_name,
        mobile_number,
        pan_number,
        dob,
        age,
        gender,

        current_address,
        current_village_city,
        current_district,
        current_state,
        current_pincode,

        permanent_address,
        permanent_village_city,
        permanent_district,
        permanent_state,
        permanent_pincode,

        employment,
        mode_of_salary,
        monthly_salary,
        current_emi,
        marital_status,
        residential_status,
        cibil_score,

        occupied_since,
        years_in_current_city,

        company_name,
        company_address,
        years_in_current_job,
        total_work_experience,

        bank_name,
        name_in_bank,
        account_number,
        ifsc,
        account_type,

        loan_amount,
        processing_fee,
        interest_rate,
        loan_tenure,
        pre_emi,
        net_disbursement_amount,

        lender,
        product,
        loan_type,
        status,
      ],
    );

    /*
     * Update used limit
     */
    await partnerLimitService.updateUsedLimit(
      conn,
      limitCheck.limitId,
      loan_amount,
      "BOOKED",
      lan,
    );

    /*
     * Reserve FLDG
     */
    if (requiredFldg > 0) {
      await partnerFldgService.reserveFldg(
        conn,
        partner.partner_id,
        lan,
        requiredFldg,
        `LOAN_DIGIT reservation | Amount: ${loan_amount}`,
      );
    }

    await conn.commit();
    conn.release();
    conn = null;

    console.log("🏦 Running Loan Digit Bureau...");

    let experianScore = null;

    try {
      const dobFormatted = String(dob).replace(/-/g, "");
      const genderValue = String(gender || "Male")
        .trim()
        .toLowerCase();
      const gender_code = genderValue === "female" ? 2 : 1;
      const normalizedState = String(current_state || "MAHARASHTRA")
        .trim()
        .toUpperCase();

      const state_code =
        STATE_CODES[normalizedState] || STATE_CODES["MAHARASHTRA"]; // default Maharashtra like EMIClub fallback

      const soapBody = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:cbv2">
<soapenv:Header/>
<soapenv:Body>
<urn:process>
<urn:in>
<INProfileRequest>

<Identification>
<XMLUser>${process.env.EXPERIAN_USER}</XMLUser>
<XMLPassword>${process.env.EXPERIAN_PASSWORD}</XMLPassword>
</Identification>

<Application>
<FTReferenceNumber></FTReferenceNumber>
        <CustomerReferenceID></CustomerReferenceID>
        <EnquiryReason>13</EnquiryReason>
        <FinancePurpose>99</FinancePurpose>
        <AmountFinanced>${loan_amount}</AmountFinanced>
        <DurationOfAgreement>${loan_tenure}</DurationOfAgreement>
        <ScoreFlag>1</ScoreFlag>
        <PSVFlag></PSVFlag>
</Application>

   <Applicant>
        <Surname>${(last_name || "").toUpperCase()}</Surname>
        <FirstName>${first_name.toUpperCase()}</FirstName>
        <MiddleName1>${middle_name ? middle_name.toUpperCase() : ""}</MiddleName1>
        <MiddleName2></MiddleName2>
        <MiddleName3></MiddleName3>
        <GenderCode>${gender_code}</GenderCode>
        <IncomeTaxPAN>${pan_number}</IncomeTaxPAN>
        <PANIssueDate></PANIssueDate>
        <PANExpirationDate></PANExpirationDate>
        <PassportNumber></PassportNumber>
        <PassportIssueDate></PassportIssueDate>
        <PassportExpirationDate></PassportExpirationDate>
        <VoterIdentityCard></VoterIdentityCard>
        <VoterIDIssueDate></VoterIDIssueDate>
        <VoterIDExpirationDate></VoterIDExpirationDate>
        <DriverLicenseNumber></DriverLicenseNumber>
        <DriverLicenseIssueDate></DriverLicenseIssueDate>
        <DriverLicenseExpirationDate></DriverLicenseExpirationDate>
        <RationCardNumber></RationCardNumber>
        <RationCardIssueDate></RationCardIssueDate>
        <RationCardExpirationDate></RationCardExpirationDate>
        <UniversalIDNumber></UniversalIDNumber>
        <UniversalIDIssueDate></UniversalIDIssueDate>
        <UniversalIDExpirationDate></UniversalIDExpirationDate>
        <DateOfBirth>${dobFormatted}</DateOfBirth>
        <STDPhoneNumber></STDPhoneNumber>
        <PhoneNumber>${mobile_number}</PhoneNumber>
        <TelephoneExtension></TelephoneExtension>
        <TelephoneType></TelephoneType>
        <MobilePhone></MobilePhone>
        <EMailId></EMailId>
    </Applicant>

     <Details>
        <Income></Income>
        <MaritalStatus></MaritalStatus>
        <EmployStatus></EmployStatus>
        <TimeWithEmploy></TimeWithEmploy>
        <NumberOfMajorCreditCardHeld></NumberOfMajorCreditCardHeld>
    </Details>

   <Address>
        <FlatNoPlotNoHouseNo>${current_address}</FlatNoPlotNoHouseNo>
        <BldgNoSocietyName></BldgNoSocietyName>
        <RoadNoNameAreaLocality></RoadNoNameAreaLocality>
        <City>${current_village_city}</City>
        <Landmark></Landmark>
        <State>${state_code}</State>
        <PinCode>${current_pincode}</PinCode>
    </Address>

     <AdditionalAddressFlag>
        <Flag>N</Flag>
    </AdditionalAddressFlag>

    <AdditionalAddress>
        <FlatNoPlotNoHouseNo></FlatNoPlotNoHouseNo>
        <BldgNoSocietyName></BldgNoSocietyName>
        <RoadNoNameAreaLocality></RoadNoNameAreaLocality>
        <City></City>
        <Landmark></Landmark>
        <State></State>
        <PinCode></PinCode>
    </AdditionalAddress>

</INProfileRequest>
</urn:in>
</urn:process>
</soapenv:Body>
</soapenv:Envelope>`;

console.log("Loan Digit SOAP BODY", soapBody )
      const response = await axios.post(process.env.EXPERIAN_URL, soapBody, {
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "urn:cbv2/process",
          Accept: "text/xml",
        },
        timeout: 30000,
        validateStatus: () => true,
      });

      if (response.status !== 200)
        throw new Error(`Experian returned HTTP ${response.status}`);

      const parser = new XMLParser({ ignoreAttributes: false });

      const parsedOuter = parser.parse(response.data);

      const encodedInnerXml =
        parsedOuter["SOAP-ENV:Envelope"]?.["SOAP-ENV:Body"]?.[
          "ns2:processResponse"
        ]?.["ns2:out"];

      if (!encodedInnerXml) {
        throw new Error("Missing ns2:out field in Experian response");
      }

      const decodedXml = he.decode(encodedInnerXml);

      const parsedInner = parser.parse(decodedXml);

      const scoreStr =
        parsedInner?.INProfileResponse?.SCORE?.BureauScore ?? null;

      experianScore = scoreStr ? Number(scoreStr) : null;

      await db.promise().query(
        `INSERT INTO loan_cibil_reports
        (lan, pan_number, score, report_xml, created_at)
        VALUES (?,?,?,?,NOW())`,
        [lan, pan_number, experianScore, decodedXml],
      );

      await db.promise().execute(
        `UPDATE loan_booking_loan_digit
         SET fintree_cibil_score =?
         WHERE lan=?`,
        [experianScore, lan],
      );

      /* ✅ ADD THIS BLOCK */
      try {
        await autoApproveLoanDigitIfAllVerified(lan);
      } catch (err) {
        console.error("LoanDigit BRE trigger failed:", lan, err.message);
      }

      console.log("✅ Loan Digit Bureau Success", experianScore);
    } catch (err) {
      console.error("⚠️ Loan Digit Bureau Failed:", err.message);
      console.error("➡️ Response status:", err.response?.status);
      console.error("➡️ Response data:", err.response?.data);
      console.error("➡️ Request URL:", process.env.EXPERIAN_URL);
    }

    console.log("📦 LOAN DIGIT REQUEST END");

    return res.json({
      status: "SUCCESS",
      lan,
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (_) {}
      conn.release();
    }
    console.error("❌ Loan Digit Error:", error);

    res.status(500).json({
      status: "FAILED",
      message: "Loan upload failed",
    });
  }
});


router.get("/approve-initiate-loans", verifyApiKey, async (req, res) => {
  const { table = "loan_booking_loan_digit" , prefixLan = "LDF" } = req.query;
  try { const [rows] = await db
      .promise()
      .query(
        `SELECT lan, customer_name, status FROM ${table} WHERE status = 'Login' ORDER BY created_at DESC`,
      );
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Credit approve for dispursement
router.put("/approve-initiated-loans/:lan", verifyApiKey, async (req, res) => {
  const { lan } = req.params;
  const { status, table = "loan_booking_loan_digit" } = req.body;

  if (!lan || !status || !table) {
    return res.status(400).json({
      status: "FAILED",
      message: "Missing required fields: lan, status, table",
    });
  }
  try {
    const allowedStatuses = ["BRE Approved", "Credit Approved", "Rejected"];

    if (!allowedStatuses.includes(status)) {
      return res
        .status(400)
        .json({
          status: "FAILED",
          message: `Invalid status. Allowed values: ${allowedStatuses.join(", ")}`,
        });
    }
    await db
      .promise()
      .execute(`UPDATE ${table} SET status = ? WHERE lan = ?`, [status, lan]);
    res.json({ status: "SUCCESS" });
  } catch (err) {
    console.error("Error updating loan status:", err);
    res
      .status(500)
      .json({ status: "FAILED", message: "Database update failed" });
  }
});



module.exports = router;
