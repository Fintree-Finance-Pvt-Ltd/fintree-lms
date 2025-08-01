import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/api";
import "../styles/LoanDetails.css"; // ✅ Import the CSS


const ApprovedCaseDetails = () => {

    const { lan } = useParams();
    const [data, setData] = useState(null);
    const navigate = useNavigate();
    const showRetentionFields = lan.startsWith("GQF");
    const showSubventionFields = lan.startsWith("GQN");

    useEffect(() => {
        const fetchLoanDetails = async () => {
            try {
                const response = await api.get(`/loan-booking/${lan}`);
                setData(response.data);
            } catch (err) {
                console.error("Failed to fetch loan details.");
            }
        };
        fetchLoanDetails();
    }, [lan]);

    if (!data) return <p>Loading...</p>;

    return (
        <div className="loan-details-content">
            <button
                onClick={() => navigate(-1)} // or replace -1 with "/dashboard"
                style={{
                    marginBottom: "20px",
                    padding: "8px 16px",
                    backgroundColor: "#4e4e4e",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                }}
            >
                ← Back
            </button>

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
                    <input type="text" value={data.emi_amount} readOnly />
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

export default ApprovedCaseDetails