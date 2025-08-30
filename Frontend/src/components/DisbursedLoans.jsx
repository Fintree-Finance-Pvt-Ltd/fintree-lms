import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const DisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_ev&prefix=EV`} title="EV Disbursed Loans" />
  )
}

export default DisbursedLoans