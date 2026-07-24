import React from 'react'
import ApproveInitiatedScreen from '../ApproveInitiatedScreen';


const CarePayApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approved-loans?table=loan_booking_carepay&prefix=CARE`}
      title="CarePay Ops L1 Approved Loans"
      tableName="loan_booking_carepay"
      lender="CarePay"
      approvePayload={{ status: "Disburse initiate" }}
      rejectPayload={{ status: "rejected" }}
      includeOpsUser
      updateUrlBuilder={(lan) => `/loan-booking/v1/carepay-ops-l1-status/${lan}`}
      removeOnSuccessStatuses={["Disburse initiate", "rejected"]}
    />
  );
}

export default CarePayApproveInitiateScreen
