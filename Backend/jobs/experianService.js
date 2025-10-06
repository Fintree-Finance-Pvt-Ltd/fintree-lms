const axios = require("axios");
const { parseStringPromise }= require("xml2js");
const dotenv = require( "dotenv");
dotenv.config();

const EXPERIAN_USER = process.env.EXPERIAN_USER;
const EXPERIAN_PASSWORD = process.env.EXPERIAN_PASSWORD;
const EXPERIAN_URL = process.env.EXPERIAN_URL || "https://connectuat.experian.in/nextgen-ind-pds-webservices-cbv2/endpoint";

module.exports.pullCIBILReport = async function ({ first_name, last_name, dob, pan_number, mobile_number, current_address, current_state, current_pincode, current_village_city }) {
  const dobFormatted = dob.replace(/-/g, ""); // yyyyMMdd

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:cbv2">
    <soapenv:Header/>
    <soapenv:Body>
      <urn:process>
        <urn:in>
          <INProfileRequest>
            <Identification>
              <XMLUser>${EXPERIAN_USER}</XMLUser>
              <XMLPassword>${EXPERIAN_PASSWORD}</XMLPassword>
            </Identification>
            <Application>
              <FTReferenceNumber>FT${Date.now()}</FTReferenceNumber>
              <CustomerReferenceID>${pan_number}</CustomerReferenceID>
              <EnquiryReason>13</EnquiryReason>
              <FinancePurpose>99</FinancePurpose>
              <AmountFinanced>5000</AmountFinanced>
              <DurationOfAgreement>6</DurationOfAgreement>
              <ScoreFlag>1</ScoreFlag>
              <PSVFlag>0</PSVFlag>
            </Application>
            <Applicant>
              <Surname>${last_name || ""}</Surname>
              <FirstName>${first_name || ""}</FirstName>
              <DateOfBirth>${dobFormatted}</DateOfBirth>
              <IncomeTaxPAN>${pan_number}</IncomeTaxPAN>
              <PhoneNumber>${mobile_number}</PhoneNumber>
            </Applicant>
            <Address>
              <FlatNoPlotNoHouseNo>${current_address || current_village_city || ""}</FlatNoPlotNoHouseNo>
              <City>${current_village_city || "MUMBAI"}</City>
              <State>${current_state || 27}</State>
              <PinCode>${current_pincode || ""}</PinCode>
            </Address>
            <AdditionalAddressFlag><Flag>N</Flag></AdditionalAddressFlag>
          </INProfileRequest>
        </urn:in>
      </urn:process>
    </soapenv:Body>
  </soapenv:Envelope>`;

  try {
    const { data } = await axios.post(EXPERIAN_URL, xml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "urn:cbv2/process",
      },
      timeout: 30000,
    });

    const json = await parseStringPromise(data, { explicitArray: false });
    const score =
      json?.["soapenv:Envelope"]?.["soapenv:Body"]?.["processResponse"]?.out?.INProfileResponse?.Score?.Value ||
      null;

    return { success: true, score, xmlResponse: data, jsonResponse: json };
  } catch (err) {
    console.error("❌ Experian Pull Error:", err.message);
    return { success: false, error: err.message };
  }
}
