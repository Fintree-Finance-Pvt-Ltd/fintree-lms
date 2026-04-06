import React, { useState } from "react";
import api from "../../api/api";

const SupplyChainCollectionEntry = () => {
  const [rows, setRows] = useState([
    {
      lan: "",
      collection_date: "",
      collection_utr: "",
      collection_amount: "",
    },
  ]);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  /* ---------------- HANDLE CHANGE ---------------- */

  const handleChange = (index, e) => {
    const { name, value } = e.target;

    const updatedRows = [...rows];
    updatedRows[index][name] = value;

    setRows(updatedRows);
  };

  /* ---------------- ADD ROW ---------------- */

  const addRow = () => {
    setRows([
      ...rows,
      {
        lan: "",
        collection_date: "",
        collection_utr: "",
        collection_amount: "",
      },
    ]);
  };

  /* ---------------- REMOVE ROW ---------------- */

  const removeRow = (index) => {
    const updatedRows = rows.filter((_, i) => i !== index);
    setRows(updatedRows);
  };

  /* ---------------- VALIDATE ---------------- */

  const validateRows = () => {
    for (const row of rows) {
      if (
        !row.lan ||
        !row.collection_date ||
        !row.collection_utr ||
        !row.collection_amount
      ) {
        setMessage("❌ Please fill all fields");
        return false;
      }
    }
    return true;
  };

  /* ---------------- SUBMIT ---------------- */

  const handleSubmit = async () => {
    setMessage("");

    if (!validateRows()) return;

    setLoading(true);

    try {
      const payload = {
        repayments: rows.map((r) => ({
          lan: r.lan,
          collection_date: r.collection_date,
          collection_utr: r.collection_utr,
          collection_amount: Number(r.collection_amount),
        })),
      };

      const res = await api.post(
        "loan-booking/v1/supplychain/repayment-upload",
        payload
      );

      setMessage(
        `✅ ${res.data.message} | Records: ${res.data.total_records}`
      );

      setRows([
        {
          lan: "",
          collection_date: "",
          collection_utr: "",
          collection_amount: "",
        },
      ]);
    } catch (err) {
      setMessage(
        err.response?.data?.message ||
          "❌ Upload failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="manual-entry-container">
      <h2>Supply Chain Collection Upload</h2>

      <fieldset>
        <legend>Collection Entries</legend>

        {rows.map((row, index) => (
          <div key={index} className="row-container">
            <input
              type="text"
              name="lan"
              placeholder="LAN"
              value={row.lan}
              onChange={(e) => handleChange(index, e)}
            />

            <input
              type="date"
              name="collection_date"
              value={row.collection_date}
              onChange={(e) => handleChange(index, e)}
            />

            <input
              type="text"
              name="collection_utr"
              placeholder="Collection UTR"
              value={row.collection_utr}
              onChange={(e) => handleChange(index, e)}
            />

            <input
              type="number"
              name="collection_amount"
              placeholder="Amount"
              value={row.collection_amount}
              onChange={(e) => handleChange(index, e)}
            />

            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(index)}
              >
                ❌
              </button>
            )}
          </div>
        ))}

        <button type="button" onClick={addRow}>
          ➕ Add Row
        </button>
      </fieldset>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? "Uploading..." : "Submit Collections"}
      </button>

      {message && <div className="message">{message}</div>}

      <style>{`
        .manual-entry-container {
          max-width: 900px;
          margin: 2rem auto;
          background: #fafafa;
          padding: 2rem;
          border-radius: 10px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }

        .row-container {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr auto;
          gap: 10px;
          margin-bottom: 10px;
        }

        input {
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }

        button {
          background-color: #007bff;
          color: white;
          border: none;
          padding: 8px 12px;
          cursor: pointer;
          border-radius: 6px;
        }

        .message {
          margin-top: 1rem;
          padding: 0.8rem;
          border-radius: 6px;
          background: #f0f0f0;
          font-weight: 600;
          text-align: center;
        }
      `}</style>
    </div>
  );
};

export default SupplyChainCollectionEntry;