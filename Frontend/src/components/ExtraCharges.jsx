import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import "../styles/ExtraCharges.css";

const ExtraCharges = () => {
    const { lan } = useParams(); // ✅ Get LAN from URL
    const [charges, setCharges] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchCharges = async () => {
            try {
                const response = await api.get(`/loan-charges/${lan}`);
                setCharges(response.data);
            } catch (err) {
                setError("Failed to fetch extra charges.");
            } finally {
                setLoading(false);
            }
        };

        fetchCharges();
    }, [lan]);

    if (loading) return <p>Loading extra charges...</p>;
    if (error) return <p className="error">{error}</p>;

    return (
        <div className="extra-charges-container">
            <h2>Extra Charges for LAN: {lan}</h2>
            <table>
                <thead>
                    <tr>
                        <th>Charge Date</th>
                        <th>Charge Amount</th>
                        <th>Paid Amount</th>
                        <th>Waived Off Amount</th>
                        <th>Charge Type</th>
                        <th>Paid Status</th>
                        <th>Payment Time</th>
                        <th>Created At</th>
                    </tr>
                </thead>
                <tbody>
                    {charges.length > 0 ? (
                        charges.map((charge) => (
                            <tr key={charge.id}>
                                <td>{charge.due_date}</td>
                                <td>{charge.amount}</td>
                                <td>{charge.paid_amount}</td>
                                <td>{charge.waived_off}</td>
                                <td>{charge.charge_type}</td>
                                <td>{charge.paid_status}</td>
                                <td>{charge.payment_time || "N/A"}</td>
                                <td>{charge.created_at}</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="8">No extra charges found.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default ExtraCharges;
