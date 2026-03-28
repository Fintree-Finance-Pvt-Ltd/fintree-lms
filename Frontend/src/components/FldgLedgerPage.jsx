import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import "../styles/PartnerLimitEntry.css";

const FldgLedgerPage = () => {

  const { partnerId } = useParams();

  const [ledger, setLedger] = useState([]);
  const [partnerName, setPartnerName] = useState("");
  const [balance, setBalance] = useState(0);


  const fetchLedger = async () => {

    try {

      const ledgerRes = await api.get(`fldg/ledger/${partnerId}`);
      const ledgerData = ledgerRes.data.ledger;

// sort oldest → newest for correct running balance
ledgerData.sort(
  (a, b) => new Date(a.entry_date) - new Date(b.entry_date)
);

// calculate running balance
let running = 0;

const withBalance = ledgerData.map((row) => {

  if (row.entry_type === "CREDIT" || row.entry_type === "RELEASED") {
    running += Number(row.amount);
  } else {
    running -= Number(row.amount);
  }

  return {
    ...row,
    running_balance: running
  };

});

// reverse back to latest-first for display
setLedger(withBalance.reverse());
      setPartnerName(ledgerRes.data.partner_name);

      const summaryRes = await api.get(`fldg/summary/${partnerId}`);
      setBalance(summaryRes.data.remaining_amount);

    } catch (err) {

      console.error("Ledger fetch error:", err);
      alert("Failed to load ledger");

    }

  };


  useEffect(() => {
    fetchLedger();
  }, [partnerId]);


  const formatCurrency = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN")}`;


  const getBadgeClass = (type) => {

    if (type === "CREDIT") return "status-active";
    if (type === "RESERVED") return "remaining-negative";
    if (type === "RELEASED") return "remaining-positive";

    return "status-inactive";

  };


  return (

    <div className="partner-page">

      <div className="partner-container">

        <div className="page-header">
          <h1>FLDG Ledger — {partnerName}</h1>
          <p>Detailed transaction history</p>
        </div>


        {/* Balance */}

        <div className="card">

          <div className="card-title">
            Available Balance
          </div>

          <h2 style={{ color: "#2e7d32" }}>
            {formatCurrency(balance)}
          </h2>

        </div>


        {/* Ledger Table */}

        <div className="card table-card">

          <table className="partner-table">

            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Reference</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Running Balance</th>
                <th>Remarks</th>
              </tr>
            </thead>

            <tbody>

              {ledger.map(row => (

                <tr key={`${row.entry_type}-${row.id}`}>

                  <td>
                    {row.entry_date?.slice(0, 10)}
                  </td>

                  <td>
                    <span className={`status-badge ${getBadgeClass(row.entry_type)}`}>
                      {row.entry_type}
                    </span>
                  </td>

                  <td>
                    {row.reference || "-"}
                  </td>

                  <td className="text-right">
                    {formatCurrency(row.amount)}
                  </td>

                  <td className="text-right">
        {formatCurrency(row.running_balance)}
      </td>

                  <td>
                    {row.remarks || "-"}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>


          {ledger.length === 0 && (

            <div className="empty-state">
              No ledger entries found
            </div>

          )}

        </div>

      </div>

    </div>

  );

};

export default FldgLedgerPage;