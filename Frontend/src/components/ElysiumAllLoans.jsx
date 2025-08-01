import React from 'react'
import AllLoans from './AllLoansScreen'


const ElysiumAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_bookings&prefix=HC`} title="Elysium All Loans" />
  )
}

export default ElysiumAllLoans