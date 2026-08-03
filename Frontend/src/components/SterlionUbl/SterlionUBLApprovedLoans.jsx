import React from "react";
import ApprovedLoansTable from "../ApprovedLoansScreen";

const SterlionUBLApprovedLoans = () => {
  return (
    <ApprovedLoansTable
      apiUrl="/loan-booking/approved-loans?table=loan_booking_sterlion_ubl&prefix=UBLF"
      title="Sterlion UBL Approved Loans"
      lenderName="STERLION UBL"
    />
  );
};

export default SterlionUBLApprovedLoans;