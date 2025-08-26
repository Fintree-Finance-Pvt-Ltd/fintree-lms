import React from 'react'
import AllLoans from './AllLoansScreen'
import AllLoansScreen from './AllLoansScreen'


const EVAllLoans = () => {
  return (
    <AllLoansScreen apiEndpoint={`/loan-booking/all-loans?table=loan_bookings&prefix=EV`} title="EV All Loans" />
  )
}

export default EVAllLoans