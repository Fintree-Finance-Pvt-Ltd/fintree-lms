import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const SCDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_bookings&prefix=SC`} title="Supply Chain Disbursed Loans" />
  )
}

export default SCDisbursedLoans