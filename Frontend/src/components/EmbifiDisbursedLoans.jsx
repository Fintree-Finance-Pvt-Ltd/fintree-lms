import React from 'react'

import DisbursedLoansTable from './DisbursedLoansScreen'

const EmbifiDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_embifi&prefix=E`} title="Embifi Disbursed Loans" />
  )
}

export default EmbifiDisbursedLoans