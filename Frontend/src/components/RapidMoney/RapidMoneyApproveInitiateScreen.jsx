import React from "react";
import ApproveInitiatedScreen from "../ApproveInitiatedScreen";

const RapidMoneyApproveInitiateScreen = () => (
  <ApproveInitiatedScreen
    apiUrl="/loan-booking/approve-initiate-loans?table=loan_booking_switch_my_loan&prefix=SML"
    title="RapidMoney Approval Action Pending Loans"
    lenderName="RAPIDMONEY"
    tableName="loan_booking_switch_my_loan"
  />
);

export default RapidMoneyApproveInitiateScreen;
