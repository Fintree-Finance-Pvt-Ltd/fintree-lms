import React from 'react'
import DisbursedLoansTable from '../DisbursedLoansScreen';

const ClaimCureBuddyDisbursedLoans = () => {
  return (
    <DisbursedLoansTable
      apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_claim_cure_buddy&prefix=CCB`}
      title="Claim Cure Buddy Disbursed Loans"
    />
  )
}

export default ClaimCureBuddyDisbursedLoans
