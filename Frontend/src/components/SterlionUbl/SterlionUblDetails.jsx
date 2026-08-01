import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/api";

const SterlionUBLDetails = () => {
  const { lan } = useParams();
  const navigate = useNavigate();

  const [loan, setLoan] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    const fetchLoanDetails = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get(
          `/sterlion-ubl/customer-details/${lan}`
        );

        setLoan(response.data.loan);
        setDocuments(response.data.documents || []);
      } catch (err) {
        console.error("Sterlion UBL details fetch error:", err);

        setError(
          err.response?.data?.message ||
          "Failed to fetch Sterlion UBL loan details."
        );
      } finally {
        setLoading(false);
      }
    };

    if (lan) {
      fetchLoanDetails();
    }
  }, [lan]);

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatDateTime = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString("en-GB");
  };

  const formatAmount = (value) => {
    if (
      value === null ||
      value === undefined ||
      value === "" ||
      Number.isNaN(Number(value))
    ) {
      return "—";
    }

    return `₹${Number(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "70vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "55px",
            height: "55px",
            border: "6px solid #e2e8f0",
            borderTop: "6px solid #2563eb",
            borderRadius: "50%",
            animation: "sterlionSpin 1s linear infinite",
          }}
        />

        <style>
          {`
            @keyframes sterlionSpin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "40px" }}>
        <button onClick={() => navigate(-1)} style={backButtonStyle}>
          ← Back
        </button>

        <p
          style={{
            marginTop: "25px",
            color: "#dc2626",
            fontSize: "18px",
            fontWeight: 700,
          }}
        >
          {error}
        </p>
      </div>
    );
  }

  if (!loan) {
    return (
      <div style={{ padding: "40px" }}>
        <button onClick={() => navigate(-1)} style={backButtonStyle}>
          ← Back
        </button>

        <p style={{ marginTop: "25px", color: "#64748b" }}>
          No Sterlion UBL loan details found.
        </p>
      </div>
    );
  }

  const customerName =
    loan.customer_name ||
    `${loan.first_name || ""} ${loan.last_name || ""}`.trim() ||
    "Customer";

  const sections = [
    {
      title: "Applicant Information",
      icon: "👤",
      content: (
        <Grid>
          <Field label="LAN" value={loan.lan} highlight />
          <Field label="Partner Loan ID" value={loan.partner_loan_id} />
          <Field label="Customer Name" value={customerName} />
          <Field label="First Name" value={loan.first_name} />
          <Field label="Last Name" value={loan.last_name} />
          <Field label="Date of Birth" value={formatDate(loan.date_of_birth)} />
          <Field label="Mobile Number" value={loan.mobile_number} />
          <Field label="Email" value={loan.email} />
          <Field label="PAN Number" value={loan.pan_number} />
          <Field label="Aadhaar Number" value={loan.aadhaar_number} />
          <Field label="Lender" value={loan.lender} />
          <Field label="Status" value={loan.status} isStatus />
        </Grid>
      ),
    },
    {
      title: "Loan & Financial Details",
      icon: "💰",
      content: (
        <Grid>
          <Field label="Product" value={loan.product} />
          <Field
            label="Loan Amount"
            value={formatAmount(loan.loan_amount)}
            highlight
          />
          <Field
            label="Tenure"
            value={
              loan.tenure_months
                ? `${loan.tenure_months} Months`
                : "—"
            }
          />
          <Field
            label="Interest Rate"
            value={
              loan.interest_rate !== null &&
                loan.interest_rate !== undefined
                ? `${loan.interest_rate}%`
                : "—"
            }
          />
          <Field
            label="Processing Fee"
            value={formatAmount(loan.processing_fee)}
          />
          <Field label="EMI Amount" value={formatAmount(loan.emi_amount)} />
          <Field
            label="Upfront Interest"
            value={formatAmount(loan.upfront_interest_amount)}
          />
          <Field
            label="Net Repayable Amount"
            value={formatAmount(loan.net_repayable_amount)}
            highlight
          />
        </Grid>
      ),
    },
    {
      title: "Business Details",
      icon: "🏢",
      content: (
        <Grid>
          <Field label="Business Name" value={loan.business_name} />
          <Field label="Industry" value={loan.industry} />
          <Field label="GST Number" value={loan.gst_number} />
          <Field label="Udyam Number" value={loan.udyam_number} />
          <Field label="Business Address" value={loan.business_address} wide />
        </Grid>
      ),
    },
    {
      title: "Bank Details",
      icon: "🏦",
      content: (
        <Grid>
          <Field
            label="Account Holder Name"
            value={loan.account_holder_name}
          />
          <Field label="Account Number" value={loan.account_number} />
          <Field label="IFSC Code" value={loan.ifsc} />
          <Field label="Bank Name" value={loan.bank_name} />
        </Grid>
      ),
    },
    {
      title: "Address Details",
      icon: "📍",
      content: (
        <Grid>
          <Field
            label="Permanent Address"
            value={loan.permanent_address}
            wide
          />
          <Field
            label="Business Address"
            value={loan.business_address}
            wide
          />
        </Grid>
      ),
    },
    {
      title: "Documents",
      icon: "📄",
      content:
        documents.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "16px",
            }}
          >
            {documents.map((document) => (
              <div
                key={document.id}
                style={{
                  padding: "18px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: "#1e293b",
                    marginBottom: "6px",
                  }}
                >
                  {document.original_name ||
                    document.file_name ||
                    "Document"}
                </div>

                <div
                  style={{
                    fontSize: "13px",
                    color: "#64748b",
                    wordBreak: "break-word",
                  }}
                >
                  {document.file_name}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            No documents available.
          </p>
        ),
    },
    {
      title: "System Information",
      icon: "⚙️",
      content: (
        <Grid>
          <Field label="Record ID" value={loan.id} />
          <Field label="Created At" value={formatDateTime(loan.created_at)} />
          <Field label="Updated At" value={formatDateTime(loan.updated_at)} />
        </Grid>
      ),
    },
  ];

  return (
    <div
      style={{
        background: "#f1f5f9",
        minHeight: "100vh",
        padding: "45px 25px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "35px",
            gap: "20px",
            flexWrap: "wrap",
          }}
        >
          <button onClick={() => navigate(-1)} style={backButtonStyle}>
            ← Back
          </button>

          <div style={{ textAlign: "right" }}>
            <span
              style={{
                fontSize: "13px",
                color: "#64748b",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Sterlion UBL Loan Profile
            </span>

            <h1
              style={{
                margin: "8px 0 0",
                color: "#0f172a",
                fontSize: "36px",
                fontWeight: 900,
              }}
            >
              {customerName}
            </h1>

            <div
              style={{
                marginTop: "7px",
                color: "#2563eb",
                fontWeight: 800,
              }}
            >
              {loan.lan}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: "30px" }}>
          {sections.map((section) => (
            <div
              key={section.title}
              style={{
                background: "#ffffff",
                borderRadius: "22px",
                padding: "35px",
                border: "1px solid #e2e8f0",
                boxShadow:
                  "0 10px 20px -8px rgba(15, 23, 42, 0.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  marginBottom: "28px",
                }}
              >
                <span style={{ fontSize: "27px" }}>
                  {section.icon}
                </span>

                <h3
                  style={{
                    margin: 0,
                    color: "#1e293b",
                    fontSize: "21px",
                    fontWeight: 900,
                    textTransform: "uppercase",
                  }}
                >
                  {section.title}
                </h3>
              </div>

              {section.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Grid = ({ children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns:
        "repeat(auto-fill, minmax(260px, 1fr))",
      gap: "28px",
    }}
  >
    {children}
  </div>
);

const Field = ({ label, value, highlight, isStatus, wide }) => {
  const normalizedStatus = String(value || "").toUpperCase();

  const statusColors = {
    APPROVED: {
      background: "#dcfce7",
      color: "#166534",
    },
    DISBURSED: {
      background: "#dcfce7",
      color: "#166534",
    },
    LOGIN: {
      background: "#dbeafe",
      color: "#1e40af",
    },
    REJECTED: {
      background: "#fee2e2",
      color: "#991b1b",
    },
    PENDING: {
      background: "#fef9c3",
      color: "#854d0e",
    },
  };

  const statusStyle =
    statusColors[normalizedStatus] || {
      background: "#f1f5f9",
      color: "#475569",
    };

  const displayValue =
    value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
      ? value
      : "—";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        gridColumn: wide ? "1 / -1" : "auto",
      }}
    >
      <label
        style={{
          fontSize: "12px",
          color: "#94a3b8",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </label>

      {isStatus ? (
        <span
          style={{
            padding: "8px 17px",
            borderRadius: "999px",
            width: "fit-content",
            fontSize: "14px",
            fontWeight: 900,
            background: statusStyle.background,
            color: statusStyle.color,
          }}
        >
          {displayValue}
        </span>
      ) : (
        <div
          style={{
            fontSize: "17px",
            fontWeight: highlight ? 900 : 700,
            color: highlight ? "#2563eb" : "#1e293b",
            lineHeight: 1.5,
            wordBreak: "break-word",
          }}
        >
          {displayValue}
        </div>
      )}
    </div>
  );
};

const backButtonStyle = {
  padding: "13px 26px",
  background: "#ffffff",
  color: "#334155",
  border: "2px solid #e2e8f0",
  borderRadius: "12px",
  cursor: "pointer",
  fontSize: "15px",
  fontWeight: 800,
  boxShadow: "0 4px 8px rgba(15, 23, 42, 0.08)",
};

export default SterlionUBLDetails;