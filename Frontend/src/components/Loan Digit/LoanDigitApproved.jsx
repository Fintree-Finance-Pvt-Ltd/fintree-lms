import React from "react";
import ApprovedLoansTable from "../ApprovedLoansScreen";

const LoanDigitApproved = () => {
  return (
    <ApprovedLoansTable
      apiUrl={`/loan-booking/approved-loans?table=loan_booking_loan_digit&prefix=FINE`}
      title="Loan Digit Approved Loans"
      lenderName="Loan Digit"
    />
  );
};

export default LoanDigitApproved;
