import React from 'react'
import LoginCaseScreen from '../components/LoginCaseScreen';


const HEYEVLoginLoans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_hey_ev&prefix=HEYEV`}
      title="HEY EV Login Stage Loans"
      tableName="loan_booking_hey_ev"
    />
  );
};

export default HEYEVLoginLoans