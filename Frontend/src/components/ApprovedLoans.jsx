import React from 'react'
import ApprovedLoansTable from '../components/ApprovedLoansScreen'

const ApprovedLoans = () => {
  return (
    // BLApprovedLoans.js
<ApprovedLoansTable apiUrl={`/loan-booking/approved-loans?table=loan_bookings&prefix=EV`} title="EV Approved Loans" />

  )
}

export default ApprovedLoans