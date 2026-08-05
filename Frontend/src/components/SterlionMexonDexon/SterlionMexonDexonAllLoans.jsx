// components/SterlionMexonDexon/SterlionMexonDexonAllLoans.jsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";
import "../../styles/AllLoans.css";

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_API_ENDPOINT = "/sterlion-mexon-dexon/all-loans";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const displayValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return value;
};

const getCustomerName = (row) => {
  if (row?.customer_name) {
    return row.customer_name;
  }

  const fullName = [row?.first_name, row?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || "—";
};

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const amount = Number(value);

  return Number.isFinite(amount) ? currencyFormatter.format(amount) : "—";
};

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const maskSensitiveValue = (value, visibleDigits = 4) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const text = String(value).trim();

  if (text.length <= visibleDigits) {
    return text;
  }

  return `${"X".repeat(
    text.length - visibleDigits,
  )}${text.slice(-visibleDigits)}`;
};

const createTextColumn = (key, header, width = 170) => ({
  key,
  header,
  sortable: true,
  render: (row) => displayValue(row?.[key]),
  sortAccessor: (row) => String(row?.[key] ?? "").toLowerCase(),
  csvAccessor: (row) => row?.[key] ?? "",
  width,
});

const createAddressColumn = (key, header) => ({
  key,
  header,
  sortable: true,
  render: (row) => {
    const value = row?.[key];

    if (!value) {
      return "—";
    }

    return (
      <span
        title={value}
        style={{
          display: "inline-block",
          maxWidth: "280px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          verticalAlign: "middle",
        }}
      >
        {value}
      </span>
    );
  },
  sortAccessor: (row) => String(row?.[key] ?? "").toLowerCase(),
  csvAccessor: (row) => row?.[key] ?? "",
  width: 300,
});

const getStatusStyle = (status) => {
  const normalizedStatus = String(status ?? "")
    .trim()
    .toLowerCase();

  const styles = {
    approved: {
      background: "rgba(16, 185, 129, 0.12)",
      border: "rgba(16, 185, 129, 0.35)",
      color: "#065f46",
    },

    disbursed: {
      background: "rgba(16, 185, 129, 0.12)",
      border: "rgba(16, 185, 129, 0.35)",
      color: "#065f46",
    },

    active: {
      background: "rgba(59, 130, 246, 0.12)",
      border: "rgba(59, 130, 246, 0.35)",
      color: "#1e3a8a",
    },

    pending: {
      background: "rgba(234, 179, 8, 0.12)",
      border: "rgba(234, 179, 8, 0.35)",
      color: "#713f12",
    },

    initiated: {
      background: "rgba(234, 179, 8, 0.12)",
      border: "rgba(234, 179, 8, 0.35)",
      color: "#713f12",
    },

    rejected: {
      background: "rgba(239, 68, 68, 0.12)",
      border: "rgba(239, 68, 68, 0.35)",
      color: "#7f1d1d",
    },

    failed: {
      background: "rgba(239, 68, 68, 0.12)",
      border: "rgba(239, 68, 68, 0.35)",
      color: "#7f1d1d",
    },

    cancelled: {
      background: "rgba(239, 68, 68, 0.12)",
      border: "rgba(239, 68, 68, 0.35)",
      color: "#7f1d1d",
    },

    "fully paid": {
      background: "rgba(59, 130, 246, 0.12)",
      border: "rgba(59, 130, 246, 0.35)",
      color: "#1e3a8a",
    },

    foreclosed: {
      background: "rgba(99, 102, 241, 0.12)",
      border: "rgba(99, 102, 241, 0.35)",
      color: "#3730a3",
    },

    settled: {
      background: "rgba(59, 130, 246, 0.12)",
      border: "rgba(59, 130, 246, 0.35)",
      color: "#1e3a8a",
    },

    closed: {
      background: "rgba(107, 114, 128, 0.12)",
      border: "rgba(107, 114, 128, 0.35)",
      color: "#374151",
    },
  };

  return (
    styles[normalizedStatus] ?? {
      background: "rgba(107, 114, 128, 0.12)",
      border: "rgba(107, 114, 128, 0.35)",
      color: "#374151",
    }
  );
};

