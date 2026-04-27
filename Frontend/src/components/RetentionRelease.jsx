import React, { useState } from "react";
import api from "../api/api";
import "../styles/PartnerLimitEntry.css";

const RetentionRelease = () => {
  const [form, setForm] = useState({
    lan: "",
    utr: "",
    payment_date: "",
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.lan || !form.utr || !form.payment_date) {
      alert("LAN, UTR and Payment Date are required");
      return;
    }

    try {
      setLoading(true);

      const res = await api.post(
        "repayments/update-retention-release",
        {
          lan: form.lan.trim(),
          utr: form.utr.trim(),
          payment_date: form.payment_date,
          retention_release: true, // always YES ✅
        }
      );

      alert(res.data.message || "Retention released successfully");

      setForm({
        lan: "",
        utr: "",
        payment_date: "",
      });

    } catch (err) {
      console.error(err);

      alert(
        err.response?.data?.message ||
        "Retention release failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="partner-page">
      <div className="partner-container">

        <div className="page-header">
          <div className="page-header-left">
            <div className="page-badge">Retention Management</div>
            <h1>Retention Release – GQ FSF / NonFSF</h1>
            <p>
              Enter LAN, UTR and payment date to release retention amount.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card form-card">

          <div className="card-title">Retention Release Entry</div>

          <div className="form-grid">

            {/* LAN */}
            <div className="field">
              <label>LAN Number</label>
              <input
                type="text"
                placeholder="Enter LAN (GQF / GQN)"
                value={form.lan}
                onChange={(e) =>
                  setForm({ ...form, lan: e.target.value })
                }
                required
              />
            </div>

            {/* UTR */}
            <div className="field">
              <label>UTR Number</label>
              <input
                type="text"
                placeholder="Enter UTR"
                value={form.utr}
                onChange={(e) =>
                  setForm({ ...form, utr: e.target.value })
                }
                required
              />
            </div>

            {/* Payment Date */}
            <div className="field">
              <label>Payment Date</label>
              <input
                type="date"
                value={form.payment_date}
                onChange={(e) =>
                  setForm({
                    ...form,
                    payment_date: e.target.value,
                  })
                }
                required
              />
            </div>

          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-success"
              disabled={loading}
            >
              {loading
                ? "Processing..."
                : "Release Retention"}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

export default RetentionRelease;