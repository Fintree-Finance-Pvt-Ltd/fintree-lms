import React from 'react'
import ApprovedLoansTable from './ApprovedLoansScreen'

const HEYEVApprovedLoans = () => {
  return (
    // BLApprovedLoans.js
<ApprovedLoansTable apiUrl={`/loan-booking/approved-loans?table=loan_booking_hey_ev&prefix=HEYEV`} title="Hey EV Approved Loans" />

  )
}

export default HEYEVApprovedLoans