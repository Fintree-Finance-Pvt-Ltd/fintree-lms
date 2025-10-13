import React from 'react'
import ApprovedLoansTable from './ApprovedLoansScreen'

const CirclePeApprovedLoans = () => {
  return (
    // Circle pe ApprovedLoans.js
<ApprovedLoansTable apiUrl={`/loan-booking/approved-loans?table=loan_booking_circle_pe&prefix=CIRF`} title="Circle Pe Approved Loans" />

  )
}

export default CirclePeApprovedLoans