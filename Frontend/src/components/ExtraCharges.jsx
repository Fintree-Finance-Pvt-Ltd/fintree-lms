// import React, { useEffect, useState } from "react";
// import { useParams } from "react-router-dom";
// import api from "../api/api";
// import "../styles/ExtraCharges.css";

// const ExtraCharges = () => {
//     const { lan } = useParams(); // ✅ Get LAN from URL
//     const [charges, setCharges] = useState([]);
//     const [loading, setLoading] = useState(true);
//     const [error, setError] = useState(null);

//     useEffect(() => {
//         const fetchCharges = async () => {
//             try {
//                 const response = await api.get(`/loan-charges/${lan}`);
//                 setCharges(response.data);
//             } catch (err) {
//                 setError("Failed to fetch extra charges.");
//             } finally {
//                 setLoading(false);
//             }
//         };

//         fetchCharges();
//     }, [lan]);

//     if (loading) return <p>Loading extra charges...</p>;
//     if (error) return <p className="error">{error}</p>;

//     return (
//         <div className="extra-charges-container">
//             <h2>Extra Charges for LAN: {lan}</h2>
//             <table>
//                 <thead>
//                     <tr>
//                         <th>Charge Date</th>
//                         <th>Charge Amount</th>
//                         <th>Paid Amount</th>
//                         <th>Waived Off Amount</th>
//                         <th>Charge Type</th>
//                         <th>Paid Status</th>
//                         <th>Payment Time</th>
//                         <th>Created At</th>
//                     </tr>
//                 </thead>
//                 <tbody>
//                     {charges.length > 0 ? (
//                         charges.map((charge) => (
//                             <tr key={charge.id}>
//                                 <td>{charge.due_date}</td>
//                                 <td>{charge.amount}</td>
//                                 <td>{charge.paid_amount}</td>
//                                 <td>{charge.waived_off}</td>
//                                 <td>{charge.charge_type}</td>
//                                 <td>{charge.paid_status}</td>
//                                 <td>{charge.payment_time || "N/A"}</td>
//                                 <td>{charge.created_at}</td>
//                             </tr>
//                         ))
//                     ) : (
//                         <tr>
//                             <td colSpan="8">No extra charges found.</td>
//                         </tr>
//                     )}
//                 </tbody>
//             </table>
//         </div>
//     );
// };

// export default ExtraCharges;


// src/components/ExtraCharges.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import DataTable from "./ui/DataTable";

const fmtDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  if (typeof v === "string" && v.includes("T")) return v.split("T")[0];
  return String(v);
};

const asNumber = (v) => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const fmtINR = (v) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 })
    .format(asNumber(v));

const StatusBadge = ({ value }) => {
  const k = String(value || "unknown").toLowerCase();
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
    userSelect: "none",
    letterSpacing: ".01em",
  };
  const map = {
    paid:   { background: "rgba(16,185,129,.12)", color: "#047857", borderColor: "rgba(16,185,129,.35)" },
    unpaid: { background: "rgba(239,68,68,.12)",  color: "#b91c1c", borderColor: "rgba(239,68,68,.35)" },
    pending:{ background: "rgba(251,191,36,.14)", color: "#b45309", borderColor: "rgba(251,191,36,.35)" },
    partial:{ background: "rgba(59,130,246,.12)", color: "#1d4ed8", borderColor: "rgba(59,130,246,.35)" },
    unknown:{ background: "#f3f4f6", color: "#374151", borderColor: "#e5e7eb" },
  };
  const style = { ...base, ...(map[k] || map.unknown) };
  return <span style={style}>{value || "Unknown"}</span>;
};

