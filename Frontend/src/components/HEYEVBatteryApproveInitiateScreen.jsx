import React from 'react'
import ApproveInitiatedScreen from './ApproveInitiatedScreen';


const HEYEVBatteryApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_hey_ev_battery&prefix=HEYB`}
      title="HEY EV Approval Action Pending Loans"
      tableName="loan_booking_hey_ev_battery"
    />
  );
}

export default HEYEVBatteryApproveInitiateScreen