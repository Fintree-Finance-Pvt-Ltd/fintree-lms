import React from 'react'
import ApprovedLoansTable from '../ApprovedLoansScreen';

const CirclePeHouserApprovedLoans = () => {
  return (
    <ApprovedLoansTable
      apiUrl={`/loan-booking/approved-loans?table=loan_booking_circle_pe_houser&prefix=CIRHUF`}
      title="Circle Pe Houser Approved Loans"
    />
  )
}

export default CirclePeHouserApprovedLoans
