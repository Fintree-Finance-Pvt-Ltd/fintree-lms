import React from 'react'
import LoginActionScreen from '../LoginActionScreen';

const OmrajPayLoginAction = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_omrajpay&prefix=OMR`}
      title="OmrajPay Credit Approval Pending Loans"
      tableName="loan_booking_omrajpay"
      lenderName = "OmrajPay"
    />
  )
}

export default OmrajPayLoginAction
