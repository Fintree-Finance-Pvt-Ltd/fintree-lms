import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import "../../styles/ClaimCureBuddyApprovedCases.css";
import { useNavigate } from "react-router-dom";

const APPROVED_CASES_API = "/claim-cure-buddy/approved-cases";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

const toLocalYmd = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const addMonths = (value, months) => {
  const source = value ? new Date(`${value}T12:00:00`) : new Date();
  if (Number.isNaN(source.getTime())) return "";
  const originalDay = source.getDate();
  source.setDate(1);
  source.setMonth(source.getMonth() + Number(months || 0));
  const lastDay = new Date(
    source.getFullYear(),
    source.getMonth() + 1,
    0,
  ).getDate();
  source.setDate(Math.min(originalDay, lastDay));
  return toLocalYmd(source);
};

const getError = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const StatusPill = ({ value, type = "neutral" }) => (
  <span className={`ccb-ops-pill ccb-ops-pill-${type}`}>
    <span />
    {value}
  </span>
);

const enachPresentation = (rawStatus) => {
  const status = String(rawStatus || "NOT_STARTED").toUpperCase();
  const map = {
    NOT_STARTED: { label: "Not Started", type: "pending" },
    CREATED: { label: "Creating", type: "progress" },
    LINK_CREATE_PENDING: { label: "Creating Link", type: "progress" },
    LINK_CREATED: { label: "Link Created", type: "ready" },
    ACTIVE: { label: "Active", type: "success" },
    FAILED: { label: "Failed", type: "danger" },
    CANCELLED: { label: "Cancelled", type: "danger" },
    EXPIRED: { label: "Expired", type: "danger" },
    UNKNOWN: { label: "Check Required", type: "warning" },
  };
  return { status, ...(map[status] || map.NOT_STARTED) };
};

const agreementPresentation = (rawStatus) => {
  const status = String(rawStatus || "PENDING").toUpperCase();
  const map = {
    PENDING: { label: "Pending", type: "pending" },
    INITIATED: { label: "Sent for Signing", type: "progress" },
    SIGNED: { label: "Signed", type: "success" },
    FAILED: { label: "Failed", type: "danger" },
  };
  return { status, ...(map[status] || map.PENDING) };
};

