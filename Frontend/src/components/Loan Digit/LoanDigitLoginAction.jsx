import React from 'react'
import LoginActionScreen from '../LoginActionScreen';

const LoanDigitLoginAction = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_loan_digit&prefix=LDF`}
      title="Loan Digit Credit Approval Pending Loans"
      tableName="loan_booking_loan_digit"
    />
  )
}

export default LoanDigitLoginAction