
import React from "react";
import DisbursedLoansTable from "../DisbursedLoansScreen";

const NiyaraDisbursedLoans = () => {
  return (
    <DisbursedLoansTable
      apiEndpoint="/niyara/disbursed-loans"
      title="Niyara Disbursed Loans"
    />
  );
};

export default NiyaraDisbursedLoans;
