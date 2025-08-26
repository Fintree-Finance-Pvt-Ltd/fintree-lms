import React from 'react'
import LoginCaseScreen from './LoginCaseScreen';


const EVLoginLoans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_bookings&prefix=EV`}
      title="EV Login Stage Loans"
      tableName="loan_bookings"
    />
  );
};

export default EVLoginLoans