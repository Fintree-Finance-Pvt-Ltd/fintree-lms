import React from 'react'
import ApproveInitiatedScreen from './ApproveInitiatedScreen';


const EmiClubApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_emiclub&prefix=FINE`}
      title="Emi Club Approval Action Pending Loans"
      tableName="loan_booking_emiclub"
    />
  );
}

export default EmiClubApproveInitiateScreen