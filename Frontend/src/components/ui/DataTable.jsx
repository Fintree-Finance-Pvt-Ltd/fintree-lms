// import React, { useEffect, useMemo, useState } from "react";

// const DataTable = ({
//   title = "",
//   rows = [],
//   columns = [], // [{ key, header, width, sortable, render(row), sortAccessor(row), csvAccessor(row) }]
//   globalSearchKeys = [], // e.g. ['customer_name','lan','mobile_number']
//   initialSort = { key: null, dir: "asc" }, // dir: 'asc' | 'desc'
//   initialPageSize = 10,
//   pageSizeOptions = [10, 25, 50, 100],
//   exportFileName = "export",
//   stickyHeader = true,
//   zebra = true,
//   onRowClick = null, // (row) => void
//   renderTopRight = null, // extra toolbar content (filters, buttons)
//   searchPlaceholder = "Search…",
// }) => {
//   // ---------- state ----------
//   const [search, setSearch] = useState("");
//   const [pageSize, setPageSize] = useState(initialPageSize);
//   const [page, setPage] = useState(1);
//   const [sort, setSort] = useState(initialSort); // { key, dir }

//   // ---------- utils ----------
//   const norm = (v) => String(v ?? "").toLowerCase().trim();

//   const filtered = useMemo(() => {
//     const q = norm(search);
//     if (!q || globalSearchKeys.length === 0) return rows;
//     return rows.filter((r) =>
//       globalSearchKeys.some((k) => norm(r?.[k]).includes(q))
//     );
//   }, [rows, search, globalSearchKeys]);

//   const sorted = useMemo(() => {
//     if (!sort?.key) return filtered;
//     const col = columns.find((c) => c.key === sort.key);
//     const dirFactor = sort.dir === "asc" ? 1 : -1;
//     const getVal = (row) => {
//       if (col?.sortAccessor) return col.sortAccessor(row);
//       const v = row?.[col?.key];
//       // try to handle dates & numbers nicely
//       const asNum = Number(v);
//       if (!Number.isNaN(asNum) && v !== "" && v !== null) return asNum;
//       const t = Date.parse(v);
//       if (!Number.isNaN(t) && typeof v === "string") return t;
//       return norm(v);
//     };
//     return [...filtered].sort((a, b) => {
//       const va = getVal(a);
//       const vb = getVal(b);
//       if (va < vb) return -1 * dirFactor;
//       if (va > vb) return 1 * dirFactor;
//       return 0;
//     });
//   }, [filtered, sort, columns]);

//   // pagination
//   const total = sorted.length;
//   const totalPages = Math.max(1, Math.ceil(total / pageSize));
//   const pageSafe = Math.min(page, totalPages) || 1;
//   const start = (pageSafe - 1) * pageSize;
//   const visible = sorted.slice(start, start + pageSize);

//   // keep page in bounds
//   useEffect(() => setPage(1), [search, pageSize, sort]);

//   const onSort = (key) => {
//     setSort((s) =>
//       s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
//     );
//   };

//   const exportCSV = () => {
//     const headers = columns.map((c) => c.header ?? c.key);
//     const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
//     const dataRows = sorted.map((row) =>
//       columns.map((c) => {
//         if (typeof c.csvAccessor === "function") return c.csvAccessor(row);
//         if (typeof c.render === "function") {
//           // try not to serialize JSX; fall back to raw cell value
//           return row?.[c.key];
//         }
//         return row?.[c.key];
//       })
//     );
//     const csv = [headers, ...dataRows].map((r) => r.map(esc).join(",")).join("\n");
//     const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
//     const a = document.createElement("a");
//     a.href = URL.createObjectURL(blob);
//     a.download = `${exportFileName}_${new Date().toISOString().slice(0, 10)}.csv`;
//     document.body.appendChild(a);
//     a.click();
//     a.remove();
//     URL.revokeObjectURL(a.href);
//   };

