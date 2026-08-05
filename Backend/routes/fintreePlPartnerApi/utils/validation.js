const { PartnerApiError } = require("./partnerApiError");

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA256_REGEX = /^[a-f0-9]{64}$/i;
const PINCODE_REGEX = /^\d{6}$/;

const requiredString = (value, field, maxLength = 500) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new PartnerApiError(400, "VALIDATION_ERROR", `${field} is required.`, {
      field,
    });
  }
  if (normalized.length > maxLength) {
    throw new PartnerApiError(
      400,
      "VALIDATION_ERROR",
      `${field} exceeds the maximum length of ${maxLength}.`,
      { field },
    );
  }
  return normalized;
};

const optionalString = (value, field, maxLength = 500) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new PartnerApiError(400, "VALIDATION_ERROR", `${field} must be a string.`, {
      field,
    });
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new PartnerApiError(
      400,
      "VALIDATION_ERROR",
      `${field} exceeds the maximum length of ${maxLength}.`,
      { field },
    );
  }
  return normalized || null;
};

const requireBoolean = (value, field) => {
  if (typeof value !== "boolean") {
    throw new PartnerApiError(400, "VALIDATION_ERROR", `${field} must be boolean.`, {
      field,
    });
  }
  return value;
};

const requirePositiveInteger = (value, field) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new PartnerApiError(
      400,
      "VALIDATION_ERROR",
      `${field} must be a positive integer.`,
      { field },
    );
  }
  return value;
};

const requireDate = (value, field) => {
  const normalized = requiredString(value, field, 10);
  if (!DATE_REGEX.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw new PartnerApiError(
      400,
      "VALIDATION_ERROR",
      `${field} must use YYYY-MM-DD format.`,
      { field },
    );
  }
  return normalized;
};

const requireDateTime = (value, field) => {
  const normalized = requiredString(value, field, 40);
  if (!ISO_DATETIME_REGEX.test(normalized) || Number.isNaN(Date.parse(normalized))) {
    throw new PartnerApiError(
      400,
      "VALIDATION_ERROR",
      `${field} must be a valid ISO-8601 datetime with timezone.`,
      { field },
    );
  }
  return normalized;
};

const requireSha256 = (value, field) => {
  const normalized = requiredString(value, field, 64).toLowerCase();
  if (!SHA256_REGEX.test(normalized)) {
    throw new PartnerApiError(
      400,
      "VALIDATION_ERROR",
      `${field} must be a 64-character SHA-256 hexadecimal value.`,
      { field },
    );
  }
  return normalized;
};

const requirePincode = (value, field) => {
  const normalized = requiredString(value, field, 6);
  if (!PINCODE_REGEX.test(normalized)) {
    throw new PartnerApiError(400, "VALIDATION_ERROR", `${field} must be six digits.`, {
      field,
    });
  }
  return normalized;
};

const requireObject = (value, field) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PartnerApiError(400, "VALIDATION_ERROR", `${field} must be an object.`, {
      field,
    });
  }
  return value;
};

const validateCreatePayload = (input) => {
  const body = requireObject(input, "body");
  const customer = requireObject(body.customer, "customer");
  const panVerification = requireObject(body.panVerification, "panVerification");

  const panNumber = requiredString(customer.panNumber, "customer.panNumber", 10)
    .toUpperCase();

  if (!PAN_REGEX.test(panNumber)) {
    throw new PartnerApiError(
      400,
      "VALIDATION_ERROR",
      "customer.panNumber has an invalid PAN format.",
      { field: "customer.panNumber" },
    );
  }

  const verified = requireBoolean(panVerification.verified, "panVerification.verified");
  if (!verified) {
    throw new PartnerApiError(
      422,
      "PAN_NOT_VERIFIED",
      "A verified PAN is required before application creation.",
    );
  }

  const sourceSystem = requiredString(body.sourceSystem, "sourceSystem", 100);
  if (sourceSystem !== "FINTREE_PLP") {
    throw new PartnerApiError(
      400,
      "VALIDATION_ERROR",
      "sourceSystem must be FINTREE_PLP.",
      { field: "sourceSystem" },
    );
  }

  const gender = optionalString(customer.gender, "customer.gender", 10);
  if (gender && !["MALE", "FEMALE", "OTHER"].includes(gender)) {
    throw new PartnerApiError(400, "VALIDATION_ERROR", "customer.gender is invalid.", {
      field: "customer.gender",
    });
  }

  return {
    externalApplicationReference: requiredString(
      body.externalApplicationReference,
      "externalApplicationReference",
      100,
    ),
    lan: requiredString(body.lan, "lan", 50),
    sourceSystem,
    productCode: requiredString(body.productCode, "productCode", 60),
    customer: {
      fullName: requiredString(customer.fullName, "customer.fullName", 150),
      firstName: requiredString(customer.firstName, "customer.firstName", 60),
      middleName: optionalString(customer.middleName, "customer.middleName", 60),
      lastName: requiredString(customer.lastName, "customer.lastName", 60),
      fatherName: requiredString(customer.fatherName, "customer.fatherName", 150),
      panNumber,
      dateOfBirth: requireDate(customer.dateOfBirth, "customer.dateOfBirth"),
      gender,
      mobileNumber: requiredString(customer.mobileNumber, "customer.mobileNumber", 20),
      email: optionalString(customer.email, "customer.email", 254),
    },
    panVerification: {
      verified,
      providerReference: optionalString(
        panVerification.providerReference,
        "panVerification.providerReference",
        150,
      ),
      verifiedAt:
        panVerification.verifiedAt === null || panVerification.verifiedAt === undefined
          ? null
          : requireDateTime(panVerification.verifiedAt, "panVerification.verifiedAt"),
    },
  };
};

