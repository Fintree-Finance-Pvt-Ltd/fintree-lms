import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  RefreshCw,
  UserRound,
  Wallet,
  Building2,
  Landmark,
  MapPin,
  CalendarDays,
  FileText,
} from "lucide-react";

import api from "../../api/api";

// =====================================
// Helper Functions
// =====================================

const hasValue = (value) =>
  value !== null && value !== undefined && String(value).trim() !== "";

const displayValue = (value) => (hasValue(value) ? String(value) : "—");

const formatCurrency = (value) => {
  if (!hasValue(value)) return "—";

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
  if (!hasValue(value)) return "—";

  // Handle MySQL DATE without timezone shifts.
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
};

const formatDateTime = (value) => {
  if (!hasValue(value)) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
};

const formatPercent = (value) => (hasValue(value) ? `${Number(value)}%` : "—");

const formatTenure = (value) => (hasValue(value) ? `${value} Months` : "—");

const maskSensitive = (value, visible = 4) => {
  if (!hasValue(value)) return "—";

  const text = String(value);

  if (text.length <= visible) return "XXXX";

  return "X".repeat(text.length - visible) + text.slice(-visible);
};

// =====================================
// Reusable UI Components
// =====================================

const Grid = ({ children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
      gap: "26px",
    }}
  >
    {children}
  </div>
);

const StatusPill = ({ value }) => {
  if (!hasValue(value)) return <span>—</span>;

  const status = String(value).trim().toUpperCase();

  let background = "#e0f2fe";
  let color = "#075985";
  let border = "#bae6fd";

  if (
    status.includes("APPROVED") ||
    status.includes("DISBURSED") ||
    status.includes("ACTIVE") ||
    status === "SUCCESS"
  ) {
    background = "#dcfce7";
    color = "#166534";
    border = "#bbf7d0";
  } else if (
    status.includes("REJECTED") ||
    status.includes("FAILED") ||
    status.includes("CANCELLED")
  ) {
    background = "#fee2e2";
    color = "#991b1b";
    border = "#fecaca";
  } else if (status.includes("PENDING") || status.includes("INITIATED")) {
    background = "#fef9c3";
    color = "#854d0e";
    border = "#fde68a";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
        padding: "7px 14px",
        borderRadius: "9px",
        background,
        color,
        border: `1px solid ${border}`,
        fontSize: "12px",
        fontWeight: 800,
        letterSpacing: "0.02em",
      }}
    >
      {status}
    </span>
  );
};

