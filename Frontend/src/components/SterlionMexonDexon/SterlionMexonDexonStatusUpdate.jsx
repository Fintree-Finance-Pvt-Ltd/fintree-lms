import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  UserRound,
  Wallet,
  Building2,
  Hash,
  Save,
  ArrowRight,
  LockKeyhole,
} from "lucide-react";

import api from "../../api/api";

// =============================================
// Helpers
// =============================================

const formatAmount = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const displayValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
};

const normalizeStatus = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const isValidLan = (value) => /^(STF|MXF|DXF)\d+$/.test(value);

// =============================================
// Inline Styles
// =============================================

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f1f5f9",
    padding: "30px 22px 60px",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    color: "#0f172a",
  },

  container: {
    maxWidth: "1050px",
    margin: "0 auto",
  },

  backButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    background: "#ffffff",
    color: "#334155",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    padding: "11px 17px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 800,
  },

  heading: {
    fontSize: "clamp(24px, 3vw, 34px)",
    fontWeight: 900,
    margin: "0 0 8px",
    color: "#0f172a",
    letterSpacing: "-0.025em",
  },

  subtitle: {
    margin: 0,
    color: "#64748b",
    fontSize: "14px",
    lineHeight: 1.7,
  },

  card: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "17px",
    padding: "27px",
    boxShadow: "0 5px 18px rgba(15,23,42,0.04)",
  },

  cardTitle: {
    fontSize: "18px",
    fontWeight: 900,
    margin: 0,
    color: "#0f172a",
  },

  label: {
    display: "block",
    marginBottom: "9px",
    fontSize: "12px",
    color: "#64748b",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },

  input: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    height: "49px",
    padding: "0 15px",
    border: "1px solid #cbd5e1",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#0f172a",
    fontSize: "15px",
    fontWeight: 700,
    outlineColor: "#0284c7",
  },

  primaryButton: {
    minHeight: "49px",
    padding: "0 22px",
    border: "none",
    borderRadius: "9px",
    background: "#0284c7",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "9px",
  },

  fieldLabel: {
    fontSize: "11px",
    color: "#94a3b8",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "8px",
  },

  fieldValue: {
    fontSize: "16px",
    color: "#1e293b",
    fontWeight: 800,
    overflowWrap: "anywhere",
    lineHeight: 1.45,
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
    gap: "25px",
  },

  notice: {
    display: "flex",
    alignItems: "flex-start",
    gap: "11px",
    padding: "15px 17px",
    borderRadius: "11px",
    fontSize: "13px",
    fontWeight: 700,
    lineHeight: 1.6,
  },
};

// =============================================
// Reusable Components
// =============================================

const Field = ({ label, value, highlight = false }) => (
  <div style={{ minWidth: 0 }}>
    <div style={styles.fieldLabel}>{label}</div>

    <div
      style={{
        ...styles.fieldValue,
        color: highlight ? "#0284c7" : "#1e293b",
      }}
    >
      {displayValue(value)}
    </div>
  </div>
);

const StatusBadge = ({ value }) => {
  const status = normalizeStatus(value);

  const closed = status === "CLOSED";
  const login = status === "LOGIN";

  const palette = closed
    ? {
        bg: "#dcfce7",
        text: "#166534",
        border: "#bbf7d0",
      }
    : login
      ? {
          bg: "#e0f2fe",
          text: "#075985",
          border: "#bae6fd",
        }
      : {
          bg: "#fef3c7",
          text: "#92400e",
          border: "#fde68a",
        };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        padding: "8px 14px",
        borderRadius: "8px",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.text,
        fontSize: "12px",
        fontWeight: 900,
        width: "fit-content",
      }}
    >
      {closed && <CheckCircle2 size={15} />}
      {displayValue(value)}
    </span>
  );
};

// =============================================
// Main Component
// =============================================

