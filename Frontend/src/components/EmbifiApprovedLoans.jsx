import React from 'react'
import ApprovedLoansTable from './ApprovedLoansScreen'

const EmbifiApprovedLoans = () => {
  return (
    <ApprovedLoansTable apiUrl={`/loan-booking/approved-loans?table=loan_booking_embifi&prefix=E`} title="Embifi Approved Loans" />

  )
}

export default EmbifiApprovedLoans