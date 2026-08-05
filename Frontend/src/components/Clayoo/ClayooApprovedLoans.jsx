import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const ClayooRejectedLoans = ({
  apiUrl = "/clayyo-loans/bre-rejected-loans?table=loan_booking_clayyo&prefix=CLY",
  title = "Clayyo BRE Rejected Loans",
  lenderName = "CLAYOO",
  tableName = "loan_booking_clayyo",
}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const openClayyoDetails = (lan) => {
    navigate(`/approved-loan-details-clayoo/${encodeURIComponent(lan)}`);
  };

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setErr("");

    api
      .get(apiUrl)
      .then((response) => {
        if (!cancelled) {
          setRows(Array.isArray(response.data) ? response.data : []);
        }
      })
      .catch((error) => {
        console.error("Clayyo loans fetch failed:", error);
        if (!cancelled) setErr("Failed to fetch data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  const handleStatusChange = async (lan, newStatus, table) => {
    try {
      await api.put(`/clayyo-loans/approve-bre-loan/${encodeURIComponent(lan)}`, {
        status: newStatus,
        table,
      });

      setRows((previous) => previous.filter((row) => row.lan !== lan));
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Failed to update status. Try again.");
    }
  };

  const pill = (status) => {
    const normalizedStatus = String(status || "pending")
      .toLowerCase()
      .replaceAll("_", " ");

    const map = {
      "bre failed": {
        bg: "rgba(239,68,68,.12)",
        bd: "rgba(239,68,68,.35)",
        fg: "#7f1d1d",
      },
      "bre rejected": {
        bg: "rgba(239,68,68,.12)",
        bd: "rgba(239,68,68,.35)",
        fg: "#7f1d1d",
      },
      "bre approved": {
        bg: "rgba(59,130,246,.12)",
        bd: "rgba(59,130,246,.35)",
        fg: "#1d4ed8",
      },
      "credit approved": {
        bg: "rgba(16,185,129,.12)",
        bd: "rgba(16,185,129,.35)",
        fg: "#065f46",
      },
      rejected: {
        bg: "rgba(239,68,68,.12)",
        bd: "rgba(239,68,68,.35)",
        fg: "#7f1d1d",
      },
      "credit recheck": {
        bg: "rgba(249,115,22,.12)",
        bd: "rgba(249,115,22,.35)",
        fg: "#9a3412",
      },
      login: {
        bg: "rgba(107,114,128,.12)",
        bd: "rgba(107,114,128,.35)",
        fg: "#374151",
      },
      pending: {
        bg: "rgba(107,114,128,.12)",
        bd: "rgba(107,114,128,.35)",
        fg: "#374151",
      },
    };

    const selected = map[normalizedStatus] || map.pending;

    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      background: selected.bg,
      color: selected.fg,
      border: `1px solid ${selected.bd}`,
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

  const link = {
    color: "#2563eb",
    textDecoration: "none",
    fontWeight: 600,
  };

  const baseColumns = [
    {
      key: "customer_name",
      header: "Loan Details",
      sortable: true,
      render: (row) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => openClayyoDetails(row.lan)}
        >
          {row.customer_name ?? "—"}
        </span>
      ),
      sortAccessor: (row) => (row.customer_name || "").toLowerCase(),
      width: 220,
    },
    {
      key: "patient_name",
      header: "Patient Name",
      sortable: true,
      render: (row) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => openClayyoDetails(row.lan)}
        >
          {row.patient_name ?? "—"}
        </span>
      ),
      sortAccessor: (row) => (row.patient_name || "").toLowerCase(),
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
      render: (row) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => openClayyoDetails(row.lan)}
        >
          {row.lan ?? "—"}
        </span>
      ),
      sortAccessor: (row) => (row.lan || "").toLowerCase(),
      width: 140,
    },
    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,
      render: (row) =>
        row.mobile_number ? (
          <a href={`tel:${row.mobile_number}`} style={link}>
            {row.mobile_number}
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
      render: (row) => (
        <span style={pill(row.status)}>{row.status || "Pending"}</span>
      ),
      sortAccessor: (row) => (row.status || "").toLowerCase(),
      csvAccessor: (row) => row.status || "Pending",
      width: 140,
    },
    {
      key: "stage",
      header: "Stage",
      sortable: true,
      render: (row) => row.stage || "—",
      width: 160,
    },
    {
      key: "docs",
      header: "Documents",
      render: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/documents/${encodeURIComponent(row.lan)}`)}
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
      render: (row) => (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={actionBtn("approve")}
            onClick={() =>
              handleStatusChange(row.lan, "BRE APPROVED", tableName)
            }
          >
            ✅ Approve
          </button>

          <button
            type="button"
            style={actionBtn("reject")}
            onClick={() => handleStatusChange(row.lan, "REJECTED", tableName)}
          >
            ❌ Reject
          </button>
        </div>
      ),
      csvAccessor: () => "",
      width: 210,
    },
  ];

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
        exportFileName="clayyo_bre_rejected_loans"
      />
    </>
  );
};

export default ClayooRejectedLoans;