const validateConsentPayload = (input) => {
  const body = requireObject(input, "body");
  const consentType = requiredString(body.consentType, "consentType", 80);
  if (consentType !== "LENDER_DATA_SHARING") {
    throw new PartnerApiError(400, "VALIDATION_ERROR", "consentType is invalid.", {
      field: "consentType",
    });
  }

  return {
    externalApplicationReference: requiredString(
      body.externalApplicationReference,
      "externalApplicationReference",
      100,
    ),
    lan: requiredString(body.lan, "lan", 50),
    consentType,
    consentId: requiredString(body.consentId, "consentId", 150),
    consentTemplateId: requiredString(body.consentTemplateId, "consentTemplateId", 100),
    consentVersion: requiredString(body.consentVersion, "consentVersion", 50),
    consentTextHash: requireSha256(body.consentTextHash, "consentTextHash"),
    consentReference: optionalString(body.consentReference, "consentReference", 150),
    acceptedAt: requireDateTime(body.acceptedAt, "acceptedAt"),
    ipAddress: optionalString(body.ipAddress, "ipAddress", 64),
    userAgentHash:
      body.userAgentHash === null || body.userAgentHash === undefined
        ? null
        : requireSha256(body.userAgentHash, "userAgentHash"),
  };
};

const validateAddress = (input, field, includeSameAsPermanent = false) => {
  const body = requireObject(input, field);
  const result = {
    addressLine1: requiredString(body.addressLine1, `${field}.addressLine1`, 500),
    addressLine2: optionalString(body.addressLine2, `${field}.addressLine2`, 500),
    landmark: optionalString(body.landmark, `${field}.landmark`, 200),
    locality: optionalString(body.locality, `${field}.locality`, 200),
    district: optionalString(body.district, `${field}.district`, 100),
    city: requiredString(body.city, `${field}.city`, 100),
    state: requiredString(body.state, `${field}.state`, 100),
    country: requiredString(body.country, `${field}.country`, 50),
    pincode: requirePincode(body.pincode, `${field}.pincode`),
    source: requiredString(body.source, `${field}.source`, 30),
  };

  if (includeSameAsPermanent) {
    result.sameAsPermanent = requireBoolean(body.sameAsPermanent, `${field}.sameAsPermanent`);
  }

  return result;
};

