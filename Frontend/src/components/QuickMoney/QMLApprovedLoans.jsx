import React from "react";
import ApprovedLoansTable from "../ApprovedLoansScreen";

const QMLApprovedLoans = () => (
  <ApprovedLoansTable
    apiUrl="/loan-booking/approved-loans?table=loan_booking_quick_money&prefix=QML"
    title="QuickMoney Approved Loans"
    lender="Quickoney"
  />
);

export default QMLApprovedLoans;
