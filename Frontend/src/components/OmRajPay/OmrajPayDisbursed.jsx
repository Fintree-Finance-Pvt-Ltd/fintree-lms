import React from "react";
import DisbursedLoansTable from "../DisbursedLoansScreen";

const OmrajPayDisbursed = () => {
  return (
    <DisbursedLoansTable
      apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_omrajpay&prefix=OMR`}
      title="OmrajPay Disbursed Loans"
    />
  );
};

export default OmrajPayDisbursed;