import React from "react";
import LoanDigitCollections from "./LoanDigitCollections";

const LoanDigitCollectionScreen = () => (
  <LoanDigitCollections
    apiEndpoint="/loan-digit/collections"
    title="Loan Digit Collections"
  />
);

export default LoanDigitCollectionScreen;