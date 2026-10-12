import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const formatYMD = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value))
    return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const addMonths = (dateString, count) => {
  if (!dateString || !Number.isFinite(Number(count)) || Number(count) <= 0)
    return "";
  const d = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + Number(count));
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return formatYMD(d);
};

const chipColors = (value) => {
  const s = String(value || "PENDING")
    .trim()
    .toUpperCase();
  if (
    [
      "SIGNED",
      "VERIFIED",
      "MANDATE_CREATED",
      "APPROVED",
      "CREDIT APPROVED",
    ].includes(s)
  )
    return { background: "#eaf8ef", border: "#9ad9b0", color: "#166534" };
  if (
    ["FAILED", "REJECTED", "CREDIT REJECTED", "OPERATION REJECTED"].includes(s)
  )
    return { background: "#fef2f2", border: "#fecaca", color: "#991b1b" };
  if (["INITIATED", "MANDATE_INITIATED"].includes(s))
    return { background: "#eef4ff", border: "#b8cdfa", color: "#1d4ed8" };
  return { background: "#fff7e8", border: "#f4d08a", color: "#92400e" };
};

const Chip = ({ value }) => {
  const color = chipColors(value);
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "7px 12px",
        borderRadius: 999,
        border: `1px solid ${color.border}`,
        background: color.background,
        color: color.color,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      ● {value || "Pending"}
    </span>
  );
};

const bankFields = [
  ["Account Holder Name", "account_holder_name", "text", true],
  ["Bank Name", "bank_name", "text", false],
  ["Account Number", "account_no", "text", true],
  ["IFSC", "ifsc", "text", true],
  ["Mandate Amount (₹)", "mandate_amount", "number", true],
  ["Mandate Start Date", "mandate_start_date", "date", true],
  ["Mandate End Date", "mandate_end_date", "date", false],
];

