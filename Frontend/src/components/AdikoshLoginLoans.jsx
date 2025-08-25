import React from 'react'
import LoginCaseScreen from './LoginCaseScreen';


const AdikoshLoginLoans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_adikosh&prefix=ADK`}
      title="Adikosh Login Stage Loans"
    />
  );
};

export default AdikoshLoginLoans