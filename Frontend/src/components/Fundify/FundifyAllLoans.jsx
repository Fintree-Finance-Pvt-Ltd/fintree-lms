import React from "react";
import AllLoansScreen from "../AllLoansScreen";

const FundifyAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint={`/fundify/all-loans?prefix=FUN`}
      title="Fundify All Loans"
    />
  );
};

export default FundifyAllLoans;
