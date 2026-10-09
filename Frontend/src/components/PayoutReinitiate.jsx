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
      const response = await api.post("/payout/reinitiate", { id, lan });
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
    <div className="container-fluid p-4" style={{ backgroundColor: "#f8f9fa", minHeight: "100vh" }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1 fw-bold text-dark">Payout Reinitiate</h2>
          <p className="text-muted mb-0">Manage and reinitiate failed payouts from the Quick Transfer system.</p>
        </div>
      </div>
      
      {loading ? (
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "400px" }}>
          <div className="spinner-border text-primary" role="status" style={{ width: "3rem", height: "3rem" }}>
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : (
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 bg-white">
              <thead className="table-light text-muted" style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                <tr>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">ID</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">LAN</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">Status</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">Failure Reason</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">Created At</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="border-top-0">
                {payouts.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-5 text-muted">
                      <i className="bi bi-inbox fs-2 d-block mb-2"></i>
                      No failed payouts found.
                    </td>
                  </tr>
                ) : (
                  payouts.map((p) => {
                    const isEligible = p.failure_reason?.includes("Transaction declined by ICICI bank due to insufficient funds in remitter account");
                    
                    return (
                      <tr key={p.id} style={{ transition: "all 0.2s ease" }}>
                        <td className="px-4 text-muted">#{p.id}</td>
                        <td className="px-4">
                          <span className="fw-bold text-dark">{p.lan}</span>
                        </td>
                        <td className="px-4">
                          <span 
                            className="badge rounded-pill px-3 py-2"
                            style={{
                              backgroundColor: p.status.toLowerCase() === 'initiated' ? '#fff3cd' : '#f8d7da',
                              color: p.status.toLowerCase() === 'initiated' ? '#856404' : '#721c24',
                              fontWeight: '600',
                              letterSpacing: '0.5px',
                              fontSize: '0.75rem'
                            }}
                          >
                            {p.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ maxWidth: '350px' }}>
                          <div 
                            className={`small ${isEligible ? 'text-danger fw-semibold' : 'text-muted'}`} 
                            style={{ 
                              whiteSpace: 'normal', 
                              lineHeight: '1.4'
                            }}
                          >
                            {p.failure_reason || "Unknown reason"}
                          </div>
                        </td>
                        <td className="px-4 text-muted small">
                          {new Date(p.created_at).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </td>
                        <td className="px-4 text-center">
                          <button
                            className={`btn btn-sm px-4 py-2 rounded-pill fw-semibold shadow-none ${isEligible ? 'btn-primary' : 'btn-light text-muted border'}`}
                            onClick={() => handleReinitiate(p.id, p.lan)}
                            disabled={processingId === p.id || !isEligible}
                            style={{
                              transition: "all 0.2s ease",
                              cursor: (!isEligible || processingId === p.id) ? "not-allowed" : "pointer",
                              opacity: (!isEligible || processingId === p.id) ? 0.6 : 1
                            }}
                          >
                            {processingId === p.id ? (
                              <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing</>
                            ) : isEligible ? "Reinitiate" : "Not Eligible"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayoutReinitiate;
