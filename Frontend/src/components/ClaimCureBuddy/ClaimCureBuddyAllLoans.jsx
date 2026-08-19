import React from "react";
import AllLoansScreen from "../AllLoansScreen" ;

const ClaimCureBuddyAllLoans = () => {
  return (
    <AllLoansScreen
      apiEndpoint="/loan-booking/all-loans?table=loan_booking_claim_cure_buddy&prefix=CCB"
      title="Claim Cure Buddy All Loans"
      lanDetailsUrlBuilder={(row) =>
        `/claimcurebuddy/customer-details/${encodeURIComponent(row.lan || "")}`
      }
    />
  );
};  

export default ClaimCureBuddyAllLoans;
