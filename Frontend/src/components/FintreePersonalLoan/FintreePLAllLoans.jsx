import React from "react";
import AllLoans from "../AllLoansScreen";

const FintreePLAllLoans = () => (
  <AllLoans
    apiEndpoint="/loan-booking/all-loans?table=loan_booking_fintree_personal_loan&prefix=PLF"
    title="Fintree Personal Loan All Loans"
  />
);

export default FintreePLAllLoans;
