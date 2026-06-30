import React from "react";
import DisbursedLoansTable from "../DisbursedLoansScreen";

const RapidMoneyDisbursedLoans = () => (
  <DisbursedLoansTable
    apiEndpoint="/loan-booking/disbursed-loans?table=loan_booking_switch_my_loan&prefix=SML"
    title="RapidMoney Disbursed Loans"
  />
);

export default RapidMoneyDisbursedLoans;
