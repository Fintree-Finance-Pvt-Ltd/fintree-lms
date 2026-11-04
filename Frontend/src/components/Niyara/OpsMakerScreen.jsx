import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  RefreshCcw,
  FileCheck2,
  Download,
} from "lucide-react";
import api from "../../api/api";

const BASE = "/niyara";

const formatAmount = (value) => {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) return "-";

  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (value) => {
  if (!value) return "-";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN");
};

const safeCsv = (value) => {
  let text = String(value ?? "");

  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
};

const NiyaraOpsMakerScreen = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyLan, setBusyLan] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [docReviews, setDocReviews] = useState({});

  // Fetch only Niyara Ops Maker cases
  const fetchLoans = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get(`${BASE}/ops-maker-loans`);

      if (
        response.data?.success !== true ||
        !Array.isArray(response.data?.rows)
      ) {
        throw new Error("Invalid Niyara Ops Maker response");
      }

      setRows(response.data.rows);
      setDocReviews({});
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to fetch Niyara Ops Maker loans",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return rows;

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

  // Verify current eSign and eNACH data before approval.
  const checkDocuments = async (lan) => {
    const [esignResponse, enachResponse] = await Promise.all([
      api.get(`${BASE}/${encodeURIComponent(lan)}/esign-status`),
      api.get(`${BASE}/${encodeURIComponent(lan)}/enach-status`),
    ]);

    const esign = esignResponse.data?.data;
    const enach = enachResponse.data?.data;

    const sanctionSigned = esign?.sanction?.verified_signed === true;

    const agreementSigned = esign?.agreement?.verified_signed === true;

    const bankVerified =
      String(enach?.bank_status ?? "").toUpperCase() === "MANDATE_CREATED";

    const validMandate =
      Array.isArray(enach?.mandates) &&
      enach.mandates.some(
        (mandate) =>
          ["SUCCESS", "REGISTERED", "ACTIVE"].includes(
            String(mandate.status ?? "").toUpperCase(),
          ) && Boolean(String(mandate.umrn ?? "").trim()),
      );

    const checks = {
      sanctionSigned,
      agreementSigned,
      bankVerified,
      validMandate,
    };

    const ready = Object.values(checks).every(Boolean);

    setDocReviews((previous) => ({
      ...previous,
      [lan]: { ready, checks },
    }));

    return { ready, checks };
  };

  // View the verification status without approving.
  const handleReview = async (row) => {
    setBusyLan(row.lan);
    setError("");

    try {
      const review = await checkDocuments(row.lan);

      if (!review.ready) {
        setError(`${row.lan}: Some eSign or eNACH requirements are pending.`);
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to check eSign and eNACH status",
      );
    } finally {
      setBusyLan("");
    }
  };

  // Approve or reject through Niyara's actual backend.
  const handleDecision = async (row, decision) => {
    const isApproval = decision === "approve";
    let reason = "";

    if (!isApproval) {
      const input = window.prompt(`Enter rejection reason for ${row.lan}:`);

      if (input === null) return;

      reason = input.trim();

      if (!reason || reason.length > 1000) {
        setError("Rejection reason must be 1–1000 characters.");
        return;
      }
    }

    const confirmed = window.confirm(
      `Are you sure you want to ${
        isApproval ? "approve" : "reject"
      } Niyara loan ${row.lan}?`,
    );

    if (!confirmed) return;

    setBusyLan(row.lan);
    setError("");

    try {
      if (isApproval) {
        const review = await checkDocuments(row.lan);

        if (!review.ready) {
          throw new Error(
            "Approval blocked: signed sanction, signed agreement, " +
              "and successful eNACH with UMRN are required.",
          );
        }
      }

      await api.patch(
        `${BASE}/${encodeURIComponent(row.lan)}/ops-maker-decision`,
        {
          decision,
          ...(isApproval ? {} : { reason }),
        },
      );

      await fetchLoans();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to update Niyara Ops Maker decision",
      );
    } finally {
      setBusyLan("");
    }
  };

  const exportCSV = () => {
    const headers = [
      "Customer",
      "LAN",
      "Mobile",
      "Loan Amount",
      "Sanction eSign",
      "Agreement eSign",
      "Bank Status",
      "Status",
      "Stage",
      "Created At",
    ];

    const data = filteredRows.map((row) => [
      row.customer_name,
      row.lan,
      row.mobile_number,
      row.loan_amount,
      row.sanction_esign_status,
      row.agreement_esign_status,
      row.bank_status,
      row.status,
      row.stage,
      row.created_at,
    ]);

    const csv = [headers, ...data]
      .map((line) => line.map(safeCsv).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "niyara_ops_maker.csv";
    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="ny-ops-page">
      <style>{`
        .ny-ops-page {
          padding: 34px 36px;
          background: #f4f7fb;
          min-height: calc(100vh - 85px);
          color: #10264d;
        }

        .ny-ops-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 18px;
        }

        .ny-ops-header h2 {
          font-size: 24px;
          margin: 0;
          font-weight: 800;
        }

        .ny-ops-header p {
          font-size: 12px;
          margin: 5px 0 0;
          color: #53749c;
        }

        .ny-ops-card {
          background: #fff;
          border: 1px solid #e4ebf4;
          border-radius: 20px;
          padding: 17px;
          box-shadow: 0 9px 30px rgba(18,48,91,.05);
        }

        .ny-ops-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 17px;
        }

        .ny-ops-toolbar h3 {
          font-size: 21px;
          font-weight: 800;
          margin: 0;
        }

        .ny-ops-controls {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .ny-ops-search {
          border: 1px solid #d8e3f0;
          background: #f8fafc;
          border-radius: 10px;
          padding: 10px 12px;
          min-width: 185px;
          color: #10264d;
        }

        .ny-ops-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 9px 12px;
          border-radius: 9px;
          border: 1px solid #d8e3f0;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
          background: #fff;
          color: #14305b;
        }

        .ny-ops-btn:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .ny-ops-primary {
          background: #09265b;
          color: #fff;
          border-color: #09265b;
        }

        .ny-ops-approve {
          color: #16734b;
          background: #e9f8ef;
          border-color: #b8e7c9;
        }

        .ny-ops-reject {
          color: #b42335;
          background: #fff0f1;
          border-color: #f5c5cb;
        }

        .ny-ops-table-wrap {
          overflow-x: auto;
          border: 1px solid #e4eaf3;
          border-radius: 14px;
        }

        .ny-ops-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1050px;
          font-size: 12px;
        }

        .ny-ops-table th {
          padding: 15px 12px;
          text-align: left;
          background: #f6f9fd;
          color: #4f688c;
          text-transform: uppercase;
          letter-spacing: .7px;
          font-size: 10px;
          white-space: nowrap;
        }

        .ny-ops-table td {
          padding: 13px 12px;
          border-top: 1px solid #edf1f6;
          vertical-align: middle;
        }

        .ny-ops-table tbody tr:hover {
          background: #fafcff;
        }

        .ny-ops-actions {
          display: flex;
          gap: 5px;
          align-items: center;
          white-space: nowrap;
        }

        .ny-ops-status {
          display: inline-block;
          background: #eef3fa;
          color: #365c83;
          border-radius: 7px;
          padding: 5px 8px;
          font-size: 11px;
        }

        .ny-ops-good {
          background: #e7f8ee;
          color: #16734b;
        }

        .ny-ops-error {
          margin-bottom: 14px;
          padding: 12px;
          border-radius: 10px;
          background: #fff0f1;
          color: #b42335;
          border-left: 3px solid #f43f5e;
        }

        .ny-ops-footer {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          margin-top: 15px;
          font-size: 12px;
          color: #5b7292;
          flex-wrap: wrap;
        }

        .ny-ops-pager {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .ny-ops-pager select {
          border: 1px solid #d8e3f0;
          border-radius: 8px;
          padding: 8px;
          background: white;
        }

        @media (max-width: 768px) {
          .ny-ops-page { padding: 18px 12px; }
          .ny-ops-header h2 { font-size: 21px; }
        }
      `}</style>

      <div className="ny-ops-header">
        <div>
          <h2>Niyara Ops Maker</h2>
          <p>{rows.length} records available for Niyara Ops Maker</p>
        </div>

        <button
          type="button"
          className="ny-ops-btn"
          onClick={fetchLoans}
          disabled={loading || Boolean(busyLan)}
        >
          <RefreshCcw size={15} />
          Refresh
        </button>
      </div>

      <div className="ny-ops-card">
        <div className="ny-ops-toolbar">
          <h3>Niyara Ops Maker</h3>

          <div className="ny-ops-controls">
            <input
              className="ny-ops-search"
              placeholder="Search by LAN, name, mobile..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />

            <button
              type="button"
              className="ny-ops-btn ny-ops-primary"
              onClick={exportCSV}
              disabled={loading || filteredRows.length === 0}
            >
              <Download size={15} />
              Export CSV
            </button>
          </div>
        </div>

        {error && (
          <div className="ny-ops-error" role="alert">
            {error}
          </div>
        )}

        <div className="ny-ops-table-wrap">
          <table className="ny-ops-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>LAN</th>
                <th>Mobile</th>
                <th>Loan Amount</th>
                <th>Sanction eSign</th>
                <th>Agreement eSign</th>
                <th>eNACH / Bank</th>
                <th>Status</th>
                <th>Created</th>
                <th>Docs</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center" }}>
                    Loading Niyara loans...
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    style={{
                      textAlign: "center",
                      padding: 25,
                      color: "#72819a",
                    }}
                  >
                    No results.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  const review = docReviews[row.lan];
                  const busy = Boolean(busyLan);

                  return (
                    <tr key={row.lan}>
                      <td>
                        <strong>{row.customer_name || "-"}</strong>
                      </td>

                      <td>{row.lan}</td>

                      <td>{row.mobile_number || "-"}</td>

                      <td>{formatAmount(row.loan_amount)}</td>

                      <td>
                        <span
                          className={`ny-ops-status ${
                            row.sanction_esign_status === "SIGNED"
                              ? "ny-ops-good"
                              : ""
                          }`}
                        >
                          {row.sanction_esign_status || "PENDING"}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`ny-ops-status ${
                            row.agreement_esign_status === "SIGNED"
                              ? "ny-ops-good"
                              : ""
                          }`}
                        >
                          {row.agreement_esign_status || "PENDING"}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`ny-ops-status ${
                            row.bank_status === "MANDATE_CREATED"
                              ? "ny-ops-good"
                              : ""
                          }`}
                        >
                          {row.bank_status || "PENDING"}
                        </span>
                      </td>

                      <td>
                        <span className="ny-ops-status">{row.status}</span>
                      </td>

                      <td>{formatDate(row.created_at)}</td>

                      <td>
                        <button
                          type="button"
                          className="ny-ops-btn"
                          onClick={() => handleReview(row)}
                          disabled={busy}
                        >
                          <FileCheck2 size={14} />
                          {review
                            ? review.ready
                              ? "Precheck OK"
                              : "Pending"
                            : "Check"}
                        </button>
                      </td>

                      <td>
                        <div className="ny-ops-actions">
                          <button
                            type="button"
                            className="ny-ops-btn ny-ops-approve"
                            disabled={busy}
                            onClick={() => handleDecision(row, "approve")}
                          >
                            <CheckCircle2 size={14} />
                            Approve
                          </button>

                          <button
                            type="button"
                            className="ny-ops-btn ny-ops-reject"
                            disabled={busy}
                            onClick={() => handleDecision(row, "reject")}
                          >
                            <XCircle size={14} />
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="ny-ops-footer">
          <span>
            Showing{" "}
            {filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            {" - "}
            {Math.min(currentPage * pageSize, filteredRows.length)} of{" "}
            {filteredRows.length} results
          </span>

          <div className="ny-ops-pager">
            <button
              type="button"
              className="ny-ops-btn"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Prev
            </button>

            <span>
              Page {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              className="ny-ops-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>

            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
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

export default NiyaraOpsMakerScreen;
