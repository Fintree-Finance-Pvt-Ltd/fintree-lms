import React from 'react'
// import AllLoans from '../AllLoansScreen'
import AllLoansScreen from "../AllLoansScreen";

const SaswatAllLoans = () => {
  return (
    <AllLoansScreen
     apiEndpoint={`/loan-booking/all-loans?table=loan_booking_saswat&prefix=SW`} 
     title="Saswat All Loans" />
  )
}

export default SaswatAllLoans

