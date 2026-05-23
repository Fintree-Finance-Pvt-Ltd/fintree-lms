import React from 'react'
import AllLoansScreen from '../AllLoansScreen';

const CirclePeHouserAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint={`/loan-booking/all-loans?table=loan_booking_circle_pe_houser&prefix=CIRHUF`}
      title="Circle Pe Houser All Loans"
    />
  )
}

export default CirclePeHouserAllLoans
