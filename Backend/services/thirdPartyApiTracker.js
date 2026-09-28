const axios = require("axios");
const db = require("../config/db");
const {
  getRequestContext,
  getRequestIdentifiers,
  getRequestPartner,
} = require("../middleware/requestContext");

const AXIOS_TRACKED = Symbol.for("fintree.thirdPartyApiTracking");

const BATCH_SIZE = Number(process.env.THIRD_PARTY_API_LOG_BATCH_SIZE || 100);
const FLUSH_INTERVAL_MS = Number(
  process.env.THIRD_PARTY_API_LOG_FLUSH_MS || 1000,
);
const MAX_QUEUE_SIZE = Number(
  process.env.THIRD_PARTY_API_LOG_QUEUE_MAX || 5000,
);

const HOST_VENDOR_RULES = [
  ["digitap", "DIGITAP"],
  ["experian", "EXPERIAN"],
  ["zoop", "ZOOP"],
  ["finanalyz", "FINANALYZ"],
  ["easebuzz", "EASEBUZZ"],
  ["digio", "DIGIO"],
  ["doqfy", "DOQFY"],
  ["trackwizz", "TRACKWIZZ"],
  ["razorpay", "RAZORPAY"],
  ["postalpincode", "POSTAL_PINCODE"],
  ["payu", "PAYU"],
  ["amazonaws", "AWS_S3"],
  ["whatsapp", "WHATSAPP"],
  ["alot", "ALOT_SMS"],
];

let trackerInstalled = false;
let fetchInstalled = false;
let flushLoopStarted = false;
let flushing = false;
let droppedLogCount = 0;
const logQueue = [];

