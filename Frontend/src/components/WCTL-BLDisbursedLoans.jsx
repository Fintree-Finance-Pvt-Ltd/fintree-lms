import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const WCTLBLDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_bookings_wctl&prefix=WCTL`} title="WCTL-BL Disbursed Loans" />
  )
}

export default WCTLBLDisbursedLoans