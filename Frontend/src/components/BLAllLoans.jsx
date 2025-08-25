import React from 'react'
import AllLoans from './AllLoansScreen'


const BLAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_bookings&prefix=BL`} title="BL All Loans" />
  )
}

export default BLAllLoans