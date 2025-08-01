import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import api from "../../api/api";

const CollectionVsDueChart = ({ filters }) => {
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    api
      .post(`/dashboard/collection-vs-due`, filters)
      .then((res) => {
        const raw = Array.isArray(res.data) ? res.data : [];
        const grouped = {};

        raw.forEach(({ month, product, total_due, total_collected }) => {
          const key = `${month}_${product}`;
          if (!grouped[key]) {
            grouped[key] = { month, product, due: 0, collected: 0 };
          }
          grouped[key].due += Number(total_due);
          grouped[key].collected += Number(total_collected);
        });

        const formatted = Object.values(grouped);
        formatted.sort((a, b) => new Date(a.month) - new Date(b.month));

        setChartData(formatted);
      })
      .catch((err) => console.error("❌ Failed to fetch collection vs due:", err));
  }, [filters]);

  return (
    <div style={{ padding: "1rem", background: "#fff", borderRadius: "8px", marginTop: "2rem" }}>
      <h2>Collection vs Due (Stacked)</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(val) => Number(val).toLocaleString()} />
          <Tooltip formatter={(v) => Number(v).toLocaleString()} />
          <Legend />
          <Bar dataKey="due" stackId="a" fill="#ffc658" name="Due" />
          <Bar dataKey="collected" stackId="a" fill="#82ca9d" name="Collected" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CollectionVsDueChart;
