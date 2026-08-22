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
        enableReject={true}

      canRejectRow={(row) =>
        ["DRAFT", "BRE APPROVED"].includes(
          String(row.status || "")
            .trim()
            .toUpperCase()
        )
      }

      rejectEndpointBuilder={(row) =>
        `/claim-cure-buddy/${encodeURIComponent(
          row.lan || ""
        )}/reject`
      }
    />
  );
};  

export default ClaimCureBuddyAllLoans;
