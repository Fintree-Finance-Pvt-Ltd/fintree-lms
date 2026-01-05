import React from 'react'
import LoginCaseScreen from './LoginCaseScreen';


const ZypayLoginLoans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_zypay_customer&prefix=ZYPF`}
      title="Zypay Login Stage Loans"
      tableName="loan_booking_zypay_customer"
    />
  );
};

export default ZypayLoginLoans