function isTrackingDisabled() {
  return (
    String(process.env.THIRD_PARTY_API_TRACKING_DISABLED || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function truncate(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function formatMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function toDbId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function cleanHeaderValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizePathSegment(segment) {
  if (!segment) {
    return segment;
  }

  if (/^\d+$/.test(segment)) {
    return ":id";
  }

  if (/^[a-f0-9]{16,}$/i.test(segment)) {
    return ":token";
  }

  if (/^[a-z0-9_-]{24,}$/i.test(segment)) {
    return ":token";
  }

  return segment;
}

function normalizePath(pathname) {
  const path = pathname || "/";

  return path
    .split("/")
    .map((segment) => normalizePathSegment(segment))
    .join("/")
    .replace(/\/+/g, "/");
}

function parseUrl(value, baseUrl) {
  const rawUrl = String(value || "").trim();

  if (!rawUrl) {
    return null;
  }

  try {
    return new URL(rawUrl);
  } catch {
    if (!baseUrl) {
      return null;
    }

    try {
      return new URL(rawUrl, baseUrl);
    } catch {
      return null;
    }
  }
}

function isLocalHttpHost(hostname) {
  const host = cleanHeaderValue(hostname);

  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local")
  );
}

function addConfiguredHost(hosts, value) {
  if (!value) {
    return;
  }

  for (const item of String(value).split(",")) {
    const rawHost = item.trim();

    if (!rawHost) {
      continue;
    }

    const parsedUrl = parseUrl(rawHost);
    hosts.add(cleanHeaderValue(parsedUrl?.hostname || rawHost));
  }
}

function getInternalHostsFromEnv() {
  const hosts = new Set();

  addConfiguredHost(hosts, process.env.INTERNAL_API_HOSTS);
  addConfiguredHost(hosts, process.env.APP_HOST);
  addConfiguredHost(hosts, process.env.APP_URL);
  addConfiguredHost(hosts, process.env.FRONTEND_URL);
  addConfiguredHost(hosts, process.env.BACKEND_URL);
  addConfiguredHost(hosts, process.env.API_BASE_URL);

  return hosts;
}

function isCurrentRequestHost(hostname) {
  const requestHost = cleanHeaderValue(
    getRequestContext()?.req?.headers?.host,
  ).split(":")[0];

  return requestHost && cleanHeaderValue(hostname) === requestHost;
}

function isConfiguredInternalHost(hostname) {
  const host = cleanHeaderValue(hostname);

  if (!host) {
    return false;
  }

  return getInternalHostsFromEnv().has(host);
}

function shouldTrackUrl(parsedUrl) {
  if (!parsedUrl) {
    return false;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return false;
  }

  if (
    isLocalHttpHost(parsedUrl.hostname) &&
    String(process.env.THIRD_PARTY_API_TRACK_LOCAL || "")
      .trim()
      .toLowerCase() !== "true"
  ) {
    return false;
  }

  if (
    isCurrentRequestHost(parsedUrl.hostname) ||
    isConfiguredInternalHost(parsedUrl.hostname)
  ) {
    return false;
  }

  return true;
}

function inferVendor(parsedUrl) {
  const host = cleanHeaderValue(parsedUrl?.hostname);

  for (const [needle, vendor] of HOST_VENDOR_RULES) {
    if (host.includes(needle)) {
      return vendor;
    }
  }

  const parts = host.split(".").filter(Boolean);
  const root = parts.length >= 2 ? parts[parts.length - 2] : parts[0];

  return truncate(
    String(root || "UNKNOWN")
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase() || "UNKNOWN",
    100,
  );
}

function buildEndpoint(parsedUrl) {
  if (!parsedUrl) {
    return null;
  }

  return truncate(
    `${parsedUrl.origin}${normalizePath(parsedUrl.pathname || "/")}`,
    255,
  );
}

function buildApiName(method, parsedUrl) {
  return truncate(
    `${String(method || "GET").toUpperCase()} ${normalizePath(
      parsedUrl?.pathname || "/",
    )}`,
    150,
  );
}

function buildMetadata(rawMetadata) {
  if (!rawMetadata || rawMetadata === true) {
    return {};
  }

  if (typeof rawMetadata === "object") {
    return rawMetadata;
  }

  return {};
}

function buildLogRecord({
  method,
  parsedUrl,
  statusCode,
  success,
  durationMs,
  errorMessage = null,
  metadata = {},
}) {
  const hitAt = new Date();
  const requestContext = getRequestContext();
  const defaultPartnerName = requestContext ? "INTERNAL" : "SYSTEM";
  const requestPartner = getRequestPartner(defaultPartnerName);
  const requestIds = getRequestIdentifiers();

  const partnerName =
    metadata.partnerName ||
    metadata.partner_name ||
    requestPartner.partnerName ||
    defaultPartnerName;

  return {
    monthKey: formatMonthKey(hitAt),
    hitAt,
    partnerId: metadata.partnerId || metadata.partner_id || requestPartner.partnerId,
    partnerName: truncate(partnerName, 150),
    vendor: truncate(metadata.vendor || inferVendor(parsedUrl), 100),
    apiName: truncate(
      metadata.apiName || metadata.api_name || buildApiName(method, parsedUrl),
      150,
    ),
    method: truncate(String(method || "GET").toUpperCase(), 10),
    endpoint: buildEndpoint(parsedUrl),
    statusCode,
    success: success ? 1 : 0,
    durationMs,
    lan: truncate(metadata.lan || requestIds.lan, 100),
    partnerLoanId: truncate(
      metadata.partnerLoanId || metadata.partner_loan_id || requestIds.partnerLoanId,
      150,
    ),
    errorMessage: truncate(errorMessage, 500),
  };
}

function enqueueLog(record) {
  if (isTrackingDisabled() || !record?.endpoint) {
    return;
  }

  if (logQueue.length >= MAX_QUEUE_SIZE) {
    droppedLogCount += 1;

    if (droppedLogCount === 1 || droppedLogCount % 100 === 0) {
      console.error("Third-party API tracking queue full; dropping log rows", {
        droppedLogCount,
      });
    }

    return;
  }

  logQueue.push(record);

  if (logQueue.length >= BATCH_SIZE) {
    setImmediate(() => {
      flushLogs().catch((error) => {
        console.error("Third-party API tracking flush failed:", error.message);
      });
    });
  }
}

function buildMonthlyCountRows(batch) {
  const summaryMap = new Map();

  for (const row of batch) {
    const key = [
      row.monthKey,
      row.partnerName || "SYSTEM",
      row.vendor || "UNKNOWN",
    ].join("|");

    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        monthKey: row.monthKey,
        partnerId: row.partnerId || null,
        partnerName: row.partnerName || "SYSTEM",
        apiName: row.vendor || "UNKNOWN",
        totalCount: 0,
        successCount: 0,
        failedCount: 0,
        lastStatusCode: row.statusCode || null,
        lastHitAt: row.hitAt || new Date(),
      });
    }

    const summary = summaryMap.get(key);
    summary.totalCount += 1;

    if (row.success) {
      summary.successCount += 1;
    } else {
      summary.failedCount += 1;
    }

    summary.partnerId = row.partnerId || summary.partnerId;
    summary.lastStatusCode = row.statusCode ?? summary.lastStatusCode;

    if (row.hitAt && row.hitAt > summary.lastHitAt) {
      summary.lastHitAt = row.hitAt;
    }
  }

  return Array.from(summaryMap.values()).map((row) => [
    row.monthKey,
    toDbId(row.partnerId),
    row.partnerName,
    row.apiName,
    row.totalCount,
    row.successCount,
    row.failedCount,
    row.lastStatusCode,
    row.lastHitAt,
  ]);
}

