import React from "react";
import ApprovedLoansTable from "../ApprovedLoansScreen";

const MotionCorpApproved = () => {
  return (
    <ApprovedLoansTable
      apiUrl={`/loan-booking/approved-loans?table=loan_booking_motion_corp&prefix=MCL`}
      title="Motion Corp Approved Loans"
      lenderName="Motion Corp"
    />
  );
};

export default MotionCorpApproved;
