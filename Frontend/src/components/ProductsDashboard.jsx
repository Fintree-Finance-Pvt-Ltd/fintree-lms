import React, { useEffect, useState, useCallback } from "react";
import ChartFilter from "../components/charts/ChartFilter";
import DpdBuckets from "../components/charts/DpdBuckets";
import LoaderOverlay from "../components/ui/LoaderOverlay";
import "../styles/Dashboard.css";
import api from "../api/api";

/* ── helpers ─────────────────────────────────────────────────── */
const fmt = (n) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;
const pct = (n) => `${Number(n || 0).toFixed(2)}%`;
const num = (n) => Number(n || 0).toLocaleString("en-IN");

const DEFAULT_METRICS = {
  totalDisbursed:  0,
  totalCollected:  0,
  collectionRate:  0,
  posOutstanding:  0,
  totalPrincipal:  0,
  totalInterest:   0,
  dpdCases:        { dpd_0_30: 0, dpd_31_60: 0, dpd_61_90: 0, dpd_91_plus: 0 },
  lenderWiseDPD:   [],
};

/* ── Card definition (keeps JSX clean) ──────────────────────── */
function buildCards(m) {
  const dpd = m.dpdCases || {};
  return [
    {
      id: "disbursed",
      label: "Total Disbursed",
      value: fmt(m.totalDisbursed),
      icon: "💰",
      accent: "var(--primary)",
    },
    {
      id: "collected",
      label: "Total Collected",
      value: fmt(m.totalCollected),
      icon: "✅",
      accent: "#22c55e",
    },
    {
      id: "rate",
      label: "Collection Rate",
      value: pct(m.collectionRate),
      icon: "📊",
      accent: m.collectionRate >= 90 ? "#22c55e" : m.collectionRate >= 70 ? "#f59e0b" : "#ef4444",
    },
    {
      id: "principal",
      label: "Principal Collected",
      value: fmt(m.totalPrincipal),
      icon: "🏦",
      accent: "#6366f1",
    },
    {
      id: "interest",
      label: "Interest Collected",
      value: fmt(m.totalInterest),
      icon: "📈",
      accent: "#8b5cf6",
    },
    {
      id: "pos",
      label: "POS (Outstanding)",
      value: fmt(m.posOutstanding),
      icon: "⚖️",
      accent: "#f59e0b",
    },
    {
      id: "dpd030",
      label: "DPD 0–30",
      value: num(dpd.dpd_0_30),
      icon: "🟢",
      accent: "#22c55e",
      subtitle: "loans",
    },
    {
      id: "dpd3160",
      label: "DPD 31–60",
      value: num(dpd.dpd_31_60),
      icon: "🟡",
      accent: "#f59e0b",
      subtitle: "loans",
    },
    {
      id: "dpd6190",
      label: "DPD 61–90",
      value: num(dpd.dpd_61_90),
      icon: "🟠",
      accent: "#f97316",
      subtitle: "loans",
    },
    {
      id: "dpd91",
      label: "DPD 91+",
      value: num(dpd.dpd_91_plus),
      icon: "🔴",
      accent: "#ef4444",
      subtitle: "loans",
    },
  ];
}

/* ── MetricCard component ────────────────────────────────────── */
function MetricCard({ card, cached }) {
  return (
    <div className="metric-card" style={{ "--card-accent": card.accent }}>
      <div className="metric-card-icon">{card.icon}</div>
      <div className="metric-title">{card.label}</div>
      <div className="metric-value">{card.value}</div>
      {card.subtitle && (
        <div className="metric-subtitle">{card.subtitle}</div>
      )}
      {cached && <span className="cache-badge" title="Served from Redis cache">⚡ cached</span>}
    </div>
  );
}

/* ── LenderWiseDPD mini-table ────────────────────────────────── */
function LenderWiseDPD({ data }) {
  if (!data || !data.length) return null;
  return (
    <div className="chart-card" style={{ marginTop: 16 }}>
      <div className="chart-title">Lender-wise DPD Breakdown</div>
      <div style={{ overflowX: "auto" }}>
        <table className="dpd-mini-table">
          <thead>
            <tr>
              <th>Lender</th>
              <th>DPD 0–30</th>
              <th>DPD 31–60</th>
              <th>DPD 61–90</th>
              <th>DPD 91+</th>
              <th>Remaining Principal</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.lender}>
                <td>{r.lender}</td>
                <td>{num(r.dpd_0_30)}</td>
                <td>{num(r.dpd_31_60)}</td>
                <td>{num(r.dpd_61_90)}</td>
                <td>{num(r.dpd_91_plus)}</td>
                <td>{fmt(r.remainingPrincipal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */
const ProductsDashboard = () => {
  const [activeTab, setActiveTab]   = useState("lenderDpd");
  const [loading,   setLoading]     = useState(false);
  const [error,     setError]       = useState(null);
  const [cached,    setCached]      = useState(false);
  const [metrics,   setMetrics]     = useState(DEFAULT_METRICS);
  const [responseMs, setResponseMs] = useState(null);

  const [filters, setFilters] = useState({
    product: "ALL",
    from: "",
    to: "",
  });

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const t0 = performance.now();
      const res = await api.post("/dashboard/metric-cards", filters);
      const t1 = performance.now();

      setResponseMs(Math.round(t1 - t0));
      setMetrics({ ...DEFAULT_METRICS, ...res.data });

      // Detect cache hit by X-Response-Time header (cached responses are much faster)
      const xrt = res.headers?.["x-response-time"];
      if (xrt) {
        const ms = parseInt(xrt, 10);
        setCached(!isNaN(ms) && ms < 80); // < 80ms = very likely a cache hit
      }
    } catch (err) {
      console.error("Metric Cards Fetch Error:", err);
      setError("Failed to load dashboard metrics. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const cards = buildCards(metrics);

  return (
    <>
      <LoaderOverlay show={loading} label="Loading dashboard…" />
      <div className="products-dashboard">

        {/* ── Filter Bar ── */}
        <div className="dashboard-filter-bar">
          <ChartFilter onFilterChange={setFilters} />
          {responseMs !== null && (
            <div className="perf-badge" title="Last API response time">
              {cached ? "⚡ " : "🕐 "}
              {responseMs}ms{cached ? " (cached)" : ""}
            </div>
          )}
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div className="dashboard-error-banner">
            ⚠️ {error}
            <button onClick={fetchMetrics} className="retry-btn">Retry</button>
          </div>
        )}

        {/* ── Metric Cards Grid ── */}
        <div className="metric-cards-container">
          {cards.map((card) => (
            <MetricCard key={card.id} card={card} cached={cached} />
          ))}
        </div>

        {/* ── Chart Tabs ── */}
        <div className="chart-tabs">
          <div className="tab-buttons">
            <button
              id="tab-lenderDpd"
              className={activeTab === "lenderDpd" ? "active" : ""}
              onClick={() => setActiveTab("lenderDpd")}
            >
              Lender DPD
            </button>
            <button
              id="tab-dpdBuckets"
              className={activeTab === "dpdBuckets" ? "active" : ""}
              onClick={() => setActiveTab("dpdBuckets")}
            >
              DPD Buckets
            </button>
          </div>

          <div className="tab-content">
            {activeTab === "lenderDpd" && (
              <LenderWiseDPD data={metrics.lenderWiseDPD} />
            )}
            {activeTab === "dpdBuckets" && (
              <DpdBuckets filters={filters} />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ProductsDashboard;
