import React from 'react'
import AllLoans from './AllLoansScreen'
import AllLoansScreen from './AllLoansScreen'


const HEYEVBatteryAllLoans = () => {
  return (
    <AllLoansScreen apiEndpoint={`/loan-booking/all-loans?table=loan_booking_hey_ev_battery&prefix=HEYBF`} title="EV Battery All Loans" />
  )
}

export default HEYEVBatteryAllLoans