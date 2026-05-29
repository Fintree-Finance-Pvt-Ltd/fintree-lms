import React from 'react'
import ApproveInitiatedScreen from './ApproveInitiatedScreen';


const CarePayApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_carepay&prefix=CARE`}
      title="CarePay Approval Action Pending Loans"
      tableName="loan_booking_carepay"
    />
  );
}

export default CarePayApproveInitiateScreen