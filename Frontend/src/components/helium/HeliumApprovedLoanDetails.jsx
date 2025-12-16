// src/pages/HeliumApprovedLoanDetails.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/api";
// import "../styles/LoanDetails.css";

const HeliumApprovedLoanDetails = () => {
  const { lan } = useParams();
  const navigate = useNavigate();

  const [details, setDetails] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        setErr("");
        // 🔹 adjust endpoint when backend is ready
        const res = await api.get(`/helium-loans/${lan}`);
        setDetails(res.data);
      } catch (e) {
        console.error("Failed to fetch Helium loan details:", e);
        setErr("Failed to fetch loan details.");
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [lan]);

  if (loading) return <p style={{ padding: 16 }}>Loading...</p>;
  if (err) return <p style={{ padding: 16, color: "#b91c1c" }}>{err}</p>;
  if (!details) return <p style={{ padding: 16 }}>No data found.</p>;

  // Support both { loan, kyc } and flat object
  const loan = details.loan || details;
  const kyc = details.kyc || {};

  const formatDate = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toISOString().slice(0, 10);
  };

  const riskScore = loan.helium_risk_score ?? "";
  const riskBand = loan.helium_risk_band ?? "";

  const componentBlocks = [
    {
      label: "Credit / CIBIL",
      score: loan.helium_credit_score_comp,
      flag: loan.helium_credit_score_flag,
    },
    {
      label: "Age",
      score: loan.helium_age_score,
      flag: loan.helium_age_flag,
    },
    {
      label: "Customer Type",
      score: loan.helium_customer_type_score,
      flag: loan.helium_customer_type_flag,
    },
    {
      label: "Employment",
      score: loan.helium_employment_score,
      flag: loan.helium_employment_flag,
    },
    {
      label: "Income",
      score: loan.helium_income_score,
      flag: loan.helium_income_flag,
    },
    {
      label: "Demographic",
      score: loan.helium_demographic_score,
      flag: loan.helium_demographic_flag,
    },
     {
      label: "Net Monthly Income",
      score: loan.net_monthly_income, 
    },
    {
      label: "Average Monthly Rent",
      score: loan.avg_monthly_rent, 
    },
  ];

  const pillForStatus = (status) => {
    const s = status || "PENDING";
    const map = {
      VERIFIED: {
        bg: "rgba(16,185,129,.12)",
        bd: "rgba(16,185,129,.35)",
        fg: "#065f46",
      },
      FAILED: {
        bg: "rgba(239,68,68,.12)",
        bd: "rgba(239,68,68,.35)",
        fg: "#7f1d1d",
      },
      INITIATED: {
        bg: "rgba(59,130,246,.12)",
        bd: "rgba(59,130,246,.35)",
        fg: "#1d4ed8",
      },
      PENDING: {
        bg: "rgba(234,179,8,.12)",
        bd: "rgba(234,179,8,.35)",
        fg: "#713f12",
      },
    };
    const c = map[s] || map.PENDING;
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          background: c.bg,
          color: c.fg,
          border: `1px solid ${c.bd}`,
        }}
      >
        {s}
      </span>
    );
  };

  const pillForFlag = (flag) => {
    if (flag === 1) {
      return (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            background: "rgba(16,185,129,.12)",
            color: "#065f46",
            border: "1px solid rgba(16,185,129,.35)",
          }}
        >
          ✅ Eligible
        </span>
      );
    }
    if (flag === 0) {
      return (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            background: "rgba(239,68,68,.12)",
            color: "#7f1d1d",
            border: "1px solid rgba(239,68,68,.35)",
          }}
        >
          ❌ Not Eligible
        </span>
      );
    }
    return <span style={{ fontSize: 11, color: "#6b7280" }}>N/A</span>;
  };

  return (
    <div className="loan-details-content">
      <button
        onClick={() => navigate(-1)}
        style={{
          marginBottom: "20px",
          padding: "8px 16px",
          backgroundColor: "#4e4e4e",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        ← Back
      </button>

      <h2>HELIUM Loan - {loan.customer_name || lan}</h2>

      {/* Basic / Summary block */}
      <h3>Application Summary</h3>
      <div className="loan-details-grid">
        <div className="loan-details-field">
          <label>LAN</label>
          <input type="text" value={loan.lan || ""} readOnly />
        </div>

        <div className="loan-details-field">
          <label>Application ID</label>
          <input type="text" value={loan.app_id || ""} readOnly />
        </div>

        <div className="loan-details-field">
          <label>Login Date</label>
          <input type="text" value={formatDate(loan.login_date)} readOnly />
        </div>

        <div className="loan-details-field">
          <label>Status</label>
          <input type="text" value={loan.status || ""} readOnly />
        </div>

        <div className="loan-details-field">
          <label>Mobile Number</label>
          <input type="text" value={loan.mobile_number || ""} readOnly />
        </div>

        <div className="loan-details-field">
          <label>Email</label>
          <input type="text" value={loan.email_id || ""} readOnly />
        </div>

        <div className="loan-details-field">
          <label>Date of Birth</label>
          <input type="text" value={formatDate(loan.dob)} readOnly />
        </div>

        <div className="loan-details-field">
          <label>Gender</label>
          <input type="text" value={loan.gender || ""} readOnly />
        </div>
      </div>

      {/* Loan Details */}
      <h3>Loan Details</h3>
      <div className="loan-details-grid">
        <div className="loan-details-field">
          <label>Approved Loan Amount</label>
          <input type="text" value={loan.loan_amount ?? ""} readOnly />
        </div>

        <div className="loan-details-field">
          <label>Interest Rate (%)</label>
          <input type="text" value={loan.interest_rate ?? ""} readOnly />
        </div>

        <div className="loan-details-field">
          <label>Tenure (months)</label>
          <input type="text" value={loan.loan_tenure ?? ""} readOnly />
        </div>

        <div className="loan-details-field">
          <label>Pre EMI</label>
          <input type="text" value={loan.pre_emi ?? ""} readOnly />
        </div>

        <div className="loan-details-field">
          <label>Processing Fee</label>
          <input type="text" value={loan.processing_fee ?? ""} readOnly />
        </div>

        <div className="loan-details-field">
          <label>CIBIL Score</label>
          <input type="text" value={loan.cibil_score ?? ""} readOnly />
        </div>
      </div>

      {/* KYC Verification Status */}
      <h3>KYC Verification Status</h3>
      <div className="loan-details-grid">
        <div className="loan-details-field">
          <label>PAN</label>
          <div>{pillForStatus(kyc.pan_status)}</div>
        </div>
        <div className="loan-details-field">
          <label>Aadhaar</label>
          <div>{pillForStatus(kyc.aadhaar_status)}</div>
        </div>
        <div className="loan-details-field">
          <label>Bureau</label>
          <div>{pillForStatus(kyc.bureau_status)}</div>
        </div>
      </div>

      {/* HRS - Helium Risk Score */}
      <h3>Helium Risk Score (HRS)</h3>
      <div className="loan-details-grid">
        <div className="loan-details-field">
          <label>Total HRS</label>
          <input type="text" value={riskScore} readOnly />
        </div>

        <div className="loan-details-field">
          <label>Risk Band</label>
          <input type="text" value={riskBand} readOnly />
        </div>

        <div className="loan-details-field">
          <label>Overall Eligibility Flag</label>
          <div>{pillForFlag(loan.helium_risk_flag)}</div>
        </div>
      </div>

      {/* Component-wise breakdown */}
      <h3>Risk Components</h3>
      <div className="loan-details-grid">
        {componentBlocks.map((c) => (
          <div className="loan-details-field" key={c.label}>
            <label>{c.label}</label>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                type="text"
                value={c.score ?? ""}
                readOnly
                style={{ flex: 1, marginRight: 8 }}
              />
              {pillForFlag(c.flag)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HeliumApprovedLoanDetails;
