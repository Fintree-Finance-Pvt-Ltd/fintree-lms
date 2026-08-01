import React from "react";
import AllLoansScreen from "../AllLoansScreen";

const SterlionUBLAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint="/loan-booking/all-loans?table=loan_booking_sterlion_ubl&prefix=UBLF"
      title="Sterlion UBL All Loans"
    />
  );
};

export default SterlionUBLAllLoans;