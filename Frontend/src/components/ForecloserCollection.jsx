// // File: frontend/src/components/ForecloserCollection.jsx

// import React, { useEffect, useState } from "react";
// import api from "../api/api";
// //import { useLocation } from "react-router-dom";
// import { useParams } from "react-router-dom";

// const ForecloserCollection = () => {
//  // const location = useLocation();
//  // const lan = location.state?.lan || ""; // LAN passed from previous page
//  //const [lan, setLan] = useState("lan");
//  const { lan } = useParams();
//   const [data, setData] = useState([]);

//   useEffect(() => {
//     if (lan) {
//       fetchData();
//     }
//   }, [lan]);

//   const fetchData = async () => {
//     try {
//       const response = await api.get(`/forecloser-collection/fc/${lan}`);
//       setData(response.data);
//     } catch (err) {
//       console.error("❌ Failed to fetch foreclosure data", err);
//     }
//   };
//   const handleCollect = async () => {
//     try {
//       const payload = data.map((row) => ([
//         {
//           lan: row.lan,
//           charge_type: "Accrued Interest",
//           amount: row.accrued_interest || 0,
//         },
//         {
//           lan: row.lan,
//           charge_type: "Foreclosure Fee",
//           amount: row.foreclosure_fee || 0,
//         },
//         {
//           lan: row.lan,
//           charge_type: "Foreclosure Fee Tax",
//           amount: row.foreclosure_tax || 0,
//         }
//       ])).flat();
  
//       await api.post(`/forecloser-collection/fc/collect`, payload);
//       alert("✅ Charges inserted into loan_charges successfully.");
//     } catch (err) {
//       console.error("❌ Failed to collect charges", err);
//       alert("❌ Failed to insert charges.");
//     }
//   };
  

//   return (
//     <div className="container mt-4">
//       <h3>📅 Foreclosure Collection for LAN: <span className="text-primary">{lan}</span></h3>

//       <table className="table table-bordered table-hover mt-3">
//         <thead className="table-dark">
//           <tr>
//             <th>LAN</th>
//             <th>Accrued Interest</th>
//             <th>Remaining Principal</th>
//             <th>Remaining Interest</th>
//             <th>Foreclosure Fee</th>
//             <th>Foreclosure Fee Tax</th>
//             <th>Total FC Amount</th>
//           </tr>
//         </thead>
//         <tbody>
//           {data.map((row, idx) => (
//             <tr key={idx}>
//               <td>{row.lan}</td>
//               <td>{Number(row.accrued_interest || 0).toFixed(2)}</td>
//               <td>{Number(row.total_remaining_principal || 0)}</td>
//               <td>{Number(row.total_remaining_interest || 0)}</td>
//               <td>{Number(row.foreclosure_fee || 0)}</td>
//               <td>{Number(row.foreclosure_tax || 0)}</td>
//               <td><strong>{Number(row.total_fc_amount || 0).toFixed(2)}</strong></td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//       <button className="btn btn-success mt-3" onClick={handleCollect}>
//   💰 Collect Charges
// </button>

//     </div>
//   );
// };

// export default ForecloserCollection;

// File: frontend/src/components/ForecloserCollection.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import DataTable from "./ui/DataTable";

const asNumber = (v) => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const fmtINR = (v) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(asNumber(v));

