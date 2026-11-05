import React from "react";
import ApprovedLoansTable from "../ApprovedLoansScreen";

const OmrajPayApproved = () => {
  return (
    <ApprovedLoansTable
      apiUrl="/loan-booking/approved-loans?table=loan_booking_omrajpay&prefix=OMR"
      title="OmrajPay Approved Loans"
      lenderName="OmrajPay"
    />
  );
};

export default OmrajPayApproved;