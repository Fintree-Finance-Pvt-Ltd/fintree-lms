import React, { useEffect, useState } from "react";
import DisbursalTrendChart from "../components/charts/DisbursalTrendChart";
import RepaymentTrendChart from "../components/charts/RepaymentTrendChart";
import CollectionVsDueChart from "../components/charts/CollectionVsDueChart";
import ChartFilter from "../components/charts/ChartFilter";
import ProductDistributionChart from "../components/charts/ProductDistributionChart";
import DpdBuckets from "../components/charts/DpdBuckets";
import LoaderOverlay from "../components/ui/LoaderOverlay"
import "../styles/Dashboard.css";
import api from "../api/api";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("disbursal");
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    product: "ALL",
    from: "",
    to: "",
  });
const [metrics, setMetrics] = useState({
  totalDisbursed: 0,
  totalCollected: 0,
  collectionRate: 0,
  posOutstanding: 0,
  totalPrincipal: 0,
  totalInterest: 0,
});

  useEffect(() => {
    fetchMetrics();
  }, [filters]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const res = await api.post(
        `/dashboard/metric-cards`,
        filters
      );
      setMetrics(res.data);
    } catch (err) {
      console.error("Metric Cards Fetch Error:", err);
    }finally{
      setLoading(false)
    }
  };

  return (
    <>
    <LoaderOverlay show={loading} label="Fetching dashboard data" />
    <div style={{ padding: "1rem", overflowY: "auto" }}>
      <ChartFilter onFilterChange={setFilters} />

      <div className="metric-cards-container">
        <div className="metric-card">
          <div className="metric-title">Total Disbursed</div>
          <div className="metric-value">
            ₹{Math.round(metrics.totalDisbursed).toLocaleString("en-IN")}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-title">Total Collected</div>
          <div className="metric-value">
            ₹{Math.round(metrics.totalCollected).toLocaleString("en-IN")}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-title">Collection Rate</div>
          <div className="metric-value">
            {metrics.collectionRate.toFixed(2)}%
          </div>
        </div>
        <div className="metric-card">
  <div className="metric-title">Principal Collected</div>
  <div className="metric-value">
    ₹{Math.round(metrics.totalPrincipal).toLocaleString("en-IN")}
  </div>
</div>

<div className="metric-card">
  <div className="metric-title">Interest Collected</div>
  <div className="metric-value">
    ₹{Math.round(metrics.totalInterest).toLocaleString("en-IN")}
  </div>
</div>


        <div className="metric-card">
  <div className="metric-title">POS (Principal Outstanding)</div>
  <div className="metric-value">
    ₹{Math.round(metrics.posOutstanding).toLocaleString("en-IN")}
  </div>
</div>

      </div>

      <ProductDistributionChart filters={filters} />
      <div className="chart-tabs">
        <div className="tab-buttons">
          <button
            className={activeTab === "disbursal" ? "active" : ""}
            onClick={() => setActiveTab("disbursal")}
          >
            Disbursal
          </button>
          <button
            className={activeTab === "repayment" ? "active" : ""}
            onClick={() => setActiveTab("repayment")}
          >
            Repayment
          </button>
          <button
            className={activeTab === "collection" ? "active" : ""}
            onClick={() => setActiveTab("collection")}
          >
            Collection vs Due
          </button>
           <button className={activeTab === "dpd" ? "active" : ""} onClick={() => setActiveTab("dpd")}>DPD Buckets</button>

        </div>

        <div className="tab-content">
          {activeTab === "disbursal" && (
            <DisbursalTrendChart filters={filters} />
          )}
          {activeTab === "repayment" && (
            <RepaymentTrendChart filters={filters} />
          )}
          {activeTab === "collection" && (
            <CollectionVsDueChart filters={filters} />
          )}
          {activeTab === "dpd" && <DpdBuckets filters={filters} />}
        </div>
      </div>
    </div>
    </>
  );
};

export default Dashboard;
