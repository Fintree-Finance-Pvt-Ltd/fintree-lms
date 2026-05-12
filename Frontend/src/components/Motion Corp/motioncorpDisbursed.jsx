import React from "react";
import DisbursedLoansTable from "../DisbursedLoansScreen";

const MotionCorpDisbursed = () => {
  return (
    <DisbursedLoansTable
      apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_motion_corp&prefix=MCL`}
      title="Motion Corp Disbursed Loans"
    />
  );
};

export default MotionCorpDisbursed;
