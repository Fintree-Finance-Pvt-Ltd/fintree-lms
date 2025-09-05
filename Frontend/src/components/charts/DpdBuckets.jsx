import React, { useEffect, useState } from "react";
import api from "../../api/api";

const bucketMeta = [
  { key: "0", label: "On Time" },
  { key: "0-30", label: "1–30 days" },
  { key: "30-60", label: "30–60 days" },
  { key: "60-90", label: "60–90 days" },
  { key: "90+", label: "90+ days" }
];

const DpdBuckets = ({ filters }) => {
  const emptySummary = {
    "0": { loans: 0, overdue_emi: 0 },
    "0-30": { loans: 0, overdue_emi: 0 },
    "30-60": { loans: 0, overdue_emi: 0 },
    "60-90": { loans: 0, overdue_emi: 0 },
    "90+": { loans: 0, overdue_emi: 0 },
  };

  const [summary, setSummary] = useState(emptySummary);
  const [selected, setSelected] = useState("0-30");

  const [rows, setRows] = useState([]);
  const [asOf, setAsOf] = useState("");

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // fetch summary when product changes
  useEffect(() => {
    const payload = { product: filters.product };
    api.post("/dashboard/dpd-buckets", payload)
      .then(res => {
        const map = { ...emptySummary };
        (res.data?.buckets || []).forEach(b => {
          map[b.bucket] = { loans: Number(b.loans || 0), overdue_emi: Number(b.overdue_emi || 0) };
        });
        setAsOf(res.data?.asOf || "");
        setSummary(map);
      })
      .catch(e => console.error("DPD summary error:", e));
  }, [filters.product]);

  // reset page when bucket changes
  useEffect(() => {
    setPage(1);
  }, [selected]);

  // fetch list when product / selected / page / pageSize change
  useEffect(() => {
    const payload = { product: filters.product, bucket: selected, page, pageSize };
    setLoading(true);
    api.post("/dashboard/dpd-list", payload)
      .then(res => {
        const r = res.data || {};
        setRows(Array.isArray(r.rows) ? r.rows : []);
        setTotal(Number(r.pagination?.total || 0));
      })
      .catch(e => console.error("DPD list error:", e))
      .finally(() => setLoading(false));
  }, [filters.product, selected, page, pageSize]);

  const formatINR = n => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(total, page * pageSize);

  return (
    <div style={{ background: "#fff", padding: "1rem", borderRadius: 8, marginTop: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>DPD Buckets</h2>
        {asOf && <div style={{ fontSize: 12, opacity: .7 }}>As of {asOf}</div>}
      </div>

      <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
        {bucketMeta.map(b => (
          <button
            key={b.key}
            onClick={() => setSelected(b.key)}
            style={{
              flex: 1,
              padding: "0.75rem 1rem",
              borderRadius: 8,
              border: selected === b.key ? "2px solid #e53935" : "1px solid #ddd",
              background: selected === b.key ? "#ffeceb" : "#fafafa",
              textAlign: "left",
              cursor: "pointer"
            }}
          >
            <div style={{ fontSize: 14, color: "#555" }}>{b.label}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{summary[b.key]?.loans || 0} loans</div>
              <div style={{ fontWeight: 600 }}>{formatINR(summary[b.key]?.overdue_emi || 0)}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Pagination controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <div style={{ fontSize: 13, color: "#666" }}>
          {loading ? "Loading…" : `Showing ${startIdx}-${endIdx} of ${total}`}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 13, color: "#666" }}>Rows per page:</label>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
          >
            {[10, 25, 50, 100, 200].map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", background: "#fafafa", cursor: page <= 1 || loading ? "not-allowed" : "pointer" }}
          >
            Prev
          </button>
          <div style={{ minWidth: 70, textAlign: "center", fontSize: 13 }}>
            Page {page} / {totalPages}
          </div>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", background: "#fafafa", cursor: page >= totalPages || loading ? "not-allowed" : "pointer" }}
          >
            Next
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9f9f9", color: "#201d1dff", fontWeight: "900", fontSize: 16 }}>
              <th style={th}>LAN</th>
              <th style={th}>Product</th>
              <th style={th}>Max DPD</th>
              <th style={th}>Overdue EMI</th>
              <th style={th}>Overdue Principal</th>
              <th style={th}>Overdue Interest</th>
               <th style={th}>POS (Principal)</th>
              <th style={th}>Last Due Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.lan + "_" + idx}>
                <td style={td}>{r.lan}</td>
                <td style={td}>{r.product}</td>
                <td style={td}>{r.max_dpd}</td>
                <td style={td}>{formatINR(r.overdue_emi)}</td>
                <td style={td}>{formatINR(r.overdue_principal)}</td>
                <td style={td}>{formatINR(r.overdue_interest)}</td>
                <td style={td}>{formatINR(r.pos_principal)}</td>
                <td style={td}>{r.last_due_date ? String(r.last_due_date).slice(0, 10) : "-"}</td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td style={td} colSpan={7}>No loans in this bucket.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #eee", fontSize: 12, color: "#666" };
const td = { padding: "10px", borderBottom: "1px solid #f2f2f2", fontSize: 14 };

export default DpdBuckets;
