import React from "react";
import LoginCaseScreen from "../LoginCaseScreen";

const ClaimCureBuddyDraftCases = () => {
  return (
    <LoginCaseScreen
      apiUrl="/claim-cure-buddy/loan-booking/draft-cases"
      title="ClaimCureBuddy Draft Stage Cases"
      lenderName="ClaimCureBuddy"
      showResumeButton={true}
      resumePath="/claimcurebuddy/loan-booking"
    />
  );
};

export default ClaimCureBuddyDraftCases;