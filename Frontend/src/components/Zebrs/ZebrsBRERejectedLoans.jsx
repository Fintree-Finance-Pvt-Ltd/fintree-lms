import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const formatMoney = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n)
    ? `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
};

const formatDate = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : parsed.toLocaleDateString("en-IN");
};

const ZebrsBRERejectedLoans = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalRows, setTotalRows] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const fetchRows = useCallback(
    async (signal) => {
      setLoading(true);
      setError("");
      try {
        const response = await api.get("/zebrs/bre-rejected-loans", {
          params: {
            page,
            pageSize,
            search: debouncedSearch || undefined,
            sortBy: "updated_at",
            sortDir: "desc",
          },
          signal,
        });
        if (signal.aborted) return;
        const data = response.data;
        const resultRows = Array.isArray(data?.rows) ? data.rows : [];
        setRows(resultRows);
        setTotalRows(Number(data?.pagination?.total ?? resultRows.length));
      } catch (err) {
        if (signal.aborted || err?.code === "ERR_CANCELED") return;
        console.error("Zebrs rejected loans fetch error:", err);
        setError(
          err.response?.data?.message ||
            "Failed to fetch Zebrs rejected loans.",
        );
        setRows([]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [page, pageSize, debouncedSearch],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchRows(controller.signal);
    return () => controller.abort();
  }, [fetchRows, refreshVersion]);

  const openCustomer = (row) => {
    if (row?.lan)
      navigate(`/zebrs/update-data?lan=${encodeURIComponent(row.lan)}`);
  };

  const columns = [
    {
      key: "customer_name",
      header: "Loan Details",
      sortable: true,
      width: 210,
      render: (r) => (
        <button
          type="button"
          className="zbr-link"
          onClick={() => openCustomer(r)}
        >
          {r.customer_name || "—"}
        </button>
      ),
    },
    {
      key: "lender",
      header: "Lender",
      width: 110,
      render: () => "Zebrs",
      csvAccessor: () => "Zebrs",
    },
    {
      key: "partner_loan_id",
      header: "Partner Loan ID",
      sortable: true,
      width: 160,
    },
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      width: 150,
      render: (r) => (
        <button
          type="button"
          className="zbr-link"
          onClick={() => openCustomer(r)}
        >
          {r.lan || "—"}
        </button>
      ),
    },
    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,
      width: 155,
      render: (r) =>
        r.mobile_number ? (
          <a className="zbr-link" href={`tel:${r.mobile_number}`}>
            {r.mobile_number}
          </a>
        ) : (
          "—"
        ),
    },
    {
      key: "loan_amount",
      header: "Loan Amount",
      sortable: true,
      width: 145,
      render: (r) => formatMoney(r.loan_amount),
      csvAccessor: (r) => r.loan_amount ?? "",
    },
    {
      key: "rejection_type",
      header: "Rejection Type",
      sortable: true,
      width: 165,
      render: (r) => (
        <span className="zbr-pill">● {r.rejection_type || "Rejected"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      width: 145,
      render: (r) => <span className="zbr-pill">{r.status || "—"}</span>,
    },
    { key: "stage", header: "Stage", sortable: true, width: 160 },
    {
      key: "rejection_remark",
      header: "Rejection Remarks",
      sortable: true,
      width: 360,
      render: (r) => {
        const remark = String(
          r.rejection_remark ||
            r.operation_rejection_remark ||
            r.credit_rejection_remark ||
            r.zebrs_bre_reason ||
            "",
        ).trim();
        return remark ? (
          <div className="zbr-remark">
            <div className="zbr-remark-bar" />
            <div className="zbr-remark-body">
              <span className="zbr-remark-label">Rejection reason</span>
              <p title={remark}>{remark}</p>
            </div>
          </div>
        ) : (
          <span className="zbr-muted">No remark recorded</span>
        );
      },
      csvAccessor: (r) =>
        r.rejection_remark ||
        r.operation_rejection_remark ||
        r.credit_rejection_remark ||
        r.zebrs_bre_reason ||
        "",
    },
    {
      key: "updated_at",
      header: "Updated At",
      sortable: true,
      width: 135,
      render: (r) => formatDate(r.updated_at),
    },
    {
      key: "docs",
      header: "Documents",
      width: 120,
      csvAccessor: () => "",
      render: (r) => (
        <button
          type="button"
          className="zbr-docs"
          onClick={() => navigate(`/documents/${encodeURIComponent(r.lan)}`)}
        >
          📂 Docs
        </button>
      ),
    },
  ];

  return (
    <div className="zbr-page">
      <style>{`
        .zbr-page { width:100%; min-width:0; }
        /* Scroll the wide table instead of shrinking every column. */
        .zbr-table-scroll { width:100%; min-width:0; overflow-x:auto; -webkit-overflow-scrolling:touch; border-radius:14px; }
        .zbr-table-scroll table { min-width:1580px !important; width:100%; table-layout:auto !important; }
        .zbr-table-scroll th, .zbr-table-scroll td { box-sizing:border-box; vertical-align:middle; }
        .zbr-table-scroll th:nth-child(10),
        .zbr-table-scroll td:nth-child(10) { min-width:360px !important; width:360px !important; }
        .zbr-table-scroll td:nth-child(10) { vertical-align:top; }
        .zbr-table-scroll th:not(:nth-child(10)),
        .zbr-table-scroll td:not(:nth-child(10)) { white-space:nowrap; }
        .zbr-table-scroll td:first-child { white-space:normal; min-width:150px; }
        .zbr-table-scroll td:nth-child(9) { white-space:normal; min-width:120px; }
        .zbr-table-scroll td:nth-child(10) { white-space:normal !important; }
        .zbr-table-scroll td:nth-child(10) .zbr-remark { min-width:320px; }
        .zbr-table-scroll td:nth-child(10) .zbr-remark-body p { overflow-wrap:break-word; word-break:normal; }
        .zbr-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; padding:16px 18px; margin-bottom:16px; background:white; border:1px solid #e2e8f0; border-radius:12px; }
        .zbr-header h2 { color:#142e58; font-size:20px; margin:0 0 4px; font-weight:800; }
        .zbr-header p, .zbr-description { margin:0; color:#64748b; font-size:12px; }
        .zbr-tools { display:flex; align-items:center; flex-wrap:wrap; gap:10px; }
        .zbr-search { padding:9px 12px; width:235px; max-width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:9px; background:#f8fafc; outline:none; font-size:13px; }
        .zbr-search:focus { border-color:#2563eb; background:white; }
        .zbr-refresh { padding:10px 15px; color:white; background:#17396d; border:0; border-radius:9px; font-size:13px; font-weight:700; cursor:pointer; }
        .zbr-refresh:disabled { opacity:.6; cursor:not-allowed; }
        .zbr-link { background:transparent; border:0; padding:0; font:inherit; font-weight:700; color:#2563eb; text-decoration:none; cursor:pointer; text-align:left; }
        .zbr-link:hover { text-decoration:underline; }
        .zbr-pill { display:inline-flex; align-items:center; white-space:nowrap; gap:6px; padding:6px 11px; border-radius:999px; color:#991b1b; background:#fff1f2; border:1px solid #fecaca; font-size:12px; font-weight:700; }
        .zbr-remark { box-sizing:border-box; display:flex; width:340px; min-width:320px; max-width:100%; gap:12px; padding:12px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; }
        .zbr-remark-bar { width:3px; min-width:3px; background:#dc2626; border-radius:5px; }
        .zbr-remark-body { min-width:0; flex:1; }
        .zbr-remark-label { color:#b91c1c; display:block; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; white-space:normal; }
        .zbr-remark-body p { margin:0; color:#334155; font-size:13px; line-height:1.6; overflow-wrap:break-word; word-break:normal; white-space:pre-wrap; }
        .zbr-muted { color:#94a3b8; font-style:italic; font-size:12px; }
        .zbr-docs { padding:8px 12px; background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; font-size:12px; font-weight:700; border-radius:8px; cursor:pointer; }
        .zbr-error { padding:12px 15px; border:1px solid #fecaca; background:#fef2f2; color:#b91c1c; border-radius:9px; margin-bottom:15px; }
      `}</style>

      <LoaderOverlay show={loading} label="Fetching Zebrs rejected loans..." />
      {error && (
        <div role="alert" className="zbr-error">
          {error}
        </div>
      )}
      <div className="zbr-table-scroll">
        <DataTable
          title="Zebrs BRE Rejected Loans"
          renderTopRight={
            <div className="zbr-tools">
              <input
                className="zbr-search"
                aria-label="Search rejected loans"
                placeholder="Search LAN, customer, remark..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button
                type="button"
                className="zbr-refresh"
                disabled={loading}
                onClick={() => setRefreshVersion((value) => value + 1)}
              >
                ↻ Refresh
              </button>
            </div>
          }
          rows={rows}
          columns={columns}
          globalSearchKeys={[]}
          exportFileName="Zebrs_BRE_Rejected_Loans"
          serverPagination={true}
          totalRows={totalRows}
          currentPage={page}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(Number(n));
            setPage(1);
          }}
          initialPageSize={pageSize}
          pageSizeOptions={[10, 25, 50, 100]}
        />
      </div>
    </div>
  );
};

export default ZebrsBRERejectedLoans;
