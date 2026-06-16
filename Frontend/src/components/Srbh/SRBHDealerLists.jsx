import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const SRBHDealerLists = () => {

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

    api.get("/srbh/dealer-list")
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
          onClick={() => navigate(`/srbh/dealer-details/${r.lan}`)}
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
          <br />
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
          <h1>SRBH Dealer Registry</h1>
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
            "business_type",
            "city",
            "state",
            "owner_name"
          ]}
          exportFileName="srbh_dealers"
        />

      </div>

      {/* CSS */}
 <style>{`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  .dealer-wrapper {
    --bg-main: #f8fafc;
    --bg-card: #ffffff;
    --primary: #0284c7;
    --primary-light: #e0f2fe;
    --text-main: #0f172a;
    --text-muted: #64748b;
    --border-color: #e2e8f0;
    --border-hover: #cbd5e1;
    --success-green: #10b981;
    --success-bg: #ecfdf5;
    --error-red: #ef4444;
    --error-bg: #fef2f2;
    
    padding: 50px 40px;
    background: var(--bg-main);
    min-height: 100vh;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--text-main);
    /* Matching geometric layout alignment */
    background-image: 
      radial-gradient(#e2e8f0 1.5px, transparent 1.5px), 
      radial-gradient(#e2e8f0 1.5px, var(--bg-main) 1.5px);
    background-size: 30px 30px;
    background-position: 0 0, 15px 15px;
  }

  .dealer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 40px;
    background: var(--bg-card);
    padding: 30px 40px;
    border-radius: 20px;
    border: 1px solid var(--border-color);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
  }

  .dealer-header h1 {
    font-size: 30px;
    font-weight: 800;
    margin: 0;
    letter-spacing: -0.75px;
    color: var(--text-main);
  }

  .dealer-header p {
    margin: 6px 0 0;
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 400;
  }

  .dealer-stats {
    background: var(--bg-card);
    padding: 14px 24px;
    border-radius: 14px;
    border: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    min-width: 140px;
  }

  .count {
    font-size: 26px;
    font-weight: 800;
    color: var(--text-main);
    line-height: 1.1;
  }

  .label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 4px;
  }

  /* Applied styling logic for elements within tabular lists/grids */
  .dealer-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    cursor: pointer;
    transition: transform 0.2s ease;
  }

  .dealer-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-main);
    transition: color 0.2s ease;
  }

  .dealer-cell:hover .dealer-name {
    color: var(--primary);
  }

  .dealer-sub {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .dealer-badge {
    background: var(--primary-light);
    color: var(--primary);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 700;
    display: inline-block;
    border: 1px solid rgba(2, 132, 199, 0.1);
    letter-spacing: 0.3px;
  }

  .dealer-location .city {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-main);
  }

  .dealer-location .state {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .dealer-status {
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .status-active,
  .status-approved {
    background: var(--success-bg);
    color: var(--success-green);
    border: 1px solid rgba(16, 185, 129, 0.15);
  }

  .status-inactive {
    background: var(--error-bg);
    color: var(--error-red);
    border: 1px solid rgba(239, 68, 68, 0.15);
  }

  .dealer-btn {
    padding: 10px 18px;
    border-radius: 12px;
    border: 1px solid var(--border-color);
    background: #ffffff;
    color: var(--text-main);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  }

  .dealer-btn:hover {
    background: var(--text-main);
    color: #ffffff;
    border-color: var(--text-main);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
  }

  .dealer-btn:active {
    transform: translateY(0);
  }

  .dealer-error {
    height: 80vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 20px;
  }

  .dealer-error-card {
    padding: 40px;
    background: var(--bg-card);
    border-radius: 20px;
    border: 1px solid var(--border-color);
    text-align: center;
    max-width: 440px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
  }

  .dealer-error-card h3 {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-main);
    margin-bottom: 8px;
  }

  .dealer-error-card p {
    font-size: 14px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  @media (max-width: 768px) {
    .dealer-wrapper {
      padding: 30px 20px;
    }

    .dealer-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 20px;
      padding: 24px 30px;
    }

    .dealer-stats {
      align-items: flex-start;
      width: 100%;
      min-width: unset;
    }
  }

  @media (max-width: 480px) {
    .dealer-header h1 {
      font-size: 24px;
    }
    
    .dealer-header p {
      font-size: 13px;
    }

    .dealer-error-card {
      padding: 30px 20px;
    }
  }
`}</style>

    </div>
  );
};

export default  SRBHDealerLists;