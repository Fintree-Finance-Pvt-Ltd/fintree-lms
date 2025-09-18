

// import React, { useState, useEffect } from "react";
// import { useParams } from "react-router-dom";
// import api from "../api/api";
// import "../styles/Allocation.css"; // Make sure this path is correct

// const AllocationPage = () => {
//   const { lan } = useParams();
//   const [allocations, setAllocations] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [search, setSearch] = useState("");
//   const [error, setError] = useState(null);

//   useEffect(() => {
//     const fetchAllocations = async () => {
//       try {
//         const response = await api.get(`/allocate/allocations/${lan}`);
//         setAllocations(response.data.allocations || []);
//       } catch (err) {
//         setError("❌ Failed to fetch allocation data.");
//         console.error("Error fetching allocation data:", err);
//       } finally {
//         setLoading(false);
//       }
//     };

//     fetchAllocations();
//   }, [lan]);

//   const formatDate = (dateString) => {
//     if (!dateString) return "-";
//     const date = new Date(dateString);
//     return new Intl.DateTimeFormat("en-GB", {
//       day: "2-digit",
//       month: "short",
//       year: "numeric",
//     }).format(date);
//   };

//   const formatTime = (dateString) => {
//     if (!dateString) return "-";
//     const date = new Date(dateString);
//     return date.toLocaleTimeString("en-US");
//   };

//   return (
//     <div className="allocation-container">
//       <h2>View All Cashflows ({allocations.length})</h2>

//       <input
//         type="text"
//         className="form-control mb-3"
//         placeholder="🔍 Search Payment ID..."
//         value={search}
//         onChange={(e) => setSearch(e.target.value)}
//       />

//       {loading ? (
//         <p>⏳ Loading data...</p>
//       ) : error ? (
//         <p className="text-danger">{error}</p>
//       ) : allocations.length === 0 ? (
//         <p>⚠️ No allocation records found.</p>
//       ) : (
//         <table className="allocation-table">
//           <thead>
//             <tr>
//               <th>Due Date</th>
//               <th>Allocation Date</th>
//               <th>Allocated Amount</th>
//               <th>Charge Type</th>
//               <th>Created At</th>
//               <th>Payment ID</th>
            
//             </tr>
//           </thead>
//           <tbody>
//             {allocations
//               .filter((item) =>
//                 item.payment_id?.toLowerCase().includes(search.toLowerCase())
//               )
//               .map((allocation, index) => (
//                 <tr key={index}>
//                   <td>{formatDate(allocation.due_date)}</td>
//                   <td>{formatDate(allocation.allocation_date)}</td>
//                   <td>{allocation.allocated_amount}</td>
//                   <td>{allocation.charge_type}</td>
//                   <td>{formatDate(allocation.created_at)}</td>
//                   <td>{allocation.payment_id}</td>
                  
//                 </tr>
//               ))}
//           </tbody>
//         </table>
//       )}
//     </div>
//   );
// };

// export default AllocationPage;


// src/components/AllocationPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import DataTable from "./ui/DataTable";

const fmtDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
};

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

const AllocationPage = () => {
  const { lan } = useParams();
  const [rowsRaw, setRowsRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let off = false;
    const fetchAllocations = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/allocate/allocations/${lan}`);
        !off && setRowsRaw(Array.isArray(res.data?.allocations) ? res.data.allocations : []);
        !off && setErr("");
      } catch (e) {
        console.error("Error fetching allocation data:", e);
        !off && setErr("❌ Failed to fetch allocation data.");
      } finally {
        !off && setLoading(false);
      }
    };
    fetchAllocations();
    return () => { off = true; };
  }, [lan]);

  const rows = useMemo(() => rowsRaw.map((r, i) => ({ _idx: i, ...r })), [rowsRaw]);

  const totalAllocated = useMemo(
    () => rows.reduce((sum, r) => sum + asNumber(r.allocated_amount), 0),
    [rows]
  );

  if (loading) return <p style={{ color: "#374151" }}>⏳ Loading data…</p>;
  if (err) return <p style={{ color: "#b91c1c" }}>{err}</p>;
  if (rows.length === 0) return <p style={{ color: "#6b7280" }}>⚠️ No allocation records found.</p>;

  const mono = {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 12.5,
  };

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
        background: "rgba(16,185,129,.12)",
        color: "#047857",
        border: "1px solid rgba(16,185,129,.35)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );

  const columns = [
    {
      key: "due_date",
      header: "Due Date",
      width: 140,
      sortable: true,
      render: (r) => <span style={mono}>{fmtDate(r.due_date)}</span>,
      sortAccessor: (r) => Date.parse(r.due_date) || 0,
      csvAccessor: (r) => (r.due_date ? fmtDate(r.due_date) : ""),
    },
    {
      key: "allocation_date",
      header: "Allocation Date",
      width: 160,
      sortable: true,
      render: (r) => <span style={mono}>{fmtDate(r.allocation_date)}</span>,
      sortAccessor: (r) => Date.parse(r.allocation_date) || 0,
      csvAccessor: (r) => (r.allocation_date ? fmtDate(r.allocation_date) : ""),
    },
    {
      key: "allocated_amount",
      header: "Allocated Amount",
      width: 160,
      sortable: true,
      render: (r) => <span style={{ fontWeight: 700 }}>{fmtINR(r.allocated_amount)}</span>,
      sortAccessor: (r) => asNumber(r.allocated_amount),
      csvAccessor: (r) => asNumber(r.allocated_amount),
    },
    {
      key: "charge_type",
      header: "Charge Type",
      width: 160,
      sortable: true,
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
    {
      key: "payment_id",
      header: "Payment ID",
      width: 220,
      sortable: true,
      render: (r) => <span style={{ ...mono, fontWeight: 700 }}>{r.payment_id || "—"}</span>,
      sortAccessor: (r) => (r.payment_id || "").toLowerCase(),
      csvAccessor: (r) => r.payment_id || "",
    },
  ];

  return (
    <DataTable
      title={`View All Cashflows ${lan ? `— ${lan}` : ""} (${rows.length})`}
      rows={rows}
      columns={columns}
      globalSearchKeys={["payment_id", "charge_type"]}
      initialSort={{ key: "allocation_date", dir: "desc" }}
      exportFileName={`allocations_${lan || "all"}`}
      stickyHeader
      zebra
      renderTopRight={
        <>
          {chip(`Total Allocated: ${fmtINR(totalAllocated)}`)}
        </>
      }
    />
  );
};

export default AllocationPage;
