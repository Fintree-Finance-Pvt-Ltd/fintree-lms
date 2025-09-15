// import React, { useEffect, useState } from "react";
// import api from "../../api/api";
// import * as XLSX from "xlsx"; // Excel export

// const bucketMeta = [
//   { key: "0", label: "On Time" },
//   { key: "0-30", label: "1–30 days" },
//   { key: "30-60", label: "30–60 days" },
//   { key: "60-90", label: "60–90 days" },
//   { key: "90+", label: "90+ days" }
// ];

// const DpdBuckets = ({ filters }) => {
//   const emptySummary = {
//     "0": { loans: 0, overdue_emi: 0 },
//     "0-30": { loans: 0, overdue_emi: 0 },
//     "30-60": { loans: 0, overdue_emi: 0 },
//     "60-90": { loans: 0, overdue_emi: 0 },
//     "90+": { loans: 0, overdue_emi: 0 },
//   };

//   const [summary, setSummary] = useState(emptySummary);
//   const [selected, setSelected] = useState("0-30");
//   const [asOf, setAsOf] = useState("");
//   const [isEmailing, setIsEmailing] = useState(false);

//   const [rows, setRows] = useState([]);
//   const [loading, setLoading] = useState(false);

//   // pagination
//   const [page, setPage] = useState(1);
//   const [pageSize, setPageSize] = useState(25);
//   const [total, setTotal] = useState(0);

//   // NEW: sorting (server-side)
//   // You can default to 'pos' if you want POS sorting by default; keeping 'dpd' for now.
//   const [sortBy, setSortBy] = useState("dpd");   // 'pos' | 'emi' | 'dpd' | 'due'
//   const [sortDir, setSortDir] = useState("desc"); // 'asc' | 'desc'
//   const [summaryLoading, setSummaryLoading] = useState(false);

//   // Full-screen overlay loader
// const LoaderOverlay = ({ show, label = "Loading…" }) => {
//   React.useEffect(() => {
//     // inject keyframes once
//     const STYLE_ID = "global-loader-overlay-styles";
//     if (!document.getElementById(STYLE_ID)) {
//       const style = document.createElement("style");
//       style.id = STYLE_ID;
//       style.textContent = `
//         @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
//       `;
//       document.head.appendChild(style);
//     }
//   }, []);

//   if (!show) return null;

//   return (
//     <div
//       style={{
//         position: "fixed",
//         inset: 0,
//         background: "rgba(0,0,0,0.35)",
//         backdropFilter: "blur(1px)",
//         zIndex: 9999,
//         display: "flex",
//         alignItems: "center",
//         justifyContent: "center",
//       }}
//       aria-busy="true"
//       aria-live="polite"
//       aria-label={label}
//     >
//       <div
//         style={{
//           background: "#ffffff",
//           borderRadius: 12,
//           padding: "24px 28px",
//           boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
//           display: "flex",
//           alignItems: "center",
//           gap: 16,
//           minWidth: 260,
//           justifyContent: "center"
//         }}
//       >
//         <div
//           style={{
//             width: 28,
//             height: 28,
//             borderRadius: "50%",
//             border: "3px solid #e6e6e6",
//             borderTopColor: "#e53935",
//             animation: "spin 0.9s linear infinite",
//           }}
//         />
//         <div style={{ fontWeight: 600, color: "#333", letterSpacing: 0.2 }}>
//           {label}
//         </div>
//       </div>
//     </div>
//   );
// };

// useEffect(() => {
//   const payload = { product: filters.product };
//   setSummaryLoading(true);
//   api.post("/dashboard/dpd-buckets", payload)
//     .then(res => {
//       const map = { ...emptySummary };
//       (res.data?.buckets || []).forEach(b => {
//         map[b.bucket] = {
//           loans: Number(b.loans || 0),
//           overdue_emi: Number(b.overdue_emi || 0)
//         };
//       });
//       setAsOf(res.data?.asOf || "");
//       setSummary(map);
//     })
//     .catch(e => console.error("DPD summary error:", e))
//     .finally(() => setSummaryLoading(false));
// }, [filters.product]);


//   const getLoggedInUserId = () => {
//     try {
//       const raw = localStorage.getItem("user");
//       return raw ? JSON.parse(raw)?.userId : null;
//     } catch {
//       return null;
//     }
//   };

