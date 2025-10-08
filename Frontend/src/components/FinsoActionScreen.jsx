import React from 'react'
import LoginActionScreen from './LoginActionScreen';


const FinsoActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_finso&prefix=FINS`}
      title="Finso Action Pending Loans"
      tableName="loan_booking_finso"
    />
  );
}

export default FinsoActionScreen