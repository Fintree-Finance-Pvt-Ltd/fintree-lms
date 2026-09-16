import React from "react";
import DisbursedLoansTable from "../DisbursedLoansScreen";

const FintreePLDisbursedLoans = () => (
  <DisbursedLoansTable
    apiEndpoint="/loan-booking/disbursed-loans?table=loan_booking_fintree_personal_loan&prefix=PLF"
    title="Fintree Personal Loan Disbursed Loans"
  />
);

export default FintreePLDisbursedLoans;