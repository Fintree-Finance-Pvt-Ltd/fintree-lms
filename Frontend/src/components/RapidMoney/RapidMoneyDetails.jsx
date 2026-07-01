import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "../../api/api";

const RapidMoneyDetails = () => {
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
        // Using the generic loan booking API which supports RML
        const res = await api.get(`/loan-booking/${lan}`);
        setDetails(res.data);
      } catch (e) {
        console.error("Failed to fetch RapidMoney details:", e);
        setErr("Failed to fetch customer details.");
      } finally {
        setLoading(false);
      }
    };
    if (lan) fetchDetails();
  }, [lan]);

  if (loading)
    return (
      <div className="spinner-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner" style={{ width: '60px', height: '60px', border: '6px solid #f3f3f3', borderTop: '6px solid #0ea5e9', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  if (err) return <p style={{ padding: 40, fontSize: '20px', color: "#dc2626", fontWeight: 700 }}>{err}</p>;
  if (!details) return <p style={{ padding: 40, fontSize: '20px', color: "#6b7280" }}>No data found.</p>;

  const loan = details;

  const formatDate = (d) => {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const sections = [
    {
      title: "Applicant Information",
      icon: "👤",
      content: (
        <Grid>
          <Field label="LAN" value={loan.lan} highlight />
          <Field label="Partner Loan ID" value={loan.partner_loan_id} />
          <Field label="Application ID" value={loan.application_id} />
          <Field label="Customer Name" value={loan.customer_name} />
          <Field label="PAN Number" value={loan.pan_number} />
          <Field label="Mobile Number" value={loan.mobile} />
          <Field label="Email" value={loan.email} />
          <Field label="DOB" value={formatDate(loan.borrower_dob || loan.dob)} />
          <Field label="Gender" value={loan.gender} />
          <Field label="Current Status" value={loan.status} isStatus />
        </Grid>
      ),
    },
    {
      title: "Loan & Financials",
      icon: "💰",
      content: (
        <Grid>
          <Field label="Loan Amount" value={`₹${loan.loan_amount}`} highlight />
          <Field label="Tenure (Months)" value={`${loan.tenure}`} />
          <Field label="Interest Rate" value={`${loan.interest_rate}%`} />
          <Field label="Processing Fee" value={`₹${loan.processing_fee}`} />
          <Field label="Disbursal Amount" value={loan.disbursal_amount ? `₹${loan.disbursal_amount}` : "—"} />
          <Field label="Monthly EMI" value={loan.emi_amount || loan.monthly_emi} />
          <Field label="Total Disbursed Apps" value={loan.total_disbursed_applications} />
          <Field label="Previous Loan Amount" value={loan.previous_loan_amount} />
        </Grid>
      ),
    },
    {
      title: "Employment Details",
      icon: "💼",
      content: (
        <Grid>
          <Field label="Employment Type" value={loan.employment_type} />
          <Field label="Company Type" value={loan.company_type} />
          <Field label="Company Name" value={loan.company_name} />
          <Field label="Designation" value={loan.designation} />
          <Field label="Salary Mode" value={loan.salary_mode} />
          <Field label="Salary Range" value={loan.salary_range} />
          <Field label="Monthly Income" value={loan.monthly_income} />
          <Field label="Industry Type" value={loan.industry_type} />
          <Field label="Nature of Business" value={loan.nature_of_business} />
        </Grid>
      ),
    },
    {
      title: "Bank & Disbursement",
      icon: "🏦",
      content: (
        <Grid>
          <Field label="Account Holder" value={loan.bank_ac_name} />
          <Field label="Account Number" value={loan.bank_ac_number} />
          <Field label="IFSC Code" value={loan.bank_ifsc_code} />
          <Field label="NACH UMRN" value={loan.bank_nach_umrn} />
          <Field label="UPI ID" value={loan.bank_upi_id} />
        </Grid>
      ),
    },
    {
      title: "Address Details",
      icon: "📍",
      content: (
        <Grid>
          <Field label="Residence Status" value={loan.residence_status} />
          <Field label="Permanent Address" value={`${loan.address_line_1 || ''} ${loan.address_line_2 || ''}, ${loan.address_city || ''}, ${loan.address_state || ''} - ${loan.address_pincode || ''}`} />
          <Field label="Is Current Address Same" value={loan.is_current_address === 1 ? "Yes" : "No"} />
          <Field label="Current Address" value={`${loan.current_address_line_1 || ''} ${loan.current_address_line_2 || ''}, ${loan.current_address_city || ''}, ${loan.current_address_state || ''} - ${loan.current_address_pincode || ''}`} />
        </Grid>
      ),
    },
    {
      title: "Risk & BRE Decisioning",
      icon: "⚖️",
      content: (
        <Grid>
          <Field label="BRE Status" value={loan.sml_bre_status} isStatus />
          <Field label="BRE Reason" value={loan.sml_bre_reason} />
          <Field label="Credit Limit" value={loan.sml_credit_limit} />
        </Grid>
      ),
    },
  ];

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", padding: "50px 25px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
        
        {/* Header Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px' }}>
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
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)"
            }}
            >
            ← Back
            </button>

            <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>RapidMoney Profile</span>
                <h1 style={{ margin: "8px 0 0 0", color: "#0f172a", fontSize: '42px', fontWeight: 900, letterSpacing: '-0.02em' }}>
                    {loan.customer_name || lan}
                </h1>
            </div>
        </div>

        {/* Mega Grid Body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '35px' }}>
            {sections.map((section, idx) => (
            <div key={idx} style={{ 
                background: "#ffffff", 
                borderRadius: "24px", 
                padding: "40px", 
                boxShadow: "0 10px 15px -3px rgba(0,0,0,0.04), 0 4px 6px -2px rgba(0,0,0,0.02)",
                border: "1px solid #e2e8f0"
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '30px' }}>
                    <span style={{ fontSize: '28px' }}>{section.icon}</span>
                    <h3 style={{ margin: 0, color: "#1e293b", fontSize: '22px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
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
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "30px" }}>
    {children}
  </div>
);

const Field = ({ label, value, highlight, isStatus }) => {
    const statusColors = {
        APPROVED: { bg: '#bbf7d0', text: '#14532d' },
        BRE_APPROVED: { bg: '#bbf7d0', text: '#14532d' },
        SUCCESS: { bg: '#bbf7d0', text: '#14532d' },
        REJECTED: { bg: '#fecaca', text: '#7f1d1d' },
        FAILED: { bg: '#fecaca', text: '#7f1d1d' },
        PENDING: { bg: '#fef08a', text: '#713f12' },
        LOGIN: { bg: '#e0f2fe', text: '#075985' }
    };

    const s = isStatus ? (statusColors[value?.toUpperCase()] || { bg: '#f1f5f9', text: '#475569' }) : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
            {isStatus ? (
                <span style={{ 
                    padding: '8px 18px', 
                    borderRadius: '10px', 
                    fontSize: '15px', 
                    fontWeight: 800, 
                    background: s.bg, 
                    color: s.text,
                    width: 'fit-content',
                    border: `1px solid rgba(0,0,0,0.05)`
                }}>
                    {value || 'PENDING'}
                </span>
            ) : (
                <div style={{ fontSize: "18px", fontWeight: highlight ? "900" : "700", color: highlight ? "#0284c7" : "#1e293b", wordBreak: 'break-word', lineHeight: '1.4' }}>
                {value || "—"}
                </div>
            )}
        </div>
    );
};

export default RapidMoneyDetails;
