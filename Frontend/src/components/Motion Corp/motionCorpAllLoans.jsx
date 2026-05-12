import React from "react";
import AllLoansScreen from "../AllLoansScreen";

const MotionCorpAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint={`/loan-booking/all-loans?table=loan_booking_motion_corp&prefix=MCL`}
      title="Motion Corp All Loans"
    />
  );
};

export default MotionCorpAllLoans;
