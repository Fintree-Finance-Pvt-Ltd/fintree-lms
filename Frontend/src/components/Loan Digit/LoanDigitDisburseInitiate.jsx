import React from 'react'
import ApproveInitiatedScreen from '../ApproveInitiatedScreen'

const LoanDigitDisburseInitiate = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_loan_digit&prefix=LDF`}
      title="Loan Digit Disbursement Action Pending"
      tableName="loan_booking_loan_digit"
    />
  )
}

export default LoanDigitDisburseInitiate