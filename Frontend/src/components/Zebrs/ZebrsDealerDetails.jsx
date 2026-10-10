
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/api";

const ZebrsDealerDetails = () => {
  const { lan } = useParams();
  const navigate = useNavigate();

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetchDetails = async () => {
      try {
        setLoading(true);
        setErr("");

        const res = await api.get(
          `/zebrs/dealer-details/${encodeURIComponent(lan)}`
        );

        if (!cancelled) {
          setDetails(res.data?.data || res.data);
        }
      } catch (error) {
        console.error("Zebrs Dealer Details Error:", error);

        if (!cancelled) {
          setErr(
            error.response?.data?.message ||
            "Failed to fetch Zebrs dealer details"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDetails();

    return () => {
      cancelled = true;
    };
  }, [lan]);

  if (loading) {
    return <p style={{ padding: 20 }}>Loading dealer details...</p>;
  }

  if (err) {
    return (
      <div style={{ padding: 20, color: "#dc2626" }}>
        <p>{err}</p>
        <button onClick={() => navigate(-1)}>← Back</button>
      </div>
    );
  }

  if (!details) {
    return <p style={{ padding: 20 }}>No dealer data found</p>;
  }

  const dealer = details;

  return (
    <div
      style={{
        background: "#f1f5f9",
        minHeight: "100vh",
        padding: "50px 25px",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1300, margin: "0 auto" }}>

        {/* HEADER */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 20,
            marginBottom: 40,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: "12px 20px",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ← Back
          </button>

          <div style={{ textAlign: "right" }}>
            <span
              style={{
                fontSize: 12,
                color: "#64748b",
                fontWeight: 800,
              }}
            >
              ZEBRS DEALER PROFILE
            </span>

            <h1
              style={{
                margin: 0,
                fontSize: 34,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              {dealer.business_name || "Dealer Details"}
            </h1>
          </div>
        </div>

        {/* APPLICATION DETAILS */}
        <SectionCard
          title="Application Info"
          icon="📄"
          content={
            <Grid>
              <Field
                label="Application ID"
                value={dealer.application_id}
                highlight
              />
              <Field label="LAN" value={dealer.lan} />
              <Field label="Dealer ID" value={dealer.dealer_id} />
              <Field
                label="Status"
                value={dealer.status}
                isStatus
              />
              <Field
                label="Login Date"
                value={formatDate(dealer.login_date)}
              />
              <Field
                label="Created At"
                value={formatDate(dealer.created_at)}
              />
            </Grid>
          }
        />

        {/* BUSINESS DETAILS */}
        <SectionCard
          title="Business Details"
          icon="🏢"
          content={
            <Grid>
              <Field
                label="Business Name"
                value={dealer.business_name}
              />
              <Field
                label="Trade Name"
                value={dealer.trade_name}
              />
              <Field
                label="Business Type"
                value={dealer.business_type}
              />
              <Field
                label="PAN Number"
                value={dealer.pan_number}
              />
              <Field
                label="GST Number"
                value={dealer.gst_number}
              />
            </Grid>
          }
        />

        {/* OWNER DETAILS */}
        <SectionCard
          title="Owner Details"
          icon="👤"
          content={
            <Grid>
              <Field
                label="Owner Name"
                value={dealer.owner_name}
              />
              <Field
                label="Mobile"
                value={dealer.owner_mobile}
              />
              <Field
                label="Email"
                value={dealer.owner_email}
              />
            </Grid>
          }
        />

        {/* LOCATION */}
        <SectionCard
          title="Location"
          icon="📍"
          content={
            <Grid>
              <Field
                label="Showroom Address"
                value={dealer.showroom_address}
              />
              <Field label="City" value={dealer.city} />
              <Field label="State" value={dealer.state} />
              <Field label="Pincode" value={dealer.pincode} />
            </Grid>
          }
        />

        {/* BANK DETAILS */}
        <SectionCard
          title="Bank Details"
          icon="🏦"
          content={
            <Grid>
              <Field
                label="Bank Name"
                value={dealer.bank_name}
              />
              <Field
                label="Branch"
                value={dealer.branch_name}
              />
              <Field
                label="Account Holder"
                value={dealer.account_holder_name}
              />
              <Field
                label="Account Number"
                value={dealer.account_number}
              />
              <Field
                label="IFSC"
                value={dealer.ifsc_code}
              />
            </Grid>
          }
        />

        {/* EV DETAILS */}
        <SectionCard
          title="EV Details"
          icon="🔋"
          content={
            <div>
              {!Array.isArray(dealer.products) ||
              dealer.products.length === 0 ? (
                <p style={{ color: "#64748b" }}>
                  No EV Details Found
                </p>
              ) : (
                dealer.products.map((product, index) => (
                  <div
                    key={product.id || index}
                    style={{
                      marginBottom: 20,
                      padding: 20,
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      background: "#f8fafc",
                    }}
                  >
                    <h4
                      style={{
                        marginTop: 0,
                        marginBottom: 15,
                        color: "#0f172a",
                      }}
                    >
                      Model {index + 1}
                    </h4>

                    <Grid>
                      <Field
                        label="Battery Type"
                        value={product.battery_type}
                      />
                      <Field
                        label="Battery Name"
                        value={product.battery_name}
                      />
                      <Field
                        label="E-Rickshaw Model"
                        value={product.e_rickshaw_model}
                      />
                      <Field
                        label="Price"
                        value={
                          product.price != null &&
                          product.price !== ""
                            ? `₹${Number(
                                product.price
                              ).toLocaleString("en-IN")}`
                            : null
                        }
                      />
                    </Grid>
                  </div>
                ))
              )}
            </div>
          }
        />
      </div>
    </div>
  );
};

export default ZebrsDealerDetails;

// ==========================================
// SHARED COMPONENTS
// ==========================================

const SectionCard = ({ title, icon, content }) => (
  <div
    style={{
      background: "#fff",
      borderRadius: 20,
      padding: 30,
      marginBottom: 30,
      boxShadow: "0 5px 10px rgba(0,0,0,0.05)",
      border: "1px solid #e2e8f0",
    }}
  >
    <h3
      style={{
        marginTop: 0,
        marginBottom: 20,
        fontSize: 20,
        color: "#0f172a",
      }}
    >
      {icon} {title}
    </h3>
    {content}
  </div>
);

const Grid = ({ children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns:
        "repeat(auto-fit, minmax(250px, 1fr))",
      gap: 20,
    }}
  >
    {children}
  </div>
);

const Field = ({ label, value, highlight, isStatus }) => {
  const status = String(value || "").toUpperCase();

  const statusColors = {
    ACTIVE: { bg: "#dcfce7", text: "#166534" },
    APPROVED: { bg: "#dcfce7", text: "#166534" },
    REJECTED: { bg: "#fee2e2", text: "#991b1b" },
    INACTIVE: { bg: "#fee2e2", text: "#991b1b" },
    PENDING: { bg: "#fef3c7", text: "#92400e" },
  };

  const colors = statusColors[status] || {
    bg: "#f1f5f9",
    text: "#334155",
  };

  const displayValue =
    value === undefined ||
    value === null ||
    value === ""
      ? "—"
      : value;

  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: "#94a3b8",
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {label}
      </div>

      {isStatus ? (
        <span
          style={{
            display: "inline-block",
            background: colors.bg,
            color: colors.text,
            padding: "5px 10px",
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          {displayValue}
        </span>
      ) : (
        <div
          style={{
            fontWeight: highlight ? 900 : 600,
            color: highlight ? "#0284c7" : "#1e293b",
            overflowWrap: "anywhere",
          }}
        >
          {displayValue}
        </div>
      )}
    </div>
  );
};

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN");
};
