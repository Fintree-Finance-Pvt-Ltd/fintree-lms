// components/SterlionMexonDexon/SterlionMexonDexonAllInvoices.jsx

import React, { useState } from "react";

import api from "../../api/api";

const ALL_LOANS_ENDPOINT = "/sterlion-mexon-dexon/all-loans";

const getInvoiceEndpoint = (lan) =>
  `/sterlion-mexon-dexon/sterlion-mexon-dexon/${encodeURIComponent(
    lan,
  )}/invoices`;

const STYLES = `
.smd-invoice-page {
  --smd-ink: #101828;
  --smd-ink-soft: #475467;
  --smd-ink-faint: #98a2b3;
  --smd-border: #e4e7ec;
  --smd-surface: #ffffff;
  --smd-canvas: #f8f9fb;
  --smd-primary: #1d4ed8;
  --smd-primary-dark: #1e3a8a;
  --smd-primary-soft: #eff4ff;
  --smd-success: #027a48;
  --smd-success-bg: #ecfdf3;
  --smd-success-border: #abefc6;
  --smd-warning: #b54708;
  --smd-warning-bg: #fffaeb;
  --smd-warning-border: #fedf89;
  --smd-danger: #b42318;
  --smd-danger-bg: #fef3f2;
  --smd-danger-border: #fecdca;
  --smd-neutral-bg: #f2f4f7;
  --smd-neutral-text: #344054;
  --smd-radius: 10px;
  --smd-radius-sm: 6px;
  --smd-shadow: 0 1px 2px rgba(16, 24, 40, 0.05);

  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 24px 64px;
  color: var(--smd-ink);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  background: var(--smd-canvas);
}

.smd-invoice-page * {
  box-sizing: border-box;
}

.smd-invoice-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--smd-border);
}

.smd-invoice-page-header h2 {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--smd-ink);
}

.smd-invoice-page-header p {
  margin: 0;
  max-width: 700px;
  color: var(--smd-ink-soft);
  font-size: 13.5px;
}

.smd-invoice-card {
  background: var(--smd-surface);
  border: 1px solid var(--smd-border);
  border-radius: var(--smd-radius);
  box-shadow: var(--smd-shadow);
  padding: 22px 24px;
  margin-bottom: 20px;
}

.smd-invoice-card h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 650;
  color: var(--smd-ink);
}

.smd-invoice-tabs {
  display: flex;
  gap: 24px;
  margin: -4px 0 20px;
  border-bottom: 1px solid var(--smd-border);
}

.smd-invoice-tab {
  appearance: none;
  padding: 10px 2px 11px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--smd-ink-soft);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.smd-invoice-tab:hover {
  color: var(--smd-ink);
}

.smd-invoice-tab.is-active {
  border-bottom-color: var(--smd-primary);
  color: var(--smd-primary-dark);
}

.smd-invoice-empty-state {
  padding: 28px 16px;
  text-align: center;
  color: var(--smd-ink-soft);
  background: var(--smd-canvas);
  border: 1px dashed var(--smd-border);
  border-radius: var(--smd-radius-sm);
}

.smd-invoice-info-box {
  background: var(--smd-canvas);
  border: 1px solid var(--smd-border);
  border-left: 3px solid var(--smd-primary);
  border-radius: var(--smd-radius-sm);
  padding: 14px 16px;
  margin-bottom: 18px;
}

.smd-invoice-info-box strong {
  display: block;
  margin-bottom: 4px;
  color: var(--smd-ink);
  font-size: 13px;
  font-weight: 650;
}

.smd-invoice-info-box p {
  margin: 0;
  color: var(--smd-ink-soft);
  font-size: 13px;
}

.smd-invoice-search-form {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(260px, 1fr) auto;
  align-items: end;
  gap: 14px;
}

.smd-invoice-field label {
  display: block;
  margin-bottom: 8px;
  color: var(--smd-ink);
  font-size: 13px;
  font-weight: 600;
}

.smd-invoice-field input {
  width: 100%;
  min-height: 42px;
  padding: 9px 12px;
  border: 1px solid #c7d0dc;
  border-radius: var(--smd-radius-sm);
  background: var(--smd-surface);
  color: var(--smd-ink);
  font: inherit;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.smd-invoice-field input:focus {
  border-color: var(--smd-primary);
  box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.12);
}

.smd-invoice-field input::placeholder {
  color: var(--smd-ink-faint);
}

.smd-invoice-action-row {
  display: flex;
  gap: 10px;
}

.smd-invoice-primary-button,
.smd-invoice-secondary-button {
  min-height: 42px;
  padding: 9px 18px;
  border: 1px solid transparent;
  border-radius: var(--smd-radius-sm);
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.05s ease;
}

.smd-invoice-primary-button {
  background: var(--smd-primary);
  border-color: var(--smd-primary);
  color: #ffffff;
}

.smd-invoice-primary-button:hover:not(:disabled) {
  background: var(--smd-primary-dark);
  border-color: var(--smd-primary-dark);
}

.smd-invoice-primary-button:active:not(:disabled),
.smd-invoice-secondary-button:active:not(:disabled) {
  transform: translateY(1px);
}

.smd-invoice-secondary-button {
  background: var(--smd-surface);
  border-color: var(--smd-border);
  color: var(--smd-ink);
}

.smd-invoice-secondary-button:hover:not(:disabled) {
  background: var(--smd-canvas);
  border-color: #c7d0dc;
}

.smd-invoice-primary-button:disabled,
.smd-invoice-secondary-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.smd-invoice-message {
  border: 1px solid transparent;
  border-radius: var(--smd-radius-sm);
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: 13.5px;
  font-weight: 500;
}

.smd-invoice-message-error {
  background: var(--smd-danger-bg);
  border-color: var(--smd-danger-border);
  color: var(--smd-danger);
}

.smd-invoice-message-loading {
  background: var(--smd-primary-soft);
  border-color: #d1e0ff;
  color: var(--smd-primary-dark);
}

.smd-invoice-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.smd-invoice-summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--smd-border);
  border-radius: var(--smd-radius-sm);
  background: var(--smd-canvas);
}

.smd-invoice-summary-label {
  color: var(--smd-ink-faint);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.smd-invoice-summary-value {
  overflow-wrap: anywhere;
  color: var(--smd-ink);
  font-size: 15px;
  font-weight: 650;
}

.smd-invoice-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.smd-invoice-card-header h3 {
  margin: 0;
}

.smd-invoice-count-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border: 1px solid #d1e0ff;
  border-radius: 999px;
  background: var(--smd-primary-soft);
  color: var(--smd-primary-dark);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.smd-invoice-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--smd-border);
  border-radius: var(--smd-radius-sm);
}

.smd-invoice-table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
  font-size: 12.5px;
  white-space: nowrap;
}

.smd-invoice-detail-table {
  min-width: 2600px;
}

.smd-invoice-table thead th {
  position: sticky;
  top: 0;
  padding: 10px 14px;
  border-bottom: 1px solid var(--smd-border);
  background: var(--smd-canvas);
  color: var(--smd-ink-soft);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-align: left;
  text-transform: uppercase;
}

.smd-invoice-table tbody td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--smd-border);
  color: var(--smd-ink);
}

.smd-invoice-table tbody tr:last-child td {
  border-bottom: none;
}

.smd-invoice-table tbody tr:hover {
  background: var(--smd-primary-soft);
}

.smd-invoice-mono {
  font-family: "SFMono-Regular", ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace;
  color: var(--smd-primary-dark);
  font-size: 12.5px;
}

.smd-invoice-amount {
  color: var(--smd-ink);
  font-weight: 650;
}

.smd-invoice-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 10px;
  border: 1px solid var(--smd-border);
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  text-transform: capitalize;
  white-space: nowrap;
}

.smd-invoice-status-active {
  background: var(--smd-primary-soft);
  border-color: #d1e0ff;
  color: var(--smd-primary-dark);
}

.smd-invoice-status-paid {
  background: var(--smd-success-bg);
  border-color: var(--smd-success-border);
  color: var(--smd-success);
}

.smd-invoice-status-overdue {
  background: var(--smd-danger-bg);
  border-color: var(--smd-danger-border);
  color: var(--smd-danger);
}

.smd-invoice-status-cancelled {
  background: var(--smd-neutral-bg);
  border-color: var(--smd-border);
  color: var(--smd-neutral-text);
}

.smd-invoice-status-default {
  background: var(--smd-warning-bg);
  border-color: var(--smd-warning-border);
  color: var(--smd-warning);
}

.smd-invoice-empty-state {
  padding: 28px 16px;
  color: var(--smd-ink-soft);
  text-align: center;
}

.smd-invoice-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.smd-invoice-export-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 6px 14px;
  border: 1px solid var(--smd-success-border);
  border-radius: var(--smd-radius-sm);
  background: var(--smd-success-bg);
  color: var(--smd-success);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.05s ease;
}

.smd-invoice-export-button:hover:not(:disabled) {
  background: #d3f4e2;
  border-color: var(--smd-success);
}

.smd-invoice-export-button:active:not(:disabled) {
  transform: translateY(1px);
}

.smd-invoice-export-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (max-width: 900px) {
  .smd-invoice-search-form {
    grid-template-columns: 1fr;
  }

  .smd-invoice-action-row {
    width: 100%;
  }

  .smd-invoice-primary-button,
  .smd-invoice-secondary-button {
    flex: 1;
  }

  .smd-invoice-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .smd-invoice-page {
    padding: 20px 16px 48px;
  }

  .smd-invoice-page-header {
    flex-direction: column;
  }

  .smd-invoice-summary-grid {
    grid-template-columns: 1fr;
  }

  .smd-invoice-action-row {
    flex-direction: column;
  }

  .smd-invoice-card-header {
    flex-wrap: wrap;
  }

  .smd-invoice-header-actions {
    width: 100%;
    justify-content: space-between;
  }
}
`;

const displayValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return value;
};

const formatAmount = (value) => {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "-";
  }

  return amount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  const dateValue = String(value).substring(0, 10);
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return dateValue;
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
};

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return String(value);
  }

  return parsedDate.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatRate = (value) => {
  const rate = Number(value);

  return Number.isFinite(rate) ? `${rate.toFixed(4)}%` : "-";
};

const formatStatus = (value) => {
  if (!value) {
    return "-";
  }

  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getStatusClass = (status) => {
  const normalizedStatus = String(status || "")
    .trim()
    .toUpperCase();

  if (normalizedStatus === "ACTIVE") {
    return "smd-invoice-status-active";
  }

  if (normalizedStatus === "PAID") {
    return "smd-invoice-status-paid";
  }

  if (normalizedStatus === "OVERDUE") {
    return "smd-invoice-status-overdue";
  }

  if (normalizedStatus === "CANCELLED") {
    return "smd-invoice-status-cancelled";
  }

  return "smd-invoice-status-default";
};

const normalizeSearchText = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const getCustomerName = (loan) => {
  const storedCustomerName = String(loan?.customer_name || "")
    .trim()
    .replace(/\s+/g, " ");

  if (storedCustomerName) {
    return storedCustomerName;
  }

  const combinedName = [loan?.first_name, loan?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim()
    .replace(/\s+/g, " ");

  return combinedName || "-";
};

const CSV_BOM = "﻿";

const CSV_INVOICE_HEADERS = [
  "LAN",
  "Customer Name",
  "Product",
  "Lender",
  "Invoice Number",
  "Invoice Amount",
  "Disbursement Amount",
  "Annual Interest Rate",
  "Tenure Months",
  "Day Count Basis",
  "Disbursement Date",
  "Disbursement UTR",
  "Maturity Date",
  "Contractual Upfront Interest",
  "Opening Carry Forward Pool",
  "Carry Forward Applied",
  "New Upfront Interest Charged",
  "Net Disbursement Amount",
  "Principal Allocated",
  "Outstanding Principal",
  "Exact Interest Accrued",
  "Posted Interest Accrued",
  "Current DPD",
  "Status",
  "Created At",
  "Updated At",
];

const isBlankCsvValue = (value) => {
  if (value === null || value === undefined) {
    return true;
  }

  const text = String(value).trim();

  return (
    text === "" ||
    text.toLowerCase() === "null" ||
    text.toLowerCase() === "undefined"
  );
};

// Excel's CSV importer auto-converts plain numeric-looking cells (dropping
// leading zeros / using scientific notation for long digit strings). The
// ="value" formula form forces Excel to render the identifier as literal text.
const csvIdentifierValue = (value) => {
  if (isBlankCsvValue(value)) {
    return "";
  }

  return `="${String(value).trim().replace(/"/g, '""')}"`;
};

const csvTextValue = (value) => (isBlankCsvValue(value) ? "" : String(value).trim());

const csvStatusValue = (value) =>
  isBlankCsvValue(value) ? "" : formatStatus(value);

const csvNumericValue = (value) => {
  if (isBlankCsvValue(value)) {
    return "";
  }

  const amount = Number(value);

  return Number.isFinite(amount) ? String(amount) : "";
};

const csvRateValue = (value) => {
  if (isBlankCsvValue(value)) {
    return "";
  }

  const rate = Number(value);

  return Number.isFinite(rate) ? rate.toFixed(4) : "";
};

const csvDateValue = (value) => (isBlankCsvValue(value) ? "" : formatDate(value));

const csvDateTimeValue = (value) =>
  isBlankCsvValue(value) ? "" : formatDateTime(value);

const escapeCsvField = (value) => {
  const text = value === null || value === undefined ? "" : String(value);

  return `"${text.replace(/"/g, '""')}"`;
};

const buildInvoiceCsvRow = (loan, invoice) => [
  csvIdentifierValue(loan?.lan),
  csvTextValue(getCustomerName(loan)),
  csvTextValue(loan?.product),
  csvTextValue(loan?.lender),
  csvIdentifierValue(invoice?.invoice_number),
  csvNumericValue(invoice?.invoice_amount),
  csvNumericValue(invoice?.disbursement_amount),
  csvRateValue(invoice?.annual_interest_rate),
  csvNumericValue(invoice?.tenure_months),
  csvTextValue(invoice?.day_count_basis),
  csvDateValue(invoice?.disbursement_date),
  csvIdentifierValue(invoice?.disbursement_utr),
  csvDateValue(invoice?.maturity_date),
  csvNumericValue(invoice?.contractual_upfront_interest),
  csvNumericValue(invoice?.opening_carry_forward_pool),
  csvNumericValue(invoice?.carry_forward_applied),
  csvNumericValue(invoice?.new_upfront_interest_charged),
  csvNumericValue(invoice?.net_disbursement_amount),
  csvNumericValue(invoice?.principal_allocated),
  csvNumericValue(invoice?.outstanding_principal),
  csvNumericValue(invoice?.exact_interest_accrued),
  csvNumericValue(invoice?.posted_interest_accrued),
  csvNumericValue(invoice?.current_dpd ?? 0),
  csvStatusValue(invoice?.status),
  csvDateTimeValue(invoice?.created_at),
  csvDateTimeValue(invoice?.updated_at),
];

const extractLoanRows = (responseData) => {
  if (Array.isArray(responseData?.rows)) {
    return responseData.rows;
  }

  if (Array.isArray(responseData?.data?.rows)) {
    return responseData.data.rows;
  }

  if (Array.isArray(responseData?.data)) {
    return responseData.data;
  }

  if (Array.isArray(responseData)) {
    return responseData;
  }

  return [];
};

const SterlionMexonDexonAllInvoices = () => {
  const [lan, setLan] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [matchingLoans, setMatchingLoans] = useState([]);
  const [invoiceResponse, setInvoiceResponse] = useState(null);
  const [activeDetailTab, setActiveDetailTab] = useState("invoices");

  const resetResults = () => {
    setErrorMessage("");
    setMatchingLoans([]);
    setInvoiceResponse(null);
    setActiveDetailTab("invoices");
  };

  const fetchInvoiceByLan = async (
    selectedLan,
    expectedCustomerName = "",
  ) => {
    const normalizedLan = String(selectedLan || "")
      .trim()
      .toUpperCase();

    if (!normalizedLan) {
      setErrorMessage("LAN is required.");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setMatchingLoans([]);
    setInvoiceResponse(null);

    try {
      const response = await api.get(getInvoiceEndpoint(normalizedLan));
      const responseData = response?.data;

      if (!responseData?.success) {
        throw new Error(
          responseData?.message || "Unable to fetch invoice details.",
        );
      }

      const loan = responseData?.loan || null;
      const invoices = Array.isArray(responseData?.invoices)
        ? responseData.invoices
        : [];

      if (expectedCustomerName) {
        const actualCustomerName = normalizeSearchText(
          getCustomerName(loan),
        );
        const searchedCustomerName = normalizeSearchText(
          expectedCustomerName,
        );

        if (!actualCustomerName.includes(searchedCustomerName)) {
          setErrorMessage("Entered LAN and customer name do not match.");
          return;
        }
      }

      if (invoices.length === 0) {
        setErrorMessage(`No invoice found for LAN ${normalizedLan}.`);
        return;
      }

      setInvoiceResponse({
        ...responseData,
        loan: {
          ...loan,
          customer_name: getCustomerName(loan),
        },
        invoices,
      });
      setActiveDetailTab("invoices");
    } catch (error) {
      console.error(
        "Failed to fetch Sterlion/Mexon/Dexon invoice:",
        error,
      );

      setErrorMessage(
        error?.response?.data?.error?.message ??
          error?.response?.data?.message ??
          error?.message ??
          "Failed to fetch invoice details.",
      );
    } finally {
      setLoading(false);
    }
  };

  const searchByCustomerName = async (searchedCustomerName) => {
    setLoading(true);
    setErrorMessage("");
    setMatchingLoans([]);
    setInvoiceResponse(null);

    try {
      const response = await api.get(ALL_LOANS_ENDPOINT);
      const loans = extractLoanRows(response?.data);
      const normalizedCustomerName = normalizeSearchText(
        searchedCustomerName,
      );

      const matches = loans
        .filter((loan) => {
          const fullName = normalizeSearchText(getCustomerName(loan));

          return fullName.includes(normalizedCustomerName);
        })
        .filter((loan) => Boolean(loan?.lan))
        .map((loan) => ({
          ...loan,
          customer_name: getCustomerName(loan),
        }));

      if (matches.length === 0) {
        setErrorMessage(
          `No customer found with name "${searchedCustomerName}".`,
        );
        return;
      }

      if (matches.length === 1) {
        await fetchInvoiceByLan(matches[0].lan, searchedCustomerName);
        return;
      }

      setMatchingLoans(matches);
    } catch (error) {
      console.error(
        "Failed to search Sterlion/Mexon/Dexon customer invoices:",
        error,
      );

      setErrorMessage(
        error?.response?.data?.error?.message ??
          error?.response?.data?.message ??
          "Failed to search customer invoices.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (event) => {
    event.preventDefault();

    const normalizedLan = String(lan || "")
      .trim()
      .toUpperCase();
    const normalizedCustomerName = String(customerName || "")
      .trim()
      .replace(/\s+/g, " ");

    resetResults();

    if (!normalizedLan && !normalizedCustomerName) {
      setErrorMessage("Enter LAN or customer name.");
      return;
    }

    if (normalizedLan) {
      await fetchInvoiceByLan(normalizedLan, normalizedCustomerName);
      return;
    }

    await searchByCustomerName(normalizedCustomerName);
  };

  const handleClear = () => {
    setLan("");
    setCustomerName("");
    resetResults();
  };

  const loan = invoiceResponse?.loan || null;
  const invoices = Array.isArray(invoiceResponse?.invoices)
    ? invoiceResponse.invoices
    : [];
  const collections = Array.isArray(invoiceResponse?.collections)
    ? invoiceResponse.collections
    : [];

  const handleExportCsv = () => {
    if (!invoiceResponse || !loan || invoices.length === 0) {
      return;
    }

    const csvRows = invoices.map((invoice) =>
      buildInvoiceCsvRow(loan, invoice),
    );

    const csvLines = [CSV_INVOICE_HEADERS, ...csvRows].map((row) =>
      row.map(escapeCsvField).join(","),
    );

    const csvContent = CSV_BOM + csvLines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(blob);

    const fileDate = new Date().toISOString().slice(0, 10);
    const safeLan =
      String(loan.lan || "UNKNOWN")
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "_") || "UNKNOWN";

    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = `invoices_${safeLan}_${fileDate}.csv`;

    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="smd-invoice-page">
      <style>{STYLES}</style>

      <div className="smd-invoice-page-header">
        <div>
          <h2>Sterlion / Mexon / Dexon All Invoices</h2>
          <p>
            Search invoice details using an exact LAN or customer name. When a
            name matches multiple loans, select the required LAN from the list.
          </p>
        </div>
      </div>

      <div className="smd-invoice-card">
        <h3>Search Invoice</h3>

        <div className="smd-invoice-info-box">
          <strong>Search instructions</strong>
          <p>
            Enter LAN for a direct invoice lookup, or enter customer name to
            find matching loans. You may also enter both values to validate the
            LAN against the customer name.
          </p>
        </div>

        <form className="smd-invoice-search-form" onSubmit={handleSearch}>
          <div className="smd-invoice-field">
            <label htmlFor="smdInvoiceLan">LAN</label>
            <input
              id="smdInvoiceLan"
              type="search"
              value={lan}
              maxLength={100}
              autoComplete="off"
              placeholder="Enter LAN"
              disabled={loading}
              onChange={(event) =>
                setLan(event.target.value.toUpperCase())
              }
            />
          </div>

          <div className="smd-invoice-field">
            <label htmlFor="smdInvoiceCustomerName">Customer Name</label>
            <input
              id="smdInvoiceCustomerName"
              type="search"
              value={customerName}
              maxLength={255}
              autoComplete="off"
              placeholder="Enter customer name"
              disabled={loading}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </div>

          <div className="smd-invoice-action-row">
            <button
              type="submit"
              className="smd-invoice-primary-button"
              disabled={loading}
            >
              {loading ? "Searching..." : "Search"}
            </button>

            <button
              type="button"
              className="smd-invoice-secondary-button"
              disabled={loading}
              onClick={handleClear}
            >
              Clear
            </button>
          </div>
        </form>
      </div>

      {loading && (
        <div className="smd-invoice-message smd-invoice-message-loading">
          Searching invoice details. Please wait...
        </div>
      )}

      {errorMessage && (
        <div className="smd-invoice-message smd-invoice-message-error">
          {errorMessage}
        </div>
      )}

      {matchingLoans.length > 0 && (
        <div className="smd-invoice-card">
          <div className="smd-invoice-card-header">
            <h3>Matching Customers</h3>
            <span className="smd-invoice-count-pill">
              {matchingLoans.length.toLocaleString("en-IN")} Matches
            </span>
          </div>

          <div className="smd-invoice-table-wrap">
            <table className="smd-invoice-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Customer Name</th>
                  <th>LAN</th>
                  <th>Product</th>
                  <th>Lender</th>
                  <th>Loan Limit</th>
                  <th>Loan Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {matchingLoans.map((matchingLoan, index) => (
                  <tr key={matchingLoan.id || matchingLoan.lan || index}>
                    <td>{index + 1}</td>
                    <td>{getCustomerName(matchingLoan)}</td>
                    <td className="smd-invoice-mono">
                      {displayValue(matchingLoan.lan)}
                    </td>
                    <td>{displayValue(matchingLoan.product)}</td>
                    <td>{displayValue(matchingLoan.lender)}</td>
                    <td className="smd-invoice-amount">
                      {formatAmount(matchingLoan.loan_limit)}
                    </td>
                    <td>
                      <span
                        className={`smd-invoice-status-pill ${getStatusClass(
                          matchingLoan.status,
                        )}`}
                      >
                        {formatStatus(matchingLoan.status)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="smd-invoice-primary-button"
                        disabled={loading || !matchingLoan.lan}
                        onClick={() => fetchInvoiceByLan(matchingLoan.lan)}
                      >
                        View Invoice
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {invoiceResponse && loan && (
        <>
          <div className="smd-invoice-card">
            <div className="smd-invoice-card-header">
              <h3>Loan Details</h3>
              <span className="smd-invoice-count-pill">
                {invoices.length.toLocaleString("en-IN")} Invoices
              </span>
            </div>

            <div className="smd-invoice-summary-grid">
              <div className="smd-invoice-summary-item">
                <span className="smd-invoice-summary-label">
                  Customer Name
                </span>
                <span className="smd-invoice-summary-value">
                  {getCustomerName(loan)}
                </span>
              </div>

              <div className="smd-invoice-summary-item">
                <span className="smd-invoice-summary-label">LAN</span>
                <span className="smd-invoice-summary-value smd-invoice-mono">
                  {displayValue(loan.lan)}
                </span>
              </div>

              <div className="smd-invoice-summary-item">
                <span className="smd-invoice-summary-label">Product</span>
                <span className="smd-invoice-summary-value">
                  {displayValue(loan.product)}
                </span>
              </div>

              <div className="smd-invoice-summary-item">
                <span className="smd-invoice-summary-label">Lender</span>
                <span className="smd-invoice-summary-value">
                  {displayValue(loan.lender)}
                </span>
              </div>

              <div className="smd-invoice-summary-item">
                <span className="smd-invoice-summary-label">Loan Limit</span>
                <span className="smd-invoice-summary-value">
                  {formatAmount(loan.loan_limit)}
                </span>
              </div>

              <div className="smd-invoice-summary-item">
                <span className="smd-invoice-summary-label">
                  Utilized Amount
                </span>
                <span className="smd-invoice-summary-value">
                  {formatAmount(loan.utilized_amount)}
                </span>
              </div>

              <div className="smd-invoice-summary-item">
                <span className="smd-invoice-summary-label">
                  Unutilized Amount
                </span>
                <span className="smd-invoice-summary-value">
                  {formatAmount(loan.unutilized_amount)}
                </span>
              </div>

              <div className="smd-invoice-summary-item">
                <span className="smd-invoice-summary-label">Loan Status</span>
                <span className="smd-invoice-summary-value">
                  <span
                    className={`smd-invoice-status-pill ${getStatusClass(
                      loan.status,
                    )}`}
                  >
                    {formatStatus(loan.status)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="smd-invoice-card">
            <div className="smd-invoice-tabs" role="tablist" aria-label="Loan transaction details">
              <button
                type="button"
                role="tab"
                aria-selected={activeDetailTab === "invoices"}
                className={`smd-invoice-tab ${activeDetailTab === "invoices" ? "is-active" : ""}`}
                onClick={() => setActiveDetailTab("invoices")}
              >
                Invoice Details
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeDetailTab === "collections"}
                className={`smd-invoice-tab ${activeDetailTab === "collections" ? "is-active" : ""}`}
                onClick={() => setActiveDetailTab("collections")}
              >
                Collections
              </button>
            </div>

            <div className="smd-invoice-card-header">
              <h3>
                {activeDetailTab === "invoices" ? "Invoice Details" : "Collection Details"}
                {" - "}{displayValue(loan.lan)}
              </h3>
              <div className="smd-invoice-header-actions">
                <span className="smd-invoice-count-pill">
                  {(activeDetailTab === "invoices" ? invoices.length : collections.length).toLocaleString("en-IN")} Records
                </span>
                {activeDetailTab === "invoices" && invoices.length > 0 && (
                  <button
                    type="button"
                    className="smd-invoice-export-button"
                    onClick={handleExportCsv}
                  >
                    Export CSV
                  </button>
                )}
              </div>
            </div>

            {activeDetailTab === "invoices" ? (
            <div className="smd-invoice-table-wrap">
              <table className="smd-invoice-table smd-invoice-detail-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Invoice Number</th>
                    <th>Invoice Amount</th>
                    <th>Disbursement Amount</th>
                    <th>Annual Interest Rate</th>
                    <th>Tenure Months</th>
                    <th>Day Count Basis</th>
                    <th>Disbursement Date</th>
                    <th>Disbursement UTR</th>
                    <th>Maturity Date</th>
                    <th>Contractual Upfront Interest</th>
                    <th>Opening Carry Forward Pool</th>
                    <th>Carry Forward Applied</th>
                    <th>New Upfront Interest Charged</th>
                    <th>Net Disbursement Amount</th>
                    <th>Principal Allocated</th>
                    <th>Outstanding Principal</th>
                    <th>Exact Interest Accrued</th>
                    <th>Posted Interest Accrued</th>
                    <th>Current DPD</th>
                    <th>Status</th>
                    <th>Created At</th>
                    <th>Updated At</th>
                  </tr>
                </thead>

                <tbody>
                  {invoices.map((invoice, index) => (
                    <tr key={invoice.id || invoice.invoice_number || index}>
                      <td>{index + 1}</td>
                      <td className="smd-invoice-mono">
                        {displayValue(invoice.invoice_number)}
                      </td>
                      <td className="smd-invoice-amount">
                        {formatAmount(invoice.invoice_amount)}
                      </td>
                      <td>{formatAmount(invoice.disbursement_amount)}</td>
                      <td>{formatRate(invoice.annual_interest_rate)}</td>
                      <td>{displayValue(invoice.tenure_months)}</td>
                      <td>{displayValue(invoice.day_count_basis)}</td>
                      <td>{formatDate(invoice.disbursement_date)}</td>
                      <td className="smd-invoice-mono">
                        {displayValue(invoice.disbursement_utr)}
                      </td>
                      <td>{formatDate(invoice.maturity_date)}</td>
                      <td>
                        {formatAmount(invoice.contractual_upfront_interest)}
                      </td>
                      <td>
                        {formatAmount(invoice.opening_carry_forward_pool)}
                      </td>
                      <td>{formatAmount(invoice.carry_forward_applied)}</td>
                      <td>
                        {formatAmount(invoice.new_upfront_interest_charged)}
                      </td>
                      <td>{formatAmount(invoice.net_disbursement_amount)}</td>
                      <td>{formatAmount(invoice.principal_allocated)}</td>
                      <td className="smd-invoice-amount">
                        {formatAmount(invoice.outstanding_principal)}
                      </td>
                      <td>{formatAmount(invoice.exact_interest_accrued)}</td>
                      <td>{formatAmount(invoice.posted_interest_accrued)}</td>
                      <td>{Number(invoice.current_dpd || 0)}</td>
                      <td>
                        <span
                          className={`smd-invoice-status-pill ${getStatusClass(
                            invoice.status,
                          )}`}
                        >
                          {formatStatus(invoice.status)}
                        </span>
                      </td>
                      <td>{formatDateTime(invoice.created_at)}</td>
                      <td>{formatDateTime(invoice.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : collections.length > 0 ? (
              <div className="smd-invoice-table-wrap">
                <table className="smd-invoice-table smd-invoice-detail-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Collection UTR / Serial</th>
                      <th>Collection Date</th>
                      <th>Collection Amount</th>
                      <th>Settled Amount</th>
                      <th>Excess Amount</th>
                      <th>Status</th>
                      <th>Created At</th>
                      <th>Updated At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collections.map((collection, index) => (
                      <tr key={collection.id || collection.collection_utr || index}>
                        <td>{index + 1}</td>
                        <td className="smd-invoice-mono">{displayValue(collection.collection_utr)}</td>
                        <td>{formatDate(collection.collection_date)}</td>
                        <td className="smd-invoice-amount">{formatAmount(collection.collection_amount)}</td>
                        <td>{formatAmount(collection.allocated_amount)}</td>
                        <td>{formatAmount(collection.unallocated_amount)}</td>
                        <td>
                          <span className={`smd-invoice-status-pill ${getStatusClass(collection.status)}`}>
                            {formatStatus(collection.status)}
                          </span>
                        </td>
                        <td>{formatDateTime(collection.created_at)}</td>
                        <td>{formatDateTime(collection.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="smd-invoice-empty-state">
                No collections have been uploaded for this LAN.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SterlionMexonDexonAllInvoices;
