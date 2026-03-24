// components/AllLoansScreen.jsx — server-side paginated
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import DataTable from "./ui/DataTable";
import LoaderOverlay from "./ui/LoaderOverlay";

const DEFAULT_PAGE_SIZE = 25;

const AllLoansScreen = ({ apiEndpoint, title = "All Loans", amountField = "disbursement_amount" }) => {
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState("");
  const [page,      setPage]      = useState(1);
  const [pageSize,  setPageSize]  = useState(DEFAULT_PAGE_SIZE);
  const [totalRows, setTotalRows] = useState(0);
  const [search,    setSearch]    = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const nav = useNavigate();
  const abortRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, pageSize]);

  const fetchPage = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setErr("");

    api.get(apiEndpoint, {
      params: { page, pageSize, search: debouncedSearch || undefined },
      signal: ctrl.signal,
    })
      .then((res) => {
        const data = res.data;
        if (data && Array.isArray(data.rows)) {
          setRows(data.rows);
          setTotalRows(data.pagination?.total ?? data.rows.length);
        } else if (Array.isArray(data)) {
          setRows(data);
          setTotalRows(data.length);
        } else {
          setRows([]);
          setTotalRows(0);
        }
      })
      .catch((e) => {
        if (e?.code === "ERR_CANCELED") return;
        setErr("Failed to fetch data.");
      })
      .finally(() => setLoading(false));
  }, [apiEndpoint, page, pageSize, debouncedSearch]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  const hasADK    = rows.some((r) => /^ADK/i.test(r?.lan));
  const hasEV     = rows.some((r) => /^EV/i.test(r?.lan));
  const hasGQFSF  = rows.some((r) => /^GQFSF/i.test(r?.lan));
  const hasGQNonF = rows.some((r) => /^GQNONFSF/i.test(r?.lan));

  const nf = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

  const columns = [
    {
      key: "customer_name", header: "Customer Name", sortable: true,
      render: (r) => (
        <span style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
              onClick={() => nav(`/loan-details/${r.lan}`)}>
          {r.customer_name ?? r.pan_name ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.customer_name || r.pan_name || "").toLowerCase(), width: 220,
    },
    {
      key: "lan", header: "LAN", sortable: true,
      render: (r) => (
        <span style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
              onClick={() => nav(`/loan-details/${r.lan}`)}>
          {r.lan ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.lan || "").toLowerCase(), width: 150,
    },
    ...(hasADK ? [{
      key: "batch_id", header: "Batch ID", sortable: true,
      render:       (r) => (/^ADK/i.test(r?.lan) ? (r.batch_id ?? "—") : "—"),
      sortAccessor: (r) => (/^ADK/i.test(r?.lan) ? String(r?.batch_id || "").toLowerCase() : ""),
      csvAccessor:  (r) => (/^ADK/i.test(r?.lan) ? (r.batch_id ?? "") : ""), width: 140,
    }] : []),
    ...(hasGQFSF ? [{
      key: "app_id", header: "APP ID (FSF)", sortable: true,
      render:       (r) => (/^GQFSF/i.test(r?.lan)  ? (r.app_id ?? "—") : "—"),
      sortAccessor: (r) => (/^GQFSF/i.test(r?.lan)  ? String(r?.app_id || "").toLowerCase() : ""),
      csvAccessor:  (r) => (/^GQFSF/i.test(r?.lan)  ? (r.app_id ?? "") : ""), width: 140,
    }] : []),
    ...(hasGQNonF ? [{
      key: "app_id", header: "APP ID (Non-FSF)", sortable: true,
      render:       (r) => (/^GQNONFSF/i.test(r?.lan) ? (r.app_id ?? "—") : "—"),
      sortAccessor: (r) => (/^GQNONFSF/i.test(r?.lan) ? String(r?.app_id || "").toLowerCase() : ""),
      csvAccessor:  (r) => (/^GQNONFSF/i.test(r?.lan) ? (r.app_id ?? "") : ""), width: 140,
    }] : []),
    ...(hasEV ? [{
      key: "partner_loan_id", header: "Partner Loan ID", sortable: true,
      render:       (r) => (/^EV/i.test(r?.lan) ? (r.partner_loan_id ?? "—") : "—"),
      sortAccessor: (r) => (/^EV/i.test(r?.lan) ? String(r?.partner_loan_id || "").toLowerCase() : ""),
      csvAccessor:  (r) => (/^EV/i.test(r?.lan) ? (r.partner_loan_id ?? "") : ""), width: 140,
    }] : []),
    {
      key: amountField, header: "Disbursement Amount", sortable: true,
      render: (r) => { const n = Number(r?.[amountField] ?? r?.loan_amount); return Number.isFinite(n) ? nf.format(n) : "—"; },
      sortAccessor: (r) => { const v = Number(r?.[amountField] ?? r?.loan_amount ?? 0); return Number.isFinite(v) ? v : 0; },
      width: 190,
    },
    {
      key: "disbursement_date", header: "Disbursement Date", sortable: true,
      sortAccessor: (r) => (r.disbursement_date ? Date.parse(r.disbursement_date) : 0), width: 170,
    },
    {
      key: "status", header: "Status", sortable: true,
      render: (r) => {
        const map = {
          Disbursed: { bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.35)", fg: "#065f46" },
          Settled:   { bg: "rgba(59,130,246,.12)", bd: "rgba(59,130,246,.35)", fg: "#1e3a8a" },
          Pending:   { bg: "rgba(234,179,8,.12)",  bd: "rgba(234,179,8,.35)",  fg: "#713f12" },
          Failed:    { bg: "rgba(239,68,68,.12)",  bd: "rgba(239,68,68,.35)",  fg: "#7f1d1d" },
        };
        const c = map[r.status] || { bg: "rgba(107,114,128,.12)", bd: "rgba(107,114,128,.35)", fg: "#374151" };
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px",
            borderRadius: 999, fontSize: 12, fontWeight: 700, background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>
            {r.status ?? "—"}
          </span>
        );
      },
      sortAccessor: (r) => (r.status || "").toLowerCase(), width: 130,
    },
  ];

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div>
      <LoaderOverlay show={loading} label="Fetching data…" />
      {err && <p style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</p>}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="Search LAN, name, mobile…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, minWidth: 260, outline: "none" }}
        />
        <span style={{ color: "#6b7280", fontSize: 13 }}>
          {totalRows.toLocaleString()} record{totalRows !== 1 ? "s" : ""}
        </span>
      </div>

      <DataTable
        title={title}
        rows={rows}
        columns={columns}
        globalSearchKeys={[]}
        initialSort={{ key: "disbursement_date", dir: "desc" }}
        exportFileName="all_loans"
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pagerBtnStyle(page === 1)}>‹ Prev</button>
          <span style={{ color: "#6b7280", fontSize: 13 }}>Page <b>{page}</b> / <b>{totalPages}</b></span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={pagerBtnStyle(page >= totalPages)}>Next ›</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 13, color: "#6b7280" }}>Rows / page</label>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, outline: "none" }}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
};

function pagerBtnStyle(disabled) {
  return {
    padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db",
    background: disabled ? "#f3f4f6" : "#fff",
    color:      disabled ? "#9ca3af" : "#1f2937",
    cursor:     disabled ? "default" : "pointer",
    fontSize: 13, fontWeight: 600,
  };
}

export default AllLoansScreen;
