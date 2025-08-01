import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const HCDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_bookings&prefix=HC`} title="Health Care Disbursed Loans" />
  )
}

export default HCDisbursedLoans