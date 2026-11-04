
import React from "react";
import AllLoansScreen from "../AllLoansScreen";

const NiyaraAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint="/loan-booking/all-loans?table=loan_booking_niyara&prefix=NYRA"
      title="Niyara All Loans"
      enableReject={false}
    />
  );
};

export default NiyaraAllLoans;