const SterlionMexonDexonStatusUpdate = () => {
  const navigate = useNavigate();

  const [lanInput, setLanInput] = useState("");
  const [loan, setLoan] = useState(null);

  const [selectedStatus, setSelectedStatus] = useState("");

  const [searching, setSearching] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const currentStatus = normalizeStatus(loan?.status);

  const canEdit = currentStatus === "LOGIN" || currentStatus === "CLOSED";

  const statusChanged =
    !!selectedStatus && normalizeStatus(selectedStatus) !== currentStatus;

  const hasOutstandingUtilization = Number(loan?.utilized_amount || 0) > 0.009;

  const closingBlocked =
    selectedStatus === "Closed" && hasOutstandingUtilization;

  // =============================================
  // Fetch Loan By LAN
  // =============================================

  const fetchLoan = async (event) => {
    if (event) event.preventDefault();

    const lan = lanInput.trim().toUpperCase();

    setLoan(null);
    setSelectedStatus("");
    setError("");
    setSuccess("");

    if (!isValidLan(lan)) {
      setError("Please enter a valid LAN starting with STF, MXF or DXF.");
      return;
    }

    setSearching(true);

    try {
      const response = await api.get(
        `/sterlion-mexon-dexon/${encodeURIComponent(lan)}/details`,
      );

      if (!response.data?.success || !response.data?.data) {
        throw new Error(response.data?.message || "Loan not found.");
      }

      const record = response.data.data;

      setLoan(record);

      const existing = normalizeStatus(record.status);

      if (existing === "LOGIN") {
        setSelectedStatus("Closed");
      } else if (existing === "CLOSED") {
        setSelectedStatus("Login");
      } else {
        setSelectedStatus("");
      }
    } catch (err) {
      console.error("Failed to fetch loan:", err);

      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to fetch loan details.",
      );
    } finally {
      setSearching(false);
    }
  };

  // =============================================
  // Update Loan Status
  // =============================================

  const updateStatus = async () => {
    if (!loan || !canEdit || !statusChanged) return;

    setError("");
    setSuccess("");

    if (closingBlocked) {
      setError(
        "This loan has utilized principal. Reconcile the loan before closure.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to change the status of ${loan.lan} from ${loan.status} to ${selectedStatus}?`,
    );

    if (!confirmed) return;

    setUpdating(true);

    try {
      const response = await api.patch(
        `/sterlion-mexon-dexon/${encodeURIComponent(loan.lan)}/status`,
        {
          status: selectedStatus,
          previous_status: loan.status,
        },
      );

      if (!response.data?.success) {
        throw new Error(response.data?.message || "Status update failed.");
      }

      const updated = response.data.data;

      // Immediately update the status shown on this page.
      setLoan((previous) => ({
        ...previous,
        ...updated,
      }));

      setSelectedStatus("");

      setSuccess(response.data.message || "Loan status updated successfully.");
    } catch (err) {
      console.error("Status update failed:", err);

      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to update loan status.",
      );
    } finally {
      setUpdating(false);
    }
  };

  // =============================================
  // Page UI
  // =============================================

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}

        <div style={{ marginBottom: "29px" }}>
          <button
            type="button"
            style={{
              ...styles.backButton,
              marginBottom: "26px",
            }}
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={17} />
            Back
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "15px",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                width: "50px",
                height: "50px",
                flexShrink: 0,
                borderRadius: "13px",
                background: "#e0f2fe",
                color: "#0284c7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldCheck size={26} />
            </div>

            <div>
              <h1 style={styles.heading}>Loan Status Management</h1>

              <p style={styles.subtitle}>Sterlion / Mexon / Dexon — UBL</p>
            </div>
          </div>

          <p style={styles.subtitle}>
            Search a loan account number and update its administrative status.
          </p>
        </div>

        {/* LAN Search */}

        <section style={styles.card}>
          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              marginBottom: "22px",
            }}
          >
            <Search size={21} color="#0284c7" />

            <h2 style={styles.cardTitle}>Search Loan Account</h2>
          </div>

          <form
            onSubmit={fetchLoan}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              gap: "14px",
            }}
          >
            <div
              style={{
                flex: "1 1 280px",
                minWidth: 0,
              }}
            >
              <label htmlFor="smd-lan" style={styles.label}>
                Loan Account Number (LAN)
              </label>

              <input
                id="smd-lan"
                type="text"
                placeholder="Enter LAN e.g. MXF11001"
                autoComplete="off"
                maxLength={100}
                value={lanInput}
                onChange={(event) => {
                  setLanInput(event.target.value.toUpperCase());
                  setLoan(null);
                  setSelectedStatus("");
                  setError("");
                  setSuccess("");
                }}
                style={styles.input}
              />
            </div>

            <button
              type="submit"
              disabled={searching || updating}
              style={{
                ...styles.primaryButton,
                opacity: searching ? 0.65 : 1,
                cursor: searching ? "not-allowed" : "pointer",
              }}
            >
              {searching ? <RefreshCw size={18} /> : <Search size={18} />}

              {searching ? "Searching..." : "Fetch Loan"}
            </button>
          </form>

          <p
            style={{
              fontSize: "12px",
              color: "#94a3b8",
              fontWeight: 700,
              margin: "14px 0 0",
            }}
          >
            Supported LAN prefixes: STF, MXF, DXF
          </p>
        </section>

        {/* Error Notification */}

        {error && (
          <div
            role="alert"
            style={{
              ...styles.notice,
              marginTop: "20px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
            }}
          >
            <AlertCircle size={20} style={{ flexShrink: 0 }} />

            <span>{error}</span>
          </div>
        )}

        {/* Success Notification */}

        {success && (
          <div
            role="status"
            style={{
              ...styles.notice,
              marginTop: "20px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              color: "#166534",
            }}
          >
            <CheckCircle2 size={20} style={{ flexShrink: 0 }} />

            <span>{success}</span>
          </div>
        )}

        {/* Search Result */}

        {loan && (
          <>
            {/* Customer Information */}

            <section
              style={{
                ...styles.card,
                marginTop: "24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "25px",
                }}
              >
                <UserRound size={22} color="#0284c7" />

                <h2 style={styles.cardTitle}>Loan Information</h2>
              </div>

              <div style={styles.infoGrid}>
                <Field label="Loan Account Number" value={loan.lan} highlight />

                <Field
                  label="Customer Name"
                  value={
                    loan.customer_name ||
                    [loan.first_name, loan.last_name].filter(Boolean).join(" ")
                  }
                />

                <Field label="Product" value={loan.product} />

                <Field label="Lender" value={loan.lender} />

                <Field
                  label="Loan Limit"
                  value={formatAmount(loan.loan_limit)}
                />

                <Field
                  label="Utilized Amount"
                  value={formatAmount(loan.utilized_amount)}
                />

                <Field
                  label="Unutilized Amount"
                  value={formatAmount(loan.unutilized_amount)}
                />

                <div>
                  <div style={styles.fieldLabel}>Current Status</div>

                  <StatusBadge value={loan.status} />
                </div>
              </div>
            </section>

            {/* Status Update */}

            <section
              style={{
                ...styles.card,
                marginTop: "24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "24px",
                }}
              >
                <Wallet size={22} color="#0284c7" />

                <h2 style={styles.cardTitle}>Change Loan Status</h2>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
                  gap: "20px",
                  alignItems: "end",
                }}
              >
                <div>
                  <label style={styles.label}>Existing Status</label>

                  <div
                    style={{
                      ...styles.input,
                      display: "flex",
                      alignItems: "center",
                      background: "#f8fafc",
                    }}
                  >
                    <StatusBadge value={loan.status} />
                  </div>
                </div>

                <div>
                  <label htmlFor="new-smd-status" style={styles.label}>
                    Select New Status
                  </label>

                  <select
                    id="new-smd-status"
                    value={selectedStatus}
                    disabled={!canEdit || updating}
                    onChange={(event) => {
                      setSelectedStatus(event.target.value);
                      setError("");
                      setSuccess("");
                    }}
                    style={{
                      ...styles.input,
                      cursor: canEdit ? "pointer" : "not-allowed",
                    }}
                  >
                    <option value="">Select Status</option>

                    <option value="Login">Login</option>

                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              {/* Status Transition Preview */}

              {selectedStatus && (
                <div
                  style={{
                    marginTop: "24px",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    padding: "19px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                      fontWeight: 800,
                      marginBottom: "13px",
                      textTransform: "uppercase",
                    }}
                  >
                    Status Change Preview
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "14px",
                    }}
                  >
                    <StatusBadge value={loan.status} />

                    <ArrowRight size={22} color="#64748b" />

                    <StatusBadge value={selectedStatus} />
                  </div>
                </div>
              )}

              {/* Warnings */}

              {!canEdit && (
                <div
                  style={{
                    ...styles.notice,
                    marginTop: "20px",
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    color: "#92400e",
                  }}
                >
                  <LockKeyhole size={19} />

                  <span>
                    This page only supports changing Login and Closed statuses.
                    The current status must be reviewed through the appropriate
                    loan workflow.
                  </span>
                </div>
              )}

              {closingBlocked && (
                <div
                  style={{
                    ...styles.notice,
                    marginTop: "20px",
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    color: "#92400e",
                  }}
                >
                  <AlertCircle size={19} />

                  <span>
                    Outstanding utilized amount:{" "}
                    {formatAmount(loan.utilized_amount)}. Closure is blocked
                    until the loan is reconciled.
                  </span>
                </div>
              )}

              {/* Action Footer */}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                  gap: "12px",
                  marginTop: "28px",
                  paddingTop: "22px",
                  borderTop: "1px solid #e2e8f0",
                }}
              >
                <button
                  type="button"
                  style={styles.backButton}
                  disabled={updating}
                  onClick={() => {
                    setLoan(null);
                    setLanInput("");
                    setSelectedStatus("");
                    setError("");
                    setSuccess("");
                  }}
                >
                  Clear
                </button>

                <button
                  type="button"
                  disabled={
                    updating || !canEdit || !statusChanged || closingBlocked
                  }
                  onClick={updateStatus}
                  style={{
                    ...styles.primaryButton,
                    background:
                      selectedStatus === "Closed" ? "#15803d" : "#0284c7",
                    opacity:
                      updating || !canEdit || !statusChanged || closingBlocked
                        ? 0.5
                        : 1,
                    cursor:
                      updating || !canEdit || !statusChanged || closingBlocked
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {updating ? <RefreshCw size={18} /> : <Save size={18} />}

                  {updating ? "Updating..." : "Update Loan Status"}
                </button>
              </div>
            </section>
          </>
        )}

        {/* Empty State */}

        {!loan && !searching && !error && (
          <div
            style={{
              marginTop: "24px",
              background: "#ffffff",
              border: "1px dashed #cbd5e1",
              borderRadius: "16px",
              padding: "45px 25px",
              textAlign: "center",
            }}
          >
            <Hash size={34} color="#94a3b8" style={{ marginBottom: "14px" }} />

            <h3
              style={{
                fontSize: "17px",
                fontWeight: 900,
                color: "#334155",
                margin: "0 0 8px",
              }}
            >
              Search a Loan Account
            </h3>

            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "#94a3b8",
                lineHeight: 1.7,
              }}
            >
              Enter a valid LAN to view loan details and manage its status.
            </p>
          </div>
        )}

        {/* Footer */}

        <div
          style={{
            marginTop: "32px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "9px",
            color: "#94a3b8",
            fontSize: "12px",
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          <Building2 size={16} />
          Fintree Finance — Sterlion / Mexon / Dexon Loan Status Management
        </div>
      </div>
    </div>
  );
};

export default SterlionMexonDexonStatusUpdate;
