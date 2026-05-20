import React from "react";
import ApproveInitiatedScreen from "../ApproveInitiatedScreen";

const BundelaDisburseInitiate = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/bundela/credit-initiated-loans?table=loan_booking_bundela&prefix=BUN`}
      title="Bundela Credit Initiated Loans"
      tableName="loan_booking_bundela"
      enableApprovedLoanAmount={true}
      lenderName="Bundela"
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

export default BundelaDisburseInitiate;