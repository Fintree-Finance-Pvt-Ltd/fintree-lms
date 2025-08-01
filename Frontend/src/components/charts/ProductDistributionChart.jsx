// components/charts/ProductDistributionChart.js
import React, { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import api from "../../api/api";

const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#00bcd4"];

const ProductDistributionChart = ({ filters }) => {
  const [data, setData] = useState([]);

  useEffect(() => {
    api
      .post(`/dashboard/product-distribution`, filters)
      .then((res) => setData(res.data))
      .catch((err) => console.error("Pie Chart Error:", err));
  }, [filters]);

  return (
    <div className="chart-card">
      <h3 className="chart-title">Product Distribution</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="product"
            cx="50%"
            cy="50%"
            outerRadius={100}
            fill="#8884d8"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProductDistributionChart;
