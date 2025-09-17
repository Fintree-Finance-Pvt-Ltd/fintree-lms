// components/DisbursedLoansTable.jsx (AllLoansScreen)
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import DataTable from "./ui/DataTable";

const AllLoansScreen = ({ apiEndpoint, title = "Disbursed Loans", amountField = "disbursement_amount" }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    let off = false;
    setLoading(true);
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

  if (loading) return <p>Loading…</p>;
  if (err) return <p style={{ color: "#b91c1c" }}>{err}</p>;

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
    <DataTable
      title={title}
      rows={rows}
      columns={columns}
      globalSearchKeys={["customer_name", "lan", "status", amountField]}
      initialSort={{ key: "disbursement_date", dir: "desc" }}
      exportFileName="disbursed_loans"
    />
  );
};

export default AllLoansScreen;
