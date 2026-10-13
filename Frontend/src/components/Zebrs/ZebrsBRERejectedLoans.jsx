import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const formatMoney = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const amount = Number(value);

  return Number.isFinite(amount)
    ? `₹${amount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : "—";
};

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-IN");
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

// Only cases initially rejected by the system's BRE,
// which have not received a final review decision.
const isBRERejectedCase = (row) => {
  const status = normalize(row.status);
  const stage = normalize(row.stage);
  const breStatus = normalize(row.zebrs_bre_status);

  const originalBRERejected = [
    "REJECTED",
    "BRE REJECTED",
    "BRE FAILED",
  ].includes(breStatus);

  if (!originalBRERejected) return false;

  const excludedStatuses = [
    "CREDIT INITIATED",
    "OPERATIONS INITIATED",
    "APPROVED",
    "DISBURSED",
    "DISBURSE INITIATE",
  ];

  const excludedStages = [
    "BRE REVIEW REJECTED",
    "CREDIT REJECTED",
    "CREDIT APPROVED",
    "BRE APPROVED",
    "BRE DEVIATION",
    "OPERATION APPROVED",
    "OPERATION REJECTED",
  ];

  if (excludedStatuses.includes(status)) return false;
  if (excludedStages.includes(stage)) return false;

  return (
    ["BRE REJECTED", "BRE FAILED"].includes(status) ||
    (status === "REJECTED" &&
      ["", "LOGIN", "BRE REJECTED", "BRE FAILED"].includes(stage))
  );
};

const ZebrsBRERejectedLoans = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalRows, setTotalRows] = useState(0);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyLan, setBusyLan] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  const refresh = useCallback(() => {
    setRefreshKey((previous) => previous + 1);
  }, []);

  const fetchLoans = useCallback(
    async (signal) => {
      setLoading(true);
      setError("");

      try {
        const response = await api.get("/zebrs/bre-rejected-loans", {
          params: {
            page,
            pageSize,
            search: debouncedSearch || undefined,
          },
          signal,
        });

        if (signal.aborted) return;

        const data = response.data;

        if (data?.success === false) {
          throw new Error(
            data.message || "Failed to fetch BRE rejected loans.",
          );
        }

        const fetchedRows = Array.isArray(data?.rows) ? data.rows : [];

        // Additional UI safeguard.
        // Backend performs the actual eligibility filter.
        const eligibleRows = fetchedRows.filter(isBRERejectedCase);

        setRows(eligibleRows);

        setTotalRows(Number(data?.pagination?.total ?? eligibleRows.length));
      } catch (err) {
        if (signal.aborted || err?.code === "ERR_CANCELED") {
          return;
        }

        console.error("Zebrs BRE rejected fetch error:", err);

        setError(
          err.response?.data?.message ||
            err.message ||
            "Failed to fetch BRE rejected cases.",
        );

        setRows([]);
        setTotalRows(0);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [page, pageSize, debouncedSearch],
  );

  useEffect(() => {
    const controller = new AbortController();

    fetchLoans(controller.signal);

    return () => controller.abort();
  }, [fetchLoans, refreshKey]);

  const openCustomer = useCallback(
    (row) => {
      if (!row?.lan) return;

      navigate(`/zebrs/update-data?lan=${encodeURIComponent(row.lan)}`);
    },
    [navigate],
  );

  // APPROVE:
  // Rejected by system BRE -> Operations Initiated.
  
const handleApprove = useCallback(
  async (row) => {
    if (!row?.lan || busyLan) return;

    if (!isBRERejectedCase(row)) {
      setError("Loan is not eligible for BRE review.");
      return;
    }

    const confirmed = window.confirm(
      `Approve BRE rejected loan ${row.lan}?\n\n` +
      "This case will move directly to Operations Approval.\n" +
      "Status: Operations Initiated\n" +
      "Stage: Credit Approved"
    );

    if (!confirmed) return;

    setBusyLan(row.lan);
    setError("");
    setSuccess("");

    try {
      const response = await api.patch(
        `/zebrs/bre-review/${encodeURIComponent(row.lan)}`,
        { action: "approve" }
      );

      const result = response.data;

      if (!result?.success) {
        throw new Error(result?.message || "Approval failed");
      }

      // Verify actual backend transition before updating UI.
      if (
        result.status !== "Operations Initiated" ||
        result.stage !== "Credit Approved"
      ) {
        throw new Error(
          `Unexpected status transition: ${result.status} / ${result.stage}`
        );
      }

      // Remove case immediately from BRE Rejected.
      setRows((previous) =>
        previous.filter((item) => item.lan !== row.lan)
      );

      setTotalRows((previous) => Math.max(0, previous - 1));

      setSuccess(
        `${row.lan} moved directly to Operations Initiated.`
      );

      refresh();

      // Open Operations Approval screen.
      navigate("/zebrs/operation-approval-cases");

    } catch (error) {
      console.error("BRE Review Approval Error:", error);

      setError(
        error.response?.data?.message ||
        error.message ||
        "Unable to approve BRE rejected loan"
      );
    } finally {
      setBusyLan("");
    }
  },
  [busyLan, refresh, navigate]
);


  // REJECT:
  // Final rejection -> remove case from screen.
  const handleReject = useCallback(
    async (row) => {
      if (!row?.lan || busyLan) return;

      if (!isBRERejectedCase(row)) {
        setError("This loan is not eligible for BRE review.");
        return;
      }

      const confirmed = window.confirm(
        `Confirm final rejection for ${row.lan}?\n\n` +
          `BRE Reason: ${row.zebrs_bre_reason || "Not recorded"}\n\n` +
          "Loan Status: Rejected\n" +
          "Stage: BRE Review Rejected\n\n" +
          "The case will disappear from this screen.",
      );

      if (!confirmed) return;

      setBusyLan(row.lan);
      setError("");
      setSuccess("");

      try {
        const response = await api.patch(
          `/zebrs/bre-review/${encodeURIComponent(row.lan)}`,
          {
            action: "reject",
          },
        );

        if (!response.data?.success) {
          throw new Error(response.data?.message || "Rejection failed.");
        }

        // Remove immediately instead of leaving it in the table.
        setRows((previous) => previous.filter((item) => item.lan !== row.lan));

        setTotalRows((previous) => Math.max(0, previous - 1));

        setSuccess(
          `${row.lan} finally rejected and removed from BRE Rejected.`,
        );

        refresh();
      } catch (err) {
        console.error("Zebrs BRE rejection error:", err);

        setError(
          err.response?.data?.message ||
            err.message ||
            "Unable to reject the BRE case.",
        );
      } finally {
        setBusyLan("");
      }
    },
    [busyLan, refresh],
  );

  const columns = useMemo(
    () => [
      {
        key: "customer_name",
        header: "Loan Details",
        width: 190,
        sortable: true,
        render: (row) => (
          <button
            className="zbrr-link"
            type="button"
            onClick={() => openCustomer(row)}
          >
            {row.customer_name || "—"}
          </button>
        ),
      },
      {
        key: "lender",
        header: "Lender",
        width: 95,
        render: () => "Zebrs",
        csvAccessor: () => "Zebrs",
      },
      {
        key: "partner_loan_id",
        header: "Partner Loan ID",
        sortable: true,
        width: 155,
      },
      {
        key: "lan",
        header: "LAN",
        sortable: true,
        width: 135,
        render: (row) => (
          <button
            className="zbrr-link"
            type="button"
            onClick={() => openCustomer(row)}
          >
            {row.lan}
          </button>
        ),
      },
      {
        key: "mobile_number",
        header: "Mobile Number",
        sortable: true,
        width: 150,
        render: (row) =>
          row.mobile_number ? (
            <a className="zbrr-link" href={`tel:${row.mobile_number}`}>
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
        width: 135,
        render: (row) => formatMoney(row.loan_amount),
        csvAccessor: (row) => row.loan_amount ?? "",
      },
      {
        key: "zebrs_bre_status",
        header: "Original BRE",
        sortable: true,
        width: 150,
        render: (row) => (
          <span className="zbrr-pill zbrr-pill-red">
            {row.zebrs_bre_status || "BRE Rejected"}
          </span>
        ),
      },
      {
        key: "status",
        header: "Loan Status",
        sortable: true,
        width: 140,
        render: (row) => (
          <span className="zbrr-pill zbrr-pill-red">{row.status || "—"}</span>
        ),
      },
      {
        key: "stage",
        header: "Stage",
        sortable: true,
        width: 155,
        render: (row) => <span className="zbrr-stage">{row.stage || "—"}</span>,
      },
      {
        key: "zebrs_bre_reason",
        header: "BRE Rejection Reason",
        width: 345,
        render: (row) => (
          <div className="zbrr-reason-box">
            <div className="zbrr-reason-head">
              <span className="zbrr-reason-icon">!</span>
              <span>BRE Rejection Reason</span>
            </div>

            <div className="zbrr-reason-text">
              {row.zebrs_bre_reason || "No BRE reason recorded"}
            </div>
          </div>
        ),
        csvAccessor: (row) => row.zebrs_bre_reason || "",
      },
      {
        key: "updated_at",
        header: "Updated At",
        sortable: true,
        width: 125,
        render: (row) => formatDate(row.updated_at),
      },
      {
        key: "docs",
        header: "Documents",
        width: 115,
        csvAccessor: () => "",
        render: (row) => (
          <button
            className="zbrr-docs"
            type="button"
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
        width: 225,
        csvAccessor: () => "",
        render: (row) => {
          const disabled = Boolean(busyLan);
          const busy = busyLan === row.lan;

          return (
            <div className="zbrr-actions">
              <button
                className="zbrr-button zbrr-approve"
                type="button"
                disabled={disabled}
                onClick={() => handleApprove(row)}
              >
                {busy ? "Working..." : "✓ Approve"}
              </button>

              <button
                className="zbrr-button zbrr-reject"
                type="button"
                disabled={disabled}
                onClick={() => handleReject(row)}
              >
                {busy ? "Working..." : "✕ Reject"}
              </button>
            </div>
          );
        },
      },
    ],
    [busyLan, navigate, openCustomer, handleApprove, handleReject],
  );

  return (
    <div className="zbrr-page">
      <style>{`
        .zbrr-page {
          width: 100%;
          min-width: 0;
          font-family: inherit;
        }

        .zbrr-scroll {
          width: 100%;
          overflow-x: auto;
          border-radius: 14px;
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }

        .zbrr-scroll table {
          width: 100%;
          min-width: 1940px !important;
          table-layout: auto !important;
          border-collapse: separate;
          border-spacing: 0;
        }

        .zbrr-scroll th,
        .zbrr-scroll td {
          box-sizing: border-box;
          vertical-align: middle;
        }

        .zbrr-scroll td {
          white-space: nowrap;
        }

        .zbrr-scroll th:nth-child(10),
        .zbrr-scroll td:nth-child(10) {
          min-width: 345px !important;
          width: 345px !important;
        }

        .zbrr-scroll td:nth-child(10) {
          white-space: normal !important;
        }

        .zbrr-scroll td:first-child {
          min-width: 155px;
          white-space: normal;
        }

        .zbrr-scroll td:last-child {
          min-width: 225px;
        }

        .zbrr-link {
          border: none;
          padding: 0;
          background: transparent;
          color: #2563eb;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          text-align: left;
          text-decoration: none;
          cursor: pointer;
        }

        .zbrr-link:hover {
          color: #1d4ed8;
          text-decoration: underline;
        }

        .zbrr-pill {
          display: inline-flex;
          align-items: center;
          padding: 7px 11px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 750;
          white-space: nowrap;
        }

        .zbrr-pill-red {
          color: #b42318;
          background: #fff1f0;
          border: 1px solid #fecdca;
        }

        .zbrr-stage {
          display: inline-flex;
          padding: 7px 10px;
          border-radius: 7px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #475569;
          font-size: 12px;
          font-weight: 650;
        }

        .zbrr-reason-box {
          width: 325px;
          min-width: 325px;
          box-sizing: border-box;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-left: 3px solid #ef4444;
          border-radius: 9px;
          padding: 13px 15px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, .035);
          white-space: normal;
        }

        .zbrr-reason-head {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 9px;
          color: #b42318;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .06em;
        }

        .zbrr-reason-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 17px;
          height: 17px;
          flex-shrink: 0;
          border-radius: 50%;
          background: #fee4e2;
          color: #b42318;
          font-size: 11px;
        }

        .zbrr-reason-text {
          color: #334155;
          font-size: 12px;
          font-weight: 500;
          line-height: 1.7;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: normal;
        }

        .zbrr-docs {
          padding: 9px 12px;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          color: #1d4ed8;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          cursor: pointer;
        }

        .zbrr-docs:hover {
          background: #dbeafe;
        }

        .zbrr-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }

        .zbrr-button {
          padding: 9px 13px;
          border-radius: 8px;
          border: 1px solid transparent;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
          transition: background .15s, box-shadow .15s;
        }

        .zbrr-approve {
          background: #15803d;
          border-color: #15803d;
          color: #fff;
        }

        .zbrr-approve:hover:not(:disabled) {
          background: #166534;
          box-shadow: 0 3px 8px rgba(21, 128, 61, .15);
        }

        .zbrr-reject {
          background: #fff;
          color: #b91c1c;
          border-color: #fca5a5;
        }

        .zbrr-reject:hover:not(:disabled) {
          background: #fef2f2;
        }

        .zbrr-button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .zbrr-tools {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 9px;
        }

        .zbrr-search {
          width: 235px;
          max-width: 100%;
          box-sizing: border-box;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px 12px;
          background: #f8fafc;
          color: #0f172a;
          font-size: 12px;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }

        .zbrr-search:focus {
          border-color: #2563eb;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, .09);
        }

        .zbrr-refresh {
          padding: 10px 13px;
          background: #17396d;
          border: 1px solid #17396d;
          border-radius: 8px;
          color: #fff;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
        }

        .zbrr-refresh:hover:not(:disabled) {
          background: #102b55;
        }

        .zbrr-refresh:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .zbrr-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 13px 16px;
          margin-bottom: 14px;
          border: 1px solid;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
        }

        .zbrr-alert-error {
          background: #fef2f2;
          border-color: #fecaca;
          color: #991b1b;
        }

        .zbrr-alert-success {
          background: #ecfdf5;
          border-color: #a7f3d0;
          color: #065f46;
        }

        @media (max-width: 760px) {
          .zbrr-tools {
            width: 100%;
          }

          .zbrr-search {
            width: 100%;
          }
        }
      `}</style>

      <LoaderOverlay
        show={loading}
        label="Fetching Zebrs BRE rejected loans..."
      />

      {error && (
        <div className="zbrr-alert zbrr-alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="zbrr-alert zbrr-alert-success" role="status">
          {success}
        </div>
      )}

      <div className="zbrr-scroll">
        <DataTable
          title="Zebrs BRE Rejected Loans"
          rows={rows}
          columns={columns}
          renderTopRight={
            <div className="zbrr-tools">
              <input
                className="zbrr-search"
                aria-label="Search BRE rejected cases"
                placeholder="Search LAN, customer, reason..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              <button
                className="zbrr-refresh"
                type="button"
                disabled={loading || Boolean(busyLan)}
                onClick={refresh}
              >
                ↻ Refresh
              </button>
            </div>
          }
          globalSearchKeys={[]}
          exportFileName="Zebrs_BRE_Rejected_Loans"
          serverPagination={true}
          totalRows={totalRows}
          currentPage={page}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPageSize(Number(value) || 25);
            setPage(1);
          }}
          initialPageSize={pageSize}
          pageSizeOptions={[10, 25, 50, 100]}
        />
      </div>
    </div>
  );
};

export default ZebrsBRERejectedLoans;
