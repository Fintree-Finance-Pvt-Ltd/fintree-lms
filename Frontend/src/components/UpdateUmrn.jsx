import React, { useState } from "react";
import api from "../api/api";
import "../styles/PartnerLimitEntry.css";

const UpdateUmrn = () => {
  const [form, setForm] = useState({
    lan: "",
    umrn: "",
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.lan || !form.umrn) {
      alert("LAN and UMRN required");
      return;
    }

    try {
      setLoading(true);

      const res = await api.post("loan-booking/update-umrn", {
        lan: form.lan.trim(),
        umrn: form.umrn.trim(),
        table: "loan_booking_helium",
      });

      alert(res.data.message || "UMRN updated successfully");

      setForm({
        lan: "",
        umrn: "",
      });

    } catch (err) {
      console.error(err);
      alert(
        err.response?.data?.message || "Update failed"
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
            <div className="page-badge">Mandate Management</div>
            <h1>Update UMRN For Helium</h1>
            <p>
              Enter LAN and UMRN to update mandate details for the borrower.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card form-card">

          <div className="card-title">Update eNACH UMRN</div>

          <div className="form-grid">

            <div className="field">
              <label>LAN Number</label>
              <input
                type="text"
                placeholder="Enter LAN"
                value={form.lan}
                onChange={(e) =>
                  setForm({ ...form, lan: e.target.value })
                }
                required
              />
            </div>

            <div className="field">
              <label>UMRN Number</label>
              <input
                type="text"
                placeholder="Enter UMRN"
                value={form.umrn}
                onChange={(e) =>
                  setForm({ ...form, umrn: e.target.value })
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
              {loading ? "Updating..." : "Update UMRN"}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

export default UpdateUmrn;