import React from "react";
import DisbursedLoansTable from "../DisbursedLoansScreen";

const SterlionUBLDisbursedLoans = () => (
  <DisbursedLoansTable
    apiEndpoint="/loan-booking/disbursed-loans?table=loan_booking_sterlion_ubl&prefix=UBLF"
    title="Sterlion UBL Disbursed Loans"
  />
);

export default SterlionUBLDisbursedLoans;