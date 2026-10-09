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

  // ======================================================
  // FETCH OPS APPROVED CASES
  // ======================================================

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setErr("");

    api
      .get("/claim-buddy/ops-maker-approved-loans")
      .then((res) => {
        if (cancelled) return;

        const loans = Array.isArray(res.data) ? res.data : res.data?.data || [];

        setRows(loans);
      })
      .catch((error) => {
        console.error("Claim Buddy OPS Checker fetch error:", error);

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

  // ======================================================
  // OPS CHECKER APPROVE / REJECT
  // ======================================================

  const handleStatusChange = async (lan, status) => {
    try {
      const payload = {
        status,
      };

      // ==================================================
      // GET LOGGED-IN CHECKER DETAILS
      // ==================================================

      const rawUser = localStorage.getItem("user");

      if (rawUser) {
        try {
          const user = JSON.parse(rawUser);

          payload.ops_checker_id = user.userId || null;
          payload.ops_checker_name = user.name || null;
        } catch (userError) {
          console.error("Unable to parse logged-in user:", userError);
        }
      }

      // ==================================================
      // CALL OPS CHECKER API
      // ==================================================

      await api.put(
        `/claim-buddy/ops-checker-approved-loan/${encodeURIComponent(lan)}`,
        payload,
      );

      // ==================================================
      // REMOVE PROCESSED CASE FROM CURRENT SCREEN
      // ==================================================

      setRows((prev) => prev.filter((item) => item.lan !== lan));

      // ==================================================
      // SUCCESS MESSAGE
      // ==================================================

      if (status === "OPS_REJECTED") {
        alert("Loan rejected successfully");
      } else if (status === "OPS_CHECKER_APPROVED") {
        alert("Loan approved successfully. Payout initiation started.");
      }
    } catch (error) {
      console.error("Claim Buddy OPS checker update error:", error);

      alert(error?.response?.data?.message || "Failed to update OPS status");
    }
  };

  // ======================================================
  // STATUS PILL
  // ======================================================

  const pill = (status) => {
    const map = {
  "OPS MAKER APPROVED": {
    bg: "rgba(59,130,246,.12)",
    fg: "#1d4ed8",
  },

  "OPS APPROVED": {
    bg: "rgba(59,130,246,.12)",
    fg: "#1d4ed8",
  },

  "OPS CHECKER APPROVED": {
    bg: "rgba(16,185,129,.12)",
    fg: "#047857",
  },

  "DISBURSEMENT INITIATED": {
    bg: "rgba(245,158,11,.12)",
    fg: "#b45309",
  },

  DISBURSED: {
    bg: "rgba(16,185,129,.12)",
    fg: "#047857",
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

    const selected = map[status] || map.Pending;

    return {
      background: selected.bg,
      color: selected.fg,
      padding: "8px 14px",
      borderRadius: 999,
      fontWeight: 600,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    };
  };

  // ======================================================
  // ACTION BUTTON
  // ======================================================

  const actionBtn = (type) => ({
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
    color: "#fff",
    background: type === "approve" ? "#059669" : "#dc2626",
  });

  // ======================================================
  // TABLE COLUMNS
  // ======================================================

  const columns = [
    {
      key: "customer_name",
      header: "Customer Name",
      sortable: true,

      render: (row) => (
        <span
          style={{
            color: "#2563eb",
            cursor: "pointer",
            fontWeight: 600,
          }}
          onClick={() =>
            navigate(`/claim-buddy-loan-details/${encodeURIComponent(row.lan)}`)
          }
        >
          {row.customer_name || "—"}
        </span>
      ),

      sortAccessor: (row) => String(row.customer_name || "").toLowerCase(),
    },

    {
      key: "lan",
      header: "LAN",
      sortable: true,

      sortAccessor: (row) => String(row.lan || "").toLowerCase(),
    },

    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,

      sortAccessor: (row) => String(row.mobile_number || ""),
    },

    {
      key: "loan_amount",
      header: "Loan Amount",
      sortable: true,

      sortAccessor: (row) => Number(row.loan_amount || 0),
    },

    {
      key: "final_limit",
      header: "Final Limit",
      sortable: true,

      sortAccessor: (row) => Number(row.final_limit || 0),
    },

    {
      key: "status",
      header: "Status",
      sortable: true,

      render: (row) => (
        <span style={pill(row.status)}>{row.status || "Pending"}</span>
      ),

      sortAccessor: (row) => String(row.status || "").toLowerCase(),
    },

    {
      key: "documents",
      header: "Documents",

      render: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/documents/${encodeURIComponent(row.lan)}`)}
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
        >
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
          {/* ==================================================
              OPS CHECKER APPROVE
              ================================================== */}

          <button
            type="button"
            style={actionBtn("approve")}
            onClick={() => handleStatusChange(row.lan, "OPS_CHECKER_APPROVED")}
          >
            💸 Approve & Pay
          </button>

          {/* ==================================================
              OPS CHECKER REJECT
              ================================================== */}

          <button
            type="button"
            style={actionBtn("reject")}
            onClick={() => handleStatusChange(row.lan, "OPS_REJECTED")}
          >
            ❌ Reject
          </button>
        </div>
      ),
    },
  ];

  // ======================================================
  // UI
  // ======================================================

  return (
    <>
      <LoaderOverlay
        show={loading}
        label="Fetching Claim Buddy OPS Checker Loans..."
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
