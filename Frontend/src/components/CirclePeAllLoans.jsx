import React from 'react'
import AllLoansScreen from '../components/AllLoansScreen'


const CirclePeAllLoans = () => {
  return (
    <AllLoansScreen apiEndpoint={`/loan-booking/all-loans?table=loan_booking_circle_pe&prefix=CIR`} title="Circle Pe All Loans" />
  )
}

export default CirclePeAllLoans