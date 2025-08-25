import React, { useState, useEffect } from "react";
import api from "../api/api";
import { useNavigate } from "react-router-dom";
import "../styles/ApprovedLoans.css";

const LoginCaseScreen = ({ apiUrl, title = "Login Stage Loans", lenderName = "EMI" }) => {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get(apiUrl)
      .then((response) => {
        setLoans(response.data);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching loans:", error);
        setError("Failed to fetch data.");
        setLoading(false);
      });
  }, [apiUrl]);

  const handleStatusChange = async (lan, newStatus, table) => {
  try {
    await api.put(`loan-booking/login-loans/${lan}`, { status: newStatus, table });
    setLoans((prevLoans) =>
      prevLoans.map((loan) =>
        loan.lan === lan ? { ...loan, status: newStatus } : loan
      )
    );
  } catch (err) {
    console.error("Error updating status:", err);
    alert("Failed to update status. Try again.");
  }
};


  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="approved-loans-container">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Loan Details</th>
            <th>Lender</th>
            <th>Partner Loan ID</th>
            <th>LAN</th>
            <th>Customer ID</th>
            <th>Mobile Number</th>
            <th>Status</th>
            <th>Disbursement Date</th>
            <th>Audit Trails</th>
            <th>Documents</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loans.map((loan) => (
            <tr key={loan.id}>
              <td>
                <span
                  className="clickable"
                  onClick={() =>
                    navigate(`/approved-loan-details/${loan.lan}`)
                  }
                >
                  {loan.customer_name}
                </span>
              </td>
              <td>{lenderName}</td>
              <td>{loan.partner_loan_id}</td>
              <td>{loan.lan}</td>
              <td>{loan.customer_id}</td>
              <td>
                <a href={`tel:${loan.mobile_number}`} className="phone-number">
                  {loan.mobile_number}
                </a>
              </td>
              <td>
                <span
                  className={
                    loan.status === "approved"
                      ? "status-approved"
                      : loan.status === "rejected"
                      ? "status-rejected"
                      : "status-pending"
                  }
                >
                  {loan.status || "Pending"}
                </span>
              </td>
              <td>{loan.disbursement_date || "-"}</td>
              <td>
                <button className="audit-trail-btn">≡</button>
              </td>
              <td>
                <button
                  className="audit-trail-btn"
                  onClick={() => navigate(`/documents/${loan.lan}`)}
                >
                  📂 Docs
                </button>
              </td>
              <td>
  <button
    className="approve-btn"
    onClick={() => handleStatusChange(loan.lan, "approved", "loan_booking_adikosh")}
  >
    ✅ Approve
  </button>
  <button
    className="reject-btn"
    onClick={() => handleStatusChange(loan.lan, "rejected", "loan_booking_adikosh")}
  >
    ❌ Reject
  </button>
</td>

            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default LoginCaseScreen;
