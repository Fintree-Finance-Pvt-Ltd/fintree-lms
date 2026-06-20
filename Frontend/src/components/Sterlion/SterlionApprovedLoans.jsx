import React from "react";
import ApprovedLoansTable from "../ApprovedLoansScreen";

const SterlionApprovedLoans = () => (
  <ApprovedLoansTable
    apiUrl="/loan-booking/approved-loans?table=loan_booking_sterlion&prefix=STRL"
    title="Sterlion Approved Loans"
    lenderName="STERLION"
  />
);

export default SterlionApprovedLoans;
