import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";

const ClaimCureBuddyCreditApproval = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLan, setActionLan] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);

      const response = await api.get(
        "/claim-cure-buddy/credit-initiated-loans",
        {
          params: {
            page,
            pageSize,
            search,
            sortBy: "updated_at",
            sortDir: "desc",
          },
        }
      );

      setRows(response.data?.rows || []);
      setPagination(
        response.data?.pagination || {
          page,
          pageSize,
          total: 0,
          totalPages: 1,
        }
      );
    } catch (error) {
      console.error("Credit cases fetch failed:", error);
      alert(
        error?.response?.data?.message ||
          "Unable to fetch Credit approval cases"
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleDecision = async (row, decision) => {
    const label = decision === "APPROVED" ? "Approve" : "Reject";

    if (!window.confirm(`${label} ${row.lan}?`)) {
      return;
    }

    try {
      setActionLan(row.lan);

      await api.post(
        `/claim-cure-buddy/credit-approval/${encodeURIComponent(row.lan)}`,
        {
          decision,
        }
      );

      await fetchCases();
    } catch (error) {
      console.error("Credit decision failed:", error);
      alert(
        error?.response?.data?.message ||
          "Unable to update Credit decision"
      );
    } finally {
      setActionLan("");
    }
  };

  const exportCsv = () => {
    if (!rows.length) {
      alert("No records to export");
      return;
    }

    const headers = [
      "Customer Name",
      "LAN",
      "Partner Loan ID",
      "Mobile",
      "Loan Amount",
      "CIBIL",
      "BRE",
      "Bank",
      "Status",
      "Stage",
    ];

    const csvRows = rows.map((row) => [
      row.customer_name || "",
      row.lan || "",
      row.partner_loan_id || "",
      row.mobile_number || "",
      row.loan_amount || "",
      row.borrower_bureau_score || "",
      row.bre_status || "",
      row.bank_verification_status || "",
      row.status || "",
      row.stage || "",
    ]);

    const escape = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csv = [
      headers.map(escape).join(","),
      ...csvRows.map((row) => row.map(escape).join(",")),
    ].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "claim-cure-buddy-credit-approval.csv";
    anchor.click();

    URL.revokeObjectURL(url);
  };

  const money = (value) => {
    if (value === null || value === undefined || value === "") {
      return "—";
    }

    const amount = Number(value);

    if (Number.isNaN(amount)) {
      return value;
    }

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const statusClass = (value) => {
    const status = String(value || "").toUpperCase();

    if (
      status.includes("APPROVED") ||
      status.includes("VERIFIED")
    ) {
      return "ccb-credit-pill success";
    }

    if (
      status.includes("REJECTED") ||
      status.includes("FAILED")
    ) {
      return "ccb-credit-pill danger";
    }

    return "ccb-credit-pill pending";
  };

  return (
    <div className="ccb-credit-page">
      <div className="ccb-credit-card">
        <div className="ccb-credit-header">
          <div>
            <h1>Claim Cure Buddy Credit Approval</h1>
          </div>

          <div className="ccb-credit-header-actions">
            <form
              className="ccb-credit-search"
              onSubmit={handleSearch}
            >
              <input
                type="text"
                value={searchInput}
                onChange={(event) =>
                  setSearchInput(event.target.value)
                }
                placeholder="Search"
              />

              <button type="submit">Search</button>
            </form>

            <button
              type="button"
              className="ccb-credit-export"
              onClick={exportCsv}
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="ccb-credit-table-wrap">
          <table className="ccb-credit-table">
            <thead>
              <tr>
                <th>CUSTOMER NAME</th>
                <th>LAN</th>
                <th>PARTNER LOAN ID</th>
                <th>MOBILE</th>
                <th>LOAN AMOUNT</th>
                <th>CIBIL</th>
                <th>BRE</th>
                <th>BANK</th>
                <th>DOCUMENTS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" className="ccb-credit-empty">
                    Loading...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan="10" className="ccb-credit-empty">
                    No Credit initiated cases found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const busy = actionLan === row.lan;

                  return (
                    <tr key={row.id || row.lan}>
                      <td>
                        <button
                          type="button"
                          className="ccb-credit-link"
                          onClick={() =>
                            navigate(
                              `/claim-cure-buddy/customer-details?lan=${encodeURIComponent(
                                row.lan
                              )}`
                            )
                          }
                        >
                          {row.customer_name || "—"}
                        </button>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="ccb-credit-link"
                          onClick={() =>
                            navigate(
                              `/claim-cure-buddy/customer-details?lan=${encodeURIComponent(
                                row.lan
                              )}`
                            )
                          }
                        >
                          {row.lan || "—"}
                        </button>
                      </td>

                      <td>{row.partner_loan_id || "—"}</td>

                      <td>
                        <span className="ccb-credit-link-text">
                          {row.mobile_number || "—"}
                        </span>
                      </td>

                      <td>{money(row.loan_amount)}</td>

                      <td>
                        <strong>
                          {row.borrower_bureau_score ?? "—"}
                        </strong>
                      </td>

                      <td>
                        <span className={statusClass(row.stage)}>
                          {row.stage || row.bre_status || "—"}
                        </span>
                      </td>

                      <td>
                        <span
                          className={statusClass(
                            row.bank_verification_status
                          )}
                        >
                          {row.bank_verification_status || "—"}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="ccb-credit-docs"
                          onClick={() =>
                            navigate(
                              `/documents/${encodeURIComponent(
                                row.lan
                              )}`
                            )
                          }
                        >
                          📁 Docs
                        </button>
                      </td>

                      <td>
                        <div className="ccb-credit-actions">
                          <button
                            type="button"
                            className="ccb-credit-approve"
                            disabled={busy}
                            onClick={() =>
                              handleDecision(row, "APPROVED")
                            }
                          >
                            Approve
                          </button>

                          <button
                            type="button"
                            className="ccb-credit-reject"
                            disabled={busy}
                            onClick={() =>
                              handleDecision(row, "REJECTED")
                            }
                          >
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

        <div className="ccb-credit-footer">
          <div>
            Showing{" "}
            {pagination.total === 0
              ? 0
              : (page - 1) * pageSize + 1}
            {" - "}
            {Math.min(page * pageSize, pagination.total)} of{" "}
            {pagination.total} results
          </div>

          <div className="ccb-credit-pagination">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() =>
                setPage((current) =>
                  Math.max(1, current - 1)
                )
              }
            >
              Prev
            </button>

            <span>Page {page}</span>

            <button
              type="button"
              disabled={
                page >= pagination.totalPages || loading
              }
              onClick={() =>
                setPage((current) => current + 1)
              }
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
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>
        </div>
      </div>

      <style>{`
        .ccb-credit-page {
          min-height: 100vh;
          padding: 24px;
          background: #f4f6f9;
          font-family: Arial, sans-serif;
        }

        .ccb-credit-card {
          width: 100%;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
          overflow: hidden;
        }

        .ccb-credit-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 22px 24px;
          border-bottom: 1px solid #e2e8f0;
        }

        .ccb-credit-header h1 {
          margin: 0;
          color: #172554;
          font-size: 24px;
          font-weight: 700;
        }

        .ccb-credit-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .ccb-credit-search {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .ccb-credit-search input {
          width: 220px;
          height: 38px;
          padding: 0 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          outline: none;
          font-size: 13px;
        }

        .ccb-credit-search button,
        .ccb-credit-export {
          height: 38px;
          padding: 0 15px;
          border-radius: 6px;
          border: 1px solid #1e3a8a;
          background: #ffffff;
          color: #1e3a8a;
          font-weight: 700;
          cursor: pointer;
        }

        .ccb-credit-export {
          background: #172554;
          color: #ffffff;
          border-color: #172554;
        }

        .ccb-credit-table-wrap {
          width: 100%;
          overflow-x: auto;
          padding: 18px 20px 0;
          box-sizing: border-box;
        }

        .ccb-credit-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          border: 1px solid #dbe2ea;
          border-radius: 9px;
          overflow: hidden;
          min-width: 1200px;
        }

        .ccb-credit-table th {
          background: #f8fafc;
          color: #475569;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.03em;
          text-align: left;
          padding: 13px 12px;
          border-bottom: 1px solid #dbe2ea;
          white-space: nowrap;
        }

        .ccb-credit-table td {
          padding: 14px 12px;
          border-bottom: 1px solid #edf2f7;
          color: #334155;
          font-size: 13px;
          vertical-align: middle;
          white-space: nowrap;
        }

        .ccb-credit-table tbody tr:last-child td {
          border-bottom: none;
        }

        .ccb-credit-table tbody tr:hover {
          background: #fafcff;
        }

        .ccb-credit-link {
          padding: 0;
          border: none;
          background: transparent;
          color: #1d4ed8;
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }

        .ccb-credit-link-text {
          color: #1d4ed8;
          font-weight: 600;
        }

        .ccb-credit-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 25px;
          padding: 0 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
        }

        .ccb-credit-pill.success {
          background: #dcfce7;
          color: #166534;
        }

        .ccb-credit-pill.pending {
          background: #fef3c7;
          color: #92400e;
        }

        .ccb-credit-pill.danger {
          background: #fee2e2;
          color: #991b1b;
        }

        .ccb-credit-docs {
          height: 32px;
          padding: 0 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #ffffff;
          color: #334155;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .ccb-credit-actions {
          display: flex;
          gap: 7px;
        }

        .ccb-credit-approve,
        .ccb-credit-reject {
          min-width: 72px;
          height: 32px;
          border: none;
          border-radius: 5px;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .ccb-credit-approve {
          background: #16a34a;
        }

        .ccb-credit-reject {
          background: #dc2626;
        }

        .ccb-credit-approve:disabled,
        .ccb-credit-reject:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .ccb-credit-empty {
          padding: 35px !important;
          text-align: center;
          color: #64748b !important;
        }

        .ccb-credit-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 20px 20px;
          color: #64748b;
          font-size: 12px;
        }

        .ccb-credit-pagination {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .ccb-credit-pagination button,
        .ccb-credit-pagination select {
          height: 32px;
          padding: 0 10px;
          border: 1px solid #cbd5e1;
          border-radius: 5px;
          background: #ffffff;
          color: #334155;
          cursor: pointer;
        }

        .ccb-credit-pagination button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        @media (max-width: 900px) {
          .ccb-credit-page {
            padding: 12px;
          }

          .ccb-credit-header {
            align-items: stretch;
            flex-direction: column;
          }

          .ccb-credit-header-actions {
            align-items: stretch;
            flex-direction: column;
          }

          .ccb-credit-search {
            width: 100%;
          }

          .ccb-credit-search input {
            width: 100%;
          }

          .ccb-credit-footer {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default ClaimCureBuddyCreditApproval;
