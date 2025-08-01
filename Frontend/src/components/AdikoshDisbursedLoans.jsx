import React from "react";
import DisbursedLoansTable from "./DisbursedLoansScreen";

const AdikoshDisbursedLoans = () => (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_adikosh&prefix=ADK`} title="Adikosh Disbursed Loans" />
);

export default AdikoshDisbursedLoans;
