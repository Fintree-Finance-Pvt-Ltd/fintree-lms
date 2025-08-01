import React from "react";
import "../styles/LoanDetails.css"; // ✅ Import the CSS

const LoanDetails = ({ data }) => {
    const showRetentionFields = data.lan?.startsWith("GQF");
    const showSubventionFields = data.lan?.startsWith("GQN");

    return (
        <div className="loan-details-content">
            <h2>Loan Application By {data.customer_name}</h2>

            <div className="loan-details-grid">
                <div className="loan-details-field">
                    <label>LAN</label>
                    <input type="text" value={data.lan} readOnly />
                </div>

                <div className="loan-details-field">
                    <label>Created At</label>
                    <input type="text" value={data.login_date} readOnly />
                </div>

                <div className="loan-details-field">
                    <label>Mobile Number</label>
                    <input type="text" value={data.mobile_number} readOnly />
                </div>

                <div className="loan-details-field">
                    <label>Email</label>
                    <input type="text" value={data.email} readOnly />
                </div>

                <div className="loan-details-field">
                    <label>Approval Status</label>
                    <input type="text" value={data.status} readOnly />
                </div>
            </div>

            <h3>Loan Details</h3>
            <div className="loan-details-grid">
                <div className="loan-details-field">
                    <label>Approved Loan Amount</label>
                    <input type="text" value={data.loan_amount} readOnly />
                </div>

                <div className="loan-details-field">
                    <label>Interest Rate</label>
                    <input type="text" value={data.interest_rate} readOnly />
                </div>

                <div className="loan-details-field">
                    <label>Installment Amount</label>
                    <input type="text" value={data.emi_amount || data.monthly_emi} readOnly />
                </div>

                <div className="loan-details-field">
                    <label>Number of Installments</label>
                    <input type="text" value={data.loan_tenure} readOnly />
                </div>

                <div className="loan-details-field">
                    <label>Payment Frequency</label>
                    <input type="text" value="Monthly" readOnly />
                </div>

                {showRetentionFields && (
                    <>
                        <div className="loan-details-field">
                            <label>Subvention Amount</label>
                            <input type="text" value={data.subvention_amount || "0.00"} readOnly />
                        </div>

                        <div className="loan-details-field">
                            <label>Retention Percentage</label>
                            <input type="text" value={data.retention_percentage || "0"} readOnly />
                        </div>

                        <div className="loan-details-field">
                            <label>Retention Amount</label>
                            <input type="text" value={data.retention_amount || "0.00"} readOnly />
                        </div>
                    </>
                )}

                {showSubventionFields && (
                    <>
                        <div className="loan-details-field">
                            <label>Subvention Amount</label>
                            <input type="text" value={data.subvention_amount || "0.00"} readOnly />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default LoanDetails;




// import React, { useEffect, useState } from "react";
// import { useParams } from "react-router-dom";
// import axios from "axios";
// import "../styles/LoanDetails.css";

// const LoanDetailsPage = () => {
//     const { lan } = useParams();
//     const [loanDetails, setLoanDetails] = useState(null);
//     const [loading, setLoading] = useState(true);
//     const [error, setError] = useState("");

//     useEffect(() => {
//         const fetchLoanDetails = async () => {
//             try {
//                 const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/loan-booking/details/${lan}`);
//                 setLoanDetails(response.data);
//             } catch (err) {
//                 setError("Failed to fetch loan details.");
//             } finally {
//                 setLoading(false);
//             }
//         };

//         fetchLoanDetails();
//     }, [lan]);

//     if (loading) return <p>Loading...</p>;
//     if (error) return <p>{error}</p>;

//     return (
//         <div className="loan-details-content">
//             <h2>Loan Application By {loanDetails.customer_name}</h2>
//             <p><strong>LAN:</strong> {loanDetails.lan}</p>
//             <p><strong>Created At:</strong> {loanDetails.login_date}</p>
//             <p><strong>Mobile Number:</strong> {loanDetails.mobile_number}</p>
//             <p><strong>Email:</strong> {loanDetails.email}</p>
//             <p><strong>Approval Status:</strong> {loanDetails.status}</p>

//             <h3>Loan Details</h3>
//             <p><strong>Approved Loan Amount:</strong> {loanDetails.loan_amount}</p>
//             <p><strong>Interest Rate:</strong> {loanDetails.interest_rate}</p>
//             <p><strong>Installment Amount:</strong> {loanDetails.emi_amount}</p>
//             <p><strong>Number of Installments:</strong> {loanDetails.loan_tenure}</p>
//             <p><strong>Payment Frequency:</strong> Monthly</p>
//         </div>
//     );
// };

// export default LoanDetailsPage;