//   // fetch summary when product changes
//   useEffect(() => {
//     const payload = { product: filters.product };
//     api.post("/dashboard/dpd-buckets", payload)
//       .then(res => {
//         const map = { ...emptySummary };
//         (res.data?.buckets || []).forEach(b => {
//           map[b.bucket] = {
//             loans: Number(b.loans || 0),
//             overdue_emi: Number(b.overdue_emi || 0)
//           };
//         });
//         setAsOf(res.data?.asOf || "");
//         setSummary(map);
//       })
//       .catch(e => console.error("DPD summary error:", e));
//   }, [filters.product]);

//   // reset page when bucket or sort changes
//   useEffect(() => {
//     setPage(1);
//   }, [selected, sortBy, sortDir]);

//   // fetch list when product / selected / page / pageSize / sort change
//   useEffect(() => {
//     const payload = {
//       product: filters.product,
//       bucket: selected,
//       page,
//       pageSize,
//       sortBy,
//       sortDir
//     };
//     setLoading(true);
//     api.post("/dashboard/dpd-list", payload)
//       .then(res => {
//         const r = res.data || {};
//         setRows(Array.isArray(r.rows) ? r.rows : []);
//         setTotal(Number(r.pagination?.total || 0));
//       })
//       .catch(e => console.error("DPD list error:", e))
//       .finally(() => setLoading(false));
//   }, [filters.product, selected, page, pageSize, sortBy, sortDir]);

//   const formatINR = n => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

//   const totalPages = Math.max(1, Math.ceil(total / pageSize));
//   const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
//   const endIdx = Math.min(total, page * pageSize);

//   // Sorting helpers
//   const toggleDir = () => setSortDir(d => (d === "asc" ? "desc" : "asc"));
//   const setSort = (key) => {
//     if (sortBy !== key) {
//       setSortBy(key);
//       setSortDir("desc"); // default direction when switching field
//     } else {
//       toggleDir();
//     }
//   };

//   // Export exactly the visible rows to Excel
//   const handleDownloadCurrentView = () => {
//     if (!rows.length) return;

//     // Define columns & order in the Excel file
//     const columns = [
//       { key: "lan", header: "LAN" },
//       { key: "product", header: "Product" },
//       { key: "customer_name", header: "Customer Name" },
//       { key: "max_dpd", header: "Max DPD" },
//       { key: "overdue_emi", header: "Overdue EMI" },
//       { key: "overdue_principal", header: "Overdue Principal" },
//       { key: "overdue_interest", header: "Overdue Interest" },
//       { key: "pos_principal", header: "POS (Principal)" },
//       { key: "disbursement_date", header: "Disbursement Date" },   // NEW
//   { key: "ageing_days", header: "Ageing (days)" }, 
//       { key: "last_due_date", header: "Last Due Date" } // NEW: include date
//     ];

//     const headerRow = columns.map(c => c.header);
//     const dataRows = rows.map(r => {
//       const lastDue = r.last_due_date ? new Date(r.last_due_date) : "";
//       return [
//         r.lan ?? "",
//         r.product ?? "",
//         r.customer_name ?? "",
//         Number(r.max_dpd ?? 0),
//         Number(r.overdue_emi ?? 0),
//         Number(r.overdue_principal ?? 0),
//         Number(r.overdue_interest ?? 0),
//         Number(r.pos_principal ?? 0),
//         r.disbursement_date ? new Date(r.disbursement_date) : "",  // NEW
//   Number(r.ageing_days ?? 0),  
//         r.last_due_date ? new Date(r.last_due_date) : ""
//       ];
//     });

//     const aoa = [headerRow, ...dataRows];

//     const ws = XLSX.utils.aoa_to_sheet(aoa);

//    // number formatting
// for (let r = 1; r < aoa.length; r++) {
//   // numeric columns: max_dpd(3), emi(4), princ(5), int(6), pos(7), ageing(9)
//   for (const c of [3,4,5,6,7,9]) {
//     const addr = XLSX.utils.encode_cell({ r, c });
//     if (ws[addr]) { ws[addr].t = "n"; ws[addr].z = "#,##0"; }
//   }
//   // date columns: disbursement_date(8), last_due_date(10)
//   for (const c of [8,10]) {
//     const addr = XLSX.utils.encode_cell({ r, c });
//     if (ws[addr] && aoa[r][c] instanceof Date) {
//       ws[addr].t = "d"; ws[addr].z = "yyyy-mm-dd";
//     }
//   }
// }

