import React from 'react'
import ApprovedLoansTable from './ApprovedLoansScreen'

const HEYEVBatteryApprovedLoans = () => {
  return (
    // BLApprovedLoans.js
<ApprovedLoansTable apiUrl={`/loan-booking/approved-loans?table=loan_booking_hey_ev_battery&prefix=HEYB`} title="Hey EV Battery Approved Loans" />

  )
}

export default HEYEVNBatteryApprovedLoans