export const PAYMENT_PARTNER_CONFIG = {
  CAREPAY: {
    lenderName: "CarePay",
    tableName: "loan_booking_carepay",
    lanColumn: "lan",
    customerNameColumn: "customer_name",
    mobileColumn: "mobile_number",
    emailColumn: "email_id",
    // Add these only if these columns exist
    // customerNameColumn: "customer_name",
    // mobileColumn: "mobile",
    // emailColumn: "email",
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