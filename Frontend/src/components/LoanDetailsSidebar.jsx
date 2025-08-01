import React from "react";
// import "../styles/LoanDetailsSidebar.css"; 

const LoanDetailsSidebar = ({ loan }) => {
    if (!loan) return null;

<div className="page-container">
            {/* ✅ Show Loan Details Sidebar */}
            <LoanDetailsSidebar loan={loan} />

            <div className="loan-details-content">
                <h2>Loan Application By {loan.customer_name}</h2>
                <p><strong>LAN:</strong> {loan.lan}</p>

                <h3>Loan Details</h3>
                <div className="grid-container">
                    <div>
                        <label>Approved Loan Amount (with interest)</label>
                        <input type="text" value={loan.loan_amount || ""} readOnly />
                    </div>
                    <div>
                        <label>Interest Rate</label>
                        <input type="text" value={loan.interest_rate || ""} readOnly />
                    </div>
                    <div>
                        <label>Flat Rate</label>
                        <input type="text" value={loan.flat_rate || ""} readOnly />
                    </div>
                    <div>
                        <label>Line Expiry Date</label>
                        <input type="text" value={loan.line_expiry_date || ""} readOnly />
                    </div>
                    <div>
                        <label>Installment Amount</label>
                        <input type="text" value={loan.emi_amount || ""} readOnly />
                    </div>
                    <div>
                        <label>Number of Installments</label>
                        <input type="text" value={loan.loan_tenure || ""} readOnly />
                    </div>
                    <div>
                        <label>Payment Frequency</label>
                        <input type="text" value="MONTHLY" readOnly />
                    </div>
                    <div>
                        <label>Approval Status</label>
                        <input type="text" value={loan.status || ""} readOnly />
                    </div>
                    <div>
                        <label>Dealer Remaining Amount</label>
                        <input type="text" value={loan.dealer_remaining_amount || ""} readOnly />
                    </div>
                </div>

                <h3>Disbursal Details</h3>
                <div className="grid-container">
                    <div>
                        <label>Disbursement UTR</label>
                        <input type="text" value={loan.disbursement_utr || ""} readOnly />
                    </div>
                    <div>
                        <label>Disbursement Date</label>
                        <input type="text" value={loan.disbursement_date || ""} readOnly />
                    </div>
                </div>

                <button className="save-button">Save</button>
            </div>
        </div>
    
};
export default LoanDetailsSidebar;
