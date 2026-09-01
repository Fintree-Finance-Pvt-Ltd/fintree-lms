import { useMemo } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";
import { formatYaMoneyStatus, normalizeYaMoneyStatus } from "./yaMoneyData";
import "../../styles/YaMoney.css";

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString().slice(0, 10);
};

const formatCurrency = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "-";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(number);
};

const getDisplayName = (row) =>
  row?.customer_name || row?.business_name || row?.pan_name || "-";

const getPrimaryAmount = (row) =>
  row?.loan_amount ?? row?.approved_amount ?? row?.requested_amount;

const getNetDisbursement = (row) =>
  row?.net_disbursement ?? row?.net_disb_amt ?? row?.net_disbursement_amount;

const statusClass = (status) => {
  const normalized = normalizeYaMoneyStatus(status);

  if (["approved", "bre_approved", "credit_approved", "final_approved", "disbursed"].includes(normalized)) {
    return "ym-status-success";
  }

  if (["ops_initiate", "ops_initiated"].includes(normalized)) {
    return "ym-status-info";
  }

  if (["bre_rejected", "credit_rejected", "ops_rejected", "rejected"].includes(normalized)) {
    return "ym-status-danger";
  }

  if (["login", "pending"].includes(normalized)) {
    return "ym-status-info";
  }

  return "ym-status-neutral";
};

const buildColumns = ({ navigate, renderActions }) => {
  const columns = [
    {
      key: "customer_name",
      header: "Customer",
      sortable: true,
      render: (row) => (
        <button
          type="button"
          className="ym-customer-button"
          onClick={() => navigate(`/loan-details/${row.lan}`)}
        >
          <span>{getDisplayName(row)}</span>
          <small>{row.business_name || "Ya Money"}</small>
        </button>
      ),
      sortAccessor: (row) => getDisplayName(row).toLowerCase(),
      csvAccessor: getDisplayName,
      width: 240,
    },
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      render: (row) => <span className="ym-lan-badge">{row.lan || "-"}</span>,
      sortAccessor: (row) => String(row?.lan || "").toLowerCase(),
      width: 140,
    },
    {
      key: "partner_loan_id",
      header: "Partner ID",
      sortable: true,
      render: (row) => (
        <span className="ym-mono-text">{row.partner_loan_id || "-"}</span>
      ),
      sortAccessor: (row) => String(row?.partner_loan_id || "").toLowerCase(),
      width: 170,
    },
    {
      key: "mobile_number",
      header: "Mobile",
      sortable: true,
      render: (row) =>
        row.mobile_number ? (
          <a className="ym-phone-link" href={`tel:${row.mobile_number}`}>
            {row.mobile_number}
          </a>
        ) : (
          "-"
        ),
      width: 150,
    },
    {
      key: "requested_amount",
      header: "Requested",
      sortable: true,
      render: (row) => (
        <span className="ym-amount-text">
          {formatCurrency(row.requested_amount)}
        </span>
      ),
      sortAccessor: (row) => Number(row?.requested_amount || 0),
      csvAccessor: (row) => row.requested_amount ?? "",
      width: 150,
    },
    {
      key: "loan_amount",
      header: "Loan Amount",
      sortable: true,
      render: (row) => (
        <span className="ym-amount-text">
          {formatCurrency(getPrimaryAmount(row))}
        </span>
      ),
      sortAccessor: (row) => Number(getPrimaryAmount(row) || 0),
      csvAccessor: (row) => getPrimaryAmount(row) ?? "",
      width: 150,
    },
    {
      key: "net_disbursement",
      header: "Net Disb.",
      sortable: true,
      render: (row) => (
        <span className="ym-amount-text">
          {formatCurrency(getNetDisbursement(row))}
        </span>
      ),
      sortAccessor: (row) => Number(getNetDisbursement(row) || 0),
      csvAccessor: (row) => getNetDisbursement(row) ?? "",
      width: 140,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      filterable: true,
      render: (row) => (
        <span className={`ym-status-pill ${statusClass(row.status)}`}>
          {formatYaMoneyStatus(row.status)}
        </span>
      ),
      sortAccessor: (row) => normalizeYaMoneyStatus(row?.status),
      csvAccessor: (row) => row.status || "",
      width: 160,
    },
    {
      key: "updated_at",
      header: "Updated",
      sortable: true,
      render: (row) => formatDate(row.updated_at || row.created_at || row.login_date),
      sortAccessor: (row) =>
        Date.parse(row?.updated_at || row?.created_at || row?.login_date || "") || 0,
      width: 130,
    },
    {
      key: "documents",
      header: "Docs",
      render: (row) => (
        <button
          type="button"
          className="ym-action-button ym-action-muted"
          onClick={() => navigate(`/documents/${row.lan}`)}
          title="Open documents"
        >
          <FileText size={16} />
          Docs
        </button>
      ),
      csvAccessor: () => "",
      width: 120,
    },
  ];

  if (renderActions) {
    columns.push({
      key: "actions",
      header: "Actions",
      render: (row) => <div className="ym-actions">{renderActions(row)}</div>,
      csvAccessor: () => "",
      width: 260,
    });
  }

  return columns;
};

const YaMoneyTable = ({
  title,
  rows,
  loading,
  error,
  totalRows,
  onRefresh,
  renderActions,
  exportFileName,
}) => {
  const navigate = useNavigate();
  const columns = useMemo(
    () => buildColumns({ navigate, renderActions }),
    [navigate, renderActions],
  );

  return (
    <section className="ym-page">
      <LoaderOverlay show={loading} label="Loading Ya Money loans..." />

      <div className="ym-page-header">
        <div>
          <h1>{title}</h1>
          <p>
            {rows.length.toLocaleString()} shown from {totalRows.toLocaleString()} Ya Money records
          </p>
        </div>

        <button
          type="button"
          className="ym-refresh-button"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && <div className="ym-error">{error}</div>}

      <DataTable
        title={title}
        rows={rows}
        columns={columns}
        globalSearchKeys={[
          "customer_name",
          "business_name",
          "partner_loan_id",
          "lan",
          "mobile_number",
          "status",
        ]}
        initialSort={{ key: "updated_at", dir: "desc" }}
        initialPageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
        exportFileName={exportFileName}
      />
    </section>
  );
};

export default YaMoneyTable;
