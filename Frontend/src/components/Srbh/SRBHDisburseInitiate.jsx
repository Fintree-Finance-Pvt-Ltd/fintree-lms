import React from "react";
import ApproveInitiatedScreen from "../ApproveInitiatedScreen";

const SRBHDisburseInitiate = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/srbh/credit-initiated-loans?table=loan_booking_srbh&prefix=SH`}

      title="SRBH Credit Initiated Loans"

      tableName="loan_booking_srbh"

      enableApprovedLoanAmount={true}

      lenderName="SRBH"

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

export default SRBHDisburseInitiate;