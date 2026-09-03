import React from 'react'
import ApprovedLoansTable from '../ApprovedLoansScreen'

const SaswatApprovedLoans = () => {
  return (
    <ApprovedLoansTable apiUrl={`/loan-booking/approved-loans?table=loan_booking_saswat&prefix=SW`} title="Saswat Approved Loans" />

  )
}

export default SaswatApprovedLoans