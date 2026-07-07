import React from "react";
import ApprovedLoansTable from "../ApprovedLoansScreen";

const WCTLFFPLApprovedLoans = () => (
  <ApprovedLoansTable
    apiUrl="/loan-booking/approved-loans?table=loan_booking_wctl_ffpl&prefix=WCTLFFPL"
    title="WCTL FFPL Approved Loans"
    lender="WCTL FFPL"
  />
);

export default WCTLFFPLApprovedLoans;
