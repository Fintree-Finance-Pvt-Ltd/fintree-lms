import React from "react";
import DisbursedLoansTable from "../DisbursedLoansScreen";

const WCTLFFPLDisbursedLoans = () => (
  <DisbursedLoansTable
    apiEndpoint="/loan-booking/disbursed-loans?table=loan_booking_wctl_ffpl&prefix=WCTLFFPL"
    title="WCTL FFPL Disbursed Loans"
  />
);

export default WCTLFFPLDisbursedLoans;
