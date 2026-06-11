import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const FinsoDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_finso&prefix=FINS`} title="Fincrest Disbursed Loans" />
  )
}

export default FinsoDisbursedLoans