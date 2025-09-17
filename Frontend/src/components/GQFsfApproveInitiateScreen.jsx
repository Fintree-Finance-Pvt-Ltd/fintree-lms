import React from 'react'
import ApproveInitiatedScreen from './ApproveInitiatedScreen';


const GQFsfApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_gq_fsf&prefix=GQF`}
      title="GQ FSF Approval Action Pending Loans"
      tableName="loan_booking_gq_fsf"
    />
  );
}

export default GQFsfApproveInitiateScreen