
import React, { useState } from "react";
import "../../styles/ChartFilter.css";

const ChartFilter = ({ onFilterChange }) => {
  const [product, setProduct] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onFilterChange({ product, from, to });
  };

  return (
    <form className="filter-form" onSubmit={handleSubmit}>
      <div className="filter-group">
        <label>Product</label>
        <select value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="ALL">All</option>
          <option value="EV_loan">EV_loan</option>
          <option value="BL_loan">BL_loan</option>
          <option value="Adikosh">Adikosh</option>
          <option value="GQ Non-FSF">GQ Non-FSF</option>
        </select>
      </div>
      <div className="filter-group">
        <label>From</label>
        <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="filter-group">
        <label>To</label>
        <input type="month" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <button className="filter-apply" type="submit">Apply</button>
    </form>
  );
};

export default ChartFilter;
