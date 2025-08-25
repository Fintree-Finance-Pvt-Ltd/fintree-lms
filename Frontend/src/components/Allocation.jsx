

import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import "../styles/Allocation.css"; // Make sure this path is correct

const AllocationPage = () => {
  const { lan } = useParams();
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAllocations = async () => {
      try {
        const response = await api.get(`/allocate/allocations/${lan}`);
        setAllocations(response.data.allocations || []);
      } catch (err) {
        setError("❌ Failed to fetch allocation data.");
        console.error("Error fetching allocation data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllocations();
  }, [lan]);

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const formatTime = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US");
  };

  return (
    <div className="allocation-container">
      <h2>View All Cashflows ({allocations.length})</h2>

      <input
        type="text"
        className="form-control mb-3"
        placeholder="🔍 Search Payment ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p>⏳ Loading data...</p>
      ) : error ? (
        <p className="text-danger">{error}</p>
      ) : allocations.length === 0 ? (
        <p>⚠️ No allocation records found.</p>
      ) : (
        <table className="allocation-table">
          <thead>
            <tr>
              <th>Due Date</th>
              <th>Allocation Date</th>
              <th>Allocated Amount</th>
              <th>Charge Type</th>
              <th>Created At</th>
              <th>Payment ID</th>
            
            </tr>
          </thead>
          <tbody>
            {allocations
              .filter((item) =>
                item.payment_id?.toLowerCase().includes(search.toLowerCase())
              )
              .map((allocation, index) => (
                <tr key={index}>
                  <td>{formatDate(allocation.due_date)}</td>
                  <td>{formatDate(allocation.allocation_date)}</td>
                  <td>{allocation.allocated_amount}</td>
                  <td>{allocation.charge_type}</td>
                  <td>{formatDate(allocation.created_at)}</td>
                  <td>{allocation.payment_id}</td>
                  
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AllocationPage;
