
import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const ZebrsDealerLists = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const navigate = useNavigate();

  const fetchDealers = async () => {
    setLoading(true);
    setErr("");

    try {
      const res = await api.get("/zebrs/dealer-list");

      const data = res.data;
      setRows(
        Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : []
      );
    } catch (error) {
      console.error("Zebrs dealer fetch error:", error);
      setErr("System Error: Unable to load Zebrs dealer registry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDealers();
  }, []);

  const columns = [
    {
      key: "business_name",
      header: "Dealer Name",
      render: (r) => (
        <div
          className="zb-dealer-cell"
          onClick={() =>
            navigate(`/zebrs/dealer-details/${r.lan}`)
          }
        >
          <span className="zb-dealer-name">
            {r.business_name || "N/A"}
          </span>
          <span className="zb-dealer-sub">
            {r.trade_name || "EV Dealer"}
          </span>
        </div>
      ),
      width: 250,
    },
    {
      key: "dealer_id",
      header: "Dealer ID",
      render: (r) => (
        <span>{r.dealer_id || r.lan || "N/A"}</span>
      ),
      width: 150,
    },
    {
      key: "business_type",
      header: "Business Type",
      render: (r) => (
        <span className="zb-dealer-badge">
          {r.business_type || "N/A"}
        </span>
      ),
      width: 160,
    },
    {
      key: "location",
      header: "Location",
      render: (r) => (
        <div className="zb-dealer-location">
          <strong>{r.city || "N/A"}</strong>
          {" / "}
          <span>{r.state || "N/A"}</span>
        </div>
      ),
      width: 200,
    },
    {
      key: "owner",
      header: "Owner",
      render: (r) => (
        <div>
          <strong>{r.owner_name || "N/A"}</strong>
          <br />
          <span className="zb-dealer-mobile">
            {r.owner_mobile || "N/A"}
          </span>
        </div>
      ),
      width: 180,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const status = String(r.status || "UNKNOWN").toUpperCase();

        return (
          <span
            className={`zb-dealer-status zb-status-${status.toLowerCase()}`}
          >
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
          type="button"
          className="zb-dealer-btn"
          onClick={() => navigate(`/documents/${r.lan}`)}
        >
          📂 Docs
        </button>
      ),
      width: 120,
    },
  ];

  return (
    <div className="zb-dealer-wrapper">
      <LoaderOverlay
        show={loading}
        label="Loading Zebrs Dealer Data..."
      />

      <header className="zb-dealer-header">
        <div>
          <h1>Zebrs Dealer Registry</h1>
          <p>Authorized EV dealers & financial onboarding</p>
        </div>

        <div className="zb-dealer-stats">
          <div className="zb-count">{rows.length}</div>
          <div className="zb-label">Total Dealers</div>
        </div>
      </header>

      {err ? (
        <div className="zb-dealer-error">
          <h3>Connection Error</h3>
          <p>{err}</p>
          <button
            className="zb-dealer-btn"
            onClick={fetchDealers}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="zb-dealer-table">
          <DataTable
            title={null}
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
            exportFileName="zebrs_dealers"
          />
        </div>
      )}

      <style>{`
        .zb-dealer-wrapper {
          padding: 40px;
          background: #f8fafc;
          min-height: 100vh;
          font-family: 'Inter', sans-serif;
        }

        .zb-dealer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 30px;
        }

        .zb-dealer-header h1 {
          font-size: 28px;
          font-weight: 800;
          margin: 0;
          color: #0f172a;
        }

        .zb-dealer-header p {
          margin: 5px 0 0;
          color: #64748b;
        }

        .zb-dealer-stats {
          background: #fff;
          padding: 12px 25px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          text-align: center;
        }

        .zb-count {
          font-size: 24px;
          font-weight: 800;
          color: #2563eb;
        }

        .zb-label {
          font-size: 11px;
          color: #64748b;
        }

        .zb-dealer-table {
          background: #fff;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
        }

        .zb-dealer-cell {
          display: flex;
          flex-direction: column;
          cursor: pointer;
        }

        .zb-dealer-name {
          font-weight: 700;
          color: #2563eb;
        }

        .zb-dealer-sub {
          font-size: 11px;
          color: #64748b;
        }

        .zb-dealer-badge {
          background: #eff6ff;
          color: #1d4ed8;
          padding: 5px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }

        .zb-dealer-location {
          color: #334155;
        }

        .zb-dealer-mobile {
          font-size: 12px;
          color: #64748b;
        }

        .zb-dealer-status {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 700;
        }

        .zb-status-active,
        .zb-status-approved {
          background: #dcfce7;
          color: #166534;
        }

        .zb-status-inactive,
        .zb-status-rejected {
          background: #fee2e2;
          color: #991b1b;
        }

        .zb-status-pending,
        .zb-status-unknown {
          background: #fef3c7;
          color: #92400e;
        }

        .zb-dealer-btn {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #93c5fd;
          background: white;
          color: #1d4ed8;
          cursor: pointer;
        }

        .zb-dealer-btn:hover {
          background: #2563eb;
          color: white;
        }

        .zb-dealer-error {
          background: white;
          border: 1px solid #fecaca;
          border-radius: 14px;
          padding: 30px;
          text-align: center;
        }

        @media (max-width: 768px) {
          .zb-dealer-wrapper {
            padding: 16px;
          }

          .zb-dealer-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .zb-dealer-header h1 {
            font-size: 23px;
          }
        }
      `}</style>
    </div>
  );
};

export default ZebrsDealerLists;
