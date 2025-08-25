import React from 'react'
import AllLoans from './AllLoansScreen'


const HCAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_bookings&prefix=HC`} title="HC All Loans" />
  )
}

export default HCAllLoans