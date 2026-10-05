import React, { useState, useEffect } from "react";
import api from "../api/api";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const PayoutReinitiate = () => {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const fetchFailedPayouts = async () => {
    try {
      setLoading(true);
      const response = await api.get("/payout/failed-payouts");
      setPayouts(response.data);
    } catch (error) {
      console.error("Failed to fetch payouts:", error);
      toast.error("Failed to fetch payouts. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFailedPayouts();
  }, []);

  const handleReinitiate = async (id, lan) => {
    if (!window.confirm(`Are you sure you want to reinitiate payout for ${lan}?`)) return;

    try {
      setProcessingId(id);
      const response = await api.post("/api/payout/reinitiate", { id, lan });
      toast.success(response.data.message || "Payout reinitiated successfully!");
      // Refresh list
      fetchFailedPayouts();
    } catch (error) {
      console.error("Reinitiate error:", error);
      const msg = error.response?.data?.message || "Failed to reinitiate payout.";
      toast.error(msg);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="container-fluid p-4">
      <h2 className="mb-4">Payout Reinitiate</h2>
      <p className="text-muted">Manage and reinitiate failed payouts from the Quick Transfer system.</p>
      
      {loading ? (
        <div className="text-center mt-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : (
        <div className="table-responsive shadow-sm bg-white rounded">
          <table className="table table-hover table-striped align-middle mb-0">
            <thead className="table-dark">
              <tr>
                <th>ID</th>
                <th>LAN</th>
                <th>Status</th>
                <th>Failure Reason</th>
                <th>Created At</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-muted">
                    No failed payouts found.
                  </td>
                </tr>
              ) : (
                payouts.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td><strong>{p.lan}</strong></td>
                    <td>
                      <span className={`badge ${p.status.toLowerCase() === 'initiated' ? 'bg-warning text-dark' : 'bg-danger'}`}>
                        {p.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="text-danger small" style={{ maxWidth: '300px', whiteSpace: 'normal' }}>
                      {p.failure_reason}
                    </td>
                    <td>{new Date(p.created_at).toLocaleString()}</td>
                    <td className="text-center">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleReinitiate(p.id, p.lan)}
                        disabled={processingId === p.id}
                      >
                        {processingId === p.id ? "Processing..." : "Reinitiate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PayoutReinitiate;
