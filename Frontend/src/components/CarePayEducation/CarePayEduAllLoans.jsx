import React from 'react'
import AllLoansScreen from '../AllLoansScreen';


const CarePayEducationAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint={`/loan-booking/all-loans?table=loan_booking_carepay_education&prefix=CAREDU`}
      title="CarePay Education All Loans"
      lanDetailsUrlBuilder={(row) =>
        `/customer-details?lan=${encodeURIComponent(row.lan || "")}`
      }
    />
  )
}

export default CarePayEducationAllLoans
