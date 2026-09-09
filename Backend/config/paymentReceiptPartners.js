const path = require("path");

const PARTNER_CONFIG = {
  SASWAT: {
    partnerCode: "SASWAT",

    partnerName: "Saswat",

    /* =====================================================
       RECEIPT COMPANY DETAILS
    ===================================================== */

    legalName: "Fintree Finance Pvt. Ltd.",

    branchName: "Mumbai",

    branchAddress:
      "Engineering Centre, 4th Floor, 9 Matthew Road, Opera House, Mumbai - 400004",

    email: "wecare@fintreefinance.com",

    gstin: "27AACCF5878N1ZW",

    cin: "U65923MH2015PTC264997",

    location: "Mumbai",

    /* =====================================================
       FINTREE LOGO
    ===================================================== */

    logoPath: path.join(
      __dirname,
      "../../Frontend/src/assets/fintree_logo.png"
    ),

    /* =====================================================
       SASWAT LOAN TABLE
    ===================================================== */

    bookingTable: "loan_booking_saswat",

    lanColumn: "lan",

    customerNameColumn: "customer_name",

    loanAccountColumn: "loan_account_number",

    addressColumn: "current_address",

    alternateAddressColumn: "permanent_address",

    lenderColumn: "lender",

    productColumn: "product",

    lenderTypeColumn: "lender_type",

    /* =====================================================
       RECEIPT
    ===================================================== */

    receiptPrefix: "FTF",

    headerAccount: "South Indian Bank",

    accountHead: "Installment (LAP)",
  },
};

module.exports = PARTNER_CONFIG;