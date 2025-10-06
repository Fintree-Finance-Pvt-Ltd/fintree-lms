import React from 'react'
import LoginCaseScreen from './LoginCaseScreen';


const EmiClubLoginLoans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_emiclub&prefix=FINE`}
      title="Emi Club Login Stage Loans"
      tableName="loan_booking_emiclub"
    />
  );
};

export default EmiClubLoginLoans