//     // Autosize columns
//     const colWidths = headerRow.map((h, idx) => {
//       const maxLen = Math.max(
//         String(h).length,
//         ...dataRows.map(row => (row[idx] == null ? 0 : String(row[idx]).length))
//       );
//       return { wch: Math.min(40, Math.max(10, maxLen + 2)) };
//     });
//     ws["!cols"] = colWidths;

//     const wb = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(wb, ws, "Visible Rows");

//     const safeProduct = String(filters.product || "ALL").replace(/[^\w-]+/g, "_");
//     const safeBucket = String(selected).replace(/[^\w-]+/g, "_");
//     const filename = `DPD_${safeProduct}_${safeBucket}_page_${page}_${sortBy}_${sortDir}.xlsx`;
//     XLSX.writeFile(wb, filename);
//   };

//   const handleDownloadAndEmailMe = async () => {
//     if (!rows.length || isEmailing) return;
//     const userId = getLoggedInUserId();
//     if (!userId) {
//       alert("No logged-in user found.");
//       return;
//     }

//     setIsEmailing(true);
//     try {
//       await api.post("/dashboard/dpd-export-email", {
//         userId,                   // server will look up email from users table
//         product: filters.product,
//         bucket: selected,
//         page,
//         sortBy,
//         sortDir,
//         rows: rows.map(r => ({
//           lan: r.lan,
//           customer_name: r.customer_name,
//           product: r.product,
//           max_dpd: r.max_dpd,
//           overdue_emi: r.overdue_emi,
//           overdue_principal: r.overdue_principal,
//           overdue_interest: r.overdue_interest,
//           pos_principal: r.pos_principal,
//           // last_due_date: r.last_due_date, // include if your email template needs it
//         })),
//       });

//       alert("Report is emailed to your email address.");
//     } catch (e) {
//       console.error("Email report error:", e);
//       alert("Failed to email report. Please try again.");
//     } finally {
//       setIsEmailing(false);
//     }
//   };

//   const SortIcon = ({ active, dir }) =>
//     active ? <span>&nbsp;{dir === "asc" ? "▲" : "▼"}</span> : null;

//   return (
//     <div style={{ background: "#fff", padding: "1rem", borderRadius: 8, marginTop: "2rem" }}>
//       <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//         <h2 style={{ margin: 0 }}>DPD Buckets</h2>
//         {asOf && <div style={{ fontSize: 12, opacity: .7 }}>As of {asOf}</div>}
//       </div>

//       <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
//         {bucketMeta.map(b => (
//           <button
//             key={b.key}
//             onClick={() => setSelected(b.key)}
//             style={{
//               flex: 1,
//               padding: "0.75rem 1rem",
//               borderRadius: 8,
//               border: selected === b.key ? "2px solid #e53935" : "1px solid #ddd",
//               background: selected === b.key ? "#ffeceb" : "#fafafa",
//               textAlign: "left",
//               cursor: "pointer"
//             }}
//           >
//             <div style={{ fontSize: 14, color: "#555" }}>{b.label}</div>
//             <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
//               <div style={{ fontWeight: 700, fontSize: 18 }}>{summary[b.key]?.loans || 0} loans</div>
//               <div style={{ fontWeight: 600 }}>{formatINR(summary[b.key]?.overdue_emi || 0)}</div>
//             </div>
//           </button>
//         ))}
//       </div>

//       {/* Toolbar: showing range, export, sort, and pagination */}
//       <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 12, flexWrap: "wrap" }}>
//         <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
//           <div style={{ fontSize: 13, color: "#666" }}>
//             {loading ? "Loading…" : `Showing ${startIdx}-${endIdx} of ${total}`}
//           </div>

//           {/* Download current page/view */}
//           <button
//             onClick={handleDownloadCurrentView}
//             disabled={loading || rows.length === 0}
//             style={{
//               padding: "6px 12px",
//               borderRadius: 6,
//               border: "1px solid #ddd",
//               background: rows.length ? "#f4f4f4" : "#eee",
//               cursor: loading || rows.length === 0 ? "not-allowed" : "pointer",
//               fontSize: 13
//             }}
//             title="Download the currently visible rows as Excel"
//           >
//             ⬇️ Download current view (Excel)
//           </button>

