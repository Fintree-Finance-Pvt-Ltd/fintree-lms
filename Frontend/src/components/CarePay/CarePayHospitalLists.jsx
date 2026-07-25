import React, { useEffect, useMemo, useState } from "react";
import { Eye, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";

const normalizeStatus = (status) => String(status || "PENDING").toUpperCase();

const statusPillStyle = (status) => {
  const normalized = normalizeStatus(status);
  const styles = {
    PENDING: {
      background: "#fef9c3",
      color: "#713f12",
      borderColor: "#fde68a",
    },
    APPROVED: {
      background: "#dcfce7",
      color: "#166534",
      borderColor: "#bbf7d0",
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 92,
    padding: "7px 12px",
    borderRadius: 999,
    border: `1px solid ${styles[normalized]?.borderColor || "#e2e8f0"}`,
    background: styles[normalized]?.background || "#f8fafc",
    color: styles[normalized]?.color || "#475569",
    fontSize: 12,
    fontWeight: 800,
  };
};

const CarePayHospitalLists = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const fetchHospitals = async () => {
    try {
      setLoading(true);
      setErr("");
      const res = await api.get("/loan-booking/carepay-hospitals");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      setErr("Failed to fetch CarePay hospitals.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHospitals();
  }, []);

  const stats = useMemo(() => {
    const approved = rows.filter((row) => normalizeStatus(row.status) === "APPROVED").length;
    const pending = rows.filter((row) => normalizeStatus(row.status) === "PENDING").length;

    return {
      total: rows.length,
      approved,
      pending,
    };
  }, [rows]);

  const linkStyle = {
    color: "#0f766e",
    fontWeight: 800,
    cursor: "pointer",
  };

  const columns = [
    {
      key: "hospital_legal_name",
      header: "Hospital",
      sortable: true,
      render: (row) => (
        <button
          type="button"
          className="carepay-hospital-link"
          onClick={() => navigate(`/carepay-loans/hospital-details/${row.lan}`)}
        >
          <span style={linkStyle}>{row.hospital_legal_name || "-"}</span>
          <span>{row.brand_name || "CarePay Provider"}</span>
        </button>
      ),
      sortAccessor: (row) => (row.hospital_legal_name || "").toLowerCase(),
      csvAccessor: (row) => row.hospital_legal_name || "",
      width: 260,
    },
    {
      key: "partner_loan_id",
      header: "Partner ID",
      sortable: true,
      render: (row) => row.partner_loan_id || row.application_id || "-",
      csvAccessor: (row) => row.partner_loan_id || row.application_id || "",
      width: 160,
    },
    {
      key: "hospital_type",
      header: "Type",
      sortable: true,
      render: (row) => row.hospital_type || "-",
      width: 150,
    },
    {
      key: "bed_capacity",
      header: "Beds",
      sortable: true,
      render: (row) => row.bed_capacity || "-",
      width: 90,
    },
    {
      key: "location",
      header: "Location",
      render: (row) => (
        <div className="carepay-stack">
          <strong>{row.registered_city || "-"}</strong>
          <span>{[row.registered_district, row.registered_state].filter(Boolean).join(", ") || "-"}</span>
        </div>
      ),
      csvAccessor: (row) =>
        [row.registered_city, row.registered_district, row.registered_state]
          .filter(Boolean)
          .join(", "),
      width: 220,
    },
    {
      key: "contact_person_name",
      header: "Contact",
      sortable: true,
      render: (row) => (
        <div className="carepay-stack">
          <strong>{row.contact_person_name || "-"}</strong>
          <span>{row.hospital_phone || "-"}</span>
        </div>
      ),
      sortAccessor: (row) => (row.contact_person_name || "").toLowerCase(),
      width: 170,
    },
    {
      key: "bank_name",
      header: "Bank",
      sortable: true,
      render: (row) => (
        <div className="carepay-stack">
          <strong>{row.bank_name || "-"}</strong>
          <span>{row.ifsc_code || "-"}</span>
        </div>
      ),
      sortAccessor: (row) => (row.bank_name || "").toLowerCase(),
      width: 190,
    },
    {
      key: "status",
      header: "Credit Status",
      sortable: true,
      filterable: true,
      render: (row) => <span style={statusPillStyle(row.status)}>{normalizeStatus(row.status)}</span>,
      sortAccessor: (row) => normalizeStatus(row.status),
      csvAccessor: (row) => normalizeStatus(row.status),
      width: 150,
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      render: (row) => (row.created_at ? new Date(row.created_at).toLocaleDateString("en-IN") : "-"),
      sortAccessor: (row) => (row.created_at ? Date.parse(row.created_at) : 0),
      width: 130,
    },
    {
      key: "docs",
      header: "Documents",
      render: (row) => (
        <button
          type="button"
          className="carepay-view-btn"
          onClick={() => navigate(`/documents/${row.lan}`)}
          title="Open documents"
        >
          <FileText size={15} />
          Docs
        </button>
      ),
      csvAccessor: () => "",
      width: 130,
    },
    {
      key: "view",
      header: "Details",
      render: (row) => (
        <button
          type="button"
          className="carepay-view-btn"
          onClick={() => navigate(`/carepay-loans/hospital-details/${row.lan}`)}
        >
          <Eye size={15} />
          View
        </button>
      ),
      csvAccessor: () => "",
      width: 120,
    },
  ];

  if (err) {
    return (
      <div className="carepay-hospital-page">
        <div className="carepay-error">
          <h2>CarePay hospitals could not be loaded</h2>
          <p>{err}</p>
          <button type="button" onClick={fetchHospitals}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="carepay-hospital-page">
      <header className="carepay-list-header">
        <div>
          <p>CarePay Hospital Registry</p>
          <h1>Hospital list</h1>
        </div>
        <div className="carepay-stat-row">
          <div>
            <strong>{stats.total}</strong>
            <span>Total</span>
          </div>
          <div>
            <strong>{stats.pending}</strong>
            <span>Pending</span>
          </div>
          <div>
            <strong>{stats.approved}</strong>
            <span>Approved</span>
          </div>
        </div>
      </header>

      {loading ? (
        <p className="carepay-loading">Loading CarePay hospitals...</p>
      ) : (
        <DataTable
          title="CarePay Hospital List"
          rows={rows}
          columns={columns}
          globalSearchKeys={[
            "hospital_legal_name",
            "brand_name",
            "partner_loan_id",
            "application_id",
            "registered_city",
            "registered_district",
            "registered_state",
            "contact_person_name",
            "bank_name",
            "status",
          ]}
          exportFileName="carepay_hospital_list"
        />
      )}

      <style>{`
        .carepay-hospital-page {
          min-height: 100vh;
          padding: 36px;
          background: #f6f9fc;
          color: #10233f;
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .carepay-list-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 18px;
          margin-bottom: 24px;
        }

        .carepay-list-header p {
          margin: 0 0 6px;
          color: #0f766e;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .carepay-list-header h1 {
          margin: 0;
          color: #0f2b5b;
          font-size: 30px;
          font-weight: 800;
        }

        .carepay-stat-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .carepay-stat-row div {
          min-width: 104px;
          border: 1px solid #e5edf5;
          border-radius: 8px;
          background: #ffffff;
          padding: 12px 14px;
          text-align: right;
        }

        .carepay-stat-row strong {
          display: block;
          color: #0f2b5b;
          font-size: 22px;
          line-height: 1;
        }

        .carepay-stat-row span {
          color: #64748b;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .carepay-hospital-link {
          display: flex;
          flex-direction: column;
          gap: 3px;
          border: 0;
          background: transparent;
          padding: 0;
          text-align: left;
          cursor: pointer;
          color: inherit;
        }

        .carepay-hospital-link span:last-child,
        .carepay-stack span {
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
        }

        .carepay-stack {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .carepay-stack strong {
          color: #10233f;
          font-size: 14px;
        }

        .carepay-view-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 36px;
          border: 1px solid #cfe0f1;
          border-radius: 7px;
          padding: 0 12px;
          background: #ffffff;
          color: #0f2b5b;
          font-weight: 800;
          cursor: pointer;
        }

        .carepay-loading {
          margin: 0;
          color: #475569;
          font-weight: 700;
        }

        .carepay-error {
          max-width: 520px;
          margin: 120px auto;
          background: #ffffff;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 28px;
          text-align: center;
        }

        .carepay-error h2 {
          margin: 0 0 10px;
          color: #991b1b;
        }

        .carepay-error button {
          height: 40px;
          border: 0;
          border-radius: 7px;
          padding: 0 18px;
          background: #0f766e;
          color: white;
          font-weight: 800;
          cursor: pointer;
        }

        @media (max-width: 900px) {
          .carepay-hospital-page {
            padding: 20px;
          }

          .carepay-list-header {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default CarePayHospitalLists;
