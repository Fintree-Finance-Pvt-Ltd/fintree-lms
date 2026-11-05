import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen'

const OmrajPayLoginCases = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_omrajpay&prefix=OMR`}
      title="OmrajPay Login Stage Cases"
      tableName="loan_booking_omrajpay"
      lenderName= "OmrajPay"
      showResumeButton={true}
      resumePath="/omrajpay/loan-booking"
    />
  )
}

export default OmrajPayLoginCases
