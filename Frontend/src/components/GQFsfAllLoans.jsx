import React from 'react'
import AllLoans from './AllLoansScreen'


const GQFsfAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_booking_gq_fsf&prefix=GQF`} title="GQ FSF All Loans" />
  )
}

export default GQFsfAllLoans