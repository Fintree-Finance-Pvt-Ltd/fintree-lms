import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Download,
  Landmark,
  RefreshCw,
  Search,
  WalletCards,
} from "lucide-react";
import api from "../api/api";
import LoaderOverlay from "./ui/LoaderOverlay";
import "../styles/LoanBookingLenderSummary.css";

const PRODUCT_OPTIONS = [{ label: "EV Loan", value: "EV" }];

const EMPTY_TOTALS = {
  lenders: 0,
  loanCount: 0,
  bookedPrincipal: 0,
  emi: 0,
  principal: 0,
  totalInterest: 0,
  totalCollection: 0,
  totalCollectionPrincipal: 0,
  totalCollectionInterest: 0,
  posRemaining: 0,
  interestRemaining: 0,
  dueEmi: 0,
  duePrincipal: 0,
  dueInterest: 0,
  futureDue: 0,
  futureCollection: 0,
  futureDuePrincipal: 0,
  futureDueInterest: 0,
};

const MONEY_FIELDS = new Set([
  "bookedPrincipal",
  "emi",
  "principal",
  "totalInterest",
  "totalCollection",
  "totalCollectionPrincipal",
  "totalCollectionInterest",
  "posRemaining",
  "interestRemaining",
  "dueEmi",
  "duePrincipal",
  "dueInterest",
  "futureDue",
  "futureCollection",
  "futureDuePrincipal",
  "futureDueInterest",
]);

const TABLE_COLUMNS = [
  { key: "lender", label: "Lender", sticky: true },
  { key: "product", label: "Product" },
  { key: "loanCount", label: "Loans" },
  { key: "bookedPrincipal", label: "Booked Principal" },
  { key: "emi", label: "EMI" },
  { key: "principal", label: "Principal" },
  { key: "totalInterest", label: "Total Interest" },
  { key: "totalCollection", label: "Total Collection" },
  { key: "totalCollectionPrincipal", label: "Collection Principal" },
  { key: "totalCollectionInterest", label: "Collection Interest" },
  { key: "posRemaining", label: "POS Remaining" },
  { key: "dueEmi", label: "Due EMI" },
  { key: "duePrincipal", label: "Due Principal" },
  { key: "dueInterest", label: "Due Interest" },
  { key: "futureDue", label: "Future Due" },
  { key: "futureCollection", label: "Future Collection" },
  { key: "futureDuePrincipal", label: "Future Principal" },
  { key: "futureDueInterest", label: "Future Interest" },
  { key: "interestRemaining", label: "Interest Remaining" },
  { key: "nextDueDate", label: "Next Due Date" },
];

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

function formatCurrency(value) {
  const numberValue = Number(value || 0);
  return currencyFormatter.format(Number.isFinite(numberValue) ? numberValue : 0);
}

function formatNumber(value) {
  const numberValue = Number(value || 0);
  return numberFormatter.format(Number.isFinite(numberValue) ? numberValue : 0);
}

