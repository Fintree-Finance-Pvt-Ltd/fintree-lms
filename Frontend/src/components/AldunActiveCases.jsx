import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";

const ActiveLoans = () => {
  const [loans, setLoans] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchLoanDetails = async () => {
        try {
            const response = await api.get(`/loan-booking/aldun-active-loans`);
            setLoans(response.data);
        } catch (err) {
            console.error("Failed to fetch loan details.");
        }
    }
    fetchLoanDetails();
    }, []);

    const markInactive = async (loan_account_number) => {
  if (!window.confirm("Are you sure you want to mark this loan as Inactive?")) return;

  try {
  await api.patch(`/loan-booking/aldun-loans/${loan_account_number}/inactive`);
  
  alert("✅ Loan marked as Inactive");

  // Refresh the loan list without reloading the entire page
  const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/loan-booking/aldun-active-loans`);
  setLoans(response.data);
} catch (error) {
  alert(error.response?.data?.message || "❌ Failed to mark as inactive.");
}

};


  return (
    <div style={{ padding: "20px" }}>
      <h2>Active ALdun Loans</h2>
      <table border="1" cellPadding="10">
        <thead>
          <tr>
            <th>Loan Account Number</th>
            <th>Customer Name</th>
            <th>POS</th>
            <th>DPD</th>
            <th>Overdue Till Today</th>
            <th>Upload Collection</th>
          </tr>
        </thead>
        <tbody>
          {loans.map((loan) => (
            <tr key={loan.loan_account_number}>
              <td>{loan.loan_account_number}</td>
              <td>{loan.customer_name}</td>
              <td>{loan.pos}</td>
              <td>{loan.dpd_in_days}</td>
              <td>{loan.total_overdue_till_today}</td>
              <td>
                <button onClick={() => navigate(`/aldun-loans/collection/${loan.loan_account_number}`)}>
                  Upload Collection
                </button>
                 &nbsp;
  <button onClick={() => markInactive(loan.loan_account_number)} style={{ marginLeft: "10px" }}>
    Mark Inactive
  </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ActiveLoans;
