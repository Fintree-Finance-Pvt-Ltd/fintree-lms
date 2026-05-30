import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen';


const CarePayLoginLoans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_carepay&prefix=CARE`}
      title="CarePay Login Stage Loans"
      tableName="loan_booking_carepay"
    />
  );
};

export default CarePayLoginLoans