import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen'

const LoanDigitLoginCases = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_loan_digit&prefix=LDF`}
      title="Loan Digit Login Stage Cases"
      tableName="loan_booking_loan_digit"
    />
  )
}

export default LoanDigitLoginCases