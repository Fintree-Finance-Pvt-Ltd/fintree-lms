import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen'

const SRBHLoginCases = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_srbh&prefix=SRBH`}
      title="SRBH Login Stage Cases"
      tableName="loan_booking_srbh"
      lenderName= "SRBH"
      showResumeButton={true}
      resumePath="/srbh/loan-booking"
    />
  )
}

export default SRBHLoginCases ;