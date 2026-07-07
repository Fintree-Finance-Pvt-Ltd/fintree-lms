import React from "react";
import AllLoans from "../AllLoansScreen";

const WCTLFFPLAllLoans = () => (
  <AllLoans
    apiEndpoint="/loan-booking/all-loans?table=loan_booking_wctl_ffpl&prefix=WCTLFFPL"
    title="WCTL FFPL All Loans"
  />
);

export default WCTLFFPLAllLoans;
