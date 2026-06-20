import React from "react";
import ApproveInitiatedScreen from "../ApproveInitiatedScreen";

const SterlionApproveInitiateScreen = () => (
  <ApproveInitiatedScreen
    apiUrl="/loan-booking/approve-initiate-loans?table=loan_booking_sterlion&prefix=STRL"
    title="Sterlion Approval Action Pending Loans"
    lenderName="STERLION"
    tableName="loan_booking_sterlion"
    approvePayload={{ status: "Approved" }}
    rejectPayload={{ status: "rejected" }}
  />
);

export default SterlionApproveInitiateScreen;
