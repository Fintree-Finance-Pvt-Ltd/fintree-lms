import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const ClaimBuddyHospitalLists = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let off = false;

    api
      .get("claim-buddy/hospitals")
      .then((res) => {
        if (!off) {
          setRows(res.data || []);
        }
      })
      .catch(() => {
        if (!off) {
          setErr(
            "System Error: Unable to synchronize with hospital registry."
          );
        }
      })
      .finally(() => {
        if (!off) {
          setLoading(false);
        }
      });

    return () => {
      off = true;
    };
  }, []);

  const columns = [
    {
      key: "hospital_legal_name",
      header: "Medical Facility",
      render: (r) => (
        <div
          className="med-facility-cell"
          onClick={() => {
            if (!r.lan) return;

            navigate(
              `/claim-buddy/hospital-details/${encodeURIComponent(r.lan)}`
            );
          }}
        >
          <span className="facility-name">
            {r.hospital_legal_name}
          </span>

          <span className="facility-brand">
            {r.brand_name || "Private Provider"}
          </span>
        </div>
      ),
      width: 250,
    },

    {
      key: "hospital_type",
      header: "Category",
      render: (r) => (
        <span className="med-badge">
          {r.hospital_type}
        </span>
      ),
      width: 160,
    },

    {
      key: "bed_capacity",
      header: "Capacity",
      render: (r) => (
        <div className="bed-indicator">
          <span className="bed-count">
            {r.bed_capacity}
          </span>

          <span className="bed-label">
            Beds
          </span>
        </div>
      ),
      width: 100,
    },

    {
      key: "location",
      header: "Regional Office",
      render: (r) => (
        <div className="med-loc-stack">
          <span className="city">
            {r.registered_city}
          </span>

          <span className="state">
            {r.registered_state}
          </span>
        </div>
      ),
      width: 200,
    },

    {
      key: "status",
      header: "Registry Status",
      render: (r) => {
        const status = (r.status || "active").toUpperCase();

        return (
          <span
            className={`med-status-pill status-${status.toLowerCase()}`}
          >
            {status}
          </span>
        );
      },
      width: 130,
    },

    {
      key: "docs",
      header: "Archives",
      render: (r) => (
        <button
          className="med-action-btn"
          onClick={() =>
            navigate(`/documents/${r.lan}`)
          }
        >
          Clinical Docs
        </button>
      ),
      width: 130,
    },
  ];

  if (err) {
    return (
      <div className="med-error-state">
        <div className="med-error-card">
          <h3>Connection Interrupted</h3>

          <p>{err}</p>

          <button
            onClick={() => window.location.reload()}
          >
            Retry Sync
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="medical-dashboard-wrapper">
      <LoaderOverlay
        show={loading}
        label="Accessing Clinical Data..."
      />

      <header className="med-header">
        <div className="med-title-group">
          <h1>Facility Registry</h1>

          <p>
            Verified clinical partners and bed capacities
          </p>
        </div>

        <div className="med-stats-card">
          <div className="stat-value">
            {rows.length}
          </div>

          <div className="stat-label">
            Active Hospitals
          </div>
        </div>
      </header>

      <div className="med-table-container">
        <DataTable
          title={null}
          rows={rows}
          columns={columns}
          globalSearchKeys={[
            "hospital_legal_name",
            "brand_name",
            "registered_city",
            "owner_name",
          ]}
          exportFileName="claim_buddy_hospital_registry_export"
        />
      </div>

      <style>{`
        .medical-dashboard-wrapper {
          --med-teal: #0d9488;
          --med-teal-dark: #0f766e;
          --med-bg: #f0fdfa;
          --med-text-dark: #134e4a;
          --med-text-muted: #64748b;
          --med-border: #ccfbf1;

          padding: 40px;
          background: var(--med-bg);
          min-height: 100vh;
          font-family: 'Inter', -apple-system, sans-serif;
        }

        .med-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 30px;
        }

        .med-title-group h1 {
          font-size: 28px;
          font-weight: 800;
          color: var(--med-text-dark);
          margin: 0;
          letter-spacing: -0.02em;
        }

        .med-title-group p {
          color: var(--med-teal-dark);
          margin-top: 4px;
          font-size: 15px;
          opacity: 0.8;
        }

        .med-stats-card {
          background: #ffffff;
          padding: 12px 24px;
          border-radius: 14px;
          border: 1px solid var(--med-border);
          text-align: right;
          box-shadow: 0 4px 6px -1px rgba(13, 148, 136, 0.05);
        }

        .stat-value {
          font-size: 22px;
          font-weight: 800;
          color: var(--med-teal);
          line-height: 1;
        }

        .stat-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--med-text-dark);
          opacity: 0.6;
        }

        /*
        .med-table-container {
          background: #ffffff;
          border-radius: 20px;
          border: 1px solid var(--med-border);
          padding: 12px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.04);
        }
        */

        .med-facility-cell {
          display: flex;
          flex-direction: column;
          cursor: pointer;
        }

        .facility-name {
          color: var(--med-teal);
          font-weight: 700;
          font-size: 15px;
        }

        .facility-brand {
          font-size: 11px;
          color: var(--med-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .med-badge {
          background: var(--med-bg);
          color: var(--med-teal-dark);
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          border: 1px solid var(--med-border);
        }

        .bed-indicator .bed-count {
          font-weight: 800;
          color: var(--med-text-dark);
          font-size: 16px;
          margin-right: 4px;
        }

        .bed-indicator .bed-label {
          font-size: 10px;
          color: var(--med-text-muted);
          text-transform: uppercase;
        }

        .med-loc-stack .city {
          display: block;
          font-weight: 600;
          color: var(--med-text-dark);
          font-size: 14px;
        }

        .med-loc-stack .state {
          font-size: 12px;
          color: var(--med-text-muted);
        }

        .med-status-pill {
          padding: 5px 12px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.03em;
        }

        .status-active,
        .status-approved {
          background: #dcfce7;
          color: #166534;
        }

        .status-inactive {
          background: #fee2e2;
          color: #991b1b;
        }

        .med-action-btn {
          background: #ffffff;
          border: 1px solid var(--med-border);
          color: var(--med-teal-dark);
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: 0.2s;
        }

        .med-action-btn:hover {
          background: var(--med-teal);
          color: #ffffff;
          border-color: var(--med-teal);
          transform: translateY(-1px);
        }

        .med-error-state {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f0fdfa;
        }

        .med-error-card {
          background: white;
          padding: 40px;
          border-radius: 20px;
          text-align: center;
          border: 1px solid #fee2e2;
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
        }

        .med-error-card h3 {
          color: #991b1b;
          margin-bottom: 10px;
        }

        .med-error-card button {
          margin-top: 20px;
          background: #ef4444;
          color: white;
          border: none;
          padding: 10px 24px;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};

export default ClaimBuddyHospitalLists;