function formatCell(row, key) {
  if (MONEY_FIELDS.has(key)) return formatCurrency(row[key]);
  if (key === "loanCount") return formatNumber(row[key]);
  return row[key] || "-";
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function MetricTile({ icon, label, value, tone }) {
  return (
    <div className="lbs-metric" data-tone={tone}>
      <div className="lbs-metric-icon">{icon}</div>
      <div>
        <div className="lbs-metric-label">{label}</div>
        <div className="lbs-metric-value">{value}</div>
      </div>
    </div>
  );
}

const LoanBookingLenderSummary = () => {
  const [product, setProduct] = useState(PRODUCT_OPTIONS[0].value);
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState({
    product: PRODUCT_OPTIONS[0].label,
    asOf: "",
    totals: EMPTY_TOTALS,
    rows: [],
  });
  const [sort, setSort] = useState({ key: "lender", dir: "asc" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/loan-booking-summary/lender-summary", {
        params: { product },
      });

      setSummary({
        product: res.data?.product || PRODUCT_OPTIONS[0].label,
        asOf: res.data?.asOf || "",
        totals: { ...EMPTY_TOTALS, ...(res.data?.totals || {}) },
        rows: Array.isArray(res.data?.rows) ? res.data.rows : [],
      });
    } catch (err) {
      console.error("Lender summary fetch error:", err);
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Unable to load lender summary.",
      );
    } finally {
      setLoading(false);
    }
  }, [product]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return summary.rows;

    return summary.rows.filter((row) =>
      [row.lender, row.product].some((value) =>
        String(value || "").toLowerCase().includes(query),
      ),
    );
  }, [search, summary.rows]);

  const sortedRows = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;

    return [...filteredRows].sort((a, b) => {
      const aValue = a[sort.key];
      const bValue = b[sort.key];

      if (MONEY_FIELDS.has(sort.key) || sort.key === "loanCount") {
        return (Number(aValue || 0) - Number(bValue || 0)) * dir;
      }

      return String(aValue || "").localeCompare(String(bValue || "")) * dir;
    });
  }, [filteredRows, sort]);

  const metricCards = useMemo(() => {
    const totals = summary.totals || EMPTY_TOTALS;

    return [
      {
        label: "Total Collection",
        value: formatCurrency(totals.totalCollection),
        icon: <WalletCards size={20} />,
        tone: "green",
      },
      {
        label: "POS Remaining",
        value: formatCurrency(totals.posRemaining),
        icon: <Landmark size={20} />,
        tone: "amber",
      },
      {
        label: "Due EMI",
        value: formatCurrency(totals.dueEmi),
        icon: <CalendarClock size={20} />,
        tone: "red",
      },
      {
        label: "Future Collection",
        value: formatCurrency(totals.futureCollection),
        icon: <CalendarClock size={20} />,
        tone: "blue",
      },
      {
        label: "Collection Principal",
        value: formatCurrency(totals.totalCollectionPrincipal),
        icon: <WalletCards size={20} />,
        tone: "indigo",
      },
      {
        label: "Collection Interest",
        value: formatCurrency(totals.totalCollectionInterest),
        icon: <WalletCards size={20} />,
        tone: "slate",
      },
    ];
  }, [summary.totals]);

  const handleSort = (key) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

  const handleExport = () => {
    const headers = TABLE_COLUMNS.map((column) => column.label);
    const rows = sortedRows.map((row) =>
      TABLE_COLUMNS.map((column) => row[column.key] ?? ""),
    );
    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `ev_lender_summary_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(anchor.href);
  };

  return (
    <div className="loan-booking-summary">
      <LoaderOverlay show={loading} label="Loading lender summary..." />

      <div className="lbs-header">
        <div>
          <h1>Lender POS Summary</h1>
          <div className="lbs-subtitle">
            {summary.product} {summary.asOf ? `as of ${summary.asOf}` : ""}
          </div>
        </div>

        <div className="lbs-actions">
          <label className="lbs-select-label">
            Product
            <select
              value={product}
              onChange={(event) => setProduct(event.target.value)}
            >
              {PRODUCT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="lbs-icon-button" onClick={fetchSummary}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="lbs-error">
          <span>{error}</span>
          <button type="button" onClick={fetchSummary}>
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}

      <div className="lbs-metrics">
        {metricCards.map((card) => (
          <MetricTile
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value}
            tone={card.tone}
          />
        ))}
      </div>

      <section className="lbs-table-section">
        <div className="lbs-table-toolbar">
          <div className="lbs-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search lender or product"
            />
          </div>

          <div className="lbs-table-actions">
            <span>
              {formatNumber(sortedRows.length)} lender{sortedRows.length === 1 ? "" : "s"}
            </span>
            <button type="button" onClick={handleExport}>
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        <div className="lbs-table-wrap">
          <table className="lbs-table">
            <thead>
              <tr>
                {TABLE_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={column.sticky ? "is-sticky" : ""}
                  >
                    <button type="button" onClick={() => handleSort(column.key)}>
                      {column.label}
                      {sort.key === column.key && (
                        <span>{sort.dir === "asc" ? "^" : "v"}</span>
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="lbs-empty">
                    No lender summary found.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => (
                  <tr key={`${row.lender}-${row.product}`}>
                    {TABLE_COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={[
                          MONEY_FIELDS.has(column.key) ? "is-money" : "",
                          column.sticky ? "is-sticky" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {formatCell(row, column.key)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {sortedRows.length > 0 && (
              <tfoot>
                <tr>
                  {TABLE_COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      className={[
                        MONEY_FIELDS.has(column.key) ? "is-money" : "",
                        column.sticky ? "is-sticky" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {column.key === "lender"
                        ? "Total"
                        : column.key === "product"
                          ? summary.product
                          : column.key === "nextDueDate"
                            ? "-"
                            : formatCell(summary.totals, column.key)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
};

export default LoanBookingLenderSummary;
