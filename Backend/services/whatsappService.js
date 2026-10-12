/**
 * whatsappService.js
 *
 * WhatsApp Business Cloud API / Alots.io integration service.
 * Handles document upload and template messaging with robust error handling
 * and credential redaction.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");

/**
 * Redact sensitive tokens and credentials from logs and strings.
 */
function redactSecrets(input) {
  if (!input) return input;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  let str = typeof input === "object" ? JSON.stringify(input) : String(input);
  if (token && token.length > 5) {
    str = str.split(token).join("[REDACTED_ACCESS_TOKEN]");
  }
  // Also redact any Bearer tokens
  str = str.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]");
  return typeof input === "object" ? JSON.parse(str) : str;
}

/**
 * Format Indian / International mobile numbers for WhatsApp API.
 * Ensures 10-digit Indian numbers are prefixed with 91.
 */
function formatWhatsAppNumber(mobile) {
  if (!mobile) return "";
  const cleaned = String(mobile).replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }
  return cleaned;
}

/**
 * Parse single or multiple mobile numbers from string or array.
 * Supports comma, semicolon, space or newline delimited numbers.
 * e.g. "918010878231, 918355930723, 919930899999"
 *
 * @param {string|string[]} input
 * @returns {string[]} Array of formatted unique WhatsApp numbers
 */
function parseWhatsAppNumbers(input) {
  if (!input) return [];
  const rawList = Array.isArray(input) ? input : String(input).split(/[,;\s\n\r]+/);
  const formatted = rawList
    .map((num) => formatWhatsAppNumber(String(num || "").trim()))
    .filter((num) => num && num.length >= 10);
  return Array.from(new Set(formatted));
}

/**
 * Mask mobile number for safe responses and logs.
 * e.g. "919876543210" -> "9198****3210"
 */
function maskPhoneNumber(mobile) {
  if (!mobile) return "unknown";
  if (Array.isArray(mobile)) {
    return mobile.map(m => maskPhoneNumber(m)).join(", ");
  }
  const str = String(mobile);
  if (str.includes(",")) {
    return str.split(",").map(m => maskPhoneNumber(m.trim())).join(", ");
  }
  if (str.length <= 6) return "***";
  const start = str.slice(0, 4);
  const end = str.slice(-4);
  return `${start}****${end}`;
}

/**
 * Get current WhatsApp configuration from environment variables.
 */
function getWhatsAppConfig() {
  const baseUrl = (process.env.WHATSAPP_API_BASE_URL || "https://alots.io").replace(/\/+$/, "");
  const apiVersion = (process.env.WHATSAPP_API_VERSION || "v23.0").replace(/^\/+/, "");
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || "653172951223151").trim();
  const wabaId = (process.env.WHATSAPP_WABA_ID || "2769475950109615").trim();
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const adminNumbers = parseWhatsAppNumbers(process.env.WHATSAPP_ADMIN_NUMBER || "");
  const adminNumber = adminNumbers[0] || ""; // Backward-compatibility
  const templateName = (process.env.WHATSAPP_CASE_COUNT_TEMPLATE || "casecount").trim();
  const imageTemplateName = (process.env.WHATSAPP_DISBURSEMENT_IMAGE_TEMPLATE || "casecount").trim();
  const timeoutMs = parseInt(process.env.WHATSAPP_REQUEST_TIMEOUT, 10) || 30000;
  const templateLang = (process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en").trim();

  return {
    baseUrl,
    apiVersion,
    phoneNumberId,
    wabaId,
    accessToken,
    adminNumber,
    adminNumbers,
    templateName,
    imageTemplateName,
    timeoutMs,
    templateLang,
  };
}

/**
 * Upload a document (e.g. Excel) to WhatsApp Cloud API / Alots.io.
 * Endpoint: POST {baseUrl}/{apiVersion}/{phoneNumberId}/media
 *
 * @param {string} filePath - Absolute path to the local document file
 * @param {string} fileName - File name to present in WhatsApp
 * @returns {Promise<{ mediaId: string, rawResponse: any }>}
 */
