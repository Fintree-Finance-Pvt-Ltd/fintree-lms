import React from 'react'
import ApproveInitiatedScreen from './ApproveInitiatedScreen';


const EVApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_ev&prefix=EV`}
      title="EV Approval Action Pending Loans"
      tableName="loan_booking_ev"
    />
  );
}

export default EVApproveInitiateScreen