import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import "../styles/Schedule.css"; // ✅ Import CSS file

const FintreeROI = () => {
    const { lan } = useParams();
    const [schedule, setSchedule] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const getStatusClass = (status) => {
        switch (status) {
            case "Due":
                return "due-status";       // Yellow
            case "Paid":
                return "paid-status";      // Green
            case "Part Paid":
                return "part-paid-status"; // Orange
            case "Late":
                return "late-status";      // Red
            case "Not Set":
                return "not-set-status";   // Gray
            default:
                return "";
        }
    };
    
    const getDPDClass = (dpd) => {
        if (dpd >= 90) {
            return "dpd-red";   // Above 90 - Red
        } else if (dpd >= 60) {
            return "dpd-orange"; // 60-89 - Orange
        } else if (dpd >= 30) {
            return "dpd-yellow"; // 30-59 - Yellow
        } else {
            return ""; // No color for DPD < 30
        }
    };
    


    useEffect(() => {
        const fetchSchedule = async () => {
            try {
                const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/loan-booking/schedule/adikosh/fintree-roi/${lan}`);
                setSchedule(response.data);
            } catch (err) {
                setError("Failed to fetch schedule.");
            } finally {
                setLoading(false);
            }
        };

        fetchSchedule();
    }, [lan]);

    const formatDate = (dateString) => {

        if (!dateString) return "-"; // ✅ Handle null/undefined values

   

        try {

            const date = new Date(dateString); // ✅ Parse correctly

            return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });

        } catch (error) {

            console.error("Date parsing error:", error, dateString);

            return "Invalid Date"; // ✅ Ensure no frontend crashes

        }

    };

    if (loading) return <p>Loading...</p>;
    if (error) return <p>{error}</p>;

    return (
        <div className="schedule-page-container">
            <div className="schedule-content">
                <h2>Repayment Schedule</h2>
                {schedule.length === 0 ? (
                    <p>No schedule available.</p>
                ) : (
                    <div className="schedule-table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Due Date</th>
                                    <th>Status</th>
                                    <th>EMI</th>
                                    <th>Principal</th>
                                    <th>Interest</th>
                                    <th>Payment Date</th>
                                    <th>DPD</th>
                                    <th>Remaining Amount</th>
                                    <th>Remaining Principal</th>
                                    <th>Remaining Interest</th>
                                </tr>
                            </thead>
                            <tbody>
                                {schedule.map((payment, index) => (
                                    <tr key={index}>
                                        <td>{formatDate(payment.due_date)}</td>
                                        <td>
    <span className={`status-label ${getStatusClass(payment.status)}`}>
        {payment.status}
    </span>
</td>

                                        <td>{payment.emi}</td>
                                        <td>{payment.principal}</td>
                                        <td>{payment.interest}</td>
                                        <td>{formatDate(payment.payment_date)}</td>
                                        <td className={`dpd-label ${getDPDClass(payment.dpd)}`}>
    {payment.dpd}
</td>

                                        <td>{payment.remaining_emi}</td>
                                        <td>{payment.remaining_principal}</td>
                                        <td>{payment.remaining_interest}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FintreeROI;
