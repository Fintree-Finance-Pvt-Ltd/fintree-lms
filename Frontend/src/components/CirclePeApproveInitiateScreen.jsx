import React from 'react'
import ApproveInitiatedScreen from './ApproveInitiatedScreen';


const CirclePeApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_circle_pe&prefix=CIR`}
      title="Circle Pe Approval Action Pending Loans"
      tableName="loan_booking_circle_pe"
    />
  );
}

export default CirclePeApproveInitiateScreen