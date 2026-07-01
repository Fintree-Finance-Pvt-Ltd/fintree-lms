import React from "react";
import LoginCaseScreen from "../LoginCaseScreen";

const RapidMoneyLoginLoans = () => (
  <LoginCaseScreen
    apiUrl="/loan-booking/login-loans?table=loan_booking_switch_my_loan&prefix=RML"
    title="RapidMoney Login Stage Loans"
    lenderName="RapidMoney"
    tableName="loan_booking_switch_my_loan"
  />
);

export default RapidMoneyLoginLoans;
