import React from "react";
import AllLoansScreen from "../AllLoansScreen";

const SevenFinCorpAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint={`/loan-booking/all-loans?table=loan_booking_seven_fincorp&prefix=SFL`}
      title="Seven FinCorp All Loans"
    />
  );
};

export default SevenFinCorpAllLoans;
