import React from 'react'
import LoginCaseScreen from './LoginCaseScreen';


const FinsoLoginLoans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_finso&prefix=FINS`}
      title="Fincrest Login Stage Loans"
      tableName="loan_booking_finso"
    />
  );
};

export default FinsoLoginLoans