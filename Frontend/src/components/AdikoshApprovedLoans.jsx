import React from 'react'
import ApprovedLoansTable from './ApprovedLoansScreen'

const AdikoshApprovedLoans = () => {
  return (
    <ApprovedLoansTable 
        apiUrl={`/loan-booking/approved-loans?table=loan_booking_adikosh&prefix=ADK`} 
        title="Adikosh Approved Loans"
        lenderName="EMI"
    />
  )
}

export default AdikoshApprovedLoans;