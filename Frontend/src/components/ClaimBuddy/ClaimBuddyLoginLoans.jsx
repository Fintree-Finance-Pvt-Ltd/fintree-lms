import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import DataTable from "../ui/DataTable";

const ClaimBuddyLoginLoans = ({
  apiUrl = `/loan-booking/login-loans?table=loan_booking_claim_buddy&prefix=CBF`,
  title = "Claim Buddy Login Stage Loans",
  lenderName = "CLAIM BUDDY",
}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const navigate = useNavigate();

  const openApprovedLoanDetails = (row) => {
    const lan = row?.lan || row?.LAN;

    if (!lan) return;

    navigate(
      `/approved-loan-details-claim-buddy/${encodeURIComponent(
        lan
      )}`
    );
  };

  useEffect(() => {
    let off = false;

    setLoading(true);
    setErr("");

    api
      .get(apiUrl)
      .then((res) => {
        if (!off) {
          setRows(
            Array.isArray(res.data)
              ? res.data
              : []
          );
        }
      })
      .catch((error) => {
        console.error(
          "Failed to fetch Claim Buddy login cases:",
          error
        );

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
  }, [apiUrl]);

  if (loading) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "200px",
        }}
      >
        <div className="medical-spinner" />

        <p
          style={{
            marginTop: "10px",
            color: "#0d9488",
            fontWeight: 600,
          }}
        >
          Accessing Records...
        </p>

        <style>{`
          .medical-spinner {
            width: 30px;
            height: 30px;
            border: 3px solid #ccfbf1;
            border-top: 3px solid #0d9488;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  if (err) {
    return (
      <div
        style={{
          padding: "20px",
          background: "#fef2f2",
          borderRadius: "12px",
          borderLeft:
            "4px solid #ef4444",
        }}
      >
        <p
          style={{
            color: "#b91c1c",
            fontWeight: 600,
            margin: 0,
          }}
        >
          {err}
        </p>
      </div>
    );
  }

  const hasClaimBuddy = rows.some(
    (row) =>
      typeof row?.lan === "string" &&
      /^CBF/i.test(row.lan)
  );

  const statusPillStyle = (status) => {
    const map = {
      approved: {
        bg: "#dcfce7",
        bd: "#bbf7d0",
        fg: "#166534",
      },

      rejected: {
        bg: "#fee2e2",
        bd: "#fecaca",
        fg: "#991b1b",
      },

      pending: {
        bg: "#fef3c7",
        bd: "#fde68a",
        fg: "#92400e",
      },

      login: {
        bg: "#f1f5f9",
        bd: "#e2e8f0",
        fg: "#475569",
      },
    };

    const key = String(
      status || "pending"
    )
      .trim()
      .toLowerCase();

    const selected =
      map[key] || map.login;

    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "4px 12px",
      borderRadius: "6px",
      fontSize: "11px",
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      background: selected.bg,
      color: selected.fg,
      border: `1px solid ${selected.bd}`,
    };
  };

  const phoneLink = {
    color: "#0d9488",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: "13px",
  };

  const clickableText = {
    color: "#0d9488",
    fontWeight: 700,
    cursor: "pointer",
  };

  const columns = [
    {
      key: "customer_name",
      header: "Patient / Borrower",
      sortable: true,

      render: (row) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span
            style={{
              ...clickableText,
              fontSize: "14px",
            }}
            onClick={() =>
              openApprovedLoanDetails(row)
            }
            title="View Claim Buddy loan details"
          >
            {row.customer_name ?? "—"}
          </span>

          <span
            style={{
              fontSize: "10px",
              color: "#64748b",
              textTransform: "uppercase",
            }}
          >
            Case ID: {row.lan ?? "—"}
          </span>
        </div>
      ),

      sortAccessor: (row) =>
        (
          row.customer_name || ""
        ).toLowerCase(),

      width: 220,
    },

    {
      key: "hospital_name",
      header: "Medical Facility",
      sortable: true,

      render: (row) => (
        <span
          style={{
            color: "#475569",
            fontWeight: 600,
            fontSize: "13px",
          }}
        >
          🏥 {row.hospital_name ?? "—"}
        </span>
      ),

      sortAccessor: (row) =>
        (
          row.hospital_name || ""
        ).toLowerCase(),

      width: 220,
    },

    {
      key: "lender",
      header: "Lender",

      render: () => (
        <span
          style={{
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          {lenderName}
        </span>
      ),

      csvAccessor: () =>
        lenderName,

      width: 140,
    },

    {
      key: "lan",
      header: "LAN",
      sortable: true,

      render: (row) => (
        <code
          style={{
            background: "#f1f5f9",
            padding: "4px 7px",
            borderRadius: "4px",
            color: "#0d9488",
            fontWeight: "bold",
            cursor: "pointer",
          }}
          onClick={() =>
            openApprovedLoanDetails(row)
          }
          title="View Claim Buddy loan details"
        >
          {row.lan ?? "—"}
        </code>
      ),

      sortAccessor: (row) =>
        (
          row.lan || ""
        ).toLowerCase(),

      width: 140,
    },

    ...(hasClaimBuddy
      ? [
          {
            key: "application_id",
            header: "APP ID",
            sortable: true,

            render: (row) =>
              /^CBF/i.test(
                row?.lan
              ) ? (
                <span
                  style={{
                    fontWeight: 600,
                  }}
                >
                  {row.app_id ??
                    "—"}
                </span>
              ) : (
                "—"
              ),

            sortAccessor: (
              row
            ) =>
              String(
                row.app_id || ""
              ).toLowerCase(),

            width: 140,
          },
        ]
      : []),

    {
      key: "mobile_number",
      header: "Contact",
      sortable: true,

      render: (row) =>
        row.mobile_number ? (
          <a
            href={`tel:${row.mobile_number}`}
            style={phoneLink}
          >
            📞 {row.mobile_number}
          </a>
        ) : (
          "—"
        ),

      sortAccessor: (row) =>
        String(
          row.mobile_number || ""
        ),

      width: 160,
    },

    {
      key: "status",
      header: "Stage",
      sortable: true,

      render: (row) => (
        <span
          style={statusPillStyle(
            row.status
          )}
        >
          {row.status ||
            "Pending"}
        </span>
      ),

      sortAccessor: (row) =>
        (
          row.status || ""
        ).toLowerCase(),

      csvAccessor: (row) =>
        row.status ||
        "Pending",

      width: 140,
    },

    {
      key: "docs",
      header: "Medical Files",

      render: (row) => (
        <button
          type="button"
          onClick={() =>
            navigate(
              `/documents/${encodeURIComponent(
                row.lan
              )}`
            )
          }
          style={{
            padding: "6px 12px",
            borderRadius: "6px",
            border:
              "1px solid #0d9488",
            color: "#0d9488",
            background: "#fff",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 700,
            transition: "0.2s",
          }}
          className="medical-btn-docs"
          title="Open medical records"
        >
          📋 Records
        </button>
      ),

      csvAccessor: () => "",
      width: 120,
    },
  ];

  return (
    <div className="hospital-ui-wrapper">
      <style>{`
        .hospital-ui-wrapper {
          padding: 24px;
          background: #f8fafc;
          min-height: 100vh;
        }

        .medical-btn-docs:hover {
          background: #0d9488 !important;
          color: #ffffff !important;
        }
      `}</style>

      <DataTable
        title={title}
        rows={rows}
        columns={columns}
        globalSearchKeys={[
          "customer_name",
          "hospital_name",
          "lan",
          "app_id",
          "mobile_number",
          "status",
        ]}
        initialSort={{
          key: "lan",
          dir: "desc",
        }}
        exportFileName="claim_buddy_login_records"
      />
    </div>
  );
};

export default ClaimBuddyLoginLoans;