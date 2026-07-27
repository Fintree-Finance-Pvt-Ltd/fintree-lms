import React from 'react'
import AllLoansScreen from '../AllLoansScreen';


const CarePayAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint={`/loan-booking/all-loans?table=loan_booking_carepay&prefix=CARE`}
      title="CarePay All Loans"
      lanDetailsUrlBuilder={(row) =>
        `/customer-details?lan=${encodeURIComponent(row.lan || "")}`
      }
    />
  )
}

export default CarePayAllLoans
