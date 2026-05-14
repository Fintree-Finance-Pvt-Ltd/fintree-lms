import React from 'react'
import LoginCaseScreen from '../LoginCaseScreen'

const MotionCorpLoginCases = () => {
  return (
    <LoginCaseScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_motion_corp&prefix=MCL`}
      title="Motion Corp Login Stage Cases"
      tableName="loan_booking_motion_corp"
      lenderName= "Motion Corp"
      showResumeButton={true}
      resumePath="/motion-corp/loan-booking"
    />
  )
}

export default MotionCorpLoginCases