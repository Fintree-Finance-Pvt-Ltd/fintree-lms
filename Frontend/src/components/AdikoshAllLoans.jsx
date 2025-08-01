import React from 'react'
import DisbursedLoansTable from './DisbursedLoansScreen'

const AdikoshAllLoans = () => {
  (
      <DisbursedLoansTable apiEndpoint={`/loan-booking/all-loans?table=loan_booking_adikosh&prefix=ADK`} title="Adikosh All Loans" />
  );
}

export default AdikoshAllLoans