//           <button
//             onClick={handleDownloadAndEmailMe}
//             disabled={loading || rows.length === 0 || isEmailing}
//             style={{
//               padding: "6px 12px",
//               borderRadius: 6,
//               border: "1px solid #ddd",
//               background: (loading || rows.length === 0) ? "#eee" : "#f4f4f4",
//               cursor: (loading || rows.length === 0 || isEmailing) ? "not-allowed" : "pointer",
//               opacity: isEmailing ? 0.6 : 1,
//               fontSize: 13
//             }}
//             title={isEmailing ? "Sending…" : "Download the current page and email it to your registered email"}
//           >
//             {isEmailing ? "⏳ Sending…" : "⬇️ Download & ✉️ Email me"}
//           </button>
//         </div>

//         {/* Sort controls */}
//         <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
//           <label style={{ fontSize: 13, color: "#666" }}>Sort by:</label>
//           <select
//             value={sortBy}
//             onChange={(e) => setSortBy(e.target.value)}
//             disabled={loading}
//             style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid " + (loading ? "#eee" : "#ddd") }}
//           >
//             <option value="pos">POS (Principal)</option>
//             <option value="emi">Overdue EMI</option>
//             <option value="dpd">Max DPD</option>
//             <option value="due">Last Due Date</option>
//           </select>

//           <button
//             onClick={toggleDir}
//             disabled={loading}
//             style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", background: "#fafafa", cursor: loading ? "not-allowed" : "pointer" }}
//             title={`Direction: ${sortDir.toUpperCase()}`}
//           >
//             {sortDir === "asc" ? "▲ Asc" : "▼ Desc"}
//           </button>

//           {/* Rows per page & pager */}
//           <label style={{ fontSize: 13, color: "#666", marginLeft: 12 }}>Rows per page:</label>
//           <select
//             value={pageSize}
//             onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
//             style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid " + (loading ? "#eee" : "#ddd") }}
//             disabled={loading}
//           >
//             {[10, 25, 50, 100, 200].map(s => <option key={s} value={s}>{s}</option>)}
//           </select>

//           <button
//             onClick={() => setPage(p => Math.max(1, p - 1))}
//             disabled={page <= 1 || loading}
//             style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", background: "#fafafa", cursor: page <= 1 || loading ? "not-allowed" : "pointer" }}
//           >
//             Prev
//           </button>
//           <div style={{ minWidth: 70, textAlign: "center", fontSize: 13 }}>
//             Page {page} / {totalPages}
//           </div>
//           <button
//             onClick={() => setPage(p => Math.min(totalPages, p + 1))}
//             disabled={page >= totalPages || loading}
//             style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", background: "#fafafa", cursor: page >= totalPages || loading ? "not-allowed" : "pointer" }}
//           >
//             Next
//           </button>
//         </div>
//       </div>

//       <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
//         <table style={{ width: "100%", borderCollapse: "collapse" }}>
//           <thead>
//             <tr style={{ background: "#f9f9f9", color: "#201d1dff", fontWeight: "900", fontSize: 16 }}>
//               <th style={th}>LAN</th>
//               <th style={th}>Product</th>
//               <th style={th}>Max DPD</th>

//               {/* Clickable sort headers for EMI and POS */}
//               <th
//                 style={{ ...th, cursor: "pointer" }}
//                 onClick={() => setSort("emi")}
//                 title="Sort by Overdue EMI"
//               >
//                 Overdue EMI
//                 <SortIcon active={sortBy === "emi"} dir={sortDir} />
//               </th>
//               <th style={th}>Overdue Principal</th>
//               <th style={th}>Overdue Interest</th>

//               <th
//                 style={{ ...th, cursor: "pointer" }}
//                 onClick={() => setSort("pos")}
//                 title="Sort by POS (Principal)"
//               >
//                 POS (Principal)
//                 <SortIcon active={sortBy === "pos"} dir={sortDir} />
//               </th>

//               <th style={th}>Disbursement Date</th>
//     <th style={th}>Ageing (days)</th>

