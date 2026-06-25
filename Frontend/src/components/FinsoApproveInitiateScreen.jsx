import React from 'react'
import ApproveInitiatedScreen from './ApproveInitiatedScreen';


const FinsoApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_finso&prefix=FINS`}
      title="Fincrest Approval Action Pending Loans"
      tableName="loan_booking_finso"
      lender="Fincrest"
    />
  );
}

export default FinsoApproveInitiateScreen