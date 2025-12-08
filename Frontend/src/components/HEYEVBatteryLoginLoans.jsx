import React from 'react'
import LoginCaseScreen from './LoginCaseScreen';


const HEYEVBatteryLoginLoans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_hey_ev_battery&prefix=HEYB`}
      title="HEY EV Battery Login Stage Loans"
      tableName="loan_booking_hey_ev_battery"
    />
  );
};

export default HEYEVBatteryLoginLoans