//               <th style={th}>Last Due Date</th>
//             </tr>
//           </thead>
//           <tbody>
//             {rows.map((r, idx) => (
//               <tr key={r.lan + "_" + idx}>
//                 <td style={td}>{r.lan}</td>
//                 <td style={td}>{r.product}</td>
//                 <td style={td}>{r.max_dpd}</td>
//                 <td style={td}>{formatINR(r.overdue_emi)}</td>
//                 <td style={td}>{formatINR(r.overdue_principal)}</td>
//                 <td style={td}>{formatINR(r.overdue_interest)}</td>
//                 <td style={td}>{formatINR(r.pos_principal)}</td>
//                 <td style={td}>{r.disbursement_date ? String(r.disbursement_date).slice(0,10) : "-"}</td>
//       <td style={td}>{(r.ageing_days ?? "") === "" ? "-" : r.ageing_days}</td>
//                 <td style={td}>{r.last_due_date ? String(r.last_due_date).slice(0, 10) : "-"}</td>
//               </tr>
//             ))}
//             {!rows.length && !loading && (
//               <tr><td style={td} colSpan={10}>No loans in this bucket.</td></tr>
//             )}
//           </tbody>
//         </table>
//       </div>
//       <LoaderOverlay show={loading || summaryLoading} label="Fetching data…" />
//     </div>
//   );
// };

// const th = { textAlign: "left", padding: "8px 10px", border: "1px solid #292424ff", fontSize: 12, color: "#1b1919ff", fontWeight: 900 };
// const td = { padding: "10px", borderBottom: "1px solid #f2f2f2", fontSize: 14 };

// export default DpdBuckets;








