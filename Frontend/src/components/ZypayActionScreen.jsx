import React from 'react'
import LoginActionScreen from './LoginActionScreen';



const ZypayActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_zypay_customer&prefix=ZYPF`}
      title="Zypay Action Pending Loans"
      tableName="loan_booking_zypay_customer"
    />
  );
}

export default ZypayActionScreen