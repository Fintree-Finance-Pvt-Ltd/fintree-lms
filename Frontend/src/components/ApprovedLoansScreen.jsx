// src/components/ApprovedLoansTable.js
import React, { useEffect, useState } from "react";
import api from "../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "./ui/DataTable";
import LoaderOverlay from "./ui/LoaderOverlay";


const ApprovedLoansTable = ({ apiUrl, title = "Approved Loans" }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    let off = false;
    setLoading(true);
    setErr("");
    api.get(apiUrl)
      .then((res) => !off && setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => !off && setErr("Failed to fetch data."))
      .finally(() => !off && setLoading(false));
    return () => (off = true);
  }, [apiUrl]);

    const hasADK = rows.some((r) => typeof r?.lan === "string" && /^ADK/i.test(r.lan));
  const hasEV = rows.some((r) => typeof r?.lan === "string" && /^EV/i.test(r.lan));
  const hasGQFSF = rows.some((r) => typeof r?.lan === "string" && /^GQFSF/i.test(r.lan));
  const hasGQNonFSF = rows.some((r) => typeof r?.lan === "string" && /^GQNONFSF/i.test(r.lan));


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
    // Batch ID column (only for ADK LANs; non-ADK shows —)
    ...(hasADK
      ? [
          {
            key: "batch_id",
            header: "Batch ID",
            sortable: true,
            render: (r) => (/^ADK/i.test(r?.lan) ? (r.batch_id ?? "—") : "—"),
            sortAccessor: (r) =>
              /^ADK/i.test(r?.lan) ? String(r?.batch_id || "").toLowerCase() : "",
            csvAccessor: (r) => (/^ADK/i.test(r?.lan) ? (r.batch_id ?? "") : ""),
            width: 140,
          },
        ]
      : []),

      // Batch ID column (only for GQFSF LANs; non-GQFSF shows —)
    ...(hasGQFSF
      ? [
          {
            key: "app_id",
            header: "APP ID",
            sortable: true,
            render: (r) => (/^GQFSF/i.test(r?.lan) ? (r.app_id ?? "—") : "—"),
            sortAccessor: (r) =>
              /^GQFSF/i.test(r?.lan) ? String(r?.app_id || "").toLowerCase() : "",
            csvAccessor: (r) => (/^GQFSF/i.test(r?.lan) ? (r.app_id ?? "") : ""),
            width: 140,
          },
        ]
      : []),
      // App ID column (only for NonGQFSF LANs; non-FSFshows —)
    ...(hasGQNonFSF
      ? [
          {
            key: "app_id",
            header: "APP ID",
            sortable: true,
            render: (r) => (/^GQNonFSF/i.test(r?.lan) ? (r.app_id ?? "—") : "—"),
            sortAccessor: (r) =>
              /^GQNonFSF/i.test(r?.lan) ? String(r?.app_id || "").toLowerCase() : "",
            csvAccessor: (r) => (/^GQNonFSF/i.test(r?.lan) ? (r.app_id ?? "") : ""),
            width: 140,
          },
        ]
      : []),
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
    <>
    <LoaderOverlay show={loading} label="Fetching data…" />
      {err && <p style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</p>}
    <DataTable
      title={title}
      rows={rows}
      columns={columns}
      globalSearchKeys={["customer_name", "lender","app_id", "batch_id", "partner_loan_id", "lan", "mobile_number"]}
      initialSort={{ key: "lan", dir: "asc" }}
      exportFileName="approved_loans"
    />
    </>
  );
};

export default ApprovedLoansTable;