import React, { useEffect, useState } from "react";
import api from "../../api/api";
import * as XLSX from "xlsx"; // Excel export

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
  const [asOf, setAsOf] = useState("");
  const [isEmailing, setIsEmailing] = useState(false);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  // sorting (server-side)
  const [sortBy, setSortBy] = useState("dpd");   // 'pos' | 'emi' | 'dpd' | 'due' | 'ageing'
  const [sortDir, setSortDir] = useState("desc"); // 'asc' | 'desc'
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Full-screen overlay loader
  const LoaderOverlay = ({ show, label = "Loading…" }) => {
    // inject keyframes once
    React.useEffect(() => {
      const STYLE_ID = "global-loader-overlay-styles";
      if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
      }
    }, []);
    // lock scroll while visible
    React.useEffect(() => {
      if (!show) return;
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }, [show]);

    if (!show) return null;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(1px)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-busy="true"
        aria-live="polite"
        aria-label={label}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: 12,
            padding: "24px 28px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            gap: 16,
            minWidth: 260,
            justifyContent: "center"
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "3px solid #e6e6e6",
              borderTopColor: "#e53935",
              animation: "spin 0.9s linear infinite",
            }}
          />
          <div style={{ fontWeight: 600, color: "#333", letterSpacing: 0.2 }}>
            {label}
          </div>
        </div>
      </div>
    );
  };

  // fetch summary when product changes (single effect — no duplicate)
  useEffect(() => {
    const payload = { product: filters.product };
    setSummaryLoading(true);
    api.post("/dashboard/dpd-buckets", payload)
      .then(res => {
        const map = { ...emptySummary };
        (res.data?.buckets || []).forEach(b => {
          map[b.bucket] = {
            loans: Number(b.loans || 0),
            overdue_emi: Number(b.overdue_emi || 0)
          };
        });
        setAsOf(res.data?.asOf || "");
        setSummary(map);
      })
      .catch(e => console.error("DPD summary error:", e))
      .finally(() => setSummaryLoading(false));
  }, [filters.product]);

  // reset page when bucket or sort changes
  useEffect(() => {
    setPage(1);
  }, [selected, sortBy, sortDir]);

  // fetch list when product / selected / page / pageSize / sort change
  useEffect(() => {
    const payload = {
      product: filters.product,
      bucket: selected,
      page,
      pageSize,
      sortBy,
      sortDir
    };
    setLoading(true);
    api.post("/dashboard/dpd-list", payload)
      .then(res => {
        const r = res.data || {};
        setRows(Array.isArray(r.rows) ? r.rows : []);
        setTotal(Number(r.pagination?.total || 0));
      })
      .catch(e => console.error("DPD list error:", e))
      .finally(() => setLoading(false));
  }, [filters.product, selected, page, pageSize, sortBy, sortDir]);

  const formatINR = n => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(total, page * pageSize);

  // Sorting helpers
  const toggleDir = () => setSortDir(d => (d === "asc" ? "desc" : "asc"));
  const setSort = (key) => {
    if (sortBy !== key) {
      setSortBy(key);
      setSortDir("desc"); // default direction when switching field
    } else {
      toggleDir();
    }
  };

  // Export exactly the visible rows to Excel
  const handleDownloadCurrentView = () => {
    if (!rows.length) return;

    const columns = [
      { key: "lan", header: "LAN" },
      { key: "product", header: "Product" },
      { key: "customer_name", header: "Customer Name" },
      { key: "max_dpd", header: "Max DPD" },
      { key: "overdue_emi", header: "Overdue EMI" },
      { key: "overdue_principal", header: "Overdue Principal" },
      { key: "overdue_interest", header: "Overdue Interest" },
      { key: "pos_principal", header: "POS (Principal)" },
      { key: "disbursement_date", header: "Disbursement Date" },
      { key: "ageing_days", header: "Ageing (days)" },
      { key: "last_due_date", header: "Last Due Date" }
    ];

    const headerRow = columns.map(c => c.header);
    const dataRows = rows.map(r => ([
      r.lan ?? "",
      r.product ?? "",
      r.customer_name ?? "",
      Number(r.max_dpd ?? 0),
      Number(r.overdue_emi ?? 0),
      Number(r.overdue_principal ?? 0),
      Number(r.overdue_interest ?? 0),
      Number(r.pos_principal ?? 0),
      r.disbursement_date ? new Date(r.disbursement_date) : "",
      Number(r.ageing_days ?? 0),
      r.last_due_date ? new Date(r.last_due_date) : ""
    ]));

    const aoa = [headerRow, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // number & date formats
    for (let r = 1; r < aoa.length; r++) {
      // numeric columns: max_dpd(3), emi(4), princ(5), int(6), pos(7), ageing(9)
      for (const c of [3,4,5,6,7,9]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (ws[addr]) { ws[addr].t = "n"; ws[addr].z = "#,##0"; }
      }
      // date columns: disbursement_date(8), last_due_date(10)
      for (const c of [8,10]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (ws[addr] && aoa[r][c] instanceof Date) {
          ws[addr].t = "d"; ws[addr].z = "yyyy-mm-dd";
        }
      }
    }

    // Autosize columns
    const colWidths = headerRow.map((h, idx) => {
      const maxLen = Math.max(
        String(h).length,
        ...dataRows.map(row => (row[idx] == null ? 0 : String(row[idx]).length))
      );
      return { wch: Math.min(40, Math.max(10, maxLen + 2)) };
    });
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Visible Rows");

    const safeProduct = String(filters.product || "ALL").replace(/[^\w-]+/g, "_");
    const safeBucket = String(selected).replace(/[^\w-]+/g, "_");
    const filename = `DPD_${safeProduct}_${safeBucket}_page_${page}_${sortBy}_${sortDir}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const getLoggedInUserId = () => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw)?.userId : null;
    } catch {
      return null;
    }
  };

  const handleDownloadAndEmailMe = async () => {
    if (!rows.length || isEmailing) return;
    const userId = getLoggedInUserId();
    if (!userId) {
      alert("No logged-in user found.");
      return;
    }

    setIsEmailing(true);
    try {
      await api.post("/dashboard/dpd-export-email", {
        userId,
        product: filters.product,
        bucket: selected,
        page,
        sortBy,
        sortDir,
        rows: rows.map(r => ({
          lan: r.lan,
          customer_name: r.customer_name,
          product: r.product,
          max_dpd: r.max_dpd,
          overdue_emi: r.overdue_emi,
          overdue_principal: r.overdue_principal,
          overdue_interest: r.overdue_interest,
          pos_principal: r.pos_principal,
        })),
      });
      alert("Report is emailed to your email address.");
    } catch (e) {
      console.error("Email report error:", e);
      alert("Failed to email report. Please try again.");
    } finally {
      setIsEmailing(false);
    }
  };

  const SortIcon = ({ active, dir }) =>
    active ? <span>&nbsp;{dir === "asc" ? "▲" : "▼"}</span> : null;

  const overlayLabel = isEmailing
    ? "Sending report…"
    : "Fetching data…";

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

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "#666" }}>
            {loading ? "Loading…" : `Showing ${startIdx}-${endIdx} of ${total}`}
          </div>

          <button
            onClick={handleDownloadCurrentView}
            disabled={loading || rows.length === 0}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #ddd",
              background: rows.length ? "#f4f4f4" : "#eee",
              cursor: loading || rows.length === 0 ? "not-allowed" : "pointer",
              fontSize: 13
            }}
            title="Download the currently visible rows as Excel"
          >
            ⬇️ Download current view (Excel)
          </button>

          <button
            onClick={handleDownloadAndEmailMe}
            disabled={loading || rows.length === 0 || isEmailing}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #ddd",
              background: (loading || rows.length === 0) ? "#eee" : "#f4f4f4",
              cursor: (loading || rows.length === 0 || isEmailing) ? "not-allowed" : "pointer",
              opacity: isEmailing ? 0.6 : 1,
              fontSize: 13
            }}
            title={isEmailing ? "Sending…" : "Download the current page and email it to your registered email"}
          >
            {isEmailing ? "⏳ Sending…" : "⬇️ Download & ✉️ Email me"}
          </button>
        </div>

        {/* Sort controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, color: "#666" }}>Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            disabled={loading}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid " + (loading ? "#eee" : "#ddd") }}
          >
            <option value="pos">POS (Principal)</option>
            <option value="emi">Overdue EMI</option>
            <option value="dpd">Max DPD</option>
            <option value="due">Last Due Date</option>
            <option value="ageing">Ageing (days)</option> {/* NEW */}
          </select>

          <button
            onClick={toggleDir}
            disabled={loading}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", background: "#fafafa", cursor: loading ? "not-allowed" : "pointer" }}
            title={`Direction: ${sortDir.toUpperCase()}`}
          >
            {sortDir === "asc" ? "▲ Asc" : "▼ Desc"}
          </button>

          {/* Rows per page & pager */}
          <label style={{ fontSize: 13, color: "#666", marginLeft: 12 }}>Rows per page:</label>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid " + (loading ? "#eee" : "#ddd") }}
            disabled={loading}
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
              <th style={th}>DPD</th>

              <th
                style={{ ...th, cursor: "pointer" }}
                onClick={() => setSort("emi")}
                title="Sort by Overdue EMI"
              >
                Overdue EMI
                <SortIcon active={sortBy === "emi"} dir={sortDir} />
              </th>
              <th style={th}>Overdue Principal</th>
              <th style={th}>Overdue Interest</th>

              <th
                style={{ ...th, cursor: "pointer" }}
                onClick={() => setSort("pos")}
                title="Sort by POS (Principal)"
              >
                POS (Principal)
                <SortIcon active={sortBy === "pos"} dir={sortDir} />
              </th>

              <th style={th}>Disbursement Date</th>

              <th
                style={{ ...th, cursor: "pointer" }}
                onClick={() => setSort("ageing")}
                title="Sort by Ageing (days)"
              >
                Ageing Since Disbursement
                <SortIcon active={sortBy === "ageing"} dir={sortDir} />
              </th>

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
                <td style={td}>{r.disbursement_date ? String(r.disbursement_date).slice(0,10) : "-"}</td>
                <td style={td}>{(r.ageing_days ?? "") === "" ? "-" : r.ageing_days}</td>
                <td style={td}>{r.last_due_date ? String(r.last_due_date).slice(0, 10) : "-"}</td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td style={td} colSpan={10}>No loans in this bucket.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Full-screen overlay on any loading/emailing */}
      <LoaderOverlay show={loading || summaryLoading || isEmailing} label={overlayLabel} />
    </div>
  );
};

const th = { textAlign: "left", padding: "8px 10px", border: "1px solid #292424ff", fontSize: 12, color: "#1b1919ff", fontWeight: 900 };
const td = { padding: "10px", borderBottom: "1px solid #f2f2f2", fontSize: 14 };

export default DpdBuckets;
