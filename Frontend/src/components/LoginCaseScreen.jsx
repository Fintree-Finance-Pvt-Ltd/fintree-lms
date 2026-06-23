import React, { useEffect, useState } from "react";
import api from "../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "./ui/DataTable";

const LoginCaseScreen = ({
  apiUrl,
  title = "Login Stage Loans",
  lenderName = "EMI",
  showResumeButton = false,
  resumePath = "",
}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let off = false;
    setLoading(true);
    api
      .get(apiUrl)
      .then((res) => !off && setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => !off && setErr("Failed to fetch data."))
      .finally(() => !off && setLoading(false));
    return () => (off = true);
  }, [apiUrl]);

  if (loading)
    return (
      <div style={{ display: "grid", placeItems: "center", height: "300px" }}>
        <div className="medical-spinner"></div>
        <p
          style={{
            marginTop: "12px",
            color: "#6366f1",
            fontWeight: 600,
            fontSize: "14px",
          }}
        >
          Loading Case Records...
        </p>
      </div>
    );

  if (err)
    return (
      <div
        style={{
          padding: "20px",
          background: "#fff1f2",
          borderRadius: "12px",
          borderLeft: "5px solid #ef4444",
          margin: "20px",
        }}
      >
        <p style={{ color: "#b91c1c", fontWeight: 700, margin: 0 }}>{err}</p>
      </div>
    );

  const hasADK = rows.some(
    (r) => typeof r?.lan === "string" && /^ADK/i.test(r.lan),
  );
  const hasGQFSF = rows.some(
    (r) => typeof r?.lan === "string" && /^GQFSF/i.test(r.lan),
  );
  const hasGQNonFSF = rows.some(
    (r) => typeof r?.lan === "string" && /^GQNONFSF/i.test(r.lan),
  );
  const hasclyoo = rows.some(
    (r) => typeof r?.lan === "string" && /^CLY/i.test(r.lan),
  );

  const statusPillStyle = (status) => {
    const map = {
      approved: { bg: "#dcfce7", bd: "#bbf7d0", fg: "#166534" },
      rejected: { bg: "#fee2e2", bd: "#fecaca", fg: "#991b1b" },
      pending: { bg: "#fef3c7", bd: "#fde68a", fg: "#92400e" },
      login: { bg: "#f1f5f9", bd: "#e2e8f0", fg: "#475569" },
    };
    const key = (status || "pending").toString().toLowerCase();
    const c = map[key] || map.login;
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 12px",
      borderRadius: "6px",
      fontSize: "11px",
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: "0.6px",
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.bd}`,
    };
  };

  const isFundifyRecord = (row) =>
  /^FUN/i.test(row?.lan || "") ||
  row?.lender?.toLowerCase() === "fundify" ||
  row?.partner_name?.toLowerCase() === "fundify";

const getCustomerName = (row) => {
  if (isFundifyRecord(row)) {
    return row?.business_name || "—";
  }

  return row?.customer_name || "—";
};

const getContactNumber = (row) => {
  if (isFundifyRecord(row)) {
    return row?.business_mobile || "—";
  }

  return row?.mobile_number || "—";
};

  const columns = [
    {
  key: "customer_name",
  header: "Customer Details",
  sortable: true,
  render: (r) => {
    const displayName = getCustomerName(r);

    return (
      <div
          style={{ display: "flex", flexDirection: "column", padding: "4px 0" }}
      >
        <span
          style={{
            color: "#2563eb",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: "14.5px",
          }}
          onClick={() => {
            if (/^LDF/i.test(r?.lan)) {
              navigate(`/loan-digit/customer-details?lan=${r.lan}`);
            } else if (/^FINS/i.test(r?.lan)) {
              navigate(`/fincrest-loan-details/${r.lan}`);
            } else {
              navigate(`/approved-loan-details/${r.lan}`);
            }
          }}
        >
          {displayName}
        </span>

        <span
            style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}
        >
          {isFundifyRecord(r) ? "Fundify Partner" : `${lenderName} Partner`}
        </span>
      </div>
    );
  },
  sortAccessor: (r) => getCustomerName(r).toLowerCase(),
  width: 220,
},
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      render: (r) => (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontWeight: 700,
              color: "#0f172a",
              background: "#f1f5f9",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "12px",
              width: "fit-content",
            }}
          >
            {r.lan ?? "—"}
          </span>
        </div>
      ),
      sortAccessor: (r) => (r.lan || "").toLowerCase(),
      width: 150,
    },
    {
      key: "partner_loan_id",
      header: "Partner ID",
      sortable: true,
      render: (r) => (
        <span style={{ fontWeight: 600, color: "#475569", fontSize: "13px" }}>
          {r.partner_loan_id ?? "—"}
        </span>
      ),
      width: 160,
    },
    ...(hasADK
      ? [
          {
            key: "batch_id",
            header: "Batch ID",
            sortable: true,
            render: (r) =>
              /^ADK/i.test(r?.lan) ? (
                <span style={{ fontWeight: 600 }}>{r.batch_id ?? "—"}</span>
              ) : (
                "—"
              ),
            width: 140,
          },
        ]
      : []),
    ...(hasclyoo
      ? [
          {
            key: "application_id",
            header: "Application ID",
            sortable: true,
            render: (r) =>
              /^CLY/i.test(r?.lan) ? (
                <span style={{ fontWeight: 600 }}>{r.app_id ?? "—"}</span>
              ) : (
                "—"
              ),
            width: 140,
          },
        ]
      : []),
    ...(hasGQFSF
      ? [
          {
            key: "app_id",
            header: "App ID (FSF)",
            sortable: true,
            render: (r) =>
              /^GQFSF/i.test(r?.lan) ? (
                <span style={{ fontWeight: 600 }}>{r.app_id ?? "—"}</span>
              ) : (
                "—"
              ),
            width: 140,
          },
        ]
      : []),
    ...(hasGQNonFSF
      ? [
          {
            key: "app_id",
            header: "App ID (Non-FSF)",
            sortable: true,
            render: (r) =>
              /^GQNonFSF/i.test(r?.lan) ? (
                <span style={{ fontWeight: 600 }}>{r.app_id ?? "—"}</span>
              ) : (
                "—"
              ),
            width: 140,
          },
        ]
      : []),
    {
  key: "mobile_number",
  header: "Contact Info",
  sortable: true,
  render: (r) => {
    const contactNumber = getContactNumber(r);

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span style={{ fontSize: "14px" }}>📞</span>

        {contactNumber !== "—" ? (
          <a
            href={`tel:${contactNumber}`}
            style={{
              color: "#0f172a",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "13px",
            }}
          >
            {contactNumber}
          </a>
        ) : (
          "—"
        )}
      </div>
    );
  },
  sortAccessor: (r) => {
    const contactNumber = getContactNumber(r);
    return contactNumber === "—" ? "" : contactNumber;
  },
  width: 160,
},
    {
      key: "status",
      header: "Stage Status",
      sortable: true,
      render: (r) => (
        <span style={statusPillStyle(r.status)}>{r.status || "Pending"}</span>
      ),
      width: 140,
    },
    {
      key: "actions",
      header: "Action",
      render: (r) => (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {showResumeButton && (
            <button
              onClick={() => navigate(`${resumePath}?lan=${r.lan}`)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid #bbf7d0",
                color: "#166534",
                background: "#dcfce7",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "700",
              }}
            >
              Resume
            </button>
          )}

          <button
            onClick={() => navigate(`/documents/${r.lan}`)}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              color: "#0f172a",
              background: "#fff",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "700",
            }}
          >
            📂 Documents
          </button>
        </div>
      ),
      width: showResumeButton ? 220 : 130,
    },
  ];

  return (
    <div style={{ padding: "24px", background: "#f8fafc", minHeight: "100vh" }}>
     <DataTable
  title={title}
  rows={rows}
  columns={columns}
  globalSearchKeys={[
    "customer_name",
    "business_name",
    "partner_loan_id",
    "lan",
    "mobile_number",
    "business_mobile",
    "business_email",
    "status",
  ]}
  initialSort={{ key: "created_at", dir: "desc" }}
  exportFileName="login_stage_loans"
/>
    </div>
  );
};

export default LoginCaseScreen;
