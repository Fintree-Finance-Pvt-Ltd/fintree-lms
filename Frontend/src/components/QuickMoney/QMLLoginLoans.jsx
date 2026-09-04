import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen';


const QMLLoginloans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_quick_money&prefix=QML`}
      title="Quick Money Login Stage Loans"
      tableName="loan_booking_quick_money"
    />
  );
};

export default QMLLoginloans