import React from "react";
import DisbursedLoansTable from "./DisbursedLoansScreen";

const EmiClubDisbursedLoans = () => (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_emiclub&prefix=FINE`} title="Emi Club Disbursed Loans" />
);

export default EmiClubDisbursedLoans;
