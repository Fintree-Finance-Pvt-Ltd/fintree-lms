import React from 'react'
// import AllLoans from '../AllLoansScreen'
import AllLoansScreen from "../AllLoansScreen";


const QMLAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint={`/loan-booking/all-loans?table=loan_booking_quick_money&prefix=QML`}
      title="Quick Money my loan All Loans"
    />
  )
}

export default QMLAllLoans