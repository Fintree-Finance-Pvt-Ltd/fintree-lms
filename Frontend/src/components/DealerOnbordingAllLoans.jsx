import React from 'react'
import AllLoans from './AllLoansScreen'
import AllLoansScreen from './AllLoansScreen'


const DealerOnboardingAllLoans = () => {
  return (
    <AllLoansScreen apiEndpoint={`/loan-booking/all-loans?table=dealer_onboarding&prefix=DLR`} title="Dealer All Loans" />
  )
}

export default DealerOnboardingAllLoans