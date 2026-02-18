import React from 'react'
import AllLoans from './AllLoansScreen'


const SCAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_bookings&prefix=SC`} title="Supply Chain All Loans" />
  )
}

export default SCAllLoans