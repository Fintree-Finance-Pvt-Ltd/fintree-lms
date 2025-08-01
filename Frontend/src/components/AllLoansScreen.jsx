// components/DisbursedLoansTable.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import "../styles/DisbursedLoans.css";

const AllLoansScreen = ({ apiEndpoint, title = "Disbursed Loans", amountField = "disbursement_amount" }) => {
    const [disbursedLoans, setDisbursedLoans] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchDisbursedLoans = async () => {
            try {
                const response = await api.get(apiEndpoint);
                const sortedLoans = response.data.sort((a, b) => b.lan.localeCompare(a.lan));
                setDisbursedLoans(sortedLoans);
            } catch (err) {
                console.error(`Failed to fetch disbursed loans from ${apiEndpoint}`);
            }
        };

        fetchDisbursedLoans();
    }, [apiEndpoint]);

    return (
        <div className="disbursed-loans-container">
            <h2>{title}</h2>
            <table>
                <thead>
                    <tr>
                        <th>Customer Name</th>
                        <th>LAN</th>
                        <th>Disbursement Amount</th>
                        <th>Disbursement Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {disbursedLoans.map((loan) => (
                        <tr key={loan.lan}>
                            <td>
                                <span className="clickable" onClick={() => navigate(`/loan-details/${loan.lan}`)}>
                                    {loan.customer_name}
                                </span>
                            </td>
                            <td>
                                <span className="clickable" onClick={() => navigate(`/loan-details/${loan.lan}`)}>
                                    {loan.lan}
                                </span>
                            </td>
                            <td>{loan[amountField]}</td>
                            <td>{loan.disbursement_date}</td>
                            <td>{loan.status}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default AllLoansScreen;
