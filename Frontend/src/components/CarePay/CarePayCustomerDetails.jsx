import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeIndianRupee,
  Building2,
  ClipboardCheck,
  FileSignature,
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
    .toUpperCase();

const CarePayCustomerDetails = () => {
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
          `/carepay/customer-details/${encodeURIComponent(lan)}`,
        );

        if (!off) {
          setDetails(res.data?.data || null);
        }
      } catch (error) {
        console.error("Failed to fetch CarePay customer details:", error);

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
    const hospital = details?.hospital || {};
    const bre = details?.bre || {};
    const esign = details?.esign || {};
    const latestAgreement = esign.latest_agreement || esign.latest || {};
    const bankVerification = details?.bank_verification || {};
    const kyc = Array.isArray(details?.kyc) ? details.kyc[0] || {} : {};

    return {
      loan,
      hospital,
      bre,
      latestAgreement,
      bankVerification,
      kyc,
    };
  }, [details]);

  if (loading) {
    return (
      <div style={styles.loadingShell}>
        <div style={styles.spinner} />
        <style>{`
          @keyframes carepay-spin {
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
        <p style={styles.mutedText}>No CarePay customer details found.</p>
      </div>
    );
  }

  const {
    loan,
    hospital,
    bre,
    latestAgreement,
    bankVerification,
    kyc,
  } = model;

  const breDecision = bre.decision || {};
  const breComputed = bre.computed || {};
  const brePolicy = bre.policy || {};

  const sections = [
    {
      title: "Applicant",
      icon: UserRound,
      fields: [
        ["LAN", loan.lan, true],
        ["Partner Loan ID", loan.partner_loan_id],
        ["Customer Name", loan.customer_name],
        ["First Name", loan.first_name],
        ["Middle Name", loan.middle_name],
        ["Last Name", loan.last_name],
        ["Mobile Number", loan.mobile_number],
        ["Email", loan.email_id],
        ["DOB", formatDate(loan.dob)],
        ["Gender", loan.gender],
        ["Age", loan.age],
        ["PAN Number", loan.pan_number],
        ["Aadhaar Number", loan.aadhar_number],
        ["Father Name", loan.father_name],
        ["Mother Name", loan.mother_name],
        ["Employment", loan.employment],
        ["Customer Type", loan.customer_type],
        ["Annual Income", formatAmount(loan.annual_income)],
      ],
    },
    {
      title: "Loan",
      icon: BadgeIndianRupee,
      fields: [
        ["Current Status", loan.status, true, true],
        ["Product", loan.product],
        ["Lender", loan.lender],
        ["Login Date", formatDate(loan.login_date)],
        ["Agreement Date", formatDate(loan.agreement_date)],
        ["Request Amount", formatAmount(loan.request_amount), true],
        ["Loan Amount", formatAmount(loan.loan_amount), true],
        ["Net Disbursement", formatAmount(loan.net_disbursement), true],
        ["Tenure", isPresent(loan.loan_tenure) ? `${loan.loan_tenure} months` : "-"],
        ["Interest Rate", isPresent(loan.interest_rate) ? `${loan.interest_rate}%` : "-"],
        ["EMI Amount", formatAmount(loan.emi_amount)],
        ["Processing Fee", formatAmount(loan.processing_fee)],
        ["Processing Fee %", loan.processing_fee_percentage],
        ["Subvention Amount", formatAmount(loan.subvention_amount)],
        ["Subvention %", loan.subvention_percentage],
        ["CIBIL Score", loan.cibil_score],
        ["Fintree CIBIL", loan.cibil_score_fintree],
      ],
    },
    {
      title: "Hospital",
      icon: Building2,
      fields: [
        ["Hospital LAN", loan.hospital_lan],
        ["Legal Name", hospital.hospital_legal_name],
        ["Brand Name", hospital.brand_name],
        ["Hospital Type", hospital.hospital_type],
        ["City", hospital.registered_city],
        ["District", hospital.registered_district],
        ["State", hospital.registered_state],
        ["Pincode", hospital.registered_pincode],
        ["Hospital Phone", hospital.hospital_phone],
        ["Hospital Email", hospital.hospital_email],
        ["Contact Person", hospital.contact_person_name],
        ["Contact Phone", hospital.contact_person_phone],
        ["Hospital Status", hospital.status, false, true],
      ],
    },
    {
      title: "Patient And Insurance",
      icon: ClipboardCheck,
      fields: [
        ["Patient Name", loan.patient_name],
        ["Insurance Company", loan.insurance_company_name],
        ["Policy Holder", loan.insurance_policy_holder_name],
        ["Policy Number", loan.insurance_policy_number],
        ["Relation With Policy Holder", loan.relation_with_policy_holder],
      ],
    },
    {
      title: "Bank And UMRN",
      icon: Landmark,
      fields: [
        ["Account Holder", loan.bank_account_holder_name],
        ["Account Number", loan.bank_account_number],
        ["Bank Name", loan.bank_name],
        ["Branch", loan.bank_branch_name],
        ["IFSC", loan.bank_ifsc_code],
        ["Account Type", loan.bank_account_type],
        ["Mandate Amount", formatAmount(loan.mandate_amount)],
        ["UMRN", loan.umrn],
        [
          "Bank Verified",
          isPresent(bankVerification.verified)
            ? bankVerification.verified
              ? "Verified"
              : "Failed"
            : "-",
          false,
          true,
        ],
        ["Verified At", formatDate(bankVerification.verified_at)],
        ["Beneficiary Name", bankVerification.bank_beneficiary_name],
      ],
    },
    {
      title: "eSign And KYC",
      icon: FileSignature,
      fields: [
        ["Agreement eSign", loan.agreement_esign_status || latestAgreement.status, false, true],
        ["Sanction eSign", loan.sanction_esign_status, false, true],
        ["Latest Document ID", latestAgreement.document_id],
        ["Signer", latestAgreement.signer_identifier],
        ["PAN Status", kyc.pan_status, false, true],
        ["Aadhaar Status", kyc.aadhaar_status, false, true],
        ["Bureau Status", kyc.bureau_status, false, true],
      ],
    },
    {
      title: "BRE",
      icon: ShieldCheck,
      fields: [
        ["BRE Status", breDecision.status, true, true],
        ["Case Status", breDecision.caseStatus, true, true],
        ["Reason", breDecision.reason],
        ["Age Used", breComputed.age],
        ["Tenure Used", breComputed.tenure],
        ["Amount Used", formatAmount(breComputed.amount)],
        ["Annual Income Used", formatAmount(breComputed.annual_income)],
        ["Bureau Score Used", breComputed.bureau_score],
        ["Min Bureau Score", brePolicy.minBureauScore],
        ["Min Income", formatAmount(brePolicy.minAnnualIncome)],
        ["Amount Range", rangeValue(brePolicy.minAmount, brePolicy.maxAmount, formatAmount)],
        ["Tenure Range", rangeValue(brePolicy.minTenure, brePolicy.maxTenure)],
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
            <span style={styles.eyebrow}>CarePay Customer Details</span>
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

function rangeValue(min, max, formatter = (value) => value) {
  if (!isPresent(min) && !isPresent(max)) return "-";
  return `${formatter(min)} to ${formatter(max)}`;
}

const Section = ({ title, icon: Icon, children }) => (
  <section style={styles.section}>
    <div style={styles.sectionHeader}>
      <span style={styles.sectionIcon}>
        <Icon size={20} />
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
    ["APPROVED", "BRE APPROVED", "SIGNED", "VERIFIED", "SUCCESS", "MANDATE CREATED"].includes(
      status,
    )
  ) {
    return {
      background: "#dcfce7",
      border: "#bbf7d0",
      color: "#166534",
    };
  }

  if (["REJECTED", "FAILED", "OPS_REJECTED"].includes(status)) {
    return {
      background: "#fee2e2",
      border: "#fecaca",
      color: "#991b1b",
    };
  }

  if (["INITIATED", "MANDATE_INITIATED", "PENDING"].includes(status)) {
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
    color: "#0f766e",
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
    background: "#ecfeff",
    color: "#0f766e",
    border: "1px solid #ccfbf1",
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
    color: "#0f766e",
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
    borderTopColor: "#0f766e",
    animation: "carepay-spin 0.9s linear infinite",
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

export default CarePayCustomerDetails;
