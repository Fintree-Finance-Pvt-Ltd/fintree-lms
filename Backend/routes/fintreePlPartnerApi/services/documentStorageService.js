const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { PartnerApiError } = require("../utils/partnerApiError");

const MAX_ORIGINAL_BYTES = 3_670_016;

const strictDecodeBase64 = (value) => {
  if (typeof value !== "string" || !value.length) {
    throw new PartnerApiError(400, "INVALID_BASE64", "contentBase64 is required.");
  }

  if (/\s/.test(value) || value.length % 4 !== 0) {
    throw new PartnerApiError(400, "INVALID_BASE64", "contentBase64 is invalid.");
  }

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new PartnerApiError(400, "INVALID_BASE64", "contentBase64 is invalid.");
  }

  let bytes;
  try {
    bytes = Buffer.from(value, "base64");
  } catch {
    throw new PartnerApiError(400, "INVALID_BASE64", "contentBase64 is invalid.");
  }

  const canonicalInput = value.replace(/=+$/, "");
  const canonicalOutput = bytes.toString("base64").replace(/=+$/, "");
  if (canonicalInput !== canonicalOutput) {
    throw new PartnerApiError(400, "INVALID_BASE64", "contentBase64 is invalid.");
  }

  return bytes;
};

const validateSignature = (bytes, documentType, mimeType) => {
  if (documentType === "AADHAAR_PDF") {
    if (mimeType !== "application/pdf") {
      throw new PartnerApiError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "AADHAAR_PDF requires application/pdf.",
      );
    }

    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new PartnerApiError(
        415,
        "INVALID_DOCUMENT_SIGNATURE",
        "The decoded file is not a valid PDF.",
      );
    }
    return ".pdf";
  }

  if (documentType === "AADHAAR_XML") {
    if (!["application/xml", "text/xml"].includes(mimeType)) {
      throw new PartnerApiError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "AADHAAR_XML requires application/xml or text/xml.",
      );
    }

    const beginning = bytes
      .subarray(0, Math.min(bytes.length, 1024))
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .trimStart();

    if (!beginning.startsWith("<")) {
      throw new PartnerApiError(
        415,
        "INVALID_DOCUMENT_SIGNATURE",
        "The decoded file is not valid XML.",
      );
    }
    return ".xml";
  }

  throw new PartnerApiError(400, "UNSUPPORTED_DOCUMENT_TYPE", "Document type is unsupported.");
};

async function prepareDocument(payload) {
  const bytes = strictDecodeBase64(payload.contentBase64);

  if (bytes.length > MAX_ORIGINAL_BYTES) {
    throw new PartnerApiError(
      413,
      "DOCUMENT_TOO_LARGE",
      "The decoded original document exceeds 3.5 MiB.",
    );
  }

  if (bytes.length !== payload.fileSize) {
    throw new PartnerApiError(
      400,
      "DOCUMENT_SIZE_MISMATCH",
      "fileSize does not match the decoded byte length.",
    );
  }

  const calculatedHash = crypto.createHash("sha256").update(bytes).digest("hex");
  if (calculatedHash !== payload.fileSha256.toLowerCase()) {
    throw new PartnerApiError(
      400,
      "DOCUMENT_HASH_MISMATCH",
      "fileSha256 does not match the decoded document bytes.",
    );
  }

  const extension = validateSignature(bytes, payload.documentType, payload.mimeType);

  return {
    bytes,
    calculatedHash,
    extension,
  };
}

async function persistPreparedDocument({ partnerApplicationId, documentType, prepared }) {
  const root = path.resolve(
    process.env.PL_PARTNER_DOCUMENT_ROOT ||
      path.join(process.cwd(), "uploads", "pl_partner_documents"),
  );

  const applicationFolder = path.join(root, String(partnerApplicationId));
  await fs.mkdir(applicationFolder, { recursive: true });

  const generatedName = `${documentType.toLowerCase()}-${crypto.randomUUID()}${prepared.extension}`;
  const finalPath = path.join(applicationFolder, generatedName);
  const tempPath = `${finalPath}.tmp`;

  const resolvedFolder = path.resolve(applicationFolder);
  const resolvedFinal = path.resolve(finalPath);
  if (!resolvedFinal.startsWith(`${resolvedFolder}${path.sep}`)) {
    throw new PartnerApiError(400, "INVALID_DOCUMENT_PATH", "Document path is invalid.");
  }

  await fs.writeFile(tempPath, prepared.bytes, { flag: "wx" });
  await fs.rename(tempPath, finalPath);

  return {
    absolutePath: finalPath,
    relativePath: path.relative(root, finalPath).replace(/\\/g, "/"),
  };
}

async function removeStoredDocument(absolutePath) {
  if (!absolutePath) return;
  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to remove rolled-back partner document:", {
        message: error.message,
      });
    }
  }
}

module.exports = {
  MAX_ORIGINAL_BYTES,
  prepareDocument,
  persistPreparedDocument,
  removeStoredDocument,
};
