import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const CirclePeDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_bookings&prefix=BL`} title="Adikosh Disbursed Loans" />
  )
}

export default CirclePeDisbursedLoans