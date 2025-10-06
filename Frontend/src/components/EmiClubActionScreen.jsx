import React from 'react'
import LoginActionScreen from './LoginActionScreen';



const EmiClubActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_emiclub&prefix=FINE`}
      title="Emi Club Action Pending Loans"
      tableName="loan_booking_emiclub"
    />
  );
}

export default EmiClubActionScreen