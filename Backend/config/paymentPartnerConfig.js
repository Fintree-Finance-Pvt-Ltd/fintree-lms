const PAYMENT_PARTNER_CONFIG = {

  CAREPAY: {

    lenderName: "CarePay",

    tableName: "loan_booking_carepay",

    lanColumn: "lan",

    customerNameColumn: "customer_name",

    mobileColumn: "mobile_number",

    emailColumn: "email_id",

  },


  SFL: {

    lenderName: "Seven Fincorp",

    tableName: "loan_booking_seven_fincorp",

    lanColumn: "lan",

  },


  SW: {

    lenderName: "Saswat",

    tableName: "loan_booking_saswat",

    lanColumn: "lan",

  },


  LDF: {

    lenderName: "Loan Digit",

    tableName: "loan_booking_loan_digit",

    lanColumn: "lan",

  },

};


module.exports = {
  PAYMENT_PARTNER_CONFIG,
};