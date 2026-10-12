
import React from "react";
import AllLoansScreen from "../AllLoansScreen";

const ZebrsAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint="/loan-booking/all-loans?table=loan_booking_zebrs&prefix=ZBCL"
      title="Zebrs Customer All Cases"
      lanDetailsUrlBuilder={(row) =>
        `/zebrs/update-data?lan=${encodeURIComponent(row.lan)}`
      }
    />
  );
};

export default ZebrsAllLoans;
