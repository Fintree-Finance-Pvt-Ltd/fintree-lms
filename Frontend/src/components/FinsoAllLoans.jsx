import React from 'react'
import AllLoans from './AllLoansScreen'


const FinsoAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_booking_finso&prefix=FINS`} title="Finso All Loans" />
  )
}

export default FinsoAllLoans