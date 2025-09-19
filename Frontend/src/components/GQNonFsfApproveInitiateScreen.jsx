import React from 'react'
import ApproveInitiatedScreen from './ApproveInitiatedScreen';


const GQNonFsfApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_gq_non_fsf&prefix=GQN`}
      title="GQ Non Fsf Approval Action Pending Loans"
      tableName="loan_booking_gq_non_fsf"
    />
  );
}

export default GQNonFsfApproveInitiateScreen