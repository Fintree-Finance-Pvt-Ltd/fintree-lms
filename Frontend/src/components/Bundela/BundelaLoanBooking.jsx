import React from "react";
import SevenFinCorpLoanBooking from "../Seven FinCorp/SevenfinCorpLoanBooking";

const BundelaLoanBooking = () => {
  return <SevenFinCorpLoanBooking lenderType="Bundela" apiPrefix="bundela" tableName="loan_booking_bundela" title="Bundela Manual Entry" />;
};

export default BundelaLoanBooking;