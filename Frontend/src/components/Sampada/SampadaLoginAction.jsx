import React from 'react'
import LoginActionScreen from '../LoginActionScreen';

const SampadaLoginAction = () => {
  return (
    <LoginActionScreen
      apiUrl="/sampada/login-loans"
      title="Sampada Credit Approval Pending Loans"
      tableName="loan_booking_sampada"
      lenderName = "Sampada"
    />
  )
}

export default SampadaLoginAction
