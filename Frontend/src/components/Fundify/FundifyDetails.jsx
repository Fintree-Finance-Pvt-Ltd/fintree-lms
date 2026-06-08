import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/api";

const FundifyDetails = () => {
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
        const res = await api.get(`/fundify/fundify-manual-entry/${lan}`);
        if (res.data.success) {
          setDetails(res.data.data);
        } else {
          setErr(res.data.message || "Failed to fetch details.");
        }
      } catch (e) {
        console.error("Failed to fetch Fundify details:", e);
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

  const { loan, applicants } = details;

  const formatDate = (d) => {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const applicant = applicants.find(a => a.role === 'APPLICANT');
  const coApplicant = applicants.find(a => a.role === 'CO_APPLICANT');
  const guarantor = applicants.find(a => a.role === 'GUARANTOR');

  const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

  const sections = [
    {
      title: "Loan Information",
      icon: "💼",
      content: (
        <Grid>
          <Field label="LAN" value={loan.lan} highlight />
          <Field label="Partner Loan ID" value={loan.partner_loan_id} />
          <Field label="Login Date" value={formatDate(loan.login_date)} />
          <Field label="Agreement Date" value={formatDate(loan.agreement_date)} />
          <Field label="Product" value={loan.product} />
          <Field label="Lender" value={loan.lender} />
          <Field label="Status" value={loan.status} isStatus />
          <Field label="Stage" value={loan.stage} isStatus />
        </Grid>
      ),
    },
    {
      title: "Business Details",
      icon: "🏢",
      content: (
        <Grid>
          <Field label="Business Name" value={loan.business_name} highlight />
          <Field label="Trade Name" value={loan.trade_name} />
          <Field label="Business PAN" value={loan.business_pan} />
          <Field label="GSTIN" value={loan.gstin} />
          <Field label="Udyam Reg. No" value={loan.udyam_registration_no} />
          <Field label="CIN" value={loan.cin} />
          <Field label="Constitution Type" value={loan.constitution_type} />
          <Field label="Business Start Date" value={formatDate(loan.business_start_date)} />
          <Field label="Business Vintage (Months)" value={loan.business_vintage_months} />
          <Field label="Nature of Business" value={loan.nature_of_business} />
          <Field label="Industry Type" value={loan.industry_type} />
          <Field label="Business Address" value={loan.business_address} />
          <Field label="City" value={loan.business_city} />
          <Field label="State" value={loan.business_state} />
          <Field label="Pincode" value={loan.business_pincode} />
          <Field label="Premises Ownership" value={loan.premises_ownership} />
          <Field label="Business Mobile" value={loan.business_mobile} />
          <Field label="Business Email" value={loan.business_email} />
        </Grid>
      ),
    },
    {
      title: "Primary Applicant Information",
      icon: "👤",
      content: applicant ? (
        <Grid>
          <Field label="Customer ID" value={applicant.customer_id} />
          <Field label="Full Name" value={applicant.full_name} highlight />
          <Field label="Father Name" value={applicant.father_name} />
          <Field label="Mother Name" value={applicant.mother_name} />
          <Field label="DOB" value={formatDate(applicant.dob)} />
          <Field label="Gender" value={applicant.gender} />
          <Field label="Marital Status" value={applicant.marital_status} />
          <Field label="Mobile" value={applicant.mobile} />
          <Field label="Email" value={applicant.email} />
          <Field label="PAN" value={applicant.pan} />
          <Field label="Aadhaar Last 4" value={applicant.aadhaar_last4} />
          <Field label="KYC Status" value={applicant.kyc_status} isStatus />
          <Field label="Current Address" value={applicant.current_address} />
          <Field label="Current City" value={applicant.current_city} />
          <Field label="Current State" value={applicant.current_state} />
          <Field label="Current Pincode" value={applicant.current_pincode} />
          <Field label="Permanent Address" value={applicant.permanent_address} />
        </Grid>
      ) : (
        <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>
          No primary applicant details available.
        </p>
      ),
    },
    {
      title: "Co-Applicant Details",
      icon: "👥",
      content: coApplicant ? (
        <Grid>
          <Field label="Full Name" value={coApplicant.full_name} highlight />
          <Field label="Relation With Applicant" value={coApplicant.relation_with_applicant} />
          <Field label="DOB" value={formatDate(coApplicant.dob)} />
          <Field label="Gender" value={coApplicant.gender} />
          <Field label="Mobile" value={coApplicant.mobile} />
          <Field label="Email" value={coApplicant.email} />
          <Field label="PAN" value={coApplicant.pan} />
          <Field label="Aadhaar Last 4" value={coApplicant.aadhaar_last4} />
          <Field label="KYC Status" value={coApplicant.kyc_status} isStatus />
          <Field label="Current Address" value={coApplicant.current_address} />
          <Field label="Current City" value={coApplicant.current_city} />
          <Field label="Current State" value={coApplicant.current_state} />
          <Field label="Current Pincode" value={coApplicant.current_pincode} />
        </Grid>
      ) : (
        <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>
          No co-applicant details available.
        </p>
      ),
    },
    {
      title: "Guarantor Details",
      icon: "🧾",
      content: guarantor ? (
        <Grid>
          <Field label="Full Name" value={guarantor.full_name} highlight />
          <Field label="Relation With Applicant" value={guarantor.relation_with_applicant} />
          <Field label="DOB" value={formatDate(guarantor.dob)} />
          <Field label="Gender" value={guarantor.gender} />
          <Field label="Mobile" value={guarantor.mobile} />
          <Field label="Email" value={guarantor.email} />
          <Field label="PAN" value={guarantor.pan} />
          <Field label="Aadhaar Last 4" value={guarantor.aadhaar_last4} />
          <Field label="KYC Status" value={guarantor.kyc_status} isStatus />
          <Field label="Current Address" value={guarantor.current_address} />
          <Field label="Current City" value={guarantor.current_city} />
          <Field label="Current State" value={guarantor.current_state} />
          <Field label="Current Pincode" value={guarantor.current_pincode} />
        </Grid>
      ) : (
        <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>
          No guarantor details available.
        </p>
      ),
    },
    {
      title: "Loan Financials",
      icon: "💰",
      content: (
        <Grid>
          <Field label="Loan Amount" value={`₹${loan.loan_amount || "-"}`} highlight />
          <Field label="Approved Loan Amount" value={`₹${loan.approved_loan_amount || "-"}`} />
          <Field label="Disbursal Amount" value={`₹${loan.disbursal_amount || "-"}`} highlight />
          <Field label="Net Disbursement" value={`₹${loan.net_disbursement || "-"}`} />
          <Field label="Interest Rate" value={`${loan.interest_rate || 0}%`} />
          <Field label="Tenure (Months)" value={`${loan.loan_tenure || 0}`} />
          <Field label="EMI Amount" value={`₹${loan.emi_amount || "-"}`} />
          <Field label="Processing Fee" value={`₹${loan.processing_fee || "-"}`} />
          <Field label="Processing Fee %" value={`${loan.processing_fee_percentage || 0}%`} />
          <Field label="Insurance Amount" value={`₹${loan.insurance_amount || "-"}`} />
          <Field label="Other Charges" value={`₹${loan.other_charges || "-"}`} />
          <Field label="Repayment Frequency" value={loan.repayment_frequency} />
          <Field label="EMI Day" value={loan.emi_day} />
        </Grid>
      ),
    },
    {
      title: "Bank Details",
      icon: "🏦",
      content: (
        <Grid>
          <Field label="Bank Name" value={loan.bank_name} />
          <Field label="Name in Bank" value={loan.name_in_bank} />
          <Field label="Account Number" value={loan.account_number} />
          <Field label="IFSC Code" value={loan.ifsc} />
          <Field label="Account Type" value={loan.account_type} />
        </Grid>
      ),
    },
    {
      title: "Bureau & BRE",
      icon: "📊",
      content: (
        <Grid>
          <Field label="CIBIL Score" value={loan.cibil_score} />
          <Field label="Bureau Score" value={loan.bureau_score} />
          <Field label="BRE Status" value={loan.bre_status} isStatus />
          <Field label="BRE Reason" value={loan.bre_reason} />
          <Field label="Reject Reason" value={loan.reject_reason} />
          <Field label="Remarks" value={loan.remarks} />
        </Grid>
      ),
    }
  ];

  return (
    <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "40px", fontFamily: '"Inter", sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h2 style={{ margin: "0 0 8px 0", fontSize: "32px", fontWeight: 900, color: "#0f172a", letterSpacing: '-0.02em' }}>
            Fundify Loan Details
          </h2>
          <p style={{ margin: 0, fontSize: "16px", color: "#64748b", fontWeight: 500 }}>
            LAN: <span style={{ color: '#0ea5e9', fontWeight: 700 }}>{loan.lan}</span> • Business Name: {loan.business_name}
          </p>
        </div>
        <button
          onClick={() => navigate(-1)}
          style={{ padding: "10px 20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#fff", color: "#0f172a", fontSize: "15px", fontWeight: 700, cursor: "pointer", display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: '0.2s' }}
          onMouseOver={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
          onMouseOut={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
        >
          <span>←</span> Back
        </button>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {sections.map((sec, i) => (
          <section key={i} style={{ background: "#fff", borderRadius: "20px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)", overflow: 'hidden' }}>
            <div style={{ padding: "20px 28px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a", display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>{sec.icon}</span> {sec.title}
              </h3>
            </div>
            <div style={{ padding: "28px" }}>
              {sec.content}
            </div>
          </section>
        ))}
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

    const s = isStatus ? (statusColors[String(value || '').toUpperCase()] || { bg: '#f1f5f9', text: '#475569' }) : null;

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

export default FundifyDetails;
