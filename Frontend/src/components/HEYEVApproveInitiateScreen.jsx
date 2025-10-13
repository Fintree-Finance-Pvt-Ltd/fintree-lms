import React from 'react'
import ApproveInitiatedScreen from '../components/ApproveInitiatedScreen';


const HEYEVApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_hey_ev&prefix=HEYEV`}
      title="HEY EV Approval Action Pending Loans"
      tableName="loan_booking_hey_ev"
    />
  );
}

export default HEYEVApproveInitiateScreen