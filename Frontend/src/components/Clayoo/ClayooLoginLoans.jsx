import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen';


const ClayooLoginLoans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_clayyo&prefix=CLY`}
      title="CLAYYO Login Stage Loans"
      tableName="loan_booking_clayyo"
      lenderName="CLAYOO"
    />
  );
};

export default ClayooLoginLoans