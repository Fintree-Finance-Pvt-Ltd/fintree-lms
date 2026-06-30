import React from "react";
import AllLoans from "../AllLoansScreen";

const RapidMoneyAllLoans = () => (
  <AllLoans
    apiEndpoint="/loan-booking/all-loans?table=loan_booking_switch_my_loan&prefix=SML"
    title="RapidMoney All Loans"
  />
);

export default RapidMoneyAllLoans;
