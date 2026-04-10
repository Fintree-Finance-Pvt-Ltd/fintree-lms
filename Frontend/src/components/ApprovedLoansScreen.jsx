// // src/components/ApprovedLoansScreen.jsx
// // Server-side paginated version — works with all loan-fetch APIs that now return:
// // { rows: [...], pagination: { page, pageSize, total } }

// import React, { useCallback, useEffect, useRef, useState } from "react";
// import api from "../api/api";
// import { useNavigate } from "react-router-dom";
// import DataTable from "./ui/DataTable";
// import LoaderOverlay from "./ui/LoaderOverlay";

// const DEFAULT_PAGE_SIZE = 25;

// const ApprovedLoansTable = ({ apiUrl, title = "Approved Loans" }) => {
//   const [rows,       setRows]       = useState([]);
//   const [loading,    setLoading]    = useState(true);
//   const [err,        setErr]        = useState("");
//   const [page,       setPage]       = useState(1);
//   const [pageSize,   setPageSize]   = useState(DEFAULT_PAGE_SIZE);
//   const [totalRows,  setTotalRows]  = useState(0);
//   const [search,     setSearch]     = useState("");
//   const [debouncedSearch, setDebouncedSearch] = useState("");

//   const nav = useNavigate();
//   const abortRef = useRef(null);

//   // Debounce search input (300ms) so we don't fire on every keypress
//   useEffect(() => {
//     const t = setTimeout(() => setDebouncedSearch(search), 300);
//     return () => clearTimeout(t);
//   }, [search]);

//   // Reset to page 1 when search changes
//   useEffect(() => { setPage(1); }, [debouncedSearch, pageSize]);

//   const fetchPage = useCallback(() => {
//     if (abortRef.current) abortRef.current.abort();
//     const ctrl = new AbortController();
//     abortRef.current = ctrl;

//     setLoading(true);
//     setErr("");

//     api.get(apiUrl, {
//       params: { page, pageSize, search: debouncedSearch || undefined },
//       signal: ctrl.signal,
//     })
//       .then((res) => {
//         const data = res.data;
//         // Support both {rows, pagination} (new) and plain array (legacy fallback)
//         if (data && Array.isArray(data.rows)) {
//           setRows(data.rows);
//           setTotalRows(data.pagination?.total ?? data.rows.length);
//         } else if (Array.isArray(data)) {
//           // Legacy mode: API didn't paginate yet
//           setRows(data);
//           setTotalRows(data.length);
//         } else {
//           setRows([]);
//           setTotalRows(0);
//         }
//       })
//       .catch((e) => {
//         if (e?.code === "ERR_CANCELED") return;
//         setErr("Failed to fetch data.");
//       })
//       .finally(() => setLoading(false));
//   }, [apiUrl, page, pageSize, debouncedSearch]);

//   useEffect(() => { fetchPage(); }, [fetchPage]);

//   // Determine LAN patterns for conditional columns
//   const hasADK    = rows.some((r) => /^ADK/i.test(r?.lan));
//   const hasGQFSF  = rows.some((r) => /^GQFSF/i.test(r?.lan));
//   const hasGQNonF = rows.some((r) => /^GQNonFSF/i.test(r?.lan));

