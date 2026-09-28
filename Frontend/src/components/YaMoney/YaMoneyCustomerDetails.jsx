import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeIndianRupee,
  BriefcaseBusiness,
  ClipboardList,
  Landmark,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import api from "../../api/api";

const isPresent = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const formatDate = (value) => {
  if (!isPresent(value)) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatAmount = (value) => {
  if (!isPresent(value)) return "-";

  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;

  return `Rs. ${amount.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
};

const normalizeStatus = (value) =>
  String(value || "Pending")
    .trim()
    .replace(/_/g, " ")
    .toUpperCase();

const YaMoneyCustomerDetails = () => {
  const [searchParams] = useSearchParams();
  const lan = searchParams.get("lan") || "";
  const navigate = useNavigate();

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let off = false;

    const fetchDetails = async () => {
      if (!lan) {
        setErr("LAN is required.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErr("");

        const res = await api.get(
          `/loan-booking/yaMoney/customer-details/${encodeURIComponent(lan)}`,
        );

        if (!off) {
          setDetails(res.data?.data || null);
        }
      } catch (error) {
        console.error("Failed to fetch Ya Money customer details:", error);

        if (!off) {
          setErr(
            error.response?.data?.message || "Failed to fetch customer details.",
          );
        }
      } finally {
        if (!off) setLoading(false);
      }
    };

    fetchDetails();

    return () => {
      off = true;
    };
  }, [lan]);

  const model = useMemo(() => {
    const loan = details?.loan || {};
    const kyc = Array.isArray(details?.kyc) ? details.kyc[0] || {} : {};
    const payout = details?.latest_payout || {};
    const cibil = details?.latest_cibil_report || {};
    const utr = details?.disbursement_utr || {};
    const aml = details?.aml || {};

    return {
      loan,
      kyc,
      payout,
      cibil,
      utr,
      aml,
    };
  }, [details]);

  if (loading) {
    return (
      <div style={styles.loadingShell}>
        <div style={styles.spinner} />
        <style>{`
          @keyframes yamoney-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (err) {
    return (
      <div style={styles.emptyShell}>
        <button style={styles.backButton} onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
          Back
        </button>
        <p style={styles.errorText}>{err}</p>
      </div>
    );
  }

  if (!details) {
    return (
      <div style={styles.emptyShell}>
        <button style={styles.backButton} onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
          Back
        </button>
        <p style={styles.mutedText}>No Ya Money customer details found.</p>
      </div>
    );
  }

  const { loan, kyc, payout, cibil, utr, aml } = model;

  const sections = [
    {
      title: "Applicant",
      icon: UserRound,
      fields: [
        ["LAN", loan.lan, true],
        ["Partner Loan ID", loan.partner_loan_id],
        ["Customer Name", loan.customer_name],
        ["Mobile Number", loan.mobile_number],
        ["Email", loan.email],
        ["DOB", formatDate(loan.dob)],
        ["Age", loan.age],
        ["Annual Income", formatAmount(loan.annual_income)],
        ["PAN Number", loan.pan_number],
        ["Aadhaar Number", loan.aadhaar_number],
      ],
    },
    {
      title: "Customer Address",
      icon: ClipboardList,
      fields: [
        ["Address", loan.customer_address, true],
        ["City", loan.customer_city],
        ["State", loan.customer_state],
        ["Pincode", loan.customer_pincode],
      ],
    },
    {
      title: "Business",
      icon: BriefcaseBusiness,
      fields: [
        ["Business Name", loan.business_name, true],
        ["Business Type", loan.business_type],
        ["GST Number", loan.gst_number],
        ["Udyam Number", loan.udyam_number],
        ["Business Address", loan.business_address],
        ["City", loan.business_city],
        ["State", loan.business_state],
        ["Pincode", loan.business_pincode],
      ],
    },
    {
      title: "Loan And Credit",
      icon: BadgeIndianRupee,
      fields: [
        ["Current Status", loan.status, true, true],
        ["Stage", loan.stage, false, true],
        ["Product", loan.product],
        ["Lender", loan.lender],
        ["Loan Type", loan.loan_type],
        ["Login Date", formatDate(loan.login_date)],
        ["Sanction Date", formatDate(loan.sanction_date)],
        ["Requested Amount", formatAmount(loan.requested_amount), true],
        ["Loan Amount", formatAmount(loan.loan_amount), true],
        ["Net Disbursement", formatAmount(loan.net_disbursement), true],
        ["Tenure", isPresent(loan.loan_tenure) ? `${loan.loan_tenure} months` : "-"],
        ["Interest", isPresent(loan.interest) ? `${loan.interest}%` : "-"],
        ["EMI Amount", formatAmount(loan.emi_amount)],
        ["Processing Fee", formatAmount(loan.processing_fee)],
        ["Insurance Amount", formatAmount(loan.insurance_amount)],
        ["Pre EMI Interest", formatAmount(loan.pre_emi_interest)],
        ["BRE Reason", loan.bre_reason],
        ["CIBIL Score", loan.cibil_score || cibil.score],
      ],
    },
    {
      title: "Bank Details",
      icon: Landmark,
      fields: [
        ["Name In Bank", loan.name_in_bank, true],
        ["Bank Name", loan.bank_name],
        ["Account Number", loan.account_number],
        ["IFSC", loan.ifsc],
        ["UMRN", loan.umrn],
      ],
    },
    {
      title: "Payout",
      icon: BadgeIndianRupee,
      fields: [
        ["Payout Status", payout.payout_status || payout.status, false, true],
        ["Unique Request No.", payout.unique_request_number],
        ["Payout Amount", formatAmount(payout.amount)],
        ["Payout UTR", payout.utr],
        ["Transfer Date", formatDate(payout.transfer_date)],
        ["Failure Reason", payout.failure_reason],
        ["Disbursement UTR", utr.Disbursement_UTR || utr.disbursement_utr],
        ["Disbursement Date", formatDate(utr.Disbursement_Date || utr.disbursement_date)],
      ],
    },
    {
      title: "KYC And Bureau",
      icon: ShieldCheck,
      fields: [
        ["PAN Status", kyc.pan_status, false, true],
        ["Aadhaar Status", kyc.aadhaar_status, false, true],
        ["Bureau Status", kyc.bureau_status, false, true],
        ["Bureau Report Score", cibil.score],
        ["Bureau PAN", cibil.pan_number],
        ["Report Created", formatDate(cibil.created_at)],
      ],
    },
    {
      title: "AML Screening",
      icon: ShieldCheck,
      fields: [
        ["AML Status", aml.status || loan.aml_status, false, true],
        ["Screening Status", aml.screening_status, false, true],
        ["AML Score", aml.score ?? loan.aml_score],
        ["Total Matches", aml.total_matches ?? loan.aml_total_matches],
        ["Reason", aml.reason || loan.aml_reason, true],
        ["Checked At", formatDate(aml.checked_at || loan.aml_checked_at)],
        ["Report Stored", aml.report_stored ? "Yes" : aml.screening_request_id ? "No" : "-"],
        ["Screening Request ID", aml.screening_request_id],
        ["Error", aml.error_message],
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <button style={styles.backButton} onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
            Back
          </button>

          <div style={styles.headerText}>
            <span style={styles.eyebrow}>Ya Money Customer Details</span>
            <h1 style={styles.title}>{loan.customer_name || loan.lan || lan}</h1>
            <div style={styles.headerMeta}>
              <span style={styles.metaBadge}>{loan.lan || lan}</span>
              <StatusPill value={loan.status} />
            </div>
          </div>
        </header>

        <main style={styles.gridStack}>
          {sections.map((section) => (
            <Section key={section.title} title={section.title} icon={section.icon}>
              <FieldGrid>
                {section.fields.map(([label, value, highlight, isStatus]) => (
                  <Field
                    key={label}
                    label={label}
                    value={value}
                    highlight={highlight}
                    isStatus={isStatus}
                  />
                ))}
              </FieldGrid>
            </Section>
          ))}
        </main>
      </div>
    </div>
  );
};

const Section = ({ title, icon, children }) => (
  <section style={styles.section}>
    <div style={styles.sectionHeader}>
      <span style={styles.sectionIcon}>
        {React.createElement(icon, { size: 20 })}
      </span>
      <h2 style={styles.sectionTitle}>{title}</h2>
    </div>
    {children}
  </section>
);

const FieldGrid = ({ children }) => <div style={styles.fieldGrid}>{children}</div>;

const Field = ({ label, value, highlight, isStatus }) => (
  <div style={styles.field}>
    <label style={styles.label}>{label}</label>
    {isStatus ? (
      <StatusPill value={value} />
    ) : (
      <strong style={highlight ? styles.highlightValue : styles.value}>
        {isPresent(value) ? value : "-"}
      </strong>
    )}
  </div>
);

const StatusPill = ({ value }) => {
  const status = normalizeStatus(value);
  const palette = getStatusPalette(status);

  return (
    <span
      style={{
        ...styles.statusPill,
        background: palette.background,
        borderColor: palette.border,
        color: palette.color,
      }}
    >
      {status}
    </span>
  );
};

function getStatusPalette(status) {
  if (
    [
      "APPROVED",
      "BRE APPROVED",
      "BRE_APPROVED",
      "CREDIT APPROVED",
      "DISBURSED",
      "SUCCESS",
      "VERIFIED",
      "PAID",
      "PROCEED",
      "COMPLETED",
    ].includes(status)
  ) {
    return {
      background: "#dcfce7",
      border: "#bbf7d0",
      color: "#166534",
    };
  }

  if (
    [
      "REJECTED",
      "BRE REJECTED",
      "CREDIT REJECTED",
      "OPS REJECTED",
      "AML REJECTED",
      "STOP",
      "ERROR",
      "FAILED",
    ].includes(status)
  ) {
    return {
      background: "#fee2e2",
      border: "#fecaca",
      color: "#991b1b",
    };
  }

  if (
    [
      "INITIATED",
      "PENDING",
      "PROCESSING",
      "OPS INITIATE",
      "AML REVIEW",
      "REVIEW",
    ].includes(status)
  ) {
    return {
      background: "#fef9c3",
      border: "#fde68a",
      color: "#854d0e",
    };
  }

  return {
    background: "#eef2ff",
    border: "#c7d2fe",
    color: "#3730a3",
  };
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    padding: "32px 20px",
    color: "#0f172a",
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  shell: {
    maxWidth: 1280,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 24,
    alignItems: "flex-start",
    marginBottom: 28,
  },
  backButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    height: 42,
    padding: "0 14px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#334155",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  headerText: {
    textAlign: "right",
    minWidth: 0,
  },
  eyebrow: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  title: {
    margin: "6px 0 10px",
    fontSize: 34,
    lineHeight: 1.15,
    fontWeight: 900,
    letterSpacing: 0,
    color: "#0f172a",
  },
  headerMeta: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  metaBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 30,
    borderRadius: 8,
    padding: "5px 10px",
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    color: "#475569",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 12,
    fontWeight: 800,
  },
  gridStack: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 18,
  },
  section: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 22,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 18,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    color: "#172033",
    letterSpacing: 0,
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: "18px 22px",
  },
  field: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },
  label: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  value: {
    color: "#1e293b",
    fontSize: 15,
    fontWeight: 750,
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  highlightValue: {
    color: "#1d4ed8",
    fontSize: 16,
    fontWeight: 900,
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  statusPill: {
    width: "fit-content",
    minHeight: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    border: "1px solid",
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1.1,
  },
  loadingShell: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f8fafc",
  },
  spinner: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    border: "5px solid #dbeafe",
    borderTopColor: "#1d4ed8",
    animation: "yamoney-spin 0.9s linear infinite",
  },
  emptyShell: {
    minHeight: "100vh",
    background: "#f8fafc",
    padding: 32,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 18,
    fontWeight: 800,
  },
  mutedText: {
    color: "#64748b",
    fontSize: 18,
    fontWeight: 700,
  },
};

export default YaMoneyCustomerDetails;
