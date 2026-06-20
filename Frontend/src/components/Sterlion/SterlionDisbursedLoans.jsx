import React from "react";
import DisbursedLoansTable from "../DisbursedLoansScreen";

const SterlionDisbursedLoans = () => (
  <DisbursedLoansTable
    apiEndpoint="/loan-booking/disbursed-loans?table=loan_booking_sterlion&prefix=STRL"
    title="Sterlion Disbursed Loans"
  />
);

export default SterlionDisbursedLoans;
