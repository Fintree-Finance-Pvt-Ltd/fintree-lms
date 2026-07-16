/**
 * src/services/trackwizz/payloadBuilder.js
 *
 * AS504 Purpose-01 builder — mirrors the WORKING payload from the
 * TrackWizz Postman collection (tested OK on our tenant).
 *
 * PRINCIPLE: the vendor payload is the contract. We keep its structure
 * and static defaults exactly as tested, and parameterize ONLY the
 * per-lead dynamic fields:
 *
 *   requestId, sourceSystemCustomerCode, applicationRefNumber,
 *   sourceSystemCustomerCreationDate, uniqueIdentifier,
 *   firstName (full name), gender, dateofBirth,
 *   personalMobileNumber, personalEmail, pan (+formSixty),
 *   fatherFirstName (+fatherPrefix)
 *
 * Deliberate deviations from the Postman sample (each justified):
 *   1. sourceSystemName: the sample has "FintreeLMS" at top level but "kyc"
 *      inside the customer. MRV27 rejects unrecognized names, so BOTH now
 *      come from config.sourceSystemName — set it to whichever value the
 *      TrackWizz team actually whitelisted (see note in trackwizz.config).
 *   2. requestId: sample "2" is static; must be unique per request → generated.
 *   3. formSixty: sample sends "0" with empty PAN (contradicts VS18 but your
 *      tenant doesn't enforce it). We still set it correctly from PAN
 *      presence — costs nothing, correct either way.
 *   4. exactIncome 250000 / exactNetworth 2100000 / networthDocument /
 *      incomeRange and the regAMLRiskSpecialCategory "2" row are SAMPLE
 *      values. We must not assert fake income/networth/AML-category data
 *      for every real customer into an AML system → blanked/emptied.
 *      (Your test proves partial groups pass, so blanks are safe too.)
 *   5. adverseReputation: sample "1" means "Yes, has adverse reputation" —
 *      wrong to claim for every lead → "" (sample itself leaves the
 *      classification empty, so the pair stays inert).
 *   6. fatherPrefix: sample sends "Mr" with empty fatherFirstName; we send
 *      the pair together only when a father name exists.
 *
 * Everything else — status "Active" with blank effectiveDate, district ".",
 * kycAttestationType "1", kycPlaceOfDeclaration "Mumbai", natureOfBusiness
 * "Oth", relatedPersonCountforCKYC 1, screeningReportWhenNil "1", empty-row
 * taxDetailDtoList / gstinDtoList, ISD "91" pre-filled — is kept EXACTLY as
 * in the tested payload, even where the spec disagrees, because tested > spec.
 */

const config = require("../../config/trackwizz.config");

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const TW_DATE_REGEX =
  /^(0[1-9]|[12]\d|3[01])-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$/;

function twDate(value) {
  if (!value) return "";

  const raw = String(value).trim();

  // Already converted by the canonical adapter.
  if (TW_DATE_REGEX.test(raw)) {
    return raw;
  }

  const date = value instanceof Date
    ? value
    : new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const day = String(date.getDate()).padStart(2, "0");

  return `${day}-${MONTHS[date.getMonth()]}-${date.getFullYear()}`;
}

/** requestId must be unique per record; allowed charset per MRV28. */
function buildRequestId(lan) {
  const safeLan = String(lan || "")
    .trim()
    .replace(/[^A-Za-z0-9\-_. ]/g, "");

  if (!safeLan) {
    const err = new Error("Valid LAN is required for requestId");
    err.code = "INVALID_LAN";
    throw err;
  }

  return `LAN-${safeLan}-${Date.now()}`;
}

/**
 * Field-spec name criteria: first char not special, at least one alphabet,
 * no consecutive special characters. Returns '' if unsalvageable.
 */
function sanitizeName(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  s = s.replace(/([^A-Za-z0-9])\1+/g, "$1");
  s = s.replace(/([^A-Za-z0-9 ])(?=[^A-Za-z0-9 ])/g, "");
  s = s.replace(/\s{2,}/g, " ");
  s = s.replace(/^[^A-Za-z0-9]+/, "");
  if (!/[A-Za-z]/.test(s)) return "";
  return s.trim();
}

/**
 * Build the AS504 Purpose-01 payload for one lead (vendor-template based).
 *
 * @param {object} lead - canonical lead from loanBookingAdapter:
 *   { leadId, customerCode, applicationRefNumber, fullName, fatherName,
 *     pan, mobile, email, dob, gender, createdAt }
 * @returns {{ requestId: string, payload: object }}
 * @throws  {Error} code NO_IDENTIFIER when nothing screenable remains —
 *          route to manual review, don't burn the API call.
 */
