import React, { useEffect, useState } from "react";
import api from "../api/api";
import "../styles/ScheduleSidebar.css"; 

const ScheduleSidebar = ({ lan, onClose }) => {
    const [schedule, setSchedule] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!lan) return;

        const fetchScheduleData = async () => {
            try {
                const response = await api.get(`/schedule/${lan}`);
                setSchedule(response.data);
            } catch (err) {
                setError("Failed to fetch schedule details.");
            } finally {
                setLoading(false);
            }
        };

        fetchScheduleData();
    }, [lan]);

    if (!lan) return null;
    if (loading) return <p>Loading...</p>;
    if (error) return <p>{error}</p>;

    return (
        <div className="sidebar-container">
            <div className="sidebar-header">
                <h3>Schedule</h3>
                <button onClick={onClose} className="close-btn">✖</button>
            </div>

            <div className="sidebar-content">
                <table>
                    <thead>
                        <tr>
                            <th>Due Date</th>
                            <th>Status</th>
                            <th>EMI</th>
                            <th>Interest</th>
                            <th>Principal</th>
                            <th>Remaining EMI</th>
                            <th>Remaining Interest</th>
                            <th>Remaining Principal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {schedule.map((row, index) => (
                            <tr key={index}>
                                <td>{row.due_date}</td>
                                <td>{row.status}</td>
                                <td>{row.emi}</td>
                                <td>{row.interest}</td>
                                <td>{row.principal}</td>
                                <td>{row.remaining_emi}</td>
                                <td>{row.remaining_interest}</td>
                                <td>{row.remaining_principal}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ScheduleSidebar;
