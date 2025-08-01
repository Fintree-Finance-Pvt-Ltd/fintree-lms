import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const ElysiumDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_bookings&prefix=HC`} title="Elysium Disbursed Loans" />
  )
}

export default ElysiumDisbursedLoans