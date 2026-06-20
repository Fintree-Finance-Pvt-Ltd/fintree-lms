import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";

const STERLION_TABLE = "loan_booking_sterlion";
const STERLION_ACTION_API =
  "/loan-booking/login-loans?table=loan_booking_sterlion&prefix=STRL";

const SterlionActionScreen = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [creditLimitAmounts, setCreditLimitAmounts] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    let off = false;
    setLoading(true);
    setErr("");

    api
      .get(STERLION_ACTION_API)
      .then((res) => !off && setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => !off && setErr("Failed to fetch Sterlion leads."))
      .finally(() => !off && setLoading(false));

    return () => {
      off = true;
    };
  }, []);

  const formatAmount = (value) => {
    if (value === null || value === undefined || value === "") return "-";

    const amount = Number(value);
    if (!Number.isFinite(amount)) return value;

    return `Rs. ${amount.toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;
  };

  const amountSort = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
  };

  const getCreditLimitAmount = (row) => {
    if (!row?.lan) return "";

    if (creditLimitAmounts[row.lan] !== undefined) {
      return creditLimitAmounts[row.lan];
    }

    return row.loan_amount ?? "";
  };

  const handleCreditLimitChange = (lan, value) => {
    const cleanValue = String(value || "")
      .replace(/[^\d.]/g, "")
      .replace(/^(\d*\.\d{0,2}).*$/, "$1");

    setCreditLimitAmounts((prev) => ({
      ...prev,
      [lan]: cleanValue,
    }));
  };

  const handleStatusChange = async (row, newStatus) => {
    try {
      const payload = {
        status: newStatus,
        table: STERLION_TABLE,
      };

      if (newStatus === "Disburse initiate") {
        const creditLimit = Number(getCreditLimitAmount(row));

        if (!creditLimit || Number.isNaN(creditLimit) || creditLimit <= 0) {
          alert("Please enter credit team limit before proceeding.");
          return;
        }

        payload.loan_amount = creditLimit;
      }

      await api.put(`/loan-booking/login-loans/${row.lan}`, payload);

      setRows((prev) =>
        prev.map((r) =>
          r.lan === row.lan
            ? {
                ...r,
                status: newStatus,
                ...(payload.loan_amount ? { loan_amount: payload.loan_amount } : {}),
              }
            : r,
        ),
      );
    } catch (error) {
      console.error("Error updating Sterlion status:", error);
      alert("Failed to update status. Try again.");
    }
  };

  const pill = (status) => {
    const map = {
      "bre approved": {
        bg: "rgba(16,185,129,.12)",
        fg: "#065f46",
      },
      "bre rejected": {
        bg: "rgba(239,68,68,.12)",
        fg: "#7f1d1d",
      },
      "bre deviation": {
        bg: "rgba(245,158,11,.14)",
        fg: "#92400e",
      },
      pending: {
        bg: "rgba(107,114,128,.12)",
        fg: "#374151",
      },
      login: {
        bg: "rgba(59,130,246,.12)",
        fg: "#1d4ed8",
      },
    };
    const key = String(status || "pending").toLowerCase();
    const c = map[key] || map.pending;

    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "8px 12px",
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 700,
      background: c.bg,
      color: c.fg,
      border: "1px solid transparent",
      minWidth: 86,
      whiteSpace: "nowrap",
    };
  };

  const actionBtn = (type) => {
    const isApprove = type === "approve";

    return {
      minWidth: isApprove ? "170px" : "110px",
      height: "44px",
      padding: "0 16px",
      borderRadius: 8,
      border: "1px solid transparent",
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: 600,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      whiteSpace: "nowrap",
      color: isApprove ? "#047857" : "#dc2626",
      background: isApprove ? "#e8f8f0" : "#fdecec",
    };
  };

  const docsBtn = {
    minWidth: "88px",
    height: "38px",
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid #dbe5ef",
    color: "#1d4ed8",
    background: "#f8fbff",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const link = {
    color: "#2563eb",
    textDecoration: "none",
    fontWeight: 600,
    cursor: "pointer",
  };

  const columns = [
    {
      key: "customer_name",
      header: "Lead Details",
      sortable: true,
      render: (r) => (
        <span style={link} onClick={() => navigate(`/approved-loan-details/${r.lan}`)}>
          {r.customer_name ?? "-"}
        </span>
      ),
      sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
      width: 220,
    },
    {
      key: "lender",
      header: "Product",
      render: () => "STERLION",
      csvAccessor: () => "STERLION",
      width: 120,
    },
    {
      key: "business_name",
      header: "Business",
      sortable: true,
      render: (r) => r.business_name || "-",
      width: 220,
    },
    {
      key: "partner_loan_id",
      header: "Partner Lead ID",
      sortable: true,
      width: 170,
    },
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      render: (r) => (
        <span style={link} onClick={() => navigate(`/approved-loan-details/${r.lan}`)}>
          {r.lan ?? "-"}
        </span>
      ),
      sortAccessor: (r) => (r.lan || "").toLowerCase(),
      width: 150,
    },
    {
      key: "request_amount",
      header: "Request Amount",
      sortable: true,
      render: (r) => formatAmount(r.request_amount),
      sortAccessor: (r) => amountSort(r.request_amount),
      csvAccessor: (r) => r.request_amount ?? "",
      width: 160,
    },
    {
      key: "loan_amount",
      header: "Limit (Credit Team)",
      sortable: true,
      render: (r) => (
        <input
          type="number"
          value={getCreditLimitAmount(r)}
          placeholder="Enter limit"
          onChange={(e) => handleCreditLimitChange(r.lan, e.target.value)}
          style={{
            width: "140px",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            fontSize: 13,
            fontWeight: 600,
          }}
        />
      ),
      sortAccessor: (r) => amountSort(r.loan_amount),
      csvAccessor: (r) => r.loan_amount ?? "",
      width: 190,
    },
    {
      key: "sterlion_bre_status",
      header: "BRE",
      sortable: true,
      render: (r) => (
        <span style={pill(r.sterlion_bre_status)}>
          {r.sterlion_bre_status || "Pending"}
        </span>
      ),
      sortAccessor: (r) => (r.sterlion_bre_status || "").toLowerCase(),
      width: 150,
    },
    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,
      render: (r) =>
        r.mobile_number ? (
          <a href={`tel:${r.mobile_number}`} style={link}>
            {r.mobile_number}
          </a>
        ) : (
          "-"
        ),
      width: 160,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (r) => <span style={pill(r.status)}>{r.status || "Pending"}</span>,
      sortAccessor: (r) => (r.status || "").toLowerCase(),
      csvAccessor: (r) => r.status || "Pending",
      width: 140,
    },
    {
      key: "docs",
      header: "Documents",
      render: (r) => (
        <button
          onClick={() => navigate(`/documents/${r.lan}`)}
          style={docsBtn}
          title="Open documents"
        >
          Docs
        </button>
      ),
      csvAccessor: () => "",
      width: 120,
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            style={actionBtn("approve")}
            onClick={() => handleStatusChange(r, "Disburse initiate")}
          >
            Disburse initiate
          </button>

          <button
            style={actionBtn("reject")}
            onClick={() => handleStatusChange(r, "rejected")}
          >
            Reject
          </button>
        </div>
      ),
      csvAccessor: () => "",
      width: 230,
    },
  ];

  const globalSearchKeys = [
    "customer_name",
    "business_name",
    "partner_loan_id",
    "lan",
    "request_amount",
    "loan_amount",
    "mobile_number",
    "sterlion_bre_status",
    "status",
  ];

  if (loading) return <p>Loading...</p>;
  if (err) return <p style={{ color: "#b91c1c", fontWeight: 600 }}>{err}</p>;

  return (
    <DataTable
      title="Sterlion Action Pending Leads"
      rows={rows}
      columns={columns}
      globalSearchKeys={globalSearchKeys}
      exportFileName="sterlion_action_pending_leads"
    />
  );
};

export default SterlionActionScreen;
