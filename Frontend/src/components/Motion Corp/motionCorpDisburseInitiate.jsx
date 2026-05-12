import React from 'react'
import ApproveInitiatedScreen from '../ApproveInitiatedScreen'

const MotionCorpDisburseInitiate = () => {
  return (
    <ApproveInitiatedScreen
      apiUrl={`/loan-booking/approve-initiate-loans?table=loan_booking_motion_corp&prefix=MCL`}
      title="Motion Corp Disbursement Action Pending"
      tableName="loan_booking_motion_corp"
    />
  )
}

export default MotionCorpDisburseInitiate