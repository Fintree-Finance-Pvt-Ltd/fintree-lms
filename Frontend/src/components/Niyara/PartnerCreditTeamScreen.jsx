import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import api from "../../api/api";

// Existing Niyara routes only. Never put a partner x-api-key in React.
const API = {
  loans: "/niyara/partner-credit-loans",
  decision: (lan) =>
    `/niyara/${encodeURIComponent(lan)}/partner-credit-decision`,
};

// Component-scoped class names. No separate CSS file required.
const styles = `
  .npc-page{min-height:100%;padding:26px;background:#f3f6fb;color:#162e4d;font-family:inherit}
  .npc-head{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:15px;margin-bottom:20px}
  .npc-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:1.25px;font-weight:850;color:#4b719a}
  .npc-title{font-size:27px;line-height:1.2;color:#122d53;letter-spacing:-.035em;font-weight:850;margin:6px 0}
  .npc-subtitle{font-size:13px;color:#657a95;line-height:1.6}
  .npc-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #d9e3f0;background:#fff;color:#244a72;border-radius:9px;padding:10px 13px;font:inherit;font-size:12px;font-weight:750;cursor:pointer;white-space:nowrap;transition:background .15s}
  .npc-btn:hover:not(:disabled){background:#eff5fc}
  .npc-btn:disabled{opacity:.5;cursor:not-allowed}
  .npc-btn-primary{background:#173f77;border-color:#173f77;color:white}
  .npc-btn-primary:hover:not(:disabled){background:#235895}
  .npc-btn-approve{background:#e9f8ef;border-color:#bce7ce;color:#126a42}
  .npc-btn-approve:hover:not(:disabled){background:#d9f4e4}
  .npc-btn-reject{background:#fff0f0;border-color:#f1c6c8;color:#a92631}
  .npc-btn-reject:hover:not(:disabled){background:#ffe5e7}
  .npc-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}
  .npc-stat{background:white;border:1px solid #e2eaf4;border-radius:12px;padding:15px 17px;box-shadow:0 4px 17px #0b2c5108}
  .npc-stat-label{color:#8191a7;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.55px}
  .npc-stat-number{font-size:23px;font-weight:850;color:#153c70;margin-top:4px}
  .npc-stat-value{font-size:14px;font-weight:800;color:#193f6c;margin-top:7px;line-height:1.3}
  .npc-card{background:white;border:1px solid #e1eaf5;border-radius:17px;padding:18px;box-shadow:0 7px 28px #0d31520a}
  .npc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
  .npc-toolbar-label{display:flex;align-items:center;gap:8px;color:#2b517a;font-size:13px;font-weight:800}
  .npc-search{display:flex;align-items:center;gap:9px;border:1px solid #dae4ef;border-radius:10px;background:#f8fafd;padding:0 11px;min-height:40px;width:min(345px,100%)}
  .npc-search input{font:inherit;font-size:13px;background:transparent;border:0;outline:0;color:#173a66;width:100%;min-width:0}
  .npc-message{padding:12px 14px;margin-bottom:13px;border-radius:9px;font-size:13px;line-height:1.5}
  .npc-message-error{background:#fff1f1;border:1px solid #f6c6c7;color:#a52734}
  .npc-message-ok{background:#eaf8ef;border:1px solid #bce7cb;color:#166a43}
  .npc-message-warn{background:#fff8e6;border:1px solid #f4e1a3;color:#825b17}
  .npc-scroll{overflow-x:auto;border:1px solid #e6edf5;border-radius:12px}
  .npc-table{width:100%;border-collapse:collapse;min-width:1000px}
  .npc-table th{text-align:left;background:#f7f9fd;color:#637d99;padding:13px 11px;text-transform:uppercase;letter-spacing:.55px;font-size:10px;font-weight:850;white-space:nowrap}
  .npc-table td{padding:14px 11px;border-top:1px solid #edf1f6;font-size:12px;color:#26425f;vertical-align:middle}
  .npc-table tbody tr:hover{background:#fcfdff}
  .npc-name{color:#164675;font-size:13px;font-weight:850}
  .npc-muted{font-size:11px;color:#7d8fa3;margin-top:4px}
  .npc-lan{display:inline-flex;padding:6px 9px;background:#edf4fc;border-radius:7px;color:#195081;font-weight:800;white-space:nowrap}
  .npc-tag{display:inline-flex;align-items:center;border-radius:7px;padding:5px 8px;font-size:11px;font-weight:800;background:#eaf8ef;color:#167446;white-space:nowrap}
  .npc-tag-muted{background:#f0f3f8;color:#72849a}
  .npc-amount{white-space:nowrap;font-weight:800}
  .npc-empty{padding:45px 14px!important;text-align:center!important;color:#7b8ba1!important}
  .npc-actions{display:flex;align-items:center;gap:7px}
  .npc-footer{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-top:17px;font-size:12px;color:#71859c}
  .npc-pagination{display:flex;align-items:center;gap:8px}
  .npc-pagination select{background:white;border:1px solid #d9e3ee;border-radius:8px;padding:8px;color:#34516d}
  .npc-overlay{position:fixed;inset:0;z-index:2000;background:#071c379e;padding:16px;display:flex;justify-content:center;align-items:center}
  .npc-modal{background:#fff;width:min(760px,100%);max-height:92vh;overflow-y:auto;border-radius:18px;padding:23px;box-shadow:0 25px 75px #07152b66}
  .npc-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:17px}
  .npc-modal-head h2{margin:5px 0 0;color:#132f54;font-size:21px}
  .npc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .npc-item{background:#f8fafc;border:1px solid #edf2f8;border-radius:10px;padding:11px;min-width:0}
  .npc-item span{display:block;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.4px;color:#8190a6;margin-bottom:7px}
  .npc-item strong{font-size:13px;color:#1c3b60;word-break:break-word;white-space:pre-wrap}
  .npc-section-title{margin:20px 0 12px;font-size:13px;color:#244d78;font-weight:850}
  .npc-reason{display:block;width:100%;box-sizing:border-box;min-height:90px;resize:vertical;border:1px solid #d7e2ed;border-radius:10px;padding:12px;font:inherit;font-size:13px;color:#17345b}
  .npc-modal-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:9px;margin-top:17px}
  .npc-footnote{font-size:11px;line-height:1.5;color:#7889a1;margin-top:13px}
  @media(max-width:800px){.npc-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.npc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:560px){.npc-page{padding:12px}.npc-title{font-size:22px}.npc-card{padding:12px}.npc-search{width:100%}.npc-stats{grid-template-columns:1fr}.npc-grid{grid-template-columns:1fr}.npc-modal{padding:16px}}
`;