//   const columns = [
//     {
//       key: "customer_name",
//       header: "Loan Details",
//       sortable: true,
//       render: (r) => (
//         <span
//           style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
//           onClick={() => nav(`/approved-loan-details/${r.lan}`)}
//         >
//           {r.customer_name ?? "—"}
//         </span>
//       ),
//       sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
//       csvAccessor:  (r) => r.customer_name || "",
//       width: 220,
//     },
//     { key: "lender",          header: "Lender",          sortable: true, width: 140 },
//     { key: "partner_loan_id", header: "Partner Loan ID", sortable: true, width: 160 },
//     ...(hasADK ? [{
//       key: "batch_id", header: "Batch ID", sortable: true,
//       render:       (r) => (/^ADK/i.test(r?.lan)    ? (r.batch_id ?? "—") : "—"),
//       sortAccessor: (r) => (/^ADK/i.test(r?.lan)    ? String(r?.batch_id    || "").toLowerCase() : ""),
//       csvAccessor:  (r) => (/^ADK/i.test(r?.lan)    ? (r.batch_id    ?? "") : ""),
//       width: 140,
//     }] : []),
//     ...(hasGQFSF ? [{
//       key: "app_id", header: "APP ID (FSF)", sortable: true,
//       render:       (r) => (/^GQFSF/i.test(r?.lan)  ? (r.app_id  ?? "—") : "—"),
//       sortAccessor: (r) => (/^GQFSF/i.test(r?.lan)  ? String(r?.app_id  || "").toLowerCase() : ""),
//       csvAccessor:  (r) => (/^GQFSF/i.test(r?.lan)  ? (r.app_id  ?? "") : ""),
//       width: 140,
//     }] : []),
//     ...(hasGQNonF ? [{
//       key: "app_id", header: "APP ID (Non-FSF)", sortable: true,
//       render:       (r) => (/^GQNonFSF/i.test(r?.lan) ? (r.app_id ?? "—") : "—"),
//       sortAccessor: (r) => (/^GQNonFSF/i.test(r?.lan) ? String(r?.app_id || "").toLowerCase() : ""),
//       csvAccessor:  (r) => (/^GQNonFSF/i.test(r?.lan) ? (r.app_id ?? "") : ""),
//       width: 140,
//     }] : []),
//     { key: "lan",          header: "LAN",           sortable: true, width: 140 },
//     { key: "mobile_number",header: "Mobile Number", sortable: true, width: 160 },
//     {
//       key: "status",
//       header: "Status",
//       render: () => (
//         <span style={{
//           display: "inline-flex", gap: 6, padding: "6px 10px",
//           borderRadius: 999, fontSize: 12, fontWeight: 700,
//           background: "rgba(16,185,129,.12)", color: "#065f46",
//           border: "1px solid rgba(16,185,129,.35)"
//         }}>● Approved</span>
//       ),
//       csvAccessor: () => "Approved",
//       width: 130,
//     },
//     {
//       key: "docs",
//       header: "Docs",
//       render: (r) => (
//         <button
//           onClick={() => nav(`/documents/${r.lan}`)}
//           style={{
//             padding: "8px 10px", borderRadius: 8, border: "1px solid #93c5fd",
//             color: "#1d4ed8", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
//           }}
//         >📂 Docs</button>
//       ),
//       csvAccessor: () => "",
//       width: 110,
//     },
//   ];

//   const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

//   return (
//     <>
//       <LoaderOverlay show={loading} label="Fetching data…" />
//       {err && <p style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</p>}

//       {/* ── DataTable with server-side pagination ───────────────── */}
//       <DataTable
//         title={title}
//         rows={rows}
//         columns={columns}
//         globalSearchKeys={[]}          /* search is server-side */
//         initialSort={{ key: "lan", dir: "asc" }}
//         exportFileName="approved_loans"
//         initialPageSize={pageSize}
//         pageSizeOptions={[10, 25, 50, 100]}
//         serverPagination={true}
//         totalRows={totalRows}
//         currentPage={page}
//         onPageChange={setPage}
//         onPageSizeChange={(n) => setPageSize(n)}
//         renderTopRight={
//           <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
//             <input
//               placeholder="Search LAN, name, mobile…"
//               value={search}
//               onChange={(e) => setSearch(e.target.value)}
//               style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, minWidth: 240, outline: "none" }}
//             />
//             <span style={{ color: "#6b7280", fontSize: 13 }}>
//               {totalRows.toLocaleString()} record{totalRows !== 1 ? "s" : ""}
//             </span>
//           </div>
//         }
//       />
//     </>
//   );
// };

// function pagerBtnStyle(disabled) {
//   return {
//     padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db",
//     background: disabled ? "#f3f4f6" : "#fff",
//     color:      disabled ? "#9ca3af" : "#1f2937",
//     cursor: disabled ? "default" : "pointer",
//     fontSize: 13, fontWeight: 600,
//   };
// }


// export default ApprovedLoansTable;


// src/components/ApprovedLoansScreen.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "./ui/DataTable";
import LoaderOverlay from "./ui/LoaderOverlay";
import "../styles/ApprovedLoans.css";
 
const DEFAULT_PAGE_SIZE = 25;
 
