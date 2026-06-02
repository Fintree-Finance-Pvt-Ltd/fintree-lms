import React, { useState, useEffect } from "react";
import api from "../api/api";
import "../styles/PartnerLimitEntry.css";

const PartnerLimitEntry = () => {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPartner, setAuditPartner] = useState(null);
  const [auditRows, setAuditRows] = useState([]);
  const [form, setForm] = useState({
    partner_name: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    assigned_limit: "",
  });
  const [monthFilter, setMonthFilter] = useState(new Date().getMonth() + 1);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const formatDateTime = (value) => {
  if (!value) return "-";

  const date = new Date(value);

  if (isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

  const numberToIndianWords = (amount) => {
    const num = Math.floor(Number(amount || 0));

    if (!num) return "";

    const ones = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];

    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];

    const convertTwoDigits = (n) => {
      if (n < 20) return ones[n];
      return `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim();
    };

    const convertThreeDigits = (n) => {
      const hundred = Math.floor(n / 100);
      const rest = n % 100;

      let words = "";

      if (hundred) {
        words += `${ones[hundred]} Hundred`;
      }

      if (rest) {
        words += words ? ` ${convertTwoDigits(rest)}` : convertTwoDigits(rest);
      }

      return words;
    };

    let remaining = num;
    const crore = Math.floor(remaining / 10000000);
    remaining %= 10000000;

    const lakh = Math.floor(remaining / 100000);
    remaining %= 100000;

    const thousand = Math.floor(remaining / 1000);
    remaining %= 1000;

    const parts = [];

    if (crore) parts.push(`${convertThreeDigits(crore)} Crore`);
    if (lakh) parts.push(`${convertThreeDigits(lakh)} Lakh`);
    if (thousand) parts.push(`${convertThreeDigits(thousand)} Thousand`);
    if (remaining) parts.push(convertThreeDigits(remaining));

    return `${parts.join(" ")} Rupees Only`;
  };

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const res = await api.get(`partners/partners`, {
        params: { month: monthFilter, year: yearFilter },
      });
      setPartners(res.data.partners || []);
    } catch (err) {
      console.error("Fetch partners error:", err);
      alert("Error fetching partners");
    } finally {
      setLoading(false);
    }
  };

  const fetchAudits = async (partner) => {
    setAuditPartner(partner);
    setAuditOpen(true);
    setAuditLoading(true);
    setAuditRows([]);

    try {
      const res = await api.get(
        `partners/partners/${partner.partner_id}/audits`,
        {
          params: {
            month: monthFilter,
            year: yearFilter,
          },
        },
      );

      setAuditRows(res.data.audits || []);
    } catch (err) {
      console.error("Fetch audit error:", err);
      alert("Failed to fetch audits");
    } finally {
      setAuditLoading(false);
    }
  };

  const closeAudit = () => {
    setAuditOpen(false);
    setAuditPartner(null);
    setAuditRows([]);
  };

  const toggleFldgStatus = async (partner_id, currentStatus, fldg_percent) => {
    try {
      await api.put(`partners/${partner_id}/fldg`, {
        fldg_percent: Number(fldg_percent || 0),
        fldg_status: currentStatus === 1 ? 0 : 1,
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
          status: "active",
        });
      }

      await api.post(
        `partners/partners/${form.partner_name || "default"}/limits`,
        {
          month: form.month,
          year: form.year,
          assigned_limit: parseFloat(form.assigned_limit),
        },
      );

      alert("Partner/Limit saved!");
      setForm({
        partner_name: "",
        month: form.month,
        year: form.year,
        assigned_limit: "",
      });
      fetchPartners();
    } catch (err) {
      console.error("Save error:", err.response?.data || err);
      alert("Error: " + (err.response?.data?.error || "Unknown"));
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [monthFilter, yearFilter]);

  const formatCurrency = (value) => {
    const num = Number(value || 0);
    return `₹${num.toLocaleString("en-IN")}`;
  };

  const filteredPartners = partners.filter((p) => {
    const search = searchTerm.toLowerCase();

    return (
      p.partner_name?.toLowerCase().includes(search) ||
      p.status?.toLowerCase().includes(search)
    );
  });

  const totals = partners.reduce(
    (acc, p) => {
      acc.assigned += Number(p.assigned_limit || 0);
      acc.booked += Number(p.booked_limit || 0);
      acc.used += Number(p.used_limit || 0);
      acc.remaining += Number(p.remaining_limit || 0);
      acc.bookingRemaining += Number(p.booking_remaining_limit || 0);
      acc.pendingPipeline += Number(p.pending_pipeline || 0);
      acc.pos += Number(p.pos || 0);
      return acc;
    },
    {
      assigned: 0,
      booked: 0,
      used: 0,
      remaining: 0,
      bookingRemaining: 0,
      pendingPipeline: 0,
      pos: 0,
    },
  );

  return (
    <div className="partner-page">
      <div className="partner-container">
        <div className="page-header">
          <div className="page-header-left">
            <div className="page-badge">Monthly Partner Controls</div>
            <h1>Partner Monthly Limits</h1>
            <p>
              Manage assigned, used, and remaining limits for each partner with
              a cleaner monthly control panel.
            </p>
          </div>

          {/* <div className="page-header-right">
        <div className="header-stat-card">
          <span className="header-stat-label">Selected Month</span>
          <strong>
            {[
              "January","February","March","April","May","June",
              "July","August","September","October","November","December"
            ][monthFilter - 1]} {yearFilter}
          </strong>
        </div>
      </div> */}
        </div>

        <div className="top-layout">
          <div className="card filter-card">
            <div className="card-title">Filter Limits</div>

            <div className="filter-grid">
              <div className="field">
                <label>Month</label>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(parseInt(e.target.value))}
                >
                  {[
                    "January",
                    "February",
                    "March",
                    "April",
                    "May",
                    "June",
                    "July",
                    "August",
                    "September",
                    "October",
                    "November",
                    "December",
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
                  placeholder="Year"
                  readOnly
                />
              </div>

              <div className="field button-field">
                <label>&nbsp;</label>
                <button
                  onClick={fetchPartners}
                  disabled={loading}
                  className="btn btn-primary refresh-btn"
                  type="button"
                >
                  {loading ? "Loading..." : "Refresh Data"}
                </button>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="card form-card">
            <div className="card-title">Add Partner Limit</div>

            <div className="form-grid">
              <div className="field">
                <label>Partner Name</label>
                <input
                  type="text"
                  placeholder="Enter partner name"
                  value={form.partner_name}
                  onChange={(e) =>
                    setForm({ ...form, partner_name: e.target.value })
                  }
                  required
                />
              </div>

              <div className="field">
                <label>Month</label>
                <select
                  value={form.month}
                  onChange={(e) =>
                    setForm({ ...form, month: parseInt(e.target.value) })
                  }
                  required
                >
                  {[
                    "January",
                    "February",
                    "March",
                    "April",
                    "May",
                    "June",
                    "July",
                    "August",
                    "September",
                    "October",
                    "November",
                    "December",
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
                  readOnly
                />
              </div>

              <div className="field">
                <label>Assigned Limit</label>
                <input
                  type="number"
                  placeholder="Assigned Limit (₹)"
                  value={form.assigned_limit}
                  onChange={(e) =>
                    setForm({ ...form, assigned_limit: e.target.value })
                  }
                  step="0.01"
                  required
                />

                {form.assigned_limit && Number(form.assigned_limit) > 0 && (
                  <div className="amount-words">
                    {numberToIndianWords(form.assigned_limit)}
                  </div>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-success">
                Save Partner & Limit
              </button>
            </div>
          </form>
        </div>

        <div className="card table-card">
          <div className="summary-grid">
            <div className="summary-card">
              <span>Total Assigned</span>
              <strong>{formatCurrency(totals.assigned)}</strong>
            </div>

            <div className="summary-card">
              <span>Total Booked/Login</span>
              <strong className="booked-value">
                {formatCurrency(totals.booked)}
              </strong>
            </div>

            <div className="summary-card">
              <span>Total Disbursed/Used</span>
              <strong className="used-value">
                {formatCurrency(totals.used)}
              </strong>
            </div>

            <div className="summary-card">
              <span>Booking Available</span>
              <strong
                className={
                  totals.bookingRemaining > 0
                    ? "remaining-positive"
                    : "remaining-negative"
                }
              >
                {formatCurrency(totals.bookingRemaining)}
              </strong>
            </div>

            <div className="summary-card">
              <span>Disbursement Remaining</span>
              <strong
                className={
                  totals.remaining > 0
                    ? "remaining-positive"
                    : "remaining-negative"
                }
              >
                {formatCurrency(totals.remaining)}
              </strong>
            </div>

            <div className="summary-card">
              <span>Total POS</span>
              <strong className="pos-value">
                {formatCurrency(totals.pos)}
              </strong>
            </div>
          </div>
          <div className="table-header">
            <div>
              <div className="card-title">Partner Limit Overview</div>
              <p className="table-subtitle">
                Review partner status, FLDG control, assigned usage, and
                available balance.
              </p>
            </div>

            <div className="table-search">
              <input
                type="text"
                placeholder="Search partner or status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="table-wrap">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>FLDG %</th>
                  <th>FLDG</th>
                  <th className="text-right">Assigned</th>
                  <th className="text-right">Login</th>
                  <th className="text-right">Disbursed</th>
                  <th className="text-right">Login Avl.</th>
                  <th className="text-right">Disb. Rem</th>
                  <th className="text-right">POS</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPartners.map((p, i) => (
                  <tr key={p.partner_id || i}>
                    <td className="partner-name">{p.partner_name}</td>

                    <td>{Number(p.fldg_percent || 0)}%</td>

                    <td>
                      <label className="switch">
                        <input
                          className="switch-input"
                          type="checkbox"
                          checked={p.fldg_status === 1}
                          onChange={() =>
                            toggleFldgStatus(
                              p.partner_id,
                              p.fldg_status,
                              p.fldg_percent,
                            )
                          }
                        />
                        <span className="slider round"></span>
                      </label>
                    </td>

                    <td className="text-right">
                      {formatCurrency(p.assigned_limit)}
                    </td>

                    <td className="text-right booked-value">
                      {formatCurrency(p.booked_limit)}
                    </td>

                    <td className="text-right used-value">
                      {formatCurrency(p.used_limit)}
                    </td>

                    <td
                      className={`text-right ${
                        Number(p.booking_remaining_limit) > 0
                          ? "remaining-positive"
                          : "remaining-negative"
                      }`}
                    >
                      {formatCurrency(p.booking_remaining_limit)}
                    </td>

                    <td
                      className={`text-right ${
                        Number(p.remaining_limit) > 0
                          ? "remaining-positive"
                          : "remaining-negative"
                      }`}
                    >
                      {formatCurrency(p.remaining_limit)}
                    </td>

                    <td className="text-right pos-value">
                      {formatCurrency(p.pos)}
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
                              assigned_limit: p.assigned_limit || "",
                            });
                          }}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="link-btn secondary-link"
                          onClick={() => fetchAudits(p)}
                        >
                          Audits
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredPartners.length === 0 && !loading && (
            <div className="empty-state">
              No partners found. Create one above.
            </div>
          )}
        </div>
      </div>

      {auditOpen && (
        <div className="audit-modal-overlay">
          <div className="audit-modal">
            <div className="audit-modal-header">
              <div>
                <h2>Limit Audit</h2>
                <p>
                  {auditPartner?.partner_name} — {monthNames[monthFilter - 1]}{" "}
                  {yearFilter}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeAudit}
              >
                ×
              </button>
            </div>

            <div className="audit-modal-body">
              {auditLoading ? (
                <div className="empty-state">Loading audits...</div>
              ) : auditRows.length === 0 ? (
                <div className="empty-state">No audit records found.</div>
              ) : (
                <div className="table-wrap">
                  <table className="partner-table audit-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>LAN</th>
                        <th>Action</th>
                        <th className="text-right">Amount</th>
                        <th>Month</th>
                        <th>Year</th>
                      </tr>
                    </thead>

                    <tbody>
                      {auditRows.map((a) => (
                        <tr key={a.id}>
                          <td>{formatDateTime(a.created_at)}</td>
                          <td>{a.booking_lan || "-"}</td>
                          <td>
                            <span
                              className={`audit-action audit-${String(
                                a.action_type || "",
                              ).toLowerCase()}`}
                            >
                              {a.action_type}
                            </span>
                          </td>
                          <td className="text-right">
                            {formatCurrency(a.loan_amount)}
                          </td>
                          <td>{a.month}</td>
                          <td>{a.year}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="audit-modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={closeAudit}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartnerLimitEntry;
