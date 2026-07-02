import React from "react";
import ApprovedLoansTable from "../ApprovedLoansScreen";

const RapidMoneyApprovedLoans = () => (
  <ApprovedLoansTable
    apiUrl="/loan-booking/approved-loans?table=loan_booking_switch_my_loan&prefix=SML"
    title="RapidMoney Approved Loans"
    lender="RapidMoney"
  />
);

export default RapidMoneyApprovedLoans;
