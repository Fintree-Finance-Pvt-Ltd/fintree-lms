import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const MotionCorpDealerLists = () => {

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

    api.get("/motion-corp/dealer-list")
      .then((res) => {
        if (!off) setRows(res.data || []);
      })
      .catch(() => {
        if (!off) setErr("System Error: Unable to load dealer registry.");
      })
      .finally(() => {
        if (!off) setLoading(false);
      });

    return () => (off = true);

  }, []);

  /*
  ==========================
  TABLE COLUMNS (MATCH UI)
  ==========================
  */
  const columns = [

    {
      key: "business_name",
      header: "Dealer Name",
      render: (r) => (
        <div
          className="dealer-cell"
          onClick={() => navigate(`/motion-corp/dealer-details/${r.lan}`)}
        >
          <span className="dealer-name">{r.business_name}</span>
          <span className="dealer-sub">{r.trade_name || "EV Dealer"}</span>
        </div>
      ),
      width: 250,
    },

    {
      key: "business_type",
      header: "Business Type",
      render: (r) => (
        <span className="dealer-badge">{r.business_type}</span>
      ),
      width: 160,
    },

    {
      key: "location",
      header: "Location",
      render: (r) => (
        <div className="dealer-location">
          <span className="city">{r.city}</span>
          <span className="state">{r.state}</span>
        </div>
      ),
      width: 200,
    },

    {
      key: "owner",
      header: "Owner",
      render: (r) => (
        <div>
          <strong>{r.owner_name}</strong>
          <br />
          <span style={{ fontSize: 12 }}>{r.owner_mobile}</span>
        </div>
      ),
      width: 180,
    },

    {
      key: "status",
      header: "Status",
      render: (r) => {
        const status = (r.status || "active").toUpperCase();
        return (
          <span className={`dealer-status status-${status.toLowerCase()}`}>
            {status}
          </span>
        );
      },
      width: 130,
    },

    {
      key: "docs",
      header: "Documents",
      render: (r) => (
        <button
          className="dealer-btn"
          onClick={() => navigate(`/documents/${r.lan}`)}
        >
          📂 Docs
        </button>
      ),
      width: 120,
    },

  ];

  /*
  ==========================
  ERROR UI
  ==========================
  */
  if (err) return (
    <div className="dealer-error">
      <div className="dealer-error-card">
        <h3>Connection Error</h3>
        <p>{err}</p>
        <button onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    </div>
  );

  /*
  ==========================
  MAIN UI
  ==========================
  */
  return (
    <div className="dealer-wrapper">

      <LoaderOverlay show={loading} label="Loading Dealer Data..." />

      {/* HEADER */}
      <header className="dealer-header">

        <div>
          <h1>Motion Corp Dealer Registry</h1>
          <p>Authorized EV dealers & financial onboarding</p>
        </div>

        <div className="dealer-stats">
          <div className="count">{rows.length}</div>
          <div className="label">Total Dealers</div>
        </div>

      </header>

      {/* TABLE */}
      <div className="dealer-table">

        <DataTable
          title={null}
          rows={rows}
          columns={columns}
          globalSearchKeys={[
            "business_name",
            "trade_name",
            "city",
            "state",
            "owner_name"
          ]}
          exportFileName="motion_corp_dealers"
        />

      </div>

      {/* CSS */}
      <style>{`

        .dealer-wrapper {
          padding: 40px;
          background: #f8fafc;
          min-height: 100vh;
          font-family: 'Inter', sans-serif;
        }

        .dealer-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
        }

        .dealer-header h1 {
          font-size: 28px;
          font-weight: 800;
          margin: 0;
        }

        .dealer-header p {
          margin: 5px 0 0;
          color: #64748b;
        }

        .dealer-stats {
          background: #fff;
          padding: 12px 20px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }

        .count {
          font-size: 22px;
          font-weight: 800;
          color: #2563eb;
        }

        .label {
          font-size: 11px;
          color: #64748b;
        }

        .dealer-cell {
          display: flex;
          flex-direction: column;
          cursor: pointer;
        }

        .dealer-name {
          font-weight: 700;
          color: #2563eb;
        }

        .dealer-sub {
          font-size: 11px;
          color: #64748b;
        }

        .dealer-badge {
          background: #eff6ff;
          color: #1d4ed8;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }

        .dealer-location .city {
          font-weight: 600;
        }

        .dealer-location .state {
          font-size: 12px;
          color: #64748b;
        }

        .dealer-status {
          padding: 5px 10px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 700;
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

        .dealer-btn {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #93c5fd;
          background: white;
          color: #1d4ed8;
          cursor: pointer;
        }

        .dealer-btn:hover {
          background: #2563eb;
          color: white;
        }

        .dealer-error {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .dealer-error-card {
          padding: 30px;
          background: white;
          border-radius: 16px;
          text-align: center;
        }

      `}</style>

    </div>
  );
};

export default MotionCorpDealerLists;