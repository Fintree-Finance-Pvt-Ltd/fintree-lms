import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/api";

const ClayyoApprovedLoanDetails = () => {
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
        const res = await api.get(`/clayyo-loans/loan-info/${lan}`);
        setDetails(res.data);
      } catch (e) {
        console.error("Failed to fetch Clayyo loan details:", e);
        setErr("Failed to fetch loan details.");
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [lan]);

  if (loading)
    return (
      <div className="spinner-container">
        <div className="spinner"></div>
      </div>
    );
  if (err) return <p style={{ padding: 16, color: "#b91c1c" }}>{err}</p>;
  if (!details) return <p style={{ padding: 16 }}>No data found.</p>;

  const loan = details.loan || details;
  const kyc = details.kyc || {};

  const formatDate = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toISOString().slice(0, 10);
  };

  return (
    <div
      style={{
        background: "#f3f4f6",
        minHeight: "100vh",
        padding: "30px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
          background: "#fff",
          padding: "25px 30px",
          borderRadius: "10px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
        }}
      >
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          style={{
            marginBottom: "10px",
            padding: "6px 12px",
            background: "#374151",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>

        {/* Title */}
        <h2
          style={{
            marginBottom: "20px",
            borderBottom: "2px solid #0ea5e9",
            paddingBottom: "8px",
          }}
        >
          CLAYYO Loan - {loan.customer_name || lan}
        </h2>

        {/* Section Title Style */}
        {[
          {
            title: "Application Summary",
            content: (
              <Grid>
                <Field label="LAN" value={loan.lan} />
                <Field label="Application ID" value={loan.app_id} />
                <Field label="Hospital Name" value={loan.hospital_name} />

                <Field label="Login Date" value={formatDate(loan.login_date)} />
                <Field label="Status" value={loan.status} />
                <Field label="Customer Name" value={loan.customer_name} />
                <Field label="Mobile" value={loan.mobile_number} />
                <Field label="Email" value={loan.email_id} />
                <Field label="DOB" value={formatDate(loan.dob)} />
                <Field label="Gender" value={loan.gender} />
              </Grid>
            ),
          },
          {
            title: "Address Details",
            content: (
              <Grid>
                <Field label="Current Address" value={loan.current_address} />
                <Field label="Current City" value={loan.current_village_city} />
                <Field label="Current District" value={loan.current_district} />
                <Field label="Current State" value={loan.current_state} />
                <Field label="Current Pincode" value={loan.current_pincode} />
                <Field
                  label="Permanent Address"
                  value={loan.permanent_address}
                />
                <Field
                  label="Permanent City"
                  value={loan.permanent_village_city}
                />
                <Field
                  label="Permanent District"
                  value={loan.permanent_district}
                />
                <Field label="Permanent State" value={loan.permanent_state} />
                <Field
                  label="Permanent Pincode"
                  value={loan.permanent_pincode}
                />
              </Grid>
            ),
          },
          {
            title: "Bank Details",
            content: (
              <Grid>
                <Field label="Bank Name" value={loan.bank_name} />
                <Field label="Account Holder Name" value={loan.name_in_bank} />
                <Field label="Account Number" value={loan.account_number} />
                <Field label="IFSC" value={loan.ifsc} />
                <Field label="Branch" value={loan.bank_branch} />
              </Grid>
            ),
          },
          {
            title: "Insurance Details",
            content: (
              <Grid>
                <Field
                  label="Insurance Company"
                  value={loan.insurance_company_name}
                />
                <Field
                  label="Policy Holder Name"
                  value={loan.insurance_policy_holder_name}
                />
                <Field
                  label="Policy Number"
                  value={loan.insurance_policy_number}
                />
                <Field
                  label="Relation with policy Holder"
                  value={loan.relation_with_policy_holder}
                />
              </Grid>
            ),
          },
          {
            title: "Limit Assignment",
            content: (
              <Grid>
                <Field label="Final Limit" value={loan.final_limit} />

                <Field label="Subvention %" value={loan.subvention_percent} />
              </Grid>
            ),
          },
          {
            title: "Loan Details",
            content: (
              <Grid>
                <Field label="Loan Amount" value={loan.loan_amount} />
                <Field label="Tenure" value={loan.loan_tenure} />
                <Field label="Interest Rate" value={loan.interest_rate} />
                <Field label="Policy Type" value={loan.policy_type} />
                <Field label="Employment" value={loan.employment_type} />
                <Field
                  label="Net Monthly Income"
                  value={loan.net_monthly_income}
                />
              </Grid>
            ),
          },
          {
            title: "KYC Status",
            content: (
              <Grid>
                <StatusField label="PAN" value={kyc.pan_status} />
                <StatusField label="Aadhaar" value={kyc.aadhaar_status} />
                <StatusField label="Bureau" value={kyc.bureau_status} />
                <StatusField label="Agreement Signing" value={kyc.agreement_esign_status} />
                <StatusField label="E-NACH" value={kyc.bank_status} />
              </Grid>
            ),
          },
          {
            title: "Clayyo BRE Decision",
            content: (
              <Grid>
                <Field label="BRE Status" value={loan.clayyo_bre_status} />
                <Field label="Reason" value={loan.clayyo_bre_reason} />
                <Field label="Bureau Score" value={loan.clayyo_bureau_score} />
                <Field
                  label="Enquiries (30d)"
                  value={loan.clayyo_enquiries_30d}
                />
              </Grid>
            ),
          },

          {
            title: "Risk Flags",
            content: (
              <Grid>
                <FlagField label="DPD in 3M" value={loan.clayyo_dpd_3m_flag} />
                <FlagField
                  label="30 DPD (12M)"
                  value={loan.clayyo_dpd_12m_count}
                />
                <FlagField
                  label="60+ DPD (24M)"
                  value={loan.clayyo_dpd_24m_60_flag}
                />
                <FlagField
                  label="90+ DPD (36M)"
                  value={loan.clayyo_dpd_36m_90_flag}
                />
                <FlagField label="Overdue" value={loan.clayyo_overdue_flag} />
                <FlagField
                  label="Written Off"
                  value={loan.clayyo_writtenoff_flag}
                />
                <FlagField
                  label="Moratorium"
                  value={loan.clayyo_moratorium_flag}
                />
                <FlagField
                  label="Restructured"
                  value={loan.clayyo_restructured_flag}
                />
              </Grid>
            ),
          },
        ].map((section, idx) => (
          <div key={idx} style={{ marginBottom: "25px" }}>
            <h3
              style={{
                borderBottom: "1px solid #e5e7eb",
                paddingBottom: "6px",
                marginBottom: "15px",
                color: "#1f2937",
              }}
            >
              {section.title}
            </h3>
            {section.content}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClayyoApprovedLoanDetails;

const Grid = ({ children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: "15px 30px",
    }}
  >
    {children}
  </div>
);

const Field = ({ label, value }) => (
  <div>
    <label style={{ fontSize: "13px", color: "#6b7280" }}>{label}</label>
    <input
      value={value || ""}
      readOnly
      style={{
        width: "100%",
        padding: "6px 8px",
        marginTop: "4px",
        border: "1px solid #d1d5db",
        borderRadius: "4px",
        background: "#f9fafb",
      }}
    />
  </div>
);

const StatusField = ({ label, value }) => {
  const colors = {
    VERIFIED: "#16a34a",
    FAILED: "#dc2626",
    INITIATED: "#2563eb",
    PENDING: "#ca8a04",
  };

  return (
    <div>
      <label style={{ fontSize: "13px", color: "#6b7280" }}>{label}</label>
      <div
        style={{
          marginTop: "6px",
          fontWeight: 600,
          color: colors[value] || "#333",
        }}
      >
        {value || "PENDING"}
      </div>
    </div>
  );
};

const FlagField = ({ label, value }) => (
  <div>
    <label style={{ fontSize: "13px", color: "#6b7280" }}>{label}</label>
    <div style={{ marginTop: "6px", fontWeight: 600 }}>
      {value === 1 && <span style={{ color: "#16a34a" }}>✅ Yes</span>}
      {value === 0 && <span style={{ color: "#dc2626" }}>❌ No</span>}
      {value === null && <span>N/A</span>}
    </div>
  </div>
);