const SterlionMexonDexonAllLoans = ({
  apiEndpoint = DEFAULT_API_ENDPOINT,
  title = "Sterlion Mexon Dexon - All Loans",
}) => {
  const navigate = useNavigate();
  const abortControllerRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalRows, setTotalRows] = useState(0);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

  const fetchLoans = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setErrorMessage("");

    try {
      const response = await api.get(apiEndpoint, {
        params: {
          page,
          pageSize,
          search: debouncedSearch || undefined,
        },
        signal: controller.signal,
      });

      const responseData = response?.data;

      let fetchedRows = [];
      let fetchedTotal = 0;

      if (Array.isArray(responseData?.rows)) {
        fetchedRows = responseData.rows;

        fetchedTotal = Number(
          responseData.pagination?.total ??
            responseData.total ??
            responseData.rows.length,
        );
      } else if (Array.isArray(responseData?.data?.rows)) {
        fetchedRows = responseData.data.rows;

        fetchedTotal = Number(
          responseData.data.pagination?.total ??
            responseData.pagination?.total ??
            responseData.data.total ??
            responseData.total ??
            responseData.data.rows.length,
        );
      } else if (Array.isArray(responseData?.data)) {
        fetchedRows = responseData.data;

        fetchedTotal = Number(
          responseData.pagination?.total ??
            responseData.total ??
            responseData.data.length,
        );
      } else if (Array.isArray(responseData)) {
        fetchedRows = responseData;
        fetchedTotal = responseData.length;
      }

      setRows(fetchedRows);

      setTotalRows(
        Number.isFinite(fetchedTotal) ? fetchedTotal : fetchedRows.length,
      );
    } catch (error) {
      if (
        error?.code === "ERR_CANCELED" ||
        error?.name === "CanceledError" ||
        error?.name === "AbortError"
      ) {
        return;
      }

      console.error("Failed to fetch Sterlion Mexon Dexon loans:", error);

      setRows([]);
      setTotalRows(0);

      setErrorMessage(
        error?.response?.data?.error?.message ??
          error?.response?.data?.message ??
          "Failed to fetch Sterlion Mexon Dexon loan records.",
      );
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [apiEndpoint, page, pageSize, debouncedSearch]);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const columns = useMemo(
    () => [
      {
        key: "customer_name",
        header: "Customer Name",
        sortable: true,
        render: (row) => (
          <span
            style={{
              fontWeight: 700,
              color: "#0f172a",
            }}
          >
            {getCustomerName(row)}
          </span>
        ),
        sortAccessor: (row) => getCustomerName(row).toLowerCase(),
        csvAccessor: (row) =>
          getCustomerName(row) === "—" ? "" : getCustomerName(row),
        width: 220,
      },

      {
        key: "lan",
        header: "LAN",
        sortable: true,
        render: (row) => (
          <span className="lan-code-badge">{displayValue(row?.lan)}</span>
        ),
        sortAccessor: (row) => String(row?.lan ?? "").toLowerCase(),
        csvAccessor: (row) => row?.lan ?? "",
        width: 170,
      },
      {
        key: "lender",
        header: "Lender",
        sortable: true,
        render: (row) => (
          <span
            style={{
              fontWeight: 700,
              color: "#334155",
            }}
          >
            {displayValue(row?.lender)}
          </span>
        ),
        sortAccessor: (row) => String(row?.lender ?? "").toLowerCase(),
        csvAccessor: (row) => row?.lender ?? "",
        width: 170,
      },

      {
        key: "loan_amount",
        header: "Loan Amount",
        sortable: true,
        render: (row) => (
          <span className="amount-text-bold">
            {formatCurrency(row?.loan_amount)}
          </span>
        ),
        sortAccessor: (row) => Number(row?.loan_amount ?? 0),
        csvAccessor: (row) => row?.loan_amount ?? "",
        width: 180,
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        render: (row) => {
          const statusStyle = getStatusStyle(row?.status);

          return (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "11px",
                fontWeight: 800,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                background: statusStyle.background,
                color: statusStyle.color,
                border: `1px solid ${statusStyle.border}`,
              }}
            >
              {displayValue(row?.status)}
            </span>
          );
        },
        sortAccessor: (row) => String(row?.status ?? "").toLowerCase(),
        csvAccessor: (row) => row?.status ?? "",
        width: 145,
      },
      {
        key: "documents",
        header: "Action",
        render: (row) => (
          <button
            type="button"
            disabled={!row?.lan}
            onClick={() => {
              if (!row?.lan) return;

              navigate(`/documents/${encodeURIComponent(row.lan)}`);
            }}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              color: "#0f172a",
              background: "#ffffff",
              cursor: row?.lan ? "pointer" : "not-allowed",
              fontSize: "12px",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              opacity: row?.lan ? 1 : 0.6,
              whiteSpace: "nowrap",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
              transition: "0.2s",
            }}
            onMouseOver={(event) => {
              if (!row?.lan) return;

              event.currentTarget.style.background = "#f8fafc";
              event.currentTarget.style.borderColor = "#cbd5e1";
            }}
            onMouseOut={(event) => {
              event.currentTarget.style.background = "#ffffff";
              event.currentTarget.style.borderColor = "#e2e8f0";
            }}
          >
            <span>📂</span>
            Documents
          </button>
        ),
        csvAccessor: () => "",
        width: 145,
      },
    ],
    [navigate],
  );

  return (
    <div className="all-loans-page-wrapper">
      <LoaderOverlay
        show={loading}
        label="Loading Sterlion Mexon Dexon loans…"
      />

      {errorMessage && (
        <div className="error-notice">
          <span>{errorMessage}</span>

          <button
            type="button"
            onClick={fetchLoans}
            style={{
              marginLeft: "12px",
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #fecaca",
              background: "#ffffff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="all-loans-table-container">
        <DataTable
          title={title}
          rows={rows}
          columns={columns}
          globalSearchKeys={[]}
          initialSort={{
            key: "created_at",
            dir: "desc",
          }}
          exportFileName="sterlion_mexon_dexon_all_loans"
          initialPageSize={pageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          serverPagination
          totalRows={totalRows}
          currentPage={page}
          onPageChange={setPage}
          onPageSizeChange={(newPageSize) => {
            setPageSize(Number(newPageSize));
          }}
          renderTopRight={
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <input
                type="search"
                className="search-input-modern"
                placeholder="Search LAN, customer, mobile, PAN, product…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              <span className="record-count-badge">
                {totalRows.toLocaleString("en-IN")} Records
              </span>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default SterlionMexonDexonAllLoans;
