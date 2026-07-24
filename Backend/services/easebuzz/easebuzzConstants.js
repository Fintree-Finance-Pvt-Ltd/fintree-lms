// services/easebuzz/easebuzzConstants.js

const EASEBUZZ_ENDPOINTS = Object.freeze({
  EASYCOLLECT_CREATE:
    process.env.EASEBUZZ_EASYCOLLECT_CREATE_URL || "",
});

const ENACH_AUTH_MODES = Object.freeze({
  NETBANKING: "NetBanking",
  DEBIT_CARD: "DebitCard",
});

const ACCOUNT_TYPES = Object.freeze({
  SAVINGS: "SAVINGS",
  CURRENT: "CURRENT",
});

const AMOUNT_RULES = Object.freeze({
  EXACT: "EXACT",
  MAX: "MAX",
});

const ENACH_FREQUENCIES = Object.freeze([
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
  "BIMONTHLY",
  "HALFYEARLY",
  "AS_PRESENTED",
]);

const MANDATE_STATUSES = Object.freeze({
  CREATED: "CREATED",
  LINK_CREATE_PENDING: "LINK_CREATE_PENDING",
  LINK_CREATED: "LINK_CREATED",
  ACTIVE: "ACTIVE",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  UNKNOWN: "UNKNOWN",
});

const MANDATE_EVENT_TYPES = Object.freeze({
  MANDATE_CREATED: "MANDATE_CREATED",
  LINK_CREATE_REQUEST: "LINK_CREATE_REQUEST",
  LINK_CREATE_RESPONSE: "LINK_CREATE_RESPONSE",
  STATUS_RETRIEVE: "STATUS_RETRIEVE",
  WEBHOOK: "WEBHOOK",
  ERROR: "ERROR",
});

const EASYCOLLECT_NOTIFICATION_OPERATIONS =
  Object.freeze([
    Object.freeze({
      type: "sms",
      template: "Default sms template",
    }),

    Object.freeze({
      type: "email",
      template: "Default email template",
    }),

    Object.freeze({
      type: "whatsapp",
      template:
        "Default whatsapp template",
    }),
  ]);

/**
 * Return fresh objects so callers cannot mutate the constants.
 */
function getEasyCollectNotificationOperations() {
  return EASYCOLLECT_NOTIFICATION_OPERATIONS.map(
    (operation) => ({
      ...operation,
    }),
  );
}

module.exports = {
  EASEBUZZ_ENDPOINTS,
  ENACH_AUTH_MODES,
  ACCOUNT_TYPES,
  AMOUNT_RULES,
  ENACH_FREQUENCIES,
  MANDATE_STATUSES,
  MANDATE_EVENT_TYPES,
  EASYCOLLECT_NOTIFICATION_OPERATIONS,
  getEasyCollectNotificationOperations,
};