const ForecloserCollection = () => {
  const { lan } = useParams();
  const [rowsRaw, setRowsRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let off = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/forecloser-collection/fc/${lan}`);
        !off && setRowsRaw(Array.isArray(res.data) ? res.data : []);
        !off && setErr("");
      } catch (e) {
        console.error("❌ Failed to fetch foreclosure data", e);
        !off && setErr("❌ Failed to fetch foreclosure data.");
      } finally {
        !off && setLoading(false);
      }
    };
    if (lan) fetchData();
    return () => { off = true; };
  }, [lan]);

  const rows = useMemo(() => rowsRaw.map((r, i) => ({ _idx: i, ...r })), [rowsRaw]);

  const totals = useMemo(() => {
    const acc = rows.reduce((s, r) => s + asNumber(r.accrued_interest), 0);
    const prin = rows.reduce((s, r) => s + asNumber(r.total_remaining_principal), 0);
    const intr = rows.reduce((s, r) => s + asNumber(r.total_remaining_interest), 0);
    const fee  = rows.reduce((s, r) => s + asNumber(r.foreclosure_fee), 0);
    const tax  = rows.reduce((s, r) => s + asNumber(r.foreclosure_tax), 0);
    const total = rows.reduce((s, r) => s + asNumber(r.total_fc_amount), 0);
    return { acc, prin, intr, fee, tax, total };
  }, [rows]);

  const chip = (label, tone = "blue") => {
    const tones = {
      blue:  { bg: "rgba(59,130,246,.1)",  fg: "#1d4ed8", bd: "rgba(59,130,246,.35)" },
      green: { bg: "rgba(16,185,129,.12)", fg: "#047857", bd: "rgba(16,185,129,.35)" },
      amber: { bg: "rgba(251,191,36,.14)", fg: "#b45309", bd: "rgba(251,191,36,.35)" },
      slate: { bg: "rgba(100,116,139,.12)", fg: "#334155", bd: "rgba(100,116,139,.35)" },
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
          background: tones.bg,
          color: tones.fg,
          border: `1px solid ${tones.bd}`,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    );
  };

  const columns = [
    {
      key: "lan",
      header: "LAN",
      width: 140,
      sortable: true,
      sortAccessor: (r) => (r.lan || "").toLowerCase(),
      render: (r) => (
        <span style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace',
          fontSize: 12.5, fontWeight: 700
        }}>
          {r.lan || "—"}
        </span>
      ),
    },
    {
      key: "accrued_interest",
      header: "Accrued Interest",
      width: 160,
      sortable: true,
      render: (r) => <span style={{ fontWeight: 700 }}>{fmtINR(r.accrued_interest)}</span>,
      sortAccessor: (r) => asNumber(r.accrued_interest),
      csvAccessor: (r) => asNumber(r.accrued_interest),
    },
    {
      key: "total_remaining_principal",
      header: "Remaining Principal",
      width: 180,
      sortable: true,
      render: (r) => fmtINR(r.total_remaining_principal),
      sortAccessor: (r) => asNumber(r.total_remaining_principal),
      csvAccessor: (r) => asNumber(r.total_remaining_principal),
    },
    {
      key: "total_remaining_interest",
      header: "Remaining Interest",
      width: 170,
      sortable: true,
      render: (r) => fmtINR(r.total_remaining_interest),
      sortAccessor: (r) => asNumber(r.total_remaining_interest),
      csvAccessor: (r) => asNumber(r.total_remaining_interest),
    },
    {
      key: "foreclosure_fee",
      header: "Foreclosure Fee",
      width: 160,
      sortable: true,
      render: (r) => fmtINR(r.foreclosure_fee),
      sortAccessor: (r) => asNumber(r.foreclosure_fee),
      csvAccessor: (r) => asNumber(r.foreclosure_fee),
    },
    {
      key: "foreclosure_tax",
      header: "Foreclosure Fee Tax",
      width: 170,
      sortable: true,
      render: (r) => fmtINR(r.foreclosure_tax),
      sortAccessor: (r) => asNumber(r.foreclosure_tax),
      csvAccessor: (r) => asNumber(r.foreclosure_tax),
    },
    {
      key: "total_fc_amount",
      header: "Total FC Amount",
      width: 170,
      sortable: true,
      render: (r) => <strong>{fmtINR(r.total_fc_amount)}</strong>,
      sortAccessor: (r) => asNumber(r.total_fc_amount),
      csvAccessor: (r) => asNumber(r.total_fc_amount),
    },
  ];

  const handleCollect = async () => {
    if (!rows.length) return;

    const confirm = window.confirm(
      `Insert charges for ${rows.length} row(s)?\n\n` +
      `Accrued Interest: ${fmtINR(totals.acc)}\n` +
      `Foreclosure Fee:  ${fmtINR(totals.fee)}\n` +
      `Fee Tax:          ${fmtINR(totals.tax)}\n\n` +
      `This will POST to /forecloser-collection/fc/collect`
    );
    if (!confirm) return;

    try {
      setPosting(true);
      const payload = rows
        .map((row) => ([
          { lan: row.lan, charge_type: "Accrued Interest",   amount: asNumber(row.accrued_interest)   || 0 },
          { lan: row.lan, charge_type: "Foreclosure Fee",    amount: asNumber(row.foreclosure_fee)    || 0 },
          { lan: row.lan, charge_type: "Foreclosure Fee Tax",amount: asNumber(row.foreclosure_tax)    || 0 },
        ]))
        .flat();

      await api.post(`/forecloser-collection/fc/collect`, payload);
      alert("✅ Charges inserted into loan_charges successfully.");
    } catch (e) {
      console.error("❌ Failed to collect charges", e);
      alert("❌ Failed to insert charges.");
    } finally {
      setPosting(false);
    }
  };

  if (loading) return <p style={{ color: "#374151" }}>⏳ Loading foreclosure data…</p>;
  if (err) return <p style={{ color: "#b91c1c" }}>{err}</p>;

  const CollectButton = (
    <button
      onClick={handleCollect}
      disabled={!rows.length || posting}
      title={!rows.length ? "No rows to collect" : "Collect charges"}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid transparent",
        cursor: !rows.length || posting ? "not-allowed" : "pointer",
        fontSize: 14,
        fontWeight: 700,
        background: posting ? "#93c5fd" : "#16a34a",
        color: "#fff",
        borderColor: posting ? "#60a5fa" : "#15803d",
        opacity: !rows.length || posting ? 0.8 : 1,
      }}
    >
      {posting ? "Processing…" : "💰 Collect Charges"}
    </button>
  );

  return (
    <DataTable
      title={`Foreclosure Collection — ${lan || ""}`}
      rows={rows}
      columns={columns}
      globalSearchKeys={["lan"]}
      initialSort={{ key: "total_fc_amount", dir: "desc" }}
      exportFileName={`foreclosure_collection_${lan || "all"}`}
      stickyHeader
      zebra
      renderTopRight={
        <>
          {chip(`Accrued: ${fmtINR(totals.acc)}`, "slate")}
          {chip(`Fee: ${fmtINR(totals.fee)}`, "amber")}
          {chip(`Tax: ${fmtINR(totals.tax)}`, "blue")}
          {chip(`Total: ${fmtINR(totals.total)}`, "green")}
          {CollectButton}
        </>
      }
    />
  );
};

export default ForecloserCollection;
