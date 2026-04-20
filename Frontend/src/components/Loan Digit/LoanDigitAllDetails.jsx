import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/api";

const LoanDigitDetails = () => {
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
        const res = await api.get(`/loan-digit/loan-digit-info/${lan}`);
        setDetails(res.data);
      } catch (e) {
        console.error("Failed to fetch Loan Digit details:", e);
        setErr("Failed to fetch loan details.");
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
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

  const { loan, bre, kyc } = details;

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
          <Field label="Customer Name" value={loan.customer_name} />
          <Field label="PAN Number" value={loan.pan_number} />
          <Field label="Mobile Number" value={loan.mobile_number} />
          <Field label="DOB" value={formatDate(loan.dob)} />
          <Field label="Age" value={loan.age} />
          <Field label="Gender" value={loan.gender} />
          <Field label="Marital Status" value={loan.marital_status} />
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
          <Field label="Tenure" value={`${loan.loan_tenure} Months`} />
          <Field label="Interest Rate" value={`${loan.interest_rate}%`} />
          <Field label="Processing Fee" value={loan.processing_fee} />
          <Field label="Net Disbursement" value={loan.net_disbursement_amount} />
          <Field label="Monthly Salary" value={loan.monthly_salary} />
          <Field label="Current EMI" value={loan.current_emi} />
          <Field label="CIBIL Score" value={loan.cibil_score} />
          <Field label="Fintree CIBIL" value={loan.fintree_cibil_score} />
        </Grid>
      ),
    },
    {
      title: "Employment & Professional",
      icon: "💼",
      content: (
        <Grid>
          <Field label="Employment Type" value={loan.employment} />
          <Field label="Company Name" value={loan.company_name} />
          <Field label="Company Address" value={loan.company_address} />
          <Field label="Salary Mode" value={loan.mode_of_salary} />
          <Field label="Exp in Job" value={loan.years_in_current_job} />
          <Field label="Total Experience" value={loan.total_work_experience} />
        </Grid>
      ),
    },
    {
      title: "Bank & Disbursement",
      icon: "🏦",
      content: (
        <Grid>
          <Field label="Bank Name" value={loan.bank_name} />
          <Field label="Account Holder" value={loan.name_in_bank} />
          <Field label="Account Number" value={loan.account_number} />
          <Field label="IFSC Code" value={loan.ifsc} />
          <Field label="Account Type" value={loan.account_type} />
        </Grid>
      ),
    },
    {
      title: "Address Details",
      icon: "📍",
      content: (
        <Grid>
          <Field label="Current Address" value={`${loan.current_address}, ${loan.current_city}, ${loan.current_state} - ${loan.current_pincode}`} />
          <Field label="Permanent Address" value={`${loan.permanent_address}, ${loan.permanent_city}, ${loan.permanent_state} - ${loan.permanent_pincode}`} />
          <Field label="Residential Status" value={loan.residential_status} />
        </Grid>
      ),
    },
    {
      title: "Risk & BRE Decisioning",
      icon: "⚖️",
      content: (
        <Grid>
          <Field label="BRE Status" value={bre.bre_status} isStatus />
          <Field label="BRE Reason" value={bre.bre_reason} />
          <Field label="Enquiries (6M)" value={bre.enquiries_6m} />
          <FlagField label="DPD 6M Flag" value={bre.dpd_6m_flag} />
          <FlagField label="DPD > 30 (12M)" value={bre.dpd_gt30_12m_flag} />
          <FlagField label="DPD > 60 (Ever)" value={bre.dpd_gt60_ever_flag} />
          <FlagField label="Multi PAN Flag" value={bre.multi_pan_flag} />
          <FlagField label="Deviation Flag" value={bre.deviation_flag} />
          <Field label="PAN Status" value={kyc.pan_status} isStatus />
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
                <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Loan Digit Profile</span>
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

const FlagField = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
    <div style={{ fontSize: '16px', fontWeight: 800 }}>
      {value === 1 || value === "Y" ? <span style={{ color: "#dc2626", background: '#fef2f2', padding: '4px 10px', borderRadius: '6px' }}>● Yes</span> : 
       value === 0 || value === "N" ? <span style={{ color: "#16a34a", background: '#f0fdf4', padding: '4px 10px', borderRadius: '6px' }}>○ No</span> : 
       <span style={{ color: "#cbd5e1" }}>N/A</span>}
    </div>
  </div>
);

export default LoanDigitDetails;