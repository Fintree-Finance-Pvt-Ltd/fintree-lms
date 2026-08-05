class PartnerApiError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = "PartnerApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

module.exports = { PartnerApiError };