const ApprovedLoansTable = ({ apiUrl, title = "Approved Loans" }) => {
  // --- YOUR ORIGINAL LOGIC: STATE ---
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalRows, setTotalRows] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
 
  const nav = useNavigate();
  const abortRef = useRef(null);
 
  // --- YOUR ORIGINAL LOGIC: SEARCH DEBOUNCE ---
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
 
  // --- YOUR ORIGINAL LOGIC: PAGINATION RESET ---
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);
 
  // --- YOUR ORIGINAL LOGIC: DATA FETCHING ---
  const fetchPage = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
 
    setLoading(true);
    setErr("");
 
    api
      .get(apiUrl, {
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
  }, [apiUrl, page, pageSize, debouncedSearch]);
 
  useEffect(() => {
    fetchPage();
  }, [fetchPage]);
 
  // --- YOUR ORIGINAL LOGIC: LAN PATTERN DETECTION ---
  const hasADK = rows.some((r) => /^ADK/i.test(r?.lan));
  const hasGQFSF = rows.some((r) => /^GQFSF/i.test(r?.lan));
  const hasGQNonF = rows.some((r) => /^GQNonFSF/i.test(r?.lan));
 
  // --- MODERN COLUMN DEFINITIONS (Mapping to your logic) ---
  const columns = [
    {
      key: "customer_name",
      header: "Customer Details",
      sortable: true,
      render: (r) => (
        <div
          className="modern-cell-customer"
          onClick={() => nav(`/approved-loan-details/${r.lan}`)}
        >
          <span className="customer-primary">{r.customer_name ?? "—"}</span>
          <span className="customer-secondary">{r.lender}</span>
        </div>
      ),
      sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
      csvAccessor: (r) => r.customer_name || "",
      width: 220,
    },
    { key: "lender", header: "Lender", sortable: true, width: 140 },
    {
      key: "partner_loan_id",
      header: "Partner Loan ID",
      sortable: true,
      width: 160,
    },
    ...(hasADK
      ? [
          {
            key: "batch_id",
            header: "Batch ID",
            sortable: true,
            render: (r) =>
              /^ADK/i.test(r?.lan) ? (
                <span className="mono-text">{r.batch_id ?? "—"}</span>
              ) : (
                "—"
              ),
            sortAccessor: (r) =>
              /^ADK/i.test(r?.lan)
                ? String(r?.batch_id || "").toLowerCase()
                : "",
            csvAccessor: (r) =>
              /^ADK/i.test(r?.lan) ? (r.batch_id ?? "") : "",
            width: 140,
          },
        ]
      : []),
    ...(hasGQFSF
      ? [
          {
            key: "app_id",
            header: "APP ID (FSF)",
            sortable: true,
            render: (r) =>
              /^GQFSF/i.test(r?.lan) ? (
                <span className="mono-text">{r.app_id ?? "—"}</span>
              ) : (
                "—"
              ),
            sortAccessor: (r) =>
              /^GQFSF/i.test(r?.lan)
                ? String(r?.app_id || "").toLowerCase()
                : "",
            csvAccessor: (r) =>
              /^GQFSF/i.test(r?.lan) ? (r.app_id ?? "") : "",
            width: 140,
          },
        ]
      : []),
    ...(hasGQNonF
      ? [
          {
            key: "app_id",
            header: "APP ID (Non-FSF)",
            sortable: true,
            render: (r) =>
              /^GQNonFSF/i.test(r?.lan) ? (
                <span className="mono-text">{r.app_id ?? "—"}</span>
              ) : (
                "—"
              ),
            sortAccessor: (r) =>
              /^GQNonFSF/i.test(r?.lan)
                ? String(r?.app_id || "").toLowerCase()
                : "",
            csvAccessor: (r) =>
              /^GQNonFSF/i.test(r?.lan) ? (r.app_id ?? "") : "",
            width: 140,
          },
        ]
      : []),
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      render: (r) => <span className="lan-badge">{r.lan}</span>,
      width: 140,
    },
    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,
      render: (r) => <span className="contact-link">{r.mobile_number}</span>,
      width: 160,
    },
    {
      key: "status",
      header: "Status",
      render: () => (
        <span className="status-pill status-approved">● Approved</span>
      ),
      csvAccessor: () => "Approved",
      width: 130,
    },
    {
      key: "docs",
      header: "Docs",
      render: (r) => (
        <button
          className="btn-modern-action"
          onClick={() => nav(`/documents/${r.lan}`)}
        >
          📂 Docs
        </button>
      ),
      csvAccessor: () => "",
      width: 110,
    },
  ];
 
  return (
    <div className="approved-layout">
      <LoaderOverlay show={loading} label="Fetching data…" />
 
      {/* --- NEW MODERN HEADER --- */}
      <div className="approved-header-modern">
        <div className="header-titles">
          <h1>{title}</h1>
          <p className="header-subtitle">
            View and manage all verified and approved loan records
          </p>
        </div>
 
        <div className="header-tools">
          <div className="modern-search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              placeholder="Search LAN, name, mobile…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="stats-indicator">
            <span className="stats-count">{totalRows.toLocaleString()}</span>
            <span className="stats-label">Records</span>
          </div>
        </div>
      </div>
 
      {err && <div className="modern-error-toast">{err}</div>}
 
      {/* --- TABLE WRAPPED IN MODERN CONTAINER --- */}
      <div className="table-container-modern">
        <DataTable
          rows={rows}
          columns={columns}
          globalSearchKeys={[]}
          initialSort={{ key: "lan", dir: "asc" }}
          exportFileName="approved_loans"
          initialPageSize={pageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          serverPagination={true}
          totalRows={totalRows}
          currentPage={page}
          onPageChange={setPage}
          onPageSizeChange={(n) => setPageSize(n)}
          renderTopRight={null} // Search is now in the modern header above
        />
      </div>
    </div>
  );
};
 
export default ApprovedLoansTable;
 
 