const ExtraCharges = () => {
  const { lan } = useParams();
  const [rowsRaw, setRowsRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let off = false;
    const fetchCharges = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/loan-charges/${lan}`);
        !off && setRowsRaw(Array.isArray(res.data) ? res.data : []);
        !off && setErr("");
      } catch (e) {
        !off && setErr("Failed to fetch extra charges.");
      } finally {
        !off && setLoading(false);
      }
    };
    fetchCharges();
    return () => { off = true; };
  }, [lan]);

  const rows = useMemo(() => rowsRaw.map((r, i) => ({ _idx: i, ...r })), [rowsRaw]);

  const totals = useMemo(() => {
    const amount = rows.reduce((s, r) => s + asNumber(r.amount), 0);
    const paid = rows.reduce((s, r) => s + asNumber(r.paid_amount), 0);
    const waived = rows.reduce((s, r) => s + asNumber(r.waived_off), 0);
    const outstanding = amount - paid - waived;
    return { amount, paid, waived, outstanding };
  }, [rows]);

  if (loading) return <p style={{ color: "#374151" }}>Loading extra charges…</p>;
  if (err) return <p style={{ color: "#b91c1c" }}>{err}</p>;

  const mono = {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 12.5,
  };

  const columns = [
    {
      key: "due_date",
      header: "Charge Date",
      width: 140,
      sortable: true,
      render: (r) => <span style={mono}>{fmtDate(r.due_date)}</span>,
      sortAccessor: (r) => Date.parse(r.due_date) || 0,
      csvAccessor: (r) => (r.due_date ? fmtDate(r.due_date) : ""),
    },
    {
      key: "amount",
      header: "Charge Amount",
      width: 150,
      sortable: true,
      render: (r) => <span style={{ fontWeight: 700 }}>{fmtINR(r.amount)}</span>,
      sortAccessor: (r) => asNumber(r.amount),
      csvAccessor: (r) => asNumber(r.amount),
    },
    {
      key: "paid_amount",
      header: "Paid Amount",
      width: 150,
      sortable: true,
      render: (r) => <span style={{ fontWeight: 700 }}>{fmtINR(r.paid_amount)}</span>,
      sortAccessor: (r) => asNumber(r.paid_amount),
      csvAccessor: (r) => asNumber(r.paid_amount),
    },
    {
      key: "waived_off",
      header: "Waived Off Amount",
      width: 170,
      sortable: true,
      render: (r) => <span style={{ fontWeight: 700 }}>{fmtINR(r.waived_off)}</span>,
      sortAccessor: (r) => asNumber(r.waived_off),
      csvAccessor: (r) => asNumber(r.waived_off),
    },
    {
      key: "charge_type",
      header: "Charge Type",
      width: 160,
      sortable: true,
    },
    {
      key: "paid_status",
      header: "Paid Status",
      width: 140,
      sortable: true,
      render: (r) => <StatusBadge value={r.paid_status} />,
      sortAccessor: (r) => (r.paid_status || "").toLowerCase(),
      csvAccessor: (r) => r.paid_status || "",
    },
    {
      key: "payment_time",
      header: "Payment Time",
      width: 170,
      sortable: true,
      render: (r) => <span style={mono}>{fmtDate(r.payment_time) }</span>,
      sortAccessor: (r) => Date.parse(r.payment_time) || 0,
      csvAccessor: (r) => (r.payment_time ? new Date(r.payment_time).toISOString() : ""),
    },
    {
      key: "created_at",
      header: "Created At",
      width: 170,
      sortable: true,
      render: (r) => <span style={mono}>{fmtDate(r.created_at)}</span>,
      sortAccessor: (r) => Date.parse(r.created_at) || 0,
      csvAccessor: (r) => (r.created_at ? new Date(r.created_at).toISOString() : ""),
    },
    // Computed Outstanding (optional but handy)
    {
      key: "__outstanding",
      header: "Outstanding",
      width: 150,
      sortable: true,
      render: (r) => {
        const out = asNumber(r.amount) - asNumber(r.paid_amount) - asNumber(r.waived_off);
        return <span style={{ fontWeight: 700 }}>{fmtINR(out)}</span>;
      },
      sortAccessor: (r) => asNumber(r.amount) - asNumber(r.paid_amount) - asNumber(r.waived_off),
      csvAccessor: (r) => asNumber(r.amount) - asNumber(r.paid_amount) - asNumber(r.waived_off),
    },
  ];

  const chip = (label, tone = "blue") => {
    const tones = {
      blue:  { bg: "rgba(59,130,246,.1)",  fg: "#1d4ed8", bd: "rgba(59,130,246,.35)" },
      green: { bg: "rgba(16,185,129,.12)", fg: "#047857", bd: "rgba(16,185,129,.35)" },
      amber: { bg: "rgba(251,191,36,.14)", fg: "#b45309", bd: "rgba(251,191,36,.35)" },
      red:   { bg: "rgba(239,68,68,.12)",  fg: "#b91c1c", bd: "rgba(239,68,68,.35)" },
    }[tone] || {};
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 700,
          background: tones.bg, color: tones.fg, border: `1px solid ${tones.bd}`,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    );
  };

  return (
    <DataTable
      title={`Extra Charges — ${lan}`}
      rows={rows}
      columns={columns}
      globalSearchKeys={["charge_type", "paid_status"]}
      initialSort={{ key: "due_date", dir: "desc" }}
      exportFileName={`extra_charges_${lan}`}
      stickyHeader
      zebra
      renderTopRight={
        <>
          {chip(`Total: ${fmtINR(totals.amount)}`, "blue")}
          {chip(`Paid: ${fmtINR(totals.paid)}`, "green")}
          {chip(`Waived: ${fmtINR(totals.waived)}`, "amber")}
          {chip(`Outstanding: ${fmtINR(totals.outstanding)}`, "red")}
        </>
      }
    />
  );
};

export default ExtraCharges;
