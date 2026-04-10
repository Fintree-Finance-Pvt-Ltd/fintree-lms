import React from 'react'
import AllLoans from "../AllLoansScreen"
const ClayooFintreeScreen = () => {
  return (
    <AllLoans apiEndpoint={`/loan-booking/all-loans?table=loan_booking_clayyo&prefix=CLY`} title="Clayyo All Loans" />
  )
}

export default ClayooFintreeScreen