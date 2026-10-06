import React, { useEffect, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import api from "../../api/api";

/* =========================================================
   HELPERS
========================================================= */

const hasValue = (value) =>
  value !== null && value !== undefined && String(value).trim() !== "";

const formatDate = (value) => {
  if (!hasValue(value)) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!hasValue(value)) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatAmount = (value) => {
  if (!hasValue(value)) {
    return "—";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return String(value);
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
};

const normalizeStatus = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const getStatusClass = (value) => {
  const status = normalizeStatus(value);

  if (
    [
      "APPROVED",
      "BRE_APPROVED",
      "CREDIT_APPROVED",
      "VERIFIED",
      "SUCCESS",
      "COMPLETED",
      "DISBURSED",
      "ACTIVE",
      "SIGNED",
      "PAID",
      "CLOSED",
    ].includes(status)
  ) {
    return "status status-success";
  }

  if (
    [
      "REJECTED",
      "BRE_REJECTED",
      "CREDIT_REJECTED",
      "FAILED",
      "CANCELLED",
      "CANCELED",
    ].includes(status)
  ) {
    return "status status-danger";
  }

  if (
    ["INITIATED", "PROCESSING", "IN_PROGRESS", "UNDER_REVIEW"].includes(status)
  ) {
    return "status status-info";
  }

  if (["PENDING", "LOGIN", "LOGGED_IN", ""].includes(status)) {
    return "status status-warning";
  }

  return "status status-neutral";
};

const formatFlag = (value) => {
  if (!hasValue(value)) {
    return "—";
  }

  const normalized = normalizeStatus(value);

  if (["0", "NO", "N", "FALSE"].includes(normalized)) {
    return "No";
  }

  if (["1", "YES", "Y", "TRUE"].includes(normalized)) {
    return "Yes";
  }

  return String(value);
};

const getFlagClass = (value) => {
  const formatted = normalizeStatus(formatFlag(value));

  if (formatted === "NO") {
    return "risk-flag risk-good";
  }

  if (formatted === "YES") {
    return "risk-flag risk-bad";
  }

  return "risk-value";
};

/* =========================================================
   FIELD
========================================================= */

function Field({ label, value, highlight = false, isStatus = false }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>

      {isStatus ? (
        <span className={getStatusClass(value)}>
          {hasValue(value)
            ? String(value).replaceAll("_", " ").toUpperCase()
            : "—"}
        </span>
      ) : (
        <span
          className={
            highlight ? "field-value field-value-highlight" : "field-value"
          }
        >
          {hasValue(value) ? value : "—"}
        </span>
      )}
    </div>
  );
}

/* =========================================================
   SECTION
========================================================= */

function SectionCard({ title, icon, children }) {
  return (
    <section className="section-card">
      <div className="section-heading">
        <div className="section-title-wrap">
          <span className="section-icon">{icon}</span>

          <h2 className="section-title">{title}</h2>
        </div>
      </div>

      {children}
    </section>
  );
}

/* =========================================================
   LINK FIELD
========================================================= */

function LinkField({ label, url }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>

      {hasValue(url) ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="kyc-link"
        >
          Open Verification ↗
        </a>
      ) : (
        <span className="field-value">—</span>
      )}
    </div>
  );
}

/* =========================================================
   VERIFICATION CARD
========================================================= */

function VerificationParty({ title, data = {}, showExtended = false }) {
  return (
    <div className="verification-party">
      <div className="verification-party-heading">
        <h3>{title}</h3>

        {data.exists === true && (
          <span className="party-available">Available</span>
        )}
      </div>

      <div className="verification-grid">
        <Field label="PAN Status" value={data.pan_status} isStatus />

        <Field label="Aadhaar Status" value={data.aadhaar_status} isStatus />

        <Field label="Bureau Status" value={data.bureau_status} isStatus />

        {showExtended && (
          <>
            <Field label="Bank Status" value={data.bank_status} isStatus />

            <Field
              label="Agreement E-Sign"
              value={data.agreement_esign_status}
              isStatus
            />
          </>
        )}

        <LinkField label="Aadhaar KYC" url={data.aadhaar_kyc_url} />

        {hasValue(data.aadhaar_initiated_at) && (
          <Field
            label="Aadhaar Initiated At"
            value={formatDateTime(data.aadhaar_initiated_at)}
          />
        )}

        {hasValue(data.aadhaar_verified_at) && (
          <Field
            label="Aadhaar Verified At"
            value={formatDateTime(data.aadhaar_verified_at)}
          />
        )}
      </div>
    </div>
  );
}

