import React from 'react'
import LoginActionScreen from './LoginActionScreen';



const CarePayActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_carepay&prefix=CARE`}
      title="CarePay Action Pending Loans"
      tableName="loan_booking_carepay"
    />
  );
}

export default CarePayActionScreen