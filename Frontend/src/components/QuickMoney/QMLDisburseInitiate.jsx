

import React from "react";
import DisbursedLoansTable from "../DisbursedLoansScreen";

const QMLDisburseInitiate = () => (
  <DisbursedLoansTable
    apiEndpoint="/loan-booking/disbursed-loans?table=loan_booking_quick_money&prefix=QML"
    title="Quick Money Disbursed Loans"
  />
);

export default QMLDisburseInitiate;
