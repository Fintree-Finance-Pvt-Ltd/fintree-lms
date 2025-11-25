// services/bureauService.js

const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const he = require("he");

function formatDobForExperian(dob) {
  if (!dob) return ""; // or throw if required

  // If it's a Date object from MySQL
  if (dob instanceof Date) {
    const year = dob.getFullYear();
    const month = String(dob.getMonth() + 1).padStart(2, "0");
    const day = String(dob.getDate()).padStart(2, "0");
    return `${year}${month}${day}`; // YYYYMMDD
  }

  // Fallback: treat as string
  const s = String(dob).trim();         // "2000-01-15" or "20000115"
  const cleaned = s.replace(/-/g, "");  // "20000115"
  return cleaned.slice(0, 8);           // ensure length 8
}


// State Code Mapping ( YOUR EXISTING MAPPING )
const STATE_CODES = {
  "JAMMU AND KASHMIR": "01",
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

const runBureau = async (data) => {
  try {
    console.log("🏦 Running Experian Bureau Utility...");

    // -----------------------------
    // Format required fields
  //  -----------------------------

    const dobFormatted = formatDobForExperian(data.dob); // 1999-05-21 → 19990521
    const gender_code = data.gender === "Female" ? 2 : 1;

    const state_code =
      STATE_CODES[data.current_state?.toUpperCase()] ?? STATE_CODES["MAHARASHTRA"];

    const firstName = data.first_name.toUpperCase();
    const lastName = data.last_name.toUpperCase();

    // -----------------------------
    // YOUR EXACT SOAP XML (NO REMOVALS)
    // -----------------------------

//     const soapBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:cbv2">
//    <soapenv:Header/>
//    <soapenv:Body>
//       <urn:process>
//          <urn:in>
//             <INProfileRequest>
//     <Identification>
//        <XMLUser>${process.env.EXPERIAN_USER}</XMLUser>
//        <XMLPassword>${process.env.EXPERIAN_PASSWORD}</XMLPassword>
//     </Identification>
//     <Application>
//         <FTReferenceNumber></FTReferenceNumber>
//         <CustomerReferenceID></CustomerReferenceID>
//         <EnquiryReason>13</EnquiryReason> 
//         <FinancePurpose>99</FinancePurpose>
//         <AmountFinanced>${data.loan_amount}</AmountFinanced>
//         <DurationOfAgreement>${data.loan_tenure}</DurationOfAgreement>
//         <ScoreFlag>1</ScoreFlag>
//         <PSVFlag></PSVFlag>
//     </Application>
//     <Applicant>
//         <Surname>${lastName}</Surname>
//         <FirstName>${firstName}</FirstName>
//         <MiddleName1></MiddleName1>
//         <MiddleName2></MiddleName2>
//         <MiddleName3></MiddleName3>
//         <GenderCode>${gender_code}</GenderCode>
//         <IncomeTaxPAN>${data.pan_number}</IncomeTaxPAN>
//         <PANIssueDate></PANIssueDate>
//         <PANExpirationDate></PANExpirationDate>
//         <PassportNumber></PassportNumber>
//         <PassportIssueDate></PassportIssueDate>
//         <PassportExpirationDate></PassportExpirationDate>
//         <VoterIdentityCard></VoterIdentityCard>
//         <VoterIDIssueDate></VoterIDIssueDate>
//         <VoterIDExpirationDate></VoterIDExpirationDate>
//         <DriverLicenseNumber></DriverLicenseNumber>
//         <DriverLicenseIssueDate></DriverLicenseIssueDate>
//         <DriverLicenseExpirationDate></DriverLicenseExpirationDate>
//         <RationCardNumber></RationCardNumber>
//         <RationCardIssueDate></RationCardIssueDate>
//         <RationCardExpirationDate></RationCardExpirationDate>
//         <UniversalIDNumber></UniversalIDNumber>
//         <UniversalIDIssueDate></UniversalIDIssueDate>
//         <UniversalIDExpirationDate></UniversalIDExpirationDate>
//         <DateOfBirth>${dobFormatted}</DateOfBirth>
//         <STDPhoneNumber></STDPhoneNumber>
//         <PhoneNumber>${data.mobile_number}</PhoneNumber>
//         <TelephoneExtension></TelephoneExtension>
//         <TelephoneType></TelephoneType>
//         <MobilePhone></MobilePhone>
//         <EMailId></EMailId>
//     </Applicant>
//     <Details>
//         <Income></Income>
//         <MaritalStatus></MaritalStatus>
//         <EmployStatus></EmployStatus>
//         <TimeWithEmploy></TimeWithEmploy>
//         <NumberOfMajorCreditCardHeld></NumberOfMajorCreditCardHeld>
//     </Details>
//     <Address>
//         <FlatNoPlotNoHouseNo>${data.current_address}</FlatNoPlotNoHouseNo>
//         <BldgNoSocietyName></BldgNoSocietyName>
//         <RoadNoNameAreaLocality></RoadNoNameAreaLocality>
//         <City>${data.current_village_city}</City>
//         <Landmark></Landmark>
//         <State>${state_code}</State>
//         <PinCode>${data.current_pincode}</PinCode>
//     </Address>
//     <AdditionalAddressFlag>
//         <Flag>N</Flag>
//     </AdditionalAddressFlag>
//     <AdditionalAddress>
//         <FlatNoPlotNoHouseNo></FlatNoPlotNoHouseNo>
//         <BldgNoSocietyName></BldgNoSocietyName>
//         <RoadNoNameAreaLocality></RoadNoNameAreaLocality>
//         <City></City>
//         <Landmark></Landmark>
//         <State></State>
//         <PinCode></PinCode>
//     </AdditionalAddress>
// </INProfileRequest>
// </urn:in>
//       </urn:process>
//    </soapenv:Body>
// </soapenv:Envelope>`;

/////////////  HARD coded for testing /////////////
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
        <EnquiryReason>13</EnquiryReason> 
        <FinancePurpose>99</FinancePurpose>
        <AmountFinanced>19200</AmountFinanced>
        <DurationOfAgreement>5</DurationOfAgreement>
        <ScoreFlag>1</ScoreFlag>
        <PSVFlag></PSVFlag>
    </Application>
    <Applicant>
        <Surname>YERRA</Surname>
        <FirstName>RAJU</FirstName>
        <MiddleName1></MiddleName1>
        <MiddleName2></MiddleName2>
        <MiddleName3></MiddleName3>
        <GenderCode>1</GenderCode>
        <IncomeTaxPAN>AFIPY3624H</IncomeTaxPAN>
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
        <DateOfBirth>19840619</DateOfBirth>
        <STDPhoneNumber></STDPhoneNumber>
        <PhoneNumber>9869350574</PhoneNumber>
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
        <FlatNoPlotNoHouseNo>6 59 harijanawada nararayanapur mandal Gujja</FlatNoPlotNoHouseNo>
        <BldgNoSocietyName></BldgNoSocietyName>
        <RoadNoNameAreaLocality></RoadNoNameAreaLocality>
        <City>Gujja</City>
        <Landmark></Landmark>
        <State>27</State>
        <PinCode>508253</PinCode>
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

    // -----------------------------
    // Send SOAP Request
    // -----------------------------

    const response = await axios.post(process.env.EXPERIAN_URL, soapBody, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "urn:cbv2/process",
        Accept: "text/xml",
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    if (response.status !== 200) {
      return {
        success: false,
        score: null,
        response: response.data,
      };
    }

    // -----------------------------
    // Parse XML Response
    // -----------------------------

    const parser = new XMLParser({ ignoreAttributes: false });
    const parsedOuter = parser.parse(response.data);

    const encodedInnerXml =
      parsedOuter["SOAP-ENV:Envelope"]?.["SOAP-ENV:Body"]?.[
        "ns2:processResponse"
      ]?.["ns2:out"];

    if (!encodedInnerXml) {
      return {
        success: false,
        score: null,
        response: response.data,
      };
    }

    const decodedXml = he.decode(encodedInnerXml);
    const parsedInner = parser.parse(decodedXml);

    const scoreStr =
      parsedInner?.INProfileResponse?.SCORE?.BureauScore || null;

    return {
      success: !!scoreStr,
      score: scoreStr ? Number(scoreStr) : null,
      response: decodedXml,
    };
  } catch (err) {
    console.error("❌ Bureau Error:", err);
    return {
      success: false,
      score: null,
      response: err.message,
    };
  }
};

module.exports = {
  runBureau,
};