const ZebrsOperationApproval = ({
  apiUrl = "/zebrs/operation-initiated-loans",
  title = "Zebrs Operation Approval Loans",
  // Set to true only after confirming the shared /enach endpoints support ZBCL LANs.
  enableZebrsEnach = false,
}) => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busyLan, setBusyLan] = useState("");
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [bankForm, setBankForm] = useState(null);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankError, setBankError] = useState("");
  const [mandateResult, setMandateResult] = useState(null);
  const [rejectLoan, setRejectLoan] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");

  const refresh = useCallback(
    async (signal) => {
      setLoading(true);
      setError("");
      try {
        const response = await api.get(apiUrl, {
          params: { page: 1, pageSize: 100, sortBy: "lan", sortDir: "asc" },
          signal,
        });
        if (!signal?.aborted)
          setRows(Array.isArray(response.data?.rows) ? response.data.rows : []);
      } catch (err) {
        if (signal?.aborted || err?.code === "ERR_CANCELED") return;
        setError(
          err.response?.data?.message ||
            "Failed to fetch Zebrs operation approval loans.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [apiUrl],
  );

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const openBankModal = (row) => {
    if (!enableZebrsEnach) return;
    const startDate = formatYMD(row.login_date) || formatYMD(new Date());
    setSelectedLoan(row);
    setBankError("");
    setMandateResult(null);
    setBankForm({
      account_no: row.customer_account_number || "",
      ifsc: row.bank_ifsc_code || "",
      account_type: "SAVINGS",
      bank_name: row.customer_bank_name || "",
      account_holder_name:
        row.customer_name_as_per_bank || row.customer_name || "",
      mandate_amount: row.loan_amount ?? "",
      mandate_start_date: startDate,
      mandate_end_date: addMonths(startDate, row.loan_tenure),
      mandate_frequency: "monthly",
    });
  };

  const verifyAndCreateMandate = async (event) => {
    event.preventDefault();
    if (!enableZebrsEnach || !selectedLoan || !bankForm || bankSaving) return;
    const f = bankForm;
    if (
      !f.account_no ||
      !f.ifsc ||
      !f.account_holder_name ||
      !(Number(f.mandate_amount) > 0) ||
      !f.mandate_start_date
    ) {
      setBankError("Please complete all required bank and mandate fields.");
      return;
    }
    setBankSaving(true);
    setBankError("");
    setMandateResult(null);
    try {
      const verification = await api.post("/enach/verify-bank", {
        lan: selectedLoan.lan,
        account_no: f.account_no,
        ifsc: f.ifsc,
        name: f.account_holder_name,
        bank_name: f.bank_name,
        account_type: f.account_type,
        mandate_amount: f.mandate_amount,
        amount: 1,
      });
      setMandateResult({
        verified: verification.data?.verified,
        fuzzy_score: verification.data?.fuzzy_match_score,
      });
      if (!verification.data?.verified) {
        setBankError("Bank verification failed. Please recheck details.");
        return;
      }
      const mandate = await api.post("/enach/create-mandate", {
        lan: selectedLoan.lan,
        customer_identifier:
          selectedLoan.mobile_number || selectedLoan.email || "",
        amount: f.mandate_amount,
        max_amount: f.mandate_amount,
        start_date: f.mandate_start_date,
        end_date: f.mandate_end_date || null,
        frequency: f.mandate_frequency,
        account_no: f.account_no,
        ifsc: f.ifsc,
        account_type: f.account_type,
        customer_name: f.account_holder_name,
        bank_name: f.bank_name,
      });
      if (!mandate.data?.success || !mandate.data?.documentId) {
        throw new Error(mandate.data?.message || "Mandate creation failed.");
      }
      setMandateResult((previous) => ({
        ...previous,
        mandate_created: true,
        document_id: mandate.data.documentId,
      }));
      setToast(
        "Mandate request submitted. Refresh to check actual bank status.",
      );
    } catch (err) {
      setBankError(
        err.response?.data?.message ||
          err.message ||
          "Unable to process mandate.",
      );
    } finally {
      setBankSaving(false);
    }
  };

  const approve = async (row) => {
    if (
      busyLan ||
      String(row.bank_status || "")
        .trim()
        .toUpperCase() !== "MANDATE_CREATED"
    )
      return;
    if (!window.confirm(`Approve Zebrs loan ${row.lan}?`)) return;
    setBusyLan(row.lan);
    setError("");
    try {
      const response = await api.post(
        `/zebrs/${encodeURIComponent(row.lan)}/approve`,
      );
      if (response.data?.success !== true)
        throw new Error(response.data?.message || "Approval not confirmed.");
      setRows((previous) => previous.filter((item) => item.lan !== row.lan));
      setToast(`${row.lan} operation approved successfully.`);
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || "Failed to approve loan.",
      );
    } finally {
      setBusyLan("");
    }
  };

  const reject = async (event) => {
    event.preventDefault();
    if (!rejectLoan || busyLan) return;
    const reason = rejectReason.trim();
    if (reason.length < 5 || reason.length > 1000) {
      setRejectError("Enter a reason between 5 and 1000 characters.");
      return;
    }
    const lan = rejectLoan.lan;
    setBusyLan(lan);
    setRejectError("");
    try {
      const response = await api.post(
        `/zebrs/${encodeURIComponent(lan)}/reject`,
        { reason },
      );
      if (response.data?.success !== true)
        throw new Error(response.data?.message || "Rejection not confirmed.");
      setRows((previous) => previous.filter((item) => item.lan !== lan));
      setRejectLoan(null);
      setRejectReason("");
      setToast(`${lan} operation rejected successfully.`);
    } catch (err) {
      setRejectError(
        err.response?.data?.message || err.message || "Failed to reject loan.",
      );
    } finally {
      setBusyLan("");
    }
  };

  const detailPath = (row) =>
    `/zebrs/update-data?lan=${encodeURIComponent(row.lan)}`;
  const columns = [
    {
      key: "customer_name",
      header: "Loan Details",
      sortable: true,
      width: 220,
      render: (row) => (
        <button
          type="button"
          className="zop-link"
          onClick={() => navigate(detailPath(row))}
        >
          {row.customer_name || "—"}
        </button>
      ),
    },
    {
      key: "partner_loan_id",
      header: "Partner Loan ID",
      sortable: true,
      width: 170,
    },
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      width: 140,
      render: (row) => (
        <button
          className="zop-link"
          type="button"
          onClick={() => navigate(detailPath(row))}
        >
          {row.lan}
        </button>
      ),
    },
    {
      key: "mobile_number",
      header: "Mobile",
      sortable: true,
      width: 150,
      render: (row) =>
        row.mobile_number ? (
          <a href={`tel:${row.mobile_number}`} className="zop-link">
            {row.mobile_number}
          </a>
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      header: "Loan Status",
      sortable: true,
      width: 170,
      render: (row) => <Chip value={row.status} />,
    },
    {
      key: "stage",
      header: "Stage",
      sortable: true,
      width: 155,
      render: (row) => <Chip value={row.stage} />,
    },
    {
      key: "agreement_esign_status",
      header: "Agreement eSign",
      width: 210,
      render: (row) => (
        <div className="zop-stack">
          <Chip value={row.agreement_esign_status} />
          <button
            type="button"
            className="zop-button"
            disabled
            title="Zebrs agreement eSign initiation API not yet confirmed"
          >
            {String(row.agreement_esign_status || "").toUpperCase() === "SIGNED"
              ? "Already Signed"
              : "Send Agreement eSign"}
          </button>
        </div>
      ),
    },
    {
      key: "bank_actions",
      header: "Bank / eNACH",
      width: 210,
      csvAccessor: () => "",
      render: (row) => {
        const bankStatus = String(row.bank_status || "PENDING")
          .trim()
          .toUpperCase();
        const unavailable = [
          "VERIFIED",
          "MANDATE_CREATED",
          "MANDATE_INITIATED",
        ].includes(bankStatus);
        const disabled = unavailable || Boolean(busyLan) || !enableZebrsEnach;
        return (
          <div className="zop-stack">
            <Chip value={row.bank_status} />
            <div className="zop-buttons">
              <button
                type="button"
                className="zop-button"
                onClick={() =>
                  navigate(`/documents/${encodeURIComponent(row.lan)}`)
                }
              >
                Docs
              </button>
              <button
                type="button"
                className="zop-button"
                disabled={disabled}
                title={
                  !enableZebrsEnach
                    ? "Enable only after confirming eNACH supports Zebrs loans"
                    : ""
                }
                onClick={() => openBankModal(row)}
              >
                {bankStatus === "PENDING"
                  ? "Add Bank"
                  : bankStatus === "VERIFIED"
                    ? "Verified"
                    : bankStatus === "MANDATE_CREATED"
                      ? "Mandate Created"
                      : bankStatus === "MANDATE_INITIATED"
                        ? "Mandate Initiated"
                        : "Add Bank"}
              </button>
            </div>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      width: 210,
      csvAccessor: () => "",
      render: (row) => {
        const eligible =
          String(row.bank_status || "")
            .trim()
            .toUpperCase() === "MANDATE_CREATED";
        const disabled = !eligible || Boolean(busyLan);
        return (
          <div className="zop-buttons">
            <button
              type="button"
              className="zop-button zop-approve"
              disabled={disabled}
              onClick={() => approve(row)}
            >
              {busyLan === row.lan ? "Working..." : "Approve"}
            </button>
            <button
              type="button"
              className="zop-button zop-reject"
              disabled={disabled}
              onClick={() => {
                setRejectLoan(row);
                setRejectReason("");
                setRejectError("");
              }}
            >
              Reject
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="zop-page">
      <style>{`
        .zop-page { width: 100%; }
        .zop-link { background:none; border:0; padding:0; font:inherit; color:#2563eb; font-weight:600; text-align:left; cursor:pointer; text-decoration:none; }
        .zop-link:hover { text-decoration:underline; }
        .zop-stack { display:flex; flex-direction:column; align-items:flex-start; gap:8px; }
        .zop-buttons { display:flex; flex-wrap:wrap; gap:8px; }
        .zop-button { border:1px solid #b8cdfa; background:#f8fbff; color:#1d4ed8; border-radius:9px; padding:8px 12px; font-size:12px; font-weight:700; cursor:pointer; }
        .zop-button:disabled { opacity:.45; cursor:not-allowed; }
        .zop-approve { border-color:#86efac; background:#ecfdf3; color:#166534; }
        .zop-reject { border-color:#fca5a5; background:#fef2f2; color:#b91c1c; }
        .zop-notice { padding:12px 14px; margin-bottom:14px; border:1px solid #bfdbfe; border-radius:9px; color:#1e3a8a; background:#eff6ff; }
        .zop-error { background:#fef2f2; border-color:#fecaca; color:#991b1b; }
        .zop-top { display:flex; align-items:center; justify-content:flex-end; margin-bottom:12px; }
        .zop-overlay { position:fixed; inset:0; z-index:9999; background:rgba(15,23,42,.55); display:flex; align-items:center; justify-content:center; padding:16px; }
        .zop-modal { background:white; border-radius:14px; max-height:92vh; overflow:auto; width:min(510px,100%); padding:24px; box-sizing:border-box; box-shadow:0 20px 45px #0003; }
        .zop-modal h3 { margin:0 0 16px; color:#0f172a; font-size:20px; }
        .zop-field { display:block; margin:12px 0; color:#334155; font-size:13px; font-weight:700; }
        .zop-field input,.zop-field select,.zop-field textarea { display:block; width:100%; box-sizing:border-box; margin-top:6px; padding:10px; border:1px solid #cbd5e1; border-radius:8px; font:inherit; }
        .zop-field input[readonly] { background:#f8fafc; }
        .zop-modal-actions { display:flex; justify-content:flex-end; gap:9px; margin-top:20px; }
      `}</style>
      <LoaderOverlay
        show={loading}
        label="Fetching Zebrs operation approval loans..."
      />
      {error && (
        <div role="alert" className="zop-notice zop-error">
          {error}
        </div>
      )}
      {toast && (
        <div role="status" className="zop-notice">
          {toast}
        </div>
      )}
      <div className="zop-top">
        <button
          className="zop-button"
          type="button"
          disabled={loading}
          onClick={() => refresh()}
        >
          ↻ Refresh
        </button>
      </div>
      <DataTable
        title={title}
        rows={rows}
        columns={columns}
        globalSearchKeys={[
          "customer_name",
          "partner_loan_id",
          "lan",
          "mobile_number",
          "status",
          "stage",
        ]}
        initialSort={{ key: "lan", dir: "asc" }}
        exportFileName="Zebrs_Operation_Approval_Loans"
      />
      {selectedLoan && bankForm && (
        <div className="zop-overlay" role="presentation">
          <div
            className="zop-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Bank details and mandate"
          >
            <h3>Add Bank Details &amp; Mandate</h3>
            <form onSubmit={verifyAndCreateMandate}>
              {bankFields.map(([label, name, type, required]) => (
                <label className="zop-field" key={name}>
                  {label}
                  {required ? " *" : ""}
                  <input
                    name={name}
                    type={type}
                    required={required}
                    min={type === "number" ? "0.01" : undefined}
                    step={type === "number" ? "0.01" : undefined}
                    value={bankForm[name]}
                    readOnly={[
                      "account_holder_name",
                      "bank_name",
                      "account_no",
                      "ifsc",
                    ].includes(name)}
                    onChange={(e) =>
                      setBankForm((previous) => ({
                        ...previous,
                        [name]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
              <label className="zop-field">
                Account Type
                <select
                  value={bankForm.account_type}
                  onChange={(e) =>
                    setBankForm((previous) => ({
                      ...previous,
                      account_type: e.target.value,
                    }))
                  }
                >
                  <option value="SAVINGS">SAVINGS</option>
                  <option value="CURRENT">CURRENT</option>
                </select>
              </label>
              <label className="zop-field">
                Frequency
                <select
                  value={bankForm.mandate_frequency}
                  onChange={(e) =>
                    setBankForm((previous) => ({
                      ...previous,
                      mandate_frequency: e.target.value,
                    }))
                  }
                >
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              {bankError && (
                <p className="zop-notice zop-error" role="alert">
                  {bankError}
                </p>
              )}
              {mandateResult && (
                <p className="zop-notice">
                  Bank verified: {mandateResult.verified ? "Yes" : "No"}
                  {mandateResult.mandate_created
                    ? ` · Mandate ID: ${mandateResult.document_id}`
                    : ""}
                </p>
              )}
              <div className="zop-modal-actions">
                <button
                  type="button"
                  className="zop-button"
                  disabled={bankSaving}
                  onClick={() => {
                    setSelectedLoan(null);
                    setBankForm(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="zop-button zop-approve"
                  disabled={bankSaving}
                >
                  {bankSaving ? "Processing..." : "Verify & Create Mandate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {rejectLoan && (
        <div className="zop-overlay" role="presentation">
          <form
            className="zop-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Reject Zebrs loan"
            onSubmit={reject}
          >
            <h3>Reject Operation Approval</h3>
            <p>
              LAN: <strong>{rejectLoan.lan}</strong>
            </p>
            <label className="zop-field">
              Rejection Reason *
              <textarea
                autoFocus
                rows={4}
                required
                minLength={5}
                maxLength={1000}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter a reason..."
              />
            </label>
            {rejectError && (
              <p className="zop-notice zop-error" role="alert">
                {rejectError}
              </p>
            )}
            <div className="zop-modal-actions">
              <button
                type="button"
                className="zop-button"
                disabled={Boolean(busyLan)}
                onClick={() => setRejectLoan(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="zop-button zop-reject"
                disabled={Boolean(busyLan) || rejectReason.trim().length < 5}
              >
                {busyLan ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ZebrsOperationApproval;
