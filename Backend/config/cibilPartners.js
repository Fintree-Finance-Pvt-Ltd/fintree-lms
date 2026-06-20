const  partnerConfigByPrefix  = {
  LDF: {
    partner: "loan_digit",
    table: "loan_booking_loan_digit",
    reportTable: "loan_cibil_reports",
    scoreColumn: "fintree_cibil_score",
    pendingWhere: "fintree_cibil_score IS NULL",
    orderBy: "lan DESC",

    mapRow: (row) => ({
      lan: row.lan,
      firstName: row.first_name,
      lastName: row.last_name,
      gender: row.gender,
      dob: row.dob,
      panNumber: row.pan_number,
      loanAmount: row.loan_amount,
      loanTenure: row.loan_tenure,
      mobileNumber: row.mobile_number,
      address: row.current_address,
      city: row.current_village_city,
      state: row.current_state,
      pincode: row.current_pincode,
    }),
  },

  // Add emiclub 
  FINE: {
    partner: "emiclub",
    table: "loan_booking_emiclub",
    reportTable: "loan_cibil_reports",
    scoreColumn: "cibil_score",
    pendingWhere: "cibil_score IS NULL",
    orderBy: "id DESC",

    mapRow: (row) => ({
      lan: row.lan,
      firstName: row.first_name,
      lastName: row.last_name,
      gender: row.gender,
      dob: row.dob,
      panNumber: row.pan_number,
      loanAmount: row.loan_amount,
      loanTenure: row.loan_tenure,
      mobileNumber: row.mobile_number,
      address: row.current_address,
      city: row.current_village_city,
      state: row.state,
      pincode: row.pincode,
    }),
  },
  // Add helium
  HEL: {
    partner: "helium",
    table: "loan_booking_helium",
    reportTable: "loan_cibil_reports",
    scoreColumn: "cibil_score",
    pendingWhere: "cibil_score IS NULL",
    orderBy: "id DESC",

    mapRow: (row) => ({
      lan: row.lan,
      firstName: row.first_name,
      lastName: row.last_name,
      gender: row.gender,
      dob: row.dob,
      panNumber: row.pan_number,
      loanAmount: row.loan_amount,
      loanTenure: row.loan_tenure,
      mobileNumber: row.mobile_number,
      address: row.current_address,
      city: row.current_village_city,
      state: row.current_state,
      pincode: row.current_pincode,
    }),
  },
  // Add new partner here
  CLY : {
    partner: "clayyo",
    table: "loan_booking_clayyo",
    reportTable: "loan_cibil_reports",
    scoreColumn: "cibil_score",
    pendingWhere: "cibil_score IS NULL",
    orderBy: "id DESC",

    mapRow: (row) => ({
      lan: row.lan,
      firstName: row.first_name,
      lastName: row.last_name,
      gender: row.gender,
      dob: row.dob,
      panNumber: row.pan_number,
      loanAmount: row.loan_amount,
      loanTenure: row.loan_tenure,
      mobileNumber: row.mobile_number,
      address: row.current_address,
      city: row.current_village_city,
      state: row.current_state,
      pincode: row.pincode,
    }),
  },
};

module.exports = partnerConfigByPrefix;