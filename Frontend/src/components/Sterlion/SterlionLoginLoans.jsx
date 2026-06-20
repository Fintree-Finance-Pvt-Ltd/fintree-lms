import React from "react";
import LoginCaseScreen from "../LoginCaseScreen";

const SterlionLoginLoans = () => (
  <LoginCaseScreen
    apiUrl="/loan-booking/login-loans?table=loan_booking_sterlion&prefix=STRL"
    title="Sterlion Login Stage Loans"
    lenderName="STERLION"
  />
);

export default SterlionLoginLoans;
