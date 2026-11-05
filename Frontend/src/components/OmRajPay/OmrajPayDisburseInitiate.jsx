import React from "react";
import ApproveInitiatedScreen from "../ApproveInitiatedScreen";

const OmrajPayDisburseInitiate = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/omrajpay/credit-initiated-loans?table=loan_booking_omrajpay&prefix=OMR`}
      title="OmrajPay Credit Initiated Loans"
      tableName="loan_booking_omrajpay"
      enableApprovedLoanAmount={true}
      lenderName="OmrajPay"
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

export default OmrajPayDisburseInitiate;