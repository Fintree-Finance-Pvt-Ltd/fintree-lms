import React, { useEffect, useState } from "react";
import {
  useParams,
  useNavigate,
} from "react-router-dom";
import api from "../../api/api";

const ClaimBuddyApprovedLoanDetails = () => {
  const { lan } = useParams();
  const navigate = useNavigate();

  const [details, setDetails] =
    useState(null);

  const [err, setErr] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        setErr("");

        const res = await api.get(
          `/claim-buddy/loan-info/${encodeURIComponent(
            lan
          )}`
        );

        setDetails(res.data);
      } catch (e) {
        console.error(
          "Failed to fetch Claim Buddy loan details:",
          e
        );

        setErr(
          e.response?.data?.message ||
            "Failed to fetch loan details."
        );
      } finally {
        setLoading(false);
      }
    };

    if (lan) {
      fetchDetails();
    }
  }, [lan]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <div
          style={{
            width: "60px",
            height: "60px",
            border:
              "6px solid #f3f3f3",
            borderTop:
              "6px solid #0ea5e9",
            borderRadius: "50%",
            animation:
              "spin 1s linear infinite",
          }}
        />

        <style>{`
          @keyframes spin {
            0% {
              transform: rotate(0deg);
            }

            100% {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  if (err) {
    return (
      <p
        style={{
          padding: 40,
          fontSize: "20px",
          color: "#dc2626",
          fontWeight: 700,
        }}
      >
        {err}
      </p>
    );
  }

  if (!details?.loan) {
    return (
      <p
        style={{
          padding: 40,
          fontSize: "20px",
          color: "#6b7280",
        }}
      >
        No Claim Buddy loan details
        found.
      </p>
    );
  }

  const loan = details.loan;
  const kyc = details.kyc || {};

  const insurance =
    loan.insurance_details || {};

  const formatDate = (value) => {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (
      Number.isNaN(date.getTime())
    ) {
      return value;
    }

    return date.toLocaleDateString(
      "en-GB",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }
    );
  };

  return (
    <div
      style={{
        background: "#f1f5f9",
        minHeight: "100vh",
        padding: "50px 25px",
        fontFamily:
          "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1300px",
          margin: "0 auto",
        }}
      >
        {/* HEADER */}

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "flex-end",
            marginBottom: "40px",
          }}
        >
          <button
            onClick={() =>
              navigate(-1)
            }
            style={{
              padding: "14px 28px",
              background: "#ffffff",
              color: "#334155",
              border:
                "2px solid #e2e8f0",
              borderRadius: "12px",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: 700,
              boxShadow:
                "0 4px 6px -1px rgba(0,0,0,0.1)",
            }}
          >
            ← Back
          </button>

          <div
            style={{
              textAlign: "right",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                color: "#64748b",
                fontWeight: 800,
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.1em",
              }}
            >
              Claim Buddy Digital Loan
              Profile
            </span>

            <h1
              style={{
                margin:
                  "8px 0 0 0",
                color: "#0f172a",
                fontSize: "42px",
                fontWeight: 900,
                letterSpacing:
                  "-0.02em",
              }}
            >
              {loan.customer_name ||
                lan}
            </h1>
          </div>
        </div>

        {/* SECTIONS */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr",
            gap: "35px",
          }}
        >
          {/* APPLICATION SUMMARY */}

          <SectionCard
            title="Application Summary"
            icon="📋"
          >
            <Grid>
              <Field
                label="LAN"
                value={loan.lan}
                highlight
              />

              <Field
                label="Application ID"
                value={loan.app_id}
              />

              <Field
                label="Hospital Name"
                value={
                  loan.hospital_name
                }
              />

              <Field
                label="Login Date"
                value={formatDate(
                  loan.login_date
                )}
              />

              <Field
                label="Current Status"
                value={loan.status}
                isStatus
              />

              <Field
                label="Stage"
                value={loan.stage}
              />

              <Field
                label="Customer Name"
                value={
                  loan.customer_name
                }
              />

              <Field
                label="Mobile Number"
                value={
                  loan.mobile_number
                }
              />

              <Field
                label="Email Address"
                value={loan.email_id}
              />

              <Field
                label="Date of Birth"
                value={formatDate(
                  loan.dob
                )}
              />

              <Field
                label="Gender"
                value={loan.gender}
              />

              <Field
                label="Patient Name"
                value={
                  loan.patient_name
                }
              />

              <Field
                label="PAN Number"
                value={loan.pan_number}
              />

              <Field
                label="Father Name"
                value={
                  loan.father_name
                }
              />

              <Field
                label="Mother Name"
                value={
                  loan.mother_name
                }
              />
            </Grid>
          </SectionCard>

          {/* FINANCIAL MATRIX */}

          <SectionCard
            title="Financial Matrix"
            icon="💳"
          >
            <Grid>
              <Field
                label="Final Approved Limit"
                value={
                  loan.final_limit
                }
                highlight
              />

              <Field
                label="Approved Limit"
                value={
                  loan.approved_limit
                }
              />

              <Field
                label="Subvention Percentage"
                value={
                  loan.subvention_percent !=
                  null
                    ? `${loan.subvention_percent}%`
                    : "—"
                }
              />

              <Field
                label="Updated Subvention"
                value={
                  loan.updated_subvention !=
                  null
                    ? `${loan.updated_subvention}%`
                    : "—"
                }
              />

              <Field
                label="Processing Fee %"
                value={
                  loan.pf_percent !=
                  null
                    ? `${loan.pf_percent}%`
                    : "—"
                }
              />

              <Field
                label="Requested Loan Amount"
                value={
                  loan.loan_amount
                }
              />

              <Field
                label="Repayment Tenure"
                value={
                  loan.loan_tenure
                }
              />

              <Field
                label="Interest Rate"
                value={
                  loan.interest_rate !=
                  null
                    ? `${loan.interest_rate}%`
                    : "—"
                }
              />

              <Field
                label="EMI Amount"
                value={loan.emi_amount}
              />

              <Field
                label="Net Monthly Income"
                value={
                  loan.net_monthly_income
                }
              />

              <Field
                label="CIBIL Score"
                value={
                  loan.cibil_score
                }
              />
            </Grid>
          </SectionCard>

          {/* CONTACT */}

          <SectionCard
            title="Contact & Residence Details"
            icon="🏠"
          >
            <Grid>
              <Field
                label="Current Residential Address"
                value={
                  loan.current_address
                }
              />

              <Field
                label="Current City"
                value={
                  loan.current_village_city
                }
              />

              <Field
                label="Current District"
                value={
                  loan.current_district
                }
              />

              <Field
                label="Current State"
                value={
                  loan.current_state
                }
              />

              <Field
                label="Current Pincode"
                value={
                  loan.current_pincode
                }
              />

              <Field
                label="Permanent Residential Address"
                value={
                  loan.permanent_address
                }
              />

              <Field
                label="Permanent City"
                value={
                  loan.permanent_village_city
                }
              />

              <Field
                label="Permanent District"
                value={
                  loan.permanent_district
                }
              />

              <Field
                label="Permanent State"
                value={
                  loan.permanent_state
                }
              />

              <Field
                label="Permanent Pincode"
                value={
                  loan.permanent_pincode
                }
              />
            </Grid>
          </SectionCard>

          {/* BANK */}

          <SectionCard
            title="Bank Details"
            icon="🏦"
          >
            <Grid>
              <Field
                label="Bank Name"
                value={loan.bank_name}
              />

              <Field
                label="Account Holder Name"
                value={
                  loan.name_in_bank
                }
              />

              <Field
                label="Account Number"
                value={
                  loan.account_number
                }
              />

              <Field
                label="IFSC"
                value={loan.ifsc}
              />

              <Field
                label="Branch"
                value={
                  loan.bank_branch
                }
              />

              <StatusField
                label="Bank Status"
                value={
                  loan.bank_status ||
                  kyc.bank_status
                }
              />

              <Field
                label="e-NACH UMRN"
                value={
                  loan.enach_umrn
                }
              />
            </Grid>
          </SectionCard>

          {/* VERIFICATION */}

          <SectionCard
            title="Verification Pipeline"
            icon="🛡️"
          >
            <Grid>
              <StatusField
                label="PAN Verification"
                value={
                  kyc.pan_status
                }
              />

              <StatusField
                label="Aadhaar KYC"
                value={
                  kyc.aadhaar_status
                }
              />

              <StatusField
                label="Credit Bureau"
                value={
                  kyc.bureau_status
                }
              />

              <StatusField
                label="AML"
                value={
                  kyc.aml_status
                }
              />

              <StatusField
                label="Digital Agreement"
                value={
                  kyc.agreement_esign_status
                }
              />

              <StatusField
                label="Bank e-NACH"
                value={
                  kyc.bank_status
                }
              />
            </Grid>
          </SectionCard>

          {/* INSURANCE */}

          <SectionCard
            title="Insurance Details"
            icon="🩺"
          >
            <Grid>
              <Field
                label="Insurance Company"
                value={
                  loan.insurance_company_name ||
                  insurance.insurance_provider
                }
              />

              <Field
                label="Policy Holder Name"
                value={
                  loan.insurance_policy_holder_name ||
                  insurance.policy_holder_name
                }
              />

              <Field
                label="Policy Number"
                value={
                  loan.insurance_policy_number ||
                  insurance.policy_number
                }
              />

              <Field
                label="Relation With Policy Holder"
                value={
                  loan.relation_with_policy_holder
                }
              />

              <Field
                label="Insurance Cost"
                value={
                  insurance.insurance_cost
                }
              />

              <Field
                label="Policy Issued Date"
                value={formatDate(
                  insurance.policy_issued_date
                )}
              />

              <Field
                label="Period Of Insurance"
                value={
                  insurance.period_of_insurance
                }
              />

              <Field
                label="Submitted"
                value={
                  insurance.submitted
                    ? "YES"
                    : "NO"
                }
              />
            </Grid>
          </SectionCard>

          {/* LOAN DETAILS */}

          <SectionCard
            title="Loan Details"
            icon="💰"
          >
            <Grid>
              <Field
                label="Loan Amount"
                value={
                  loan.loan_amount
                }
              />

              <Field
                label="Tenure"
                value={
                  loan.loan_tenure
                }
              />

              <Field
                label="Interest Rate"
                value={
                  loan.interest_rate
                }
              />

              <Field
                label="Policy Type"
                value={
                  loan.policy_type
                }
              />

              <Field
                label="Employment"
                value={
                  loan.employment_type
                }
              />

              <Field
                label="Net Monthly Income"
                value={
                  loan.net_monthly_income
                }
              />

              <Field
                label="Disbursed At"
                value={formatDate(
                  loan.disbursed_at
                )}
              />
            </Grid>
          </SectionCard>

          {/* LIMIT / OPS */}

          <SectionCard
            title="Limit & Operations"
            icon="📊"
          >
            <Grid>
              <Field
                label="Final Limit"
                value={
                  loan.final_limit
                }
              />

              <Field
                label="Approved Limit"
                value={
                  loan.approved_limit
                }
              />

              <Field
                label="Limit Assigned At"
                value={formatDate(
                  loan.limit_assigned_at
                )}
              />

              <Field
                label="Limit Assigned By"
                value={
                  loan.limit_assigned_by
                }
              />

              <Field
                label="OPS Approved At"
                value={formatDate(
                  loan.ops_approved_at
                )}
              />

              <Field
                label="OPS Approved By"
                value={
                  loan.ops_approved_by
                }
              />

              <Field
                label="Limit Rework Required"
                value={
                  Number(
                    loan.limit_rework_required
                  ) === 1
                    ? "YES"
                    : Number(
                          loan.limit_rework_required
                        ) === 0
                      ? "NO"
                      : "—"
                }
              />

              <Field
                label="Limit Rework Reason"
                value={
                  loan.limit_rework_reason
                }
              />
            </Grid>
          </SectionCard>

          {/* BRE */}

          <SectionCard
            title="Risk Analysis & Decisioning"
            icon="⚖️"
          >
            <Grid>
              <Field
                label="Engine (BRE) Status"
                value={
                  loan.claim_buddy_bre_status
                }
              />

              <Field
                label="Calculated Bureau Score"
                value={
                  loan.claim_buddy_bureau_score
                }
              />

              <Field
                label="Rejection / Approval Reason"
                value={
                  loan.claim_buddy_bre_reason
                }
              />

              <Field
                label="Recent Enquiries (30 Days)"
                value={
                  loan.claim_buddy_enquiries_30d
                }
              />

              <FlagField
                label="DPD Record (3M)"
                value={
                  loan.claim_buddy_dpd_3m_flag
                }
              />

              <Field
                label="30+ DPD (12M)"
                value={
                  loan.claim_buddy_dpd_12m_count
                }
              />

              <FlagField
                label="60+ DPD (24M)"
                value={
                  loan.claim_buddy_dpd_24m_60_flag
                }
              />

              <FlagField
                label="90+ DPD (36M)"
                value={
                  loan.claim_buddy_dpd_36m_90_flag
                }
              />

              <FlagField
                label="Active Overdue"
                value={
                  loan.claim_buddy_overdue_flag
                }
              />

              <FlagField
                label="Written Off"
                value={
                  loan.claim_buddy_writtenoff_flag
                }
              />

              <FlagField
                label="Moratorium"
                value={
                  loan.claim_buddy_moratorium_flag
                }
              />

              <FlagField
                label="Restructured"
                value={
                  loan.claim_buddy_restructured_flag
                }
              />
            </Grid>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

export default ClaimBuddyApprovedLoanDetails;

/* ===============================
   COMPONENTS
================================ */

const SectionCard = ({
  title,
  icon,
  children,
}) => (
  <div
    style={{
      background: "#ffffff",
      borderRadius: "24px",
      padding: "40px",
      boxShadow:
        "0 10px 15px -3px rgba(0,0,0,0.04), 0 4px 6px -2px rgba(0,0,0,0.02)",
      border:
        "1px solid #e2e8f0",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "15px",
        marginBottom: "30px",
      }}
    >
      <span
        style={{
          fontSize: "28px",
        }}
      >
        {icon}
      </span>

      <h3
        style={{
          margin: 0,
          color: "#1e293b",
          fontSize: "22px",
          fontWeight: 800,
          textTransform:
            "uppercase",
          letterSpacing:
            "0.02em",
        }}
      >
        {title}
      </h3>
    </div>

    {children}
  </div>
);

const Grid = ({ children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns:
        "repeat(auto-fill, minmax(280px, 1fr))",
      gap: "30px",
    }}
  >
    {children}
  </div>
);

const Field = ({
  label,
  value,
  highlight,
  isStatus,
}) => {
  const statusColors = {
    LOGIN: {
      bg: "#fef08a",
      text: "#713f12",
    },

    "BRE APPROVED": {
      bg: "#bbf7d0",
      text: "#14532d",
    },

    "CREDIT APPROVED": {
      bg: "#bbf7d0",
      text: "#14532d",
    },

    "LIMIT REQUESTED": {
      bg: "#e0f2fe",
      text: "#075985",
    },

    "OPS APPROVED": {
      bg: "#dcfce7",
      text: "#166534",
    },

    "DISBURSEMENT INITIATED": {
      bg: "#dbeafe",
      text: "#1e40af",
    },

    DISBURSED: {
      bg: "#dcfce7",
      text: "#166534",
    },

    "BRE FAILED": {
      bg: "#fecaca",
      text: "#7f1d1d",
    },

    REJECTED: {
      bg: "#fecaca",
      text: "#7f1d1d",
    },

    "CREDIT RECHECK": {
      bg: "#ffedd5",
      text: "#9a3412",
    },
  };

  const normalized =
    String(value || "")
      .trim()
      .toUpperCase();

  const status =
    statusColors[normalized] || {
      bg: "#f1f5f9",
      text: "#475569",
    };

  return (
    <div
      style={{
        display: "flex",
        flexDirection:
          "column",
        gap: "8px",
      }}
    >
      <label
        style={{
          fontSize: "12px",
          color: "#94a3b8",
          fontWeight: 800,
          textTransform:
            "uppercase",
          letterSpacing:
            "0.08em",
        }}
      >
        {label}
      </label>

      {isStatus ? (
        <span
          style={{
            padding:
              "8px 18px",
            borderRadius:
              "10px",
            fontSize: "15px",
            fontWeight: 800,
            background:
              status.bg,
            color:
              status.text,
            width:
              "fit-content",
          }}
        >
          {value || "PENDING"}
        </span>
      ) : (
        <div
          style={{
            fontSize: "18px",
            fontWeight:
              highlight
                ? 900
                : 700,
            color:
              highlight
                ? "#0284c7"
                : "#1e293b",
            wordBreak:
              "break-word",
            lineHeight: "1.4",
          }}
        >
          {value === null ||
          value === undefined ||
          value === ""
            ? "—"
            : value}
        </div>
      )}
    </div>
  );
};

const StatusField = ({
  label,
  value,
}) => {
  const colors = {
    VERIFIED: {
      bg: "#dcfce7",
      color: "#166534",
    },

    SUCCESS: {
      bg: "#dcfce7",
      color: "#166534",
    },

    SIGNED: {
      bg: "#dcfce7",
      color: "#166534",
    },

    MANDATE_CREATED: {
      bg: "#dcfce7",
      color: "#166534",
    },

    FAILED: {
      bg: "#fee2e2",
      color: "#991b1b",
    },

    REJECTED: {
      bg: "#fee2e2",
      color: "#991b1b",
    },

    INITIATED: {
      bg: "#e0f2fe",
      color: "#075985",
    },

    PENDING: {
      bg: "#fefce8",
      color: "#854d0e",
    },
  };

  const normalized =
    String(
      value || "PENDING"
    ).toUpperCase();

  const selected =
    colors[normalized] || {
      bg: "#f8fafc",
      color: "#64748b",
    };

  return (
    <div
      style={{
        display: "flex",
        flexDirection:
          "column",
        gap: "8px",
      }}
    >
      <label
        style={{
          fontSize: "12px",
          color: "#94a3b8",
          fontWeight: 800,
          textTransform:
            "uppercase",
          letterSpacing:
            "0.08em",
        }}
      >
        {label}
      </label>

      <div
        style={{
          display:
            "inline-flex",
          padding:
            "6px 14px",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: 800,
          background:
            selected.bg,
          color:
            selected.color,
          width:
            "fit-content",
        }}
      >
        {value || "PENDING"}
      </div>
    </div>
  );
};

const FlagField = ({
  label,
  value,
}) => {
  const isYes =
    Number(value) === 1;

  const isNo =
    Number(value) === 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection:
          "column",
        gap: "8px",
      }}
    >
      <label
        style={{
          fontSize: "12px",
          color: "#94a3b8",
          fontWeight: 800,
          textTransform:
            "uppercase",
          letterSpacing:
            "0.08em",
        }}
      >
        {label}
      </label>

      <div
        style={{
          fontSize: "16px",
          fontWeight: 800,
        }}
      >
        {isYes && (
          <span
            style={{
              color:
                "#16a34a",
              background:
                "#f0fdf4",
              padding:
                "4px 10px",
              borderRadius:
                "6px",
            }}
          >
            ● Yes
          </span>
        )}

        {isNo && (
          <span
            style={{
              color:
                "#64748b",
              background:
                "#f8fafc",
              padding:
                "4px 10px",
              borderRadius:
                "6px",
            }}
          >
            ○ No
          </span>
        )}

        {!isYes &&
          !isNo && (
            <span
              style={{
                color:
                  "#cbd5e1",
              }}
            >
              N/A
            </span>
          )}
      </div>
    </div>
  );
};