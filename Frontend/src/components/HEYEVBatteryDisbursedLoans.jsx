import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const HEYEVBatteryDisbursedLoans = () => {
  return (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_hey_ev_battery&prefix=HEYBF`} title="EV Battery Disbursed Loans" />
  )
}

export default HEYEVBatteryDisbursedLoans