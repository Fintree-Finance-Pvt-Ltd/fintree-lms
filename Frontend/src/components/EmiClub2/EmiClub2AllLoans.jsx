import React from "react";
import AllLoans from "../AllLoansScreen";

const EmiClub2AllLoans = () => (
  <AllLoans
    apiEndpoint="/loan-booking/all-loans?table=loan_booking_emiclub2&prefix=FINE2"
    title="EmiClub2 All Loans"
  />
);

export default EmiClub2AllLoans;