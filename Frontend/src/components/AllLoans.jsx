import React, { useState, useEffect } from "react";
import api from "../api/api";
import "../styles/AllLoans.css"; // ✅ Import CSS file

const AllLoans = () => {
    const [loans, setLoans] = useState([]);

    useEffect(() => {
        api.get(`/ev-loans`)
            .then(response => setLoans(response.data))
            .catch(error => console.error("Error fetching loans:", error));
    }, []);

    return (
        <div className="all-loans-container">
            <h2>All EV Loans</h2>
            <table className="all-loans-table">
                <thead>
                    <tr>
                        <th>Loan ID</th>
                        <th>Customer Name</th>
                        <th>Loan Amount</th>
                        <th>Mobile Number</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {loans.map((loan) => (
                        <tr key={loan.id}>
                            <td>{loan.loan_id}</td>
                            <td>{loan.customer_name}</td>
                            <td>{loan.loan_amount}</td>
                            <td>{loan.mobile_number}</td>
                            <td>{loan.status}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default AllLoans;
