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
  const [excelMode, setExcelMode] = useState(false);
const [excelFile, setExcelFile] = useState(null);
const [uploadSummary, setUploadSummary] = useState(null);

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

  const handleExcelUpload = async () => {
  if (!excelFile) {
    setMessage("❌ Please select Excel file");
    return;
  }

  const formData = new FormData();
  formData.append("file", excelFile);

  try {
    setLoading(true);

    const res = await api.post(
      "loan-booking/v1/supplychain/repayment-excel",
      formData
    );

    setUploadSummary(res.data);

    setMessage(
      `Processed: ${res.data.total_rows} | Inserted: ${res.data.inserted_rows} | Failed: ${res.data.failed_rows}`
    );

  } catch (err) {
    setMessage(
      err.response?.data?.message || "❌ Excel upload failed"
    );
  } finally {
    setLoading(false);
  }
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

      <div style={{ marginBottom: "15px" }}>
  <button
    type="button"
    onClick={() => setExcelMode(!excelMode)}
  >
    {excelMode
      ? "Switch to Manual Entry"
      : "Upload Excel Instead"}
  </button>
</div>

{uploadSummary && (

  <fieldset>

    <legend>Upload Summary</legend>

    <div>
      <strong>Total Rows:</strong> {uploadSummary.total_rows}
    </div>

    <div>
      <strong>Inserted:</strong> {uploadSummary.inserted_rows}
    </div>

    <div>
      <strong>Failed:</strong> {uploadSummary.failed_rows}
    </div>

    {uploadSummary.duplicate_utrs?.length > 0 && (
      <div>
        <strong>Duplicate UTR:</strong>
        <ul>
          {uploadSummary.duplicate_utrs.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      </div>
    )}

    {uploadSummary.missing_lans?.length > 0 && (
      <div>
        <strong>Missing LAN:</strong>
        <ul>
          {uploadSummary.missing_lans.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    )}

  </fieldset>
)}

{excelMode && (
  <fieldset>
    <legend>Bulk Collection Upload</legend>

    <input
      type="file"
      accept=".xlsx,.xls"
      onChange={(e) =>
        setExcelFile(e.target.files[0])
      }
    />

    <button
      type="button"
      onClick={handleExcelUpload}
      disabled={loading}
      style={{ marginTop: "10px" }}
    >
      {loading ? "Uploading..." : "Upload Excel"}
    </button>
  </fieldset>
)}
{!excelMode && (
  <>
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
      </>
)}

      

      {message && <div className="message">{message}</div>}

      <style>{`

/* ============================================================
   🚀 FINTREE PREMIUM COLLECTION FORM UI
============================================================ */

.manual-entry-container {
  max-width: 950px;
  margin: 40px auto;
  padding: 30px;

  border-radius: 20px;
  background: rgba(255,255,255,0.85);

  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);

  border: 1px solid rgba(0,0,0,0.06);
  box-shadow: 0 20px 50px rgba(0,0,0,0.08);

  animation: fadeIn 0.5s ease;
}

.manual-entry-container h2 {
  font-size: 26px;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 20px;
}

/* ============================================================
   📦 SECTION CARDS
============================================================ */

fieldset {
  border: none;
  padding: 20px;
  margin-bottom: 20px;

  border-radius: 16px;
  background: rgba(255,255,255,0.9);

  box-shadow: 0 8px 25px rgba(0,0,0,0.05);
  transition: 0.3s ease;
}

fieldset:hover {
  transform: translateY(-2px);
  box-shadow: 0 15px 35px rgba(0,0,0,0.08);
}

legend {
  font-size: 14px;
  font-weight: 700;
  color: #332e95;
  padding: 0 10px;
}

/* ============================================================
   📊 ROW GRID
============================================================ */

.row-container {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

/* ============================================================
   🧾 INPUTS
============================================================ */

input {
  padding: 12px 14px;

  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.08);

  background: #f8fafc;
  font-size: 14px;

  transition: all 0.25s ease;
}

input:focus {
  outline: none;
  border-color: #312c94;
  background: #fff;

  box-shadow: 0 0 0 4px rgba(79,70,229,0.12);
  transform: translateY(-1px);
}

/* ============================================================
   🔘 BUTTONS
============================================================ */

button {
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: white;

  border: none;
  padding: 10px 18px;

  font-size: 14px;
  font-weight: 600;

  border-radius: 10px;
  cursor: pointer;

  transition: all 0.25s ease;
  margin-top: 10px;
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(79,70,229,0.3);
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ============================================================
   📢 MESSAGE ALERT
============================================================ */

.message {
  margin-top: 20px;
  padding: 14px;

  border-radius: 12px;
  font-weight: 600;
  text-align: center;

  background: rgba(59,130,246,0.1);
  color: #1d4ed8;
  border: 1px solid rgba(59,130,246,0.2);

  animation: slideUp 0.4s ease;
}

/* ============================================================
   🎬 ANIMATIONS
============================================================ */

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(15px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ============================================================
   📱 RESPONSIVE
============================================================ */

@media (max-width: 768px) {
  .manual-entry-container {
    margin: 20px;
    padding: 20px;
  }

  .row-container {
    grid-template-columns: 1fr;
  }
}

`}</style>
    </div>
  );
};

export default SupplyChainCollectionEntry;