import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../../api/api";

// CSS stays inside this JSX component. No separate CSS import.
const css = `
  .nyd-page{min-height:100vh;background:#f1f5f9;padding:30px 24px 56px;font-family:Inter,Arial,sans-serif;color:#0f172a}
  .nyd-container{max-width:1320px;margin:0 auto}
  .nyd-header{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap;margin-bottom:26px}
  .nyd-back,.nyd-retry{border:1px solid #cbd5e1;background:#fff;color:#334155;padding:11px 19px;border-radius:11px;cursor:pointer;font-weight:750}
  .nyd-retry{background:#0b65a3;color:#fff;border-color:#0b65a3;margin-top:18px}
  .nyd-heading{text-align:right}.nyd-kicker{color:#64748b;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
  .nyd-heading h1{margin:7px 0;font-size:clamp(25px,3vw,36px);overflow-wrap:anywhere}
  .nyd-subline{color:#64748b;font-size:13px}.nyd-cards{display:grid;gap:22px}
  .nyd-card{background:#fff;border:1px solid #e2e8f0;border-radius:19px;padding:26px 29px;box-shadow:0 5px 18px #0f172a08}
  .nyd-card-title{display:flex;align-items:center;gap:12px;margin:0 0 23px;padding-bottom:14px;border-bottom:1px solid #e2e8f0;font-size:18px;font-weight:850;text-transform:uppercase}
  .nyd-icon{font-size:23px}.nyd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:25px 30px}
  .nyd-label{color:#94a3b8;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;margin-bottom:7px}
  .nyd-value{font-size:16px;font-weight:700;line-height:1.4;color:#1e293b;overflow-wrap:anywhere}
  .nyd-highlight{color:#0284c7;font-size:19px;font-weight:850}
  .nyd-pill{display:inline-block;font-size:13px;padding:7px 12px;border-radius:8px;font-weight:800;overflow-wrap:anywhere}
  .nyd-pill.ok{background:#dcfce7;color:#166534}.nyd-pill.warn{background:#fef3c7;color:#92400e}
  .nyd-pill.bad{background:#fee2e2;color:#991b1b}.nyd-pill.info{background:#dbeafe;color:#1d4ed8}
  .nyd-pill.neutral{background:#f1f5f9;color:#475569}
  .nyd-note{margin:16px 0 0;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;border-radius:10px;font-size:13px;line-height:1.5}
  .nyd-table-wrap{width:100%;overflow-x:auto;border:1px solid #e2e8f0;border-radius:12px}
  .nyd-table{border-collapse:collapse;width:100%;min-width:760px;font-size:13px}
  .nyd-table th{background:#f1f5f9;color:#475569;font-size:11px;text-transform:uppercase;text-align:left;white-space:nowrap}
  .nyd-table th,.nyd-table td{padding:13px 14px;border-bottom:1px solid #e2e8f0}
  .nyd-table tr:last-child td{border-bottom:0}.nyd-table td{font-weight:600}
  .nyd-subsection+.nyd-subsection{margin-top:30px;padding-top:26px;border-top:1px solid #e2e8f0}
  .nyd-subsection-title{margin:0 0 22px;color:#0f274a;font-size:15px;font-weight:850}
  .nyd-risk-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:35px;row-gap:30px}
  .nyd-flag{display:inline-block;padding:5px 11px;font-weight:800;border-radius:8px;font-size:14px}
  .nyd-flag.yes{background:#fef2f2;color:#dc2626}.nyd-flag.no{background:#f0fdf4;color:#15803d}
  .nyd-flag.na{background:#f1f5f9;color:#64748b}
  .nyd-state{padding:55px 20px;text-align:center;color:#64748b;font-size:16px}
  .nyd-error{color:#b91c1c}.nyd-error-detail{color:#64748b;font-size:13px;margin-top:12px}
  @media(max-width:1100px){.nyd-risk-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media(max-width:800px){.nyd-risk-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:650px){.nyd-page{padding:20px 12px 40px}.nyd-card{padding:20px 17px;border-radius:15px}.nyd-heading{text-align:left}.nyd-header{align-items:flex-start}.nyd-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 12px}.nyd-value{font-size:14px}}
  @media(max-width:440px){.nyd-risk-grid{grid-template-columns:1fr}.nyd-grid{grid-template-columns:1fr}}
`;

