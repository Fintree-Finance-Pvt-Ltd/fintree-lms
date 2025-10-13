import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const CirclePeDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_circle_pe&prefix=CIRF`} title="Adikosh Disbursed Loans" />
  )
}

export default CirclePeDisbursedLoans