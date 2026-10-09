import React from "react";
import ApprovedLoansTable from "../ApprovedLoansScreen";

const EmiClub2ApprovedLoans = () => (
  <ApprovedLoansTable
    apiUrl="/loan-booking/approved-loans?table=loan_booking_emiclub2&prefix=FINE2"
    title="EmiClub2 Approved Loans"
    lenderName="EMIClub2"
  />
);

export default EmiClub2ApprovedLoans;