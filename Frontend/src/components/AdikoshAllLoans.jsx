import React from 'react'
import AllLoans from './AllLoansScreen'


const AdikoshAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_booking_adikosh&prefix=ADK`} title="Adikosh All Loans" />
  )
}

export default AdikoshAllLoans