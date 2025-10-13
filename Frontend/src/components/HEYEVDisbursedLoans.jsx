import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const HEYEVDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_hey_ev&prefix=HEYEV`} title="EV Disbursed Loans" />
  )
}

export default HEYEVDisbursedLoans