/* =========================================================
   BRE FIELD
========================================================= */

function BreField({ label, value, status = false, flag = false }) {
  return (
    <div className="bre-field">
      <span className="field-label">{label}</span>

      {status ? (
        <span className={getStatusClass(value)}>
          {hasValue(value)
            ? String(value).replaceAll("_", " ").toUpperCase()
            : "—"}
        </span>
      ) : flag ? (
        <span className={getFlagClass(value)}>
          {hasValue(value) && "○ "}

          {formatFlag(value)}
        </span>
      ) : (
        <span className="risk-value">{hasValue(value) ? value : "—"}</span>
      )}
    </div>
  );
}

/* =========================================================
   SASWAT
========================================================= */

const SaswatUpdateData = () => {
  const { lan } = useParams();

  const navigate = useNavigate();

  const [details, setDetails] = useState(null);

  const [loading, setLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");

  /* =======================================================
     FETCH SASWAT LOAN-INFO
  ======================================================= */

  useEffect(() => {
    const fetchDetails = async () => {
      if (!lan) {
        setErrorMessage("LAN is missing.");

        setLoading(false);

        return;
      }

      try {
        setLoading(true);

        setErrorMessage("");

        console.log("Fetching Saswat loan:", lan);

        /*
         * ===========================================
         * IMPORTANT
         * ===========================================
         *
         * This is now the Saswat loan-info API.
         *
         * No /all-loans call here.
         */

        const response = await api.get(
  `/loan-booking/loan-info/${encodeURIComponent(lan)}`,
);

        console.log("Saswat loan-info response:", response.data);

        if (!response.data?.success) {
          throw new Error(
            response.data?.message || "Unable to fetch Saswat loan.",
          );
        }

        if (!response.data?.loan) {
          throw new Error("Saswat loan details not found.");
        }

        setDetails(response.data);
      } catch (error) {
        console.error("Saswat loan-info fetch failed:", error);

        console.error("Backend response:", error.response?.data);

        setDetails(null);

        setErrorMessage(
          error.response?.data?.message ||
            error.message ||
            "Failed to fetch Saswat loan details.",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [lan]);

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <>
        <style>{PAGE_CSS}</style>

        <div className="page-state">
          <div className="spinner" />

          <div className="loading-text">Loading Saswat loan profile...</div>
        </div>
      </>
    );
  }

  /* =======================================================
     ERROR
  ======================================================= */

  if (errorMessage) {
    return (
      <>
        <style>{PAGE_CSS}</style>

        <div className="page-error">
          <div className="error-card">
            <div className="error-icon">!</div>

            <h2>Unable to load Saswat loan</h2>

            <p>{errorMessage}</p>

            <button
              type="button"
              className="back-button"
              onClick={() => navigate(-1)}
            >
              ← Back
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!details?.loan) {
    return (
      <>
        <style>{PAGE_CSS}</style>

        <div className="page-error">No Saswat loan details found.</div>
      </>
    );
  }

  /* =======================================================
     RESPONSE OBJECTS
  ======================================================= */

  const { loan, kyc = {}, verification = {} } = details;

  const borrower = kyc.borrower || {};

  const guarantor = kyc.guarantor || {};

  const coApplicant = kyc.co_applicant || {};

  /* =======================================================
     PAGE
  ======================================================= */

  return (
    <div className="saswat-page">
      <style>{PAGE_CSS}</style>

      <div className="page-container">
        {/* ===============================================
            HEADER
        =============================================== */}

        <div className="page-header">
          <button
            type="button"
            className="back-button"
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>

          <div className="page-heading">
            <span>Saswat LAP Loan Profile</span>

            <h1>{loan.customer_name || loan.lan}</h1>

            <div className="header-badges">
              <span className="lan-chip">{loan.lan}</span>

              <span className={getStatusClass(loan.status)}>
                {String(loan.status || "PENDING")
                  .replaceAll("_", " ")
                  .toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <div className="section-list">
          {/* ============================================
              APPLICANT
          ============================================ */}

          <SectionCard title="Applicant Information" icon="👤">
            <div className="field-grid">
              <Field label="LAN" value={loan.lan} highlight />

              <Field label="Partner Loan ID" value={loan.partner_loan_id} />

              <Field
                label="Loan Account Number"
                value={loan.loan_account_number}
              />

              <Field label="Customer Name" value={loan.customer_name} />

              <Field label="First Name" value={loan.first_name} />

              <Field label="Middle Name" value={loan.middle_name} />

              <Field label="Last Name" value={loan.last_name} />

              <Field
                label="Date of Birth"
                value={formatDate(loan.date_of_birth)}
              />

              <Field label="Gender" value={loan.gender} />

              <Field label="Father Name" value={loan.father_name} />

              <Field label="Mother Name" value={loan.mother_name} />

              <Field label="Mobile Number" value={loan.mobile_number} />

              <Field
                label="Alternate Mobile"
                value={loan.alternate_mobile_number}
              />

              <Field label="Email" value={loan.email} />

              <Field label="PAN Number" value={loan.pan_number} />

              <Field label="Aadhaar Number" value={loan.aadhaar_number} />

              <Field label="Status" value={loan.status} isStatus />

              <Field label="Product" value={loan.product} />

              <Field label="Lender" value={loan.lender} />

              <Field label="Lender Type" value={loan.lender_type} />
            </div>
          </SectionCard>

          {/* ============================================
              LOAN
          ============================================ */}

          <SectionCard title="Loan & Financial Details" icon="💰">
            <div className="field-grid">
              <Field
                label="Loan Amount"
                value={formatAmount(loan.loan_amount)}
                highlight
              />

              <Field
                label="Net Disbursement"
                value={formatAmount(loan.net_disbursement)}
              />

              <Field
                label="Interest Rate"
                value={
                  hasValue(loan.interest_rate) ? `${loan.interest_rate}%` : "—"
                }
              />

              <Field
                label="Loan Tenure"
                value={
                  hasValue(loan.loan_tenure)
                    ? `${loan.loan_tenure} Months`
                    : "—"
                }
              />

              <Field label="EMI Amount" value={formatAmount(loan.emi_amount)} />

              <Field
                label="Interest Amount"
                value={formatAmount(loan.interest_amount)}
              />

              <Field
                label="Processing Fee"
                value={formatAmount(loan.processing_fee)}
              />

              <Field
                label="Processing Fee GST"
                value={formatAmount(loan.processing_fee_gst)}
              />

              <Field
                label="CKYC Charges"
                value={formatAmount(loan.ckyc_charges)}
              />

              <Field
                label="CKYC GST"
                value={formatAmount(loan.ckyc_charges_gst)}
              />

              <Field
                label="Document Charges"
                value={formatAmount(loan.document_charges)}
              />

              <Field
                label="Document Charges GST"
                value={formatAmount(loan.document_charges_gst)}
              />

              <Field
                label="Insurance Charges"
                value={formatAmount(loan.insurance_charges)}
              />

              <Field label="Pre EMI" value={formatAmount(loan.pre_emi)} />

              <Field
                label="Other Charges"
                value={formatAmount(loan.other_charges)}
              />

              <Field
                label="Deduction Amount"
                value={formatAmount(loan.deduction_amount)}
              />

              <Field
                label="FLDG Required"
                value={formatAmount(loan.fldg_required)}
              />

              <Field label="Loan Purpose" value={loan.loan_purpose} />
            </div>
          </SectionCard>

          {/* ============================================
              DATES
          ============================================ */}

          <SectionCard title="Loan Dates" icon="📅">
            <div className="field-grid">
              <Field label="Login Date" value={formatDate(loan.login_date)} />

              <Field
                label="Sanction Date"
                value={formatDate(loan.sanction_date)}
              />

              <Field
                label="Agreement Date"
                value={formatDate(loan.agreement_date)}
              />

              <Field
                label="Disbursement Date"
                value={formatDate(loan.disbursement_date)}
              />

              <Field label="Disbursement UTR" value={loan.disbursement_utr} />

              <Field
                label="First EMI Date"
                value={formatDate(loan.first_emi_date)}
              />

              <Field
                label="Tenure End Date"
                value={formatDate(loan.tenure_end_date)}
              />
            </div>
          </SectionCard>

          {/* ============================================
              BANK
          ============================================ */}

          <SectionCard title="Bank Details" icon="🏦">
            <div className="field-grid">
              <Field
                label="Account Holder Name"
                value={loan.account_holder_name}
              />

              <Field label="Bank Name" value={loan.bank_name} />

              <Field label="Bank Branch" value={loan.bank_branch} />

              <Field label="Account Number" value={loan.account_number} />

              <Field label="IFSC Code" value={loan.ifsc} />

              <Field label="Account Type" value={loan.account_type} />

              <Field
                label="Bank Verification"
                value={verification.bank_status}
                isStatus
              />
            </div>
          </SectionCard>

          {/* ============================================
              ADDRESS
          ============================================ */}

          <SectionCard title="Address Details" icon="📍">
            <div className="field-grid">
              <Field label="Current Address" value={loan.current_address} />

              <Field label="Current Pincode" value={loan.current_pincode} />

              <Field label="Permanent Address" value={loan.permanent_address} />

              <Field label="Permanent Pincode" value={loan.permanent_pincode} />

              <Field label="City" value={loan.city} />

              <Field label="District" value={loan.district} />

              <Field label="State" value={loan.state} />

              <Field label="Business Address" value={loan.business_address} />

              <Field label="Business Pincode" value={loan.business_pincode} />
            </div>
          </SectionCard>

          {/* ============================================
              VERIFICATION
          ============================================ */}

          <SectionCard title="Verification Status" icon="✅">
            <div className="verification-stack">
              {/* BORROWER */}

              <VerificationParty
                title="Borrower"
                data={borrower}
                showExtended
              />

              {/* GUARANTOR */}

              {guarantor.exists && (
                <VerificationParty title="Guarantor" data={guarantor} />
              )}

              {/* CO APPLICANT */}

              {coApplicant.exists && (
                <VerificationParty title="Co-Applicant" data={coApplicant} />
              )}
            </div>
          </SectionCard>

          {/* ============================================
              BRE
          ============================================ */}

          <SectionCard title="Risk & BRE Decisioning" icon="⚖️">
            <div className="bre-grid">
              <BreField
                label="BRE Status"
                value={loan.saswat_bre_status}
                status
              />

              <BreField label="BRE Reason" value={loan.saswat_bre_reason} />

              <BreField
                label="BRE Checked At"
                value={formatDateTime(loan.saswat_bre_checked_at)}
              />

              <BreField
                label="Fintree CIBIL"
                value={loan.saswat_bureau_score}
              />

              <BreField
                label="Enquiries (30D)"
                value={loan.saswat_enquiries_30d}
              />

              <BreField label="DPD 3M" value={loan.saswat_dpd_3m_flag} flag />

              <BreField label="DPD 6M" value={loan.saswat_dpd_6m_flag} flag />

              <BreField
                label="DPD 12M Count"
                value={loan.saswat_dpd_12m_count}
              />

              <BreField
                label="60+ DPD"
                value={loan.saswat_dpd_24m_60_flag}
                flag
              />

              <BreField
                label="90+ DPD"
                value={loan.saswat_dpd_36m_90_flag}
                flag
              />

              <BreField
                label="Overdue Flag"
                value={loan.saswat_overdue_flag}
                flag
              />

              <BreField
                label="Written Off"
                value={loan.saswat_writtenoff_flag}
                flag
              />

              <BreField
                label="Moratorium"
                value={loan.saswat_moratorium_flag}
                flag
              />

              <BreField
                label="Restructured"
                value={loan.saswat_restructured_flag}
                flag
              />

              <BreField label="Deviation" value={loan.saswat_deviation} flag />

              <BreField label="EMI Overdue" value={loan.saswat_emi_overdue} />

              <BreField label="CC Overdue" value={loan.saswat_cc_overdue} />
            </div>
          </SectionCard>

          {/* ============================================
              BUSINESS
          ============================================ */}

          <SectionCard title="Business Details" icon="🏢">
            <div className="field-grid">
              <Field label="Business Name" value={loan.business_name} />

              <Field
                label="Business Constitution"
                value={loan.business_constitution}
              />

              <Field label="Industry" value={loan.industry} />

              <Field
                label="Business Vintage"
                value={
                  hasValue(loan.business_vintage_months)
                    ? `${loan.business_vintage_months} Months`
                    : "—"
                }
              />

              <Field
                label="Annual Turnover"
                value={formatAmount(loan.annual_turnover)}
              />

              <Field label="GST Number" value={loan.gst_number} />

              <Field label="Udyam Number" value={loan.udyam_number} />
            </div>
          </SectionCard>

          {/* ============================================
              PROPERTY
          ============================================ */}

          <SectionCard title="Property Details" icon="🏠">
            <div className="field-grid">
              <Field label="Property Type" value={loan.property_type} />

              <Field label="Property Usage" value={loan.property_usage} />

              <Field
                label="Ownership Type"
                value={loan.property_ownership_type}
              />

              <Field label="Property Owner" value={loan.property_owner_name} />

              <Field
                label="Owner Relation"
                value={loan.property_owner_relation}
              />

              <Field
                label="Address Line 1"
                value={loan.property_address_line_1}
              />

              <Field
                label="Address Line 2"
                value={loan.property_address_line_2}
              />

              <Field label="Landmark" value={loan.property_landmark} />

              <Field label="Property City" value={loan.property_city} />

              <Field label="Property District" value={loan.property_district} />

              <Field label="Property State" value={loan.property_state} />

              <Field label="Property Pincode" value={loan.property_pincode} />

              <Field
                label="Area"
                value={
                  hasValue(loan.property_area_sqft)
                    ? `${loan.property_area_sqft} Sq.Ft.`
                    : "—"
                }
              />

              <Field
                label="Property Age"
                value={
                  hasValue(loan.property_age_years)
                    ? `${loan.property_age_years} Years`
                    : "—"
                }
              />

              <Field
                label="Market Value"
                value={formatAmount(loan.property_market_value)}
              />

              <Field
                label="Agreement Value"
                value={formatAmount(loan.property_agreement_value)}
              />

              <Field
                label="Valuation Value"
                value={formatAmount(loan.property_valuation_value)}
                highlight
              />

              <Field
                label="Distress Value"
                value={formatAmount(loan.property_distress_value)}
              />

              <Field
                label="Valuation Date"
                value={formatDate(loan.property_valuation_date)}
              />

              <Field
                label="Valuator Name"
                value={loan.property_valuator_name}
              />

              <Field
                label="Mortgage Status"
                value={loan.property_mortgage_status}
                isStatus
              />

              <Field
                label="Existing Mortgage Lender"
                value={loan.existing_mortgage_lender}
              />

              <Field
                label="Existing Mortgage Outstanding"
                value={formatAmount(loan.existing_mortgage_outstanding)}
              />

              <Field label="Property Remarks" value={loan.property_remarks} />
            </div>
          </SectionCard>

          {/* ============================================
              OTHER
          ============================================ */}

          <SectionCard title="Other Information" icon="📋">
            <div className="field-grid">
              <Field label="RM Name" value={loan.rm_name} />

              <Field label="Remarks" value={loan.remarks} />

              <Field label="Source File" value={loan.source_file} />

              <Field label="Upload Batch ID" value={loan.upload_batch_id} />

              <Field label="Created By" value={loan.created_by} />

              <Field label="Updated By" value={loan.updated_by} />

              <Field
                label="Created At"
                value={formatDateTime(loan.created_at)}
              />

              <Field
                label="Updated At"
                value={formatDateTime(loan.updated_at)}
              />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   CSS
========================================================= */

const PAGE_CSS = `
  * {
    box-sizing: border-box;
  }

  .saswat-page {
    min-height: 100vh;
    padding: 36px 24px 60px;
    background: #f1f5f9;
    font-family: Inter, Arial, sans-serif;
  }

  .page-container {
    width: 100%;
    max-width: 1320px;
    margin: 0 auto;
  }

  /* =========================
     HEADER
  ========================= */

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
    margin-bottom: 30px;
  }

  .back-button {
    padding: 11px 20px;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    background: #ffffff;
    color: #334155;
    cursor: pointer;
    font-size: 14px;
    font-weight: 900;
    transition: 0.2s ease;
  }

  .back-button:hover {
    background: #f8fafc;
    border-color: #94a3b8;
    transform: translateY(-1px);
    box-shadow:
      0 4px 12px
      rgba(15,23,42,.07);
  }

  .page-heading {
    text-align: right;
  }

  .page-heading > span {
    color: #64748b;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .08em;
  }

  .page-heading h1 {
    margin: 6px 0 10px;
    color: #0f172a;
    font-size: 34px;
    font-weight: 900;
    line-height: 1.2;
  }

  .header-badges {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .lan-chip {
    display: inline-flex;
    align-items: center;
    padding: 7px 12px;
    border: 1px solid #bfdbfe;
    border-radius: 999px;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 11px;
    font-weight: 900;
  }

  /* =========================
     SECTIONS
  ========================= */

  .section-list {
    display: grid;
    gap: 28px;
  }

  .section-card {
    padding: 30px;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    background: #ffffff;
    box-shadow:
      0 8px 24px
      rgba(15,23,42,.06);
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 26px;
    padding-bottom: 18px;
    border-bottom: 1px solid #eef2f7;
  }

  .section-title-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .section-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 11px;
    background: #f1f5f9;
    font-size: 20px;
  }

  .section-title {
    margin: 0;
    color: #0f172a;
    font-size: 20px;
    font-weight: 900;
  }

  /* =========================
     FIELDS
  ========================= */

  .field-grid {
    display: grid;
    grid-template-columns:
      repeat(
        auto-fit,
        minmax(230px,1fr)
      );
    gap: 26px 32px;
  }

  .field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-label {
    color: #64748b;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .055em;
    line-height: 1.4;
  }

  .field-value {
    color: #0f172a;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.5;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  .field-value-highlight {
    color: #2563eb;
    font-weight: 900;
  }

  /* =========================
     STATUS
  ========================= */

  .status {
    width: fit-content;
    max-width: 100%;
    padding: 7px 13px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 900;
    line-height: 1.2;
    letter-spacing: .03em;
  }

  .status-success {
    border: 1px solid #bbf7d0;
    background: #dcfce7;
    color: #047857;
  }

  .status-danger {
    border: 1px solid #fecaca;
    background: #fee2e2;
    color: #b91c1c;
  }

  .status-warning {
    border: 1px solid #fde68a;
    background: #fef3c7;
    color: #92400e;
  }

  .status-info {
    border: 1px solid #bfdbfe;
    background: #dbeafe;
    color: #1d4ed8;
  }

  .status-neutral {
    border: 1px solid #cbd5e1;
    background: #f1f5f9;
    color: #475569;
  }

  /* =========================
     VERIFICATION
  ========================= */

  .verification-stack {
    display: grid;
    gap: 18px;
  }

  .verification-party {
    padding: 24px;
    border: 1px solid #dbe3ee;
    border-radius: 15px;
    background: #f8fafc;
  }

  .verification-party-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 24px;
  }

  .verification-party-heading h3 {
    margin: 0;
    color: #0f172a;
    font-size: 15px;
    font-weight: 900;
  }

  .party-available {
    padding: 5px 10px;
    border-radius: 999px;
    background: #dcfce7;
    color: #047857;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .verification-grid {
    display: grid;
    grid-template-columns:
      repeat(
        3,
        minmax(0,1fr)
      );
    gap: 26px 34px;
  }

  .kyc-link {
    width: fit-content;
    color: #2563eb;
    font-size: 14px;
    font-weight: 900;
    text-decoration: none;
  }

  .kyc-link:hover {
    text-decoration: underline;
  }

  /* =========================
     BRE
  ========================= */

  .bre-grid {
    display: grid;
    grid-template-columns:
      repeat(
        4,
        minmax(0,1fr)
      );
    gap: 30px 42px;
  }

  .bre-field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 9px;
  }

  .risk-value {
    color: #0f172a;
    font-size: 15px;
    font-weight: 900;
    line-height: 1.4;
  }

  .risk-flag {
    width: fit-content;
    padding: 4px 8px;
    border-radius: 5px;
    font-size: 14px;
    font-weight: 900;
  }

  .risk-good {
    background: #ecfdf5;
    color: #059669;
  }

  .risk-bad {
    background: #fef2f2;
    color: #dc2626;
  }

  /* =========================
     LOADER
  ========================= */

  .page-state {
    min-height: 70vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 15px;
    background: #f1f5f9;
  }

  .spinner {
    width: 54px;
    height: 54px;
    border: 6px solid #e2e8f0;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation:
      saswat-spin
      .9s
      linear
      infinite;
  }

  @keyframes saswat-spin {
    to {
      transform:
        rotate(360deg);
    }
  }

  .loading-text {
    color: #64748b;
    font-size: 14px;
    font-weight: 800;
  }

  /* =========================
     ERROR
  ========================= */

  .page-error {
    min-height: 70vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 30px;
    background: #f1f5f9;
  }

  .error-card {
    width: 100%;
    max-width: 500px;
    padding: 35px;
    border: 1px solid #fecaca;
    border-radius: 18px;
    background: #ffffff;
    text-align: center;
    box-shadow:
      0 10px 30px
      rgba(15,23,42,.08);
  }

  .error-icon {
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    border-radius: 50%;
    background: #fee2e2;
    color: #b91c1c;
    font-size: 24px;
    font-weight: 900;
  }

  .error-card h2 {
    margin: 0 0 8px;
    color: #0f172a;
    font-size: 21px;
    font-weight: 900;
  }

  .error-card p {
    margin: 0 0 22px;
    color: #64748b;
    font-size: 14px;
  }

  /* =========================
     RESPONSIVE
  ========================= */

  @media (max-width: 1100px) {
    .bre-grid {
      grid-template-columns:
        repeat(
          3,
          minmax(0,1fr)
        );
    }
  }

  @media (max-width: 900px) {
    .saswat-page {
      padding: 28px 18px;
    }

    .section-card {
      padding: 24px;
    }

    .field-grid,
    .verification-grid,
    .bre-grid {
      grid-template-columns:
        repeat(
          2,
          minmax(0,1fr)
        );
    }
  }

  @media (max-width: 700px) {
    .saswat-page {
      padding:
        20px
        12px
        40px;
    }

    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .page-heading {
      width: 100%;
      text-align: left;
    }

    .page-heading h1 {
      font-size: 26px;
    }

    .header-badges {
      justify-content: flex-start;
    }

    .section-list {
      gap: 20px;
    }

    .section-card {
      padding: 20px;
      border-radius: 16px;
    }

    .section-title {
      font-size: 17px;
    }

    .verification-party {
      padding: 18px;
    }

    .field-grid,
    .verification-grid,
    .bre-grid {
      grid-template-columns: 1fr;
    }
  }
`;

export default SaswatUpdateData;
