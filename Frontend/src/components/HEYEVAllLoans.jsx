import React from 'react'
import AllLoans from '../components/AllLoansScreen'
import AllLoansScreen from '../components/AllLoansScreen'


const HEYEVAllLoans = () => {
  return (
    <AllLoansScreen apiEndpoint={`/loan-booking/all-loans?table=loan_booking_hey_ev&prefix=HEYEV`} title="EV All Loans" />
  )
}

export default HEYEVAllLoans