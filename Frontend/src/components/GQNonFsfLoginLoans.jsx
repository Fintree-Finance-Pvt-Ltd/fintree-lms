import React from 'react'
import LoginCaseScreen from './LoginCaseScreen';


const GQNonFsfLoginLoans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_gq_non_fsf&prefix=GQN`}
      title="GQ Non FSF Login Stage Loans"
      tableName="loan_booking_gq_non_fsf"
    />
  );
};

export default GQNonFsfLoginLoans