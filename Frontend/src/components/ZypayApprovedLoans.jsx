import React from 'react'
import ApprovedLoansTable from './ApprovedLoansScreen'

const ZypayApprovedLoans = () => {
  return (
    <ApprovedLoansTable 
        apiUrl={`/loan-booking/approved-loans?table=loan_booking_zypay_customer&prefix=ZYPF`} 
        title="Zypay Approved Loans"
        lenderName="Zypay"
    />
  )
}

export default ZypayApprovedLoans;