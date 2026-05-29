import React from "react";
import DisbursedLoansTable from "./DisbursedLoansScreen";

const CarePayDisbursedLoans = () => (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_carepay&prefix=CARE`} title="CarePay Disbursed Loans" />
);

export default CarePayDisbursedLoans;
