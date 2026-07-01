import React from "react";
import LoginActionScreen from "../LoginActionScreen";

const RapidMoneyActionScreen = () => (
  <LoginActionScreen
    apiUrl="/loan-booking/login-loans?table=loan_booking_switch_my_loan&prefix=RML"
    title="RapidMoney Action Pending Loans"
    lenderName="RapidMoney"
    tableName="loan_booking_switch_my_loan"
  />
);

export default RapidMoneyActionScreen;
