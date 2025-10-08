import React from 'react'
import ApprovedLoansTable from './ApprovedLoansScreen'

const FinsoApprovedLoans = () => {
  return (
    // BLApprovedLoans.js
<ApprovedLoansTable apiUrl={`/loan-booking/approved-loans?table=loan_booking_finso&prefix=FINS`} title="Finso Approved Loans" />

  )
}

export default FinsoApprovedLoans