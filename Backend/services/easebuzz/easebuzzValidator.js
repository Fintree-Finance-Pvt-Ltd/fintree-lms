// services/easebuzz/easebuzzValidator.js

const {
  ENACH_AUTH_MODES,
  ACCOUNT_TYPES,
  AMOUNT_RULES,
  ENACH_FREQUENCIES,
} = require("./easebuzzConstants");

function clean(value) {
  return String(value ?? "").trim();
}

function validationError(message, field = null) {
  const error = new Error(message);

  error.code = "EASEBUZZ_VALIDATION_ERROR";
  error.statusCode = 400;

  if (field) {
    error.field = field;
  }

  return error;
}

function required(value, field) {
  const normalized = clean(value);

  if (!normalized) {
    throw validationError(
      `${field} is required`,
      field,
    );
  }

  return normalized;
}

function validateLan(value) {
  const lan = required(value, "lan");

  if (lan.length > 64) {
    throw validationError(
      "lan cannot exceed 64 characters",
      "lan",
    );
  }

  return lan;
}

function validateMerchantTxn(value) {
  const merchantTxn = required(
    value,
    "merchantTxn",
  );

  if (
    !/^[A-Za-z0-9_-]{1,40}$/.test(
      merchantTxn,
    )
  ) {
    throw validationError(
      "merchantTxn must be 1-40 characters using letters, numbers, underscore or hyphen",
      "merchantTxn",
    );
  }

  return merchantTxn;
}

function validateName(value) {
  const name = required(
    value,
    "name",
  ).replace(/\s+/g, " ");

  if (
    name.length < 2 ||
    name.length > 100
  ) {
    throw validationError(
      "name must be between 2 and 100 characters",
      "name",
    );
  }

  return name;
}

function validatePhone(value) {
  const phone = clean(value).replace(
    /\D/g,
    "",
  );

  if (!/^\d{10}$/.test(phone)) {
    throw validationError(
      "phone must be a 10-digit number",
      "phone",
    );
  }

  return phone;
}

function validateEmail(value) {
  const email = clean(value).toLowerCase();

  if (
    email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email,
    )
  ) {
    throw validationError(
      "email is invalid",
      "email",
    );
  }

  return email;
}

function validateMoney(value, field) {
  const raw = required(value, field);

  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw validationError(
      `${field} must have at most two decimal places`,
      field,
    );
  }

  const amount = Number(raw);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw validationError(
      `${field} must be greater than zero`,
      field,
    );
  }

  return {
    number: amount,
    text: amount.toFixed(2),
  };
}

function parseIsoDate(value, field) {
  const normalized = required(
    value,
    field,
  );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      normalized,
    )
  ) {
    throw validationError(
      `${field} must be YYYY-MM-DD`,
      field,
    );
  }

  const [year, month, day] = normalized
    .split("-")
    .map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw validationError(
      `${field} is invalid`,
      field,
    );
  }

  return {
    normalized,
    date,
  };
}

function getTodayInIndia() {
  const parts = new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  ).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = Number(
        part.value,
      );
    }
  }

  return new Date(
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
    ),
  );
}

function validateDate(
  value,
  field,
  requiredField = true,
) {
  if (!requiredField && !clean(value)) {
    return null;
  }

  const parsed = parseIsoDate(
    value,
    field,
  );

  if (parsed.date < getTodayInIndia()) {
    throw validationError(
      `${field} cannot be in the past`,
      field,
    );
  }

  return parsed.normalized;
}

function toDdMmYyyy(isoDate) {
  const [year, month, day] =
    isoDate.split("-");

  return `${day}-${month}-${year}`;
}

function validateUdf(value, field) {
  const udf = clean(value);

  if (udf.length > 255) {
    throw validationError(
      `${field} cannot exceed 255 characters`,
      field,
    );
  }

  if (
    udf &&
    !/^[A-Za-z0-9 ]*$/.test(udf)
  ) {
    throw validationError(
      `${field} allows only letters, numbers and spaces`,
      field,
    );
  }

  return udf;
}

function validateOperations(
  value,
  email,
) {
  const operations = Array.isArray(value)
    ? value
    : [];

  const allowed = new Set([
    "sms",
    "email",
    "whatsapp",
  ]);

  const seen = new Set();

  const normalized = operations.map(
    (operation) => {
      const type = clean(
        operation?.type,
      ).toLowerCase();

      if (!allowed.has(type)) {
        throw validationError(
          "operation type must be sms, email or whatsapp",
          "operation",
        );
      }

      if (seen.has(type)) {
        throw validationError(
          `duplicate ${type} operation`,
          "operation",
        );
      }

      seen.add(type);

      return {
        type,

        template:
          clean(operation?.template) ||
          `Default ${type} template`,
      };
    },
  );

  if (
    seen.has("email") &&
    !email
  ) {
    throw validationError(
      "email is required when email operation is selected",
      "email",
    );
  }

  return normalized;
}

