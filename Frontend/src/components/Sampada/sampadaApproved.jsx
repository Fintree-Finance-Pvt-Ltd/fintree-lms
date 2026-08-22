import React from "react";
import ApprovedLoansTable from "../ApprovedLoansScreen";

const SampadaApproved = () => {
  return (
    <ApprovedLoansTable
      apiUrl={`/loan-booking/approved-loans?table=loan_booking_sampada&prefix=SPL`}
      title="Sampada Approved Loans"
      lenderName="Sampada"
    />
  );
};

export default SampadaApproved;
