import React from "react";
import ApproveInitiatedScreen from "../ApproveInitiatedScreen";

const SampadaDisburseInitiate = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/sampada/credit-initiated-loans?table=loan_booking_sampada&prefix=SPL`}

      title="Sampada Credit Initiated Loans"

      tableName="loan_booking_sampada"

      enableApprovedLoanAmount={true}

      lenderName="Sampada"

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

export default SampadaDisburseInitiate;