function buildPurpose01Payload(lead) {
  if (!lead || !lead.lan) {
  const err = new Error("lead.lan is required");
  err.code = "LAN_REQUIRED";
  throw err;
}

if (!lead.customerCode) {
  const err = new Error("lead.customerCode is required");
  err.code = "CUSTOMER_CODE_REQUIRED";
  throw err;
}
  // Vendor payload passes the full name inside firstName (their test name
  // "ABD EL HAMID SALIM IBRAHIM BRUKAN AL-KHATOUNI" confirms the pattern).
  const firstName = sanitizeName(lead.fullName || "");
  const fatherFirstName = sanitizeName(lead.fatherName || "");

  const hasIdentifier = firstName || lead.mobile || lead.email || lead.pan;
  if (!hasIdentifier) {
    const err = new Error(
      "AS504 purpose 01 needs at least one identifier: name, mobile, email or PAN",
    );
    err.code = "NO_IDENTIFIER";
    throw err;
  }

  const requestId = buildRequestId(lead.lan);

  const customer = {
    ekycOTPbased: "",
    ekycOTPbasedId: null,
    segment: "",
    NationalId: "",
    segmentId: null,
    countryofEducation: "IND",
    CountryOfEmployment: "IND",
    segmentStartDate: "",
    segmentStartDateDateTime: null,
    status: "Active",
    statusId: null,
    effectiveDate: "",
    effectiveDateDateTime: null,
    minor: "",
    minorId: null,
    maritalStatus: "",
    maritalStatusId: null,
    occupationType: "",
    occupationTypeOther: "",
    occupationTypeId: null,
    natureOfBusinessOther: "",
    companyIdentificationNumber: "",
    UdhyamRC: "",
    ISIN: "",
    companyRegistrationNumber: "",
    companyRegistrationCountry: "",
    companyRegistrationCountryId: null,
    globalIntermediaryIdentificationNumber: "",
    kycAttestationType: "1",
    kycAttestationTypeId: null,
    kycDateOfDeclaration: "",
    kycDateOfDeclarationDateTime: null,
    kycPlaceOfDeclaration: "Mumbai",
    kycVerificationDate: "",
    kycVerificationDateDateTime: null,
    kycEmployeeName: "",
    kycEmployeeDesignation: "",
    kycVerificationBranch: "",
    kycEmployeeCode: "",
    listed: "",
    BranchCode: "",
    listedId: null,
    applicationRefNumber: String(lead.applicationRefNumber || ""), // dynamic
    documentRefNumber: "",
    regAMLRisk: "",
    regAMLRiskId: null,
    regAMLRiskLastRiskReviewDate: "",
    regAMLRiskLastRiskReviewDateDateTime: null,
    regAMLRiskNextRiskReviewDate: "",
    regAMLRiskNextRiskReviewDateDateTime: null,
    // sample values 250000/2100000 were demo data — never assert fake
    // financials into an AML system; blanks are proven safe on this tenant
    incomeRange: "",
    incomeRangeId: null,
    exactIncome: null,
    incomeCurrency: "",
    incomeCurrencyId: null,
    incomeEffectiveDate: "",
    incomeEffectiveDateDateTime: null,
    incomeDescription: "",
    incomeDocument: "",
    incomeDocumentId: null,
    exactNetworth: null,
    networthCurrency: "",
    networthCurrencyId: null,
    networthEffectiveDate: "",
    networthEffectiveDateDateTime: null,
    networthDescription: "",
    networthDocument: "",
    networthDocumentId: null,
    familyCode: "",
    channel: "",
    channelId: null,
    contactPersonFirstName1: "",
    contactPersonMiddleName1: "",
    contactPersonLastName1: "",
    contactPersonDesignation1: "",
    contactPersonFirstName2: "",
    contactPersonMiddleName2: "",
    contactPersonLastName2: "",
    contactPersonDesignation2: "",
    contactPersonMobileISD: "",
    contactPersonMobileNo: "",
    contactPersonMobileISD2: "",
    contactPersonMobileNo2: "",
    contactPersonEmailId1: "",
    contactPersonEmailId2: "",
    commencementDate: "",
    commencementDateDateTime: null,
    maidenPrefix: "",
    maidenPrefixId: null,
    maidenFirstName: "",
    maidenMiddleName: "",
    maidenLastName: "",
    relatedPersonCountforCKYC: 1, // as tested
    proofOfIdSubmitted: lead.pan ? "PAN" : "", // dynamic (sample: "PAN")
    proofOfIdSubmittedId: null,
    products: "Loan",
    productsId: null,
    natureOfBusiness: "Oth", // as tested (tenant doesn't enforce VS30)
    natureOfBusinessId: null,
    educationalQualification: "1",
    educationalQualificationId: null,
    countryOfOperations: "IND",
    countryOfOperationsId: null,
    personalMobileISD: "91", // as tested (sent even with empty number)
    personalMobileNumber: lead.mobile || "", // dynamic
    workMobileISD: "91",
    workMobileNumber: "",
    // sample carried a demo special-category row ("2") — asserting an AML
    // special category for every customer would be false data → empty
    regAMLRiskSpecialCategoryDtoList: [],
    relatedPersonList: [],
    customerRelationDtoList: [],
    constitutionType: "1",
    constitutionTypeId: 0,
    sourceSystemName: config.sourceSystemName, // dynamic — see MRV27 note
    sourceSystemCustomerCode: String(lead.customerCode), // dynamic
    sourceSystemCustomerCreationDate: twDate(lead.createdAt), // dynamic
    sourceSystemCustomerCreationDateDateTime: null,
    uniqueIdentifier: String(lead.lan), // dynamic — must match the LAN in loan_booking_switch_my_loan
    SystemGeneratedId: null,
    prefix: "", // as tested — blank prefix with firstName passes on this tenant
    prefixId: null,
    firstName, // dynamic — full name here, per vendor pattern
    middleName: "",
    lastName: "",
    alias: null,
    fatherPrefix: fatherFirstName ? "Mr" : "", // pair sent together
    fatherPrefixId: null,
    fatherFirstName, // dynamic
    fatherMiddleName: "",
    fatherLastName: "",
    spousePrefix: "",
    spousePrefixId: null,
    spouseFirstName: "",
    spouseMiddleName: "",
    spouseLastName: "",
    motherPrefix: "",
    motherPrefixId: null,
    motherFirstName: "",
    motherMiddleName: "",
    motherLastName: "",
    gender: lead.gender || "", // dynamic
    genderId: null,
    dateofBirth: twDate(lead.dob), // dynamic
    dateofBirthDateTime: null,
    workEmail: "",
    personalEmail: lead.email || "", // dynamic
    permanentAddressCountry: "",
    permanentAddressCountryId: null,
    permanentAddressZipCode: "",
    permanentAddressLine1: "",
    permanentAddressLine2: "",
    permanentAddressLine3: "",
    permanentAddressDistrict: ".", // as tested
    permanentAddressCity: ".", // as tested
    permanentAddressState: "",
    permanentAddressOtherState: "",
    permanentAddressStateId: null,
    permanentAddressDocument: "",
    permanentAddressDocumentId: null,
    permanentAddressDocumentOthersValue: "",
    correspondenceAddressCountry: "",
    correspondenceAddressCountryId: null,
    correspondenceAddressZipCode: "",
    correspondenceAddressLine1: "",
    correspondenceAddressLine2: "",
    correspondenceAddressLine3: "",
    correspondenceAddressDistrict: ".", // as tested
    correspondenceAddressCity: ".", // as tested
    correspondenceAddressState: "",
    correspondenceAddressOtherState: "",
    correspondenceAddressStateId: null,
    correspondenceAddressDocument: "",
    correspondenceAddressDocumentId: null,
    countryOfResidence: "",
    countryOfResidenceId: null,
    countryOfBirth: "",
    countryOfBirthId: null,
    birthCity: "",
    passportIssueCountry: "",
    passportIssueCountryId: null,
    passportNumber: "",
    passportExpiryDate: "",
    passportExpiryDateDateTime: null,
    voterIdNumber: "",
    drivingLicenseNumber: "",
    drivingLicenseExpiryDate: "",
    drivingLicenseExpiryDateDateTime: null,
    aadhaarNumber: "",
    aadhaarVaultReferenceNumber: "",
    nregaNumber: "",
    nprLetterNumber: "",
    directorIdentificationNumber: "",
    formSixty: lead.pan ? "0" : "1", // dynamic (correct per VS18/VS19)
    formSixtyId: null,
    pan: lead.pan || "", // dynamic
    ckycNumber: "",
    identityDocument: null,
    identityDocumentId: null,
    politicallyExposed: "",
    politicallyExposedId: null,
    adverseReputationstring: null,
    adverseReputationDetails: "",
    notes: "",
    tags: "",
    tagsId: null,
    screeningProfile: "",
    screeningReportWhenNil: "1", // as tested — PDF report returned even on nil
    screeningReportWhenNilId: null,
    riskProfile: null,
    adverseReputation: "", // sample "1" = "Yes" — false claim for real leads
    adverseReputationId: null,
    adverseReputationClassification: "",
    adverseReputationClassificationId: null,
    taxDetailDtoList: [
      // empty row exactly as tested
      {
        Id: 0,
        taxResidencyCountry: "IND",
        taxResidencyCountryId: null,
        taxIdentificationNumber: "",
        taxResidencyStartDate: "",
        taxResidencyStartDateDateTime: null,
        taxResidencyEndDate: "",
        taxResidencyEndDateDateTime: null,
      },
    ],
    gstinDtoList: [
      // empty row exactly as tested
      {
        Id: 0,
        gstinNumber: "",
        GSTINStartDate: "",
        GSTINStartDateDateTime: null,
        GSTINEndDate: "",
        GSTINEndDateDateTime: null,
      },
    ],
    politicallyExposedClassification: "",
    politicallyExposedClassificationId: null,
    citizenships: "IND",
    citizenshipsId: null,
    nationalities: "",
    nationalitiesId: null,
    documents: null,
  };

  const payload = {
    requestId,
    sourceSystemName: config.sourceSystemName,
    purpose: "01",
    customerList: [customer],
  };

  return { requestId, payload };
}

module.exports = {
  buildPurpose01Payload,
  twDate,
  buildRequestId,
  sanitizeName,
};
