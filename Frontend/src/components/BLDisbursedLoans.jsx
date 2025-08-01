import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const BLDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_bookings&prefix=BL`} title="BL Disbursed Loans" />
  )
}

export default BLDisbursedLoans