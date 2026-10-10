
import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";

const ZebrsDealerLoginActions = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [updatingLan, setUpdatingLan] = useState(null);

  const navigate = useNavigate();

  // ==========================
  // FETCH DEALERS
  // ==========================
  const fetchDealers = async () => {
    try {
      setLoading(true);
      setErr("");

      const res = await api.get("/zebrs/dealers-login-cases");

      const data = res.data;

      setRows(
        Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : []
      );
    } catch (error) {
      console.error("Zebrs Dealer Fetch Error:", error);
      setErr("Failed to fetch Zebrs dealers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDealers();
  }, []);

  // ==========================
  // STATUS UPDATE
  // ==========================
  const handleStatusChange = async (lan, status) => {
    if (updatingLan) return;

    try {
      setUpdatingLan(lan);

      await api.patch(`/zebrs/dealer/status/${lan}`, {
        status: status.toUpperCase(),
      });

      setRows((prev) =>
        prev.map((row) =>
          row.lan === lan
            ? { ...row, status: status.toUpperCase() }
            : row
        )
      );
    } catch (error) {
      console.error("Zebrs Status Update Error:", error);
      alert(
        error.response?.data?.message ||
          "Failed to update dealer status"
      );
    } finally {
      setUpdatingLan(null);
    }
  };

  // ==========================
  // BUTTON STYLES
  // ==========================
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

  const statusPillStyle = (status) => {
    const map = {
      ACTIVE: { bg: "#dcfce7", fg: "#166534" },
      APPROVED: { bg: "#dbeafe", fg: "#1e40af" },
      REJECTED: { bg: "#fee2e2", fg: "#991b1b" },
      PENDING: { bg: "#fef3c7", fg: "#92400e" },
    };

    const style = map[String(status || "").toUpperCase()];

    return {
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      background: style?.bg || "#f1f5f9",
      color: style?.fg || "#334155",
    };
  };

  // ==========================
  // TABLE COLUMNS
  // ==========================
  const columns = [
    {
      key: "business_name",
      header: "Dealer Name",
      sortable: true,
      render: (r) => (
        <span
          style={{
            color: "#2563eb",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() =>
            navigate(`/zebrs/dealer-details/${r.lan}`)
          }
        >
          {r.business_name || "N/A"}
        </span>
      ),
      width: 220,
    },
    {
      key: "trade_name",
      header: "Trade Name",
      width: 160,
    },
    {
      key: "business_type",
      header: "Type",
      width: 140,
    },
    {
      key: "location",
      header: "Location",
      render: (r) =>
        [r.city, r.state].filter(Boolean).join(", ") || "N/A",
      width: 200,
    },
    {
      key: "owner_name",
      header: "Owner",
      width: 160,
    },
    {
      key: "owner_mobile",
      header: "Mobile",
      render: (r) => (
        <a
          href={`tel:${r.owner_mobile}`}
          style={{ color: "#2563eb" }}
        >
          {r.owner_mobile || "N/A"}
        </a>
      ),
      width: 140,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span style={statusPillStyle(r.status)}>
          {String(r.status || "PENDING").toUpperCase()}
        </span>
      ),
      width: 120,
    },
    {
      key: "docs",
      header: "Documents",
      render: (r) => (
        <button
          type="button"
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
        >
          📂 Docs
        </button>
      ),
      width: 120,
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => {
        const status = String(r.status || "").toUpperCase();
        const processing = updatingLan === r.lan;
        const isFinal = ["APPROVED", "REJECTED"].includes(status);

        return (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={actionBtn("approve")}
              disabled={Boolean(updatingLan) || isFinal}
              onClick={() =>
                handleStatusChange(r.lan, "APPROVED")
              }
            >
              {processing ? "Updating..." : "✅ Approve"}
            </button>

            <button
              type="button"
              style={actionBtn("reject")}
              disabled={Boolean(updatingLan) || isFinal}
              onClick={() =>
                handleStatusChange(r.lan, "REJECTED")
              }
            >
              ❌ Reject
            </button>
          </div>
        );
      },
      width: 210,
    },
  ];

  // ==========================
  // MAIN UI
  // ==========================
  if (loading) {
    return (
      <div style={{ padding: 30 }}>
        Loading Zebrs Dealer Credit Approval...
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: 30, color: "#dc2626" }}>
        <p>{err}</p>
        <button onClick={fetchDealers}>Retry</button>
      </div>
    );
  }

  return (
    <DataTable
      title="Zebrs Dealer Credit Approval"
      rows={rows}
      columns={columns}
      globalSearchKeys={[
        "business_name",
        "trade_name",
        "dealer_id",
        "city",
        "state",
        "owner_name",
        "owner_mobile",
      ]}
      exportFileName="zebrs_dealer_credit_approval"
    />
  );
};

export default ZebrsDealerLoginActions;
