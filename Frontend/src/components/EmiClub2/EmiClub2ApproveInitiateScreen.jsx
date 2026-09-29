import React from "react";
import ApproveInitiatedScreen from "../ApproveInitiatedScreen";

const EmiClub2ApproveInitiateScreen = () => (
  <ApproveInitiatedScreen
    apiUrl="/loan-booking/approve-initiate-loans?table=loan_booking_emiclub2&prefix=FINE2"
    title="EmiClub2 Approval Action Pending Loans"
    tableName="loan_booking_emiclub2"
    lenderName="EMICLUB2"
    removeOnSuccessStatuses={["approved", "rejected"]}
  />
);

export default EmiClub2ApproveInitiateScreen;