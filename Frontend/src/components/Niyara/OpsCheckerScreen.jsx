import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, RefreshCcw } from "lucide-react";
import api from "../../api/api";

const NiyaraOpsCheckerScreen = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyLan, setBusyLan] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/niyara/ops-checker-loans");

      if (
        response.data?.success !== true ||
        !Array.isArray(response.data?.rows)
      ) {
        throw new Error("Invalid Ops Checker response");
      }

      setRows(response.data.rows);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to fetch Niyara Ops Checker loans",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

 
const handleDecision = async (row, decision) => {
  const isApproval = decision === "approve";
  let reason = "";

  // Rejection reason is mandatory
  if (!isApproval) {
    const input = window.prompt(
      `Enter rejection reason for ${row.lan}:`
    );

    if (input === null) return;

    reason = input.trim();

    if (!reason || reason.length > 1000) {
      setError("Please enter a valid rejection reason (max 1000 characters).");
      return;
    }
  }

  const confirmed = window.confirm(
    isApproval
      ? `Are you sure you want to approve ${row.lan}?`
      : `Are you sure you want to reject ${row.lan}?`
  );

  if (!confirmed) return;

  setBusyLan(row.lan);
  setError("");

  try {
    const response = await api.patch(
      `/niyara/${encodeURIComponent(row.lan)}/ops-checker-decision`,
      {
        decision,
        ...(isApproval ? {} : { reason }),
      }
    );

    if (response.data?.success !== true) {
      throw new Error(
        response.data?.message || "Decision failed"
      );
    }

    window.alert(
      isApproval
        ? `${row.lan} approved successfully. Sent for disbursement.`
        : `${row.lan} rejected successfully.`
    );

    await refresh();
  } catch (err) {
    setError(
      err.response?.data?.message ||
        err.message ||
        "Unable to update Niyara Ops Checker case."
    );
  } finally {
    setBusyLan("");
  }
};


  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) =>
      [row.lan, row.customer_name, row.mobile_number].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(term),
      ),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  const currentPage = Math.min(page, totalPages);

  const visibleRows = filteredRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const formatAmount = (value) =>
    value == null ? "-" : `₹${Number(value).toLocaleString("en-IN")}`;

  const formatDate = (value) =>
    value ? new Date(value).toLocaleDateString("en-IN") : "-";

  const exportCSV = () => {
    const headers = [
      "Customer",
      "LAN",
      "Mobile",
      "Loan Amount",
      "Status",
      "Maker",
      "Maker Decision Date",
    ];

    const data = filteredRows.map((row) => [
      row.customer_name,
      row.lan,
      row.mobile_number,
      row.loan_amount,
      row.status,
      row.ops_maker_decision_by,
      row.ops_maker_decided_at,
    ]);

    const escapeCSV = (value) => {
      let text = String(value ?? "");
      if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
      return `"${text.replace(/"/g, '""')}"`;
    };

    const csv = [headers, ...data]
      .map((line) => line.map(escapeCSV).join(","))
      .join("\r\n");

    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = "niyara_ops_checker.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ny-checker-page">
      <style>{`
        .ny-checker-page {
          min-height: calc(100vh - 85px);
          padding: 34px 36px;
          background: #f4f7fb;
          color: #10264d;
        }
        .ny-checker-header,
        .ny-checker-toolbar,
        .ny-checker-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        .ny-checker-header {
          margin-bottom: 20px;
        }
        .ny-checker-header h2 {
          font-size: 23px;
          font-weight: 800;
          margin: 0;
        }
        .ny-checker-header p,
        .ny-checker-footer {
          color: #607898;
          font-size: 12px;
        }
        .ny-checker-card {
          background: #fff;
          border: 1px solid #e4ebf4;
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 10px 30px rgba(15, 40, 80, .05);
        }
        .ny-checker-toolbar {
          margin-bottom: 16px;
        }
        .ny-checker-toolbar h3 {
          font-size: 21px;
          margin: 0;
        }
        .ny-checker-controls,
        .ny-checker-actions,
        .ny-checker-pager {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ny-checker-page button,
        .ny-checker-page select,
        .ny-checker-page input {
          border-radius: 9px;
          border: 1px solid #d8e3f0;
          padding: 9px 12px;
          font-size: 12px;
        }
        .ny-checker-page button {
          background: #fff;
          color: #14305b;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .ny-checker-page button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }
        .ny-checker-page .ny-primary {
          background: #09265b;
          border-color: #09265b;
          color: #fff;
        }
        .ny-checker-page .ny-approve {
          background: #e7f8ee;
          color: #16734b;
        }
        .ny-checker-page .ny-reject {
          background: #fff0f1;
          color: #b42335;
        }
        .ny-checker-table-wrap {
          overflow-x: auto;
          border: 1px solid #e4ebf4;
          border-radius: 14px;
        }
        .ny-checker-table {
          border-collapse: collapse;
          width: 100%;
          min-width: 950px;
          font-size: 12px;
        }
        .ny-checker-table th {
          background: #f6f9fd;
          color: #547095;
          text-align: left;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: .6px;
          padding: 14px 12px;
        }
        .ny-checker-table td {
          padding: 13px 12px;
          border-top: 1px solid #edf1f6;
        }
        .ny-checker-table tbody tr:hover {
          background: #fafcff;
        }
        .ny-checker-footer {
          margin-top: 15px;
        }
        .ny-checker-error {
          background: #fff0f1;
          color: #b42335;
          padding: 12px;
          margin-bottom: 14px;
          border-radius: 9px;
        }
        @media (max-width: 768px) {
          .ny-checker-page { padding: 18px 12px; }
        }
      `}</style>

      <div className="ny-checker-header">
        <div>
          <h2>Niyara Ops Checker</h2>
          <p>{rows.length} Niyara records</p>
        </div>

        <button onClick={refresh} disabled={loading || Boolean(busyLan)}>
          <RefreshCcw size={15} />
          Refresh
        </button>
      </div>

      <div className="ny-checker-card">
        <div className="ny-checker-toolbar">
          <h3>Niyara Ops Checker</h3>

          <div className="ny-checker-controls">
            <input
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />

            <button
              className="ny-primary"
              onClick={exportCSV}
              disabled={!filteredRows.length}
            >
              Export CSV
            </button>
          </div>
        </div>

        {error && (
          <div className="ny-checker-error" role="alert">
            {error}
          </div>
        )}

        <div className="ny-checker-table-wrap">
          <table className="ny-checker-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>LAN</th>
                <th>Mobile</th>
                <th>Loan Amount</th>
                <th>Status</th>
                <th>Maker</th>
                <th>Maker Date</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} align="center">
                    Loading...
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    align="center"
                    style={{ padding: 24, color: "#71829b" }}
                  >
                    No results.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.lan}>
                    <td>
                      <strong>{row.customer_name || "-"}</strong>
                    </td>
                    <td>{row.lan}</td>
                    <td>{row.mobile_number || "-"}</td>
                    <td>{formatAmount(row.loan_amount)}</td>
                    <td>{row.status || "-"}</td>
                    <td>{row.ops_maker_decision_by || "-"}</td>
                    <td>{formatDate(row.ops_maker_decided_at)}</td>
                    <td>
                      <div className="ny-checker-actions">
                        <button
                          className="ny-approve"
                          disabled={Boolean(busyLan)}
                          onClick={() => handleDecision(row, "approve")}
                        >
                          <CheckCircle2 size={15} />
                          Approve
                        </button>

                        <button
                          className="ny-reject"
                          disabled={Boolean(busyLan)}
                          onClick={() => handleDecision(row, "reject")}
                        >
                          <XCircle size={15} />
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="ny-checker-footer">
          <span>
            Showing {visibleRows.length} of {filteredRows.length} results
          </span>

          <div className="ny-checker-pager">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Prev
            </button>

            <span>
              Page {currentPage} / {totalPages}
            </span>

            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>

            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NiyaraOpsCheckerScreen;
