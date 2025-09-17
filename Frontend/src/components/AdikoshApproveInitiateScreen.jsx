import React from 'react'
import ApproveInitiatedScreen from './ApproveInitiatedScreen';


const AdikoshApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_adikosh&prefix=ADK`}
      title="Adikosh Approval Action Pending Loans"
      tableName="loan_booking_adikosh"
    />
  );
}

export default AdikoshApproveInitiateScreen