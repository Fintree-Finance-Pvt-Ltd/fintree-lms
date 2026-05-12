import React from 'react'
import LoginActionScreen from '../LoginActionScreen';

const MotionCorpLoginAction = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_motion_corp&prefix=MCL`}
      title="Motion Corp Credit Approval Pending Loans"
      tableName="loan_booking_motion_corp"
      lenderName = "Motion Corp"
    />
  )
}

export default MotionCorpLoginAction