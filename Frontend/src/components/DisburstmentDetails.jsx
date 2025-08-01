

import React, { useEffect, useState } from "react";
import api from "../api/api";
import { useParams } from "react-router-dom";
import "../styles/DisbursementDetails.css"; // ✅ Import CSS file

const DisbursementDetails = () => {
    const { lan } = useParams();
    const [disbursalData, setDisbursalData] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchDisbursalDetails = async () => {
            try {
                const response = await api.get(`/disbursal/${lan}`);
                setDisbursalData(response.data);
            } catch (err) {
                setError("Failed to fetch disbursal details.");
            }
        };

        fetchDisbursalDetails();
    }, [lan]);

    if (error) return <p>{error}</p>;
    if (!disbursalData) return <p>Loading...</p>;

    return (
        <div className="disbursement-details">
            <h2>Disbursal Details</h2>
            <div className="details-grid">
                <div className="details-field">
                    <label>Disbursal Amount</label>
                    <input type="text" value={disbursalData.loan_amount || disbursalData.loan_amount} readOnly />
                </div>

                <div className="details-field">
                    <label>Partner Loan ID</label>
                    <input type="text" value={disbursalData.partner_loan_id } readOnly />
                </div>

                <div className="details-field">
                    <label>Processing Fee</label>
                    <input type="text" value={disbursalData.processing_fee} readOnly />
                </div>

                <div className="details-field">
                    <label>Agreement Date</label>
                    <input type="text" value={disbursalData.agreement_date} readOnly />
                </div>

                <div className="details-field">
                    <label>Disbursement UTR</label>
                    <input type="text" value={disbursalData.disbursement_utr || "N/A"} readOnly />
                </div>

                <div className="details-field">
                    <label>Disbursement Date</label>
                    <input type="text" value={disbursalData.disbursement_date || "N/A"} readOnly />
                </div>
                <div className="details-field">
                    <label>Approved Loan Amount</label>
                    <input type="text" value={disbursalData.loan_amount} readOnly />
                </div>

                <div className="details-field">
                    <label>Interest Rate</label>
                    <input type="text" value={disbursalData.interest_rate} readOnly />
                </div>
                <div className="details-field">
  <label>Number of Installments</label>
  <input
    type="text"
    value={
      disbursalData.lan?.startsWith("GQ")
        ? disbursalData.loan_tenure_months
        : disbursalData.loan_tenure
    }
    readOnly
  />
</div>

                <div className="details-field">
                    <label>Pre EMI</label>
                    <input type="text" value={disbursalData.pre_emi} readOnly />
                </div>
                <div className="details-field">
                    <label>Net Disbursment</label>
                    <input type="text" value={disbursalData.net_disbursement} readOnly />
                </div>
            </div>
        </div>
    );
};

export default DisbursementDetails;