const present = (v) => v !== null && v !== undefined && String(v).trim() !== "";
const show = (v) => (present(v) ? String(v) : "—");
const money = (v) => {
  if (!present(v)) return "—";
  const n = Number(v);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(n)
    : show(v);
};
const percent = (v) => (present(v) ? `${v}%` : "—");
const date = (v, withTime = false) => {
  if (!present(v)) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return show(v);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
  }).format(d);
};
const badgeKind = (v) => {
  const x = String(v ?? "").toUpperCase();
  if (/REJECT|FAIL|STOP|EXPIRE|CANCEL/.test(x)) return "bad";
  if (
    /APPROVED|SIGNED|ACTIVE|VERIFIED|DISBURSED|SUCCESS|REGISTERED|PROCEED/.test(
      x,
    )
  )
    return "ok";
  if (/PENDING|REVIEW|WAIT/.test(x)) return "warn";
  if (/INITIATED|PROGRESS|LOGIN/.test(x)) return "info";
  return "neutral";
};

function Field({ label, value, badge = false, highlight = false }) {
  return (
    <div className="nyd-field">
      <div className="nyd-label">{label}</div>
      {badge ? (
        <span className={`nyd-pill ${badgeKind(value)}`}>{show(value)}</span>
      ) : (
        <div className={`nyd-value${highlight ? " nyd-highlight" : ""}`}>
          {show(value)}
        </div>
      )}
    </div>
  );
}
function RiskFlag({ label, value }) {
  const x = String(value ?? "")
    .trim()
    .toUpperCase();
  const yes = ["1", "Y", "YES", "TRUE"].includes(x);
  const no = ["0", "N", "NO", "FALSE"].includes(x);
  return (
    <div className="nyd-field">
      <div className="nyd-label">{label}</div>
      <span className={`nyd-flag ${yes ? "yes" : no ? "no" : "na"}`}>
        {yes ? "● Yes" : no ? "○ No" : "N/A"}
      </span>
    </div>
  );
}
function Section({ title, icon, fields, children, note }) {
  return (
    <section className="nyd-card">
      <h2 className="nyd-card-title">
        <span className="nyd-icon">{icon}</span>
        {title}
      </h2>
      {fields?.length > 0 && (
        <div className="nyd-grid">
          {fields.map((item, i) => (
            <Field key={`${item.label}-${i}`} {...item} />
          ))}
        </div>
      )}
      {children}
      {note && <p className="nyd-note">{note}</p>}
    </section>
  );
}
function RiskGroup({ title, children }) {
  return (
    <div className="nyd-subsection">
      <h3 className="nyd-subsection-title">{title}</h3>
      <div className="nyd-risk-grid">{children}</div>
    </div>
  );
}

const f = (label, value, options = {}) => ({ label, value, ...options });

