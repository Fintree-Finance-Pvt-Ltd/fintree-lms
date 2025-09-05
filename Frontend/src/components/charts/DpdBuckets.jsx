import React, { useEffect, useState } from "react";
import api from "../../api/api";
import * as XLSX from "xlsx"; // ✅ NEW: for Excel export

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
  const [emailTo, setEmailTo] = useState("");

  const [rows, setRows] = useState([]);
  const [asOf, setAsOf] = useState("");
  const [isEmailing, setIsEmailing] = useState(false);

  const getLoggedInUserId = () => {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw)?.userId : null;
  } catch { return null; }
};


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

  // ✅ NEW: Export exactly the visible rows to Excel
  const handleDownloadCurrentView = () => {
    if (!rows.length) return;

    // 1) Define columns in the order you want in Excel
    const columns = [
      { key: "lan", header: "LAN" },
      { key: "product", header: "Product" },
      { key: "customer_name", header: "Customer Name" },
      { key: "max_dpd", header: "Max DPD" },
      { key: "overdue_emi", header: "Overdue EMI" },
      { key: "overdue_principal", header: "Overdue Principal" },
      { key: "overdue_interest", header: "Overdue Interest" },
      { key: "pos_principal", header: "POS (Principal)" },
    ];

    // 2) Build an array-of-arrays: first row = headers, rest = data
    const headerRow = columns.map(c => c.header);
    const dataRows = rows.map(r => {
      // Parse date to a Date object for correct Excel date cells
      const dateObj = r.last_due_date ? new Date(r.last_due_date) : "";
      return [
        r.lan,
        r.product,
        Number(r.max_dpd ?? 0),
        Number(r.overdue_emi ?? 0),
        Number(r.overdue_principal ?? 0),
        Number(r.overdue_interest ?? 0),
        Number(r.pos_principal ?? 0)
      ];
    });

    const aoa = [headerRow, ...dataRows];

    // 3) Make a worksheet
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // 4) Set number formats (keep them as numbers in Excel)
    // Currency-like numeric columns: indices 3..6 (0-based)
    for (let r = 1; r < aoa.length; r++) {
      // Overdue EMI, Overdue Principal, Overdue Interest, POS (Principal)
      for (const c of [3, 4, 5, 6]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (ws[addr]) {
          ws[addr].t = "n";
          // Simple thousands format (users can change to ₹ in Excel if they want)
          ws[addr].z = "#,##0";
        }
      }
      // Last Due Date
      const dateAddr = XLSX.utils.encode_cell({ r, c: 7 });
      if (ws[dateAddr] && aoa[r][7] instanceof Date) {
        ws[dateAddr].t = "d";
        ws[dateAddr].z = "yyyy-mm-dd";
      }
    }

    // 5) Autosize columns
    const colWidths = headerRow.map((h, idx) => {
      const maxLen = Math.max(
        String(h).length,
        ...dataRows.map(row => (row[idx] == null ? 0 : String(row[idx]).length))
      );
      return { wch: Math.min(40, Math.max(10, maxLen + 2)) };
    });
    ws["!cols"] = colWidths;

    // 6) Build workbook and download
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Visible Rows");
    const safeProduct = String(filters.product || "ALL").replace(/[^\w-]+/g, "_");
    const safeBucket = String(selected).replace(/[^\w-]+/g, "_");
    const filename = `DPD_${safeProduct}_${safeBucket}_page_${page}.xlsx`;
    XLSX.writeFile(wb, filename);
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
    // download locally
    // handleDownloadCurrentView();

    // send to backend for emailing (exact rows currently visible)
    await api.post("/dashboard/dpd-export-email", {
      userId,                   // server will look up email from users table
      product: filters.product,
      bucket: selected,
      page,
      rows: rows.map(r => ({
        lan: r.lan,
        customer_name: r.customer_name,
        product: r.product,
        max_dpd: r.max_dpd,
        overdue_emi: r.overdue_emi,
        overdue_principal: r.overdue_principal,
        overdue_interest: r.overdue_interest,
        pos_principal: r.pos_principal,
        // last_due_date: r.last_due_date,
      })),
    });

    alert("Report is emailed to your email address.");
  } catch (e) {
    console.error("Email report error:", e);
    alert("Failed to email report. Please try again.");
  }finally {
    setIsEmailing(false);
  }
};

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

      {/* Toolbar: showing range, export, and pagination */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 13, color: "#666" }}>
            {loading ? "Loading…" : `Showing ${startIdx}-${endIdx} of ${total}`}
          </div>

          {/* ✅ NEW: Download current page/view */}
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
  disabled={loading || rows.length === 0}
  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #ddd", background: rows.length ? "#f4f4f4" : "#eee", cursor: rows.length ? "pointer" : "not-allowed", fontSize: 13 }}
  title="Download the current page and email it to your registered email"
>
  ⬇️ Download & ✉️ Email me
</button>

        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 13, color: "#666" }}>Rows per page:</label>
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
              // 🔧 Minor fix: colSpan should be 8 (you had 7 earlier)
              <tr><td style={td} colSpan={8}>No loans in this bucket.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const th = { textAlign: "left", padding: "8px 10px", border: "1px solid #292424ff", fontSize: 12, color: "#1b1919ff", fontWeight: 900 };
const td = { padding: "10px", borderBottom: "1px solid #f2f2f2", fontSize: 14 };

export default DpdBuckets;
