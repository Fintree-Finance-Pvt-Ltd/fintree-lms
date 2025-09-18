// import React, { useEffect, useState } from "react";
// import { useParams } from "react-router-dom";
// import api from "../api/api";
// import "../styles/ChargesCashflow.css"; // ✅ Import CSS file

// const ChargesCashflow = () => {
//     const { lan } = useParams();
//     const [cashflowData, setCashflowData] = useState([]);
//     const [loading, setLoading] = useState(true);
//     const [error, setError] = useState(null);

//     useEffect(() => {
//         const fetchCashflowData = async () => {
//             try {
//                 const response = await api.get(`/charges/charges-cashflow/${lan}`);
//                 setCashflowData(response.data);
//             } catch (err) {
//                 console.error("❌ Failed to fetch charges cashflow:", err);
//                 setError("❌ Error fetching cashflow data.");
//             } finally {
//                 setLoading(false);
//             }
//         };

//         fetchCashflowData();
//     }, [lan]);

//     const formatDate = (dateString) => {
//         return dateString ? dateString.split("T")[0] : "-"; // ✅ Extract only the date (YYYY-MM-DD)
//     };

//     if (loading) return <p className="loading-text">⏳ Loading charges & cashflow...</p>;
//     if (error) return <p className="error-text">{error}</p>;

//     return (
//         <div className="charges-cashflow-container">
//             <h2>Charges & Cashflow</h2>
//             <div className="charges-table-container">
//                 <table>
//                     <thead>
//                         <tr>
//                             <th>LAN</th>
//                             <th>Settlement Date</th>
//                             <th>UTR</th>
//                             <th>Payment Date</th>
//                             <th>Payment ID</th>
//                             <th>Payment Mode</th>
//                             <th>Transfer Amount</th>
//                             <th>Created At</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {cashflowData.map((entry, index) => (
//                             <tr key={index}>
//                                 <td style={{fontWeight:'bold'}}>{entry.lan}</td>
//                                 <td style={{fontWeight:'bold'}}>{formatDate(entry.bank_date)}</td>
//                                 <td style={{fontWeight:'bold'}}>{entry.utr}</td>
//                                 <td style={{fontWeight:'bold'}}>{formatDate(entry.payment_date)}</td>
//                                 <td style={{fontWeight:'bold'}}>{entry.payment_id}</td>
//                                 <td style={{fontWeight:'bold'}}>{entry.payment_mode}</td>
//                                 <td style={{fontWeight:'bold'}}>{entry.transfer_amount}</td>
//                                 <td style={{fontWeight:'bold'}}>{entry.created_at}</td>
//                             </tr>
//                         ))}
//                     </tbody>
//                 </table>
//             </div>
//         </div>
//     );
// };

// export default ChargesCashflow;


// src/components/ChargesCashflow.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import DataTable from "./ui/DataTable";

const fmtDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  // handle "YYYY-MM-DDTHH:mm:ss" by splitting
  if (typeof v === "string" && v.includes("T")) return v.split("T")[0];
  return String(v);
};

const asNumber = (v) => {
  if (typeof v === "number") return v;
  const n = Number(String(v || "").replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const fmtINR = (v) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 })
    .format(asNumber(v));

const ChargesCashflow = () => {
  const { lan } = useParams();
  const [rowsRaw, setRowsRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let off = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/charges/charges-cashflow/${lan}`);
        !off && setRowsRaw(Array.isArray(res.data) ? res.data : []);
        !off && setErr("");
      } catch (e) {
        console.error("Failed to fetch charges cashflow:", e);
        !off && setErr("❌ Error fetching cashflow data.");
      } finally {
        !off && setLoading(false);
      }
    };
    run();
    return () => { off = true; };
  }, [lan]);

  const rows = useMemo(
    () => rowsRaw.map((r, i) => ({ _idx: i, ...r })),
    [rowsRaw]
  );

  const totalAmt = useMemo(
    () => rows.reduce((sum, r) => sum + asNumber(r.transfer_amount), 0),
    [rows]
  );

  if (loading) return <p style={{ color: "#374151" }}>⏳ Loading charges & cashflow…</p>;
  if (err) return <p style={{ color: "#b91c1c" }}>{err}</p>;

  const chip = (label) => (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        background: "rgba(59,130,246,.1)",
        color: "#1d4ed8",
        border: "1px solid rgba(59,130,246,.35)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );

  const mono = {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 12.5,
  };

  const columns = [
    {
      key: "lan",
      header: "LAN",
      width: 140,
      sortable: true,
      render: (r) => <span style={{ ...mono, fontWeight: 700 }}>{r.lan ?? "—"}</span>,
      sortAccessor: (r) => (r.lan || "").toLowerCase(),
      csvAccessor: (r) => r.lan || "",
    },
    {
      key: "bank_date",
      header: "Settlement Date",
      width: 150,
      sortable: true,
      render: (r) => <span style={mono}>{fmtDate(r.bank_date)}</span>,
      sortAccessor: (r) => Date.parse(r.bank_date) || 0,
      csvAccessor: (r) => (r.bank_date ? fmtDate(r.bank_date) : ""),
    },
    {
      key: "utr",
      header: "UTR",
      width: 200,
      sortable: true,
      render: (r) => <span style={{ ...mono, fontWeight: 700 }}>{r.utr || "—"}</span>,
      sortAccessor: (r) => (r.utr || "").toLowerCase(),
      csvAccessor: (r) => r.utr || "",
    },
    {
      key: "payment_date",
      header: "Payment Date",
      width: 150,
      sortable: true,
      render: (r) => <span style={mono}>{fmtDate(r.payment_date)}</span>,
      sortAccessor: (r) => Date.parse(r.payment_date) || 0,
      csvAccessor: (r) => (r.payment_date ? fmtDate(r.payment_date) : ""),
    },
    {
      key: "payment_id",
      header: "Payment ID",
      width: 200,
      sortable: true,
      render: (r) => <span style={mono}>{r.payment_id || "—"}</span>,
      sortAccessor: (r) => (r.payment_id || "").toLowerCase(),
      csvAccessor: (r) => r.payment_id || "",
    },
    {
      key: "payment_mode",
      header: "Payment Mode",
      width: 140,
      sortable: true,
    },
    {
      key: "transfer_amount",
      header: "Transfer Amount",
      width: 160,
      sortable: true,
      render: (r) => <span style={{ fontWeight: 700 }}>{fmtINR(r.transfer_amount)}</span>,
      sortAccessor: (r) => asNumber(r.transfer_amount),
      csvAccessor: (r) => asNumber(r.transfer_amount),
    },
    {
      key: "created_at",
      header: "Created At",
      width: 190,
      sortable: true,
      render: (r) => <span style={mono}>{fmtDate(r.created_at)}</span>,
      sortAccessor: (r) => Date.parse(r.created_at) || 0,
      csvAccessor: (r) => (r.created_at ? new Date(r.created_at).toISOString() : ""),
    },
  ];

  return (
    <DataTable
      title={`Charges & Cashflow ${lan ? `— ${lan}` : ""}`}
      rows={rows}
      columns={columns}
      globalSearchKeys={["lan", "utr", "payment_id", "payment_mode"]}
      initialSort={{ key: "payment_date", dir: "desc" }}
      exportFileName={`charges_cashflow_${lan || "all"}`}
      stickyHeader
      zebra
      renderTopRight={chip(`Total: ${fmtINR(totalAmt)}`)}
    />
  );
};

export default ChargesCashflow;
