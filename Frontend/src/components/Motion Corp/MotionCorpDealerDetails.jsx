import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/api";

const MotionCorpDealerDetails = () => {

  const { lan } = useParams();
  const navigate = useNavigate();

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  /*
  ==========================
  FETCH DEALER DETAILS
  ==========================
  */
  useEffect(() => {

    const fetchDetails = async () => {
      try {
        setLoading(true);
        setErr("");

        const res = await api.get(`/motion-corp/dealer-details/${lan}`);
        setDetails(res.data);

      } catch (e) {
        console.error(e);
        setErr("Failed to fetch dealer details");
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();

  }, [lan]);

  if (loading) return <p style={{ padding: 20 }}>Loading...</p>;
  if (err) return <p style={{ padding: 20, color: "red" }}>{err}</p>;
  if (!details) return <p style={{ padding: 20 }}>No data found</p>;

  const dealer = details;

  /*
  ==========================
  UI
  ==========================
  */
  return (
    <div style={{
      background: "#f1f5f9",
      minHeight: "100vh",
      padding: "50px 25px",
      fontFamily: "Inter"
    }}>

      <div style={{ maxWidth: "1300px", margin: "0 auto" }}>

        {/* HEADER */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "40px"
        }}>

          <button
            onClick={() => navigate(-1)}
            style={{
              padding: "12px 20px",
              borderRadius: "10px",
              border: "1px solid #e2e8f0",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 700
            }}
          >
            ← Back
          </button>

          <div style={{ textAlign: "right" }}>
            <span style={{
              fontSize: 12,
              color: "#64748b",
              fontWeight: 800
            }}>
              DEALER PROFILE
            </span>

            <h1 style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 900
            }}>
              {dealer.business_name}
            </h1>
          </div>

        </div>

        {/* SECTIONS */}

        <SectionCard
          title="Application Info"
          icon="📄"
          content={
            <Grid>
              <Field label="Application ID" value={dealer.application_id} highlight />
              <Field label="LAN" value={dealer.lan} />
              <Field label="Status" value={dealer.status} isStatus />
              <Field label="Created At" value={dealer.created_at} />
            </Grid>
          }
        />

        <SectionCard
          title="Business Details"
          icon="🏢"
          content={
            <Grid>
              <Field label="Business Name" value={dealer.business_name} />
              <Field label="Trade Name" value={dealer.trade_name} />
              <Field label="Business Type" value={dealer.business_type} />
              <Field label="PAN Number" value={dealer.pan_number} />
              <Field label="GST Number" value={dealer.gst_number} />
            </Grid>
          }
        />

        <SectionCard
          title="Owner Details"
          icon="👤"
          content={
            <Grid>
              <Field label="Owner Name" value={dealer.owner_name} />
              <Field label="Mobile" value={dealer.owner_mobile} />
              <Field label="Email" value={dealer.owner_email} />
            </Grid>
          }
        />

        <SectionCard
          title="Location"
          icon="📍"
          content={
            <Grid>
              <Field label="Address" value={dealer.showroom_address} />
              <Field label="City" value={dealer.city} />
              <Field label="State" value={dealer.state} />
              <Field label="Pincode" value={dealer.pincode} />
            </Grid>
          }
        />

        <SectionCard
          title="Bank Details"
          icon="🏦"
          content={
            <Grid>
              <Field label="Account Number" value={dealer.account_number} />
              <Field label="IFSC" value={dealer.ifsc_code} />
              <Field label="Account Holder" value={dealer.account_holder_name} />
              <Field label="Bank Name" value={dealer.bank_name} />
              <Field label="Branch" value={dealer.branch_name} />
            </Grid>
          }
        />

        <SectionCard
  title="EV Details"
  icon="🔋"
  content={
    <div>

      {!dealer.products || dealer.products.length === 0 ? (
        <p>No EV Details Found</p>
      ) : (
        dealer.products.map((p, index) => (
          <div
            key={index}
            style={{
              marginBottom: 20,
              padding: 15,
              border: "1px solid #e2e8f0",
              borderRadius: 10
            }}
          >

            <h4 style={{ marginBottom: 10 }}>
              Model {index + 1}
            </h4>

            <Grid>
              <Field label="Battery Type" value={p.battery_type} />
              <Field label="Battery Name" value={p.battery_name} />
              <Field label="E-Rickshaw Model" value={p.e_rickshaw_model} />
              <Field label="Price" value={p.price} />
            </Grid>

          </div>
        ))
      )}

    </div>
  }
/>

        <SectionCard
          title="Cheque OCR Data"
          icon="🧾"
          content={
            <Grid>
              <Field label="OCR Bank Name" value={dealer.cheque_ocr_bank_name} />
              <Field label="OCR Branch" value={dealer.cheque_ocr_branch_name} />
              <Field label="OCR Holder" value={dealer.cheque_ocr_account_holder_name} />
              <Field label="OCR Account" value={dealer.cheque_ocr_account_number} />
              <Field label="OCR IFSC" value={dealer.cheque_ocr_ifsc_code} />
            </Grid>
          }
        />

      </div>
    </div>
  );
};

export default MotionCorpDealerDetails;

/* ==========================
SHARED COMPONENTS
========================== */

const SectionCard = ({ title, icon, content }) => (
  <div style={{
    background: "#fff",
    borderRadius: 20,
    padding: 30,
    marginBottom: 30,
    boxShadow: "0 5px 10px rgba(0,0,0,0.05)"
  }}>
    <h3 style={{ marginBottom: 20 }}>
      {icon} {title}
    </h3>
    {content}
  </div>
);

const Grid = ({ children }) => (
  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px,1fr))",
    gap: 20
  }}>
    {children}
  </div>
);

const Field = ({ label, value, highlight, isStatus }) => {

  const statusColors = {
    ACTIVE: { bg: "#dcfce7", text: "#166534" },
    INACTIVE: { bg: "#fee2e2", text: "#991b1b" }
  };

  const s = statusColors[value] || { bg: "#f1f5f9", text: "#334155" };

  return (
    <div>
      <div style={{
        fontSize: 12,
        color: "#94a3b8",
        fontWeight: 700
      }}>
        {label}
      </div>

      {isStatus ? (
        <span style={{
          background: s.bg,
          color: s.text,
          padding: "5px 10px",
          borderRadius: 6
        }}>
          {value}
        </span>
      ) : (
        <div style={{
          fontWeight: highlight ? 900 : 600,
          color: highlight ? "#0284c7" : "#1e293b"
        }}>
          {value || "—"}
        </div>
      )}
    </div>
  );
};