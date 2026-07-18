// LoanDigitCollections.jsx

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";
import "../../styles/AllLoans.css"; // Apply the CSS above

const DEFAULT_PAGE_SIZE = 25;

const LoanDigitCollections = () => {
    const navigate = useNavigate();
    const abortRef = useRef(null);

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [totalRows, setTotalRows] = useState(0);

    // Search
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    // Date Filters

    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    const [appliedStartDate, setAppliedStartDate] = useState("");
    const [appliedEndDate, setAppliedEndDate] = useState("");
    const nf = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    });

    // -----------------------------
    // Debounce Search
    // -----------------------------
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 300);

        return () => clearTimeout(timer);
    }, [search]);

    // Reset page whenever filters change
    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, pageSize, appliedStartDate, appliedEndDate]);

    // -----------------------------
    // Fetch Collections
    // -----------------------------
    const fetchCollections = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
        }

        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setErr("");

        api
            .get("/loan-digit/collections", {
                params: {
                    page,
                    pageSize,
                    search: debouncedSearch || undefined,
                    startDate: appliedStartDate || undefined,
                    endDate: appliedEndDate || undefined,
                },
                signal: controller.signal,
            })
            .then((res) => {
                const data = res.data;

                if (Array.isArray(data.rows)) {
                    setRows(data.rows);
                    setTotalRows(data.pagination?.total ?? data.rows.length);
                } else if (Array.isArray(data.data)) {
                    setRows(data.data);
                    setTotalRows(data.count ?? data.data.length);
                } else {
                    setRows([]);
                    setTotalRows(0);
                }
            })
            .catch((err) => {
                if (err?.code === "ERR_CANCELED") return;

                console.error(err);

                setErr("Failed to fetch collection data.");
            })
            .finally(() => {
                setLoading(false);
            });
    }, [
        page,
        pageSize,
        debouncedSearch,
        appliedStartDate,
        appliedEndDate,
    ]);

    useEffect(() => {
        fetchCollections();
    }, [fetchCollections]);

    // -----------------------------
    // Apply Date Filter
    // -----------------------------
    const handleApplyFilter = () => {
        if (!startDate || !endDate) {
            alert("Please select both Start Date and End Date");
            return;
        }

        if (startDate > endDate) {
            alert("Start Date cannot be greater than End Date");
            return;
        }

        setAppliedStartDate(startDate);
        setAppliedEndDate(endDate);
    };
    //Reset Date Filter
    const handleResetFilter = () => {
        setStartDate("");
        setEndDate("");
        setAppliedStartDate("");
        setAppliedEndDate("");
    };

    // -----------------------------
    // Table Columns
    // -----------------------------
    const columns = [
        {
            key: "customer_name",
            header: "Customer Name",
            sortable: true,
            width: 230,
            render: (row) => row.customer_name || "—",
            sortAccessor: (row) =>
                (row.customer_name || "").toLowerCase(),
        },

        {
            key: "lan",
            header: "LAN",
            sortable: true,
            width: 170,

            render: (row) => (
                <span
                    className="lan-code-badge"
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                        navigate(`/loan-digit/customer-details?lan=${row.lan}`)
                    }
                >
                    {row.lan}
                </span>
            ),

            sortAccessor: (row) =>
                (row.lan || "").toLowerCase(),
        },

        {
            key: "utr",
            header: "UTR",
            sortable: true,
            width: 220,

            render: (row) => row.utr || "—",

            sortAccessor: (row) =>
                (row.utr || "").toLowerCase(),
        },

        {
            key: "transfer_amount",
            header: "Transfer Amount",
            sortable: true,
            width: 180,

            render: (row) => (
                <span className="amount-text-bold">
                    {Number.isFinite(Number(row.transfer_amount))
                        ? nf.format(Number(row.transfer_amount))
                        : "—"}
                </span>
            ),

            csvAccessor: (row) => row.transfer_amount ?? "",

            sortAccessor: (row) =>
                Number(row.transfer_amount || 0),
        },

        {
            key: "bank_date",
            header: "Bank Date",
            sortable: true,
            width: 170,

            render: (row) =>
                row.bank_date
                    ? new Date(row.bank_date).toLocaleDateString("en-GB")
                    : "—",

            csvAccessor: (row) => row.bank_date ?? "",

            sortAccessor: (row) =>
                row.bank_date
                    ? new Date(row.bank_date).getTime()
                    : 0,
        },
    ];
    return (
        <div className="all-loans-page-wrapper">
            <LoaderOverlay show={loading} label="Fetching Collections..." />

            {err && <div className="error-notice">{err}</div>}

            <div className="all-loans-table-container">
                <DataTable
                    title="Loan Digit Collections"
                    rows={rows}
                    columns={columns}
                    globalSearchKeys={[]}
                    exportFileName="loan_digit_collections"
                    initialSort={{
                        key: "bank_date",
                        dir: "desc",
                    }}
                    initialPageSize={pageSize}
                    pageSizeOptions={[10, 25, 50, 100]}
                    serverPagination={true}
                    totalRows={totalRows}
                    currentPage={page}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => setPageSize(size)}
                    renderTopRight={
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                flexWrap: "wrap",
                            }}
                        >
                            {/* From Date */}
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <label
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: "#334155",
                                    }}
                                >
                                    From
                                </label>

                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="search-input-modern"
                                    style={{ width: 160 }}
                                />
                            </div>

                            {/* To Date */}
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <label
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: "#334155",
                                    }}
                                >
                                    To
                                </label>

                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="search-input-modern"
                                    style={{ width: 160 }}
                                />
                            </div>

                            {/* Apply Button */}
                            <button
                                onClick={handleApplyFilter}
                                style={{
                                    height: 40,
                                    padding: "0 18px",
                                    border: "none",
                                    borderRadius: 8,
                                    background: "#2563eb",
                                    color: "#fff",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                    fontSize: 13,
                                }}
                            >
                                Apply
                            </button>

                            <button
                                onClick={handleResetFilter}
                                style={{
                                    height: 40,
                                    padding: "0 18px",
                                    border: "1px solid #d1d5db",
                                    borderRadius: 8,
                                    background: "#fff",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                    fontSize: 13,
                                }}
                            >
                                Reset
                            </button>

                            {/* Search */}
                            <input
                                className="search-input-modern"
                                placeholder="Search Customer Name, LAN..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ width: 240 }}
                            />

                            {/* Record Count */}
                            <span className="record-count-badge">
                                {totalRows.toLocaleString()} Records
                            </span>
                        </div>
                    }
                />
            </div>
        </div>
    );
};

export default LoanDigitCollections;

