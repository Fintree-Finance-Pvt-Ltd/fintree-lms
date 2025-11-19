import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/api";

const InterestLedger = () => {
  const { lan } = useParams();

  const [loan, setLoan] = useState(null);
  const [summary, setSummary] = useState({
    total_accrued_interest_lifetime: 0,
    total_interest_paid: 0,
    pending_interest: 0,
  });
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLedger();
  }, [lan]);

  const fetchLedger = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await api.get(`/wctl-ccod/interest-ledger/${lan}`);
      if (res.data.success) {
        setLoan(res.data.loan);
        setSummary(res.data.summary);
        setRows(res.data.ledger);
      } else {
        setMessage(res.data.message || "Failed to load interest ledger.");
      }
    } catch (err) {
      console.error("Interest ledger error", err);
      setMessage("Failed to load interest ledger.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ledger-container">
      <h2>Interest Ledger — LAN: {lan}</h2>

      {loading && <p>Loading...</p>}
      {message && <div className="message">{message}</div>}

      {loan && (
        <>
          {/* Loan Summary */}
          <div className="summary-box">
            <h3>Loan Summary</h3>
            <p>Loan Limit: <b>₹{loan.loan_limit}</b></p>
            <p>Outstanding Principal: <b>₹{loan.outstanding_principal}</b></p>
            <p>Annual Interest Rate: <b>{loan.annual_interest_rate}%</b></p>
            <p>Status: <b>{loan.status}</b></p>
          </div>

          {/* Interest Summary */}
          <div className="summary-box summary-two">
            <div>
              <h4>Total Accrued (Lifetime)</h4>
              <p><b>₹{summary.total_accrued_interest_lifetime}</b></p>
            </div>
            <div>
              <h4>Total Interest Paid</h4>
              <p style={{ color: "green" }}>
                <b>₹{summary.total_interest_paid}</b>
              </p>
            </div>
            <div>
              <h4>Pending Interest</h4>
              <p style={{ color: "red" }}>
                <b>₹{summary.pending_interest}</b>
              </p>
            </div>
          </div>

          {/* Ledger Table */}
          <h3>Daily Interest Accrual</h3>
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Outstanding Principal</th>
                <th>Rate (%)</th>
                <th>Daily Interest</th>
                <th>Cumulative Interest</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.interest_date}</td>
                  <td>₹{r.outstanding_principal}</td>
                  <td>{r.annual_interest_rate}</td>
                  <td>₹{r.daily_interest}</td>
                  <td>₹{r.total_interest}</td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center" }}>
                    No interest ledger entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <style>{`
        .ledger-container {
          max-width: 1000px;
          margin: 2rem auto;
          background: #fafafa;
          padding: 2rem;
          border-radius: 10px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        h2 { text-align: center; margin-bottom: 1.5rem; }
        .summary-box {
          margin-bottom: 1rem;
          padding: 1rem;
          background: #eef7ff;
          border-radius: 8px;
        }
        .summary-two {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
        }
        .summary-two > div {
          flex: 1;
        }
        .ledger-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
        }
        .ledger-table th, .ledger-table td {
          padding: 8px 10px;
          border-bottom: 1px solid #ddd;
          text-align: left;
        }
        .message {
          margin: 0.5rem 0;
          padding: 0.5rem;
          background: #fee2e2;
          color: #b91c1c;
          border-radius: 6px;
        }
      `}</style>
    </div>
  );
};

export default InterestLedger;
