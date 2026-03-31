import React, { useState, useEffect } from 'react';
import axios from 'axios';
import api from "../api/api";
import '../styles/PartnerLimitEntry.css';


const PartnerLimitEntry = () => {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    partner_name: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    assigned_limit: ''
  });
  const [monthFilter, setMonthFilter] = useState(new Date().getMonth() + 1);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const res = await api.get(`partners/partners`, {
        params: { month: monthFilter, year: yearFilter }
      });
      setPartners(res.data.partners || []);
    } catch (err) {
      console.error('Fetch partners error:', err);
      alert('Error fetching partners');
    } finally {
      setLoading(false);
    }
  };

  const toggleFldgStatus = async (partner_id, currentStatus, fldg_percent) => {
  try {

    await api.put(`partners/${partner_id}/fldg`, {
      fldg_percent: Number(fldg_percent || 0),
      fldg_status: currentStatus === 1 ? 0 : 1
    });

    fetchPartners();

  } catch (err) {

    console.error("FLDG toggle error:", err);
    alert("Failed to update FLDG status");

  }
};

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (form.partner_name) {
        await api.post(`partners/partners`, {
          partner_name: form.partner_name,
          status: 'active'
        });
      }

      await api.post(`partners/partners/${form.partner_name || 'default'}/limits`, {
        month: form.month,
        year: form.year,
        assigned_limit: parseFloat(form.assigned_limit)
      });

      alert('Partner/Limit saved!');
      setForm({
        partner_name: '',
        month: form.month,
        year: form.year,
        assigned_limit: ''
      });
      fetchPartners();
    } catch (err) {
      console.error('Save error:', err.response?.data || err);
      alert('Error: ' + (err.response?.data?.error || 'Unknown'));
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [monthFilter, yearFilter]);

  const formatCurrency = (value) => {
    const num = Number(value || 0);
    return `₹${num.toLocaleString('en-IN')}`;
  };

  return (
    <div className="partner-page">
      <div className="partner-container">
        <div className="page-header">
          <h1>Partner Monthly Limits</h1>
          <p>Manage monthly assigned, used, and remaining limits partner-wise.</p>
        </div>

        <div className="card filter-card">
          <div className="card-title">Filters</div>
          <div className="filter-grid">
            <div className="field">
              <label>Month</label>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(parseInt(e.target.value))}
              >
                {/* {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <option key={m} value={m}>
                    Month {m}
                  </option>
                ))} */}
                {[
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
].map((name, index) => (
  <option key={index + 1} value={index + 1}>
    {name}
  </option>
))}
              </select>
            </div>

            <div className="field">
              <label>Year</label>
              <input
                type="number"
                value={yearFilter}
                // onChange={(e) => setYearFilter(parseInt(e.target.value))}
                placeholder="Year"
                readOnly
              />
            </div>

            <div className="field button-field">
              <label>&nbsp;</label>
              <button
                onClick={fetchPartners}
                disabled={loading}
                className="btn btn-primary"
                type="button"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card form-card">
          <div className="card-title">Add Partner / Set Limit</div>

          <div className="form-grid">
            <div className="field">
              <label>Partner Name</label>
              <input
                type="text"
                placeholder="Enter partner name"
                value={form.partner_name}
                onChange={(e) => setForm({ ...form, partner_name: e.target.value })}
                required
              />
            </div>

            <div className="field">
              <label>Month</label>
              {/* <input
                type="number"
                placeholder="Month (1-12)"
                value={form.month}
                onChange={(e) => setForm({ ...form, month: parseInt(e.target.value) })}
                min="1"
                max="12"
                required
              /> */}
              <select
  value={form.month}
  onChange={(e) =>
    setForm({ ...form, month: parseInt(e.target.value) })
  }
  required
>
  {[
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ].map((name, index) => (
    <option key={index + 1} value={index + 1}>
      {name}
    </option>
  ))}
</select>
            </div>

            <div className="field">
              <label>Year</label>
              <input
                type="number"
                placeholder="Year"
                value={form.year}
                // onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })}
                readOnly
              />
            </div>

            <div className="field">
              <label>Assigned Limit</label>
              <input
                type="number"
                placeholder="Assigned Limit (₹)"
                value={form.assigned_limit}
                onChange={(e) => setForm({ ...form, assigned_limit: e.target.value })}
                step="0.01"
                required
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-success">
              Save Partner & Limit
            </button>
          </div>
        </form>

        <div className="card table-card">
          <div className="table-wrap">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Status</th>
                  <th>FLDG %</th>
                  <th>FLDG</th>
                  <th className="text-right">Assigned</th>
                  <th className="text-right">Used</th>
                  <th className="text-right">Remaining</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p, i) => (
                  <tr key={p.partner_id || i}>
                    <td className="partner-name">{p.partner_name}</td>
                    <td>
                      <span
                        className={
                          p.status === 'active'
                            ? 'status-badge status-active'
                            : 'status-badge status-inactive'
                        }
                      >
                        {p.status}
                      </span>
                    </td>
                    <td>{Number(p.fldg_percent || 0)}%</td>
                    <td>
  <label className="switch">
    <input
      type="checkbox"
      checked={p.fldg_status === 1}
      onChange={() =>
        toggleFldgStatus(p.partner_id, p.fldg_status)
      }
    />
    <span className="slider round"></span>
  </label>
</td>
                    <td className="text-right">{formatCurrency(p.assigned_limit)}</td>
                    <td className="text-right used-value">{formatCurrency(p.used_limit)}</td>
                    <td
                      className={`text-right remaining-value ${
                        Number(p.remaining_limit) > 0 ? 'remaining-positive' : 'remaining-negative'
                      }`}
                    >
                      {formatCurrency(p.remaining_limit)}
                    </td>
                    <td>
                      <div className="action-group">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => {
                            setForm({
                              partner_name: p.partner_name,
                              month: monthFilter,
                              year: yearFilter,
                              assigned_limit: p.assigned_limit || ''
                            });
                          }}
                        >
                          Edit
                        </button>

                        {/* <a
                          href={`${API_BASE}/partners/${p.partner_name}/limits`}
                          target="_blank"
                          rel="noreferrer"
                          className="link-btn secondary-link"
                        >
                          Audits
                        </a> */}
                        <button
                        type="button"
                        className="link-btn secondary-link">
                            Audits (In Working)
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {partners.length === 0 && !loading && (
            <div className="empty-state">No partners found. Create one above.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartnerLimitEntry;