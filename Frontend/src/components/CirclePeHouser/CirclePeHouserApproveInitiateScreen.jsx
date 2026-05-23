import React from 'react'
import ApproveInitiatedScreen from '../ApproveInitiatedScreen';

const CirclePeHouserApproveInitiateScreen = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_circle_pe_houser&prefix=CIRHUF`}
      title="Circle Pe Houser Approval Action Pending Loans"
      tableName="loan_booking_circle_pe_houser"
    />
  )
}

export default CirclePeHouserApproveInitiateScreen
