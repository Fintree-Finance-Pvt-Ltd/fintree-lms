import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/api";

const SevenFinCorpDetails = () => {
  const [searchParams] = useSearchParams();
  const lan = searchParams.get("lan");
  const navigate = useNavigate();

  const [details, setDetails] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        setErr("");
        // Updated endpoint to match your new backend route
        const res = await api.get(`/seven-fincorp/customer-details/${lan}`);
        setDetails(res.data);
      } catch (e) {
        console.error("Failed to fetch Seven FinCorp details:", e);
        setErr("Failed to fetch customer details.");
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [lan]);

  if (loading)
    return (
      <div
        className="spinner-container"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <div
          className="spinner"
          style={{
            width: "60px",
            height: "60px",
            border: "6px solid #f3f3f3",
            borderTop: "6px solid #0ea5e9",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        ></div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  if (err)
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
  if (!details)
    return (
      <p style={{ padding: 40, fontSize: "20px", color: "#6b7280" }}>
        No data found.
      </p>
    );

  const { loan, bre } = details;

  const formatDate = (d) => {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const hasValue = (value) =>
    value !== null && value !== undefined && String(value).trim() !== "";

  const sections = [
    {
      title: "Applicant Information",
      icon: "👤",
      content: (
        <Grid>
          <Field label="LAN" value={loan.lan} highlight />
          <Field label="Partner Loan ID" value={loan.partner_loan_id} />

          <Field label="Customer Name" value={loan.customer_name} />

          <Field label="First Name" value={loan.first_name} />
          <Field label="Last Name" value={loan.last_name} />

          <Field label="Father Name" value={loan.father_name} />

          <Field label="PAN Number" value={loan.pan_card} />

          <Field label="Mobile Number" value={loan.mobile_number} />

          <Field label="Email" value={loan.email} />

          <Field label="DOB" value={formatDate(loan.dob)} />

          <Field label="Gender" value={loan.gender} />

          <Field label="Current Status" value={loan.status} isStatus />

          <Field label="Stage" value={loan.stage} isStatus />
        </Grid>
      ),
    },
    {
      title: "Guarantor Details",
      icon: "🧾",
      content: hasValue(loan.guarantor?.name) ? (
        <Grid>
          <Field label="Guarantor Name" value={loan.guarantor?.name} />
          <Field label="Guarantor PAN" value={loan.guarantor?.pan} />
          <Field label="Guarantor Mobile" value={loan.guarantor?.mobile} />
          <Field label="Guarantor Email" value={loan.guarantor?.email} />
          <Field
            label="Guarantor DOB"
            value={formatDate(loan.guarantor?.dob)}
          />
          <Field
            label="Relationship With Borrower"
            value={loan.guarantor?.relationship_with_borrower}
          />

          <Field
            label="Address Line 1"
            value={loan.guarantor?.address?.address_line_1}
          />
          <Field
            label="Address Line 2"
            value={loan.guarantor?.address?.address_line_2}
          />
          <Field label="City" value={loan.guarantor?.address?.city} />
          <Field label="District" value={loan.guarantor?.address?.district} />
          <Field label="State" value={loan.guarantor?.address?.state} />
          <Field label="Pincode" value={loan.guarantor?.address?.pincode} />
        </Grid>
      ) : (
        <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>
          No guarantor details available.
        </p>
      ),
    },

    {
      title: "Co-Applicant Details",
      icon: "👥",
      content: hasValue(loan.co_applicant?.name) ? (
        <Grid>
          <Field label="Co-Applicant Name" value={loan.co_applicant?.name} />
          <Field label="Co-Applicant PAN" value={loan.co_applicant?.pan} />
          <Field
            label="Co-Applicant Mobile"
            value={loan.co_applicant?.mobile}
          />
          <Field label="Co-Applicant Email" value={loan.co_applicant?.email} />
          <Field
            label="Co-Applicant DOB"
            value={formatDate(loan.co_applicant?.dob)}
          />

          <Field
            label="Address Line 1"
            value={loan.co_applicant?.address?.address_line_1}
          />
          <Field
            label="Address Line 2"
            value={loan.co_applicant?.address?.address_line_2}
          />
          <Field label="City" value={loan.co_applicant?.address?.city} />
          <Field
            label="District"
            value={loan.co_applicant?.address?.district}
          />
          <Field label="State" value={loan.co_applicant?.address?.state} />
          <Field label="Pincode" value={loan.co_applicant?.address?.pincode} />
        </Grid>
      ) : (
        <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>
          No co-applicant details available.
        </p>
      ),
    },
    {
      title: "Loan & Financials",
      icon: "💰",
      content: (
        <Grid>
          <Field
            label="Requested Loan Amount"
            value={`₹${loan.loan_details?.requested_loan_amount || "-"}`}
            highlight
          />

          <Field
            label="Loan Amount"
            value={`₹${loan.loan_details?.loan_amount || "-"}`}
            highlight
          />

          <Field
            label="Tenure"
            value={`${loan.loan_details?.loan_tenure || 0} Months`}
          />

          <Field
            label="Interest Rate"
            value={`${loan.loan_details?.interest_rate || 0}%`}
          />

          <Field
            label="Processing Fee"
            value={`₹${loan.loan_details?.processing_fee || "-"}`}
          />

          <Field
            label="Processing Fee %"
            value={loan.loan_details?.processing_fee_percentage}
          />

          <Field
            label="Disbursal Amount"
            value={loan.loan_details?.disbursal_amount}
          />

          <Field label="CIBIL Score" value={bre?.fintree_cibil_score} />
        </Grid>
      ),
    },
    {
      title: "Bank Details",
      icon: "🏦",
      content: (
        <Grid>
          <Field
            label="Bank Name"
            value={loan.bank_details?.customer_bank_name}
          />

          <Field
            label="Account Holder"
            value={loan.bank_details?.customer_name_as_per_bank}
          />

          <Field
            label="Account Number"
            value={loan.bank_details?.customer_account_number}
          />

          <Field label="IFSC Code" value={loan.bank_details?.bank_ifsc_code} />
        </Grid>
      ),
    },
    {
      title: "Address Details",
      icon: "📍",
      content: (
        <Grid>
          <Field
            label="Address Line 1"
            value={loan.permanent_address?.address_line_1}
          />

          <Field
            label="Address Line 2"
            value={loan.permanent_address?.address_line_2}
          />

          <Field label="City" value={loan.permanent_address?.city} />

          <Field label="District" value={loan.permanent_address?.district} />

          <Field label="State" value={loan.permanent_address?.state} />

          <Field label="Pincode" value={loan.permanent_address?.pincode} />
        </Grid>
      ),
    },

    {
      title: "Dealer Details",
      icon: "🏪",
      content: (
        <Grid>
          <Field label="Dealer Name" value={loan.dealer_details?.dealer_name} />

          <Field label="Trade Name" value={loan.dealer_details?.trade_name} />

          <Field
            label="Dealer Contact"
            value={loan.dealer_details?.dealer_contact}
          />

          <Field
            label="Dealer Email"
            value={loan.dealer_details?.dealer_email}
          />

          <Field label="GST Number" value={loan.dealer_details?.gst_no} />

          <Field label="Dealer City" value={loan.dealer_details?.dealer_city} />

          <Field
            label="Dealer State"
            value={loan.dealer_details?.dealer_state}
          />
        </Grid>
      ),
    },
    {
      title: "Vehicle & Product",
      icon: "🛺",
      content: (
        <Grid>
          <Field
            label="E-Rickshaw Model"
            value={loan.product_details?.e_rikshaw_model}
          />

          <Field
            label="Battery Name"
            value={loan.product_details?.battery_name}
          />

          <Field
            label="Battery Type"
            value={loan.product_details?.battery_type}
          />

          <Field
            label="Battery Serial No"
            value={loan.product_details?.battery_serial_no_1}
          />

          <Field label="Chassis No" value={loan.product_details?.chassis_no} />
        </Grid>
      ),
    },

    {
      title: "Verification Status",
      icon: "✅",
      content: (
        <div style={{ display: "grid", gap: "24px" }}>
          <ApplicantVerificationBlock
            title="Borrower"
            data={loan.verification_status?.borrower}
          />

          {hasValue(loan.guarantor?.name) && (
            <ApplicantVerificationBlock
              title="Guarantor"
              data={loan.verification_status?.guarantor}
            />
          )}

          {hasValue(loan.co_applicant?.name) && (
            <ApplicantVerificationBlock
              title="Co-Applicant"
              data={loan.verification_status?.co_applicant}
            />
          )}
        </div>
      ),
    },
    {
      title: "Risk & BRE Decisioning",
      icon: "⚖️",
      content: (
        <Grid>
          <Field label="BRE Status" value={bre?.bre_status} isStatus />

          <Field label="BRE Reason" value={bre?.bre_reason} />

          <Field label="Fintree CIBIL" value={bre?.fintree_cibil_score} />

          <Field label="Enquiries (30D)" value={bre?.enquiries_30d} />

          <FlagField label="DPD 3M" value={bre?.dpd_3m_flag} />

          <FlagField label="DPD 6M" value={bre?.dpd_6m_flag} />

          <FlagField label="Overdue 12M" value={bre?.overdue_12m_flag} />

          <FlagField label="Written Off 3Y" value={bre?.written_off_3y_flag} />

          <FlagField label="60+ DPD" value={bre?.dpd_60plus_24m_flag} />

          <FlagField label="90+ DPD" value={bre?.dpd_90plus_36m_flag} />

          <FlagField label="Deviation" value={bre?.deviation_flag} />

          <Field label="EMI Overdue" value={bre?.emi_overdue_amount} />

          <Field label="CC Overdue" value={bre?.cc_overdue_amount} />
        </Grid>
      ),
    },
  ];

  return (
    <div
      style={{
        background: "#f1f5f9",
        minHeight: "100vh",
        padding: "50px 25px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
        {/* Header Navigation */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "40px",
          }}
        >
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: "14px 28px",
              background: "#ffffff",
              color: "#334155",
              border: "2px solid #e2e8f0",
              borderRadius: "12px",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: "700",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            }}
          >
            ← Back
          </button>

          <div style={{ textAlign: "right" }}>
            <span
              style={{
                fontSize: "14px",
                color: "#64748b",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Motion Corp Profile
            </span>
            <h1
              style={{
                margin: "8px 0 0 0",
                color: "#0f172a",
                fontSize: "42px",
                fontWeight: 900,
                letterSpacing: "-0.02em",
              }}
            >
              {loan.customer_name || lan}
            </h1>
          </div>
        </div>

        {/* Mega Grid Body */}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr", gap: "35px" }}
        >
          {sections.map((section, idx) => (
            <div
              key={idx}
              style={{
                background: "#ffffff",
                borderRadius: "24px",
                padding: "40px",
                boxShadow:
                  "0 10px 15px -3px rgba(0,0,0,0.04), 0 4px 6px -2px rgba(0,0,0,0.02)",
                border: "1px solid #e2e8f0",
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
                <span style={{ fontSize: "28px" }}>{section.icon}</span>
                <h3
                  style={{
                    margin: 0,
                    color: "#1e293b",
                    fontSize: "22px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.02em",
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

// Reusable Sub-components
const Grid = ({ children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      gap: "30px",
    }}
  >
    {children}
  </div>
);

const Field = ({ label, value, highlight, isStatus }) => {
  const statusColors = {
    APPROVED: { bg: "#bbf7d0", text: "#14532d" },
    SUCCESS: { bg: "#bbf7d0", text: "#14532d" },
    REJECTED: { bg: "#fecaca", text: "#7f1d1d" },
    FAILED: { bg: "#fecaca", text: "#7f1d1d" },
    PENDING: { bg: "#fef08a", text: "#713f12" },
    LOGIN: { bg: "#e0f2fe", text: "#075985" },
  };

  const s = isStatus
    ? statusColors[value?.toUpperCase()] || { bg: "#f1f5f9", text: "#475569" }
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
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
            padding: "8px 18px",
            borderRadius: "10px",
            fontSize: "15px",
            fontWeight: 800,
            background: s.bg,
            color: s.text,
            width: "fit-content",
            border: `1px solid rgba(0,0,0,0.05)`,
          }}
        >
          {value || "PENDING"}
        </span>
      ) : (
        <div
          style={{
            fontSize: "18px",
            fontWeight: highlight ? "900" : "700",
            color: highlight ? "#0284c7" : "#1e293b",
            wordBreak: "break-word",
            lineHeight: "1.4",
          }}
        >
          {value || "—"}
        </div>
      )}
    </div>
  );
};

const ApplicantVerificationBlock = ({ title, data }) => {
  const status = data || {
    pan_status: "PENDING",
    aadhaar_status: "PENDING",
    bureau_status: "PENDING",
  };

  return (
    <div
      style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "18px",
        padding: "24px",
      }}
    >
      <h4
        style={{
          margin: "0 0 20px 0",
          fontSize: "18px",
          fontWeight: 900,
          color: "#0f172a",
        }}
      >
        {title}
      </h4>

      <Grid>
        <VerificationField label="PAN Status" value={status.pan_status} />

        <VerificationField
          label="Aadhaar Status"
          value={status.aadhaar_status}
        />

        <VerificationField label="Bureau Status" value={status.bureau_status} />
      </Grid>
    </div>
  );
};

const VerificationField = ({ label, value }) => {
  const status = String(value || "PENDING").toUpperCase();

  const statusColors = {
    VERIFIED: {
      bg: "#dcfce7",
      text: "#166534",
      border: "#bbf7d0",
    },
    FAILED: {
      bg: "#fee2e2",
      text: "#991b1b",
      border: "#fecaca",
    },
    INITIATED: {
      bg: "#dbeafe",
      text: "#1e40af",
      border: "#bfdbfe",
    },
    PENDING: {
      bg: "#fef9c3",
      text: "#854d0e",
      border: "#fde68a",
    },
  };

  const c = statusColors[status] || statusColors.PENDING;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
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

      <span
        style={{
          padding: "9px 18px",
          borderRadius: "999px",
          fontSize: "14px",
          fontWeight: 900,
          background: c.bg,
          color: c.text,
          border: `1px solid ${c.border}`,
          width: "fit-content",
        }}
      >
        {status}
      </span>
    </div>
  );
};

const FlagField = ({ label, value }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
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
    <div style={{ fontSize: "16px", fontWeight: 800 }}>
      {value === 1 || value === "Y" ? (
        <span
          style={{
            color: "#dc2626",
            background: "#fef2f2",
            padding: "4px 10px",
            borderRadius: "6px",
          }}
        >
          ● Yes
        </span>
      ) : value === 0 || value === "N" ? (
        <span
          style={{
            color: "#16a34a",
            background: "#f0fdf4",
            padding: "4px 10px",
            borderRadius: "6px",
          }}
        >
          ○ No
        </span>
      ) : (
        <span style={{ color: "#cbd5e1" }}>N/A</span>
      )}
    </div>
  </div>
);

export default SevenFinCorpDetails;