const validateDetailsPayload = (input) => {
  const body = requireObject(input, "body");
  const customer = requireObject(body.customer, "customer");
  const employment = requireObject(body.employment, "employment");
  const aadhaarKyc = requireObject(body.aadhaarKyc, "aadhaarKyc");
  const evidence = requireObject(body.currentAddressEvidence, "currentAddressEvidence");

  const maskedAadhaar = requiredString(aadhaarKyc.maskedAadhaar, "aadhaarKyc.maskedAadhaar", 20);
  const compactMaskedAadhaar = maskedAadhaar.replace(/[-\s]/g, "");
  if (!/^[Xx*]{8}\d{4}$/.test(compactMaskedAadhaar)) {
    throw new PartnerApiError(
      400,
      "INVALID_MASKED_AADHAAR",
      "aadhaarKyc.maskedAadhaar must contain eight masked characters followed by the last four digits.",
      { field: "aadhaarKyc.maskedAadhaar" },
    );
  }

  const aadhaarStatus = requiredString(aadhaarKyc.status, "aadhaarKyc.status", 20);
  if (aadhaarStatus !== "VERIFIED") {
    throw new PartnerApiError(422, "AADHAAR_NOT_VERIFIED", "Aadhaar KYC must be VERIFIED.");
  }

  const livenessStatus = requiredString(
    evidence.livenessStatus,
    "currentAddressEvidence.livenessStatus",
    20,
  );
  if (livenessStatus !== "VERIFIED") {
    throw new PartnerApiError(422, "LIVENESS_NOT_VERIFIED", "Liveness must be VERIFIED.");
  }

  const permanentAddress = validateAddress(body.permanentAddress, "permanentAddress");
  const currentAddress = validateAddress(body.currentAddress, "currentAddress", true);

  if (currentAddress.sameAsPermanent) {
    const comparableFields = [
      "addressLine1",
      "addressLine2",
      "landmark",
      "locality",
      "district",
      "city",
      "state",
      "country",
      "pincode",
    ];
    const mismatch = comparableFields.some(
      (fieldName) =>
        String(currentAddress[fieldName] || "").trim().toLowerCase() !==
        String(permanentAddress[fieldName] || "").trim().toLowerCase(),
    );
    if (mismatch) {
      throw new PartnerApiError(
        400,
        "CURRENT_ADDRESS_MISMATCH",
        "currentAddress must match permanentAddress when sameAsPermanent is true.",
      );
    }
  }

  return {
    externalApplicationReference: requiredString(
      body.externalApplicationReference,
      "externalApplicationReference",
      100,
    ),
    lan: requiredString(body.lan, "lan", 50),
    detailsVersion: requirePositiveInteger(body.detailsVersion, "detailsVersion"),
    customer: {
      fullName: requiredString(customer.fullName, "customer.fullName", 150),
      firstName: requiredString(customer.firstName, "customer.firstName", 60),
      middleName: optionalString(customer.middleName, "customer.middleName", 60),
      lastName: requiredString(customer.lastName, "customer.lastName", 60),
      fatherName: requiredString(customer.fatherName, "customer.fatherName", 150),
      panNumber: (() => {
        const pan = requiredString(customer.panNumber, "customer.panNumber", 10).toUpperCase();
        if (!PAN_REGEX.test(pan)) {
          throw new PartnerApiError(400, "VALIDATION_ERROR", "customer.panNumber has an invalid PAN format.", {
            field: "customer.panNumber",
          });
        }
        return pan;
      })(),
      dateOfBirth: requireDate(customer.dateOfBirth, "customer.dateOfBirth"),
      gender: optionalString(customer.gender, "customer.gender", 10),
      mobileNumber: requiredString(customer.mobileNumber, "customer.mobileNumber", 20),
      email: optionalString(customer.email, "customer.email", 254),
    },
    employment: {
      employmentType: requiredString(employment.employmentType, "employment.employmentType", 30),
      companyType: optionalString(employment.companyType, "employment.companyType", 50),
      companyName: optionalString(employment.companyName, "employment.companyName", 200),
      designation: optionalString(employment.designation, "employment.designation", 150),
      businessName: optionalString(employment.businessName, "employment.businessName", 200),
      businessConstitution: optionalString(
        employment.businessConstitution,
        "employment.businessConstitution",
        50,
      ),
      monthlyIncome: requiredString(employment.monthlyIncome, "employment.monthlyIncome", 30),
      annualTurnover: optionalString(employment.annualTurnover, "employment.annualTurnover", 30),
      employmentVintage: optionalString(
        employment.employmentVintage,
        "employment.employmentVintage",
        50,
      ),
      businessVintage: optionalString(
        employment.businessVintage,
        "employment.businessVintage",
        50,
      ),
      salaryMode: optionalString(employment.salaryMode, "employment.salaryMode", 50),
      completedAt: requireDateTime(employment.completedAt, "employment.completedAt"),
    },
    aadhaarKyc: {
      status: aadhaarStatus,
      maskedAadhaar,
      verifiedName: requiredString(aadhaarKyc.verifiedName, "aadhaarKyc.verifiedName", 200),
      dateOfBirth:
        aadhaarKyc.dateOfBirth === null || aadhaarKyc.dateOfBirth === undefined
          ? null
          : requireDate(aadhaarKyc.dateOfBirth, "aadhaarKyc.dateOfBirth"),
      gender: optionalString(aadhaarKyc.gender, "aadhaarKyc.gender", 10),
      provider: requiredString(aadhaarKyc.provider, "aadhaarKyc.provider", 50),
      providerReference: requiredString(
        aadhaarKyc.providerReference,
        "aadhaarKyc.providerReference",
        255,
      ),
      verifiedAt: requireDateTime(aadhaarKyc.verifiedAt, "aadhaarKyc.verifiedAt"),
    },
    permanentAddress,
    currentAddress,
    currentAddressEvidence: {
      livePhotoDocumentReference: requiredString(
        evidence.livePhotoDocumentReference,
        "currentAddressEvidence.livePhotoDocumentReference",
        150,
      ),
      livenessProvider: requiredString(
        evidence.livenessProvider,
        "currentAddressEvidence.livenessProvider",
        80,
      ),
      livenessReference: requiredString(
        evidence.livenessReference,
        "currentAddressEvidence.livenessReference",
        150,
      ),
      livenessStatus,
      livenessScore: optionalString(
        evidence.livenessScore,
        "currentAddressEvidence.livenessScore",
        30,
      ),
      evidenceReference: optionalString(
        evidence.evidenceReference,
        "currentAddressEvidence.evidenceReference",
        255,
      ),
      latitude: optionalString(evidence.latitude, "currentAddressEvidence.latitude", 30),
      longitude: optionalString(evidence.longitude, "currentAddressEvidence.longitude", 30),
      capturedAt: requireDateTime(evidence.capturedAt, "currentAddressEvidence.capturedAt"),
      verifiedAt: requireDateTime(evidence.verifiedAt, "currentAddressEvidence.verifiedAt"),
    },
  };
};