//   // ---------- styles ----------
//   const s = {
//     wrap: {
//       background: "#f6f7fb",
//       borderRadius: 14,
//       border: "1px solid #e5e7eb",
//       boxShadow: "0 8px 24px rgba(16,24,40,0.08)",
//       padding: 16,
//       fontFamily:
//         '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,"Helvetica Neue",Arial',
//       color: "#1f2937",
//     },
//     header: {
//       display: "flex",
//       alignItems: "center",
//       justifyContent: "space-between",
//       gap: 12,
//       marginBottom: 12,
//       flexWrap: "wrap",
//     },
//     h2: { margin: 0, fontSize: 20, fontWeight: 800, color: "#111827" },
//     toolbar: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
//     input: {
//       padding: "10px 12px",
//       borderRadius: 10,
//       border: "1px solid #d1d5db",
//       background: "#fff",
//       fontSize: 14,
//       minWidth: 220,
//       outline: "none",
//     },
//     btn: {
//       padding: "10px 14px",
//       borderRadius: 10,
//       border: "1px solid transparent",
//       cursor: "pointer",
//       fontSize: 14,
//       fontWeight: 600,
//       background: "#2563eb",
//       color: "#fff",
//       borderColor: "#1d4ed8",
//     },
//     tableWrap: {
//       overflow: "auto",
//       borderRadius: 12,
//       border: "1px solid #e5e7eb",
//       background: "#fff",
//     },
//     table: {
//       width: "100%",
//       borderCollapse: "separate",
//       borderSpacing: 0,
//       fontSize: 14,
//       minWidth: 700,
//     },
//     th: {
//       position: stickyHeader ? "sticky" : "static",
//       top: 0,
//       background: "#f9fafb",
//       color: "#374151",
//       textAlign: "left",
//       fontWeight: 700,
//       padding: "12px 14px",
//       borderBottom: "1px solid #e5e7eb",
//       whiteSpace: "nowrap",
//       userSelect: "none",
//     },
//     thClickable: { cursor: "pointer" },
//     td: {
//       padding: "12px 14px",
//       borderBottom: "1px solid #f3f4f6",
//       verticalAlign: "middle",
//       color: "#111827",
//     },
//     zebra: { background: "#fcfcfd" },
//     footer: {
//       display: "flex",
//       alignItems: "center",
//       justifyContent: "space-between",
//       gap: 8,
//       paddingTop: 12,
//       flexWrap: "wrap",
//     },
//     muted: { color: "#6b7280", fontSize: 13 },
//     pager: { display: "flex", gap: 6, alignItems: "center" },
//     pagerBtn: {
//       padding: "8px 12px",
//       borderRadius: 8,
//       border: "1px solid #d1d5db",
//       background: "#fff",
//       cursor: "pointer",
//     },
//     select: {
//       padding: "10px 12px",
//       borderRadius: 10,
//       border: "1px solid #d1d5db",
//       background: "#fff",
//       fontSize: 14,
//       minWidth: 110,
//       outline: "none",
//     },
//     rowHover: { transition: "background .12s ease" },
//   };

//   return (
//     <div style={s.wrap}>
//       <div style={s.header}>
//         <h2 style={s.h2}>{title}</h2>
//         <div style={s.toolbar}>
//           {globalSearchKeys.length > 0 && (
//             <input
//               placeholder={searchPlaceholder}
//               value={search}
//               onChange={(e) => setSearch(e.target.value)}
//               style={s.input}
//             />
//           )}
//           <button onClick={exportCSV} style={s.btn}>Export CSV</button>
//           {renderTopRight}
//         </div>
//       </div>

//       <div style={s.tableWrap}>
//         <table style={s.table}>
//           <thead>
//             <tr>
//               {columns.map((c) => (
//                 <th
//                   key={c.key}
//                   style={{ ...s.th, width: c.width }}
//                   className="dt-th"
//                   onClick={c.sortable ? () => onSort(c.key) : undefined}
//                 >
//                   <span style={c.sortable ? s.thClickable : null}>
//                     {c.header || c.key}
//                     {sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
//                   </span>
//                 </th>
//               ))}
//             </tr>
//           </thead>
//           <tbody>
//             {visible.length === 0 && (
//               <tr>
//                 <td colSpan={columns.length} style={{ ...s.td, textAlign: "center", color: "#6b7280" }}>
//                   No results.
//                 </td>
//               </tr>
//             )}

