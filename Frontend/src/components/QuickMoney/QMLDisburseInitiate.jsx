
import React from 'react'
import LoginActionScreen from '../LoginActionScreen'

const QMLDisburseInitiate = () => {
  return (
    // BLApprovedLoans.js
<LoginActionScreen apiUrl={`/loan-booking/approved-loans?table=loan_booking_quick_money&prefix=QML`}
      title="Quick Money Disburse Initiate Pending Loans" />

  )
}

export default QMLDisburseInitiate