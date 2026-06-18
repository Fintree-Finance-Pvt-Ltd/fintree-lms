import React from "react";
import AllLoansScreen from "../AllLoansScreen";

const SRBHAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint={`/loan-booking/all-loans?table=loan_booking_srbh&prefix=SH`}
      title="SRBH All Loans"
    />
  );
};

export default SRBHAllLoans;
