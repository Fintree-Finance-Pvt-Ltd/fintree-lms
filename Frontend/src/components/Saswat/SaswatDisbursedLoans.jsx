import React from 'react'

import DisbursedLoansTable from '../DisbursedLoansScreen'

const SaswatDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_saswat&prefix=SW`} title="Saswat Disbursed Loans" />
  )
}

export default SaswatDisbursedLoans