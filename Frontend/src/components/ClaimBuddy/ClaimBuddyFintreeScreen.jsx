import React from "react";
import AllLoans from "../AllLoansScreen";

const ClaimBuddyFintreeScreen = () => {
  return (
    <AllLoans
      apiEndpoint={`/loan-booking/all-loans?table=loan_booking_claim_buddy&prefix=CBF`}
      title="Claim Buddy All Loans"
    />
  );
};

export default ClaimBuddyFintreeScreen;