import React from 'react'
import LoginActionScreen from '../LoginActionScreen';

const FundifyLoginActions = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_fundify&prefix=FUN`}
      title="Fundify Credit Approval Pending Loans"
      tableName="loan_booking_fundify"
      lenderName = "Fundify"
    />
  )
}

export default FundifyLoginActions