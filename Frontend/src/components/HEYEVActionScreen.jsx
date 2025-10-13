import React from 'react'
import LoginActionScreen from '../components/LoginActionScreen';


const HEYEVActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_hey_ev&prefix=HEYEV`}
      title="EV Action Pending Loans"
      tableName="loan_booking_hey_ev"
    />
  );
}

export default HEYEVActionScreen