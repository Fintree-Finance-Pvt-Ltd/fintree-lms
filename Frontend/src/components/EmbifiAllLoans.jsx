import React from 'react'
import AllLoans from './AllLoansScreen'


const EmbifiAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_booking_embifi&prefix=E`} title="Embifi All Loans" />
  )
}

export default EmbifiAllLoans