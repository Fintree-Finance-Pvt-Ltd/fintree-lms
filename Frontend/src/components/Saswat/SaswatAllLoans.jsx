import React from "react";
import AllLoansScreen from "../AllLoansScreen";

const SaswatAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint="/loan-booking/all-loans?table=loan_booking_saswat&prefix=SW"
      title="Saswat All Loans"
      lanDetailsUrlBuilder={(row) =>
        `/saswat/updatedata/${encodeURIComponent(row.lan)}`
      }
    />
  );
};

export default SaswatAllLoans;