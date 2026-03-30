import React, { useEffect, useState } from "react";
import api from "../api/api";
import "../styles/PartnerLimitEntry.css";

const PartnerFldgManager = () => {

  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    partner_id: "",
    partner_name: "",
    fldg_percent: "",
    fldg_status: 1,
    status: "active"
  });

  const fetchPartners = async () => {

    setLoading(true);

    try {

      const res = await api.get("/partners/partners-list");

      setPartners(res.data || []);

    } catch (err) {

      console.error(err);
      alert("Failed to fetch partners");

    } finally {

      setLoading(false);

    }

  };

  useEffect(() => {

    fetchPartners();

  }, []);


  const handleEdit = (partner) => {

    setForm({
      partner_id: partner.partner_id,
      partner_name: partner.partner_name,
      fldg_percent: partner.fldg_percent,
      fldg_status: partner.fldg_status,
      status: partner.status
    });

  };


  const handleSubmit = async (e) => {

    e.preventDefault();

    try {

      await api.put(
        `/partners/${form.partner_id}/fldg`,
        {
          fldg_percent: Number(form.fldg_percent),
          fldg_status: Number(form.fldg_status)
        }
      );

      await api.put(
        `/partners/${form.partner_id}/status`,
        {
          status: form.status
        }
      );

      alert("Partner updated successfully");

      setForm({
        partner_id: "",
        partner_name: "",
        fldg_percent: "",
        fldg_status: 1,
        status: "active"
      });

      fetchPartners();

    } catch (err) {

      console.error(err);
      alert("Update failed");

    }

  };


  return (

    <div className="partner-page">

      <div className="partner-container">

        <div className="page-header">

          <h1>Partner FLDG Settings</h1>

          <p>
            Manage FLDG percentage and enable/disable FLDG partner-wise.
          </p>

        </div>


        <form onSubmit={handleSubmit} className="card form-card">

          <div className="card-title">
            Update Partner FLDG Settings
          </div>


          <div className="form-grid">

            <div className="field">

              <label>Partner Name</label>

              <input
                type="text"
                value={form.partner_name}
                disabled
              />

            </div>


            <div className="field">

              <label>FLDG %</label>

              <input
                type="number"
                value={form.fldg_percent}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fldg_percent: e.target.value
                  })
                }
                required
              />

            </div>


            <div className="field">

              <label>FLDG Enabled</label>

              <select
                value={form.fldg_status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fldg_status: e.target.value
                  })
                }
              >
                <option value={1}>Enabled</option>
                <option value={0}>Disabled</option>
              </select>

            </div>


            <div className="field">

              <label>Partner Status</label>

              <select
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value
                  })
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

            </div>

          </div>


          <div className="form-actions">

            <button
              type="submit"
              className="btn btn-success"
              disabled={!form.partner_id}
            >
              Update Partner
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
                  <th>FLDG Enabled</th>
                  <th>Action</th>

                </tr>

              </thead>


              <tbody>

                {partners.map((p) => (

                  <tr key={p.partner_id}>

                    <td>{p.partner_name}</td>

                    <td>

                      <span
                        className={
                          p.status === "active"
                            ? "status-badge status-active"
                            : "status-badge status-inactive"
                        }
                      >
                        {p.status}
                      </span>

                    </td>

                    <td>{p.fldg_percent}%</td>

                    <td>
                      {p.fldg_status === 1
                        ? "Enabled"
                        : "Disabled"}
                    </td>

                    <td>

                      <button
                        className="link-btn"
                        onClick={() => handleEdit(p)}
                      >
                        Edit
                      </button>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>


          {partners.length === 0 && !loading && (

            <div className="empty-state">

              No partners found.

            </div>

          )}

        </div>

      </div>

    </div>

  );

};

export default PartnerFldgManager;