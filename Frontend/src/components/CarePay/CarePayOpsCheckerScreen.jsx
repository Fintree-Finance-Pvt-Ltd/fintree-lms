import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const CarePayOpsCheckerScreen = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let off = false;
    setLoading(true);
    setErr("");

    api
      .get("/loan-booking/v1/carepay-ops-l2-disburse-initiate-loans")
      .then((res) => {
        if (off) return;

        const loans = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setRows(loans);
      })
      .catch(() => {
        if (!off) setErr("Failed to fetch data.");
      })
      .finally(() => {
        if (!off) setLoading(false);
      });

    return () => {
      off = true;
    };
  }, []);

  const handleStatusChange = async (lan, payload) => {
    try {
      const finalPayload = { ...payload };
      const rawUser = localStorage.getItem("user");

      if (rawUser) {
        const user = JSON.parse(rawUser);
        finalPayload.ops_checker_id = user.userId;
        finalPayload.ops_checker_name = user.name;
      }

      const { data } = await api.put(
        `/loan-booking/v1/carepay-ops-checker-approved-loan/${lan}`,
        finalPayload,
      );

      setRows((prev) => {
        if (finalPayload.status === "OPS_REJECTED") {
          return prev.filter((row) => row.lan !== lan);
        }

        if (data?.final_status === "Disbursed") {
          return prev.filter((row) => row.lan !== lan);
        }

        return prev.map((row) =>
          row.lan === lan ? { ...row, status: data?.final_status || row.status } : row,
        );
      });
    } catch (error) {
      console.error("Error updating CarePay ops checker status:", error);
      alert("Failed to update status.");
    }
  };

  const pill = (status) => {
    const key = String(status || "pending").toUpperCase();
    const map = {
      APPROVED: {
        bg: "rgba(16,185,129,.12)",
        fg: "#047857",
      },
      DISBURSED: {
        bg: "rgba(59,130,246,.12)",
        fg: "#1d4ed8",
      },
      "DISBURSE INITIATE": {
        bg: "rgba(245,158,11,.12)",
        fg: "#92400e",
      },
      OPS_REJECTED: {
        bg: "rgba(239,68,68,.12)",
        fg: "#dc2626",
      },
      PENDING: {
        bg: "rgba(234,179,8,.12)",
        fg: "#92400e",
      },
    };
    const c = map[key] || map.PENDING;

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
    color: type === "approve" ? "#047857" : "#dc2626",
    background: type === "approve" ? "#e8f8f0" : "#fdecec",
  });

  const columns = [
    {
      key: "customer_name",
      header: "Customer Name",
      sortable: true,
      render: (row) => (
        <span
          style={{
            color: "#2563eb",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() => navigate(`/approved-loan-details/${row.lan}`)}
        >
          {row.customer_name || "-"}
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
      render: (row) => (
        <span style={pill(row.status)}>{row.status || "Pending"}</span>
      ),
      width: 150,
    },
    {
      key: "documents",
      header: "Documents",
      render: (row) => (
        <button
          onClick={() => navigate(`/documents/${row.lan}`)}
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
          Docs
        </button>
      ),
      width: 120,
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            style={actionBtn("approve")}
            onClick={() =>
              handleStatusChange(row.lan, {
                status: "APPROVED",
              })
            }
          >
            Approve and Pay
          </button>

          <button
            style={actionBtn("reject")}
            onClick={() =>
              handleStatusChange(row.lan, {
                status: "OPS_REJECTED",
              })
            }
          >
            Reject
          </button>
        </div>
      ),
      width: 220,
    },
  ];

  return (
    <>
      <LoaderOverlay show={loading} label="Fetching data..." />

      {err && (
        <p style={{ color: "#b91c1c", marginBottom: 12 }}>
          {err}
        </p>
      )}

      <DataTable
        title="CarePay Ops L2 Disburse Initiated"
        rows={rows}
        columns={columns}
        globalSearchKeys={[
          "customer_name",
          "partner_loan_id",
          "lan",
          "mobile_number",
          "status",
        ]}
        exportFileName="carepay_ops_checker"
      />
    </>
  );
};

export default CarePayOpsCheckerScreen;
