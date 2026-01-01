/**
 * ======================================================
 * LAN Helper – Single Source of Truth
 * ======================================================
 * ✔ Case-insensitive
 * ✔ Trims whitespace
 * ✔ Safe for null / undefined
 * ✔ Used by customer, pdf, esign, and API routes
 */

/**
 * Normalize LAN
 * @param {string} lan
 * @returns {string}
 */
function normalizeLan(lan = "") {
  return String(lan).trim().toUpperCase();
}

/**
 * Check if LAN belongs to Zypay Customer flow
 * Zypay customer LAN format:
 *   ZypF1000xxxxx
 *
 * @param {string} lan
 * @returns {boolean}
 */
function isCustomerLan(lan = "") {
  const s = normalizeLan(lan);
  return s.startsWith("ZYPF");
}

/**
 * Check if LAN belongs to Helium flow
 *
 * @param {string} lan
 * @returns {boolean}
 */
function isHeliumLan(lan = "") {
  const s = normalizeLan(lan);
  return s.startsWith("HEL");
}

/**
 * Get loan context (tables + template)
 * @param {string} lan
 * @returns {object}
 */
function getLoanContext(lan = "") {
  if (isCustomerLan(lan)) {
    return {
      type: "CUSTOMER",
      summaryTable: "customer_loan_summary",
      rpsTable: "loan_rps_customer",
      bookingTable: "loan_booking_zypay_customer",
      agreementTemplate: "Customer_Aggrement_Zypay.html"
    };
  }

  if (isHeliumLan(lan)) {
    return {
      type: "HELIUM",
      summaryTable: "helium_loan_summary",
      rpsTable: "loan_rps_helium",
      bookingTable: "loan_booking_helium",
      agreementTemplate: "helium_agreement.html"
    };
  }

  throw new Error(`Unknown LAN format: ${lan}`);
}

module.exports = {
  normalizeLan,
  isCustomerLan,
  isHeliumLan,
  getLoanContext
};