export default function ClaimCureBuddyApprovedCases() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const [action, setAction] = useState({ lan: null, type: null });
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [enachForm, setEnachForm] = useState({
    accountType: "SAVINGS",
    authMode: "NetBanking",
    maxDebitAmount: "",
    finalCollectionDate: "",
    expiryDate: "",
    frequency: "AS_PRESENTED",
    amountRule: "MAX",
  });

  const showToast = (type, message) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4500);
  };

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get(APPROVED_CASES_API);
      const payload = response.data?.data ?? response.data;
      setRows(Array.isArray(payload) ? payload : []);
    } catch (requestError) {
      setError(getError(requestError, "Unable to fetch approved cases."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [
        row.customer_name,
        row.lan,
        row.partner_loan_id,
        row.mobile_number,
        row.pan_card,
        row.enach_status,
        row.agreement_esign_status,
      ].some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [rows, search]);

  const summary = useMemo(
    () => ({
      approved: rows.length,
      enachReady: rows.filter((row) =>
        ["LINK_CREATED", "ACTIVE"].includes(
          String(row.enach_status || "").toUpperCase(),
        ),
      ).length,
      signed: rows.filter(
        (row) =>
          String(row.agreement_esign_status || "").toUpperCase() === "SIGNED",
      ).length,
    }),
    [rows],
  );

  const openEnachModal = (row) => {
    const enach = enachPresentation(row.enach_status);
    const existingUrl = row.enach_short_url || row.enach_payment_url;

    if (enach.status === "LINK_CREATED" && existingUrl) {
      window.open(existingUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const baseDate = toLocalYmd(row.approved_at || new Date());
    const tenure = Math.max(1, Number(row.loan_tenure || 12));

    setSelectedLoan(row);
    setEnachForm({
      accountType: "SAVINGS",
      authMode: "NetBanking",
      maxDebitAmount: String(row.loan_amount || ""),
      finalCollectionDate: addMonths(baseDate, tenure),
      expiryDate: "",
      frequency: "MONTHLY",
      amountRule: "MAX",
    });
  };

  const closeEnachModal = () => {
    if (action.type === "ENACH") return;
    setSelectedLoan(null);
  };

  const createEnach = async (event) => {
    event.preventDefault();
    if (!selectedLoan) return;

    if (!enachForm.maxDebitAmount || Number(enachForm.maxDebitAmount) <= 0) {
      showToast("error", "Enter a valid maximum debit amount.");
      return;
    }

    if (!enachForm.finalCollectionDate) {
      showToast("error", "Select the final collection date.");
      return;
    }

    const lan = selectedLoan.lan;
    let authorizationWindow = null;

    try {
      authorizationWindow = window.open("about:blank", "_blank");
      if (authorizationWindow) {
        authorizationWindow.opener = null;
        authorizationWindow.document.title = "Creating Easebuzz eNACH link";
        authorizationWindow.document.body.innerHTML =
          "<p style='font-family:Arial;padding:24px'>Creating your secure Easebuzz authorization link…</p>";
      }

      setAction({ lan, type: "ENACH" });
      const response = await api.post(
        `/claim-cure-buddy/loan-booking/${lan}/enach`,
        enachForm,
      );
      const result = response.data?.data || {};
      const authorizationUrl = result.shortUrl || result.paymentUrl;

      setRows((current) =>
        current.map((row) =>
          row.lan === lan
            ? {
                ...row,
                enach_status: result.status || "LINK_CREATED",
                enach_transaction_id: result.merchantTxn,
                enach_payment_url: result.paymentUrl,
                enach_short_url: result.shortUrl,
              }
            : row,
        ),
      );

      setSelectedLoan(null);
      showToast("success", "Easebuzz eNACH link created successfully.");

      if (authorizationUrl && authorizationWindow) {
        authorizationWindow.location.replace(authorizationUrl);
      } else if (authorizationUrl) {
        window.open(authorizationUrl, "_blank", "noopener,noreferrer");
      } else if (authorizationWindow) {
        authorizationWindow.close();
      }
    } catch (requestError) {
      if (authorizationWindow) authorizationWindow.close();
      showToast(
        "error",
        getError(requestError, "Unable to create the Easebuzz eNACH link."),
      );
    } finally {
      setAction({ lan: null, type: null });
    }
  };

  const startAgreementSigning = async (row) => {
    const agreement = agreementPresentation(row.agreement_esign_status);

    if (agreement.status === "SIGNED") {
      showToast("info", "This agreement is already signed.");
      return;
    }

    if (agreement.status === "INITIATED") {
      showToast("info", "Agreement signing is already in progress.");
      return;
    }

    if (!window.confirm(`Send ClaimCureBuddy agreement for ${row.lan}?`)) {
      return;
    }

    try {
      setAction({ lan: row.lan, type: "AGREEMENT" });
      const response = await api.post(`/esign/${row.lan}/esign/agreement`);
      const signingUrl =
        response.data?.signingUrl ||
        response.data?.url ||
        response.data?.data?.signingUrl ||
        null;

      setRows((current) =>
        current.map((item) =>
          item.lan === row.lan
            ? {
                ...item,
                agreement_esign_status: "INITIATED",
                agreement_esign_sent_at: new Date().toISOString(),
              }
            : item,
        ),
      );

      showToast(
        "success",
        response.data?.message || "Agreement sent for signing successfully.",
      );

      if (signingUrl) {
        window.open(signingUrl, "_blank", "noopener,noreferrer");
      }
    } catch (requestError) {
      showToast(
        "error",
        getError(requestError, "Unable to start agreement signing."),
      );
    } finally {
      setAction({ lan: null, type: null });
    }
  };

  const renderEnachAction = (row) => {
    const present = enachPresentation(row.enach_status);
    const processing = action.lan === row.lan && action.type === "ENACH";
    const waiting = ["CREATED", "LINK_CREATE_PENDING", "UNKNOWN"].includes(
      present.status,
    );
    const active = present.status === "ACTIVE";
    const hasLink =
      present.status === "LINK_CREATED" &&
      Boolean(row.enach_short_url || row.enach_payment_url);

    let label = "Start eNACH";
    if (processing) label = "Creating…";
    else if (hasLink) label = "Open eNACH Link";
    else if (active) label = "eNACH Active";
    else if (waiting) label = "Processing";
    else if (["FAILED", "CANCELLED", "EXPIRED"].includes(present.status)) {
      label = "Retry eNACH";
    }

    return (
      <div className="ccb-ops-action-cell">
        <StatusPill value={present.label} type={present.type} />
        <button
          type="button"
          className="ccb-ops-button ccb-ops-button-enach"
          disabled={processing || waiting || active}
          onClick={() => openEnachModal(row)}
        >
          {label}
        </button>
      </div>
    );
  };

  const renderAgreementAction = (row) => {
    const present = agreementPresentation(row.agreement_esign_status);
    const processing = action.lan === row.lan && action.type === "AGREEMENT";
    const disabled =
      processing || present.status === "SIGNED" || present.status === "INITIATED";

    return (
      <div className="ccb-ops-action-cell">
        <StatusPill value={present.label} type={present.type} />
        <button
          type="button"
          className="ccb-ops-button ccb-ops-button-sign"
          disabled={disabled}
          onClick={() => startAgreementSigning(row)}
        >
          {processing
            ? "Sending…"
            : present.status === "SIGNED"
              ? "Agreement Signed"
              : present.status === "INITIATED"
                ? "Awaiting Signature"
                : present.status === "FAILED"
                  ? "Retry Agreement"
                  : "Send Agreement"}
        </button>
      </div>
    );
  };

  return (
    <div className="ccb-ops-page">
      <header className="ccb-ops-header">
        <div>
          <span className="ccb-ops-eyebrow">ClaimCureBuddy Operations</span>
          <h1>BRE Approved Cases</h1>
          <p>Create the Easebuzz eNACH authorization and send the loan agreement for signing.</p>
        </div>
        <button className="ccb-ops-refresh" onClick={fetchCases} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {toast && <div className={`ccb-ops-toast ccb-ops-toast-${toast.type}`}>{toast.message}</div>}
      {error && <div className="ccb-ops-error">{error}</div>}

      <section className="ccb-ops-summary">
        <article><span>Total BRE Approved</span><strong>{summary.approved}</strong></article>
        <article><span>eNACH Ready / Active</span><strong>{summary.enachReady}</strong></article>
        <article><span>Agreements Signed</span><strong>{summary.signed}</strong></article>
      </section>

      <section className="ccb-ops-panel">
        <div className="ccb-ops-toolbar">
          <div>
            <h2>Approved Applications</h2>
            <span>{filteredRows.length} case{filteredRows.length === 1 ? "" : "s"}</span>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, LAN, PAN or mobile"
          />
        </div>

        <div className="ccb-ops-table-wrap">
          <table className="ccb-ops-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Loan</th>
                <th>BRE</th>
                <th>Bank</th>
                <th>eNACH</th>
                <th>Agreement Signing</th>
                <th>Approved</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="ccb-ops-empty">Loading approved cases…</td></tr>
              ) : !filteredRows.length ? (
                <tr><td colSpan="7" className="ccb-ops-empty">No BRE-approved ClaimCureBuddy cases found.</td></tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.lan}>
                    <td>
                      <div className="ccb-ops-customer">
                        <strong>{row.customer_name || "Name unavailable"}</strong>
                        <span>{row.mobile_number || "—"}</span>
                        <small>{row.pan_card || "PAN unavailable"}</small>
                      </div>
                    </td>
                    <td>
                      <div className="ccb-ops-loan">
                        <strong>{row.lan}</strong>
                        <span>{row.partner_loan_id || "—"}</span>
                        <small>{money(row.loan_amount)} · {row.loan_tenure || "—"} months</small>
                      </div>
                    </td>
                    <td><StatusPill value="Approved" type="success" /></td>
                    <td>
                      <div className="ccb-ops-bank">
                        <strong>{row.customer_bank_name || "—"}</strong>
                        <span>{row.bank_ifsc_code || "—"}</span>
                        <small>•••• {String(row.customer_account_number || "").slice(-4) || "—"}</small>
                      </div>
                    </td>
                    <td>{renderEnachAction(row)}</td>
                    <td>{renderAgreementAction(row)}</td>
                    <td>{formatDate(row.approved_at || row.updated_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedLoan && (
        <div className="ccb-ops-modal-backdrop" role="presentation" onMouseDown={closeEnachModal}>
          <div className="ccb-ops-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="ccb-ops-modal-heading">
              <div><span>Easebuzz eNACH</span><h2>{selectedLoan.lan}</h2></div>
              <button type="button" onClick={closeEnachModal} aria-label="Close">×</button>
            </div>

            <div className="ccb-ops-bank-preview">
              <div><span>Account holder</span><strong>{selectedLoan.customer_name_as_per_bank}</strong></div>
              <div><span>Bank</span><strong>{selectedLoan.customer_bank_name || "—"}</strong></div>
              <div><span>Account</span><strong>•••• {String(selectedLoan.customer_account_number || "").slice(-4)}</strong></div>
              <div><span>IFSC</span><strong>{selectedLoan.bank_ifsc_code}</strong></div>
            </div>

            <form onSubmit={createEnach} className="ccb-ops-form">
              <label>
                <span>Account Type</span>
                <select value={enachForm.accountType} onChange={(event) => setEnachForm((old) => ({ ...old, accountType: event.target.value }))}>
                  <option value="SAVINGS">Savings</option>
                  <option value="CURRENT">Current</option>
                </select>
              </label>

              <label>
                <span>Authentication Mode</span>
                <select value={enachForm.authMode} onChange={(event) => setEnachForm((old) => ({ ...old, authMode: event.target.value }))}>
                  <option value="NetBanking">Net Banking</option>
                  <option value="DebitCard">Debit Card</option>
                </select>
              </label>

              <label>
                <span>Maximum Debit Amount</span>
                <input type="number" min="1" step="0.01" value={enachForm.maxDebitAmount} onChange={(event) => setEnachForm((old) => ({ ...old, maxDebitAmount: event.target.value }))} required />
              </label>

              <label>
                <span>Frequency</span>
                <select value={enachForm.frequency} onChange={(event) => setEnachForm((old) => ({ ...old, frequency: event.target.value }))}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="HALFYEARLY">Half-Yearly</option>
                  <option value="YEARLY">Yearly</option>
                  <option value="AS_PRESENTED">As Presented</option>
                </select>
              </label>

              <label>
                <span>Final Collection Date</span>
                <input type="date" min={toLocalYmd()} value={enachForm.finalCollectionDate} onChange={(event) => setEnachForm((old) => ({ ...old, finalCollectionDate: event.target.value }))} required />
              </label>

              <label>
                <span>Link Expiry Date (optional)</span>
                <input type="date" min={toLocalYmd()} max={enachForm.finalCollectionDate || undefined} value={enachForm.expiryDate} onChange={(event) => setEnachForm((old) => ({ ...old, expiryDate: event.target.value }))} />
              </label>

              <div className="ccb-ops-note">
                Easebuzz collects a ₹1 authorization amount. The maximum debit amount above controls the mandate cap.
              </div>

              <div className="ccb-ops-modal-actions">
                <button type="button" className="ccb-ops-cancel" onClick={closeEnachModal} disabled={action.type === "ENACH"}>Cancel</button>
                <button type="submit" className="ccb-ops-submit" disabled={action.type === "ENACH"}>
                  {action.type === "ENACH" ? "Creating Secure Link…" : "Create & Open eNACH Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}