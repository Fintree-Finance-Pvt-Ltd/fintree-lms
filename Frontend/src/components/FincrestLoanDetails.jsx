import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/api";

const FincrestLoanDetails = () => {
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
        const res = await api.get(`/loan-booking/v1/finso-customer-details/${lan}`);
        setDetails(res.data?.data || res.data);
      } catch (e) {
        console.error("Failed to fetch Fincrest/Finso details:", e);
        setErr("Failed to fetch customer details.");
      } finally {
        setLoading(false);
      }
    };
    if (lan) fetchDetails();
  }, [lan]);

  if (loading)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f1f5f9' }}>
        <div style={{ width: '60px', height: '60px', border: '6px solid #f3f3f3', borderTop: '6px solid #0ea5e9', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );

  if (err) return <p style={{ padding: 40, fontSize: '20px', color: "#dc2626", fontWeight: 700 }}>{err}</p>;
  if (!details) return <p style={{ padding: 40, fontSize: '20px', color: "#6b7280" }}>No data found.</p>;

  const loan = details;

  const lenderName = "Fincrest";

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
          <Field label="Customer Name" value={loan.customer_name || loan.first_name ? `${loan.first_name || ""} ${loan.last_name || ""}`.trim() : "—"} />
          <Field label="Father Name" value={loan.father_name} />
          <Field label="Mother Name" value={loan.mother_name} />
          <Field label="PAN Number" value={loan.pan_card} />
          <Field label="Aadhaar Number" value={loan.aadhar_number} />
          <Field label="Mobile Number" value={loan.mobile_number} />
          <Field label="Email" value={loan.email} />
          <Field label="DOB" value={formatDate(loan.borrower_dob)} />
          <Field label="Gender" value={loan.gender} />
          <Field label="Current Status" value={loan.status} isStatus />
        </Grid>
      ),
    },
    {
      title: "Address Details",
      icon: "📍",
      content: (
        <Grid>
          <Field label="Address Line 1" value={loan.address_line_1} />
          <Field label="Address Line 2" value={loan.address_line_2} />
          <Field label="Village" value={loan.village} />
          <Field label="District" value={loan.district} />
          <Field label="State" value={loan.state} />
          <Field label="Pincode" value={loan.pincode} />
        </Grid>
      ),
    },
    {
      title: "Business Details",
      icon: "🏪",
      content: (
        <Grid>
          <Field label="Business Name" value={loan.business_name} highlight />
          <Field label="Company Type" value={loan.company_type} />
          <Field label="Industry" value={loan.industry} />
          <Field label="Business Vintage" value={loan.business_vintage} />
          <Field label="Udyam Registration" value={loan.udyam_registration} />
          <Field label="Property Type" value={loan.property_type} />
          <Field label="Employment Type" value={loan.employment_type} />
          <Field label="Business Village" value={loan.business_village} />
          <Field label="Business District" value={loan.business_district} />
          <Field label="Business State" value={loan.business_state} />
          <Field label="Business Pincode" value={loan.business_pincode} />
        </Grid>
      ),
    },
    {
      title: "Financials",
      icon: "📈",
      content: (
        <Grid>
          <Field label="Annual Turnover" value={`₹${loan.annual_turnover || "-"}`} />
          <Field label="Net Profit" value={`₹${loan.net_profit || "-"}`} />
          <Field label="Loan EMI Obligations" value={`₹${loan.loanemi_obligations || "-"}`} />
          <Field label="Pre-EMI" value={`₹${loan.pre_emi || "-"}`} />
          <Field label="ABB Value" value={`₹${loan.abb_value || "-"}`} />
        </Grid>
      ),
    },
    {
      title: "Loan Details",
      icon: "💰",
      content: (
        <Grid>
          <Field label="Product" value={loan.product} />
          <Field label="Lender" value={`${lenderName.toUpperCase()}`} />
          <Field label="Requested Loan Amount" value={`₹${loan.loan_amount || "-"}`} highlight />
          <Field label="Disbursal Amount" value={`₹${loan.disbursal_amount || "-"}`} highlight />
          <Field label="Net Disbursement" value={`₹${loan.net_disbursement || "-"}`} highlight />
          <Field label="Tenure" value={`${loan.loan_tenure || 0} Months`} />
          <Field label="Interest Rate" value={`${loan.interest_rate || 0}%`} />
          <Field label="APR" value={`${loan.apr || 0}%`} />
          <Field label="Processing Fee" value={`₹${loan.processing_fee || "-"}`} />
          <Field label="EMI Amount" value={`₹${loan.emi_amount || "-"}`} />
          <Field label="Agreement Date" value={formatDate(loan.agreement_date)} />
        </Grid>
      ),
    },
    {
      title: "Bank & Mandate Details",
      icon: "🏦",
      content: (
        <Grid>
          <Field label="Bank Name" value={loan.bank_name} />
          <Field label="Account Holder" value={loan.name_in_bank} />
          <Field label="Account Number" value={loan.account_number} />
          <Field label="IFSC Code" value={loan.ifsc} />
          <Field label="Mandate ID" value={loan.mandate_id} />
          <Field label="E-Mandate No" value={loan.e_mandate_no} />
        </Grid>
      ),
    },
    {
      title: "Account Aggregator (AA)",
      icon: "🔐",
      content: (
        <Grid>
          <FlagField label="AA Eligible" value={loan.finso_aa_eligible} />
          <Field label="AA Bank Name" value={loan.aa_bank_name} />
          <Field label="AA Branch Name" value={loan.aa_branch_name} />
          <Field label="AA Account Type" value={loan.aa_account_type} />
          <Field label="AA Account Holder" value={loan.aa_name_in_bank} />
          <Field label="AA Account Number" value={loan.aa_account_number} />
          <Field label="AA IFSC Code" value={loan.aa_ifsc} />
        </Grid>
      ),
    },
    {
      title: "Risk & BRE Decisioning",
      icon: "⚖️",
      content: (
        <Grid>
          <Field label="BRE Status" value={loan.finso_bre_status} isStatus />
          <Field label="BRE Reason" value={loan.finso_bre_reason} />
          <Field label="CIBIL Score" value={loan.cibil_score} />
          <Field label="Fintree CIBIL" value={loan.cibil_score_fintree} />
          <Field label="CIBIL Band" value={loan.finso_cibil_band} />
          
          <Field label="ABB Offer" value={`₹${loan.finso_abb_offer || "-"}`} />
          <Field label="CIBIL Offer" value={`₹${loan.finso_cibil_offer || "-"}`} />
          <Field label="Final Offer" value={`₹${loan.finso_final_offer || "-"}`} highlight />
          <Field label="Offer Tenure" value={`${loan.finso_offer_tenure_days || 0} Days`} />
          
          <Field label="Enquiries (30D)" value={loan.finso_enquiries_30d} />
          <Field label="Unsecured Enquiries (30D)" value={loan.finso_unsecured_enquiries_30d} />
          <Field label="Active Tradeline Count" value={loan.finso_active_tradeline_count} />
          
          <FlagField label="DPD 6M Flag" value={loan.finso_dpd_6m_flag} />
          <FlagField label="Settled/Written-Off (36M)" value={loan.finso_settled_writtenoff_36m_flag} />
          <FlagField label="Suit Filed (3Y)" value={loan.finso_willful_default_suit_filed_3y_flag} />
          <FlagField label="Active Overdue (3M)" value={loan.finso_active_overdue_3m_flag} />
          <Field label="Active Overdue Amount" value={`₹${loan.finso_active_overdue_amount || "0"}`} />
          <FlagField label="Deviation Flag" value={loan.finso_deviation_flag} />
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
                <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Fincrest Profile</span>
                <h1 style={{ margin: "8px 0 0 0", color: "#0f172a", fontSize: '42px', fontWeight: 900, letterSpacing: '-0.02em' }}>
                    {loan.customer_name || `${loan.first_name || ""} ${loan.last_name || ""}`.trim() || lan}
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

export default FincrestLoanDetails;
