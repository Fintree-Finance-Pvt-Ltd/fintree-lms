import React from 'react'
import LoginActionScreen from '../LoginActionScreen';

const SampadaLoginAction = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_sampada&prefix=SPL`}
      title="Sampada Credit Approval Pending Loans"
      tableName="loan_booking_sampada"
      lenderName = "Sampada"
    />
  )
}

export default SampadaLoginAction