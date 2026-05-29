import React from 'react'
import AllLoans from './AllLoansScreen'


const CarePayAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_booking_carepay&prefix=CARE`} title="CarePay All Loans" />
  )
}

export default CarePayAllLoans