export default function NiyaraCustomerDetails() {
  const { lan: routeLan } = useParams();
  const [searchParams] = useSearchParams();
  const lan = (routeLan || searchParams.get("lan") || "").trim().toUpperCase();
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const fetchDetails = async () => {
      if (!/^NYRA\d+$/.test(lan)) {
        if (active) {
          setError("Invalid Niyara LAN");
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      setError("");
      setDetails(null);
      try {
        // Do not send custom Cache-Control request headers: they can complicate CORS.
        const response = await api.get(
          `/niyara/customer-details/${encodeURIComponent(lan)}`,
          { timeout: 20000 },
        );
        const raw = response.data || {};
        const body =
          raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data)
            ? raw.data
            : raw;
        const loan = body.loan || raw.loan || (body.lan ? body : null);
        if (!loan?.lan) {
          console.error("[NIYARA] Unexpected customer-details response shape", {
            status: response.status,
            keys: Object.keys(raw || {}),
          });
          throw new Error("API responded, but no loan object was returned.");
        }
        if (active) {
          setDetails({
            loan,
            esign: body.esign || raw.esign || {},
            repayment_schedule: Array.isArray(
              body.repayment_schedule || raw.repayment_schedule,
            )
              ? body.repayment_schedule || raw.repayment_schedule
              : [],
            warnings: body.warnings || raw.warnings || [],
          });
        }
      } catch (err) {
        console.error("[NIYARA] Customer details request failed:", err);
        if (!active) return;
        const status = err?.response?.status;
        const serverMessage = err?.response?.data?.message;
        if (!err?.response) {
          setError(
            err.code === "ECONNABORTED"
              ? "Request timed out. Check whether the backend is responding."
              : "Cannot connect to the LMS API. Check backend port 5000, server logs and CORS.",
          );
        } else if (status === 401 || status === 403) {
          setError(
            serverMessage ||
              "Access denied. Please log in with an authorized staff account.",
          );
        } else if (status === 404) {
          setError(serverMessage || `No Niyara loan found for ${lan}.`);
        } else {
          setError(
            serverMessage || `Unable to fetch details (HTTP ${status}).`,
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchDetails();
    return () => {
      active = false;
    };
  }, [lan, retry]);

  const loan = details?.loan;
  const esign = details?.esign || {};
  const rps = details?.repayment_schedule || [];

  return (
    <div className="nyd-page">
      <style>{css}</style>
      <div className="nyd-container">
        <header className="nyd-header">
          <button
            type="button"
            className="nyd-back"
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
          <div className="nyd-heading">
            <div className="nyd-kicker">Niyara · Unsecured Business Loan</div>
            <h1>{loan?.customer_name || lan || "Customer Details"}</h1>
            <div className="nyd-subline">
              Loan Account: {show(loan?.lan || lan)}
            </div>
          </div>
        </header>

        {loading ? (
          <div className="nyd-state">Loading customer details...</div>
        ) : error ? (
          <div className="nyd-state">
            <div className="nyd-error">{error}</div>
            <div className="nyd-error-detail">
              Endpoint: /api/niyara/customer-details/{lan}
            </div>
            <button
              type="button"
              className="nyd-retry"
              onClick={() => setRetry((n) => n + 1)}
            >
              Retry
            </button>
          </div>
        ) : !loan ? (
          <div className="nyd-state">No loan data found.</div>
        ) : (
          <div className="nyd-cards">
            {details.warnings?.length > 0 && (
              <div className="nyd-note">
                Some optional data could not be loaded:{" "}
                {details.warnings.join(", ")}
              </div>
            )}
            <Section
              title="Application & Applicant Information"
              icon="👤"
              fields={[
                f("LAN", loan.lan, { highlight: true }),
                f("Partner Loan ID", loan.partner_loan_id),
                f("Lender", loan.lender),
                f(
                  "Product / Loan Type",
                  `${show(loan.product)} / ${show(loan.loan_type)}`,
                ),
                f("Status", loan.status, { badge: true }),
                f("Stage", loan.stage, { badge: true }),
                f("Login Date", date(loan.login_date)),
                f("Customer Name", loan.customer_name),
                f("DOB", date(loan.borrower_dob)),
                f("Age", loan.age),
                f("Gender", loan.gender),
                f("Mobile Number", loan.mobile_number),
                f("Email", loan.email),
                f("PAN", loan.pan_number),
                f("Masked Aadhaar", loan.aadhaar_number),
                f("Annual Income", money(loan.annual_income)),
              ]}
            />

            <Section
              title="Residential Address"
              icon="🏠"
              fields={[
                f("Address", loan.customer_address),
                f("Address Line 2", loan.address_line_2),
                f("City", loan.customer_city),
                f("District", loan.district),
                f("State", loan.customer_state),
                f("Pincode", loan.customer_pincode),
              ]}
            />

            <Section
              title="Business & UBL Profile"
              icon="🏢"
              fields={[
                f("Business Name", loan.business_name),
                f("Business Type", loan.business_type),
                f("GST Number", loan.gst_number),
                f("Udyam Number", loan.udyam_number),
                f("Business Vintage", loan.business_vintage),
                f("Industry", loan.industry),
                f("Business Address", loan.business_address),
                f("Business City", loan.business_city),
                f("Business State", loan.business_state),
                f("Business Pincode", loan.business_pincode),
                f("Annual Turnover", money(loan.annual_turnover)),
                f("Net Profit", money(loan.net_profit)),
              ]}
            />

            <Section
              title="Loan & Financials"
              icon="💰"
              fields={[
                f("Requested Amount", money(loan.requested_amount)),
                f("Final Loan Amount", money(loan.loan_amount), {
                  highlight: true,
                }),
                f(
                  "Tenure",
                  present(loan.loan_tenure)
                    ? `${loan.loan_tenure} ${show(loan.tenure_unit)}`
                    : "—",
                ),
                f("Interest Rate", percent(loan.interest)),
                f("Reducing ROI", percent(loan.reducing_roi)),
                f("APR", percent(loan.apr)),
                f("EMI Amount", money(loan.emi_amount)),
                f("Repayment Frequency", loan.repayment_frequency),
                f("Processing Fee", money(loan.processing_fee)),
                f("Insurance", money(loan.insurance_amount)),
                f("Pre-EMI Interest", money(loan.pre_emi_interest)),
                f("Net Disbursement", money(loan.net_disbursement), {
                  highlight: true,
                }),
                f("Total Repayment", money(loan.total_repayment)),
                f("Sanction Date", date(loan.sanction_date)),
              ]}
            />

            <Section
              title="Bank Details & Verification"
              icon="🏦"
              fields={[
                f("Account Holder", loan.name_in_bank),
                f("Bank Name", loan.bank_name),
                f("Account Number (Masked)", loan.account_number),
                f("IFSC", loan.ifsc),
                f("Bank Status", loan.bank_status, { badge: true }),
                f("Mandate UMRN", loan.umrn),
              ]}
              note="Account and mandate details are informational; confirmed provider verification is required."
            />

            <Section title="Credit Policy · Bureau · AML" icon="⚖️">
              <RiskGroup title="Bureau & Risk Assessment">
                <Field
                  label="Fintree CIBIL Score"
                  value={loan.cibil_score}
                  highlight
                />
                <Field
                  label="Enquiries (30D)"
                  value={loan.niyara_enquiries_30d}
                />
                <Field
                  label="Unsecured Enquiries (30D)"
                  value={loan.niyara_unsecured_enquiries_30d}
                />
                <Field
                  label="Active Tradelines"
                  value={loan.niyara_active_tradeline_count}
                />
                <RiskFlag label="DPD 6M" value={loan.niyara_dpd_6m_flag} />
                <RiskFlag
                  label="Settled / Written Off (36M)"
                  value={loan.niyara_settled_writtenoff_36m_flag}
                />
                <RiskFlag
                  label="Willful Default / Suit Filed (3Y)"
                  value={loan.niyara_willful_default_suit_filed_3y_flag}
                />
                <RiskFlag
                  label="Active Overdue (3M)"
                  value={loan.niyara_active_overdue_3m_flag}
                />
                <Field
                  label="Active Overdue Amount"
                  value={money(loan.niyara_active_overdue_amount)}
                />
                <Field
                  label="Existing EMI Obligations"
                  value={money(loan.loanemi_obligations)}
                />
                <Field
                  label="Average Bank Balance (ABB)"
                  value={money(loan.abb_value)}
                />
              </RiskGroup>
              <RiskGroup title="BRE & Credit Policy Decision">
                <Field
                  label="BRE Decision"
                  value={loan.niyara_bre_status}
                  badge
                />
                <Field label="BRE Reason" value={loan.niyara_bre_reason} />
                <Field
                  label="BRE Checked At"
                  value={date(loan.niyara_bre_checked_at, true)}
                />
                <RiskFlag
                  label="Policy Deviation"
                  value={loan.niyara_deviation_flag}
                />
                <Field
                  label="CIBIL Offer"
                  value={money(loan.niyara_cibil_offer)}
                />
                <Field label="ABB Offer" value={money(loan.niyara_abb_offer)} />
                <Field
                  label="Final BRE Offer"
                  value={money(loan.niyara_final_offer)}
                  highlight
                />
              </RiskGroup>
              <RiskGroup title="AML Screening">
                <Field label="AML Status" value={loan.aml_status} badge />
                <Field label="AML Score" value={loan.aml_score} />
                <Field label="Total Matches" value={loan.aml_total_matches} />
                <Field label="AML Reason" value={loan.aml_reason} />
                <Field
                  label="AML Checked At"
                  value={date(loan.aml_checked_at, true)}
                />
              </RiskGroup>
            </Section>


            <Section
              title="Sanction · Agreement eSign · eNACH"
              icon="📄"
              fields={[
                f(
                  "Sanction eSign Status",
                  esign.sanction?.status || loan.sanction_esign_status,
                  { badge: true },
                ),
                f(
                  "Sanction Doqfy Document ID",
                  esign.sanction?.document_id ||
                    loan.sanction_esign_document_id,
                ),
                f(
                  "Agreement eSign Status",
                  esign.agreement?.status || loan.agreement_esign_status,
                  { badge: true },
                ),
                f(
                  "Agreement Doqfy Document ID",
                  esign.agreement?.document_id ||
                    loan.agreement_esign_document_id,
                ),
                f(
                  "Agreement Sent At",
                  date(loan.agreement_esign_sent_at, true),
                ),
                f("eNACH / Bank Status", loan.bank_status, { badge: true }),
                f("UMRN", loan.umrn),
              ]}
              note="INITIATED does not mean SIGNED. Only verified provider updates should mark signing or mandate completion."
            />

          </div>
        )}
      </div>
    </div>
  );
}
