import React from "react";
import AllLoansScreen from "../AllLoansScreen";

const SampadaAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint={`/loan-booking/all-loans?table=loan_booking_sampada&prefix=SPL`}
      title="Sampada All Loans"
    />
  );
};

export default SampadaAllLoans;
