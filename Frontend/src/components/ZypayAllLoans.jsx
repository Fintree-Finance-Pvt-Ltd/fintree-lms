import React from 'react'
import AllLoans from './AllLoansScreen'


const ZypayAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_booking_zypay_customer&prefix=ZYPF`} title="Zypay All Loans" />
  )
}

export default ZypayAllLoans