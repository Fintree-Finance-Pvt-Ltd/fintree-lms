import React from "react";
import ApprovedLoansTable from "./ApprovedLoansScreen";

const GQNonFsfApprovedLoans = () => {
  return (
    <ApprovedLoansTable
      apiUrl={`/loan-booking/approved-loans?table=loan_booking_gq_non_fsf&prefix=GQN`}
      title="GQ Non FSF Approved Loans"
    />
  );
};

export default GQNonFsfApprovedLoans;
