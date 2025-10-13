// components/DisbursedLoansTable.jsx (AllLoansScreen)
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import DataTable from "./ui/DataTable";
import LoaderOverlay from "./ui/LoaderOverlay";

const AllLoansScreen = ({ apiEndpoint, title = "Disbursed Loans", amountField = "disbursement_amount" }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    let off = false;
    setLoading(true);
    setErr("");
    api.get(apiEndpoint)
      .then((res) => {
        if (off) return;
        const data = Array.isArray(res.data) ? res.data : [];
        const sorted = [...data].sort((a, b) => String(b?.lan ?? "").localeCompare(String(a?.lan ?? "")));
        setRows(sorted);
      })
      .catch(() => !off && setErr("Failed to fetch data."))
      .finally(() => !off && setLoading(false));
    return () => (off = true);
  }, [apiEndpoint]);

  const hasADK = rows.some((r) => typeof r?.lan === "string" && /^ADK/i.test(r.lan));
  const hasEV = rows.some((r) => typeof r?.lan === "string" && /^EV/i.test(r.lan));
  const hasGQFSF = rows.some((r) => typeof r?.lan === "string" && /^GQFSF/i.test(r.lan));
  const hasGQNonFSF = rows.some((r) => typeof r?.lan === "string" && /^GQNONFSF/i.test(r.lan));

  const nf = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

  const columns = [
    {
      key: "customer_name",
      header: "Customer Name",
      sortable: true,
      render: (r) => (
        <span style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
              onClick={() => nav(`/loan-details/${r.lan}`)}>
          {r.customer_name ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
      width: 220,
    },
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      render: (r) => (
        <span style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
              onClick={() => nav(`/loan-details/${r.lan}`)}>
          {r.lan ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.lan || "").toLowerCase(),
      width: 150,
    },
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

      ...(hasEV
      ? [
          {
            key: "partner_loan_id",
            header: "Partner Loan ID",
            sortable: true,
            render: (r) => (/^EV/i.test(r?.lan) ? (r.partner_loan_id ?? "—") : "—"),
            sortAccessor: (r) =>
              /^EV/i.test(r?.lan) ? String(r?.partner_loan_id || "").toLowerCase() : "",
            csvAccessor: (r) => (/^EV/i.test(r?.lan) ? (r.partner_loan_id ?? "") : ""),
            width: 140,
          },
        ]
      : []),
    {
      key: amountField,
      header: "Disbursement Amount",
      sortable: true,
      render: (r) => {
        const raw = r?.[amountField] ?? r?.loan_amount;
        const n = Number(raw);
        return Number.isFinite(n) ? nf.format(n) : "—";
      },
      sortAccessor: (r) => {
        const v = Number(r?.[amountField] ?? r?.loan_amount ?? 0);
        return Number.isFinite(v) ? v : 0;
      },
      width: 190,
    },
    {
      key: "disbursement_date",
      header: "Disbursement Date",
      sortable: true,
      sortAccessor: (r) => (r.disbursement_date ? Date.parse(r.disbursement_date) : 0),
      width: 170,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (r) => {
        const map = {
          Disbursed: { bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.35)", fg: "#065f46" },
          Settled:   { bg: "rgba(59,130,246,.12)",  bd: "rgba(59,130,246,.35)",  fg: "#1e3a8a"  },
          Pending:   { bg: "rgba(234,179,8,.12)",   bd: "rgba(234,179,8,.35)",   fg: "#713f12"  },
          Failed:    { bg: "rgba(239,68,68,.12)",   bd: "rgba(239,68,68,.35)",   fg: "#7f1d1d"  },
        };
        const c = map[r.status] || { bg: "rgba(107,114,128,.12)", bd: "rgba(107,114,128,.35)", fg: "#374151" };
        return (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px",
            borderRadius: 999, fontSize: 12, fontWeight: 700, background: c.bg, color: c.fg, border: `1px solid ${c.bd}`
          }}>
            {r.status ?? "—"}
          </span>
        );
      },
      sortAccessor: (r) => (r.status || "").toLowerCase(),
      width: 130,
    },
  ];

  return (
    <div><LoaderOverlay show={loading} label="Fetching data…" />
      {err && <p style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</p>}
    <DataTable
      title={title}
      rows={rows}
      columns={columns}
      globalSearchKeys={["customer_name", "lan", "app_id", "batch_id", "partner_loan_id", "status", amountField]}
      initialSort={{ key: "disbursement_date", dir: "desc" }}
      exportFileName="disbursed_loans"
    />
    </div>
  );
};

export default AllLoansScreen;
