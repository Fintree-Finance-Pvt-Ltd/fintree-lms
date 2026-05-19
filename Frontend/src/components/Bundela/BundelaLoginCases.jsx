import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen'

const BundelaLoginCases = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_bundela&prefix=BUNDL`}
      title="Bundela Login Stage Cases"
      tableName="loan_booking_bundela"
      lenderName="Bundela"
      showResumeButton={true}
      resumePath="/bundela/loan-booking"
    />
  )
}

export default BundelaLoginCases