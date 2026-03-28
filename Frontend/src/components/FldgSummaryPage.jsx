import React, { useEffect, useState } from "react";
import api from "../api/api";
import "../styles/PartnerLimitEntry.css";
import { useNavigate } from "react-router-dom";

const FldgSummaryPage = () => {

  const [data, setData] = useState([]);
  const navigate = useNavigate();

  const fetchSummary = async () => {

    try {

      const res = await api.get("fldg/summary");

      setData(res.data);

    } catch (err) {

      console.error("Summary fetch error:", err);

      alert("Failed to load FLDG summary");

    }

  };

  useEffect(() => {
    fetchSummary();
  }, []);


  const formatCurrency = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN")}`;


  return (

    <div className="partner-page">

      <div className="partner-container">

        <div className="page-header">
          <h1>FLDG Management Dashboard</h1>
          <p>Partner-wise FLDG utilization and balance tracking</p>
        </div>


        <div className="card table-card">

          <table className="partner-table">

            <thead>

              <tr>
                <th>Partner</th>
                <th>FLDG %</th>
                <th className="text-right">Total Received</th>
                <th className="text-right">Utilized</th>
                <th className="text-right">Remaining</th>
                <th>Actions</th>
              </tr>

            </thead>


            <tbody>

              {data.map(p => (

                <tr key={p.partner_id}>

                  <td>{p.partner_name}</td>

                  <td>{p.fldg_percent || 0}%</td>

                  <td className="text-right">
                    {formatCurrency(p.total_received)}
                  </td>

                  <td className="text-right used-value">
                    {formatCurrency(p.utilized_amount)}
                  </td>

                  <td
                    className={`text-right remaining-value ${
                      p.remaining_amount > 0
                        ? "remaining-positive"
                        : "remaining-negative"
                    }`}
                  >
                    {formatCurrency(p.remaining_amount)}
                  </td>

                  <td>

                    <button
                      className="link-btn"
                      onClick={() =>
                        navigate(
                          `/fldg-ledger/${p.partner_id}`
                        )
                      }
                    >
                      View Ledger
                    </button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>


          {data.length === 0 && (

            <div className="empty-state">
              No partner FLDG data found
            </div>

          )}

        </div>

      </div>

    </div>

  );

};

export default FldgSummaryPage;