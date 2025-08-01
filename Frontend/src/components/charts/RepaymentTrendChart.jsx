import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import api from "../../api/api";

const colors = {
  EV_loan: "#8884d8",
  BL_loan: "#82ca9d",
  Adikosh: "#ffc658",
  "GQ Non-FSF": "#ff7300"
};

const products = ["EV_loan", "BL_loan", "Adikosh", "GQ Non-FSF"];

const RepaymentTrendChart = ({ filters }) => {
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    api
      .post(`/dashboard/repayment-trend`, filters)
      .then((res) => {
        const raw = res.data || [];
        const grouped = {};

        raw.forEach(({ month, product, total_collected }) => {
          if (!grouped[month]) grouped[month] = { month };
          grouped[month][product] = Number(total_collected);
        });

        const formatted = Object.values(grouped).map((entry) => {
          products.forEach((p) => {
            if (entry[p] === undefined) entry[p] = 0;
          });
          return entry;
        });

        setChartData(formatted);
      })
      .catch((err) => console.error("❌ Failed to fetch repayment trend:", err));
  }, [filters]);

  return (
    <div style={{ padding: "1rem", background: "#fff", borderRadius: "8px", marginTop: "2rem" }}>
      <h2>Repayment Collection Trend</h2>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(v) => v.toLocaleString()} />
          <Tooltip formatter={(v) => v.toLocaleString()} />
          <Legend />
          {products.map((product) => (
            <Line key={product} dataKey={product} stroke={colors[product]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RepaymentTrendChart;
