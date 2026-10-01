import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const ClaimBuddyDisburseInitiateScreen = ({
  apiUrl = `/claim-buddy/approve-initiate-loans?table=loan_booking_claim_buddy&prefix=CBF`,
  title = "Approval Initiated Stage Loans",
  lenderName = "CLAIM BUDDY",
  tableName = "loan_booking_claim_buddy",
}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const navigate = useNavigate();

  // ======================================================
  // OPEN APPROVED LOAN DETAILS
  // ======================================================

  const openApprovedLoanDetails = (row) => {
    const lan = row?.lan || row?.LAN;

    if (!lan) return;

    navigate(
      `/approved-loan-details-claim-buddy/${encodeURIComponent(lan)}`
    );
  };

  // ======================================================
  // FETCH BRE APPROVED CASES
  // ======================================================

  useEffect(() => {
    let off = false;

    const fetchLoans = async () => {
      try {
        setLoading(true);
        setErr("");

        const res = await api.get(apiUrl);

        console.log(
          "Claim Buddy approve-initiate API response:",
          res.data
        );

        if (off) return;

        /*
         * Backend response:
         *
         * {
         *   rows: [...]
         * }
         *
         * So we need res.data.rows
         *
         * Defensive handling is added in case API
         * ever returns a direct array.
         */

        const loans = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.rows)
          ? res.data.rows
          : Array.isArray(res.data?.data)
          ? res.data.data
          : [];

        console.log(
          "Claim Buddy rows received:",
          loans
        );

        setRows(loans);
      } catch (error) {
        console.error(
          "Claim Buddy approve-initiate fetch error:",
          error
        );

        if (!off) {
          setErr(
            error?.response?.data?.message ||
              "Failed to fetch data."
          );

          setRows([]);
        }
      } finally {
        if (!off) {
          setLoading(false);
        }
      }
    };

    fetchLoans();

    return () => {
      off = true;
    };
  }, [apiUrl]);

  // ======================================================
  // APPROVE / REJECT
  // ======================================================

  const handleStatusChange = async (
    lan,
    newStatus,
    table
  ) => {
    if (!lan) {
      alert("LAN is missing.");
      return;
    }

    try {
      await api.put(
        `/claim-buddy/approve-initiated-loans/${encodeURIComponent(
          lan
        )}`,
        {
          status: newStatus,
          table,
        }
      );

      /*
       * Once action is completed, remove the case
       * from this screen because this screen is for
       * BRE APPROVED / approval-initiation cases.
       */

      setRows((prev) =>
        prev.filter(
          (r) => r.lan !== lan
        )
      );

      if (newStatus === "CREDIT APPROVED") {
        alert(
          "Loan approved successfully."
        );
      } else if (
        newStatus === "REJECTED"
      ) {
        alert(
          "Loan rejected successfully."
        );
      }
    } catch (error) {
      console.error(
        "Error updating Claim Buddy status:",
        error
      );

      alert(
        error?.response?.data?.message ||
          "Failed to update status. Try again."
      );
    }
  };

  // ======================================================
  // STATUS PILL
  // ======================================================

  const pill = (status) => {
    const map = {
      "bre approved": {
        bg: "rgba(59,130,246,.12)",
        bd: "rgba(59,130,246,.35)",
        fg: "#1d4ed8",
      },

      "credit approved": {
        bg: "rgba(16,185,129,.12)",
        bd: "rgba(16,185,129,.35)",
        fg: "#065f46",
      },

      rejected: {
        bg: "rgba(239,68,68,.12)",
        bd: "rgba(239,68,68,.35)",
        fg: "#7f1d1d",
      },

      "credit recheck": {
        bg: "rgba(249,115,22,.12)",
        bd: "rgba(249,115,22,.35)",
        fg: "#9a3412",
      },

      login: {
        bg: "rgba(107,114,128,.12)",
        bd: "rgba(107,114,128,.35)",
        fg: "#374151",
      },

      pending: {
        bg: "rgba(234,179,8,.12)",
        bd: "rgba(234,179,8,.35)",
        fg: "#92400e",
      },
    };

    const key = String(
      status || "pending"
    ).toLowerCase();

    const c =
      map[key] || map.pending;

    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.bd}`,
    };
  };

  // ======================================================
  // ACTION BUTTON
  // ======================================================

  const actionBtn = (type) => ({
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid transparent",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,

    background:
      type === "approve"
        ? "#10b981"
        : "#ef4444",

    borderColor:
      type === "approve"
        ? "#059669"
        : "#dc2626",

    color: "#fff",
  });

  // ======================================================
  // LINK STYLE
  // ======================================================

  const link = {
    color: "#2563eb",
    textDecoration: "none",
    fontWeight: 600,
  };

  // ======================================================
  // TABLE COLUMNS
  // ======================================================

  const baseColumns = [
    // ----------------------------------------------------
    // CUSTOMER
    // ----------------------------------------------------

    {
      key: "customer_name",
      header: "Loan Details",
      sortable: true,

      render: (r) => (
        <span
          style={{
            color: "#2563eb",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() =>
            openApprovedLoanDetails(r)
          }
        >
          {r.customer_name ?? "—"}
        </span>
      ),

      sortAccessor: (r) =>
        String(
          r.customer_name || ""
        ).toLowerCase(),

      width: 220,
    },

    // ----------------------------------------------------
    // PATIENT
    // ----------------------------------------------------

    {
      key: "patient_name",
      header: "Patient Name",
      sortable: true,

      render: (r) => (
        <span
          style={{
            color: "#2563eb",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() =>
            openApprovedLoanDetails(r)
          }
        >
          {r.patient_name ?? "—"}
        </span>
      ),

      sortAccessor: (r) =>
        String(
          r.patient_name || ""
        ).toLowerCase(),

      width: 220,
    },

    // ----------------------------------------------------
    // HOSPITAL
    // ----------------------------------------------------

    {
      key: "hospital_name",
      header: "Hospital",

      render: (r) => (
        <span
          style={{
            fontWeight: 600,
            color: "#334155",
          }}
        >
          {r.hospital_name ?? "—"}
        </span>
      ),

      sortAccessor: (r) =>
        String(
          r.hospital_name || ""
        ).toLowerCase(),

      width: 220,
    },

    // ----------------------------------------------------
    // LENDER
    // ----------------------------------------------------

    {
      key: "lender",
      header: "Lender",

      render: () =>
        lenderName,

      csvAccessor: () =>
        lenderName,

      width: 120,
    },

    // ----------------------------------------------------
    // LAN
    // ----------------------------------------------------

    {
      key: "lan",
      header: "LAN",
      sortable: true,

      render: (r) => (
        <span
          style={{
            color: "#2563eb",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() =>
            openApprovedLoanDetails(r)
          }
        >
          {r.lan ?? "—"}
        </span>
      ),

      sortAccessor: (r) =>
        String(
          r.lan || ""
        ).toLowerCase(),

      width: 140,
    },

    // ----------------------------------------------------
    // MOBILE
    // ----------------------------------------------------

    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,

      render: (r) =>
        r.mobile_number ? (
          <a
            href={`tel:${r.mobile_number}`}
            style={link}
          >
            {r.mobile_number}
          </a>
        ) : (
          "—"
        ),

      sortAccessor: (r) =>
        String(
          r.mobile_number || ""
        ),

      width: 160,
    },

    // ----------------------------------------------------
    // LOAN AMOUNT
    // ----------------------------------------------------

    {
      key: "loan_amount",
      header: "Loan Amount",
      sortable: true,

      render: (r) =>
        r.loan_amount != null
          ? `₹${Number(
              r.loan_amount
            ).toLocaleString("en-IN")}`
          : "—",

      sortAccessor: (r) =>
        Number(
          r.loan_amount || 0
        ),

      width: 150,
    },

    // ----------------------------------------------------
    // FINAL LIMIT
    // ----------------------------------------------------

    {
      key: "final_limit",
      header: "Final Limit",
      sortable: true,

      render: (r) =>
        r.final_limit != null
          ? `₹${Number(
              r.final_limit
            ).toLocaleString("en-IN")}`
          : "—",

      sortAccessor: (r) =>
        Number(
          r.final_limit || 0
        ),

      width: 150,
    },

    // ----------------------------------------------------
    // STATUS
    // ----------------------------------------------------

    {
      key: "status",
      header: "Status",
      sortable: true,

      render: (r) => (
        <span
          style={pill(r.status)}
        >
          {r.status || "Pending"}
        </span>
      ),

      sortAccessor: (r) =>
        String(
          r.status || ""
        ).toLowerCase(),

      csvAccessor: (r) =>
        r.status || "Pending",

      width: 150,
    },

    // ----------------------------------------------------
    // STAGE
    // ----------------------------------------------------

    {
      key: "stage",
      header: "Stage",
      sortable: true,

      render: (r) =>
        r.stage || "—",

      sortAccessor: (r) =>
        String(
          r.stage || ""
        ).toLowerCase(),

      width: 180,
    },

    // ----------------------------------------------------
    // DOCUMENTS
    // ----------------------------------------------------

    {
      key: "docs",
      header: "Documents",

      render: (r) => (
        <button
          type="button"
          onClick={() =>
            navigate(
              `/documents/${encodeURIComponent(
                r.lan
              )}`
            )
          }
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border:
              "1px solid #93c5fd",
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

      csvAccessor: () => "",

      width: 120,
    },

    // ----------------------------------------------------
    // ACTIONS
    // ----------------------------------------------------

    {
      key: "actions",
      header: "Actions",

      render: (r) => (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          {/* APPROVE */}

          <button
            type="button"
            style={actionBtn(
              "approve"
            )}
            onClick={() =>
              handleStatusChange(
                r.lan,
                "CREDIT APPROVED",
                tableName
              )
            }
          >
            ✅ Approve
          </button>

          {/* REJECT */}

          <button
            type="button"
            style={actionBtn(
              "reject"
            )}
            onClick={() =>
              handleStatusChange(
                r.lan,
                "REJECTED",
                tableName
              )
            }
          >
            ❌ Reject
          </button>
        </div>
      ),

      csvAccessor: () => "",

      width: 210,
    },
  ];

  // ======================================================
  // GLOBAL SEARCH
  // ======================================================

  const globalSearchKeys = [
    "customer_name",
    "patient_name",
    "hospital_name",
    "partner_loan_id",
    "lan",
    "mobile_number",
    "status",
    "stage",
  ];

  // ======================================================
  // UI
  // ======================================================

  return (
    <>
      <LoaderOverlay
        show={loading}
        label="Fetching Claim Buddy approval cases…"
      />

      {err && (
        <p
          style={{
            color: "#b91c1c",
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 8,
            background: "#fef2f2",
            border:
              "1px solid #fecaca",
            fontWeight: 600,
          }}
        >
          {err}
        </p>
      )}

      <DataTable
        title={title}
        rows={rows}
        columns={baseColumns}
        globalSearchKeys={
          globalSearchKeys
        }
        exportFileName="claim_buddy_approval_initiated"
      />
    </>
  );
};

export default ClaimBuddyDisburseInitiateScreen;