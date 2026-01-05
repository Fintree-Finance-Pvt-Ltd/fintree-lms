import React from 'react'
import ApproveInitiatedScreen from './ApproveInitiatedScreen';


const ZypayApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_zypay_customer&prefix=ZYPF`}
      title="Zypay Approval Action Pending Loans"
      tableName="loan_booking_zypay_customer"
    />
  );
}

export default ZypayApproveInitiateScreen