//             {visible.map((row, idx) => (
//               <tr
//                 key={row.id ?? row.lan ?? idx}
//                 style={{ ...(zebra && idx % 2 ? s.zebra : null), ...s.rowHover, cursor: onRowClick ? "pointer" : "default" }}
//                 onClick={onRowClick ? () => onRowClick(row) : undefined}
//                 onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
//                 onMouseLeave={(e) =>
//                   (e.currentTarget.style.background = zebra && idx % 2 ? s.zebra.background : "transparent")
//                 }
//               >
//                 {columns.map((c) => (
//                   <td key={c.key} style={{ ...s.td, width: c.width }}>
//                     {typeof c.render === "function" ? c.render(row) : (row?.[c.key] ?? "—")}
//                   </td>
//                 ))}
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>

//       <div style={s.footer}>
//         <div style={s.muted}>
//           Showing <b>{visible.length}</b> of <b>{total}</b> results
//         </div>
//         <div style={s.pager}>
//           <button
//             style={s.pagerBtn}
//             onClick={() => setPage((p) => Math.max(1, p - 1))}
//             disabled={pageSafe === 1}
//           >
//             ‹ Prev
//           </button>
//           <span style={s.muted}>
//             Page <b>{pageSafe}</b> / <b>{totalPages}</b>
//           </span>
//           <button
//             style={s.pagerBtn}
//             onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
//             disabled={pageSafe === totalPages}
//           >
//             Next ›
//           </button>

//           <select
//             value={pageSize}
//             onChange={(e) => setPageSize(Number(e.target.value))}
//             style={s.select}
//             title="Rows per page"
//           >
//             {pageSizeOptions.map((n) => (
//               <option key={n} value={n}>
//                 {n} / page
//               </option>
//             ))}
//           </select>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default DataTable;




import React, { useEffect, useMemo, useState } from "react";

