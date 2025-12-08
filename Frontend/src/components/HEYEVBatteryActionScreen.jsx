import React from 'react'
import LoginActionScreen from './LoginActionScreen';


const HEYEVBatteryActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_hey_ev_battery&prefix=HEYB`}
      title="EV Battry Action Pending Loans"
      tableName="loan_booking_hey_ev_battery"
    />
  );
}

export default HEYEVBatteryActionScreen