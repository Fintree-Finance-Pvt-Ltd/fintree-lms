import React from "react";
import AllLoansScreen from "../AllLoansScreen";

const OmrajPayAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint={`/loan-booking/all-loans?table=loan_booking_omrajpay&prefix=OMR`}
      title="OmrajPay All Loans"
    />
  );
};

export default OmrajPayAllLoans;    