const validateDocumentPayload = (input) => {
  const body = requireObject(input, "body");
  const documentType = requiredString(body.documentType, "documentType", 50);
  const mimeType = requiredString(body.mimeType, "mimeType", 100).toLowerCase();

  if (!['AADHAAR_XML', 'AADHAAR_PDF'].includes(documentType)) {
    throw new PartnerApiError(400, "VALIDATION_ERROR", "documentType is not supported.", {
      field: "documentType",
    });
  }

  const allowed =
    documentType === "AADHAAR_PDF"
      ? ["application/pdf"]
      : ["application/xml", "text/xml"];

  if (!allowed.includes(mimeType)) {
    throw new PartnerApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "documentType and mimeType do not match.",
    );
  }

  return {
    externalApplicationReference: requiredString(
      body.externalApplicationReference,
      "externalApplicationReference",
      100,
    ),
    lan: requiredString(body.lan, "lan", 50),
    documentType,
    sourceDocumentId: requiredString(body.sourceDocumentId, "sourceDocumentId", 100),
    fileName: requiredString(body.fileName, "fileName", 255),
    mimeType,
    fileSize: requirePositiveInteger(body.fileSize, "fileSize"),
    fileSha256: requireSha256(body.fileSha256, "fileSha256"),
    contentBase64: requiredString(body.contentBase64, "contentBase64", 5_500_000),
    source: requiredString(body.source, "source", 50),
    capturedAt: requireDateTime(body.capturedAt, "capturedAt"),
  };
};

module.exports = {
  validateCreatePayload,
  validateConsentPayload,
  validateDetailsPayload,
  validateDocumentPayload,
  // simple approve payload validator
  validateApprovePayload: (input) => {
    const body = requireObject(input, "body");
    return {
      externalApplicationReference: requiredString(
        body.externalApplicationReference,
        "externalApplicationReference",
        100,
      ),
      productCode: requiredString(body.productCode, "productCode", 60),
      bureauConsent: {
        reference: requiredString(body.bureauConsent?.reference, "bureauConsent.reference", 150),
        hash: requireSha256(body.bureauConsent?.hash, "bureauConsent.hash"),
      },
      decisionConsent: {
        reference: requiredString(body.decisionConsent?.reference, "decisionConsent.reference", 150),
        hash: requireSha256(body.decisionConsent?.hash, "decisionConsent.hash"),
      },
    };
  },
};
