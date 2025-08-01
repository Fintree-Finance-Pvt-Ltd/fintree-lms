import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const GQFsfDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_gq_fsf&prefix=GQF`} title="GQ FSF Disbursed Loans" />
  )
}

export default GQFsfDisbursedLoans