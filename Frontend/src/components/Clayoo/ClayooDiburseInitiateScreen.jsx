import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";


const ClayooDiburseInitiateScreen = ({
  apiUrl = `/clayyo-loans/approve-initiate-loans?table=loan_booking_clayyo&prefix=CLY`,
  title = "Approval Initiated Stage Loans",
  lenderName = "CLAYOO",
  tableName = "loan_booking_clayyo",
}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let off = false;
    setLoading(true);
    setErr("");

    api
      .get(apiUrl)
      .then((res) => !off && setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => !off && setErr("Failed to fetch data."))
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
  }, [apiUrl]);

  // keep EXACT behavior/signature
  const handleStatusChange = async (lan, newStatus, table) => {
    try {
      await api.put(`/clayyo-loans/approve-initiated-loans/${lan}`, { status: newStatus, table });
      setRows((prev) => prev.map((r) => (r.lan === lan ? { ...r, status: newStatus } : r)));
    } catch (err) {
      console.error("Error updating status:", err);
      alert("Failed to update status. Try again.");
    }
  };


  // styles
  const pill = (status) => {
   const map = {
  "bre approved": {
    bg:"rgba(59,130,246,.12)",
    bd:"rgba(59,130,246,.35)",
    fg:"#1d4ed8"
  },
  "credit approved": {
    bg:"rgba(16,185,129,.12)",
    bd:"rgba(16,185,129,.35)",
    fg:"#065f46"
  },
  rejected: {
    bg:"rgba(239,68,68,.12)",
    bd:"rgba(239,68,68,.35)",
    fg:"#7f1d1d"
  },
  "credit recheck": {
    bg:"rgba(249,115,22,.12)",
    bd:"rgba(249,115,22,.35)",
    fg:"#9a3412"
  },
  login: {
    bg:"rgba(107,114,128,.12)",
    bd:"rgba(107,114,128,.35)",
    fg:"#374151"
  }
};
    const key = (status || "pending").toLowerCase();
    const c = map[key] || map.login;
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.bd}`,
    };
  };
  const actionBtn = (type) => ({
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid transparent",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    background: type === "approve" ? "#10b981" : "#ef4444",
    borderColor: type === "approve" ? "#059669" : "#dc2626",
    color: "#fff",
  });
  const link = { color: "#2563eb", textDecoration: "none", fontWeight: 600 };

  // base columns
  const baseColumns = [
    {
      key: "customer_name",
      header: "Loan Details",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/approved-loan-details-clayoo/${r.lan}`)}
        >
          {r.customer_name ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
      width: 220,
    },
    {
      key: "lender",
      header: "Lender",
      render: () => lenderName,
      csvAccessor: () => lenderName,
      width: 120,
    },
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/approved-loan-details/${r.lan}`)}
        >
          {r.lan ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.lan || "").toLowerCase(),
      width: 140,
    },
    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,
      render: (r) =>
        r.mobile_number ? (
          <a href={`tel:${r.mobile_number}`} style={link}>
            {r.mobile_number}
          </a>
        ) : (
          "—"
        ),
      width: 160,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (r) => <span style={pill(r.status)}>{r.status || "Pending"}</span>,
      sortAccessor: (r) => (r.status || "").toLowerCase(),
      csvAccessor: (r) => r.status || "Pending",
      width: 140,
    },
    {
  key: "stage",
  header: "Stage",
  sortable: true,
  render: (r) => r.stage || "—",
  width: 160
},
    {
      key: "docs",
      header: "Documents",
      render: (r) => (
        <button
          onClick={() => navigate(`/documents/${r.lan}`)}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #93c5fd",
            color: "#1d4ed8",
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
          title="Open documents"
        >
          📂 Docs
        </button>
      ),
      csvAccessor: () => "",
      width: 120,
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={actionBtn("approve")}
            onClick={() => handleStatusChange(r.lan, "CREDIT APPROVED", tableName)}
          >
            ✅ Approve
          </button>
          <button
            style={actionBtn("reject")}
            onClick={() => handleStatusChange(r.lan, "REJECTED", tableName)}
          >
            ❌ Reject
          </button>
        </div>
      ),
      csvAccessor: () => "",
      width: 210,
    },
  ];

  // include batch_id in search/CSV only when present
  const globalSearchKeys = [
    "customer_name",
    "partner_loan_id",
    "lan",
    "mobile_number",
    "status",
  ];

  return (
    <>
    <LoaderOverlay show={loading} label="Fetching data…" />
      {err && <p style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</p>}
    <DataTable
      title={title}
      rows={rows}
      columns={baseColumns}
      globalSearchKeys={globalSearchKeys}
      exportFileName="login_stage_loans"
    />
    </>
  );
};

export default ClayooDiburseInitiateScreen;
