import React from 'react'
import ApprovedLoansTable from './ApprovedLoansScreen'

const CarePayApprovedLoans = () => {
  return (
    <ApprovedLoansTable 
        apiUrl={`/loan-booking/approved-loans?table=loan_booking_carepay&prefix=CARE`} 
        title="CarePay Approved Loans"
        lenderName="CAREPAY"
    />
  )
}

export default CarePayApprovedLoans;