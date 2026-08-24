import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen'

const SampadaLoginCases = () => {
  return (
    <LoginCaseScreen
      apiUrl="/sampada/login-loans"
      title="Sampada Login Stage Cases"
      tableName="loan_booking_sampada"
      lenderName= "Sampada"
      showResumeButton={true}
      resumePath="/sampada/loan-booking"
    />
  )
}

export default SampadaLoginCases
