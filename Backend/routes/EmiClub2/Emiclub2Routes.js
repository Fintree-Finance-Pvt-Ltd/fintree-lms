const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const { getMonthYear } = require("../../utils/partnerHelpers");
const partnerLimitService = require("../../services/partnerLimitService");
const partnerFldgService = require("../../services/partnerFldgService");
const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const he = require("he");
const router = express.Router();

// FINE2 takes precedence over FINE; retain the shared rules for other prefixes.
function getEmiClub2AwarePrefix(lan) {
  const value = String(lan || "").trim().toUpperCase();
  return require("../../utils/lanHelper").getEmiClub2AwarePrefix(value);
}

// Keep sequence allocation in the booking transaction, including the first LAN.
async function generateLoanIdentifiers(conn) {
  await conn.query(
    `INSERT INTO loan_sequences (lender_name, last_sequence) VALUES ('emiclub2', 10999)
     ON DUPLICATE KEY UPDATE lender_name = VALUES(lender_name)`,
  );
  const [[sequence]] = await conn.query(
    "SELECT last_sequence FROM loan_sequences WHERE lender_name = 'emiclub2' FOR UPDATE",
  );
  const next = Number(sequence.last_sequence) + 1;
  await conn.query(
    "UPDATE loan_sequences SET last_sequence = ? WHERE lender_name = 'emiclub2'",
    [next],
  );
  return { lan: `FINE2${next}` };
}

