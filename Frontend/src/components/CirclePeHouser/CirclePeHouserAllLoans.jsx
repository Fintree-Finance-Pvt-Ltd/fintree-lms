import React from 'react'
import AllLoansScreen from '../AllLoansScreen';

const CirclePeHouserAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint={`/loan-booking/all-loans?table=loan_booking_circle_pe_houser&prefix=CIRHUF`}
      title="Circle Pe Houser All Loans"

       reportConfig={{
  buttonLabel: "Due Demand Report",
  modalTitle: "Circle Pe Houser Due Demand Report",
  lenderName: "CIRCLE PE HOUSER",
  endpoint: "/reports/due-demand/circlepe-houser",
  fileName: "Circle_Pe_Houser_Due_Demand_Report",
}}
    />
  )
}

export default CirclePeHouserAllLoans
