import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../api/api";

import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const ClaimBuddyOpsCheckerScreen = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    api
      .get("/claim-buddy/ops-maker-approved-loans")

      .then((res) => {
        if (cancelled) return;

        const loans = Array.isArray(res.data) ? res.data : res.data?.data || [];

        setRows(loans);
      })

      .catch((error) => {
        console.error("Claim Buddy OPS Checker fetch error", error);

        if (!cancelled) {
          setErr("Failed to fetch OPS checker loans");
        }
      })

      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleStatusChange = async (lan, status) => {
    try {
      let payload = {
        status,
      };

      const rawUser = localStorage.getItem("user");

      if (rawUser) {
        const user = JSON.parse(rawUser);

        payload.ops_checker_id = user.userId;

        payload.ops_checker_name = user.name;
      }

      await api.put(`/claim-buddy/ops-checker-approved-loan/${lan}`, payload);

      setRows((prev) => prev.filter((item) => item.lan !== lan));

      alert(
        status === "OPS_REJECTED"
          ? "Loan rejected successfully"
          : "Loan approved and payout initiated",
      );
    } catch (error) {
      console.error("OPS checker update error", error);

      alert("Failed to update OPS status");
    }
  };

  const pill = (status) => {
    const map = {
      "OPS APPROVED": {
        bg: "rgba(59,130,246,.12)",
        fg: "#1d4ed8",
      },

      OPS_REJECTED: {
        bg: "rgba(239,68,68,.12)",
        fg: "#dc2626",
      },

      "OPS APPROVED BY CHECKER": {
        bg: "rgba(16,185,129,.12)",
        fg: "#047857",
      },

      Pending: {
        bg: "rgba(234,179,8,.12)",
        fg: "#92400e",
      },
    };

    const c = map[status] || map.Pending;

    return {
      background: c.bg,

      color: c.fg,

      padding: "8px 14px",

      borderRadius: 999,

      fontWeight: 600,

      display: "inline-flex",
    };
  };

  const actionBtn = (type) => ({
    padding: "10px 16px",

    borderRadius: 10,

    border: "none",

    cursor: "pointer",

    fontWeight: 600,

    color: "#fff",

    background: type === "approve" ? "#059669" : "#dc2626",
  });

  const columns = [
    {
      key: "customer_name",

      header: "Customer Name",

      render: (row) => (
        <span
          style={{
            color: "#2563eb",

            cursor: "pointer",

            fontWeight: 600,
          }}
          onClick={() => navigate(`/claim-buddy-loan-details/${row.lan}`)}
        >
          {row.customer_name || "—"}
        </span>
      ),
    },

    {
      key: "lan",

      header: "LAN",
    },

    {
      key: "mobile_number",

      header: "Mobile Number",
    },

    {
      key: "loan_amount",

      header: "Loan Amount",
    },

    {
      key: "final_limit",

      header: "Final Limit",
    },

    {
      key: "status",

      header: "Status",

      render: (row) => <span style={pill(row.status)}>{row.status}</span>,
    },

    {
      key: "documents",

      header: "Documents",

      render: (row) => (
        <button onClick={() => navigate(`/documents/${row.lan}`)}>
          📂 Docs
        </button>
      ),
    },

    {
      key: "actions",

      header: "Actions",

      render: (row) => (
        <div
          style={{
            display: "flex",
            gap: 10,
          }}
        >
          <button
            style={actionBtn("approve")}
            onClick={() => handleStatusChange(row.lan, "OPS_APPROVED")}
          >
            💸 Approve & Pay
          </button>

          <button
            style={actionBtn("reject")}
            onClick={() => handleStatusChange(row.lan, "OPS_REJECTED")}
          >
            ❌ Reject
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <LoaderOverlay
        show={loading}
        label="Fetching Claim Buddy OPS Checker Loans..."
      />

      {err && <p style={{ color: "#b91c1c" }}>{err}</p>}

      <DataTable
        title="Claim Buddy OPS Checker"
        rows={rows}
        columns={columns}
        globalSearchKeys={["customer_name", "lan", "mobile_number", "status"]}
        exportFileName="claim_buddy_ops_checker"
      />
    </>
  );
};

export default ClaimBuddyOpsCheckerScreen;
