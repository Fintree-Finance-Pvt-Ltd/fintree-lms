import React from 'react'
import LoginActionScreen from './LoginActionScreen';


const EVActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_ev&prefix=EV`}
      title="EV Action Pending Loans"
      tableName="loan_bookings"
    />
  );
}

export default EVActionScreen