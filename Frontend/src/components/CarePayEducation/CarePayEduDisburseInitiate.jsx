import React from 'react'
import ApproveInitiatedScreen from '../ApproveInitiatedScreen';


const CarePayEduDisburseInitiate = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approved-loans?table=loan_booking_carepay_education&prefix=CAREDU`}
      title="CarePay Education Ops L1 Approved Loans"
      tableName="loan_booking_carepay_education"
      lender="CarePay"
      approvePayload={{ status: "Disburse initiate" }}
      rejectPayload={{ status: "rejected" }}
      includeOpsUser
      updateUrlBuilder={(lan) => `/loan-booking/v1/carepay-edu-ops-l1-status/${lan}`}
      removeOnSuccessStatuses={["Disburse initiate", "rejected"]}
    />
  );
}

export default CarePayEduDisburseInitiate
