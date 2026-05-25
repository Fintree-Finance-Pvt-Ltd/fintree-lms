import React from 'react'
import DisbursedLoansTable from '../DisbursedLoansScreen';

const CirclePeHouserDisbursedLoans = () => {
  return (
    <DisbursedLoansTable
      apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_circle_pe_houser&prefix=CIRHUF`}
      title="Circle Pe Houser Disbursed Loans"
    />
  )
}

export default CirclePeHouserDisbursedLoans
