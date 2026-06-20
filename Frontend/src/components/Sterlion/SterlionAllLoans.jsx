import React from "react";
import AllLoansScreen from "../AllLoansScreen";

const SterlionAllLoans = () => (
  <AllLoansScreen
    apiEndpoint="/loan-booking/all-loans?table=loan_booking_sterlion&prefix=STRL"
    title="Sterlion All Loans"
  />
);

export default SterlionAllLoans;
