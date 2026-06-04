import React, { useEffect, useState } from "react";
import { Check, Eye, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";

const CarePayHospitalLoginActions = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [message, setMessage] = useState("");
  const [actionLan, setActionLan] = useState("");
  const navigate = useNavigate();

  const fetchPendingHospitals = async () => {
    try {
      setLoading(true);
      setErr("");
      const res = await api.get("/loan-booking/carepay-hospitals-login-loans");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      setErr("Failed to fetch pending CarePay hospitals.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingHospitals();
  }, []);

  const approveHospital = async (lan) => {
    try {
      setActionLan(lan);
      setMessage("");

      await api.patch(`/loan-booking/carepay-hospitals/status/${lan}`, {
        status: "APPROVED",
      });

      setRows((prev) => prev.filter((row) => row.lan !== lan));
      setMessage(`Hospital ${lan} approved successfully.`);
    } catch (error) {
      setMessage(error?.response?.data?.message || "Failed to approve hospital.");
    } finally {
      setActionLan("");
    }
  };

  const statusPill = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 92,
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px solid #fde68a",
    background: "#fef9c3",
    color: "#713f12",
    fontSize: 12,
    fontWeight: 800,
  };

  const columns = [
    {
      key: "hospital_legal_name",
      header: "Hospital",
      sortable: true,
      render: (row) => (
        <button
          type="button"
          className="carepay-pending-hospital-link"
          onClick={() => navigate(`/carepay-loans/hospital-details/${row.lan}`)}
        >
          <strong>{row.hospital_legal_name || "-"}</strong>
          <span>{row.brand_name || "CarePay Provider"}</span>
        </button>
      ),
      sortAccessor: (row) => (row.hospital_legal_name || "").toLowerCase(),
      csvAccessor: (row) => row.hospital_legal_name || "",
      width: 260,
    },
    {
      key: "partner_loan_id",
      header: "Partner ID",
      sortable: true,
      render: (row) => row.partner_loan_id || row.application_id || "-",
      csvAccessor: (row) => row.partner_loan_id || row.application_id || "",
      width: 160,
    },
    {
      key: "location",
      header: "Location",
      render: (row) => (
        <div className="carepay-pending-stack">
          <strong>{row.registered_city || "-"}</strong>
          <span>{[row.registered_district, row.registered_state].filter(Boolean).join(", ") || "-"}</span>
        </div>
      ),
      csvAccessor: (row) =>
        [row.registered_city, row.registered_district, row.registered_state]
          .filter(Boolean)
          .join(", "),
      width: 220,
    },
    {
      key: "contact_person_name",
      header: "Contact",
      sortable: true,
      render: (row) => (
        <div className="carepay-pending-stack">
          <strong>{row.contact_person_name || "-"}</strong>
          <span>{row.hospital_phone || "-"}</span>
        </div>
      ),
      sortAccessor: (row) => (row.contact_person_name || "").toLowerCase(),
      width: 180,
    },
    {
      key: "bank_name",
      header: "Bank",
      sortable: true,
      render: (row) => (
        <div className="carepay-pending-stack">
          <strong>{row.bank_name || "-"}</strong>
          <span>{row.ifsc_code || "-"}</span>
        </div>
      ),
      sortAccessor: (row) => (row.bank_name || "").toLowerCase(),
      width: 190,
    },
    {
      key: "status",
      header: "Credit Status",
      render: () => <span style={statusPill}>PENDING</span>,
      csvAccessor: () => "PENDING",
      width: 140,
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      render: (row) => (row.created_at ? new Date(row.created_at).toLocaleDateString("en-IN") : "-"),
      sortAccessor: (row) => (row.created_at ? Date.parse(row.created_at) : 0),
      width: 130,
    },
    {
      key: "docs",
      header: "Documents",
      render: (row) => (
        <button
          type="button"
          className="carepay-secondary-btn"
          onClick={() => navigate(`/documents/${row.lan}`)}
          title="Open documents"
        >
          <FileText size={15} />
          Docs
        </button>
      ),
      csvAccessor: () => "",
      width: 130,
    },
    {
      key: "view",
      header: "Details",
      render: (row) => (
        <button
          type="button"
          className="carepay-secondary-btn"
          onClick={() => navigate(`/carepay-loans/hospital-details/${row.lan}`)}
        >
          <Eye size={15} />
          View
        </button>
      ),
      csvAccessor: () => "",
      width: 120,
    },
    {
      key: "actions",
      header: "Approval",
      render: (row) => (
        <button
          type="button"
          className="carepay-approve-btn"
          disabled={actionLan === row.lan}
          onClick={() => approveHospital(row.lan)}
        >
          <Check size={16} />
          {actionLan === row.lan ? "Approving" : "Approve"}
        </button>
      ),
      csvAccessor: () => "",
      width: 150,
    },
  ];

  if (err) {
    return (
      <div className="carepay-pending-page">
        <div className="carepay-pending-error">
          <h2>Pending hospitals could not be loaded</h2>
          <p>{err}</p>
          <button type="button" onClick={fetchPendingHospitals}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="carepay-pending-page">
      <header className="carepay-pending-header">
        <div>
          <p>CarePay Credit Approval</p>
          <h1>Pending hospital approvals</h1>
        </div>
        <div className="carepay-pending-count">
          <strong>{rows.length}</strong>
          <span>Pending</span>
        </div>
      </header>

      {message ? (
        <div
          className={`carepay-pending-message ${
            message.toLowerCase().includes("failed") ? "error" : "success"
          }`}
        >
          {message}
        </div>
      ) : null}

      {loading ? (
        <p className="carepay-pending-loading">Loading pending hospitals...</p>
      ) : (
        <DataTable
          title="CarePay Hospital Credit Approval"
          rows={rows}
          columns={columns}
          globalSearchKeys={[
            "hospital_legal_name",
            "brand_name",
            "partner_loan_id",
            "application_id",
            "registered_city",
            "registered_district",
            "registered_state",
            "contact_person_name",
            "bank_name",
          ]}
          exportFileName="carepay_pending_hospital_approvals"
        />
      )}

      <style>{`
        .carepay-pending-page {
          min-height: 100vh;
          padding: 36px;
          background: #f6f9fc;
          color: #10233f;
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .carepay-pending-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 18px;
          margin-bottom: 20px;
        }

        .carepay-pending-header p {
          margin: 0 0 6px;
          color: #0f766e;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .carepay-pending-header h1 {
          margin: 0;
          color: #0f2b5b;
          font-size: 30px;
          font-weight: 800;
        }

        .carepay-pending-count {
          min-width: 112px;
          border: 1px solid #fde68a;
          border-radius: 8px;
          background: #fffbeb;
          padding: 12px 14px;
          text-align: right;
        }

        .carepay-pending-count strong {
          display: block;
          color: #713f12;
          font-size: 23px;
          line-height: 1;
        }

        .carepay-pending-count span {
          color: #92400e;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .carepay-pending-hospital-link {
          display: flex;
          flex-direction: column;
          gap: 3px;
          border: 0;
          background: transparent;
          padding: 0;
          text-align: left;
          cursor: pointer;
        }

        .carepay-pending-hospital-link strong {
          color: #0f766e;
          font-size: 14px;
        }

        .carepay-pending-hospital-link span,
        .carepay-pending-stack span {
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
        }

        .carepay-pending-stack {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .carepay-pending-stack strong {
          color: #10233f;
          font-size: 14px;
        }

        .carepay-secondary-btn,
        .carepay-approve-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 36px;
          border-radius: 7px;
          padding: 0 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .carepay-secondary-btn {
          border: 1px solid #cfe0f1;
          background: #ffffff;
          color: #0f2b5b;
        }

        .carepay-approve-btn {
          border: 1px solid #86efac;
          background: #dcfce7;
          color: #166534;
        }

        .carepay-approve-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .carepay-pending-message {
          margin-bottom: 14px;
          border-radius: 7px;
          padding: 12px 14px;
          font-size: 14px;
          font-weight: 700;
        }

        .carepay-pending-message.success {
          background: #ecfdf5;
          border: 1px solid #bbf7d0;
          color: #166534;
        }

        .carepay-pending-message.error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
        }

        .carepay-pending-loading {
          margin: 0;
          color: #475569;
          font-weight: 700;
        }

        .carepay-pending-error {
          max-width: 520px;
          margin: 120px auto;
          background: #ffffff;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 28px;
          text-align: center;
        }

        .carepay-pending-error h2 {
          margin: 0 0 10px;
          color: #991b1b;
        }

        .carepay-pending-error button {
          height: 40px;
          border: 0;
          border-radius: 7px;
          padding: 0 18px;
          background: #0f766e;
          color: white;
          font-weight: 800;
          cursor: pointer;
        }

        @media (max-width: 900px) {
          .carepay-pending-page {
            padding: 20px;
          }

          .carepay-pending-header {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default CarePayHospitalLoginActions;
