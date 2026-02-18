import React from "react";
import ApprovedLoansTable from "./ApprovedLoansScreen";

const SCApprovedLoans = () => {
  return (
    //   SCApprovedLoans.js
    <ApprovedLoansTable
      apiUrl={`/loan-booking/approved-loans?table=loan_bookings&prefix=SC`}
      title="Supply Chain Approved Loans"
    />
  );
};

export default SCApprovedLoans;
