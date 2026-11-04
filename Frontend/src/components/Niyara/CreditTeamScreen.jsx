import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Download,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import api from "../../api/api";

// Axios client must already use /api as its base URL (same as YaMoney pages).
// This screen NEVER sends the Niyara partner x-api-key to the browser.

const ENDPOINTS = {
  pending: "/niyara/credit-loans",
  all: "/loan-booking/all-loans",
  decision: (lan) => `/niyara/${encodeURIComponent(lan)}/credit-decision`,
};

const money = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
};

const isCreditEligible = (loan) =>
  loan?.status === "partner_credit_approved" &&
  loan?.stage === "ff_credit_pending";

const escapeCSV = (value) => {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export default function CreditTeamScreen({ mode = "pending" }) {
  const view = mode === "all" ? "all" : "pending";
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyLan, setBusyLan] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortDir, setSortDir] = useState("desc");
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let mounted = true;
    const id = ++requestId.current;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params =
          view === "all"
            ? {
                table: "loan_booking_niyara",
                prefix: "NYRA",
                page,
                pageSize,
                search,
                sortBy: "LAN",
                sortDir,
              }
            : {
                page,
                pageSize,
                search,
                sortBy: "id",
                sortDir,
              };

        const response = await api.get(ENDPOINTS[view], { params });

        const result = response.data;

        if (result?.success === false || !Array.isArray(result?.rows)) {
          throw new Error(result?.message || "Failed to fetch Niyara loans");
        }

        if (!mounted || id !== requestId.current) return;
        const resultTotal = Number(
          result.pagination?.total ?? result.total ?? result.rows.length,
        );
        if (page > 1 && resultTotal <= (page - 1) * pageSize) {
          setPage(Math.max(1, Math.ceil(resultTotal / pageSize)));
          return;
        }
        setRows(result.rows);
        setTotal(resultTotal);
      } catch (err) {
        if (!mounted || id !== requestId.current) return;
        setRows([]);
        setTotal(0);
        const status = err?.response?.status;
        const message = err?.response?.data?.message || err?.message;
        setError(
          status === 401 || status === 403
            ? "Access denied or session expired. Check login and Niyara page permissions."
            : status === 404 && view === "all"
              ? "All Loans API not found. Check the loan-booking router mount."
              : message || "Unable to fetch Niyara cases.",
        );
      } finally {
        if (mounted && id === requestId.current) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [view, page, pageSize, search, sortDir, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const handleDecision = async (row, decision) => {
    if (busyLan || !isCreditEligible(row)) return;
    const lan = String(row.lan || "")
      .trim()
      .toUpperCase();
    if (!/^NYRA\d+$/.test(lan)) {
      setError("Invalid Niyara LAN.");
      return;
    }

    let reason = "";
    if (decision === "reject") {
      const entered = window.prompt(`Rejection reason for ${lan}:`);
      if (entered === null) return;
      reason = entered.trim();
      if (!reason || reason.length > 1000) {
        setError("Rejection reason must contain 1 to 1000 characters.");
        return;
      }
    }

    if (
      !window.confirm(
        `${decision === "approve" ? "Approve" : "Reject"} ${lan}?`,
      )
    )
      return;

    setBusyLan(lan);
    setError("");
    setSuccess("");
    try {
      const response = await api.patch(ENDPOINTS.decision(lan), {
        decision,
        ...(decision === "reject" ? { reason } : {}),
      });
      if (response.data?.success !== true) {
        throw new Error(response.data?.message || "Decision failed");
      }
      setSuccess(
        `${lan} ${decision === "approve" ? "approved" : "rejected"} successfully.`,
      );
      setSelected(null);
      refresh();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          `Unable to ${decision} ${lan}.`,
      );
    } finally {
      setBusyLan("");
    }
  };

  const exportCurrentPage = () => {
    if (!rows.length) return;
    const columns = [
      ["LAN", "lan"],
      ["Customer", "customer_name"],
      ["Partner ID", "partner_loan_id"],
      ["Mobile", "mobile_number"],
      ["Requested Amount", "requested_amount"],
      ["Loan Amount", "loan_amount"],
      ["Status", "status"],
      ["Stage", "stage"],
      ["Updated At", "updated_at"],
    ];
    const csv = [
      columns.map(([header]) => escapeCSV(header)).join(","),
      ...rows.map((row) =>
        columns.map(([, key]) => escapeCSV(row[key])).join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `niyara_${view}_page_${page}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);

  return (
    <main className="nyc-page">
      <style>{`
        .nyc-page{padding:24px;min-height:100%;background:#f4f7fb;color:#142846;font-family:inherit}
        .nyc-top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}
        .nyc-eyebrow{font-size:10px;letter-spacing:1.3px;text-transform:uppercase;color:#2a659a;font-weight:800}
        .nyc-title{font-size:24px;font-weight:800;color:#102c53;margin:4px 0}
        .nyc-sub{font-size:12px;color:#71839b}
        .nyc-card{background:white;border:1px solid #e4eaf2;border-radius:16px;padding:20px;box-shadow:0 6px 26px rgba(19,45,80,.05)}
        .nyc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}
        .nyc-actions{display:flex;align-items:center;flex-wrap:wrap;gap:9px}
        .nyc-btn{display:inline-flex;align-items:center;gap:6px;justify-content:center;font-family:inherit;background:white;border:1px solid #dbe4f0;color:#17416b;padding:9px 11px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
        .nyc-btn:disabled{opacity:.5;cursor:not-allowed}
        .nyc-btn:hover:not(:disabled){background:#f2f7fe}
        .nyc-primary{background:#102f60;color:white;border-color:#102f60}
        .nyc-primary:hover:not(:disabled){background:#16457e}
        .nyc-search{display:flex;align-items:center;gap:7px;padding:0 10px;border:1px solid #dbe4ef;background:#f8fafd;border-radius:9px;height:36px}
        .nyc-search input{min-width:150px;width:190px;font:inherit;font-size:12px;background:none;border:0;outline:0;color:#15365c}
        .nyc-message{padding:11px 13px;border-radius:8px;font-size:12px;margin-bottom:15px}
        .nyc-message.error{background:#fff1f2;color:#ae2334;border:1px solid #fecdd3}
        .nyc-message.success{background:#eefaf2;color:#0f7b40;border:1px solid #bee9cd}
        .nyc-scroll{overflow-x:auto;border:1px solid #e6edf4;border-radius:12px}
        .nyc-table{border-collapse:collapse;width:100%;min-width:1120px}
        .nyc-table th{background:#f7f9fd;color:#647991;text-align:left;font-size:10px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:14px 11px;white-space:nowrap}
        .nyc-table td{border-top:1px solid #eaf0f7;padding:14px 11px;font-size:12px;color:#1b3657;vertical-align:middle}
        .nyc-table tbody tr:hover{background:#fbfdff}
        .nyc-name{font-weight:800;color:#164994;max-width:180px;overflow-wrap:anywhere}
        .nyc-small{font-size:11px;color:#73849a;margin-top:4px}
        .nyc-lan{display:inline-block;background:#eff4fc;border:1px solid #dce8f7;border-radius:7px;padding:7px 9px;color:#174477;font-weight:800}
        .nyc-status{display:inline-block;background:#edf5ff;color:#1d55a0;padding:7px 8px;font-weight:750;font-size:11px;border-radius:7px;white-space:nowrap}
        .nyc-stage{color:#5b7190;font-size:11px}
        .nyc-amount{white-space:nowrap;font-weight:750}
        .nyc-row-actions{display:flex;align-items:center;gap:6px}
        .nyc-approve{background:#effaf3;border-color:#bde9cc;color:#087d43}
        .nyc-reject{background:#fff4f4;border-color:#f4c7c7;color:#bb3434}
        .nyc-empty{text-align:center!important;padding:42px 16px!important;color:#7788a0!important}
        .nyc-footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:15px;color:#72849d;font-size:12px;margin-top:16px}
        .nyc-pager{display:flex;align-items:center;gap:8px}
        .nyc-pager select{border:1px solid #dce5f0;padding:8px;border-radius:7px;background:white;color:#34516f}
        .nyc-overlay{position:fixed;inset:0;background:#071b36a8;display:grid;place-items:center;z-index:1000;padding:20px}
        .nyc-modal{width:min(520px,100%);max-height:85vh;overflow:auto;background:white;border-radius:14px;padding:23px;box-shadow:0 12px 40px #081e3855}
        .nyc-modal-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .nyc-detail{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #edf1f6;padding:11px 0;font-size:12px}
        .nyc-detail>span{color:#71849a}.nyc-detail strong{text-align:right;overflow-wrap:anywhere}
        @media(max-width:700px){.nyc-page{padding:12px}.nyc-card{padding:12px}.nyc-title{font-size:20px}.nyc-search input{width:135px;min-width:90px}}
      `}</style>

      <div className="nyc-top">
        <div>
          <div className="nyc-eyebrow">Niyara / Unsecured Business Loan</div>
          <h1 className="nyc-title">{view === "all" ? "Niyara All Loans" : "Niyara Credit Team"}</h1>
          <div className="nyc-sub">
            {view === "pending"
              ? "Internal Credit decision pending"
              : "All Niyara cases · read-only history"}
            {loading ? " · Loading..." : ` · ${total} record(s)`}
          </div>
        </div>
        <button
          className="nyc-btn"
          type="button"
          onClick={refresh}
          disabled={loading || !!busyLan}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <section className="nyc-card">
        <div className="nyc-toolbar">
          <div className="nyc-eyebrow">
            {view === "all" ? "All Niyara Loans" : "Pending Internal Credit"}
          </div>
          <div className="nyc-actions">
            <label className="nyc-search">
              <Search size={15} color="#7890a6" />
              <input
                aria-label="Search Niyara loans"
                placeholder="LAN, customer, partner ID..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <button
              className="nyc-btn nyc-primary"
              onClick={exportCurrentPage}
              disabled={!rows.length || loading}
              title="Exports the currently displayed page"
            >
              <Download size={14} /> Export Page CSV
            </button>
          </div>
        </div>

        {error && (
          <div className="nyc-message error" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="nyc-message success" role="status">
            {success}
          </div>
        )}

        <div className="nyc-scroll">
          <table className="nyc-table">
            <thead>
              <tr>
                <th>Customer / Business</th>
                <th>LAN</th>
                <th>Partner ID</th>
                <th>Mobile</th>
                <th>Requested</th>
                <th>Loan Amount</th>
                <th>Status</th>
                <th>Stage</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="nyc-empty">
                    Loading Niyara records...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="nyc-empty">
                    {view === "pending"
                      ? "No pending Internal Credit loans. See Niyara All Loans for history."
                      : "No Niyara records found."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id || row.lan}>
                    <td>
                      <div className="nyc-name">{row.customer_name || "—"}</div>
                      <div className="nyc-small">
                        {row.business_name || "—"}
                      </div>
                    </td>
                    <td>
                      <span className="nyc-lan">{row.lan}</span>
                    </td>
                    <td>{row.partner_loan_id || "—"}</td>
                    <td>{row.mobile_number || "—"}</td>
                    <td className="nyc-amount">
                      {money(row.requested_amount)}
                    </td>
                    <td className="nyc-amount">{money(row.loan_amount)}</td>
                    <td>
                      <span className="nyc-status">{row.status || "—"}</span>
                    </td>
                    <td className="nyc-stage">{row.stage || "—"}</td>
                    <td>{formatDate(row.updated_at || row.created_at)}</td>
                    <td>
                      <div className="nyc-row-actions">
                        <button
                          className="nyc-btn"
                          type="button"
                          onClick={() => setSelected(row)}
                          title="View list details"
                        >
                          <Eye size={15} />
                        </button>
                        {view === "pending" && isCreditEligible(row) && (
                          <>
                            <button
                              className="nyc-btn nyc-approve"
                              disabled={!!busyLan}
                              onClick={() => handleDecision(row, "approve")}
                              title="Approve"
                            >
                              <CheckCircle2 size={15} />
                            </button>
                            <button
                              className="nyc-btn nyc-reject"
                              disabled={!!busyLan}
                              onClick={() => handleDecision(row, "reject")}
                              title="Reject"
                            >
                              <XCircle size={15} />
                            </button>
                          </>
                        )}
                        {view === "all" && (
                          <span className="nyc-small">View only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="nyc-footer">
          <span>
            Showing {first}–{last} of {total} records
          </span>
          <div className="nyc-pager">
            <button
              className="nyc-btn"
              disabled={page <= 1 || loading}
              onClick={() => setPage((n) => n - 1)}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              className="nyc-btn"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((n) => n + 1)}
            >
              Next <ChevronRight size={14} />
            </button>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {selected && (
        <div className="nyc-overlay" onClick={() => setSelected(null)}>
          <div
            className="nyc-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Loan summary"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="nyc-modal-top">
              <h2 style={{ margin: 0, fontSize: 18 }}>Niyara Loan Summary</h2>
              <button
                className="nyc-btn"
                onClick={() => setSelected(null)}
                aria-label="Close summary"
              >
                <X size={16} />
              </button>
            </div>
            {[
              ["LAN", selected.lan],
              ["Customer", selected.customer_name],
              ["Business", selected.business_name],
              ["Partner Loan ID", selected.partner_loan_id],
              ["Mobile", selected.mobile_number],
              ["Requested Amount", money(selected.requested_amount)],
              ["Sanctioned Amount", money(selected.loan_amount)],
              ["Status", selected.status],
              ["Stage", selected.stage],
              ["Updated", formatDate(selected.updated_at)],
            ].map(([label, value]) => (
              <div className="nyc-detail" key={label}>
                <span>{label}</span>
                <strong>{value || "—"}</strong>
              </div>
            ))}
            <p className="nyc-small">
              Shows fields supplied by Niyara list API. Documents require a
              separate endpoint.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
