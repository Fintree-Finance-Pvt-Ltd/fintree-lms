// services/easebuzz/easebuzzMandateService.js

const crypto = require("crypto");

const {
  EASEBUZZ_ENDPOINTS,
  MANDATE_STATUSES,
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

function isPlainObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function getMandateWebhookData(body = {}) {
  if (isPlainObject(body.data)) {
    return body.data;
  }

  if (isPlainObject(body.payload)) {
    return body.payload;
  }

  if (isPlainObject(body.content)) {
    return body.content;
  }

  return isPlainObject(body) ? body : {};
}

function compactSources(...sources) {
  return sources.filter(isPlainObject);
}

function firstField(sources, fields) {
  for (const source of sources) {
    for (const field of fields) {
      const value = source[field];

      if (clean(value)) {
        return clean(value);
      }
    }
  }

  return "";
}

function normalizeNumericId(value) {
  const normalized = clean(value);

  return /^\d+$/.test(normalized)
    ? normalized
    : null;
}

function normalizeUpperText(value) {
  const normalized = clean(value);

  return normalized
    ? normalized.toUpperCase()
    : "";
}

function normalizeAmount(value) {
  const normalized = clean(value);

  if (!normalized) {
    return null;
  }

  const amount = Number(normalized);

  return Number.isFinite(amount) &&
    amount > 0
    ? amount
    : null;
}

function normalizeDateOnly(value) {
  const normalized = clean(value);

  if (!normalized) {
    return null;
  }

  const isoMatch =
    normalized.match(
      /^(\d{4}-\d{2}-\d{2})/,
    );

  if (isoMatch) {
    return isoMatch[1];
  }

  const parsed =
    parseWebhookDate(normalized);

  return parsed
    ? parsed
        .toISOString()
        .slice(0, 10)
    : null;
}

function extractAccountLastFour(value) {
  const normalized =
    clean(value).replace(
      /[^A-Za-z0-9]/g,
      "",
    );

  return normalized
    ? normalized.slice(-4)
    : "";
}

function parseWebhookDate(value) {
  const normalized = clean(value);

  if (!normalized) {
    return null;
  }

  if (/^\d{13}$/.test(normalized)) {
    const date = new Date(Number(normalized));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d{10}$/.test(normalized)) {
    const date = new Date(Number(normalized) * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const ddMmYyyy =
    normalized.match(
      /^(\d{2})-(\d{2})-(\d{4})(?:\s+(.+))?$/,
    );

  if (ddMmYyyy) {
    const [, day, month, year, time = "00:00:00"] =
      ddMmYyyy;

    const date = new Date(
      `${year}-${month}-${day}T${time}`,
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(normalized);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function firstDate(sources, fields) {
  const value = firstField(
    sources,
    fields,
  );

  return parseWebhookDate(value);
}

function includesAny(value, needles) {
  return needles.some((needle) =>
    value.includes(needle),
  );
}

function determineMandateStatus({
  eventName,
  providerStatus,
  linkState,
}) {
  const statusText = [
    eventName,
    providerStatus,
    linkState,
  ]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (!statusText) {
    return MANDATE_STATUSES.UNKNOWN;
  }

  if (
    includesAny(statusText, [
      "cancelled",
      "canceled",
      "revoked",
      "revoke",
    ])
  ) {
    return MANDATE_STATUSES.CANCELLED;
  }

  if (includesAny(statusText, ["expired", "expire"])) {
    return MANDATE_STATUSES.EXPIRED;
  }

  if (
    includesAny(statusText, [
      "authfail",
      "registerfailed",
      "registration_failed",
      "failed",
      "failure",
      "rejected",
      "declined",
      "error",
    ])
  ) {
    return MANDATE_STATUSES.FAILED;
  }

  if (
    includesAny(statusText, [
      "authsuccess",
      "registersuccess",
      "registered",
      "active",
      "authorized",
      "authorised",
      "approved",
      "completed",
      "success",
      "successful",
    ])
  ) {
    return MANDATE_STATUSES.ACTIVE;
  }

  if (
    includesAny(statusText, [
      "submitted",
      "initiated",
      "pending",
      "created",
      "open",
    ])
  ) {
    return MANDATE_STATUSES.LINK_CREATED;
  }

  return MANDATE_STATUSES.UNKNOWN;
}

function getMandateWebhookSources(body = {}) {
  const data =
    getMandateWebhookData(body);

  const mandate =
    data.api_mandate ||
    data.mandate ||
    data.mandate_details ||
    data.mandateDetails ||
    body.api_mandate ||
    body.mandate ||
    {};

  const authDetails =
    data.auth_details ||
    data.authDetails ||
    mandate.auth_details ||
    mandate.authDetails ||
    {};

  const easycollect =
    data.easycollect ||
    data.easy_collect ||
    data.easyCollect ||
    {};

  return {
    data,

    nested:
      compactSources(
        mandate,
        authDetails,
        easycollect,
      ),

    sources:
      compactSources(
        data,
        body,
        mandate,
        authDetails,
        easycollect,
      ),
  };
}

function extractMandateWebhook(body = {}) {
  const {
    data,
    nested,
    sources,
  } = getMandateWebhookSources(body);

  const eventName =
    firstField(
      [body, data],
      [
        "event",
        "type",
        "webhook_type",
        "webhookType",
        "notification_type",
        "notificationType",
      ],
    );

  const transactionId =
    firstField(
      sources,
      [
        "merchant_txn",
        "merchantTxn",
        "merchant_transaction_id",
        "merchantTransactionId",
        "transaction_id",
        "transactionId",
        "txnid",
        "txn_id",
        "txnId",
      ],
    );

  const explicitEasycollectLinkId =
    firstField(
      [data, ...nested],
      [
        "easycollect_link_id",
        "easycollectLinkId",
        "easy_collect_link_id",
        "easyCollectLinkId",
        "easycollect_id",
        "easycollectId",
        "link_id",
        "linkId",
      ],
    );

  const easycollectLinkId =
    normalizeNumericId(
      explicitEasycollectLinkId ||
        firstField(
          [data],
          ["id"],
        ),
    );

  const payloadId =
    firstField(
      [data],
      ["id"],
    );

  const easebuzzMandateId =
    firstField(
      sources,
      [
        "easebuzz_mandate_id",
        "easebuzzMandateId",
        "mandate_id",
        "mandateId",
        "api_mandate_id",
        "apiMandateId",
        "mandate_reference",
        "mandateReference",
      ],
    ) ||
    (
      payloadId &&
      !normalizeNumericId(payloadId)
        ? payloadId
        : ""
    ) ||
    firstField(
      nested,
      ["id"],
    );

  const easebuzzRequestId =
    firstField(
      sources,
      [
        "easebuzz_request_id",
        "easebuzzRequestId",
        "request_id",
        "requestId",
        "unique_request_number",
        "uniqueRequestNumber",
      ],
    );

  const lan =
    firstField(
      sources,
      [
        "lan",
        "LAN",
        "udf1",
        "customer_ref_number",
        "customerRefNumber",
        "customer_reference",
        "customerReference",
        "reference_number",
        "referenceNumber",
      ],
    );

  const providerStatus =
    firstField(
      sources,
      [
        "current_status",
        "currentStatus",
        "mandate_status",
        "mandateStatus",
        "auth_status",
        "authStatus",
        "registration_status",
        "registrationStatus",
        "status",
        "sub_status",
        "subStatus",
        "state",
      ],
    );

  const linkState =
    firstField(
      sources,
      [
        "link_state",
        "linkState",
        "state",
      ],
    );

  const nextStatus =
    determineMandateStatus({
      eventName,
      providerStatus,
      linkState,
    });

  const statusText =
    `${eventName} ${providerStatus}`
      .toLowerCase();

  const now = new Date();

  const mandateSubmittedAt =
    firstDate(
      sources,
      [
        "mandate_submitted_at",
        "mandateSubmittedAt",
        "submitted_at",
        "submittedAt",
        "auth_initiated_at",
        "authInitiatedAt",
      ],
    ) ||
    (statusText.includes("submitted")
      ? now
      : null);

  const authorizedAt =
    firstDate(
      sources,
      [
        "authorized_at",
        "authorizedAt",
        "authorised_at",
        "authorisedAt",
        "registered_at",
        "registeredAt",
        "success_at",
        "successAt",
      ],
    ) ||
    (nextStatus === MANDATE_STATUSES.ACTIVE
      ? now
      : null);

  const failedAt =
    firstDate(
      sources,
      [
        "failed_at",
        "failedAt",
        "failure_at",
        "failureAt",
      ],
    ) ||
    (nextStatus === MANDATE_STATUSES.FAILED
      ? now
      : null);

  const cancelledAt =
    firstDate(
      sources,
      [
        "cancelled_at",
        "cancelledAt",
        "canceled_at",
        "canceledAt",
      ],
    ) ||
    (nextStatus === MANDATE_STATUSES.CANCELLED
      ? now
      : null);

  const revokedAt =
    firstDate(
      sources,
      [
        "revoked_at",
        "revokedAt",
      ],
    ) ||
    (statusText.includes("revoke")
      ? now
      : null);

  const accountLastFour =
    extractAccountLastFour(
      firstField(
        sources,
        [
          "customer_account_number",
          "customerAccountNumber",
          "account_number",
          "accountNumber",
          "holder_account_number",
          "holderAccountNumber",
        ],
      ),
    );

  return {
    eventName,
    transactionId,
    easycollectLinkId,
    easebuzzMandateId,
    easebuzzRequestId,
    lan,
    providerStatus,
    linkState,
    nextStatus,

    umrn:
      firstField(
        sources,
        ["umrn", "UMRN"],
      ),

    mandateType:
      normalizeUpperText(
        firstField(
          sources,
          [
            "mandate_type",
            "mandateType",
            "auto_debit_type",
            "autoDebitType",
          ],
        ),
      ),

    authMode:
      firstField(
        sources,
        [
          "auth_mode",
          "authMode",
        ],
      ),

    amount:
      normalizeAmount(
        firstField(
          sources,
          [
            "amount",
            "max_debit_amount",
            "maxDebitAmount",
          ],
        ),
      ),

    amountRule:
      normalizeUpperText(
        firstField(
          sources,
          [
            "amount_rule",
            "amountRule",
          ],
        ),
      ),

    frequency:
      normalizeUpperText(
        firstField(
          sources,
          ["frequency"],
        ),
      ),

    startDate:
      normalizeDateOnly(
        firstField(
          sources,
          [
            "start_date",
            "startDate",
            "validity_start",
            "validityStart",
          ],
        ),
      ),

    endDate:
      normalizeDateOnly(
        firstField(
          sources,
          [
            "end_date",
            "endDate",
            "final_collection_date",
            "finalCollectionDate",
            "validity_end",
            "validityEnd",
          ],
        ),
      ),

    customerName:
      firstField(
        sources,
        [
          "customer_name",
          "customerName",
          "account_holder_name",
          "accountHolderName",
          "name",
        ],
      ),

    customerEmail:
      firstField(
        sources,
        [
          "customer_email",
          "customerEmail",
          "email",
        ],
      ).toLowerCase(),

    customerPhone:
      firstField(
        sources,
        [
          "customer_phone",
          "customerPhone",
          "phone",
        ],
      ).replace(/\D/g, ""),

    accountLastFour,

    accountType:
      normalizeUpperText(
        firstField(
          sources,
          [
            "customer_account_type",
            "customerAccountType",
            "account_type",
            "accountType",
            "holder_account_type",
            "holderAccountType",
          ],
        ),
      ),

    ifsc:
      normalizeUpperText(
        firstField(
          sources,
          [
            "customer_ifsc",
            "customerIfsc",
            "ifsc",
            "holder_bank_ifsc",
            "holderBankIfsc",
          ],
        ),
      ),

    bankCode:
      normalizeUpperText(
        firstField(
          sources,
          [
            "bank_code",
            "bankCode",
            "holder_bank_code",
            "holderBankCode",
          ],
        ),
      ),

    tpvValidationStatus:
      firstField(
        sources,
        [
          "tpv_validation_status",
          "tpvValidationStatus",
        ],
      ),

    providerEventId:
      firstField(
        [body, data],
        [
          "event_id",
          "eventId",
          "webhook_id",
          "webhookId",
          "notification_id",
          "notificationId",
          "callback_id",
          "callbackId",
        ],
      ),

    mandateSubmittedAt,
    authorizedAt,
    failedAt,
    cancelledAt,
    revokedAt,

    lastErrorCode:
      nextStatus === MANDATE_STATUSES.FAILED
        ? firstField(
            sources,
            [
              "error_code",
              "errorCode",
              "failure_code",
              "failureCode",
              "code",
            ],
          )
        : null,

    lastErrorMessage:
      nextStatus === MANDATE_STATUSES.FAILED
        ? firstField(
            sources,
            [
              "error_message",
              "errorMessage",
              "error_msg",
              "errorMsg",
              "failure_reason",
              "failureReason",
              "message",
              "description",
            ],
          )
        : null,
  };
}

function safeTimingEqual(a, b) {
  const left = Buffer.from(
    String(a),
    "utf8",
  );

  const right = Buffer.from(
    String(b),
    "utf8",
  );

  return (
    left.length === right.length &&
    crypto.timingSafeEqual(left, right)
  );
}

function verifyMandateWebhookSecret(headers = {}) {
  const configuredSecret =
    clean(
      process.env
        .EASEBUZZ_MANDATE_WEBHOOK_SECRET ||
        process.env
          .EASEBUZZ_WEBHOOK_SECRET,
    );

  if (!configuredSecret) {
    return null;
  }

  const authorization =
    clean(headers.authorization)
      .replace(/^Bearer\s+/i, "");

  const receivedSecret =
    clean(
      headers[
        "x-easebuzz-webhook-secret"
      ] ||
        headers[
          "x-webhook-secret"
        ] ||
        headers[
          "x-easebuzz-signature"
        ] ||
        authorization,
    );

  if (!receivedSecret) {
    return false;
  }

  return safeTimingEqual(
    receivedSecret,
    configuredSecret,
  );
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

async function processMandateWebhook(
  body = {},
  headers = {},
) {
  const signatureVerified =
    verifyMandateWebhookSecret(
      headers,
    );

  if (signatureVerified === false) {
    const error = new Error(
      "Invalid Easebuzz mandate webhook signature",
    );

    error.code =
      "EASEBUZZ_WEBHOOK_SIGNATURE_INVALID";

    error.statusCode = 401;

    throw error;
  }

  const webhook =
    extractMandateWebhook(
      body,
    );

  const identifiers = {
    transactionId:
      webhook.transactionId,

    easycollectLinkId:
      webhook.easycollectLinkId,

    easebuzzMandateId:
      webhook.easebuzzMandateId,

    easebuzzRequestId:
      webhook.easebuzzRequestId,

    lan:
      webhook.lan,
  };

  const hasIdentifier =
    Object.values(identifiers)
      .some((value) => clean(value));

  if (!hasIdentifier) {
    return {
      success: true,
      ignored: true,
      reason: "missing_identifier",
    };
  }

  const result =
    await repository.markWebhookUpdate({
      identifiers,

      nextStatus:
        webhook.nextStatus,

      providerStatus:
        webhook.providerStatus ||
        webhook.eventName,

      linkState:
        webhook.linkState,

      easycollectLinkId:
        webhook.easycollectLinkId,

      easebuzzMandateId:
        webhook.easebuzzMandateId,

      easebuzzRequestId:
        webhook.easebuzzRequestId,

      umrn:
        webhook.umrn,

      mandateType:
        webhook.mandateType,

      authMode:
        webhook.authMode,

      amount:
        webhook.amount,

      amountRule:
        webhook.amountRule,

      frequency:
        webhook.frequency,

      startDate:
        webhook.startDate,

      endDate:
        webhook.endDate,

      customerName:
        webhook.customerName,

      customerEmail:
        webhook.customerEmail,

      customerPhone:
        webhook.customerPhone,

      accountLastFour:
        webhook.accountLastFour,

      accountType:
        webhook.accountType,

      ifsc:
        webhook.ifsc,

      bankCode:
        webhook.bankCode,

      tpvValidationStatus:
        webhook.tpvValidationStatus,

      mandateSubmittedAt:
        webhook.mandateSubmittedAt,

      authorizedAt:
        webhook.authorizedAt,

      failedAt:
        webhook.failedAt,

      cancelledAt:
        webhook.cancelledAt,

      revokedAt:
        webhook.revokedAt,

      lastErrorCode:
        webhook.lastErrorCode,

      lastErrorMessage:
        webhook.lastErrorMessage,

      providerEventId:
        webhook.providerEventId,

      signatureVerified,

      payload: {
        received:
          body,

        normalized: {
          eventName:
            webhook.eventName,

          transactionId:
            webhook.transactionId,

          easycollectLinkId:
            webhook.easycollectLinkId,

          easebuzzMandateId:
            webhook.easebuzzMandateId,

          easebuzzRequestId:
            webhook.easebuzzRequestId,

          lan:
            webhook.lan,

          providerStatus:
            webhook.providerStatus,

          linkState:
            webhook.linkState,

          nextStatus:
            webhook.nextStatus,

          umrn:
            webhook.umrn,

          mandateType:
            webhook.mandateType,

          authMode:
            webhook.authMode,

          amount:
            webhook.amount,

          amountRule:
            webhook.amountRule,

          frequency:
            webhook.frequency,

          startDate:
            webhook.startDate,

          endDate:
            webhook.endDate,

          customerName:
            webhook.customerName,

          customerEmail:
            webhook.customerEmail,

          customerPhone:
            webhook.customerPhone,

          accountLastFour:
            webhook.accountLastFour,

          accountType:
            webhook.accountType,

          ifsc:
            webhook.ifsc,

          bankCode:
            webhook.bankCode,

          tpvValidationStatus:
            webhook.tpvValidationStatus,
        },
      },
    });

  if (!result.mandate) {
    return {
      success: true,
      ignored: true,
      reason: "unknown_mandate",
      identifiers,
    };
  }

  return {
    success: true,
    ignored: false,

    mandate: {
      id:
        result.mandate.id,

      lan:
        result.mandate.lan,

      transactionId:
        result.mandate.transaction_id,

      status:
        result.mandate.status,

      providerStatus:
        result.mandate
          .provider_status,

      umrn:
        result.mandate.umrn,
    },

    event: result.event,
  };
}

module.exports = {
  createMerchantTxn,
  buildEasyCollectPayload,
  createEnachAuthorizationLink,
  extractMandateWebhook,
  processMandateWebhook,

  getMandatesForLan: repository.findAllByLan,

  getLatestMandateForLan: repository.findLatestByLan,

  getMandateByTransaction: repository.findByTransactionId,

  getMandateTimeline: repository.findTimeline,
};
