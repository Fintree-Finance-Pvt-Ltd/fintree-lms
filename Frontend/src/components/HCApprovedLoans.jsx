import React from 'react'
import ApprovedLoansTable from './ApprovedLoansScreen'

const HCApprovedLoans = () => {
  return (
    <ApprovedLoansTable apiUrl={`/loan-booking/approved-loans?table=loan_bookings&prefix=HC`} title="Health Care Approved Loans" />
  )
}

export default HCApprovedLoans