import React, { useCallback, useEffect, useState } from "react";
import api from "../api/api";

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("en-IN");
};

const StatusTable = ({ title, rows, emptyText }) => (
  <div style={{ marginBottom: 32 }}>
    <h3>
      {title} ({rows.length})
    </h3>
    {rows.length === 0 ? (
      <p>{emptyText}</p>
    ) : (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">LAN</th>
            <th align="left">Customer</th>
            <th align="right">Amount</th>
            <th align="left">Payout Status</th>
            <th align="left">Failure Reason</th>
            <th align="left">Loan Status</th>
            <th align="left">Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.unique_request_number}>
              <td>{r.lan}</td>
              <td>{r.customer_name || "-"}</td>
              <td align="right">{Number(r.amount || 0).toLocaleString("en-IN")}</td>
              <td>{r.payout_status || r.status || "-"}</td>
              <td>{r.failure_reason || "-"}</td>
              <td>{r.loan_status || "-"}</td>
              <td>{formatDate(r.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const EmiClubPayoutStatus = () => {
  const [data, setData] = useState({ failed: [], in_process: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    console.log("[EMICLUB-PAYOUT-STATUS] fetching");
    try {
      const res = await api.get("/loan-booking/emiclub-payout-status");
      console.log("[EMICLUB-PAYOUT-STATUS] received", {
        failed: res.data?.counts?.failed ?? res.data?.failed?.length,
        in_process: res.data?.counts?.in_process ?? res.data?.in_process?.length,
      });
      setData({
        failed: res.data?.failed || [],
        in_process: res.data?.in_process || [],
      });
    } catch (e) {
      console.error("Failed to load EmiClub payout status", e);
      setError("Failed to load payout status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>EmiClub Payout Status</h2>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <StatusTable
        title="Failed"
        rows={data.failed}
        emptyText="No failed payouts."
      />
      <StatusTable
        title="In Process / Initiated"
        rows={data.in_process}
        emptyText="No payouts in process."
      />
    </div>
  );
};

export default EmiClubPayoutStatus;
