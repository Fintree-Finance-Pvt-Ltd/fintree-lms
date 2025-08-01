import React from 'react'
import ApprovedLoansTable from './ApprovedLoansScreen'

const CirclePeApprovedLoans = () => {
  return (
    // BLApprovedLoans.js
<ApprovedLoansTable apiUrl={`/loan-booking/approved-loans?table=loan_booking_adikosh&prefix=ADK`} title="Circle Pe Approved Loans" />

  )
}

export default CirclePeApprovedLoans