import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";

const MotionCorpDealerLoginActions = () => {

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const navigate = useNavigate();

  /*
  ==========================
  FETCH DEALERS
  ==========================
  */
  useEffect(() => {

    let off = false;

    api
      .get("/motion-corp/dealers-login-cases")
      .then((res) => {
        if (!off) setRows(res.data || []);
      })
      .catch(() => {
        if (!off) setErr("Failed to fetch dealers");
      })
      .finally(() => {
        if (!off) setLoading(false);
      });

    return () => (off = true);

  }, []);

  if (loading) return <p>Loading…</p>;
  if (err) return <p style={{ color: "red" }}>{err}</p>;

  /*
  ==========================
  STATUS UPDATE
  ==========================
  */
  const handleStatusChange = async (lan, status) => {
    try {

      await api.patch(`/motion-corp/dealer/status/${lan}`, {
        status: status.toUpperCase(),
      });

      // update UI instantly
      setRows((prev) =>
        prev.map((row) =>
          row.lan === lan ? { ...row, status: status.toUpperCase() } : row
        )
      );

    } catch (err) {
      console.error(err);
      alert("Failed to update status");
    }
  };

  /*
  ==========================
  STYLES
  ==========================
  */
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
      ACTIVE: { bg: "rgba(16,185,129,.12)", fg: "#065f46" },
      APPROVED: { bg: "rgba(59,130,246,.12)", fg: "#1e3a8a" },
      REJECTED: { bg: "rgba(239,68,68,.2)", fg: "#991b1b" },
    };

    return {
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      background: map[status]?.bg || "#eee",
      color: map[status]?.fg || "#333",
    };
  };

  /*
  ==========================
  TABLE COLUMNS
  ==========================
  */
  const columns = [

    {
      key: "business_name",
      header: "Dealer Name",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/motion-corp/dealer-details/${r.lan}`)}
        >
          {r.business_name}
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
      render: (r) => `${r.city}, ${r.state}`,
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
        <a href={`tel:${r.owner_mobile}`} style={{ color: "#2563eb" }}>
          {r.owner_mobile}
        </a>
      ),
      width: 140,
    },

    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span style={statusPillStyle(r.status)}>
          {r.status}
        </span>
      ),
      width: 120,
    },

    {
      key: "created_at",
      header: "Created At",
      render: (r) =>
        r.created_at
          ? new Date(r.created_at).toLocaleDateString()
          : "—",
      width: 140,
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
        >
          📂 Docs
        </button>
      ),
      width: 120,
    },

    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={actionBtn("approve")}
            onClick={() => handleStatusChange(r.lan, "APPROVED")}
          >
            ✅ Approve
          </button>

          <button
            style={actionBtn("reject")}
            onClick={() => handleStatusChange(r.lan, "REJECTED")}
          >
            ❌ Reject
          </button>
        </div>
      ),
      width: 210,
    }

  ];

  /*
  ==========================
  UI
  ==========================
  */
  return (
    <DataTable
      title="Motion Corp Dealer Credit Approval"
      rows={rows}
      columns={columns}
      globalSearchKeys={[
        "business_name",
        "trade_name",
        "city",
        "state",
        "owner_name",
      ]}
      exportFileName="motion_corp_dealers"
    />
  );
};

export default MotionCorpDealerLoginActions;