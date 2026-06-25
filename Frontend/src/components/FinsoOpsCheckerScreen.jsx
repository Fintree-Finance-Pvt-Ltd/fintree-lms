import React, { useEffect, useState } from "react";
import api from "../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "./ui/DataTable";
import LoaderOverlay from "./ui/LoaderOverlay";

const FinsoOpsCheckerScreen = () => {

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const navigate = useNavigate();

  useEffect(() => {

    let off = false;

    setLoading(true);

    api
      .get("/loan-booking/v1/finso-ops-maker-approved-loans")
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

  const handleStatusChange = async (
    lan,
    payload
  ) => {

    try {
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const u = JSON.parse(rawUser);
        payload.ops_checker_id = u.userId;
        payload.ops_checker_name = u.name;
      }

      await api.put(
        `/loan-booking/v1/finso-ops-checker-approved-loan/${lan}`,
        payload
      );

      setRows((prev) =>
        prev.map((r) =>
          r.lan === lan
            ? { ...r, ...payload }
            : r
        )
      );

    } catch (err) {

      console.error("Error updating status:", err);

      alert("Failed to update status.");

    }
  };

  const pill = (status) => {

    const map = {

      approved: {
        bg: "rgba(16,185,129,.12)",
        fg: "#047857",
      },

      DISBURSED: {
        bg: "rgba(59,130,246,.12)",
        fg: "#1d4ed8",
      },

      OPS_REJECTED: {
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
    minWidth: "130px",
    height: "42px",
    padding: "0 16px",
    borderRadius: "12px",
    border: "1px solid transparent",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 600,
    color: type === "approve"
      ? "#047857"
      : "#dc2626",
    background: type === "approve"
      ? "#e8f8f0"
      : "#fdecec",
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
            navigate(`/fincrest-loan-details/${r.lan}`)
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
      key: "net_disbursement",
      header: "Net Disbursement",
      sortable: true,
      width: 150,
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
          onClick={() => navigate(`/documents/${r.lan}`)}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #93c5fd",
            color: "#1d4ed8",
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
          title="Open documents"
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
                {
                  status: "APPROVED",
                }
              )
            }
          >
            💸 Approve and Pay
          </button>

          <button
            style={actionBtn("reject")}
            onClick={() =>
              handleStatusChange(
                r.lan,
                {
                  status: "OPS_REJECTED",
                }
              )
            }
          >
            ❌ Reject
          </button>

        </div>
      ),

      width: 220,
    },
  ];

  return (
    <>
      <LoaderOverlay
        show={loading}
        label="Fetching data..."
      />

      {err && (
        <p
          style={{
            color: "#b91c1c",
            marginBottom: 12,
          }}
        >
          {err}
        </p>
      )}

      <DataTable
        title="Fincrest OPS Checker Screen"
        rows={rows}
        columns={columns}
        globalSearchKeys={[
          "customer_name",
          "partner_loan_id",
          "lan",
          "mobile_number",
          "status",
        ]}
        exportFileName="finso_ops_checker"
      />
    </>
  );
};

export default FinsoOpsCheckerScreen;
