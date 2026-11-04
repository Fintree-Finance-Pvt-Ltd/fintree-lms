import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  ClipboardCopy,
  CreditCard,
  Download,
  ExternalLink,
  FileCheck2,
  FileSignature,
  Info,
  LoaderCircle,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import api from "../../api/api";
import "../../styles/EsignEnachScreen.css";

const LIST_URL = "/niyara/esign-enach-loans";
const PAGE_SIZE = 10;
const getText = (value) => String(value ?? "").trim();
const upper = (value) => getText(value).toUpperCase();
const getError = (error) =>
  error?.response?.data?.message ||
  error?.response?.data?.error?.message ||
  error?.message ||
  "Request failed";
const money = (value) =>
  value === null || value === undefined || value === ""
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(Number(value));
const dateToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
const maskAccount = (value) => {
  const str = getText(value);
  return str ? `•••• ${str.slice(-4)}` : "Not provided";
};
const validLink = (value) => {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    ) {
      return url.toString();
    }
  } catch {
    // Provider did not return a valid URL.
  }
  return null;
};
const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const isSigned = (status) => upper(status) === "SIGNED";
const isReady = (row) =>
  isSigned(row.sanction_esign_status) &&
  isSigned(row.agreement_esign_status) &&
  upper(row.bank_status) === "MANDATE_CREATED";
const isSignStarted = (status) =>
  ["SIGNED", "INITIATED", "IN_PROGRESS", "REQUESTED"].includes(upper(status));

