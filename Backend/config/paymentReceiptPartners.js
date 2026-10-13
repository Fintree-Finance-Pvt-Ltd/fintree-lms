const path = require("path");

// const PARTNER_CONFIG = {
//   SASWAT: {
//     partnerCode: "SASWAT",

//     partnerName: "Saswat",

//     /* =====================================================
//        RECEIPT COMPANY DETAILS
//     ===================================================== */

//     legalName: "Fintree Finance Pvt. Ltd.",

//     branchName: "Mumbai",

//     branchAddress:
//       "Engineering Centre, 4th Floor, 9 Matthew Road, Opera House, Mumbai - 400004",

//     email: "wecare@fintreefinance.com",

//     gstin: "27AACCF5878N1ZW",

//     cin: "U65923MH2015PTC264997",

//     location: "Mumbai",

//     /* =====================================================
//        FINTREE LOGO
//     ===================================================== */

//     logoPath: path.join(
//       __dirname,
//       "../../Frontend/src/assets/fintree_logo.png"
//     ),

//     /* =====================================================
//        SASWAT LOAN TABLE
//     ===================================================== */

//     bookingTable: "loan_booking_saswat",

//     lanColumn: "lan",

//     customerNameColumn: "customer_name",

//     loanAccountColumn: "loan_account_number",

//     addressColumn: "current_address",

//     alternateAddressColumn: "permanent_address",

//     lenderColumn: "lender",

//     productColumn: "product",

//     lenderTypeColumn: "lender_type",

//     /* =====================================================
//        RECEIPT
//     ===================================================== */

//     receiptPrefix: "FTF",

//     headerAccount: "South Indian Bank",

//     accountHead: "Installment (LAP)",
//   },
  
// };


/* ============================================================
   COMMON FINTREE RECEIPT DETAILS
============================================================ */

const COMMON_RECEIPT_CONFIG = {
  legalName: "Fintree Finance Pvt. Ltd.",

  branchName: "Mumbai",

  branchAddress:
    "Engineering Centre, 4th Floor, 9 Matthew Road, Opera House, Mumbai - 400004",

  email: "wecare@fintreefinance.com",

  gstin: "27AACCF5878N1ZW",

  cin: "U65923MH2015PTC264997",

  location: "Mumbai",

  logoPath: path.join(
    __dirname,
    "../../Frontend/src/assets/fintree_logo.png"
  ),

  receiptPrefix: "FTF",

  headerAccount: "South Indian Bank",

  accountHead: "Installment (LAP)",
};



/* ============================================================
   PARTNER CONFIG
============================================================ */

const PARTNER_CONFIG = {


  /* =========================================================
     SASWAT
  ========================================================= */

  SASWAT: {
    ...COMMON_RECEIPT_CONFIG,

    partnerCode: "SASWAT",

    partnerName: "Saswat",

    bookingTable:
      "loan_booking_saswat",

    lanColumn:
      "lan",

    customerNameColumn:
      "customer_name",

    loanAccountColumn:
      "loan_account_number",

    addressColumn:
      "current_address",

    alternateAddressColumn:
      "permanent_address",

    lenderColumn:
      "lender",

    productColumn:
      "product",

    lenderTypeColumn:
      "lender_type",
  },


  /* =========================================================
     SEVEN FINCORP
  ========================================================= */

  SEVEN_FINCORP: {
    ...COMMON_RECEIPT_CONFIG,

    partnerCode: "SEVEN_FINCORP",

    partnerName: "Seven Fincorp",

    bookingTable:
      "loan_booking_seven_fincorp",

    lanColumn:
      "lan",

    customerNameColumn:
      "customer_name",

    /*
      Seven Fincorp does not have
      loan_account_number.

      Use LAN as loan account number.
    */
    loanAccountColumn:
      "lan",

    /*
      Actual Seven Fincorp address columns.
    */
    addressColumn:
      "permanent_address_line_1",

    alternateAddressColumn:
      "permanent_address_line_2",

    lenderColumn:
      "lender",

    productColumn:
      "product",

    lenderTypeColumn:
      "lender_type",
  },


  /* =========================================================
     MOTION CORP
  ========================================================= */

  MOTION_CORP: {
    ...COMMON_RECEIPT_CONFIG,

    partnerCode: "MOTION_CORP",

    partnerName: "Motion Corp",

    bookingTable:
      "loan_booking_motion_corp",

    lanColumn:
      "lan",

    customerNameColumn:
      "customer_name",

    /*
      Motion Corp also does not have
      loan_account_number.

      Use LAN as loan account number.
    */
    loanAccountColumn:
      "lan",

    /*
      Actual Motion Corp address columns.
    */
    addressColumn:
      "permanent_address_line_1",

    alternateAddressColumn:
      "permanent_address_line_2",

    lenderColumn:
      "lender",

    productColumn:
      "product",

    lenderTypeColumn:
      "lender_type",
  },

};

module.exports = PARTNER_CONFIG;