async function uploadWhatsAppDocument(filePath, fileName) {
  const config = getWhatsAppConfig();

  if (!config.accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is not configured in environment variables.");
  }

  if (!config.phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is not configured in environment variables.");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File to upload not found at path: ${filePath}`);
  }

  const uploadUrl = `${config.baseUrl}/${config.apiVersion}/${config.phoneNumberId}/media`;
  const fileBuffer = fs.readFileSync(filePath);

  const ext = path.extname(filePath).toLowerCase();
  let mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".png") {
    mimeType = "image/png";
  } else if (ext === ".jpg" || ext === ".jpeg") {
    mimeType = "image/jpeg";
  } else if (ext === ".pdf") {
    mimeType = "application/pdf";
  }

  // Using Node.js native Blob and FormData (available in modern Node runtimes)
  const fileBlob = new Blob([fileBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("type", mimeType);
  formData.append("file", fileBlob, fileName || path.basename(filePath));

  console.log(`[WhatsAppService] Uploading document to: ${config.baseUrl}/${config.apiVersion}/${config.phoneNumberId}/media (file: ${fileName}, mime: ${mimeType})`);

  try {
    const response = await axios.post(uploadUrl, formData, {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
      timeout: config.timeoutMs,
    });

    const mediaId = response.data?.id || response.data?.media_id || response.data?.data?.id;

    if (!mediaId) {
      throw new Error(`Media upload succeeded but no media ID returned. Response: ${JSON.stringify(redactSecrets(response.data))}`);
    }

    console.log(`[WhatsAppService] Media uploaded successfully. Media ID: ${mediaId}`);
    return {
      mediaId: String(mediaId),
      rawResponse: response.data,
    };
  } catch (error) {
    const safeErrorMsg = error.response?.data
      ? JSON.stringify(redactSecrets(error.response.data))
      : error.message;
    console.error("[WhatsAppService] Error uploading WhatsApp media:", redactSecrets(safeErrorMsg));
    const err = new Error(`WhatsApp media upload failed: ${safeErrorMsg}`);
    err.statusCode = error.response?.status || 500;
    err.apiResponse = error.response?.data ? redactSecrets(error.response.data) : null;
    throw err;
  }
}

/**
 * Send the approved WhatsApp template with attached document header.
 * Endpoint: POST {baseUrl}/{apiVersion}/{phoneNumberId}/messages
 *
 * @param {object} options
 * @param {string} options.recipientNumber - Destination mobile number
 * @param {string} options.mediaId - WhatsApp media ID of uploaded document
 * @param {string} options.filename - Filename to display on the document card
 * @param {string} [options.templateName] - Template name (default: countofcase)
 * @param {string} [options.languageCode] - Language code (default: en)
 * @returns {Promise<{ success: boolean, messageId: string, rawResponse: any }>}
 */
async function sendDocumentTemplateMessage({
  recipientNumber,
  mediaId,
  filename,
  templateName,
  languageCode,
}) {
  const config = getWhatsAppConfig();

  if (!config.accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is not configured in environment variables.");
  }

  const to = formatWhatsAppNumber(recipientNumber || config.adminNumber);
  if (!to) {
    throw new Error("Recipient WhatsApp number is missing.");
  }

  const tName = templateName || config.templateName || "casecount";
  let lang = languageCode || config.templateLang || "en";

  const messageUrl = `${config.baseUrl}/${config.apiVersion}/${config.phoneNumberId}/messages`;
  const isImageTemplate =
    tName === "casecount" || (filename && /\.(png|jpg|jpeg)$/i.test(filename));

  const makePayload = (code) => {
    const components = [
      {
        type: "header",
        parameters: [
          isImageTemplate
            ? {
                type: "image",
                image: {
                  id: mediaId,
                },
              }
            : {
                type: "document",
                document: {
                  id: mediaId,
                  filename: filename,
                },
              },
        ],
      },
    ];

    if (isImageTemplate) {
      components.push({
        type: "body",
        parameters: [],
      });
    }

    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: tName,
        language: {
          code,
        },
        components,
      },
      biz_opaque_callback_data: `casecount_${Date.now()}`,
    };
  };

  console.log(`[WhatsAppService] Sending template '${tName}' (${lang}) to ${maskPhoneNumber(to)} with media ID: ${mediaId}`);

  try {
    const response = await axios.post(messageUrl, makePayload(lang), {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: config.timeoutMs,
    });

    const messageId = response.data?.messages?.[0]?.id;
    console.log(`[WhatsAppService] Template message sent successfully. Message ID: ${messageId || "N/A"}`);

    return {
      success: true,
      messageId: messageId || null,
      rawResponse: response.data,
    };
  } catch (error) {
    // If language "en" failed with template not existing in language, try fallback to "en_US" or vice versa
    const errData = error.response?.data?.error || error.response?.data;
    const isLangMismatch =
      errData &&
      (errData.code === 132000 ||
        (errData.message && errData.message.toLowerCase().includes("language")));

    if (isLangMismatch && (lang === "en" || lang === "en_US")) {
      const fallbackLang = lang === "en" ? "en_US" : "en";
      console.warn(`[WhatsAppService] Language '${lang}' failed. Retrying with fallback '${fallbackLang}'...`);
      try {
        const retryRes = await axios.post(messageUrl, makePayload(fallbackLang), {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json",
          },
          timeout: config.timeoutMs,
        });
        const messageId = retryRes.data?.messages?.[0]?.id;
        console.log(`[WhatsAppService] Template message sent successfully with '${fallbackLang}'. Message ID: ${messageId || "N/A"}`);
        return {
          success: true,
          messageId: messageId || null,
          rawResponse: retryRes.data,
        };
      } catch (retryErr) {
        // Fall through to primary error logging
      }
    }

    const safeErrorMsg = error.response?.data
      ? JSON.stringify(redactSecrets(error.response.data))
      : error.message;
    console.error("[WhatsAppService] Error sending WhatsApp template:", redactSecrets(safeErrorMsg));
    const err = new Error(`WhatsApp template send failed: ${safeErrorMsg}`);
    err.statusCode = error.response?.status || 500;
    err.apiResponse = error.response?.data ? redactSecrets(error.response.data) : null;
    throw err;
  }
}

