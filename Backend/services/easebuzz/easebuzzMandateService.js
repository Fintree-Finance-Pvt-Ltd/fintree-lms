// services/easebuzz/easebuzzMandateService.js

const crypto = require("crypto");

const {
  EASEBUZZ_ENDPOINTS,
  getEasyCollectNotificationOperations,
} = require("./easebuzzConstants");

const {
  getEasebuzzCredentials,
  generateEasyCollectHash,
} = require("./easebuzzCrypto");

const {
  clean,
  validateLan,
  validateMerchantTxn,
  validateCreateEnachLinkInput,
  getAccountLastFour,
} = require("./easebuzzValidator");

const { createEnachLink, sanitizeEasebuzzData } = require("./easebuzzClient");

const repository = require("./easebuzzMandateRepository");

function createMerchantTxn(lan) {
  const safeLan =
    clean(lan)
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 15) || "LAN";

  const random = crypto.randomBytes(7).toString("hex").toUpperCase();

  return `EC_${safeLan}_${random}`.slice(0, 40);
}

function buildEasyCollectPayload(validated) {
  const {
    merchantKey,
    merchantSalt,
    subMerchantId,
  } = getEasebuzzCredentials();

  const payload = {
    merchant_txn:
      validated.merchantTxn,

    key: merchantKey,

    email:
      validated.email,

    name:
      validated.name,

    amount:
      validated.linkAmount,

    phone:
      validated.phone,

    udf1:
      validated.udf1,

    udf2:
      validated.udf2,

    udf3:
      validated.udf3,

    udf4:
      validated.udf4,

    udf5:
      validated.udf5,

    message:
      validated.message,

    is_auto_debit_link:
      true,

    is_auto_debit_seamless:
      true,

    auth_details: {
      max_debit_amount:
        validated.maxDebitAmount,

      auto_debit_type:
        "ENACH",

      final_collection_date:
        validated.finalCollectionDateProvider,

      holder_account_number:
        validated.accountNumber,

      holder_account_type:
        validated.accountType,

      holder_bank_ifsc:
        validated.ifsc,

      /*
       * Easebuzz expects holder_bank_code.
       */
      holder_bank_code:
        validated.bankCode,

      auth_mode:
        validated.authMode,

      amount_rule:
        validated.amountRule,

      frequency:
        validated.frequency,
    },

    operation:
      validated.operation,
  };

  if (
    validated.expiryDateProvider
  ) {
    payload.expiry_date =
      validated.expiryDateProvider;
  }

  if (subMerchantId) {
    payload.sub_merchant_id =
      subMerchantId;
  }

  payload.hash =
    generateEasyCollectHash({
      merchantKey,
      merchantSalt,

      merchantTxn:
        payload.merchant_txn,

      name:
        payload.name,

      email:
        payload.email,

      phone:
        payload.phone,

      amount:
        payload.amount,

      udf1:
        payload.udf1,

      udf2:
        payload.udf2,

      udf3:
        payload.udf3,

      udf4:
        payload.udf4,

      udf5:
        payload.udf5,

      message:
        payload.message,
    });

  return payload;
}

async function createEnachAuthorizationLink(input = {}) {
  if (!EASEBUZZ_ENDPOINTS.EASYCOLLECT_CREATE) {
    const error = new Error(
      "EASEBUZZ_EASYCOLLECT_CREATE_URL is not configured",
    );

    error.code = "EASEBUZZ_CONFIGURATION_ERROR";

    error.statusCode = 500;

    throw error;
  }

  const lan = validateLan(input.lan);

  const merchantTxn = input.merchantTxn
    ? validateMerchantTxn(input.merchantTxn)
    : createMerchantTxn(lan);

  const validated = validateCreateEnachLinkInput({
    ...input,
    lan,
    merchantTxn,
    operation: getEasyCollectNotificationOperations(),
  });

  const createdBy = input.createdBy ?? null;

  const payload =
  buildEasyCollectPayload(validated);

  /*
   * You should keep your LAN lock/duplicate-check logic from the
   * previous repository revision.
   */
const mandate =
  await repository.withLanInitiationLock(
    lan,
    async () => {
      const existing =
        await repository
          .findLatestByLan(lan);

      if (
        existing &&
        [
          "CREATED",
          "LINK_CREATE_PENDING",
          "LINK_CREATED",
          "ACTIVE",
          "UNKNOWN",
        ].includes(
          existing.status,
        )
      ) {
        const error = new Error(
          "An Easebuzz mandate link already exists or is being processed for this LAN",
        );

        error.code =
          "EASEBUZZ_MANDATE_ALREADY_EXISTS";

        error.statusCode = 409;

        error.existingTransactionId =
          existing.transaction_id;

        error.existingStatus =
          existing.status;

        throw error;
      }

      return repository.createAttempt({
        lan,

        transactionId:
          merchantTxn,

        name:
          validated.name,

        email:
          validated.email,

        phone:
          validated.phone,

        linkAmount:
          validated.linkAmount,

        maxDebitAmount:
          validated.maxDebitAmount,

        finalCollectionDate:
          validated.finalCollectionDate,

        expiryDate:
          validated.expiryDate,

        frequency:
          validated.frequency,

        amountRule:
          validated.amountRule,

        authMode:
          validated.authMode,

        accountLastFour:
          getAccountLastFour(
            validated.accountNumber,
          ),

        accountType:
          validated.accountType,

        ifsc:
          validated.ifsc,

        bankCode:
          validated.bankCode,

        message:
          validated.message,

        createdBy,
      });
    },
  );

  try {
    await repository.markLinkPending(
      merchantTxn,

      sanitizeEasebuzzData(payload),

      createdBy,
    );

    const result = await createEnachLink(payload);

    await repository.markLinkCreated(merchantTxn, {
      providerData: result.data,

      sanitizedResponse: result.sanitizedResponse,

      providerHttpStatus: result.providerHttpStatus,

      updatedBy: createdBy,
    });

    return {
      success: true,

      mandateId: mandate.id,

      lan,

      merchantTxn,

      status: "LINK_CREATED",

      easycollectLinkId: result.data.id,

      providerState: result.data.state,

      paymentUrl: result.data.payment_url,

      shortUrl: result.data.short_url || null,

      message: result.message || "Link created successfully",
    };
  } catch (error) {
    await repository.markError(merchantTxn, {
      unknown: Boolean(error.unknownResult),

      errorCode: error.code,

      errorMessage: error.message,

      providerHttpStatus: error.providerHttpStatus,

      response: error.providerResponse,

      updatedBy: createdBy,
    });

    error.lan = lan;
    error.transactionId = merchantTxn;

    throw error;
  }
}

module.exports = {
  createMerchantTxn,
  buildEasyCollectPayload,
  createEnachAuthorizationLink,

  getMandatesForLan: repository.findAllByLan,

  getLatestMandateForLan: repository.findLatestByLan,

  getMandateByTransaction: repository.findByTransactionId,

  getMandateTimeline: repository.findTimeline,
};
