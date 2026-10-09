import React from "react";
import DisbursedLoansTable from "../DisbursedLoansScreen";

const EmiClub2DisbursedLoans = () => (
  <DisbursedLoansTable
    apiEndpoint="/loan-booking/disbursed-loans?table=loan_booking_emiclub2&prefix=FINE2"
    title="EmiClub2 Disbursed Loans"
  />
);

export default EmiClub2DisbursedLoans;