const DataTable = ({
  title = "",
  rows = [],
  columns = [], // [{ key, header, width, sortable, filterable, render(row), sortAccessor(row), csvAccessor(row), filterAccessor(row) }]
  globalSearchKeys = [], // e.g. ['customer_name','lan','mobile_number']
  initialSort = { key: null, dir: "asc" }, // dir: 'asc' | 'desc'
  initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  exportFileName = "export",
  stickyHeader = true,
  zebra = true,
  onRowClick = null, // (row) => void
  renderTopRight = null, // extra toolbar content (filters, buttons)
  searchPlaceholder = "Search…",
  // optional: cap unique filter options to avoid huge dropdowns
  filterOptionCap = 1000,
}) => {
  // ---------- state ----------
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(initialSort); // { key, dir }

  // filters: { [colKey]: Set<string> } - stores normalized string values selected for that column
  const [filters, setFilters] = useState({});
  // UI state for the open filter dropdown
  const [openFilterCol, setOpenFilterCol] = useState(null);
  const [filterSearch, setFilterSearch] = useState(""); // search inside the current filter dropdown
  const [tempSelections, setTempSelections] = useState(new Set()); // local selections while dropdown open

  // ---------- utils ----------
  const norm = (v) => String(v ?? "").toLowerCase().trim();

  // produce display string for value (handles dates nicely)
  const displayFor = (v) => {
    if (v == null || v === "") return "—";
    // try ISO date detection
    const d = new Date(v);
    if (!Number.isNaN(d.getTime()) && typeof v === "string" && v.length >= 8) {
      return d.toISOString().slice(0, 10);
    }
    return String(v);
  };

  // ---------- filter options (unique values per column) ----------
  const uniqueOptions = useMemo(() => {
    const map = {};
    for (const c of columns) {
      if (!c.filterable) continue;
      const key = c.key;
      const seen = new Map(); // preserve order -> map from normalized -> original display value (first seen)
      for (const r of rows) {
        const raw = typeof c.filterAccessor === "function" ? c.filterAccessor(r) : r?.[key];
        const normed = norm(raw);
        if (!seen.has(normed)) seen.set(normed, raw);
        if (seen.size >= filterOptionCap) break;
      }
      // convert to array of { valueNorm, label }
      map[key] = Array.from(seen.entries()).map(([valueNorm, raw]) => ({
        valueNorm,
        label: displayFor(raw),
      }));
    }
    return map;
  }, [rows, columns, filterOptionCap]);

  // ---------- filtering (global search + column filters) ----------
  const filtered = useMemo(() => {
    const q = norm(search);
    const useGlobal = !!q && globalSearchKeys.length > 0;

    return rows.filter((r) => {
      // global search
      if (useGlobal) {
        const matchesGlobal = globalSearchKeys.some((k) => norm(r?.[k]).includes(q));
        if (!matchesGlobal) return false;
      }
      // column filters
      for (const colKey of Object.keys(filters)) {
        const selSet = filters[colKey];
        if (!selSet || selSet.size === 0) continue; // no restriction
        // find the column config to allow filterAccessor
        const col = columns.find((c) => c.key === colKey);
        const raw = typeof col?.filterAccessor === "function" ? col.filterAccessor(r) : r?.[colKey];
        const n = norm(raw);
        // if the normalized value is not in selection -> exclude
        if (!selSet.has(n)) return false;
      }
      return true;
    });
  }, [rows, search, globalSearchKeys, filters, columns]);

  // ---------- sorting ----------
  const sorted = useMemo(() => {
    if (!sort?.key) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    const dirFactor = sort.dir === "asc" ? 1 : -1;
    const getVal = (row) => {
      if (col?.sortAccessor) return col.sortAccessor(row);
      const v = row?.[col?.key];
      const asNum = Number(v);
      if (!Number.isNaN(asNum) && v !== "" && v !== null) return asNum;
      const t = Date.parse(v);
      if (!Number.isNaN(t) && typeof v === "string") return t;
      return norm(v);
    };
    return [...filtered].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va < vb) return -1 * dirFactor;
      if (va > vb) return 1 * dirFactor;
      return 0;
    });
  }, [filtered, sort, columns]);

  // pagination
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(page, totalPages) || 1;
  const start = (pageSafe - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  // keep page in bounds when search/pageSize/sort/filters change
  useEffect(() => setPage(1), [search, pageSize, sort, filters]);

  const onSort = (key) => {
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  // ---------- CSV export ----------
  const exportCSV = () => {
    const headers = columns.map((c) => c.header ?? c.key);
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const dataRows = sorted.map((row) =>
      columns.map((c) => {
        if (typeof c.csvAccessor === "function") return c.csvAccessor(row);
        if (typeof c.render === "function") {
          // try not to serialize JSX; fall back to raw cell value
          return row?.[c.key];
        }
        return row?.[c.key];
      })
    );
    const csv = [headers, ...dataRows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportFileName}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  // ---------- filter dropdown behavior ----------
  // when opening a filter for colKey, prefill tempSelections with existing filter for that col (or all)
  const openFilter = (colKey) => {
    setFilterSearch("");
    const existing = filters[colKey];
    if (existing && existing.size > 0) {
      setTempSelections(new Set(existing));
    } else {
      // default to all values selected in dropdown (so applying without changing keeps all)
      const opts = uniqueOptions[colKey] || [];
      setTempSelections(new Set(opts.map((o) => o.valueNorm)));
    }
    setOpenFilterCol(colKey);
  };

  const closeFilter = () => {
    setOpenFilterCol(null);
    setFilterSearch("");
    setTempSelections(new Set());
  };

  const toggleTempSelection = (valueNorm) => {
    setTempSelections((s) => {
      const n = new Set(s);
      if (n.has(valueNorm)) n.delete(valueNorm);
      else n.add(valueNorm);
      return n;
    });
  };

  const applyFilter = () => {
    if (!openFilterCol) return;
    setFilters((prev) => {
      const copy = { ...prev };
      copy[openFilterCol] = new Set(tempSelections);
      return copy;
    });
    closeFilter();
  };

  const clearFilter = (colKey) => {
    setFilters((prev) => {
      const copy = { ...prev };
      delete copy[colKey];
      return copy;
    });
    if (openFilterCol === colKey) closeFilter();
  };

  const selectAllToggle = (colKey, selectAll) => {
    const opts = uniqueOptions[colKey] || [];
    setTempSelections(selectAll ? new Set(opts.map((o) => o.valueNorm)) : new Set());
  };

  // ---------- styles ----------
  const s = {
    wrap: {
      background: "#f6f7fb",
      borderRadius: 14,
      border: "1px solid #e5e7eb",
      boxShadow: "0 8px 24px rgba(16,24,40,0.08)",
      padding: 16,
      fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,"Helvetica Neue",Arial',
      color: "#1f2937",
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 12,
      flexWrap: "wrap",
    },
    h2: { margin: 0, fontSize: 20, fontWeight: 800, color: "#111827" },
    toolbar: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
    input: {
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid #d1d5db",
      background: "#fff",
      fontSize: 14,
      minWidth: 220,
      outline: "none",
    },
    btn: {
      padding: "10px 14px",
      borderRadius: 10,
      border: "1px solid transparent",
      cursor: "pointer",
      fontSize: 14,
      fontWeight: 600,
      background: "#2563eb",
      color: "#fff",
      borderColor: "#1d4ed8",
    },
    tableWrap: {
      overflow: "auto",
      borderRadius: 12,
      border: "1px solid #e5e7eb",
      background: "#fff",
    },
    table: {
      width: "100%",
      borderCollapse: "separate",
      borderSpacing: 0,
      fontSize: 14,
      minWidth: 700,
    },
    th: {
      position: stickyHeader ? "sticky" : "static",
      top: 0,
      background: "#f9fafb",
      color: "#374151",
      textAlign: "left",
      fontWeight: 700,
      padding: "12px 14px",
      borderBottom: "1px solid #e5e7eb",
      whiteSpace: "nowrap",
      userSelect: "none",
      verticalAlign: "top",
    },
    thClickable: { cursor: "pointer" },
    td: {
      padding: "12px 14px",
      borderBottom: "1px solid #f3f4f6",
      verticalAlign: "middle",
      color: "#111827",
    },
    zebra: { background: "#fcfcfd" },
    footer: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      paddingTop: 12,
      flexWrap: "wrap",
    },
    muted: { color: "#6b7280", fontSize: 13 },
    pager: { display: "flex", gap: 6, alignItems: "center" },
    pagerBtn: {
      padding: "8px 12px",
      borderRadius: 8,
      border: "1px solid #d1d5db",
      background: "#fff",
      cursor: "pointer",
    },
    select: {
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid #d1d5db",
      background: "#fff",
      fontSize: 14,
      minWidth: 110,
      outline: "none",
    },
    rowHover: { transition: "background .12s ease" },

    // filter dropdown styles
    filterBtn: {
      marginLeft: 8,
      padding: "4px 6px",
      borderRadius: 6,
      border: "1px solid #e5e7eb",
      background: "#fff",
      cursor: "pointer",
      fontSize: 12,
    },
    filterDropdown: {
      position: "absolute",
      top: "calc(100% + 6px)",
      left: 6,
      zIndex: 2000,
      width: 300,
      maxHeight: 360,
      overflow: "hidden",
      border: "1px solid #e5e7eb",
      background: "#fff",
      borderRadius: 8,
      boxShadow: "0 10px 30px rgba(2,6,23,0.12)",
      display: "flex",
      flexDirection: "column",
    },
    filterHeader: {
      padding: "8px 10px",
      borderBottom: "1px solid #f3f4f6",
      display: "flex",
      gap: 8,
      alignItems: "center",
    },
    filterSearch: {
      padding: "8px 10px",
      border: "none",
      outline: "none",
      flex: 1,
      fontSize: 13,
      background: "#f8fafc",
      borderRadius: 6,
    },
    filterList: { overflow: "auto", padding: 8, flex: 1 },
    filterFooter: { padding: 8, borderTop: "1px solid #f3f4f6", display: "flex", gap: 6, justifyContent: "flex-end" },
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{title}</h2>
        <div style={s.toolbar}>
          {globalSearchKeys.length > 0 && (
            <input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={s.input}
            />
          )}
          <button onClick={exportCSV} style={s.btn}>Export CSV</button>
          {renderTopRight}
        </div>
      </div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {columns.map((c) => {
                const colFilterOptions = uniqueOptions[c.key] || [];
                const appliedFilter = filters[c.key];
                const isFiltered = appliedFilter && appliedFilter.size > 0;
                return (
                  <th
                    key={c.key}
                    style={{ ...s.th, width: c.width, position: "relative" }}
                    className="dt-th"
                    onClick={c.sortable ? () => onSort(c.key) : undefined}
                  >
                    <span style={c.sortable ? s.thClickable : null}>
                      {c.header || c.key}
                      {sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </span>

                    {/* filter button */}
                    {c.filterable && (
                      <button
                        title="Filter column"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (openFilterCol === c.key) {
                            closeFilter();
                          } else {
                            openFilter(c.key);
                          }
                        }}
                        style={{
                          ...s.filterBtn,
                          borderColor: isFiltered ? "#e53935" : "#e5e7eb",
                          background: isFiltered ? "#fff1f1" : "#fff",
                        }}
                      >
                        {isFiltered ? "⚑" : "▾"}
                      </button>
                    )}

                    {/* filter dropdown */}
                    {openFilterCol === c.key && c.filterable && (
                      <div style={s.filterDropdown} onClick={(ev) => ev.stopPropagation()}>
                        <div style={s.filterHeader}>
                          <input
                            autoFocus
                            placeholder="Search…"
                            value={filterSearch}
                            onChange={(e) => setFilterSearch(e.target.value)}
                            style={s.filterSearch}
                          />
                          <button
                            style={{ ...s.filterBtn, padding: "6px 8px" }}
                            onClick={() => selectAllToggle(c.key, true)}
                            title="Select all visible"
                          >
                            All
                          </button>
                          <button
                            style={{ ...s.filterBtn, padding: "6px 8px" }}
                            onClick={() => selectAllToggle(c.key, false)}
                            title="Clear selection"
                          >
                            None
                          </button>
                        </div>

                        <div style={s.filterList}>
                          {colFilterOptions.length === 0 && (
                            <div style={{ padding: 8, color: "#6b7280" }}>No values</div>
                          )}

                          {colFilterOptions
                            .filter((opt) => norm(opt.label).includes(norm(filterSearch)))
                            .map((opt) => {
                              const checked = tempSelections.has(opt.valueNorm);
                              return (
                                <label key={opt.valueNorm} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 6 }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleTempSelection(opt.valueNorm)}
                                  />
                                  <span style={{ fontSize: 13 }}>{opt.label}</span>
                                </label>
                              );
                            })}
                        </div>

                        <div style={s.filterFooter}>
                          <button
                            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff" }}
                            onClick={() => { clearFilter(c.key); }}
                          >
                            Clear
                          </button>
                          <button
                            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#2563eb", color: "#fff" }}
                            onClick={() => applyFilter()}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} style={{ ...s.td, textAlign: "center", color: "#6b7280" }}>
                  No results.
                </td>
              </tr>
            )}

            {visible.map((row, idx) => (
              <tr
                key={row.id ?? row.lan ?? idx}
                style={{ ...(zebra && idx % 2 ? s.zebra : null), ...s.rowHover, cursor: onRowClick ? "pointer" : "default" }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = zebra && idx % 2 ? s.zebra.background : "transparent")
                }
              >
                {columns.map((c) => (
                  <td key={c.key} style={{ ...s.td, width: c.width }}>
                    {typeof c.render === "function" ? c.render(row) : (row?.[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={s.footer}>
        <div style={s.muted}>
          Showing <b>{visible.length}</b> of <b>{total}</b> results
        </div>
        <div style={s.pager}>
          <button
            style={s.pagerBtn}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={pageSafe === 1}
          >
            ‹ Prev
          </button>
          <span style={s.muted}>
            Page <b>{pageSafe}</b> / <b>{totalPages}</b>
          </span>
          <button
            style={s.pagerBtn}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={pageSafe === totalPages}
          >
            Next ›
          </button>

          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            style={s.select}
            title="Rows per page"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default DataTable;
