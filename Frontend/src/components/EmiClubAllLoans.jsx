import React from 'react'
import AllLoans from './AllLoansScreen'


const EmiClubAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_booking_emiclub&prefix=FINE`} title="EmiClub All Loans" />
  )
}

export default EmiClubAllLoans