// ✅ EMICLUB2 JSON Upload
router.post("/v1/emiclub2-lb", verifyApiKey, async (req, res) => {

    let conn;

    try {

        console.log(

            "================= 📦 NEW EMICLUB2 REQUEST START =================",

        );

        if (

            !req.partner ||

            (req.partner.name || "").toLowerCase().trim() !== "emiclub2"

        ) {

            //console.error("❌ Partner validation failed!");

            return res

                .status(403)

                .json({ message: "This route is only for Emiclub2 partner." });

        }



        // --- Body logging ---

        const data = req.body;

        //console.log("📥 Received JSON payload:", JSON.stringify(data, null, 2));



        // --- Lender type validation ---

        const lenderType = data.lenderType?.trim()?.toLowerCase();

        //console.log("🏦 Lender type received:", lenderType);

        if (!lenderType || lenderType !== "emiclub2") {

            console.error("❌ Invalid lenderType provided:", lenderType);

            return res.status(400).json({

                message: "Invalid lenderType. Only 'EMICLUB2' loans are accepted.",

            });

        }



        // --- Required field check ---

        const requiredFields = [

            "login_date",

            "partner_loan_id",

            "first_name",

            "last_name",

            "gender",

            "dob",

            "mobile_number",

            "email_id",

            "pan_number",

            "aadhar_number",

            "current_address",

            "current_village_city",

            "current_district",

            "current_state",

            "current_pincode",

            "permanent_address",

            "permanent_state",

            "permanent_pincode",

            "loan_amount",

            "roi_apr",

            "loan_tenure",

            "bank_name",

            "name_in_bank",

            "account_number",

            "ifsc",

            "account_type",

            "type_of_account",

            "employment",

            "annual_income",

            "dealer_name",

            "risk_category",

            "customer_type",

        ];



        for (const field of requiredFields) {

            if (!data[field] && data[field] !== 0) {

                console.error(`❌ Missing field detected: ${field}`);

                return res.status(400).json({ message: `${field} is required.` });

            }

        }

        //    console.log("✅ All required fields present.");



        // --- Duplicate TECH LOAN ID check ---

        // --- Duplicate TECH LOAN ID check ---

        console.log("🔍 Checking existing TECH LOAN ID:", data.partner_loan_id);

        const [existing] = await db.promise().query(

            `SELECT lan, partner_loan_id, customer_name 

     FROM loan_booking_emiclub2 

     WHERE partner_loan_id = ?`,

            [data.partner_loan_id],

        );



        if (existing.length > 0) {

            return res.status(400).json({

                status: "Failed",

                message: "Duplicate Partner Loan ID",

                existingLan: existing[0].lan,

            });

        }



        /* =====================================================
    
           🔴 START CHANGE: PAN + STATUS DUPLICATE CHECK
    
           ===================================================== */



        console.log("🔍 Checking PAN duplication:", data.pan_number);



        const [panRecords] = await db.promise().query(

            `SELECT status 

   FROM loan_booking_emiclub2 

   WHERE pan_number = ?`,

            [data.pan_number],

        );



        // Allowed statuses for re-insert

        const allowedStatuses = [

            "Cancelled",

            "Foreclosed",

            "Fully Paid",

            "Rejected",

        ];



        if (panRecords.length > 0) {

            const hasActiveCase = panRecords.some(

                (row) => !allowedStatuses.includes(row.status),

            );



            if (hasActiveCase) {

                console.error("❌ Active case exists for PAN:", data.pan_number);

                return res.status(400).json({

                    status: "Failed",

                    message:

                        "PAN already exists with an active loan. New loan not allowed.",

                });

            }



            console.log(

                "✅ PAN exists but all cases are closed. Proceeding with insert.",

            );

        }



        const loanAmount = Number(data.loan_amount);



        if (!Number.isFinite(loanAmount) || loanAmount <= 0) {

            return res.status(400).json({

                message: "Invalid loan_amount",

            });

        }



        const rate = Number(data.roi_apr);
        const tenure = Number(data.loan_tenure);
        if (!Number.isFinite(rate) || rate < 0 || !Number.isInteger(tenure) || tenure <= 0) {
            return res.status(400).json({ message: "Valid roi_apr and positive integer loan_tenure are required" });
        }
        // --- Generate loan code ---

        //console.log("⚙️ Generating LAN for lender:", lenderType);

        conn = await db.promise().getConnection();

        await conn.beginTransaction();



        const partnerName = "EMICLUB2";



        if (!data.login_date) {

            return res.status(400).json({

                message: "login_date is required for limit validation",

            });

        }

        const today = new Date();

        const { month, year } = getMonthYear(today);



        const partner = await partnerLimitService.getOrCreatePartner(

            conn,

            partnerName,

        );



        const limitCheck = await partnerLimitService.validatePartnerBookingLimit(

            conn,

            partner.partner_id,

            loanAmount,

            month,

            year,

        );



        if (!limitCheck.valid) {

            await conn.rollback();

            conn.release();
            conn = null;



            return res.status(403).json({

                message: "Monthly partner limit exceeded",

                remaining_limit: limitCheck.remaining,

                required: loanAmount,

            });

        }



        // Fetch partner FLDG percent

        const [[partnerConfig]] = await conn.query(

            `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,

            [partner.partner_id],

        );



        if (!partnerConfig) {

            throw new Error("Partner configuration not found");

        }



        let requiredFldg = 0;



        if (partnerConfig?.fldg_status === 1) {

            const fldgPercent = Number(partnerConfig?.fldg_percent || 0);



            requiredFldg = Number(((loanAmount * fldgPercent) / 100).toFixed(2));

        }



        // Validate FLDG availability

        if (requiredFldg > 0) {

            const fldgCheck = await partnerFldgService.validateFldgAvailability(

                conn,

                partner.partner_id,

                requiredFldg,

            );



            if (!fldgCheck.valid) {

                await conn.rollback();

                conn.release();
                conn = null;



                return res.status(403).json({

                    message: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,

                });

            }

        }



        const { lan } = await generateLoanIdentifiers(conn);
        if (getEmiClub2AwarePrefix(lan) !== "FINE2") {
            throw new Error("Only FINE2 loans can be booked through EMIClub2");
        }
        // Sequence lock serializes EMIClub2 bookings. Recheck after acquiring it
        // so concurrent requests cannot book the same partner reference or PAN.
        const [duplicates] = await conn.query(
            "SELECT partner_loan_id, pan_number, status FROM loan_booking_emiclub2 WHERE partner_loan_id = ? OR pan_number = ? FOR UPDATE",
            [data.partner_loan_id, data.pan_number],
        );
        if (duplicates.some(row => String(row.partner_loan_id).toLowerCase() === String(data.partner_loan_id).toLowerCase() || !allowedStatuses.map(status => status.toLowerCase()).includes(String(row.status).toLowerCase()))) {
            await conn.rollback();
            conn.release();
            conn = null;
            return res.status(409).json({ message: "Duplicate partner loan ID or active PAN" });
        }

        console.log("✅ Generated LAN:", lan);



        const customer_name = `${data.first_name || ""} ${data.last_name || ""

            }`.trim();

        const agreement_date = data.login_date;



        // --- Determine interest rate ---

        const interest_rate = data.roi_apr / 12;

        //    console.log("📈 Using interest rate:", interest_rate);



        // --- Insert into DB ---

        //  console.log("💾 Inserting customer record into loan_booking_emiclub2...");

        await conn.query(

            `INSERT INTO loan_booking_emiclub2 (

        lan, partner_loan_id, login_date, first_name, middle_name, last_name, gender, dob,

        father_name, mother_name, mobile_number, email_id,

        pan_number, aadhar_number, current_address, current_village_city, current_district, current_state, current_pincode,

        permanent_address, permanent_village_city, permanent_district, permanent_state, permanent_pincode,

        loan_amount, interest_rate, roi_apr, loan_tenure, emi_amount, cibil_score,

        product, lender, bank_name, name_in_bank, account_number, ifsc,

        account_type, type_of_account, net_disbursement, employment, risk_category, customer_type,

        annual_income, dealer_name, dealer_mobile, dealer_address, dealer_city,

        status, customer_name, agreement_date

      )

      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,

            [

                lan,

                data.partner_loan_id,

                data.login_date,

                data.first_name,

                data.middle_name || null,

                data.last_name,

                data.gender,

                data.dob,

                data.father_name || null,

                data.mother_name || null,

                data.mobile_number,

                data.email_id,

                data.pan_number,

                data.aadhar_number,

                data.current_address,

                data.current_village_city,

                data.current_district,

                data.current_state,

                data.current_pincode,

                data.permanent_address,

                data.permanent_village_city || data.current_village_city,

                data.permanent_district || data.current_district,

                data.permanent_state,

                data.permanent_pincode,

                data.loan_amount,

                interest_rate,

                data.roi_apr,

                data.loan_tenure,

                data.emi_amount ?? null,

                data.cibil_score ?? null,

                "Monthly Loan",

                "EMICLUB2",

                data.bank_name,

                data.name_in_bank,

                data.account_number,

                data.ifsc,

                data.account_type,

                data.type_of_account,

                data.net_disbursement || data.loan_amount,

                data.employment,

                null,

                data.customer_type,

                data.annual_income,

                data.dealer_name,

                data.dealer_mobile,

                data.dealer_address,

                data.dealer_city,

                "Login",

                customer_name,

                agreement_date,

            ],

        );



        await partnerLimitService.updateBookedLimit(

            conn,

            limitCheck.limitId,

            loanAmount,

            lan,

        );



        if (requiredFldg > 0) {

            await partnerFldgService.reserveFldg(

                conn,

                partner.partner_id,

                lan,

                requiredFldg,

                `EMICLUB2 reservation | Amount: ${loanAmount}`,

            );

        }



        await conn.commit();

        conn.release();
        conn = null;



        ////  BEURO SCORE  CODE START/////

        console.log("✅ Customer record inserted successfully.");

        // --- Build SOAP XML ---

        console.log("🧩 Building SOAP request body for Experian...");

        const dobFormatted = data.dob.replace(/-/g, "");

        console.log(

            data.first_name,

            data.last_name,

            data.pan_number,

            data.mobile_number,

            data.current_address,

            data.current_village_city,

            data.current_state,

            data.current_pincode,

        );

        console.log("🔧 Formatted DOB for SOAP:", dobFormatted);



        const stateCodes = {

            "JAMMU and KASHMIR": "01",

            "HIMACHAL PRADESH": "02",

            PUNJAB: "03",

            CHANDIGARH: "04",

            UTTRANCHAL: "05",

            HARAYANA: "06",

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

            CHHATTISGARH: "22",

            "MADHYA PRADESH": "23",

            GUJRAT: "24",

            "DAMAN and DIU": "25",

            "DADARA and NAGAR HAVELI": "26",

            MAHARASHTRA: "27",

            "ANDHRA PRADESH": "28",

            KARNATAKA: "29",

            GOA: "30",

            LAKSHADWEEP: "31",

            KERALA: "32",

            "TAMIL NADU": "33",

            PONDICHERRY: "34",

            "ANDAMAN and NICOBAR ISLANDS": "35",

            TELANGANA: "36",

        };



        const state = data.current_state ?? "MAHARASHTRA"; // default to Maharashtra

        const state_code = stateCodes[state.toUpperCase()] ?? null;



        const firstName = data.first_name.toUpperCase();

        const lastName = data.last_name.toUpperCase();

        const gender_code = (data.gender ?? "Male") === "Female" ? 2 : 1;

        const soapBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:cbv2">

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

        <EnquiryReason>06</EnquiryReason> 

        <FinancePurpose>99</FinancePurpose>

        <AmountFinanced>${data.loan_amount}</AmountFinanced>

        <DurationOfAgreement>${data.loan_tenure}</DurationOfAgreement>

        <ScoreFlag>1</ScoreFlag>

        <PSVFlag></PSVFlag>

    </Application>

    <Applicant>

        <Surname>${lastName}</Surname>

        <FirstName>${firstName}</FirstName>

        <MiddleName1></MiddleName1>

        <MiddleName2></MiddleName2>

        <MiddleName3></MiddleName3>

        <GenderCode>${gender_code}</GenderCode>

        <IncomeTaxPAN>${data.pan_number}</IncomeTaxPAN>

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

        <PhoneNumber>${data.mobile_number}</PhoneNumber>

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

        <FlatNoPlotNoHouseNo>${data.current_address}</FlatNoPlotNoHouseNo>

        <BldgNoSocietyName></BldgNoSocietyName>

        <RoadNoNameAreaLocality></RoadNoNameAreaLocality>

        <City>${data.current_village_city}</City>

        <Landmark></Landmark>

      <State>${state_code}</State>

        <PinCode>${data.current_pincode}</PinCode>

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



        // --- Send SOAP request ---

        console.log("🌐 Sending SOAP request to Experian...");

        let score = null;

        let parsedXmlToStore = null;



        try {

            const response = await axios.post(process.env.EXPERIAN_URL, soapBody, {

                headers: {

                    "Content-Type": "text/xml; charset=utf-8",

                    SOAPAction: "urn:cbv2/process",

                    Accept: "text/xml",

                },

                timeout: 30000,

                validateStatus: () => true,

            });



            console.log("📥 Experian HTTP Status:", response.status);

            console.log(

                "📥 Experian Raw Response (first 1000 chars):",

                response.data?.substring(0, 7000),

            );



            if (response.status !== 200)

                throw new Error(`Experian returned HTTP ${response.status}`);

            //////////////////// new addd.//////////

            // --- Parse SOAP XML ---

            const parser = new XMLParser({

                ignoreAttributes: false,

                attributeNamePrefix: "",

                trimValues: true,



                // Keep entity processing enabled, but raise limits for valid large bureau XML.

                processEntities: {

                    enabled: true,

                    maxTotalExpansions: 200000,

                    maxExpandedLength: 20_000_000,

                    maxEntityCount: 200000,

                    maxEntitySize: 200000,

                },

            });

            const soapParsed = parser.parse(response.data);

            const encodedInnerXml =

                soapParsed["SOAP-ENV:Envelope"]?.["SOAP-ENV:Body"]?.[

                "ns2:processResponse"

                ]?.["ns2:out"];



            if (!encodedInnerXml)

                throw new Error("Missing ns2:out field in Experian response");



            // Decode and parse the inner XML

            const decodedInnerXml = he.decode(encodedInnerXml);

            parsedXmlToStore = decodedInnerXml;

            const innerParsed = parser.parse(decodedInnerXml);



            // Extract score and message

            const scoreStr =

                innerParsed?.INProfileResponse?.SCORE?.BureauScore ?? null;

            //const userMsg = innerParsed?.INProfileResponse?.UserMessage?.UserMessageText ?? "";

            console.log(scoreStr, "score str");



            if (scoreStr) {

                score = Number(scoreStr);

            } else {

                score = null;

            }



            ///////////////////// end  ////////////////

            console.log("✅ Parsed CIBIL Score:", score);

            // console.log(

            //   "🧾 Normalized INProfileResponse (first 500 chars):",

            //   parsedXmlToStore?.substring(0, 7000)

            // );



            await db.promise().query(

                `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)

         VALUES (?,?,?,?,NOW())`,

                [lan, data.pan_number, score, parsedXmlToStore], // store parsed/pretty INProfileResponse XML

            );



            await db

                .promise()

                .execute(

                    "UPDATE loan_booking_emiclub2 SET cibil_score = ? WHERE lan = ?",

                    [score, lan],

                );



            console.log("✅ CIBIL report (parsed XML) saved successfully.");

        } catch (err) {

            console.error("⚠️ CIBIL Pull Failed:", err.message);

            console.error("➡️ Response status:", err.response?.status);

            console.error(

                "➡️ Response data (truncated):",

                typeof err.response?.data === "string"

                    ? err.response.data.slice(0, 300)

                    : err.response?.data,

            );

            console.error("➡️ Request URL:", process.env.EXPERIAN_URL);

            console.error("➡️ SOAP Body Preview:", soapBody.substring(0, 300));

        }

        console.log("✅ Completed EMI Club flow. LAN:", lan, "CIBIL Score:", score);

        console.log("================= 📦 EMICLUB2 REQUEST END =================\n");



        /////////////////// beauro code end ////////////

        return res.json({

            message: "✅ EMICLUB2 loan saved successfully.",

            lan,

            cibilScore: score || "Not Found",

        });

    } catch (error) {

        if (conn) {

            await conn.rollback();

            conn.release();
            conn = null;

        }

        console.error("❌ Unhandled Error in EMICLUB2 Upload:", error);

        res.status(500).json({

            message: "Upload failed. Please try again.",

            error: error.sqlMessage || error.message,

        });

    }

});


