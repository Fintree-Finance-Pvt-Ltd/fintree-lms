import React, { useState, useEffect } from "react";
import api from "../api/api";
import "../styles/PartnerLimitEntry.css";

const FldgEntryPage = () => {

  const [partners, setPartners] = useState([]);
  const [selectedPartner, setSelectedPartner] = useState("");
  const [receipts, setReceipts] = useState([]);
  const [availableBalance, setAvailableBalance] = useState(0);

  const [form, setForm] = useState({
    utr_no: "",
    fldg_amount: "",
    payment_date: "",
    remarks: ""
  });


  // Fetch partners list
  const fetchPartners = async () => {
    try {
      const res = await api.get("partners/partners");
      setPartners(res.data.partners || []);
    } catch (err) {
      console.error("Partner fetch error:", err);
    }
  };


  // Fetch receipts for selected partner
  const fetchReceipts = async (partnerId) => {
    if (!partnerId) return;

    try {

      const receiptsRes = await api.get(`fldg/receipts/${partnerId}`);
      setReceipts(receiptsRes.data);

      const summaryRes = await api.get(`fldg/summary/${partnerId}`);
      setAvailableBalance(summaryRes.data.available_fldg);

    } catch (err) {
      console.error("Receipt fetch error:", err);
    }
  };


  // Submit FLDG entry
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {

      await api.post("fldg/receipts", {
        partner_id: selectedPartner,
        utr_no: form.utr_no,
        fldg_amount: parseFloat(form.fldg_amount),
        payment_date: form.payment_date,
        remarks: form.remarks
      });

      alert("FLDG entry saved successfully ✅");

      setForm({
        utr_no: "",
        fldg_amount: "",
        payment_date: "",
        remarks: ""
      });

      fetchReceipts(selectedPartner);

    } catch (err) {

      console.error("Save error:", err);

      alert(
        err.response?.data?.error ||
        "Error saving FLDG entry"
      );

    }
  };


  useEffect(() => {
    fetchPartners();
  }, []);


  useEffect(() => {
    if (selectedPartner) {
      fetchReceipts(selectedPartner);
    }
  }, [selectedPartner]);


  const formatCurrency = (value) => {
    return `₹${Number(value || 0).toLocaleString("en-IN")}`;
  };


  return (
    <div className="partner-page">

      <div className="partner-container">

        <div className="page-header">
          <h1>Partner FLDG Entry</h1>
          <p>Add new FLDG receipts partner-wise and track balances.</p>
        </div>


        {/* Entry Form */}

        <form className="card form-card" onSubmit={handleSubmit}>

          <div className="card-title">Add FLDG Entry</div>

          <div className="form-grid">

            <div className="field">
              <label>Partner</label>
              <select
                value={selectedPartner}
                onChange={(e) => setSelectedPartner(e.target.value)}
                required
              >
                <option value="">Select Partner</option>

                {partners.map((p) => (
                  <option key={p.partner_id} value={p.partner_id}>
                    {p.partner_name}
                  </option>
                ))}

              </select>
            </div>


            <div className="field">
              <label>UTR Number</label>
              <input
                type="text"
                value={form.utr_no}
                onChange={(e) =>
                  setForm({ ...form, utr_no: e.target.value })
                }
                required
              />
            </div>


            <div className="field">
              <label>FLDG Amount</label>
              <input
                type="number"
                step="0.01"
                value={form.fldg_amount}
                onChange={(e) =>
                  setForm({ ...form, fldg_amount: e.target.value })
                }
                required
              />
            </div>


            <div className="field">
              <label>Payment Date</label>
              <input
                type="date"
                value={form.payment_date}
                onChange={(e) =>
                  setForm({ ...form, payment_date: e.target.value })
                }
                required
              />
            </div>


            <div className="field">
              <label>Remarks</label>
              <input
                type="text"
                value={form.remarks}
                onChange={(e) =>
                  setForm({ ...form, remarks: e.target.value })
                }
              />
            </div>

          </div>


          <div className="form-actions">
            <button className="btn btn-success">
              Save FLDG Entry
            </button>
          </div>

        </form>


        {/* Balance Section */}

        {selectedPartner && (
          <div className="card">

            <div className="card-title">
              Available FLDG Balance
            </div>

            <h2 style={{ color: "#2e7d32" }}>
              {formatCurrency(availableBalance)}
            </h2>

          </div>
        )}


        {/* Receipts Table */}

        {selectedPartner && (

          <div className="card table-card">

            <div className="card-title">
              Previous FLDG Receipts
            </div>

            <table className="partner-table">

              <thead>
                <tr>
                  <th>UTR</th>
                  <th>Amount</th>
                  <th>Payment Date</th>
                  <th>Remarks</th>
                  <th>Created At</th>
                </tr>
              </thead>

              <tbody>

                {receipts.map((r) => (

                  <tr key={r.id}>

                    <td>{r.utr_no}</td>

                    <td className="text-right">
                      {formatCurrency(r.fldg_amount)}
                    </td>

                    <td>{r.payment_date?.slice(0, 10)}</td>

                    <td>{r.remarks || "-"}</td>

                    <td>{r.created_at?.slice(0, 19)}</td>

                  </tr>

                ))}

              </tbody>

            </table>


            {receipts.length === 0 && (
              <div className="empty-state">
                No FLDG receipts found
              </div>
            )}

          </div>

        )}

      </div>

    </div>
  );
};

export default FldgEntryPage;