const money = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(amount)
    : "—";
};

const date = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
};

const show = (value) =>
  value === null || value === undefined || String(value).trim() === ""
    ? "—"
    : String(value);

const hasUatMock = (row) =>
  /UAT[ _-]*MOCK/i.test(
    `${row?.niyara_bre_reason || ""} ${row?.aml_reason || ""}`,
  );

// Display gate only. The PATCH endpoint must enforce its own eligibility.
const eligible = (row) =>
  String(row?.status || "").toLowerCase() === "bre_approved" &&
  String(row?.stage || "").toLowerCase() === "partner_credit_pending" &&
  !row?.partner_credit_decision &&
  (row?.niyara_bre_status == null ||
    String(row.niyara_bre_status).toUpperCase() === "APPROVED") &&
  (row?.aml_status == null ||
    String(row.aml_status).toUpperCase() === "PROCEED");

const Detail = ({ label, value }) => (
  <div className="npc-item">
    <span>{label}</span>
    <strong>{show(value)}</strong>
  </div>
);

export default function PartnerCreditTeamScreen() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState("");
  const [busyLan, setBusyLan] = useState("");
  const submitting = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadLoans() {
      setLoading(true);
      setError("");

      try {
        const response = await api.get(API.loans, {
          params: { page, pageSize, search, sortBy: "id", sortDir: "desc" },
          signal: controller.signal,
          timeout: 20000,
        });

        const payload = response.data || {};
        if (payload.success === false || !Array.isArray(payload.rows)) {
          throw new Error(
            payload.message || "Unexpected partner credit response",
          );
        }

        if (controller.signal.aborted) return;
        const count = Number(payload.pagination?.total ?? payload.rows.length);
        const safeTotal = Number.isFinite(count) ? count : payload.rows.length;

        setRows(payload.rows);
        setTotal(safeTotal);

        if (page > 1 && (page - 1) * pageSize >= safeTotal) {
          setPage(Math.max(1, Math.ceil(safeTotal / pageSize)));
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const status = err?.response?.status;
        setError(
          status === 401
            ? "Session expired. Please log in again."
            : status === 403
              ? "Access denied. Niyara Partner Credit permission is required."
              : !err?.response
                ? "Unable to reach the Niyara API. Check backend connectivity or CORS."
                : err?.response?.data?.message ||
                  err.message ||
                  "Unable to fetch cases.",
        );
        setRows([]);
        setTotal(0);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadLoans();
    return () => controller.abort();
  }, [page, pageSize, search, reload]);

  const review = (row) => {
    setSelected(row);
    setReason("");
    setError("");
  };

  const decide = async (decision) => {
    if (!selected || !eligible(selected) || submitting.current) return;
    const lan = String(selected.lan || "").toUpperCase();
    if (!/^NYRA\d+$/.test(lan)) {
      setError("Invalid LAN.");
      return;
    }
    const finalReason = reason.trim();
    if (finalReason.length > 1000 || (decision === "reject" && !finalReason)) {
      setError("Rejection requires a reason of 1–1000 characters.");
      return;
    }

    if (
      !window.confirm(
        `${decision === "approve" ? "Approve" : "Reject"} ${lan}?`,
      )
    ) {
      return;
    }

    submitting.current = true;
    setBusyLan(lan);
    setError("");
    setNotice("");
    try {
      const response = await api.patch(API.decision(lan), {
        decision,
        ...(finalReason ? { reason: finalReason } : {}),
      });
      if (response.data?.success !== true) {
        throw new Error(response.data?.message || "Decision failed");
      }

      setNotice(
        decision === "approve"
          ? `${lan} approved. Case moved to FFPL Credit Team.`
          : `${lan} rejected by Niyara Partner Credit Team.`,
      );
      setSelected(null);
      setReason("");
      setReload((n) => n + 1);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err.message ||
          "Could not save decision.",
      );
    } finally {
      submitting.current = false;
      setBusyLan("");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);
  const mockCount = rows.filter(hasUatMock).length;

  return (
    <main className="npc-page">
      <style>{styles}</style>

      <header className="npc-head">
        <div>
          <div className="npc-eyebrow">Niyara · Unsecured Business Loan</div>
          <h1 className="npc-title">Partner Credit Review</h1>
          <div className="npc-subtitle">
            Cases cleared by BRE and AML, awaiting Niyara's credit decision.
          </div>
        </div>
        <button
          type="button"
          className="npc-btn"
          onClick={() => setReload((n) => n + 1)}
          disabled={loading || !!busyLan}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      <div className="npc-stats">
        <div className="npc-stat">
          <div className="npc-stat-label">Pending Partner Review</div>
          <div className="npc-stat-number">{loading ? "—" : total}</div>
        </div>
        <div className="npc-stat">
          <div className="npc-stat-label">Current Page</div>
          <div className="npc-stat-value">
            {page} / {totalPages}
          </div>
        </div>
        <div className="npc-stat">
          <div className="npc-stat-label">Next Stage</div>
          <div className="npc-stat-value">FFPL Internal Credit</div>
        </div>
      </div>

      <section className="npc-card">
        <div className="npc-toolbar">
          <div className="npc-toolbar-label">
            <ShieldCheck size={17} /> BRE Approved · AML Proceed
          </div>
          <label className="npc-search">
            <Search size={16} color="#7990a8" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search LAN, customer, business..."
              aria-label="Search Partner Credit cases"
            />
          </label>
        </div>

        {error && (
          <div role="alert" className="npc-message npc-message-error">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="npc-message npc-message-ok">
            {notice}
          </div>
        )}
        {!loading && mockCount > 0 && (
          <div className="npc-message npc-message-warn">
            <AlertTriangle
              size={15}
              style={{ verticalAlign: "middle", marginRight: 7 }}
            />
            {mockCount} case(s) on this page are marked UAT MOCK. Mock BRE/AML
            data are not genuine provider checks.
          </div>
        )}

        <div className="npc-scroll">
          <table className="npc-table">
            <thead>
              <tr>
                <th>Customer / Business</th>
                <th>LAN</th>
                <th>Partner Loan ID</th>
                <th>Requested Amount</th>
                <th>CIBIL</th>
                <th>BRE</th>
                <th>AML</th>
                <th>Login Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="npc-empty">
                    Loading Niyara cases...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="npc-empty">
                    No cases pending Partner Credit review.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id ?? row.lan}>
                    <td>
                      <div className="npc-name">{show(row.customer_name)}</div>
                      <div className="npc-muted">{show(row.business_name)}</div>
                    </td>
                    <td>
                      <span className="npc-lan">{row.lan}</span>
                    </td>
                    <td>{show(row.partner_loan_id)}</td>
                    <td className="npc-amount">
                      {money(row.requested_amount)}
                    </td>
                    <td>{show(row.cibil_score)}</td>
                    <td>
                      <span
                        className={
                          row.niyara_bre_status
                            ? "npc-tag"
                            : "npc-tag npc-tag-muted"
                        }
                      >
                        {show(row.niyara_bre_status)}
                      </span>
                      {hasUatMock(row) && (
                        <div className="npc-muted">UAT MOCK</div>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          row.aml_status ? "npc-tag" : "npc-tag npc-tag-muted"
                        }
                      >
                        {show(row.aml_status)}
                      </span>
                    </td>
                    <td>{date(row.login_date)}</td>
                    <td>
                      <button
                        type="button"
                        className="npc-btn npc-btn-primary"
                        onClick={() => review(row)}
                      >
                        <Eye size={15} /> Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="npc-footer">
          <span>
            Showing {start}–{end} of {total}
          </span>
          <div className="npc-pagination">
            <button
              type="button"
              className="npc-btn"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={15} /> Prev
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              className="npc-btn"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight size={15} />
            </button>
            <select
              aria-label="Page size"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>
        </footer>
      </section>

      {selected && (
        <div
          className="npc-overlay"
          onClick={() => !busyLan && setSelected(null)}
        >
          <div
            className="npc-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Niyara Partner Credit review"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="npc-modal-head">
              <div>
                <div className="npc-eyebrow">
                  Partner Credit · {selected.lan}
                </div>
                <h2>{show(selected.customer_name)}</h2>
              </div>
              <button
                type="button"
                className="npc-btn"
                disabled={!!busyLan}
                aria-label="Close review"
                onClick={() => setSelected(null)}
              >
                <X size={17} />
              </button>
            </div>

            <div className="npc-section-title">Applicant & Business</div>
            <div className="npc-grid">
              <Detail label="LAN" value={selected.lan} />
              <Detail
                label="Partner Loan ID"
                value={selected.partner_loan_id}
              />
              <Detail label="Business Name" value={selected.business_name} />
              <Detail label="Business Type" value={selected.business_type} />
              <Detail
                label="Requested Amount"
                value={money(selected.requested_amount)}
              />
              <Detail
                label="Annual Income"
                value={money(selected.annual_income)}
              />
            </div>

            <div className="npc-section-title">Bureau · BRE · AML</div>
            <div className="npc-grid">
              <Detail label="CIBIL Score" value={selected.cibil_score} />
              <Detail label="BRE Status" value={selected.niyara_bre_status} />
              <Detail label="BRE Reason" value={selected.niyara_bre_reason} />
              <Detail label="AML Status" value={selected.aml_status} />
              <Detail label="AML Matches" value={selected.aml_total_matches} />
              <Detail label="AML Reason" value={selected.aml_reason} />
            </div>

            {hasUatMock(selected) && (
              <div
                className="npc-message npc-message-warn"
                style={{ marginTop: 16, marginBottom: 0 }}
              >
                UAT MOCK: Bureau/AML results here are simulated, not verified
                provider results. Never rely on these for production approval.
              </div>
            )}

            <label
              className="npc-section-title"
              htmlFor="npc-reason"
              style={{ display: "block" }}
            >
              Decision reason (required for rejection)
            </label>
            <textarea
              id="npc-reason"
              className="npc-reason"
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter decision remark or rejection reason..."
              disabled={!!busyLan}
            />

            <div className="npc-modal-actions">
              <button
                type="button"
                className="npc-btn"
                disabled={!!busyLan}
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="npc-btn npc-btn-reject"
                disabled={!!busyLan || !eligible(selected) || !reason.trim()}
                onClick={() => decide("reject")}
              >
                <XCircle size={16} /> Reject
              </button>
              <button
                type="button"
                className="npc-btn npc-btn-approve"
                disabled={!!busyLan || !eligible(selected)}
                onClick={() => decide("approve")}
              >
                <CheckCircle2 size={16} />{" "}
                {busyLan ? "Saving..." : "Approve → FFPL Credit"}
              </button>
            </div>
            <div className="npc-footnote">
              Only cases with approved BRE and AML clearance are eligible.
              Backend is authoritative; repeat decisions receive 409 Conflict.
              Decision changes the stage, it does not disburse a loan.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
