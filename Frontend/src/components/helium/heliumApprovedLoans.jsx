// src/components/ApprovedLoansTable.js
import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const heliumApprovedLoans = ({
  apiUrl = "/helium-loans/approved-loans",
  title = "Approved Loans",
}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    let off = false;
    setLoading(true);
    setErr("");
    api
      .get(apiUrl)
      .then((res) => !off && setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => !off && setErr("Failed to fetch data."))
      .finally(() => !off && setLoading(false));
    return () => (off = true);
  }, [apiUrl]);

  const columns = [
    {
      key: "customer_name",
      header: "Loan Details",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => nav(`/approved-loan-details-helium/${r.lan}`)}
        >
          {r.customer_name ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
      csvAccessor: (r) => r.customer_name || "",
      width: 220,
    },
    { key: "partner_loan_id", header: "Partner Loan ID", sortable: true, width: 160 },
    { key: "lan", header: "LAN", sortable: true, width: 140 },
    { key: "mobile_number", header: "Mobile Number", sortable: true, width: 160 },
    {
      key: "status",
      header: "Status",
      render: () => (
        <span
          style={{
            display: "inline-flex",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            background: "rgba(16,185,129,.12)",
            color: "#065f46",
            border: "1px solid rgba(16,185,129,.35)",
          }}
        >
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
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #93c5fd",
            color: "#1d4ed8",
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          📂 Docs
        </button>
      ),
      csvAccessor: () => "",
      width: 110,
    },

    // 🔹 New: Add Bank Details button (UI only)
    {
      key: "bank_details",
      header: "Bank Details",
      render: (r) => (
        <button
          type="button"
          onClick={() =>
            alert(`Add bank details for LAN: ${r.lan} (to be implemented)`)
          }
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#f9fafb",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          + Add Bank
        </button>
      ),
      csvAccessor: () => "",
      width: 130,
    },

    // 🔹 New: Agreement Generation button (UI only)
    {
      key: "agreement",
      header: "Agreement",
      render: (r) => (
        <button
          type="button"
          onClick={() =>
            alert(`Generate agreement for LAN: ${r.lan} (to be implemented)`)
          }
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#f9fafb",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          📝 Agreement
        </button>
      ),
      csvAccessor: () => "",
      width: 140,
    },
  ];

  return (
    <>
      <LoaderOverlay show={loading} label="Fetching data…" />
      {err && <p style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</p>}
      <DataTable
        title={title}
        rows={rows}
        columns={columns}
        globalSearchKeys={["customer_name", "partner_loan_id", "lan", "mobile_number"]}
        initialSort={{ key: "lan", dir: "asc" }}
        exportFileName="approved_loans"
      />
    </>
  );
};

export default heliumApprovedLoans;
