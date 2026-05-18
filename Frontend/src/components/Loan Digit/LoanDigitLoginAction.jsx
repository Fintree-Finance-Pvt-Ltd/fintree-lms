// import React from 'react'
// import LoginActionScreen from '../LoginActionScreen';

// const LoanDigitLoginAction = () => {
//   return (
//     <LoginActionScreen
//       apiUrl={`/loan-booking/login-loans?table=loan_booking_loan_digit&prefix=LDF`}
//       title="Loan Digit Credit Approval Pending Loans"
//       tableName="loan_booking_loan_digit"
//       lenderName = "Loan Digit"
//     />
//   )
// }

// export default LoanDigitLoginAction

import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";

const LoanDigitLoginScreen = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    let off = false;

    setLoading(true);

    api
      .get("/loan-digit/bre-approved-loans")
      .then((res) => {
  if (!off) {

    const loans = Array.isArray(res.data)
      ? res.data
      : res.data?.data || [];

    setRows(loans);
  }
})
      .catch(() => {
        if (!off) {
          setErr("Failed to fetch data.");
        }
      })
      .finally(() => {
        if (!off) {
          setLoading(false);
        }
      });

    return () => {
      off = true;
    };
  }, []);

  const handleStatusChange = async (lan, newStatus) => {
    try {
      await api.put(`/loan-digit/approve-initiate-loan/${lan}`, {
        status: newStatus,
        table: "loan_booking_loan_digit",
      });

      setRows((prev) =>
        prev.map((r) =>
          r.lan === lan
            ? { ...r, status: newStatus }
            : r
        )
      );

    } catch (err) {
      console.error("Error updating status:", err);
      alert("Failed to update status.");
    }
  };

  if (loading) return <p>Loading...</p>;

  if (err) {
    return (
      <p style={{ color: "#b91c1c", fontWeight: 600 }}>
        {err}
      </p>
    );
  }

  const pill = (status) => {
  const map = {
    BRE_APPROVED: {
      bg: "rgba(16,185,129,.12)",
      fg: "#047857",
    },
    BRE_REJECTED: {
      bg: "rgba(239,68,68,.12)",
      fg: "#dc2626",
    },
    "Disburse initiate": {
      bg: "rgba(59,130,246,.12)",
      fg: "#1d4ed8",
    },
    Rejected: {
      bg: "rgba(239,68,68,.12)",
      fg: "#dc2626",
    },
    Pending: {
      bg: "rgba(234,179,8,.12)",
      fg: "#92400e",
    },
  };

  const c = map[status] || map.Pending;

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    background: c.bg,
    color: c.fg,
    minWidth: 120,
  };
};

  const actionBtn = (type) => ({
    minWidth: type === "approve" ? "170px" : "110px",
    height: "44px",
    padding: "0 16px",
    borderRadius: "14px",
    border: "1px solid transparent",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 600,
    color: type === "approve" ? "#047857" : "#dc2626",
    background: type === "approve" ? "#e8f8f0" : "#fdecec",
  });

  const docsBtn = {
    minWidth: "88px",
    height: "38px",
    padding: "0 12px",
    borderRadius: "12px",
    border: "1px solid #dbe5ef",
    color: "#1d4ed8",
    background: "#f8fbff",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
  };

  const columns = [
    {
      key: "customer_name",
      header: "Customer Name",
      sortable: true,
      render: (r) => (
        <span
          style={{
            color: "#2563eb",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() =>
            navigate(`/loan-digit/customer-details?lan=${r.lan}`)
          }
        >
          {r.customer_name || "—"}
        </span>
      ),
      width: 220,
    },

    {
      key: "partner_loan_id",
      header: "Partner Loan ID",
      sortable: true,
      width: 180,
    },

    {
      key: "lan",
      header: "LAN",
      sortable: true,
      width: 140,
    },

    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,
      width: 160,
    },

    {
      key: "loan_amount",
      header: "Loan Amount",
      sortable: true,
      width: 140,
    },

    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (r) => (
        <span style={pill(r.status)}>
          {r.status || "Pending"}
        </span>
      ),
      width: 150,
    },

    {
      key: "documents",
      header: "Documents",
      render: (r) => (
        <button
          style={docsBtn}
          onClick={() => navigate(`/documents/${r.lan}`)}
        >
          📂 Docs
        </button>
      ),
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
            flexWrap: "wrap",
          }}
        >
          <button
            style={actionBtn("approve")}
            onClick={() =>
              handleStatusChange(
                r.lan,
                "CREDIT_APPROVED"
              )
            }
          >
            ✅ Approve
          </button>

          <button
            style={actionBtn("reject")}
            onClick={() =>
              handleStatusChange(
                r.lan,
                "CREDIT_REJECTED"
              )
            }
          >
            ❌ Reject
          </button>
        </div>
      ),
      width: 260,
    },
  ];

  return (
    <DataTable
      title="Loan Digit BRE Approved Loans"
      rows={rows}
      columns={columns}
      globalSearchKeys={[
        "customer_name",
        "partner_loan_id",
        "lan",
        "mobile_number",
        "status",
      ]}
      exportFileName="loan_digit_bre_approved_cases"
    />
  );
};

export default LoanDigitLoginScreen;