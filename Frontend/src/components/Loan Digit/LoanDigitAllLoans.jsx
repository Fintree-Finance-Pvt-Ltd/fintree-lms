import React from "react";
import AllLoansScreen from "../AllLoansScreen";

const LoanDigitAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint={`/loan-booking/all-loans?table=loan_booking_loan_digit&prefix=FINE`}
      title="Loan Digit All Loans"
    />
  );
};

export default LoanDigitAllLoans;
