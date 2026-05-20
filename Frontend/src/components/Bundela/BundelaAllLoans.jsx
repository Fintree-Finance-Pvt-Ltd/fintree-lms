import React from "react";
import AllLoansScreen from "../AllLoansScreen";

const BundelaAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint={`/loan-booking/all-loans?table=loan_booking_bundela&prefix=BUNDL`}
      title="Bundela All Loans"
    />
  );
};

export default BundelaAllLoans;