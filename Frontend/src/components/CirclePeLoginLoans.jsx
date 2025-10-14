import React from 'react'
import LoginCaseScreen from './LoginCaseScreen';


const CirclePeLoginLoans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_circle_pe&prefix=CIR`}
      title="Circle Pe Login Stage Loans"
      tableName="loan_booking_circle_pe"
    />
  );
};

export default CirclePeLoginLoans