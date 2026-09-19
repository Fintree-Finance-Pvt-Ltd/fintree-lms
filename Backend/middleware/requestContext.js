const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

const PARTNER_PREFIXES = [
  ["CAREHOS", "CAREPAY"],
  ["CIRHUF", "CIRCLE_PE_HOUSER"],
  ["WCTLFFPL", "WCTL_FFPL"],
  ["GQNONFSF", "GQ_NON_FSF"],
  ["GQFSF", "GQ_FSF"],
  ["HEYBF", "HEYEV_BATTERY"],
  ["HEYB", "HEYEV_BATTERY"],
  ["HEYEV", "HEYEV"],
  ["ADKF", "ADIKOSH"],
  ["FUNFIN", "FUNDIFY"],
  ["FUNDI", "FUNDIFY"],
  ["CLYHOS", "CLAYYO"],
  ["CLYO", "CLAYYO"],
  ["BUNDLR", "BUNDELA"],
  ["SPDLR", "SAMPADA"],
  ["SHDLR", "SRBH"],
  ["ZBDLR", "ZEBRS"],
  ["MCDLR", "MOTION_CORP"],
  ["QML", "QUICK_MONEY"],
  ["RML", "RAPID_MONEY"],
  ["STRL", "STERLION"],
  ["CARE", "CAREPAY"],
  ["FINE", "EMICLUB"],
  ["FINS", "FINCREST"],
  ["LDF", "LOAN_DIGIT"],
  ["LDG", "LOAN_DIGIT"],
  ["LDD", "LOAN_DIGIT"],
  ["HEL", "HELIUM"],
  ["CLY", "CLAYYO"],
  ["ADK", "ADIKOSH"],
  ["CIRF", "CIRCLE_PE"],
  ["FCIR", "CIRCLE_PE"],
  ["TLF", "TERM_LOAN"],
  ["UBL", "STERLION_UBL"],
  ["SW", "SASWAT"],
  ["SH", "SRBH"],
  ["SPL", "SAMPADA"],
  ["MC", "MOTION_CORP"],
];

function requestContextMiddleware(req, _res, next) {
  storage.run(
    {
      req,
      startedAt: Date.now(),
    },
    next,
  );
}

function getRequestContext() {
  return storage.getStore() || null;
}

function firstValue(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length) {
      return firstValue(...value);
    }

    if (value && typeof value === "object") {
      const nestedValue = firstValue(
        value.name,
        value.partner_name,
        value.partnerName,
        value.displayName,
        value.clientCode,
      );

      if (nestedValue) {
        return nestedValue;
      }

      continue;
    }

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return null;
}

function inferPartnerFromReference(...values) {
  const reference = firstValue(...values);

  if (!reference) {
    return null;
  }

  const normalizedReference = reference.toUpperCase();
  const match = PARTNER_PREFIXES.find(([prefix]) =>
    normalizedReference.startsWith(prefix),
  );

  return match ? match[1] : null;
}

function getRequestPartner(defaultPartnerName = "SYSTEM") {
  const req = getRequestContext()?.req;

  if (!req) {
    return {
      partnerId: null,
      partnerName: defaultPartnerName,
    };
  }

  if (req.partner?.name || req.partner?.id) {
    return {
      partnerId: req.partner.id || null,
      partnerName: req.partner.name || defaultPartnerName,
    };
  }

  if (req.partnerClient?.displayName || req.partnerClient?.clientCode) {
    return {
      partnerId: req.partnerClient.id || null,
      partnerName:
        req.partnerClient.displayName ||
        req.partnerClient.clientCode ||
        defaultPartnerName,
    };
  }

  const partnerName = firstValue(
    req.body?.partner_name,
    req.body?.partnerName,
    req.body?.partner,
    req.body?.lender,
    req.query?.partner_name,
    req.query?.partnerName,
    req.query?.partner,
    req.query?.lender,
    req.headers?.["x-partner-name"],
  );

  const inferredPartnerName = inferPartnerFromReference(
    req.params?.lan,
    req.body?.lan,
    req.query?.lan,
    req.params?.partner_loan_id,
    req.params?.partnerLoanId,
    req.body?.partner_loan_id,
    req.body?.partnerLoanId,
    req.query?.partner_loan_id,
    req.query?.partnerLoanId,
  );

  return {
    partnerId: null,
    partnerName: partnerName || inferredPartnerName || defaultPartnerName,
  };
}

function getRequestIdentifiers() {
  const req = getRequestContext()?.req;

  if (!req) {
    return {
      lan: null,
      partnerLoanId: null,
    };
  }

  return {
    lan: firstValue(req.params?.lan, req.body?.lan, req.query?.lan),
    partnerLoanId: firstValue(
      req.params?.partner_loan_id,
      req.params?.partnerLoanId,
      req.body?.partner_loan_id,
      req.body?.partnerLoanId,
      req.query?.partner_loan_id,
      req.query?.partnerLoanId,
    ),
  };
}

module.exports = {
  requestContextMiddleware,
  getRequestContext,
  getRequestPartner,
  getRequestIdentifiers,
};