/**
 * Upload an image (PNG/JPEG) to WhatsApp Cloud API / Alots.io.
 * Endpoint: POST {baseUrl}/{apiVersion}/{phoneNumberId}/media
 *
 * @param {string} filePath - Absolute path to the local PNG file
 * @param {string} fileName - File name to present in WhatsApp
 * @returns {Promise<{ mediaId: string, rawResponse: any }>}
 */
async function uploadWhatsAppImage(filePath, fileName) {
  const config = getWhatsAppConfig();

  if (!config.accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is not configured in environment variables.");
  }

  if (!config.phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is not configured in environment variables.");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Image file to upload not found at path: ${filePath}`);
  }

  const uploadUrl = `${config.baseUrl}/${config.apiVersion}/${config.phoneNumberId}/media`;
  const fileBuffer = fs.readFileSync(filePath);
  const mimeType = "image/png";

  const fileBlob = new Blob([fileBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("type", mimeType);
  formData.append("file", fileBlob, fileName || path.basename(filePath));

  console.log(`[WhatsAppService] Uploading image to: ${config.baseUrl}/${config.apiVersion}/${config.phoneNumberId}/media (file: ${fileName})`);

  try {
    const response = await axios.post(uploadUrl, formData, {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
      timeout: config.timeoutMs,
    });

    const mediaId = response.data?.id || response.data?.media_id || response.data?.data?.id;

    if (!mediaId) {
      throw new Error(`Image upload succeeded but no media ID returned. Response: ${JSON.stringify(redactSecrets(response.data))}`);
    }

    console.log(`[WhatsAppService] Image uploaded successfully. Media ID: ${mediaId}`);
    return {
      mediaId: String(mediaId),
      rawResponse: response.data,
    };
  } catch (error) {
    const safeErrorMsg = error.response?.data
      ? JSON.stringify(redactSecrets(error.response.data))
      : error.message;
    console.error("[WhatsAppService] Error uploading WhatsApp image media:", redactSecrets(safeErrorMsg));
    const err = new Error(`WhatsApp image upload failed: ${safeErrorMsg}`);
    err.statusCode = error.response?.status || 500;
    err.apiResponse = error.response?.data ? redactSecrets(error.response.data) : null;
    throw err;
  }
}

/**
 * Send an approved WhatsApp template with attached IMAGE header and optional date body parameter.
 * Endpoint: POST {baseUrl}/{apiVersion}/{phoneNumberId}/messages
 *
 * @param {object} options
 * @param {string} options.recipientNumber - Destination mobile number
 * @param {string} options.mediaId - WhatsApp media ID of uploaded image
 * @param {string} [options.templateName] - Template name (default: casecount)
 * @param {string} [options.languageCode] - Language code (default: en)
 * @param {string} [options.dateText] - Date string for {{1}} body parameter (if template requires it)
 * @param {string} [options.callbackData] - Optional biz_opaque_callback_data
 * @returns {Promise<{ success: boolean, messageId: string, rawResponse: any }>}
 */
async function sendImageTemplateMessage({
  recipientNumber,
  mediaId,
  templateName,
  languageCode,
  dateText,
  callbackData,
}) {
  const config = getWhatsAppConfig();

  if (!config.accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is not configured in environment variables.");
  }

  const to = formatWhatsAppNumber(recipientNumber || config.adminNumber);
  if (!to) {
    throw new Error("Recipient WhatsApp number is missing.");
  }

  const tName = templateName || config.imageTemplateName || config.templateName || "casecount";
  let lang = languageCode || config.templateLang || "en";

  const messageUrl = `${config.baseUrl}/${config.apiVersion}/${config.phoneNumberId}/messages`;

  const makePayload = (code, includeBodyParam = true) => {
    const hasBodyParam = Boolean(includeBodyParam && dateText && tName !== "casecount");
    const components = [
      {
        type: "header",
        parameters: [
          {
            type: "image",
            image: {
              id: mediaId,
            },
          },
        ],
      },
      {
        type: "body",
        parameters: hasBodyParam
          ? [
              {
                type: "text",
                text: String(dateText),
              },
            ]
          : [],
      },
    ];

    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: tName,
        language: {
          code: code,
        },
        components,
      },
      biz_opaque_callback_data: callbackData || `casecount_${Date.now()}`,
    };
  };

  console.log(`[WhatsAppService] Sending image template '${tName}' (${lang}) to ${maskPhoneNumber(to)} with media ID: ${mediaId}${dateText && tName !== "casecount" ? ` (date: ${dateText})` : ""}`);

  const postMessage = async (payload) => {
    return axios.post(messageUrl, payload, {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: config.timeoutMs,
    });
  };

  try {
    const response = await postMessage(makePayload(lang, true));
    const messageId = response.data?.messages?.[0]?.id;
    console.log(`[WhatsAppService] Image template message sent successfully. Message ID: ${messageId || "N/A"}`);

    return {
      success: true,
      messageId: messageId || null,
      rawResponse: response.data,
    };
  } catch (error) {
    const errData = error.response?.data?.error || error.response?.data;
    const errMsg = errData?.message || error.message || "";
    const isParamMismatch = errMsg.toLowerCase().includes("number of parameters") || errData?.code === 132000;
    const isLangMismatch =
      errMsg.toLowerCase().includes("language") ||
      (errData?.code === 132000 && (lang === "en" || lang === "en_US"));

    // Retry 1: If parameter mismatch and we sent body param, try without body param
    if (isParamMismatch && dateText) {
      console.warn(`[WhatsAppService] Template parameter mismatch detected. Retrying '${tName}' without body parameters...`);
      try {
        const retryRes = await postMessage(makePayload(lang, false));
        const messageId = retryRes.data?.messages?.[0]?.id;
        console.log(`[WhatsAppService] Image template message sent without body parameter. Message ID: ${messageId || "N/A"}`);
        return {
          success: true,
          messageId: messageId || null,
          rawResponse: retryRes.data,
        };
      } catch (retryParamErr) {
        // Fall through
      }
    }

    // Retry 2: Language mismatch fallback (en <-> en_US)
    if (isLangMismatch && (lang === "en" || lang === "en_US")) {
      const fallbackLang = lang === "en" ? "en_US" : "en";
      console.warn(`[WhatsAppService] Language '${lang}' failed. Retrying image template with fallback '${fallbackLang}'...`);
      try {
        const retryRes = await postMessage(makePayload(fallbackLang, Boolean(dateText)));
        const messageId = retryRes.data?.messages?.[0]?.id;
        console.log(`[WhatsAppService] Image template sent successfully with '${fallbackLang}'. Message ID: ${messageId || "N/A"}`);
        return {
          success: true,
          messageId: messageId || null,
          rawResponse: retryRes.data,
        };
      } catch (retryLangErr) {
        // Fall through
      }
    }

    const safeErrorMsg = error.response?.data
      ? JSON.stringify(redactSecrets(error.response.data))
      : error.message;
    console.error("[WhatsAppService] Error sending WhatsApp image template:", redactSecrets(safeErrorMsg));
    const err = new Error(`WhatsApp image template send failed: ${safeErrorMsg}`);
    err.statusCode = error.response?.status || 500;
    err.apiResponse = error.response?.data ? redactSecrets(error.response.data) : null;
    throw err;
  }
}

module.exports = {
  getWhatsAppConfig,
  formatWhatsAppNumber,
  parseWhatsAppNumbers,
  maskPhoneNumber,
  redactSecrets,
  uploadWhatsAppDocument,
  sendDocumentTemplateMessage,
  uploadWhatsAppImage,
  sendImageTemplateMessage,
};
