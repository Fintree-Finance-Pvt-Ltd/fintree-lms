import React from "react";
import DisbursedLoansTable from '../DisbursedLoansScreen';

const CarePayEduDisbursedLoans = () => (
    <DisbursedLoansTable apiEndpoint={`/loan-booking/disbursed-loans?table=loan_booking_carepay_education&prefix=CAREDU`} title="CarePay Disbursed Loans" />
);

export default CarePayEduDisbursedLoans;
