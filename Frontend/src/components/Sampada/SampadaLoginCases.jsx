import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen'

const SampadaLoginCases = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_sampada&prefix=SPL`}
      title="Sampada Login Stage Cases"
      tableName="loan_booking_sampada"
      lenderName= "Sampada"
      showResumeButton={true}
      resumePath="/sampada/loan-booking"
    />
  )
}

export default SampadaLoginCases