async function upsertMonthlyCounts(batch) {
  const rows = buildMonthlyCountRows(batch);

  if (!rows.length) {
    return;
  }

  await db.promise().query(
    `INSERT INTO third_party_api_usage_counts
     (
       month_key,
       partner_id,
       partner_name,
       api_name,
       total_count,
       success_count,
       failed_count,
       last_status_code,
       last_hit_at
     )
     VALUES ?
     ON DUPLICATE KEY UPDATE
       total_count = total_count + VALUES(total_count),
       success_count = success_count + VALUES(success_count),
       failed_count = failed_count + VALUES(failed_count),
       partner_id = COALESCE(VALUES(partner_id), partner_id),
       last_status_code = VALUES(last_status_code),
       last_hit_at = GREATEST(last_hit_at, VALUES(last_hit_at)),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [rows],
  );
}

async function flushLogs() {
  if (flushing || logQueue.length === 0) {
    return;
  }

  flushing = true;

  try {
    while (logQueue.length > 0) {
      const batch = logQueue.splice(0, BATCH_SIZE);

      await upsertMonthlyCounts(batch);
    }
  } catch (error) {
    console.error("Third-party API tracking insert failed:", error.message);
  } finally {
    flushing = false;
  }
}

function startFlushLoop() {
  if (flushLoopStarted) {
    return;
  }

  flushLoopStarted = true;

  const interval = setInterval(() => {
    flushLogs().catch((error) => {
      console.error("Third-party API tracking flush failed:", error.message);
    });
  }, FLUSH_INTERVAL_MS);

  if (typeof interval.unref === "function") {
    interval.unref();
  }
}

function getAxiosRequestUrl(config) {
  return parseUrl(config?.url, config?.baseURL);
}

function installAxiosInterceptors(instance) {
  if (!instance || instance[AXIOS_TRACKED]) {
    return;
  }

  Object.defineProperty(instance, AXIOS_TRACKED, {
    value: true,
    enumerable: false,
  });

  instance.interceptors.request.use((config) => {
    if (isTrackingDisabled() || config.thirdPartyApi === false) {
      return config;
    }

    const parsedUrl = getAxiosRequestUrl(config);
    if (!shouldTrackUrl(parsedUrl)) {
      return config;
    }

    config.__thirdPartyApiTracking = {
      startedAt: Date.now(),
      parsedUrl,
      method: String(config.method || "GET").toUpperCase(),
      metadata: buildMetadata(config.thirdPartyApi),
    };

    return config;
  });

  instance.interceptors.response.use(
    (response) => {
      const tracking = response?.config?.__thirdPartyApiTracking;

      if (tracking) {
        const statusCode = response.status || null;

        enqueueLog(
          buildLogRecord({
            method: tracking.method,
            parsedUrl: tracking.parsedUrl,
            statusCode,
            success: statusCode >= 200 && statusCode < 400,
            durationMs: Date.now() - tracking.startedAt,
            metadata: tracking.metadata,
          }),
        );
      }

      return response;
    },
    (error) => {
      const config = error?.config || {};
      const tracking = config.__thirdPartyApiTracking;

      if (tracking) {
        const statusCode = error.response?.status || null;

        enqueueLog(
          buildLogRecord({
            method: tracking.method,
            parsedUrl: tracking.parsedUrl,
            statusCode,
            success: false,
            durationMs: Date.now() - tracking.startedAt,
            errorMessage: error.message,
            metadata: tracking.metadata,
          }),
        );
      }

      return Promise.reject(error);
    },
  );
}

function installFetchTracking() {
  if (fetchInstalled || typeof globalThis.fetch !== "function") {
    return;
  }

  fetchInstalled = true;
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function trackedFetch(input, init = {}) {
    if (isTrackingDisabled() || init?.thirdPartyApi === false) {
      return originalFetch(input, init);
    }

    const rawUrl =
      typeof input === "string" || input instanceof URL ? input : input?.url;
    const parsedUrl = parseUrl(rawUrl);
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    const metadata = buildMetadata(init?.thirdPartyApi);

    const cleanInit =
      init && Object.prototype.hasOwnProperty.call(init, "thirdPartyApi")
        ? { ...init }
        : init;

    if (cleanInit && Object.prototype.hasOwnProperty.call(cleanInit, "thirdPartyApi")) {
      delete cleanInit.thirdPartyApi;
    }

    if (!shouldTrackUrl(parsedUrl)) {
      return originalFetch(input, cleanInit);
    }

    const startedAt = Date.now();

    try {
      const response = await originalFetch(input, cleanInit);

      enqueueLog(
        buildLogRecord({
          method,
          parsedUrl,
          statusCode: response.status || null,
          success: response.ok,
          durationMs: Date.now() - startedAt,
          metadata,
        }),
      );

      return response;
    } catch (error) {
      enqueueLog(
        buildLogRecord({
          method,
          parsedUrl,
          statusCode: null,
          success: false,
          durationMs: Date.now() - startedAt,
          errorMessage: error.message,
          metadata,
        }),
      );

      throw error;
    }
  };
}

function installThirdPartyApiTracking() {
  if (trackerInstalled) {
    return;
  }

  trackerInstalled = true;
  installAxiosInterceptors(axios);

  const originalCreate = axios.create.bind(axios);
  axios.create = function createTrackedAxiosInstance(...args) {
    const instance = originalCreate(...args);
    installAxiosInterceptors(instance);
    return instance;
  };

  installFetchTracking();
  startFlushLoop();
}

async function ensureThirdPartyApiUsageTable() {
  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS third_party_api_usage_counts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      month_key CHAR(7) NOT NULL,
      partner_id BIGINT UNSIGNED NULL,
      partner_name VARCHAR(150) NOT NULL,
      api_name VARCHAR(100) NOT NULL,
      total_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
      success_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
      failed_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
      last_status_code INT NULL,
      last_hit_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uk_month_partner_api (month_key, partner_name, api_name),
      KEY idx_partner_month (partner_name, month_key),
      KEY idx_api_month (api_name, month_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = {
  installThirdPartyApiTracking,
  ensureThirdPartyApiUsageTable,
  flushLogs,
};
