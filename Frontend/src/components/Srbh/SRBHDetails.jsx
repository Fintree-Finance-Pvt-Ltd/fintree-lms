import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "../../api/api";

const SRBHDetails = () => {
  const [searchParams] = useSearchParams();
  const lan = searchParams.get("lan");
  const navigate = useNavigate();

  const [details, setDetails] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!lan) {
        setErr("LAN is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErr("");

        const res = await api.get(`/srbh/customer-details/${lan}`);
        setDetails(res.data);
      } catch (e) {
        console.error("Failed to fetch SRBH details:", e);
        setErr(e.response?.data?.message || "Failed to fetch customer details.");
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [lan]);

  if (loading) {
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
        />
        <style>
          {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
        </style>
      </div>
    );
  }

  if (err) {
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
  }

  if (!details) {
    return (
      <p style={{ padding: 40, fontSize: "20px", color: "#6b7280" }}>
        No data found.
      </p>
    );
  }

  const apiLoan = details.loan || details;
  const bre = details.bre || {};
  const bureauScreening = details.bureau_screening || {};
  const verificationStatus = apiLoan.verification_status || {};

  const loan = {
    ...apiLoan,

    requested_loan_amount: apiLoan.loan_details?.requested_loan_amount,
    loan_amount: apiLoan.loan_details?.loan_amount,
    processing_fee: apiLoan.loan_details?.processing_fee,
    processing_fee_percentage: apiLoan.loan_details?.processing_fee_percentage,
    disbursal_amount: apiLoan.loan_details?.disbursal_amount,
    interest_rate: apiLoan.loan_details?.interest_rate,
    loan_tenure: apiLoan.loan_details?.loan_tenure,
    emi_amount: apiLoan.loan_details?.emi_amount,
    agreement_date: apiLoan.loan_details?.agreement_date,
    reducing_roi: apiLoan.loan_details?.reducing_roi,
    flat_interest: apiLoan.loan_details?.flat_interest,
    pre_emi_interest: apiLoan.loan_details?.pre_emi_interest,
    total_repayment: apiLoan.loan_details?.total_repayment,
    gps_charges: apiLoan.loan_details?.gps_charges,

    permanent_address_line_1: apiLoan.permanent_address?.address_line_1,
    permanent_address_line_2: apiLoan.permanent_address?.address_line_2,
    permanent_village_city: apiLoan.permanent_address?.city,
    permanent_district: apiLoan.permanent_address?.district,
    permanent_state: apiLoan.permanent_address?.state,
    permanent_pincode: apiLoan.permanent_address?.pincode,

    guarantor_name: apiLoan.guarantor?.name,
    guarantor_dob: apiLoan.guarantor?.dob,
    guarantor_pan: apiLoan.guarantor?.pan,
    guarantor_mobile: apiLoan.guarantor?.mobile,
    guarantor_email: apiLoan.guarantor?.email,
    relationship_with_borrower: apiLoan.guarantor?.relationship_with_borrower,
    guarantor_address_line_1: apiLoan.guarantor?.address?.address_line_1,
    guarantor_address_line_2: apiLoan.guarantor?.address?.address_line_2,
    guarantor_village_city: apiLoan.guarantor?.address?.city,
    guarantor_district: apiLoan.guarantor?.address?.district,
    guarantor_state: apiLoan.guarantor?.address?.state,
    guarantor_pincode: apiLoan.guarantor?.address?.pincode,
    guarantor_driving_licence: apiLoan.guarantor?.driving_licence,

    co_applicant_name: apiLoan.co_applicant?.name,
    co_applicant_dob: apiLoan.co_applicant?.dob,
    co_applicant_pan: apiLoan.co_applicant?.pan,
    co_applicant_mobile: apiLoan.co_applicant?.mobile,
    co_applicant_email: apiLoan.co_applicant?.email,
    co_applicant_address_line_1: apiLoan.co_applicant?.address?.address_line_1,
    co_applicant_address_line_2: apiLoan.co_applicant?.address?.address_line_2,
    co_applicant_village_city: apiLoan.co_applicant?.address?.city,
    co_applicant_district: apiLoan.co_applicant?.address?.district,
    co_applicant_state: apiLoan.co_applicant?.address?.state,
    co_applicant_pincode: apiLoan.co_applicant?.address?.pincode,
    co_applicant_driving_licence: apiLoan.co_applicant?.driving_licence,

    customer_name_as_per_bank: apiLoan.bank_details?.customer_name_as_per_bank,
    customer_bank_name: apiLoan.bank_details?.customer_bank_name,
    customer_account_number: apiLoan.bank_details?.customer_account_number,
    bank_ifsc_code: apiLoan.bank_details?.bank_ifsc_code,
    bank_status: apiLoan.bank_details?.bank_status,
    bank_account_type: apiLoan.bank_details?.bank_account_type,
    bank_branch_address: apiLoan.bank_details?.bank_branch_address,

    selected_dealer_application_id:
      apiLoan.dealer_details?.selected_dealer_application_id,
    dealer_id: apiLoan.dealer_details?.dealer_id,
    trade_name: apiLoan.dealer_details?.trade_name,
    dealer_name: apiLoan.dealer_details?.dealer_name,
    dealer_contact: apiLoan.dealer_details?.dealer_contact,
    dealer_email: apiLoan.dealer_details?.dealer_email,
    gst_no: apiLoan.dealer_details?.gst_no,
    pan_number: apiLoan.dealer_details?.pan_number,
    dealer_address: apiLoan.dealer_details?.dealer_address,
    dealer_city: apiLoan.dealer_details?.dealer_city,
    dealer_state: apiLoan.dealer_details?.dealer_state,
    dealer_pincode: apiLoan.dealer_details?.dealer_pincode,
    dealer_bank_name: apiLoan.dealer_details?.dealer_bank_name,
    dealer_account_number: apiLoan.dealer_details?.dealer_account_number,
    dealer_ifsc: apiLoan.dealer_details?.dealer_ifsc,
    dealer_name_in_bank: apiLoan.dealer_details?.dealer_name_in_bank,

    selected_product_id: apiLoan.product_details?.selected_product_id,
    product_type: apiLoan.product_details?.product_type,
    battery_name: apiLoan.product_details?.battery_name,
    battery_type: apiLoan.product_details?.battery_type,
    battery_serial_no_1: apiLoan.product_details?.battery_serial_no_1,
    battery_serial_no_2: apiLoan.product_details?.battery_serial_no_2,
    e_rikshaw_model: apiLoan.product_details?.e_rikshaw_model,
    chassis_no: apiLoan.product_details?.chassis_no,

    insurance_cost: apiLoan.insurance_details?.insurance_cost,
    insurance_company_provider:
      apiLoan.insurance_details?.insurance_company_provider,
    insurance_policy_number:
      apiLoan.insurance_details?.insurance_policy_number,
    policy_issued_date: apiLoan.insurance_details?.policy_issued_date,
    period_of_insurance: apiLoan.insurance_details?.period_of_insurance,

    cost_of_vehicle: apiLoan.vehicle_details?.cost_of_vehicle,
    manufacturing_year: apiLoan.vehicle_details?.manufacturing_year,
    downpayment_paid_by_borrower:
      apiLoan.vehicle_details?.downpayment_paid_by_borrower,
    vehicle_registration_cost:
      apiLoan.vehicle_details?.vehicle_registration_cost,
    sales_invoice_number: apiLoan.vehicle_details?.sales_invoice_number,
    sales_invoice_date: apiLoan.vehicle_details?.sales_invoice_date,

    srbh_bureau_screening_status: bureauScreening.status,
    srbh_bureau_screening_reason: bureauScreening.reason,
    srbh_bureau_screening_checked_at: bureauScreening.checked_at,

    borrower_mobile_verified: apiLoan.verification?.borrower_mobile_verified,
    guarantor_mobile_verified: apiLoan.verification?.guarantor_mobile_verified,
    co_applicant_mobile_verified:
      apiLoan.verification?.co_applicant_mobile_verified,

    agreement_esign_status: apiLoan.agreement?.agreement_esign_status,
    agreement_esign_sent_at: apiLoan.agreement?.agreement_esign_sent_at,

    srbh_bre_status: bre.bre_status,
    srbh_bre_reason: bre.bre_reason,
    srbh_bre_checked_at: bre.bre_checked_at,
    fintree_cibil_score: bre.fintree_cibil_score,
    cibil_score: bre.cibil_score,
    srbh_enquiries_30d: bre.enquiries_30d,
    srbh_dpd_3m_flag: bre.dpd_3m_flag,
    srbh_dpd_6m_flag: bre.dpd_6m_flag,
    srbh_overdue_3m_flag: bre.overdue_3m_flag,
    srbh_overdue_12m_flag: bre.overdue_12m_flag,
    srbh_written_off_3y_flag: bre.written_off_3y_flag,
    srbh_60plus_6m_flag: bre.dpd_60plus_6m_flag,
    srbh_90plus_6m_flag: bre.dpd_90plus_6m_flag,
    srbh_60plus_24m_flag: bre.dpd_60plus_24m_flag,
    srbh_90plus_36m_flag: bre.dpd_90plus_36m_flag,
    srbh_emi_overdue_amount: bre.emi_overdue_amount,
    srbh_cc_overdue_amount: bre.cc_overdue_amount,
    srbh_deviation_flag: bre.deviation_flag,
  };

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

  const formatDateTime = (d) => {
    if (!d) return "—";

    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;

    return dt.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const hasValue = (value) =>
    value !== null && value !== undefined && String(value).trim() !== "";

  const formatCurrency = (value) => {
    if (!hasValue(value)) return "—";

    const num = Number(value);
    if (Number.isNaN(num)) return `₹${value}`;

    return `₹${num.toLocaleString("en-IN")}`;
  };

  const formatPercent = (value) => {
    if (!hasValue(value)) return "—";
    return `${value}%`;
  };

  const mobileStatus = (value) => {
    return Number(value) === 1 ? "VERIFIED" : "PENDING";
  };

  const sections = [
    {
      title: "Applicant Information",
      icon: "👤",
      content: (
        <Grid>
          <Field label="LAN" value={loan.lan} highlight />
          <Field label="Partner Loan ID" value={loan.partner_loan_id} />
          <Field label="Lender Type" value={loan.lender_type} />
          <Field label="Lender" value={loan.lender} />
          <Field label="Product" value={loan.product} />
          <Field label="Login Date" value={formatDate(loan.login_date)} />

          <Field label="Customer Name" value={loan.customer_name} />
          <Field label="First Name" value={loan.first_name} />
          <Field label="Last Name" value={loan.last_name} />
          <Field label="Father Name" value={loan.father_name} />
          <Field label="PAN Number" value={loan.pan_card} />
          <Field label="Driving Licence" value={loan.driving_licence} />
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
      content: hasValue(loan.guarantor_name) ? (
        <Grid>
          <Field label="Guarantor Name" value={loan.guarantor_name} />
          <Field label="Guarantor PAN" value={loan.guarantor_pan} />
          <Field
            label="Guarantor Driving Licence"
            value={loan.guarantor_driving_licence}
          />
          <Field label="Guarantor Mobile" value={loan.guarantor_mobile} />
          <Field label="Guarantor Email" value={loan.guarantor_email} />
          <Field label="Guarantor DOB" value={formatDate(loan.guarantor_dob)} />
          <Field
            label="Relationship With Borrower"
            value={loan.relationship_with_borrower}
          />
          <Field
            label="Address Line 1"
            value={loan.guarantor_address_line_1}
          />
          <Field
            label="Address Line 2"
            value={loan.guarantor_address_line_2}
          />
          <Field label="Village / City" value={loan.guarantor_village_city} />
          <Field label="District" value={loan.guarantor_district} />
          <Field label="State" value={loan.guarantor_state} />
          <Field label="Pincode" value={loan.guarantor_pincode} />
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
      content: hasValue(loan.co_applicant_name) ? (
        <Grid>
          <Field label="Co-Applicant Name" value={loan.co_applicant_name} />
          <Field label="Co-Applicant PAN" value={loan.co_applicant_pan} />
          <Field
            label="Co-Applicant Driving Licence"
            value={loan.co_applicant_driving_licence}
          />
          <Field label="Co-Applicant Mobile" value={loan.co_applicant_mobile} />
          <Field label="Co-Applicant Email" value={loan.co_applicant_email} />
          <Field
            label="Co-Applicant DOB"
            value={formatDate(loan.co_applicant_dob)}
          />
          <Field
            label="Address Line 1"
            value={loan.co_applicant_address_line_1}
          />
          <Field
            label="Address Line 2"
            value={loan.co_applicant_address_line_2}
          />
          <Field
            label="Village / City"
            value={loan.co_applicant_village_city}
          />
          <Field label="District" value={loan.co_applicant_district} />
          <Field label="State" value={loan.co_applicant_state} />
          <Field label="Pincode" value={loan.co_applicant_pincode} />
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
            value={formatCurrency(loan.requested_loan_amount)}
            highlight
          />
          <Field
            label="Loan Amount"
            value={formatCurrency(loan.loan_amount)}
            highlight
          />
          <Field
            label="Disbursal Amount"
            value={formatCurrency(loan.disbursal_amount)}
            highlight
          />
          <Field
            label="Tenure"
            value={
              hasValue(loan.loan_tenure) ? `${loan.loan_tenure} Months` : "—"
            }
          />
          <Field
            label="Interest Rate"
            value={formatPercent(loan.interest_rate)}
          />
          <Field
            label="Processing Fee"
            value={formatCurrency(loan.processing_fee)}
          />
          <Field
            label="Processing Fee %"
            value={formatPercent(loan.processing_fee_percentage)}
          />
          <Field label="GPS Charges" value={formatCurrency(loan.gps_charges)} />
          <Field label="EMI Amount" value={formatCurrency(loan.emi_amount)} />
          <Field label="Reducing ROI" value={formatPercent(loan.reducing_roi)} />
          <Field
            label="Flat Interest"
            value={formatCurrency(loan.flat_interest)}
          />
          <Field
            label="Pre EMI Interest"
            value={formatCurrency(loan.pre_emi_interest)}
          />
          <Field
            label="Total Repayment"
            value={formatCurrency(loan.total_repayment)}
          />
          <Field label="CIBIL Score" value={loan.cibil_score} />
          <Field label="Fintree CIBIL Score" value={loan.fintree_cibil_score} />
        </Grid>
      ),
    },
    {
      title: "Bank Details",
      icon: "🏦",
      content: (
        <Grid>
          <Field label="Bank Name" value={loan.customer_bank_name} />
          <Field
            label="Account Holder"
            value={loan.customer_name_as_per_bank}
          />
          <Field label="Account Number" value={loan.customer_account_number} />
          <Field label="IFSC Code" value={loan.bank_ifsc_code} />
          <Field label="Branch Address" value={loan.bank_branch_address} />
          <Field label="Bank Account Type" value={loan.bank_account_type} />
          <Field label="Bank Status" value={loan.bank_status} isStatus />
        </Grid>
      ),
    },
    {
      title: "Address Details",
      icon: "📍",
      content: (
        <Grid>
          <Field label="Address Line 1" value={loan.permanent_address_line_1} />
          <Field label="Address Line 2" value={loan.permanent_address_line_2} />
          <Field label="Village / City" value={loan.permanent_village_city} />
          <Field label="District" value={loan.permanent_district} />
          <Field label="State" value={loan.permanent_state} />
          <Field label="Pincode" value={loan.permanent_pincode} />
        </Grid>
      ),
    },
    {
      title: "Dealer Details",
      icon: "🏪",
      content: (
        <Grid>
          <Field
            label="Selected Dealer Application ID"
            value={loan.selected_dealer_application_id}
          />
          <Field label="Dealer ID" value={loan.dealer_id} />
          <Field label="Dealer Name" value={loan.dealer_name} />
          <Field label="Trade Name" value={loan.trade_name} />
          <Field label="Dealer Contact" value={loan.dealer_contact} />
          <Field label="Dealer Email" value={loan.dealer_email} />
          <Field label="GST Number" value={loan.gst_no} />
          <Field label="Dealer PAN Number" value={loan.pan_number} />
          <Field label="Dealer Address" value={loan.dealer_address} />
          <Field label="Dealer City" value={loan.dealer_city} />
          <Field label="Dealer State" value={loan.dealer_state} />
          <Field label="Dealer Pincode" value={loan.dealer_pincode} />
        </Grid>
      ),
    },
    {
      title: "Dealer Bank Details",
      icon: "🏛️",
      content: (
        <Grid>
          <Field label="Dealer Bank Name" value={loan.dealer_bank_name} />
          <Field
            label="Dealer Account Number"
            value={loan.dealer_account_number}
          />
          <Field label="Dealer IFSC" value={loan.dealer_ifsc} />
          <Field label="Dealer Name In Bank" value={loan.dealer_name_in_bank} />
        </Grid>
      ),
    },
    {
      title: "Product Details",
      icon: "🛺",
      content: (
        <Grid>
          <Field label="Product Type" value={loan.product_type} />
          <Field label="Selected Product ID" value={loan.selected_product_id} />
          <Field label="E-Rickshaw Model" value={loan.e_rikshaw_model} />
          <Field label="Battery Name" value={loan.battery_name} />
          <Field label="Battery Type" value={loan.battery_type} />
          <Field
            label="Battery Serial No 1"
            value={loan.battery_serial_no_1}
          />
          <Field
            label="Battery Serial No 2"
            value={loan.battery_serial_no_2}
          />
          <Field label="Chassis No" value={loan.chassis_no} />
        </Grid>
      ),
    },
    {
      title: "Insurance Details",
      icon: "🛡️",
      content: (
        <Grid>
          <Field
            label="Insurance Cost"
            value={formatCurrency(loan.insurance_cost)}
          />
          <Field
            label="Insurance Provider"
            value={loan.insurance_company_provider}
          />
          <Field
            label="Policy Number"
            value={loan.insurance_policy_number}
          />
          <Field
            label="Policy Issued Date"
            value={formatDate(loan.policy_issued_date)}
          />
          <Field
            label="Period Of Insurance"
            value={loan.period_of_insurance}
          />
        </Grid>
      ),
    },
    {
      title: "Vehicle Details",
      icon: "🚚",
      content: (
        <Grid>
          <Field
            label="Cost Of Vehicle"
            value={formatCurrency(loan.cost_of_vehicle)}
            highlight
          />
          <Field label="Manufacturing Year" value={loan.manufacturing_year} />
          <Field
            label="Downpayment Paid By Borrower"
            value={formatCurrency(loan.downpayment_paid_by_borrower)}
          />
          <Field
            label="Vehicle Registration Cost"
            value={formatCurrency(loan.vehicle_registration_cost)}
          />
          <Field
            label="Sales Invoice Number"
            value={loan.sales_invoice_number}
          />
          <Field
            label="Sales Invoice Date"
            value={formatDate(loan.sales_invoice_date)}
          />
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
            data={{
              ...verificationStatus.borrower,
              mobile_status: mobileStatus(loan.borrower_mobile_verified),
            }}
          />

          {hasValue(loan.guarantor_name) && (
            <ApplicantVerificationBlock
              title="Guarantor"
              data={{
                ...verificationStatus.guarantor,
                mobile_status: mobileStatus(loan.guarantor_mobile_verified),
              }}
            />
          )}

          {hasValue(loan.co_applicant_name) && (
            <ApplicantVerificationBlock
              title="Co-Applicant"
              data={{
                ...verificationStatus.co_applicant,
                mobile_status: mobileStatus(loan.co_applicant_mobile_verified),
              }}
            />
          )}
        </div>
      ),
    },
    {
      title: "Agreement & Disbursal Status",
      icon: "📝",
      content: (
        <Grid>
          <Field
            label="Agreement E-Sign Status"
            value={loan.agreement_esign_status}
            isStatus
          />
          <Field
            label="Agreement E-Sign Sent At"
            value={formatDateTime(loan.agreement_esign_sent_at)}
          />
          <Field label="Agreement Date" value={formatDate(loan.agreement_date)} />
          <Field label="Bank Status" value={loan.bank_status} isStatus />
          <Field label="Created At" value={formatDateTime(loan.created_at)} />
          <Field label="Last Updated" value={formatDateTime(loan.updated_at)} />
        </Grid>
      ),
    },
    {
      title: "Borrower Bureau Pre-Screening",
      icon: "🔎",
      content: (
        <Grid>
          <Field
            label="Pre-BRE Status"
            value={loan.srbh_bureau_screening_status}
            isStatus
          />
          <Field
            label="Pre-BRE Reason"
            value={loan.srbh_bureau_screening_reason}
          />
          <Field
            label="Pre-BRE Checked At"
            value={formatDateTime(loan.srbh_bureau_screening_checked_at)}
          />
        </Grid>
      ),
    },
    {
      title: "Final BRE Decisioning",
      icon: "⚖️",
      content: (
        <Grid>
          <Field label="SRBH BRE Status" value={loan.srbh_bre_status} isStatus />
          <Field label="SRBH BRE Reason" value={loan.srbh_bre_reason} />
          <Field
            label="BRE Checked At"
            value={formatDateTime(loan.srbh_bre_checked_at)}
          />
          <Field label="Fintree CIBIL" value={loan.fintree_cibil_score} />
          <Field label="CIBIL Score" value={loan.cibil_score} />
          <Field label="Enquiries 30D" value={loan.srbh_enquiries_30d} />

          <FlagField label="DPD 3M" value={loan.srbh_dpd_3m_flag} />
          <FlagField label="Overdue 3M" value={loan.srbh_overdue_3m_flag} />
          <FlagField
            label="Written Off 3Y"
            value={loan.srbh_written_off_3y_flag}
          />
          <FlagField label="60+ DPD 6M" value={loan.srbh_60plus_6m_flag} />
          <FlagField label="90+ DPD 6M" value={loan.srbh_90plus_6m_flag} />
          <FlagField label="Deviation" value={loan.srbh_deviation_flag} />

          <Field
            label="EMI Overdue"
            value={formatCurrency(loan.srbh_emi_overdue_amount)}
          />
          <Field
            label="CC Overdue"
            value={formatCurrency(loan.srbh_cc_overdue_amount)}
          />
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
              SRBH Profile
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "35px",
          }}
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
  const hasValue = (v) =>
    v !== null && v !== undefined && String(v).trim() !== "";

  const statusColors = {
    APPROVED: { bg: "#bbf7d0", text: "#14532d" },
    SUCCESS: { bg: "#bbf7d0", text: "#14532d" },
    VERIFIED: { bg: "#bbf7d0", text: "#14532d" },
    COMPLETED: { bg: "#bbf7d0", text: "#14532d" },
    DISBURSED: { bg: "#dcfce7", text: "#166534" },
    "BUREAU APPROVED": { bg: "#bbf7d0", text: "#14532d" },
    "BRE APPROVED": { bg: "#bbf7d0", text: "#14532d" },
    "CREDIT APPROVED": { bg: "#bbf7d0", text: "#14532d" },

    REJECTED: { bg: "#fecaca", text: "#7f1d1d" },
    FAILED: { bg: "#fecaca", text: "#7f1d1d" },
    "BUREAU REJECTED": { bg: "#fecaca", text: "#7f1d1d" },
    "BRE REJECTED": { bg: "#fecaca", text: "#7f1d1d" },
    "CREDIT REJECTED": { bg: "#fecaca", text: "#7f1d1d" },

    PENDING: { bg: "#fef08a", text: "#713f12" },
    INITIATED: { bg: "#dbeafe", text: "#1e40af" },
    "CREDIT INITIATED": { bg: "#dbeafe", text: "#1e40af" },
    "OPERATIONS INITIATED": { bg: "#dbeafe", text: "#1e40af" },
    LOGIN: { bg: "#e0f2fe", text: "#075985" },
  };

  const normalizedStatus = String(value || "PENDING").toUpperCase();

  const s = isStatus
    ? statusColors[normalizedStatus] || {
        bg: "#f1f5f9",
        text: "#475569",
      }
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
            border: "1px solid rgba(0,0,0,0.05)",
          }}
        >
          {normalizedStatus}
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
          {hasValue(value) ? value : "—"}
        </div>
      )}
    </div>
  );
};

const ApplicantVerificationBlock = ({ title, data }) => {
  const status = data || {};

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
        <VerificationField
          label="Mobile Status"
          value={status.mobile_status || "PENDING"}
        />
        <VerificationField
          label="PAN Status"
          value={status.pan_status || "PENDING"}
        />
        <VerificationField
          label="Aadhaar Status"
          value={status.aadhaar_status || "PENDING"}
        />
        <VerificationField
          label="Bureau Status"
          value={status.bureau_status || "PENDING"}
        />
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
    SUCCESS: {
      bg: "#dcfce7",
      text: "#166534",
      border: "#bbf7d0",
    },
    FAILED: {
      bg: "#fee2e2",
      text: "#991b1b",
      border: "#fecaca",
    },
    REJECTED: {
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

const FlagField = ({ label, value }) => {
  const isYes = value === 1 || value === "1" || value === "Y" || value === true;
  const isNo =
    value === 0 || value === "0" || value === "N" || value === false;

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

      <div style={{ fontSize: "16px", fontWeight: 800 }}>
        {isYes ? (
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
        ) : isNo ? (
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
};

export default SRBHDetails;
