// src/components/ApprovedLoansTable.js
import React, { useEffect, useState } from "react";
import api from "../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "./ui/DataTable";

const ApprovedLoansTable = ({ apiUrl, title = "Approved Loans" }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    let off = false;
    setLoading(true);
    api.get(apiUrl)
      .then((res) => !off && setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => !off && setErr("Failed to fetch data."))
      .finally(() => !off && setLoading(false));
    return () => (off = true);
  }, [apiUrl]);

  if (loading) return <p>Loading…</p>;
  if (err) return <p style={{ color: "#b91c1c" }}>{err}</p>;

  const columns = [
    {
      key: "customer_name",
      header: "Loan Details",
      sortable: true,
      render: (r) => (
        <span style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
              onClick={() => nav(`/approved-loan-details/${r.lan}`)}>
          {r.customer_name ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
      csvAccessor: (r) => r.customer_name || "",
      width: 220,
    },
    { key: "lender", header: "Lender", sortable: true, width: 140 },
    { key: "partner_loan_id", header: "Partner Loan ID", sortable: true, width: 160 },
    { key: "lan", header: "LAN", sortable: true, width: 140 },
    { key: "mobile_number", header: "Mobile Number", sortable: true, width: 160 },
    {
      key: "status",
      header: "Status",
      render: () => (
        <span style={{
          display: "inline-flex", gap: 6, padding: "6px 10px",
          borderRadius: 999, fontSize: 12, fontWeight: 700,
          background: "rgba(16,185,129,.12)", color: "#065f46",
          border: "1px solid rgba(16,185,129,.35)"
        }}>
          ● Approved
        </span>
      ),
      csvAccessor: () => "Approved",
      width: 130,
    },
    {
      key: "docs",
      header: "Docs",
      render: (r) => (
        <button
          onClick={() => nav(`/documents/${r.lan}`)}
          style={{
            padding: "8px 10px", borderRadius: 8, border: "1px solid #93c5fd",
            color: "#1d4ed8", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600
          }}
        >
          📂 Docs
        </button>
      ),
      csvAccessor: () => "",
      width: 110,
    },
  ];

  return (
    <DataTable
      title={title}
      rows={rows}
      columns={columns}
      globalSearchKeys={["customer_name", "lender", "partner_loan_id", "lan", "mobile_number"]}
      initialSort={{ key: "lan", dir: "asc" }}
      exportFileName="approved_loans"
    />
  );
};

export default ApprovedLoansTable;
