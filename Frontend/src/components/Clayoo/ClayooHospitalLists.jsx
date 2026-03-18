import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";

const HospitalList = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let off = false;

    api
      .get("clayyo-loans/hospitals")
      .then((res) => {
        if (!off) setRows(res.data || []);
      })
      .catch(() => {
        if (!off) setErr("Failed to fetch hospitals");
      })
      .finally(() => {
        if (!off) setLoading(false);
      });

    return () => (off = true);
  }, []);

  if (loading) return <p>Loading…</p>;
  if (err) return <p style={{ color: "red" }}>{err}</p>;

  const statusPillStyle = (status) => {
    const map = {
      ACTIVE: { bg: "rgba(16,185,129,.12)", fg: "#065f46" },
      INACTIVE: { bg: "rgba(239,68,68,.12)", fg: "#7f1d1d" },
    };

    const c = map[status] || map.ACTIVE;

    return {
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      background: c.bg,
      color: c.fg,
    };
  };

  const columns = [
    {
      key: "hospital_legal_name",
      header: "Hospital Name",
      sortable: true,
      render: (r) => (
        <span style={{ fontWeight: 600 }}>
          {r.hospital_legal_name}
        </span>
      ),
      width: 220,
    },
    {
      key: "brand_name",
      header: "Brand",
      sortable: true,
      width: 160,
    },
    {
      key: "hospital_type",
      header: "Type",
      sortable: true,
      width: 160,
    },
    {
      key: "bed_capacity",
      header: "Beds",
      sortable: true,
      width: 100,
    },
    {
      key: "location",
      header: "Location",
      render: (r) =>
        `${r.registered_city}, ${r.registered_district}`,
      width: 220,
    },
    {
      key: "state",
      header: "State",
      render: (r) => r.registered_state,
      width: 160,
    },
    {
      key: "hospital_phone",
      header: "Phone",
      render: (r) =>
        r.hospital_phone ? (
          <a href={`tel:${r.hospital_phone}`} style={{ color: "#2563eb" }}>
            {r.hospital_phone}
          </a>
        ) : "—",
      width: 150,
    },
    {
      key: "owner_name",
      header: "Owner",
      sortable: true,
      width: 180,
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
          title="Open documents"
        >
          📂 Docs
        </button>
      ),
      csvAccessor: () => "",
      width: 120,
    },
  ];

  return (
    <DataTable
      title="Hospital List"
      rows={rows}
      columns={columns}
      globalSearchKeys={[
        "hospital_legal_name",
        "brand_name",
        "registered_city",
        "registered_district",
        "registered_state",
        "owner_name",
      ]}
      exportFileName="hospitals"
    />
  );
};

export default HospitalList;