import React from "react";
import ApprovedLoansTable from "./ApprovedLoansScreen";

const BLApprovedLoans = () => {
  return (
    // BLApprovedLoans.js
    <ApprovedLoansTable
      apiUrl={`/loan-booking/approved-loans?table=loan_bookings&prefix=BL`}
      title="BL Approved Loans"
    />
  );
};

export default BLApprovedLoans;