const Field = ({ label, value, highlight = false, isStatus = false }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "9px",
      minWidth: 0,
    }}
  >
    <label
      style={{
        fontSize: "12px",
        fontWeight: 800,
        color: "#94a3b8",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {label}
    </label>

    {isStatus ? (
      <StatusPill value={value} />
    ) : (
      <div
        style={{
          fontSize: highlight ? "19px" : "16px",
          fontWeight: highlight ? 900 : 700,
          color: highlight ? "#0284c7" : "#1e293b",
          lineHeight: 1.5,
          overflowWrap: "anywhere",
        }}
      >
        {displayValue(value)}
      </div>
    )}
  </div>
);

const Section = ({ title, icon: Icon, children }) => (
  <section
    style={{
      background: "#ffffff",
      borderRadius: "18px",
      padding: "28px",
      border: "1px solid #e2e8f0",
      boxShadow: "0 5px 18px rgba(15,23,42,0.04)",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        marginBottom: "26px",
        paddingBottom: "18px",
        borderBottom: "1px solid #f1f5f9",
      }}
    >
      <div
        style={{
          height: "42px",
          width: "42px",
          borderRadius: "12px",
          background: "#e0f2fe",
          color: "#0284c7",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={22} />
      </div>

      <h2
        style={{
          margin: 0,
          fontSize: "19px",
          fontWeight: 900,
          color: "#0f172a",
        }}
      >
        {title}
      </h2>
    </div>

    {children}
  </section>
);

const SummaryCard = ({ label, value, color = "#0284c7" }) => (
  <div
    style={{
      background: "#ffffff",
      padding: "24px",
      borderRadius: "16px",
      border: "1px solid #e2e8f0",
      boxShadow: "0 3px 12px rgba(0,0,0,0.03)",
      minWidth: 0,
    }}
  >
    <div
      style={{
        fontSize: "12px",
        color: "#64748b",
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: "10px",
      }}
    >
      {label}
    </div>

    <div
      style={{
        fontSize: "25px",
        fontWeight: 900,
        color,
        overflowWrap: "anywhere",
      }}
    >
      {formatCurrency(value)}
    </div>
  </div>
);

// =====================================
// Main Component
// =====================================

const SterlionMexonDexonLoanDetails = () => {
  const { lan } = useParams();
  const navigate = useNavigate();

  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // =====================================
  // Fetch Loan Details
  // =====================================

  useEffect(() => {
    const controller = new AbortController();

    const fetchLoanDetails = async () => {
      if (!lan) {
        setError("Loan Account Number is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        setLoan(null);

        const response = await api.get(
          `/sterlion-mexon-dexon/${encodeURIComponent(lan)}/details`,
          {
            signal: controller.signal,
          },
        );

        if (!response.data?.success || !response.data?.data) {
          throw new Error(response.data?.message || "Loan details not found.");
        }

        if (!controller.signal.aborted) {
          setLoan(response.data.data);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        console.error("Failed to fetch Sterlion Mexon Dexon details:", err);

        setError(
          err.response?.data?.message ||
            err.message ||
            "Failed to fetch loan details.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchLoanDetails();

    return () => controller.abort();
  }, [lan, refreshKey]);

  // =====================================
  // Page State: Loading / Error
  // =====================================

  const pageStyle = {
    minHeight: "100vh",
    background: "#f1f5f9",
    padding: "32px 24px",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    color: "#0f172a",
  };

  const backButtonStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "9px",
    padding: "12px 20px",
    background: "#ffffff",
    color: "#334155",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: "14px",
  };

  if (loading) {
    return (
      <div
        style={{
          ...pageStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            textAlign: "center",
            background: "#ffffff",
            padding: "40px 50px",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              width: "46px",
              height: "46px",
              border: "5px solid #e2e8f0",
              borderTop: "5px solid #0284c7",
              borderRadius: "50%",
              margin: "0 auto 20px",
              animation: "smd-spin 0.8s linear infinite",
            }}
          />

          <style>
            {`
              @keyframes smd-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}
          </style>

          <p
            style={{
              fontWeight: 800,
              color: "#475569",
            }}
          >
            Fetching Loan Details...
          </p>
        </div>
      </div>
    );
  }

  if (error || !loan) {
    return (
      <div style={pageStyle}>
        <div
          style={{
            maxWidth: "900px",
            margin: "0 auto",
          }}
        >
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={backButtonStyle}
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <div
            style={{
              background: "#ffffff",
              border: "1px solid #fecaca",
              padding: "30px",
              marginTop: "24px",
              borderRadius: "16px",
            }}
          >
            <h3 style={{ color: "#dc2626" }}>Unable to Load Loan Details</h3>

            <p style={{ color: "#64748b" }}>
              {error || "No loan record found."}
            </p>

            <button
              type="button"
              onClick={() => setRefreshKey((previous) => previous + 1)}
              style={backButtonStyle}
            >
              <RefreshCw size={16} />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =====================================
  // Prepare Customer Details
  // =====================================

  const customerName =
    loan.customer_name ||
    [loan.first_name, loan.last_name].filter(Boolean).join(" ") ||
    loan.lan ||
    "Customer";

  const pageLan = loan.lan || lan;

  // =====================================
  // Render
  // =====================================

  return (
    <div style={pageStyle}>
      <div
        style={{
          maxWidth: "1350px",
          margin: "0 auto",
        }}
      >
        {/* ============================= */}
        {/* HEADER */}
        {/* ============================= */}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "24px",
            marginBottom: "30px",
          }}
        >
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={backButtonStyle}
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <div
            style={{
              textAlign: "right",
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: 900,
                letterSpacing: "0.1em",
                color: "#0284c7",
                textTransform: "uppercase",
              }}
            >
              {displayValue(loan.product)} UBL Loan Profile
            </div>

            <h1
              style={{
                margin: "8px 0 12px",
                fontSize: "clamp(24px, 3vw, 38px)",
                fontWeight: 900,
                color: "#0f172a",
                overflowWrap: "anywhere",
              }}
            >
              {customerName}
            </h1>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <span
                style={{
                  background: "#e2e8f0",
                  borderRadius: "8px",
                  padding: "7px 12px",
                  fontSize: "13px",
                  fontWeight: 800,
                  color: "#334155",
                }}
              >
                {pageLan}
              </span>

              <StatusPill value={loan.status} />

              <button
                type="button"
                title="Refresh Details"
                onClick={() => setRefreshKey((previous) => previous + 1)}
                style={{
                  ...backButtonStyle,
                  padding: "8px 11px",
                }}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ============================= */}
        {/* LOAN SUMMARY */}
        {/* ============================= */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
            gap: "20px",
            marginBottom: "26px",
          }}
        >
          <SummaryCard label="Sanctioned Loan Limit" value={loan.loan_limit} />

          <SummaryCard
            label="Utilized Amount"
            value={loan.utilized_amount}
            color="#d97706"
          />

          <SummaryCard
            label="Available Limit"
            value={loan.unutilized_amount}
            color="#15803d"
          />
        </div>

        {/* ============================= */}
        {/* MAIN DETAILS SECTIONS */}
        {/* ============================= */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "24px",
          }}
        >
          {/* APPLICANT INFORMATION */}

          <Section title="Applicant Information" icon={UserRound}>
            <Grid>
              <Field label="Customer Name" value={customerName} highlight />

              <Field label="First Name" value={loan.first_name} />

              <Field label="Last Name" value={loan.last_name} />

              <Field label="Mobile Number" value={loan.mobile_number} />

              <Field label="Email Address" value={loan.email} />

              <Field
                label="Date of Birth"
                value={formatDate(loan.date_of_birth)}
              />

              <Field
                label="PAN Number"
                value={maskSensitive(loan.pan_number)}
              />

              <Field
                label="Aadhaar Number"
                value={maskSensitive(loan.aadhaar_number)}
              />
            </Grid>
          </Section>

          {/* LOAN & FINANCIAL INFORMATION */}

          <Section title="Loan & Financial Information" icon={Wallet}>
            <Grid>
              <Field label="Database ID" value={loan.id} />

              <Field label="Loan Account Number" value={loan.lan} highlight />

              <Field label="Product" value={loan.product} />

              <Field label="Lender" value={loan.lender} />

              <Field label="Current Status" value={loan.status} isStatus />

              <Field
                label="Sanctioned Loan Limit"
                value={formatCurrency(loan.loan_limit)}
                highlight
              />

              <Field
                label="Utilized Amount"
                value={formatCurrency(loan.utilized_amount)}
              />

              <Field
                label="Unutilized Amount"
                value={formatCurrency(loan.unutilized_amount)}
              />

              <Field
                label="Loan Tenure"
                value={formatTenure(loan.tenure_months)}
              />

              <Field
                label="Interest Rate"
                value={formatPercent(loan.interest_rate)}
              />

              <Field
                label="Processing Fee"
                value={formatCurrency(loan.processing_fee)}
              />
            </Grid>
          </Section>

          {/* BUSINESS DETAILS */}

          <Section title="Business Information" icon={Building2}>
            <Grid>
              <Field
                label="Business Name"
                value={loan.business_name}
                highlight
              />

              <Field label="Industry" value={loan.industry} />

              <Field label="GST Number" value={loan.gst_number} />

              <Field
                label="Udyam Registration Number"
                value={loan.udyam_number}
              />
            </Grid>
          </Section>

          {/* BANK DETAILS */}

          <Section title="Bank Details" icon={Landmark}>
            <Grid>
              <Field
                label="Account Holder Name"
                value={loan.account_holder_name}
              />

              <Field label="Bank Name" value={loan.bank_name} />

              <Field
                label="Account Number"
                value={maskSensitive(loan.account_number)}
              />

              <Field label="IFSC Code" value={loan.ifsc} />
            </Grid>
          </Section>

          {/* ADDRESS DETAILS */}

          <Section title="Address Information" icon={MapPin}>
            <Grid>
              <Field label="Permanent Address" value={loan.permanent_address} />

              <Field label="Business Address" value={loan.business_address} />
            </Grid>
          </Section>
        </div>

        {/* ============================= */}
        {/* FOOTER */}
        {/* ============================= */}

        <div
          style={{
            marginTop: "30px",
            padding: "20px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "10px",
            color: "#94a3b8",
            fontSize: "12px",
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          
  
        </div>
      </div>
    </div>
  );
};

export default SterlionMexonDexonLoanDetails;
