import React from "react";
import LoginCaseScreen from "../LoginCaseScreen";

const EmiClub2LoginLoans = () => (
  <LoginCaseScreen
    apiUrl="/loan-booking/login-loans?table=loan_booking_emiclub2&prefix=FINE2"
    title="EmiClub2 Login Stage Loans"
    
    tableName="loan_booking_emiclub2"
  />
);

export default EmiClub2LoginLoans;