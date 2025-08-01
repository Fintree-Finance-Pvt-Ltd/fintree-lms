import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const GQNonFsfDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_gq_non_fsf&prefix=GQN`} title="GQ NON FSF Disbursed Loans" />
  )
}

export default GQNonFsfDisbursedLoans