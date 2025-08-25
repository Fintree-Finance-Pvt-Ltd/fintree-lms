import React from 'react'
import AllLoans from './AllLoansScreen'


const WCTLAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_bookings_wctl&prefix=WCTL`} title="WCTL-BL All Loans" />
  )
}

export default WCTLAllLoans