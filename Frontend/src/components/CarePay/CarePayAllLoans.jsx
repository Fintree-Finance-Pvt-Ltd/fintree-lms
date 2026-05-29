import React from 'react'
import AllLoansScreen from '../AllLoansScreen';


const CarePayAllLoans = () => {
  return (
    <AllLoansScreen apiEndpoint={`/loan-booking/all-loans?table=loan_booking_carepay&prefix=CARE`} title="CarePay All Loans" />
  )
}

export default CarePayAllLoans