function StatusPill({ value, kind = "default" }) {
  const status = upper(value) || "NOT INITIATED";
  let tone = "neutral";
  if (
    ["SIGNED", "MANDATE_CREATED", "REGISTERED", "ACTIVE", "SUCCESS"].includes(
      status,
    )
  ) {
    tone = "success";
  } else if (
    [
      "INITIATED",
      "IN_PROGRESS",
      "REQUESTED",
      "MANDATE_INITIATED",
      "LINK_CREATED",
    ].includes(status)
  ) {
    tone = "progress";
  } else if (
    ["REJECTED", "FAILED", "EXPIRED", "ERROR", "CANCELLED"].includes(status)
  ) {
    tone = "danger";
  }
  return (
    <span
      className={`nyse-pill nyse-pill--${tone} ${kind === "compact" ? "nyse-pill--compact" : ""}`}
      title={status}
    >
      <span className="nyse-pill-dot" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

function StatCard({ title, value, icon: Icon, tone }) {
  return (
    <div className="nyse-stat">
      <div>
        <p className="nyse-stat-label">{title}</p>
        <p className="nyse-stat-count">{value}</p>
      </div>
      <span className={`nyse-stat-icon nyse-stat-icon--${tone}`}>
        <Icon size={22} />
      </span>
    </div>
  );
}

export default function NiyaraEsignEnachScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [esign, setEsign] = useState(null);
  const [enach, setEnach] = useState(null);
  const [detailsError, setDetailsError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [links, setLinks] = useState({});
  const [mandate, setMandate] = useState({
    amount: "",
    start_date: dateToday(),
    end_date: "",
    frequency: "MONTHLY",
    account_type: "savings",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(LIST_URL);
      if (
        response.data?.success === false ||
        !Array.isArray(response.data?.rows)
      ) {
        throw new Error(response.data?.message || "Unexpected Niyara response");
      }
      setRows(response.data.rows);
    } catch (err) {
      setError(getError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [
        row.lan,
        row.customer_name,
        row.mobile_number,
        row.email,
        row.partner_loan_id,
      ].some((value) => getText(value).toLowerCase().includes(q)),
    );
  }, [rows, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const signedCount = rows.filter(
    (row) =>
      isSigned(row.sanction_esign_status) &&
      isSigned(row.agreement_esign_status),
  ).length;
  const mandatesCount = rows.filter(
    (row) => upper(row.bank_status) === "MANDATE_CREATED",
  ).length;
  const readyCount = rows.filter(isReady).length;

  const loadStatuses = useCallback(async (lan) => {
    setStatusLoading(true);
    setDetailsError("");
    try {
      const [signResponse, nachResponse] = await Promise.allSettled([
        api.get(`/niyara/${encodeURIComponent(lan)}/esign-status`),
        api.get(`/niyara/${encodeURIComponent(lan)}/enach-status`),
      ]);
      setEsign(
        signResponse.status === "fulfilled"
          ? (signResponse.value.data?.data ?? null)
          : null,
      );
      setEnach(
        nachResponse.status === "fulfilled"
          ? (nachResponse.value.data?.data ?? null)
          : null,
      );
      const issues = [
        signResponse.status === "rejected"
          ? `eSign: ${getError(signResponse.reason)}`
          : "",
        nachResponse.status === "rejected"
          ? `eNACH: ${getError(nachResponse.reason)}`
          : "",
      ].filter(Boolean);
      if (issues.length) setDetailsError(issues.join(" | "));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const review = (row) => {
    setSelected(row);
    setEsign(null);
    setEnach(null);
    setNotice("");
    setDetailsError("");
    setLinks({});
    setMandate({
      amount: getText(row.emi_amount),
      start_date: dateToday(),
      end_date: "",
      frequency: "MONTHLY",
      account_type: "savings",
    });
    loadStatuses(row.lan);
  };

  const refreshAll = async () => {
    await load();
    if (selected?.lan) await loadStatuses(selected.lan);
  };

  const triggerEsign = async (type) => {
    if (
      !selected ||
      !window.confirm(
        `Initiate ${type.toLowerCase()} eSign for ${selected.lan}?`,
      )
    )
      return;
    setBusy(type);
    setNotice("");
    try {
      const response = await api.post(
        `/niyara/${encodeURIComponent(selected.lan)}/esign/${type.toLowerCase()}`,
      );
      if (response.data?.success === false)
        throw new Error(response.data?.message || "eSign initiation failed");
      const payload = response.data?.data || response.data || {};
      const link = validLink(
        payload.sign_url ||
          payload.signingUrl ||
          payload.sign_url_short ||
          payload.url,
      );
      setLinks((previous) => ({ ...previous, [type]: link }));
      setNotice(
        `${type === "SANCTION" ? "Sanction letter" : "Agreement"} eSign initiated${link ? "; signing link is available below" : ""}. Check Doqfy delivery logs for customer SMS/email.`,
      );
      await refreshAll();
    } catch (err) {
      setNotice(`Error: ${getError(err)}`);
    } finally {
      setBusy("");
    }
  };

  const triggerEnach = async (event) => {
    event.preventDefault();
    if (!selected) return;
    if (
      !selected.mobile_number ||
      !selected.account_number ||
      !selected.ifsc ||
      !selected.name_in_bank
    ) {
      setNotice(
        "Error: Saved registered mobile or bank details are missing. Save final loan details first.",
      );
      return;
    }
    if (!mandate.end_date || mandate.end_date < mandate.start_date) {
      setNotice("Error: Please choose a valid final collection date.");
      return;
    }
    if (!(Number(mandate.amount) > 0)) {
      setNotice("Error: Maximum debit amount must be greater than zero.");
      return;
    }
    if (
      !window.confirm(
        `Create Digio mandate for ${selected.lan} with maximum debit of ${money(mandate.amount)}?`,
      )
    )
      return;
    setBusy("ENACH");
    setNotice("");
    try {
      const response = await api.post("/enach/create-mandate", {
        lan: selected.lan,
        customer_identifier: selected.mobile_number,
        amount: Number(mandate.amount),
        start_date: mandate.start_date,
        end_date: mandate.end_date,
        frequency: mandate.frequency,
        account_no: selected.account_number,
        ifsc: selected.ifsc,
        account_type: mandate.account_type,
        name_in_bank: selected.name_in_bank,
        bank_name: selected.bank_name,
      });
      if (response.data?.success === false)
        throw new Error(response.data?.message || "Mandate initiation failed");
      const payload = response.data?.data || response.data || {};
      const link = validLink(
        payload.authUrl ||
          payload.auth_url ||
          payload.shortUrl ||
          payload.paymentUrl,
      );
      setLinks((previous) => ({ ...previous, ENACH: link }));
      setNotice(
        `Digio mandate initiated${link ? "; authorization link available below" : ""}. Digio notification is requested; confirm actual delivery from provider logs.`,
      );
      await refreshAll();
    } catch (err) {
      setNotice(`Error: ${getError(err)}`);
    } finally {
      setBusy("");
    }
  };

  const copyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      setNotice(
        "Link copied. Share only through your approved secure customer channel.",
      );
    } catch {
      setNotice(
        "Error: Copy failed. Please open the link and use your approved sharing method.",
      );
    }
  };

  const exportCsv = () => {
    const columns = [
      "lan",
      "customer_name",
      "mobile_number",
      "email",
      "loan_amount",
      "sanction_esign_status",
      "agreement_esign_status",
      "bank_status",
    ];
    const csv = [
      columns.map(csvEscape).join(","),
      ...filtered.map((row) =>
        columns.map((key) => csvEscape(row[key])).join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "niyara_esign_enach.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const sanctionStatus =
    esign?.sanction?.status || selected?.sanction_esign_status;
  const agreementStatus =
    esign?.agreement?.status || selected?.agreement_esign_status;
  const bankStatus = enach?.bank_status || selected?.bank_status;
  const activeMandate =
    Boolean(enach?.mandate_exists) ||
    ["MANDATE_CREATED", "MANDATE_INITIATED"].includes(upper(bankStatus));
  const loanReady =
    Number(selected?.loan_amount) > 0 && Number(selected?.loan_tenure) > 0;
  const latestMandate = enach?.mandates?.at?.(-1) || null;
  const canTrigger = !busy && !statusLoading && loanReady;

  return (
    <div className="nyse-page">
      <div className="nyse-shell">
        <header className="nyse-header">
          <div className="nyse-header-copy">
            <div className="nyse-eyebrow">
              <ShieldCheck size={15} /> NIYARA UBL{" "}
              <span className="nyse-eyebrow-dot" /> POST CREDIT OPERATIONS
            </div>
            <h1>Niyara eSign &amp; eNACH</h1>
            <p>
              Manage sanction signing, loan agreements and mandate authorization
              for credit-approved cases.
            </p>
          </div>
          <button
            className="nyse-button nyse-button--outline"
            onClick={refreshAll}
            type="button"
            disabled={loading || Boolean(busy)}
          >
            <RefreshCcw size={16} className={loading ? "nyse-spin" : ""} />{" "}
            Refresh
          </button>
        </header>

        <div className="nyse-stats">
          <StatCard
            title="Credit Approved"
            value={rows.length}
            icon={BadgeCheck}
            tone="blue"
          />
          <StatCard
            title="Both eSigns Signed"
            value={signedCount}
            icon={FileCheck2}
            tone="indigo"
          />
          <StatCard
            title="Mandate Created"
            value={mandatesCount}
            icon={CreditCard}
            tone="amber"
          />
          <StatCard
            title="Documentation Ready"
            value={readyCount}
            icon={CheckCircle2}
            tone="green"
          />
        </div>

        <section className="nyse-panel" aria-label="Niyara documentation cases">
          <div className="nyse-panel-head">
            <div className="nyse-section-title">
              <span className="nyse-title-icon">
                <FileSignature size={19} />
              </span>
              <div>
                <h2>Pending Documentation</h2>
                <p>Review and trigger document requests for eligible loans</p>
              </div>
            </div>
            <div className="nyse-tools">
              <label className="nyse-search">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search LAN, customer, mobile..."
                  aria-label="Search Niyara cases"
                />
              </label>
              <button
                className="nyse-button nyse-button--outline"
                type="button"
                onClick={exportCsv}
                disabled={!filtered.length}
              >
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>
          {error && (
            <div className="nyse-alert nyse-alert--danger">{error}</div>
          )}
          <div className="nyse-table-wrap">
            <table className="nyse-table">
              <thead>
                <tr>
                  <th>Customer / LAN</th>
                  <th>Registered Contact</th>
                  <th>Loan Amount</th>
                  <th>Sanction eSign</th>
                  <th>Agreement eSign</th>
                  <th>eNACH</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="nyse-empty" colSpan={7}>
                      <LoaderCircle size={19} className="nyse-spin" /> Loading
                      credit-approved loans...
                    </td>
                  </tr>
                ) : visible.length === 0 ? (
                  <tr>
                    <td className="nyse-empty" colSpan={7}>
                      No matching credit-approved cases found.
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => (
                    <tr key={row.lan}>
                      <td>
                        <div className="nyse-name">
                          {row.customer_name || "—"}
                        </div>
                        <div className="nyse-lan">{row.lan}</div>
                      </td>
                      <td>
                        <div className="nyse-contact">
                          {row.mobile_number || "—"}
                        </div>
                        <div className="nyse-subline">
                          {row.email || "Email not available"}
                        </div>
                      </td>
                      <td>
                        <span className="nyse-amount">
                          {money(row.loan_amount)}
                        </span>
                      </td>
                      <td>
                        <StatusPill
                          value={row.sanction_esign_status}
                          kind="compact"
                        />
                      </td>
                      <td>
                        <StatusPill
                          value={row.agreement_esign_status}
                          kind="compact"
                        />
                      </td>
                      <td>
                        <StatusPill value={row.bank_status} kind="compact" />
                      </td>
                      <td>
                        <button
                          className="nyse-button nyse-button--primary nyse-review"
                          type="button"
                          onClick={() => review(row)}
                        >
                          Review &amp; Trigger <ExternalLink size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="nyse-table-footer">
            <span>
              Showing {filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–
              {Math.min(currentPage * PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length} cases
            </span>
            <div className="nyse-pagination">
              <span>
                Page {currentPage} of {pages}
              </span>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Prev
              </button>
              <button
                type="button"
                disabled={currentPage >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <div className="nyse-footnote">
          <Info size={15} /> Link initiation never disburses a loan. Signed
          documents and registered mandates must be verified before Ops Maker
          approval.
        </div>
      </div>

      {selected && (
        <div
          className="nyse-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setSelected(null);
          }}
        >
          <div
            className="nyse-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nyse-dialog-title"
          >
            <div className="nyse-modal-header">
              <div>
                <span className="nyse-dialog-label">
                  DOCUMENT AUTHORIZATION
                </span>
                <h2 id="nyse-dialog-title">
                  eSign &amp; eNACH · {selected.lan}
                </h2>
                <p>
                  {selected.customer_name} · {selected.mobile_number} ·{" "}
                  {selected.email || "No email saved"}
                </p>
              </div>
              <button
                type="button"
                className="nyse-icon-button"
                onClick={() => setSelected(null)}
                disabled={Boolean(busy)}
                aria-label="Close dialog"
              >
                <X size={19} />
              </button>
            </div>
            <div className="nyse-modal-content">
              <div className="nyse-summary-strip">
                <div>
                  <span>Loan Amount</span>
                  <strong>{money(selected.loan_amount)}</strong>
                </div>
                <div>
                  <span>Stage</span>
                  <strong>{getText(selected.stage).replace(/_/g, " ")}</strong>
                </div>
                <div>
                  <span>Bank Account</span>
                  <strong>{maskAccount(selected.account_number)}</strong>
                </div>
              </div>
              {detailsError && (
                <div className="nyse-alert nyse-alert--warning">
                  {detailsError}
                </div>
              )}
              {notice && (
                <div
                  className={`nyse-alert ${notice.startsWith("Error:") ? "nyse-alert--danger" : "nyse-alert--info"}`}
                >
                  {notice}
                </div>
              )}
              {!loanReady && (
                <div className="nyse-alert nyse-alert--warning">
                  Complete final loan terms before triggering eSign or eNACH.
                  The backend will also validate interest, documents and mandate
                  eligibility.
                </div>
              )}

              <div className="nyse-modal-grid">
                <section className="nyse-work-card">
                  <div className="nyse-work-head">
                    <div className="nyse-work-icon nyse-work-icon--purple">
                      <FileSignature size={20} />
                    </div>
                    <div>
                      <h3>Doqfy eSign</h3>
                      <p>Sanction letter &amp; loan agreement</p>
                    </div>
                  </div>
                  {[
                    {
                      type: "SANCTION",
                      title: "Sanction Letter",
                      status: sanctionStatus,
                      verified: Boolean(esign?.sanction?.verified_signed),
                    },
                    {
                      type: "AGREEMENT",
                      title: "Loan Agreement",
                      status: agreementStatus,
                      verified: Boolean(esign?.agreement?.verified_signed),
                    },
                  ].map((doc) => (
                    <div className="nyse-doc" key={doc.type}>
                      <div className="nyse-doc-top">
                        <strong>{doc.title}</strong>
                        <StatusPill value={doc.status} kind="compact" />
                      </div>
                      <p className="nyse-doc-description">
                        {doc.verified
                          ? "Signed PDF verified by provider records"
                          : "Customer signing / provider verification pending"}
                      </p>
                      <button
                        className="nyse-button nyse-button--primary nyse-button--full"
                        type="button"
                        disabled={!canTrigger || isSignStarted(doc.status)}
                        onClick={() => triggerEsign(doc.type)}
                      >
                        {busy === doc.type ? (
                          <LoaderCircle size={16} className="nyse-spin" />
                        ) : (
                          <Send size={15} />
                        )}
                        {busy === doc.type
                          ? "Initiating..."
                          : isSigned(doc.status)
                            ? "Signed"
                            : isSignStarted(doc.status)
                              ? "Already Initiated"
                              : `Trigger ${doc.type === "SANCTION" ? "Sanction" : "Agreement"} Link`}
                      </button>
                      {links[doc.type] && (
                        <div className="nyse-link-actions">
                          <a
                            href={links[doc.type]}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={14} /> Open signing link
                          </a>
                          <button
                            type="button"
                            onClick={() => copyLink(links[doc.type])}
                          >
                            <ClipboardCopy size={14} /> Copy
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="nyse-inline-note">
                    <Info size={15} />
                    <span>
                      Doqfy creates the signing request. SMS/email delivery
                      depends on your configured notification service.
                    </span>
                  </div>
                </section>

                <section className="nyse-work-card">
                  <div className="nyse-work-head">
                    <div className="nyse-work-icon nyse-work-icon--blue">
                      <CreditCard size={20} />
                    </div>
                    <div>
                      <h3>Digio eNACH</h3>
                      <p>Create a bank mandate authorization link</p>
                    </div>
                  </div>
                  <div className="nyse-mandate-status">
                    <div>
                      <span>Mandate Status</span>
                      <StatusPill value={bankStatus} kind="compact" />
                    </div>
                    <p>
                      Account {maskAccount(selected.account_number)} · IFSC{" "}
                      {selected.ifsc || "Not saved"}
                    </p>
                    {latestMandate && (
                      <p>
                        Last mandate: {latestMandate.status || "—"} · UMRN:{" "}
                        {latestMandate.umrn || "Awaiting UMRN"}
                      </p>
                    )}
                  </div>
                  <form className="nyse-form" onSubmit={triggerEnach}>
                    <div className="nyse-form-grid">
                      <label className="nyse-field">
                        <span>Maximum debit (₹)</span>
                        <input
                          required
                          type="number"
                          min="1"
                          step="0.01"
                          value={mandate.amount}
                          onChange={(event) =>
                            setMandate((prev) => ({
                              ...prev,
                              amount: event.target.value,
                            }))
                          }
                          placeholder="Enter amount"
                        />
                      </label>
                      <label className="nyse-field">
                        <span>Account type</span>
                        <select
                          value={mandate.account_type}
                          onChange={(event) =>
                            setMandate((prev) => ({
                              ...prev,
                              account_type: event.target.value,
                            }))
                          }
                        >
                          <option value="savings">Savings</option>
                          <option value="current">Current</option>
                        </select>
                      </label>
                      <label className="nyse-field">
                        <span>First collection</span>
                        <input
                          required
                          type="date"
                          min={dateToday()}
                          value={mandate.start_date}
                          onChange={(event) =>
                            setMandate((prev) => ({
                              ...prev,
                              start_date: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="nyse-field">
                        <span>Final collection</span>
                        <input
                          required
                          type="date"
                          min={mandate.start_date}
                          value={mandate.end_date}
                          onChange={(event) =>
                            setMandate((prev) => ({
                              ...prev,
                              end_date: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="nyse-field nyse-field--wide">
                        <span>Frequency</span>
                        <select
                          value={mandate.frequency}
                          onChange={(event) =>
                            setMandate((prev) => ({
                              ...prev,
                              frequency: event.target.value,
                            }))
                          }
                        >
                          <option value="MONTHLY">Monthly</option>
                          <option value="QUARTERLY">Quarterly</option>
                        </select>
                      </label>
                    </div>
                    <button
                      className="nyse-button nyse-button--primary nyse-button--full"
                      type="submit"
                      disabled={!canTrigger || activeMandate}
                    >
                      {busy === "ENACH" ? (
                        <LoaderCircle size={16} className="nyse-spin" />
                      ) : (
                        <Send size={15} />
                      )}
                      {busy === "ENACH"
                        ? "Creating mandate..."
                        : activeMandate
                          ? "Mandate Already Initiated"
                          : "Trigger eNACH Link"}
                    </button>
                    {links.ENACH && (
                      <div className="nyse-link-actions">
                        <a
                          href={links.ENACH}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink size={14} /> Open Digio link
                        </a>
                        <button
                          type="button"
                          onClick={() => copyLink(links.ENACH)}
                        >
                          <ClipboardCopy size={14} /> Copy
                        </button>
                      </div>
                    )}
                  </form>
                  <div className="nyse-inline-note">
                    <Info size={15} />
                    <span>
                      Digio is requested to notify the registered mobile.
                      Confirm delivery and mandate completion in Digio logs.
                    </span>
                  </div>
                </section>
              </div>
              <div className="nyse-modal-footer">
                <span>
                  {statusLoading
                    ? "Refreshing verification statuses..."
                    : "Refresh after customer signs or authorizes the mandate"}
                </span>
                <div>
                  <button
                    className="nyse-button nyse-button--outline"
                    type="button"
                    onClick={() => loadStatuses(selected.lan)}
                    disabled={Boolean(busy) || statusLoading}
                  >
                    <RefreshCcw
                      size={15}
                      className={statusLoading ? "nyse-spin" : ""}
                    />{" "}
                    Refresh Status
                  </button>
                  <button
                    className="nyse-button nyse-button--dark"
                    type="button"
                    onClick={() => setSelected(null)}
                    disabled={Boolean(busy)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
