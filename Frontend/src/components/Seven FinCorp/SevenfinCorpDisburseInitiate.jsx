import React from "react";
import ApproveInitiatedScreen from "../ApproveInitiatedScreen";

const SevenFinCorpDisburseInitiate = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/seven-fincorp/credit-initiated-loans?table=loan_booking_seven_fincorp&prefix=SFL`}

      title="Seven FinCorp Credit Initiated Loans"

      tableName="loan_booking_seven_fincorp"

      enableApprovedLoanAmount={true}

      lenderName="Seven FinCorp"

      approvePayload={{
        status: "Credit Initiated",
        stage: "BRE Approved",
      }}

      rejectPayload={{
        status: "Rejected",
        stage: "Credit Rejected",
      }}
    />
  );
};

export default SevenFinCorpDisburseInitiate;