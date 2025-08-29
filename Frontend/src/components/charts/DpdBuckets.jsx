import React, { useEffect, useState } from "react";
import api from "../../api/api";

const bucketMeta = [
  { key: "0-30", label: "0–30 days" },
  { key: "30-60", label: "30–60 days" }, // exclusive of 30 from first bucket
  { key: "60-90", label: "60–90 days" },
];

const DpdBuckets = ({ filters }) => {
  const [summary, setSummary] = useState({ "0-30": {loans:0, overdue_emi:0}, "30-60": {loans:0, overdue_emi:0}, "60-90": {loans:0, overdue_emi:0} });
  const [selected, setSelected] = useState("0-30");
  const [rows, setRows] = useState([]);
  const [asOf, setAsOf] = useState("");

  // fetch summary when product changes
  useEffect(() => {
    const payload = { product: filters.product }; // date filters are ignored for DPD (as-of today)
    api.post("/dashboard/dpd-buckets", payload).then(res => {
      const map = { "0-30": {loans:0, overdue_emi:0}, "30-60": {loans:0, overdue_emi:0}, "60-90": {loans:0, overdue_emi:0} };
      (res.data?.buckets || []).forEach(b => {
        map[b.bucket] = { loans: Number(b.loans||0), overdue_emi: Number(b.overdue_emi||0) };
      });
      setAsOf(res.data?.asOf || "");
      setSummary(map);
    }).catch(e => console.error("DPD summary error:", e));
  }, [filters.product]);

  // fetch list when product or selected bucket changes
  useEffect(() => {
    const payload = { product: filters.product, bucket: selected };
    api.post("/dashboard/dpd-list", payload).then(res => {
      setRows(Array.isArray(res.data) ? res.data : []);
    }).catch(e => console.error("DPD list error:", e));
  }, [filters.product, selected]);

  const formatINR = n => `₹${Math.round(Number(n||0)).toLocaleString("en-IN")}`;

  return (
    <div style={{ background: "#fff", padding: "1rem", borderRadius: 8, marginTop: "2rem" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
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
            <div style={{ display:"flex", justifyContent:"space-between", marginTop: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{summary[b.key]?.loans || 0} loans</div>
              <div style={{ fontWeight: 600 }}>{formatINR(summary[b.key]?.overdue_emi || 0)}</div>
            </div>
          </button>
        ))}
      </div>

      <div style={{ overflowX: "auto", marginTop: "1rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>LAN</th>
              <th style={th}>Product</th>
              <th style={th}>Max DPD</th>
              <th style={th}>Overdue EMI</th>
              <th style={th}>Overdue Principal</th>
              <th style={th}>Overdue Interest</th>
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
                <td style={td}>{r.last_due_date ? String(r.last_due_date).slice(0,10) : "-"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td style={td} colSpan={7}>No loans in this bucket.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const th = { textAlign:"left", padding:"8px 10px", borderBottom:"1px solid #eee", fontSize:12, color:"#666" };
const td = { padding:"10px", borderBottom:"1px solid #f2f2f2", fontSize:14 };

export default DpdBuckets;
