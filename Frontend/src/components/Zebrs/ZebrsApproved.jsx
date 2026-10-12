
import React from "react";
import ApprovedLoansTable from "../ApprovedLoansScreen";

const ZebrsApproved = () => {
  return (
    <ApprovedLoansTable
      apiUrl="/zebrs/operation-initiated-loans"
      title="Zebrs Approved Loans"
      lenderName="Zebrs"
    //   detailsUrlBuilder={(row) =>
    //     `/zebrs/update-data?lan=${encodeURIComponent(row.lan)}`
    //   }
    />
  );
};

export default ZebrsApproved;
