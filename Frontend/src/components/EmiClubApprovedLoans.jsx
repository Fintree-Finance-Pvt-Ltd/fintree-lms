import React from 'react'
import ApprovedLoansTable from './ApprovedLoansScreen'

const EmiClubApprovedLoans = () => {
  return (
    <ApprovedLoansTable 
        apiUrl={`/loan-booking/approved-loans?table=loan_booking_emiclub&prefix=FINE`} 
        title="Emi Club Approved Loans"
        lenderName="EMI"
    />
  )
}

export default EmiClubApprovedLoans;