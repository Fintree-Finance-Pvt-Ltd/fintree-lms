import React from "react";
import DisbursedLoansTable from "./DisbursedLoansScreen";

const ZypayDisbursedLoans = () => (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_zypay_customer&prefix=ZYPF`} title="Zypay Disbursed Loans" />
);

export default ZypayDisbursedLoans;