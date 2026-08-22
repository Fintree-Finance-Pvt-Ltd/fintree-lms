import React from "react";
import DisbursedLoansTable from "../DisbursedLoansScreen";

const SampadaDisbursed = () => {
  return (
    <DisbursedLoansTable
      apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_sampada&prefix=SPL`}
      title="Sampada Disbursed Loans"
    />
  );
};

export default SampadaDisbursed;
