import React from 'react'
import LoginActionScreen from './LoginActionScreen';


const CirclePeActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_circle_pe&prefix=CIR`}
      title="Circle Pe Action Pending Loans"
      tableName="loan_booking_circle_pe"
    />
  );
}

export default CirclePeActionScreen