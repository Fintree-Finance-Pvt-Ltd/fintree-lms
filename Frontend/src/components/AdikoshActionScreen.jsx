import React from 'react'
import LoginActionScreen from './LoginActionScreen';



const AdikoshActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_adikosh&prefix=ADK`}
      title="Adikosh Action Pending Loans"
      tableName="loan_booking_adikosh"
    />
  );
}

export default AdikoshActionScreen