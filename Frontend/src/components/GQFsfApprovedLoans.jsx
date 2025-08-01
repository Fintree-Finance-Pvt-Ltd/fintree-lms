import React from 'react'
import ApprovedLoansTable from './ApprovedLoansScreen'

const GQFsfApprovedLoans = () => {
  return (
    // BLApprovedLoans.js
<ApprovedLoansTable apiUrl={`/loan-booking/approved-loans?table=loan_bookings_gq_fsf&prefix=GQF`} title="GQ FSF Approved Loans" />

  )
}

export default GQFsfApprovedLoans