import React from 'react'
import LoginActionScreen from '../LoginActionScreen';

const CirclePeHouserActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl={`/loan-booking/login-loans?table=loan_booking_circle_pe_houser&prefix=CIRHUF`}
      title="Circle Pe Houser Action Pending Loans"
      tableName="loan_booking_circle_pe_houser"
    />
  )
}

export default CirclePeHouserActionScreen
