import React from 'react'
import AllLoans from '../AllLoansScreen'


const SMLAllLoans = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_booking_switch_my_loan&prefix=SML`} title="Switch my loan All Loans" />
  )
}

export default SMLAllLoans