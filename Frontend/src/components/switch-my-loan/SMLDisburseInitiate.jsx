
import React from 'react'
import LoginActionScreen from '../LoginActionScreen'

const SMLDisburseInitiate = () => {
  return (
    // BLApprovedLoans.js
<LoginActionScreen apiUrl={`/loan-booking/approved-loans?table=loan_booking_switch_my_loan&prefix=SML`}
      title="Switch my loan Disburse Initiate Pending Loans" />

  )
}

export default SMLDisburseInitiate