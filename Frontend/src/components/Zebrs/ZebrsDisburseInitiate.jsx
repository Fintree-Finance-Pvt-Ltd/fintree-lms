
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const ZebrsDisburseInitiate = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioningLan, setActioningLan] = useState("");

  // Rejection popup
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectRemark, setRejectRemark] = useState("");
  const [rejectError, setRejectError] = useState("");

  const fetchLoans = useCallback(async (signal) => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get(
        "/zebrs/credit-initiated-loans",
        {
          params: {
            page: 1,
            pageSize: 100,
            sortBy: "created_at",
            sortDir: "desc",
          },
          signal,
        }
      );

      setRows(
        Array.isArray(response.data?.rows)
          ? response.data.rows
          : []
      );
    } catch (err) {
      if (signal?.aborted || err.code === "ERR_CANCELED") {
        return;
      }

      console.error("Zebrs loans fetch error:", err);

      setError(
        err.response?.data?.message ||
          "Failed to fetch Zebrs credit initiated loans."
      );
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetchLoans(controller.signal);

    return () => controller.abort();
  }, [fetchLoans]);

  const openCustomerDetails = (row) => {
    if (!row?.lan) return;

    navigate(
      `/zebrs/update-data?lan=${encodeURIComponent(row.lan)}`
    );
  };

  const isRejected = (row) =>
    String(row?.status || "").toLowerCase() === "rejected" ||
    String(row?.stage || "").toLowerCase() === "credit rejected";

  // Approve loan without Approved Amount input
  const handleApprove = async (row) => {
    if (!row?.lan || actioningLan) return;

    const confirmed = window.confirm(
      `Approve Zebrs loan ${row.lan}?\n\nExisting Loan Amount: ₹${Number(
        row.loan_amount || 0
      ).toLocaleString("en-IN")}`
    );

    if (!confirmed) return;

    try {
      setActioningLan(row.lan);
      setError("");

      await api.patch(
        `/zebrs/credit-decision/${encodeURIComponent(row.lan)}`,
        {
          action: "approve",
        }
      );

      setRows((previous) =>
        previous.filter((item) => item.lan !== row.lan)
      );
    } catch (err) {
      console.error("Zebrs approval error:", err);

      setError(
        err.response?.data?.message ||
          "Failed to approve Zebrs loan."
      );
    } finally {
      setActioningLan("");
    }
  };

  const openRejectModal = (row) => {
    if (!row?.lan || actioningLan) return;

    setRejectModal(row);
    setRejectRemark("");
    setRejectError("");
  };

  const closeRejectModal = () => {
    if (actioningLan) return;

    setRejectModal(null);
    setRejectRemark("");
    setRejectError("");
  };

  const handleReject = async (event) => {
    event.preventDefault();

    const lan = rejectModal?.lan;
    const remark = rejectRemark.trim();

    if (!lan || actioningLan) return;

    if (!remark) {
      setRejectError("Rejection reason is required.");
      return;
    }

    if (remark.length < 5) {
      setRejectError(
        "Please enter at least 5 characters."
      );
      return;
    }

    if (remark.length > 1000) {
      setRejectError(
        "Reason cannot exceed 1000 characters."
      );
      return;
    }

    try {
      setActioningLan(lan);
      setRejectError("");

      const response = await api.patch(
        `/zebrs/credit-decision/${encodeURIComponent(lan)}`,
        {
          action: "reject",
          remark,
        }
      );

      if (!response.data?.success) {
        throw new Error(response.data?.message || "Failed to reject loan.");
      }
      // Move this loan into the Rejected queue.
      setRows((previous) => previous.filter((row) => row.lan !== lan));
      setRejectModal(null);
      setRejectRemark("");
    } catch (err) {
      console.error("Zebrs rejection error:", err);

      setRejectError(
        err.response?.data?.message ||
          "Failed to reject the Zebrs loan."
      );
    } finally {
      setActioningLan("");
    }
  };

  const statusStyle = (value) => {
    const normalized = String(value || "").toLowerCase();

    if (
      normalized.includes("rejected") ||
      normalized.includes("failed")
    ) {
      return {
        background: "#fee2e2",
        color: "#991b1b",
        border: "1px solid #fecaca",
      };
    }

    if (
      normalized.includes("approved") ||
      normalized.includes("operations initiated")
    ) {
      return {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0",
      };
    }

    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fde68a",
    };
  };

  const StatusBadge = ({ value }) => (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 11px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 700,
        whiteSpace: "nowrap",
        ...statusStyle(value),
      }}
    >
      {value || "Pending"}
    </span>
  );

  const actionButtonStyle = (type, disabled) => ({
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid transparent",
    background:
      type === "approve" ? "#10b981" : "#ef4444",
    borderColor:
      type === "approve" ? "#059669" : "#dc2626",
    color: "#ffffff",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: "nowrap",
  });

  const columns = [
    {
      key: "customer_name",
      header: "Loan Details",
      sortable: true,
      width: 220,
      render: (row) => (
        <button
          type="button"
          onClick={() => openCustomerDetails(row)}
          className="zebrs-loan-link"
        >
          {row.customer_name || "—"}
        </button>
      ),
      sortAccessor: (row) =>
        String(row.customer_name || "").toLowerCase(),
    },
    {
      key: "lender",
      header: "Lender",
      width: 120,
      render: () => "Zebrs",
      csvAccessor: () => "Zebrs",
    },
    {
      key: "partner_loan_id",
      header: "Partner Loan ID",
      sortable: true,
      width: 160,
    },
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      width: 145,
      render: (row) => (
        <button
          type="button"
          onClick={() => openCustomerDetails(row)}
          className="zebrs-loan-link"
        >
          {row.lan || "—"}
        </button>
      ),
    },
    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,
      width: 160,
      render: (row) =>
        row.mobile_number ? (
          <a
            href={`tel:${row.mobile_number}`}
            style={{
              color: "#2563eb",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {row.mobile_number}
          </a>
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      width: 160,
      render: (row) => (
        <StatusBadge value={row.status} />
      ),
    },
    {
      key: "stage",
      header: "Stage",
      sortable: true,
      width: 160,
      render: (row) => (
        <StatusBadge value={row.stage} />
      ),
    },

    // No Approved Amount column

    {
      key: "docs",
      header: "Documents",
      width: 120,
      csvAccessor: () => "",
      render: (row) => (
        <button
          type="button"
          onClick={() =>
            navigate(
              `/documents/${encodeURIComponent(row.lan)}`
            )
          }
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #93c5fd",
            background: "#ffffff",
            color: "#1d4ed8",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          📂 Docs
        </button>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: 230,
      csvAccessor: () => "",
      render: (row) => {
        const busy = actioningLan === row.lan;
        const disabled = Boolean(actioningLan);

        if (isRejected(row)) {
          return (
            <StatusBadge value="Rejected" />
          );
        }

        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <button
              type="button"
              disabled={disabled}
              style={actionButtonStyle(
                "approve",
                disabled
              )}
              onClick={() => handleApprove(row)}
            >
              {busy ? "Processing..." : "✅ Approve"}
            </button>

            <button
              type="button"
              disabled={disabled}
              style={actionButtonStyle(
                "reject",
                disabled
              )}
              onClick={() => openRejectModal(row)}
            >
              ❌ Reject
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <style>{`
        .zebrs-loan-link {
          border: none;
          background: transparent;
          color: #2563eb;
          font-weight: 700;
          font-size: 13px;
          text-align: left;
          padding: 0;
          cursor: pointer;
        }

        .zebrs-loan-link:hover {
          text-decoration: underline;
        }

        .zebrs-reject-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.58);
          z-index: 9999;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 18px;
        }

        .zebrs-reject-card {
          width: 100%;
          max-width: 520px;
          background: #ffffff;
          border-radius: 16px;
          padding: 26px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.2);
        }

        .zebrs-reject-card h2 {
          margin: 0 0 8px;
          font-size: 22px;
          color: #0f172a;
        }

        .zebrs-reject-subtitle {
          color: #64748b;
          font-size: 13px;
          margin-bottom: 20px;
        }

        .zebrs-reject-card label {
          display: block;
          color: #334155;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 9px;
        }

        .zebrs-reject-card textarea {
          width: 100%;
          min-height: 125px;
          resize: vertical;
          padding: 12px 14px;
          box-sizing: border-box;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          font: inherit;
          font-size: 14px;
          outline: none;
        }

        .zebrs-reject-card textarea:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
        }

        .zebrs-reject-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 22px;
        }

        .zebrs-reject-actions button {
          padding: 11px 18px;
          border-radius: 9px;
          font-weight: 700;
          cursor: pointer;
        }

        .zebrs-reject-actions button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>

      <LoaderOverlay
        show={loading}
        label="Fetching Zebrs Credit Initiated Loans..."
      />

      {error && (
        <div
          role="alert"
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            padding: 14,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <DataTable
        title="Zebrs Credit Initiated Loans"
        rows={rows}
        columns={columns}
        globalSearchKeys={[
          "customer_name",
          "partner_loan_id",
          "lan",
          "mobile_number",
          "status",
          "stage",
        ]}
        exportFileName="Zebrs_Credit_Initiated_Loans"
      />

      {/* Reject popup */}
      {rejectModal && (
        <div className="zebrs-reject-overlay">
          <form
            className="zebrs-reject-card"
            onSubmit={handleReject}
            role="dialog"
            aria-modal="true"
            aria-labelledby="zebrs-reject-title"
          >
            <h2 id="zebrs-reject-title">
              Reject Loan Application
            </h2>

            <p className="zebrs-reject-subtitle">
              LAN: <strong>{rejectModal.lan}</strong>
              <br />
              Customer: {rejectModal.customer_name || "—"}
            </p>

            <label htmlFor="zebrs-reject-reason">
              Rejection Reason
              <span style={{ color: "#dc2626" }}> *</span>
            </label>

            <textarea
              id="zebrs-reject-reason"
              value={rejectRemark}
              maxLength={1000}
              required
              autoFocus
              disabled={Boolean(actioningLan)}
              placeholder="Enter the reason for rejecting this application..."
              onChange={(e) => {
                setRejectRemark(e.target.value);
                setRejectError("");
              }}
            />

            <div
              style={{
                marginTop: 7,
                textAlign: "right",
                color: "#94a3b8",
                fontSize: 12,
              }}
            >
              {rejectRemark.length}/1000
            </div>

            {rejectError && (
              <p
                role="alert"
                style={{
                  color: "#dc2626",
                  fontSize: 13,
                  marginTop: 12,
                }}
              >
                {rejectError}
              </p>
            )}

            <div className="zebrs-reject-actions">
              <button
                type="button"
                disabled={Boolean(actioningLan)}
                onClick={closeRejectModal}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#334155",
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  Boolean(actioningLan) ||
                  rejectRemark.trim().length < 5
                }
                style={{
                  border: "none",
                  background: "#dc2626",
                  color: "#ffffff",
                }}
              >
                {actioningLan
                  ? "Rejecting..."
                  : "Confirm Rejection"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};

export default ZebrsDisburseInitiate;