//////////////////emiclub2 missed cibil cases temporary route///////////////

router.post("/v1/emiclub2-cibil-retry", verifyApiKey, async (req, res) => {
    if (String(req.partner?.name || "").trim().toLowerCase() !== "emiclub2") {
        return res.status(403).json({ message: "This route is only for Emiclub2 partner." });
    }

    console.log(

        "================= ♻️ EMICLUB2 CIBIL RETRY START =================",

    );

    const rawLimit = Number(req.body?.limit ?? 10);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
        return res.status(400).json({ message: "limit must be an integer from 1 to 50" });
    }
    const limit = rawLimit;

    try {

        const [rows] = await db.promise().query(

            `SELECT * FROM loan_booking_emiclub2 WHERE cibil_score IS NULL AND lan LIKE 'FINE2%' ORDER BY lan DESC LIMIT ?`,

            [limit],

        );



        if (!rows.length) {

            return res.json({

                message: "✅ No pending records with NULL CIBIL found.",

            });

        }



        console.log(`🔍 Found ${rows.length} pending cases.`);



        const stateCodes = {

            "JAMMU and KASHMIR": "01",

            "JAMMU & KASHMIR": "01",

            "HIMACHAL PRADESH": "02",

            PUNJAB: "03",

            CHANDIGARH: "04",

            UTTRANCHAL: "05",

            HARAYANA: "06",

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

            CHHATTISGARH: "22",

            "MADHYA PRADESH": "23",

            GUJRAT: "24",

            "DAMAN and DIU": "25",

            "DADARA and NAGAR HAVELI": "26",

            MAHARASHTRA: "27",

            "ANDHRA PRADESH": "28",

            KARNATAKA: "29",

            GOA: "30",

            LAKSHADWEEP: "31",

            KERALA: "32",

            "TAMIL NADU": "33",

            PONDICHERRY: "34",

            "ANDAMAN and NICOBAR ISLANDS": "35",

            TELANGANA: "36",

        };



        const results = [];



        for (const row of rows) {

            const {

                lan,

                first_name,

                last_name,

                gender,

                dob,

                pan_number,

                loan_amount,

                loan_tenure,

                mobile_number,

                current_address,

                current_village_city,

                current_state,

                current_pincode,

                monthly_salary,

            } = row;



            console.log(`\n🚀 Processing LAN: ${lan} (PAN: ${pan_number})`);



            const state = current_state || "MAHARASHTRA";

            console.log("state", state);

            const state_code = stateCodes[state.trim().toUpperCase()] ?? null;

            console.log("state code", state_code);

            const gender_code = (gender ?? "Male").toLowerCase() === "female" ? 2 : 1;

            // --- Normalize and validate DOB ---

            let dobFormatted = null;

            if (dob) {

                if (dob instanceof Date) {

                    // Convert Date object to YYYYMMDD

                    const yyyy = dob.getFullYear();

                    const mm = String(dob.getMonth() + 1).padStart(2, "0");

                    const dd = String(dob.getDate()).padStart(2, "0");

                    dobFormatted = `${yyyy}${mm}${dd}`;

                } else if (typeof dob === "string") {

                    // Clean string and remove hyphens

                    dobFormatted = dob.replace(/[^0-9]/g, "");

                } else {

                    console.warn(`⚠️ Invalid DOB format for LAN ${lan}:`, dob);

                }

            }



            if (!dobFormatted || dobFormatted.length !== 8) {

                console.warn(`⚠️ Skipping LAN ${lan}: Invalid or missing DOB.`);

                results.push({

                    lan,

                    pan_number,

                    status: "skipped",

                    reason: "Invalid or missing DOB",

                });

                continue; // move to next case

            }



            //       const soapBody = `<soapenv:Envelope xmlns:soapenv="http\://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:cbv2">

            //    <soapenv:Header/>

            //    <soapenv:Body>

            //       <urn:process>

            //          <urn:in>

            //             <INProfileRequest>

            //               <Identification>

            //                 <XMLUser>${process.env.EXPERIAN_USER}</XMLUser>

            //                 <XMLPassword>${process.env.EXPERIAN_PASSWORD}</XMLPassword>

            //               </Identification>

            //               <Application>

            //                 <FTReferenceNumber>${String(lan).replace(/\D/g, '').slice(-6)}</FTReferenceNumber>

            //                 <EnquiryReason>13</EnquiryReason>

            //                 <FinancePurpose>99</FinancePurpose>

            //                 <AmountFinanced>${loan_amount}</AmountFinanced>

            //                 <DurationOfAgreement>${loan_tenure}</DurationOfAgreement>

            //                 <ScoreFlag>3</ScoreFlag>

            //                 <PSVFlag>0</PSVFlag>

            //               </Application>

            //               <Applicant>

            //                 <Surname>${(last_name || "").toUpperCase()}</Surname>

            //                 <FirstName>${(first_name || "").toUpperCase()}</FirstName>

            //                 <GenderCode>${gender_code}</GenderCode>

            //                 <IncomeTaxPAN>${pan_number}</IncomeTaxPAN>

            //                 <DateOfBirth>${dobFormatted}</DateOfBirth>

            //                 <PhoneNumber>${mobile_number}</PhoneNumber>

            //               </Applicant>

            //               <Address>

            //                 <FlatNoPlotNoHouseNo>${current_address}</FlatNoPlotNoHouseNo>

            //                 <City>${current_village_city}</City>

            //                 <State>${state_code}</State>

            //                 <PinCode>${current_pincode}</PinCode>

            //               </Address>

            //             </INProfileRequest>

            //          </urn:in>

            //       </urn:process>

            //    </soapenv:Body>

            // </soapenv:Envelope>`;



            const soapBody = `<soapenv:Envelope xmlns:soapenv="http\://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:cbv2">

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

          <FTReferenceNumber>${String(lan).replace(/\D/g, "").slice(-6)}</FTReferenceNumber>

          <CustomerReferenceID/>

          <EnquiryReason>13</EnquiryReason>

          <FinancePurpose>99</FinancePurpose>

          <AmountFinanced>${loan_amount}</AmountFinanced>

          <DurationOfAgreement>${loan_tenure}</DurationOfAgreement>

          <ScoreFlag>3</ScoreFlag>

          <PSVFlag>0</PSVFlag>

        </Application>

        <Applicant>

          <Surname>${(last_name || "").toUpperCase()}</Surname>

          <FirstName>${(first_name || "").toUpperCase()}</FirstName>

          <MiddleName1/>

          <MiddleName2/>

          <MiddleName3/>

          <GenderCode>${gender_code}</GenderCode>

          <IncomeTaxPAN>${pan_number}</IncomeTaxPAN>

          <PANIssueDate/>

          <PANExpirationDate/>

          <PassportNumber/>

          <PassportIssueDate/>

          <PassportExpirationDate/>

          <VoterIdentityCard/>

          <VoterIDIssueDate/>

          <VoterIDExpirationDate/>

          <DriverLicenseNumber/>

          <DriverLicenseIssueDate/>

          <DriverLicenseExpirationDate/>

          <RationCardNumber/>

          <RationCardIssueDate/>

          <RationCardExpirationDate/>

          <UniversalIDNumber/>

          <UniversalIDIssueDate/>

          <UniversalIDExpirationDate/>

          <DateOfBirth>${dobFormatted}</DateOfBirth>

          <STDPhoneNumber/>

          <PhoneNumber/>

          <TelephoneExtension/>

          <TelephoneType/>

          <MobilePhone>${mobile_number}</MobilePhone>

          <EMailId/>

        </Applicant>

        <Details>

          <Income>${monthly_salary}</Income>

          <MaritalStatus/>

          <EmployStatus/>

          <TimeWithEmploy/>

          <NumberOfMajorCreditCardHeld/>

        </Details>

        <Address>

          <FlatNoPlotNoHouseNo>${current_address}</FlatNoPlotNoHouseNo>

          <BldgNoSocietyName/>

          <RoadNoNameAreaLocality/>

          <City>${current_village_city}</City>

          <Landmark/>

          <State>${state_code}</State>

          <PinCode>${current_pincode}</PinCode>

        </Address>

        <AdditionalAddressFlag>

          <Flag>N</Flag>

        </AdditionalAddressFlag>

        <AdditionalAddress>

          <FlatNoPlotNoHouseNo/>

          <BldgNoSocietyName/>

          <RoadNoNameAreaLocality/>

          <City/>

          <Landmark/>

          <State/>

          <PinCode/>

        </AdditionalAddress>

      </INProfileRequest>

    </urn:in>

  </urn:process>

</soapenv:Body>

</soapenv:Envelope>`;



            try {

                const response = await axios.post(process.env.EXPERIAN_URL, soapBody, {

                    headers: {

                        "Content-Type": "text/xml; charset=utf-8",

                        SOAPAction: "urn:cbv2/process",

                    },

                    timeout: 30000,

                    validateStatus: () => true,

                });



                if (response.status !== 200) {

                    throw new Error(`HTTP ${response.status}`);

                }



                const parser = new XMLParser({

                    ignoreAttributes: false,

                    attributeNamePrefix: "",

                    trimValues: true,



                    // Keep entity processing enabled, but raise limits for valid large bureau XML.

                    processEntities: {

                        enabled: true,

                        maxTotalExpansions: 500000,

                        maxExpandedLength: 20_000_000,

                        maxEntityCount: 200000,

                        maxEntitySize: 200000,

                    },

                });

                const parsed = parser.parse(response.data);

                const encodedInnerXml =

                    parsed["SOAP-ENV:Envelope"]?.["SOAP-ENV:Body"]?.[

                    "ns2:processResponse"

                    ]?.["ns2:out"];



                if (!encodedInnerXml) throw new Error("Missing ns2:out in response");



                const decoded = he.decode(encodedInnerXml);

                const innerParsed = parser.parse(decoded);

                const scoreStr =

                    innerParsed?.INProfileResponse?.SCORE?.BureauScore ?? null;

                const score = scoreStr == null ? null : Number(scoreStr);
                if (!Number.isFinite(score)) throw new Error("Experian score missing or invalid");



                await db.promise().query(

                    `INSERT INTO loan_cibil_reports (lan, pan_number, score, report_xml, created_at)

             VALUES (?,?,?,?,NOW())`,

                    [lan, pan_number, score, decoded],

                );



                await db.promise().query(

                    `INSERT INTO kyc_verification_status (lan, bureau_status, bureau_api_response)

   VALUES (?, 'VERIFIED', ?)

   ON DUPLICATE KEY UPDATE bureau_status='VERIFIED', bureau_api_response=VALUES(bureau_api_response)`,

                    [lan, decoded],

                );



                await db.promise().execute(

                    `UPDATE loan_booking_emiclub2 SET cibil_score = ? WHERE lan = ?`,

                    [score, lan],

                );



                console.log(`✅ CIBIL fetched for ${lan} → Score: ${score}`);

                results.push({ lan, pan_number, score, status: "success" });

            } catch (err) {

                console.error(`⚠️ Error for ${lan}:`, err.message);

                results.push({ lan, pan_number, error: err.message, status: "failed" });

            }

        }



        console.log(

            "================= ♻️ EMICLUB2 CIBIL RETRY END =================",

        );

        return res.json({

            message: "Retry process completed.",

            processed: results.length,

            results,

        });

    } catch (err) {

        console.error("❌ Fatal error in retry route:", err.message);

        res.status(500).json({

            message: "CIBIL retry failed.",

            error: err.message,

        });

    }

});

module.exports = router;
