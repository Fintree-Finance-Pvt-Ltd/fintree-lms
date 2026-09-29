import React from "react";
import LoginActionScreen from "../LoginActionScreen";

const EmiClub2ActionScreen = () => {
  return (
    <LoginActionScreen
      apiUrl="/loan-booking/login-loans?table=loan_booking_emiclub2&prefix=FINE2"
      title="EmiClub2 Action Pending Loans"
      tableName="loan_booking_emiclub2"
    />
  );
};

export default EmiClub2ActionScreen;