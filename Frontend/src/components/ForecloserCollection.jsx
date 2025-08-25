// File: frontend/src/components/ForecloserCollection.jsx

import React, { useEffect, useState } from "react";
import api from "../api/api";
//import { useLocation } from "react-router-dom";
import { useParams } from "react-router-dom";

const ForecloserCollection = () => {
 // const location = useLocation();
 // const lan = location.state?.lan || ""; // LAN passed from previous page
 //const [lan, setLan] = useState("lan");
 const { lan } = useParams();
  const [data, setData] = useState([]);

  useEffect(() => {
    if (lan) {
      fetchData();
    }
  }, [lan]);

  const fetchData = async () => {
    try {
      const response = await api.get(`/forecloser-collection/fc/${lan}`);
      setData(response.data);
    } catch (err) {
      console.error("❌ Failed to fetch foreclosure data", err);
    }
  };
  const handleCollect = async () => {
    try {
      const payload = data.map((row) => ([
        {
          lan: row.lan,
          charge_type: "Accrued Interest",
          amount: row.accrued_interest || 0,
        },
        {
          lan: row.lan,
          charge_type: "Foreclosure Fee",
          amount: row.foreclosure_fee || 0,
        },
        {
          lan: row.lan,
          charge_type: "Foreclosure Fee Tax",
          amount: row.foreclosure_tax || 0,
        }
      ])).flat();
  
      await api.post(`/forecloser-collection/fc/collect`, payload);
      alert("✅ Charges inserted into loan_charges successfully.");
    } catch (err) {
      console.error("❌ Failed to collect charges", err);
      alert("❌ Failed to insert charges.");
    }
  };
  

  return (
    <div className="container mt-4">
      <h3>📅 Foreclosure Collection for LAN: <span className="text-primary">{lan}</span></h3>

      <table className="table table-bordered table-hover mt-3">
        <thead className="table-dark">
          <tr>
            <th>LAN</th>
            <th>Accrued Interest</th>
            <th>Remaining Principal</th>
            <th>Remaining Interest</th>
            <th>Foreclosure Fee</th>
            <th>Foreclosure Fee Tax</th>
            <th>Total FC Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx}>
              <td>{row.lan}</td>
              <td>{Number(row.accrued_interest || 0).toFixed(2)}</td>
              <td>{Number(row.total_remaining_principal || 0)}</td>
              <td>{Number(row.total_remaining_interest || 0)}</td>
              <td>{Number(row.foreclosure_fee || 0)}</td>
              <td>{Number(row.foreclosure_tax || 0)}</td>
              <td><strong>{Number(row.total_fc_amount || 0).toFixed(2)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn btn-success mt-3" onClick={handleCollect}>
  💰 Collect Charges
</button>

    </div>
  );
};

export default ForecloserCollection;
