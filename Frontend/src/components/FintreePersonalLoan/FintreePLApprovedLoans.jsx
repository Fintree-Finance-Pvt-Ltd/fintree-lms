import React from "react";
import ApprovedLoansTable from "../ApprovedLoansScreen";

const FintreePLApprovedLoans = () => (
  <ApprovedLoansTable
    apiUrl="/loan-booking/approved-loans?table=loan_booking_fintree_personal_loan&prefix=PLF"
    title="Fintree Personal Loan Approved Loans"
    lender="Fintree Personal Loan"
  />
);

export default FintreePLApprovedLoans;