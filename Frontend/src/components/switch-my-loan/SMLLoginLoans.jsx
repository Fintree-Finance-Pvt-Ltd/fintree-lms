import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen';


const SMLLoginloans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_switch_my_loan&prefix=SML`}
      title="Switch my loan Login Stage Loans"
      tableName="loan_booking_switch_my_loan"
    />
  );
};

export default SMLLoginloans