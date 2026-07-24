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

function isClayyoLan(lan = "") {
  const s = normalizeLan(lan);
  return s.startsWith("CLY") || s.startsWith("CLAY") || s.startsWith("CLO");
}

/**
 * Check if LAN belongs to Motion Corp flow
 *
 * @param {string} lan
 * @returns {boolean}
 */
function isMotionCorpLan(lan = "") {
  const s = normalizeLan(lan);
  return s.startsWith("MCL");
}


function isClaimCureBuddyLan(lan = "") {
  const s = normalizeLan(lan);
  return s.startsWith("CCB");
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

const CLAIM_CURE_BUDDY_CONTEXT = {
  type: "CLAIM_CURE_BUDDY",

  summaryTable: "claim_cure_buddy_loan_summary",

  // Bullet product: repayment row comes from summary table
  rpsTable: null,

  bookingTable: "loan_booking_claim_cure_buddy",

  coApplicantTable: "claim_cure_buddy_co_applicants",

  agreementTemplate: "claimCureBuddyAggrement.html",

  bulletRepayment: true,

  // Borrower comes from the booking table
  esignParties: [
    {
      role: "BORROWER",
      required: true,
      name: "customer_name",
      email: "email",
      mobile: "mobile_number",

      sign_position: "DRAG_DROP",

      position_details: {
        ALL: [
          {
            x1: 51,
            x2: 126,
            y1: 85,
            y2: 130,
          },
        ],
      },
    },
  ],
};

function getLoanContext(lan = "") {
  if (isCustomerLan(lan)) {
    return {
      type: "CUSTOMER",
      summaryTable: "customer_loan_summary",
      rpsTable: "loan_rps_customer",
      bookingTable: "loan_booking_zypay_customer",
      agreementTemplate: "Customer_Aggrement_Zypay.html",
      // Applicant only
      esignParties: [
        {
          role: "APPLICANT",
          required: true,
          name: "customer_name",
          email: "email_id",
          mobile: "mobile_number",
        },
      ],
    };
  }

  if (isClayyoLan(lan)) {
    return {
      type: "CLAYYO",
      summaryTable: "clayyo_loan_summary",
      rpsTable: "loan_rps_clayyo",
      bookingTable: "loan_booking_clayyo",
      agreementTemplate: "Clayyo_Agreement.html",

      // Applicant only
      esignParties: [
        {
          role: "APPLICANT",
          required: true,
          name: "customer_name",
          email: "email_id",
          mobile: "mobile_number",
        },
      ],
    };
  }
  if (isHeliumLan(lan)) {
    return {
      type: "HELIUM",
      summaryTable: "helium_loan_summary",
      rpsTable: "loan_rps_helium",
      bookingTable: "loan_booking_helium",
      agreementTemplate: "helium_agreement.html",
      // Applicant only
      esignParties: [
        {
          role: "APPLICANT",
          required: true,
          name: "customer_name",
          email: "email_id",
          mobile: "mobile_number",
        },
      ],
    };
  }

  if (isClaimCureBuddyLan(lan)) {
  return CLAIM_CURE_BUDDY_CONTEXT;
}

  if (isMotionCorpLan(lan)) {
    return {
      type: "MOTION_CORP",
      summaryTable: "motioncorp_loan_summary",
      rpsTable: "loan_rps_motioncorp",
      bookingTable: "loan_booking_motion_corp",
      agreementTemplate: "Motion_Corp_EV_Full_Agreement.html",
      // Applicant only
      esignParties: [
        {
          role: "BORROWER",
          required: true,
          name: "customer_name",
          email: "email",
          mobile: "mobile_number",
          sign_position: "DRAG_DROP",
          position_details: {
            ALL: [
              {
                x1: 51,
                x2: 126,
                y1: 85,
                y2: 130,
              },
            ],
          },
        },
        {
          role: "CO_APPLICANT",
          required: false,
          name: "co_applicant_name",
          email: "co_applicant_email",
          mobile: "co_applicant_mobile",
          sign_position: "DRAG_DROP",
          position_details: {
            ALL: [
              {
                x1: 191,
                x2: 266,
                y1: 84,
                y2: 129,
              },
            ],
          },
        },
        {
          role: "GUARANTOR",
          required: false,
          name: "guarantor_name",
          email: "guarantor_email",
          mobile: "guarantor_mobile",
          sign_position: "DRAG_DROP",
          position_details: {
            ALL: [
              {
                x1: 328,
                x2: 403,
                y1: 85,
                y2: 130,
              },
            ],
          },
        },
      ],
    };
  }



  throw new Error(`Unknown LAN format: ${lan}`);
}

module.exports = {
  normalizeLan,
  isCustomerLan,
  isClayyoLan,
  isHeliumLan,
  isMotionCorpLan,
  isClaimCureBuddyLan,
  CLAIM_CURE_BUDDY_CONTEXT,
  getLoanContext,
};
