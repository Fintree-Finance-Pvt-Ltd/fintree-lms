import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const isCreditInitiated = (row) =>
  normalize(row?.status) === "CREDIT INITIATED" &&
  ["BRE APPROVED", "BRE DEVIATION"].includes(normalize(row?.stage));

const ZebrsDisburseInitiate = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actioningLan, setActioningLan] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((previous) => previous + 1);
  }, []);

  // Fetch only Credit Initiated loans
  const fetchLoans = useCallback(async (signal) => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/zebrs/credit-initiated-loans", {
        params: {
          page: 1,
          pageSize: 100,
          sortBy: "created_at",
          sortDir: "desc",
        },
        signal,
      });

      if (signal.aborted) return;

      if (response.data?.success === false) {
        throw new Error(
          response.data?.message || "Failed to fetch Credit Initiated loans.",
        );
      }

      const fetchedRows = Array.isArray(response.data?.rows)
        ? response.data.rows
        : [];

      setRows(fetchedRows.filter(isCreditInitiated));
    } catch (err) {
      if (signal.aborted || err?.code === "ERR_CANCELED") {
        return;
      }

      console.error("Zebrs fetch error:", err);

      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to fetch Zebrs Credit Initiated loans.",
      );

      setRows([]);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetchLoans(controller.signal);

    return () => controller.abort();
  }, [fetchLoans, refreshKey]);

  // Customer details navigation
  const openCustomerDetails = useCallback(
    (row) => {
      if (!row?.lan) return;

      navigate(`/zebrs/update-data?lan=${encodeURIComponent(row.lan)}`);
    },
    [navigate],
  );

  // Credit Approve -> Operations Initiated
  const handleApprove = useCallback(
    async (row) => {
      if (!row?.lan || actioningLan) return;

      if (!isCreditInitiated(row)) {
        setError("Only Credit Initiated loans can be approved here.");
        return;
      }

      const confirmed = window.confirm(
        `Approve Zebrs loan ${row.lan}?\n\n` +
          `Customer: ${row.customer_name || "—"}\n` +
          `Loan Amount: ₹${Number(row.loan_amount || 0).toLocaleString(
            "en-IN",
          )}\n\n` +
          "The case will move to Operations Approval.\n" +
          "Status: Operations Initiated\n" +
          "Stage: Credit Approved",
      );

      if (!confirmed) return;

      try {
        setActioningLan(row.lan);
        setError("");
        setSuccess("");

        const response = await api.patch(
          `/zebrs/credit-decision/${encodeURIComponent(row.lan)}`,
          {
            action: "approve",
          },
        );

        const result = response.data;

        if (result?.success !== true) {
          throw new Error(result?.message || "Approval failed.");
        }

        // Verify backend actually saved the intended transition
        if (
          normalize(result.status) !== "OPERATIONS INITIATED" ||
          normalize(result.stage) !== "CREDIT APPROVED"
        ) {
          throw new Error("Unexpected approval response. Check loan status.");
        }

        // Remove approved loan from this screen
        setRows((previous) => previous.filter((item) => item.lan !== row.lan));

        setSuccess(
          `${row.lan} approved successfully. Moving to Operations Approval.`,
        );

        // Navigate to Operations Approval screen
        navigate("/zebrs/operation-approval-cases");
      } catch (err) {
        console.error("Zebrs credit approval error:", err);

        setError(
          err.response?.data?.message ||
            err.message ||
            "Unable to approve Zebrs loan.",
        );
      } finally {
        setActioningLan("");
      }
    },
    [actioningLan, navigate],
  );

  // Status badge styling
  const statusStyle = (value) => {
    const text = normalize(value);

    if (text.includes("REJECTED") || text.includes("FAILED")) {
      return {
        background: "#fee2e2",
        color: "#991b1b",
        border: "1px solid #fecaca",
      };
    }

    if (text.includes("APPROVED") || text.includes("OPERATIONS INITIATED")) {
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

  const renderStatus = (value) => (
    <span className="zebrs-ci-status" style={statusStyle(value)}>
      {value || "Pending"}
    </span>
  );

  const columns = useMemo(
    () => [
      {
        key: "customer_name",
        header: "Loan Details",
        sortable: true,
        width: 210,
        render: (row) => (
          <button
            type="button"
            className="zebrs-ci-link"
            onClick={() => openCustomerDetails(row)}
          >
            {row.customer_name || "—"}
          </button>
        ),
        sortAccessor: (row) => String(row.customer_name || "").toLowerCase(),
      },
      {
        key: "lender",
        header: "Lender",
        width: 110,
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
        width: 150,
        render: (row) => (
          <button
            type="button"
            className="zebrs-ci-link"
            onClick={() => openCustomerDetails(row)}
          >
            {row.lan || "—"}
          </button>
        ),
      },
      {
        key: "mobile_number",
        header: "Mobile Number",
        sortable: true,
        width: 155,
        render: (row) =>
          row.mobile_number ? (
            <a className="zebrs-ci-link" href={`tel:${row.mobile_number}`}>
              {row.mobile_number}
            </a>
          ) : (
            "—"
          ),
      },
      {
        key: "loan_amount",
        header: "Loan Amount",
        sortable: true,
        width: 145,
        render: (row) =>
          row.loan_amount != null
            ? `₹${Number(row.loan_amount).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            : "—",
      },
      {
        key: "status",
        header: "Loan Status",
        sortable: true,
        width: 170,
        render: (row) => renderStatus(row.status),
      },
      {
        key: "stage",
        header: "Stage",
        sortable: true,
        width: 150,
        render: (row) => renderStatus(row.stage),
      },
      {
        key: "docs",
        header: "Documents",
        width: 120,
        csvAccessor: () => "",
        render: (row) => (
          <button
            type="button"
            className="zebrs-ci-docs"
            onClick={() =>
              navigate(`/documents/${encodeURIComponent(row.lan)}`)
            }
          >
            📂 Docs
          </button>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        width: 245,
        csvAccessor: () => "",
        render: (row) => {
          const busy = actioningLan === row.lan;
          const disabled = Boolean(actioningLan) || !isCreditInitiated(row);

          return (
            <div className="zebrs-ci-actions">
              <button
                type="button"
                className="zebrs-ci-approve"
                disabled={disabled}
                onClick={() => handleApprove(row)}
              >
                {busy ? "Processing..." : "✓ Approve"}
              </button>

              {/* Reject temporarily disabled */}
              <button
                type="button"
                className="zebrs-ci-reject"
                disabled
                title="Reject functionality is temporarily disabled"
              >
                ✕ Reject
              </button>
            </div>
          );
        },
      },
    ],
    [actioningLan, handleApprove, navigate, openCustomerDetails],
  );

  return (
    <div className="zebrs-ci-page">
      <style>{`
        .zebrs-ci-page {
          width: 100%;
          min-width: 0;
          font-family: inherit;
        }

        .zebrs-ci-link {
          border: none;
          padding: 0;
          background: transparent;
          color: #2563eb;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
          text-align: left;
          cursor: pointer;
        }

        .zebrs-ci-link:hover {
          color: #1d4ed8;
          text-decoration: underline;
        }

        .zebrs-ci-status {
          display: inline-flex;
          align-items: center;
          padding: 7px 11px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }

        .zebrs-ci-actions {
          display: flex;
          align-items: center;
          gap: 9px;
          white-space: nowrap;
        }

        .zebrs-ci-approve,
        .zebrs-ci-reject {
          padding: 9px 13px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          transition: background 0.15s;
        }

        .zebrs-ci-approve {
          background: #15803d;
          color: #fff;
          border: 1px solid #15803d;
          cursor: pointer;
        }

        .zebrs-ci-approve:hover:not(:disabled) {
          background: #166534;
        }

        .zebrs-ci-reject {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fca5a5;
          opacity: 0.4;
          cursor: not-allowed;
        }

        .zebrs-ci-approve:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .zebrs-ci-docs {
          padding: 8px 12px;
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
        }

        .zebrs-ci-docs:hover {
          background: #dbeafe;
        }

        .zebrs-ci-alert {
          padding: 13px 16px;
          margin-bottom: 15px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
        }

        .zebrs-ci-alert-error {
          background: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }

        .zebrs-ci-alert-success {
          background: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }

        .zebrs-ci-toolbar {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 12px;
        }

        .zebrs-ci-refresh {
          padding: 9px 14px;
          background: #17396d;
          color: #fff;
          border: 1px solid #17396d;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .zebrs-ci-refresh:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>

      <LoaderOverlay
        show={loading}
        label="Fetching Zebrs Credit Initiated Loans..."
      />

      {error && (
        <div className="zebrs-ci-alert zebrs-ci-alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="zebrs-ci-alert zebrs-ci-alert-success" role="status">
          {success}
        </div>
      )}

      <div className="zebrs-ci-toolbar">
        <button
          type="button"
          className="zebrs-ci-refresh"
          disabled={loading || Boolean(actioningLan)}
          onClick={refresh}
        >
          ↻ Refresh
        </button>
      </div>

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
    </div>
  );
};

export default ZebrsDisburseInitiate;
