import React from "react";
import ApproveInitiatedScreen from "../ApproveInitiatedScreen";

const ClaimBuddyApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl="/claim-buddy/approve-initiate-loans?table=loan_booking_claim_buddy&prefix=CBF"
      title="Claim Buddy Approval Action Pending Loans"
      tableName="loan_booking_claim_buddy"
      lender="CLAIM-BUDDY"
    />
  );
};

export default ClaimBuddyApproveInitiateScreen;