function validateCreateEnachLinkInput(
  input = {},
) {
  const lan = validateLan(input.lan);

  const merchantTxn =
    validateMerchantTxn(
      input.merchantTxn,
    );

  const name = validateName(input.name);
  const phone = validatePhone(
    input.phone,
  );

  const email = validateEmail(
    input.email,
  );

  /*
   * The supplied documentation says this payment amount is ₹1.
   * The sample request says 10.00, but the sample response returns
   * 1.00. Keep it fixed until Easebuzz confirms otherwise.
   */
  const linkAmount = validateMoney(
    input.linkAmount ?? "1.00",
    "linkAmount",
  );

  if (linkAmount.text !== "1.00") {
    throw validationError(
      "linkAmount must be 1.00 for the current eNACH link flow",
      "linkAmount",
    );
  }

  const maxDebitAmount = validateMoney(
    input.maxDebitAmount,
    "maxDebitAmount",
  );

  const finalCollectionDate =
    validateDate(
      input.finalCollectionDate,
      "finalCollectionDate",
    );

  const expiryDate = validateDate(
    input.expiryDate,
    "expiryDate",
    false,
  );

  const accountNumber = required(
    input.accountNumber,
    "accountNumber",
  );

  if (
    !/^[A-Za-z0-9]{4,34}$/.test(
      accountNumber,
    )
  ) {
    throw validationError(
      "accountNumber is invalid",
      "accountNumber",
    );
  }

  const accountType = required(
    input.accountType,
    "accountType",
  ).toUpperCase();

  if (
    !Object.values(
      ACCOUNT_TYPES,
    ).includes(accountType)
  ) {
    throw validationError(
      "accountType must be SAVINGS or CURRENT",
      "accountType",
    );
  }

  const ifsc = required(
    input.ifsc,
    "ifsc",
  ).toUpperCase();

  if (
    !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(
      ifsc,
    )
  ) {
    throw validationError(
      "ifsc is invalid",
      "ifsc",
    );
  }

  const bankCode = required(
    input.bankCode,
    "bankCode",
  ).toUpperCase();

  if (!/^[A-Z]{4}$/.test(bankCode)) {
    throw validationError(
      "bankCode must contain exactly four uppercase letters",
      "bankCode",
    );
  }

  const authModeInput = required(
    input.authMode,
    "authMode",
  ).toLowerCase();

  const authModeMap = {
    netbanking:
      ENACH_AUTH_MODES.NETBANKING,

    debitcard:
      ENACH_AUTH_MODES.DEBIT_CARD,

    debit_card:
      ENACH_AUTH_MODES.DEBIT_CARD,
  };

  const authMode =
    authModeMap[authModeInput];

  if (!authMode) {
    throw validationError(
      "authMode must be NetBanking or DebitCard",
      "authMode",
    );
  }

  const amountRule = required(
    input.amountRule ?? "MAX",
    "amountRule",
  ).toUpperCase();

  if (
    !Object.values(
      AMOUNT_RULES,
    ).includes(amountRule)
  ) {
    throw validationError(
      "amountRule must be EXACT or MAX",
      "amountRule",
    );
  }

  const frequency = required(
    input.frequency,
    "frequency",
  ).toUpperCase();

  if (
    !ENACH_FREQUENCIES.includes(
      frequency,
    )
  ) {
    throw validationError(
      `frequency must be one of ${ENACH_FREQUENCIES.join(
        ", ",
      )}`,
      "frequency",
    );
  }

  const message =
    clean(input.message) ||
    "ENACH Mandate Authorization";

  return {
    lan,
    merchantTxn,
    name,
    phone,
    email,

    linkAmount:
      linkAmount.text,

    maxDebitAmount:
      maxDebitAmount.number,

    finalCollectionDate,

    finalCollectionDateProvider:
      toDdMmYyyy(
        finalCollectionDate,
      ),

    expiryDate,

    expiryDateProvider:
      expiryDate
        ? toDdMmYyyy(expiryDate)
        : "",

    accountNumber,
    accountType,
    ifsc,
    bankCode,
    authMode,
    amountRule,
    frequency,
    message,

    udf1: validateUdf(
      input.udf1,
      "udf1",
    ),

    udf2: validateUdf(
      input.udf2,
      "udf2",
    ),

    udf3: validateUdf(
      input.udf3,
      "udf3",
    ),

    udf4: validateUdf(
      input.udf4,
      "udf4",
    ),

    udf5: validateUdf(
      input.udf5,
      "udf5",
    ),

    operation: validateOperations(
      input.operation,
      email,
    ),
  };
}

function getAccountLastFour(
  accountNumber,
) {
  const normalized = clean(
    accountNumber,
  );

  return normalized
    ? normalized.slice(-4)
    : null;
}

module.exports = {
  clean,
  validationError,
  validateLan,
  validateMerchantTxn,
  validateCreateEnachLinkInput,
  getAccountLastFour,
};