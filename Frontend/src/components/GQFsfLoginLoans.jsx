import React from 'react'
import LoginCaseScreen from './LoginCaseScreen';


const GQFsfLoginLoans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_gq_fsf&prefix=GQF`}
      title="GQ FSF Login Stage Loans"
      tableName="loan_booking_gq_fsf"
    />
  );
};

export default GQFsfLoginLoans