import React from "react";
import ApproveInitiatedScreen from "../ApproveInitiatedScreen";

const MotionCorpDisburseInitiate = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/motion-corp/credit-initiated-loans?table=loan_booking_motion_corp&prefix=MC`}

      title="Motion Corp Credit Initiated Loans"

      tableName="loan_booking_motion_corp"

      enableApprovedLoanAmount={true}

      lenderName="Motion Corp"

      approvePayload={{
        status: "Operations Initiated",
        stage: "Credit Approved",
      }}

      rejectPayload={{
        status: "Rejected",
        stage: "Credit Rejected",
      }}
    />
  );
};

export default MotionCorpDisburseInitiate;