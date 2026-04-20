import React from "react";
import DisbursedLoansTable from "../DisbursedLoansScreen";

const LoanDigitDisbursed = () => {
  return (
    <DisbursedLoansTable
      apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_loan_digit&prefix=LDF`}
      title="Loan Digit Disbursed Loans"
    />
  );
};

export default LoanDigitDisbursed;
