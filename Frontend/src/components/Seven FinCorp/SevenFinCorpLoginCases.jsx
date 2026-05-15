import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen'

const SevenFinCorpLoginCases = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_seven_fincorp&prefix=SFC`}
      title="Seven FinCorp Login Stage Cases"
      tableName="loan_booking_seven_fincorp"
      lenderName= "Seven FinCorp"
      showResumeButton={true}
      resumePath="/seven-fincorp/loan-booking"
    />
  )
}

export default SevenFinCorpLoginCases ;