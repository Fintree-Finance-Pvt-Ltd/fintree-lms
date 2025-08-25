import React from 'react'
import AllLoans from './AllLoansScreen'


const GQNonFsfAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_booking_gq_non_fsf&prefix=GQN`} title="GQ Non FSF All Loans" />
  )
}

export default GQNonFsfAllLoans