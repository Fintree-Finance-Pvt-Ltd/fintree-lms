import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen';

const CirclePeHouserLoginLoans = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_circle_pe_houser&prefix=CIRHUF`}
      title="Circle Pe Houser Login Stage Loans"
      tableName="loan_booking_circle_pe_houser"
    />
  )
}

export default CirclePeHouserLoginLoans
