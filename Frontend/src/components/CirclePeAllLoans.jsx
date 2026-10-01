import React from 'react'
import AllLoansScreen from '../components/AllLoansScreen'


const CirclePeAllLoans = () => {
  return (
    <AllLoansScreen apiEndpoint={`/loan-booking/all-loans?table=loan_booking_circle_pe&prefix=CIR`} 
    title="Circle Pe All Loans" 
     reportConfig={{
        buttonLabel: "Due Demand Report",
        modalTitle: "Circle Pe Due Demand Report",
        lenderName: "CIRCLE PE",
        endpoint: "/reports/due-demand/circlepe",
        fileName: "Circle_Pe_Due_Demand_Report",
      }}
    
    />
  )
}

export default CirclePeAllLoans