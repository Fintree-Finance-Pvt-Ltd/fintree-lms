// import React, { useState, useEffect } from "react";
// import api from "../api/api";
// import { useNavigate } from "react-router-dom";
// import "../styles/ApprovedLoans.css";

// const LoginCaseScreen = ({ apiUrl, title = "Login Stage Loans", lenderName = "EMI", tableName }) => {
//   const [loans, setLoans] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState("");
//   const navigate = useNavigate();

//   useEffect(() => {
//     api
//       .get(apiUrl)
//       .then((response) => {
//         setLoans(response.data);
//         setLoading(false);
//       })
//       .catch((error) => {
//         console.error("Error fetching loans:", error);
//         setError("Failed to fetch data.");
//         setLoading(false);
//       });
//   }, [apiUrl]);

//   const handleStatusChange = async (lan, newStatus, table) => {
//   try {
//     await api.put(`/loan-booking/login-loans/${lan}`, { status: newStatus, table });
//     setLoans((prevLoans) =>
//       prevLoans.map((loan) =>
//         loan.lan === lan ? { ...loan, status: newStatus } : loan
//       )
//     );
//   } catch (err) {
//     console.error("Error updating status:", err);
//     alert("Failed to update status. Try again.");
//   }
// };


//   if (loading) return <p>Loading...</p>;
//   if (error) return <p>{error}</p>;

//   return (
//     <div className="approved-loans-container">
//       <h2>{title}</h2>
//       <table>
//         <thead>
//           <tr>
//             <th>Loan Details</th>
//             <th>Lender</th>
//             <th>Partner Loan ID</th>
//             <th>LAN</th>
//             <th>Customer ID</th>
//             <th>Mobile Number</th>
//             <th>Status</th>
//             <th>Disbursement Date</th>
//             <th>Audit Trails</th>
//             <th>Documents</th>
//           </tr>
//         </thead>
//         <tbody>
//           {loans.map((loan) => (
//             <tr key={loan.id}>
//               <td>
//                 <span
//                   className="clickable"
//                   onClick={() =>
//                     navigate(`/approved-loan-details/${loan.lan}`)
//                   }
//                 >
//                   {loan.customer_name}
//                 </span>
//               </td>
//               <td>{lenderName}</td>
//               <td>{loan.partner_loan_id}</td>
//               <td>{loan.lan}</td>
//               <td>{loan.customer_id}</td>
//               <td>
//                 <a href={`tel:${loan.mobile_number}`} className="phone-number">
//                   {loan.mobile_number}
//                 </a>
//               </td>
//               <td>
//                 <span
//                   className={
//                     loan.status === "approved"
//                       ? "status-approved"
//                       : loan.status === "rejected"
//                       ? "status-rejected"
//                       : "status-pending"
//                   }
//                 >
//                   {loan.status || "Pending"}
//                 </span>
//               </td>
//               <td>{loan.disbursement_date || "-"}</td>
//               <td>
//                 <button className="audit-trail-btn">≡</button>
//               </td>
//               <td>
//                 <button
//                   className="audit-trail-btn"
//                   onClick={() => navigate(`/documents/${loan.lan}`)}
//                 >
//                   📂 Docs
//                 </button>
//               </td>

//             </tr>
//           ))}
//         </tbody>
//       </table>
//     </div>
//   );
// };

// export default LoginCaseScreen;


import React, { useEffect, useState } from "react";
import api from "../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "./ui/DataTable";

const LoginCaseScreen = ({
  apiUrl,
  title = "Login Stage Loans",
  lenderName = "EMI",
}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let off = false;
    setLoading(true);
    api
      .get(apiUrl)
      .then((res) => !off && setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => !off && setErr("Failed to fetch data."))
      .finally(() => !off && setLoading(false));
    return () => (off = true);
  }, [apiUrl]);

  if (loading) return <p>Loading…</p>;
  if (err) return <p style={{ color: "#b91c1c", fontWeight: 600 }}>{err}</p>;

  // Show Batch ID column only if any LAN begins with ADK
  const hasADK = rows.some((r) => typeof r?.lan === "string" && /^ADK/i.test(r.lan));
  const hasGQFSF = rows.some((r) => typeof r?.lan === "string" && /^GQFSF/i.test(r.lan));
  const hasGQNonFSF = rows.some((r) => typeof r?.lan === "string" && /^GQNONFSF/i.test(r.lan));

  const statusPillStyle = (status) => {
    const map = {
      approved: { bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.35)", fg: "#065f46" },
      rejected: { bg: "rgba(239,68,68,.12)",  bd: "rgba(239,68,68,.35)",  fg: "#7f1d1d"  },
      pending:  { bg: "rgba(234,179,8,.12)",  bd: "rgba(234,179,8,.35)",  fg: "#713f12"  },
      login:    { bg: "rgba(107,114,128,.12)",bd: "rgba(107,114,128,.35)", fg: "#374151" },
    };
    const key = (status || "pending").toString().toLowerCase();
    const c = map[key] || map.login;
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

  const phoneLink = {
    color: "#2563eb",
    textDecoration: "none",
    fontWeight: 600,
  };

  const columns = [
    {
      key: "customer_name",
      header: "Loan Details",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/approved-loan-details/${r.lan}`)}
          title="View loan details"
        >
          {r.customer_name ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
      width: 220,
    },
    {
      key: "lender",
      header: "Lender",
      render: () => lenderName,
      csvAccessor: () => lenderName,
      width: 120,
    },
    { key: "partner_loan_id", header: "Partner Loan ID", sortable: true, width: 160 },
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/approved-loan-details/${r.lan}`)}
        >
          {r.lan ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.lan || "").toLowerCase(),
      width: 140,
    },

    // Batch ID column (only for ADK LANs; non-ADK shows —)
    ...(hasADK
      ? [
          {
            key: "batch_id",
            header: "Batch ID",
            sortable: true,
            render: (r) => (/^ADK/i.test(r?.lan) ? (r.batch_id ?? "—") : "—"),
            sortAccessor: (r) =>
              /^ADK/i.test(r?.lan) ? String(r?.batch_id || "").toLowerCase() : "",
            csvAccessor: (r) => (/^ADK/i.test(r?.lan) ? (r.batch_id ?? "") : ""),
            width: 140,
          },
        ]
      : []),

      // Batch ID column (only for GQFSF LANs; non-GQFSF shows —)
    ...(hasGQFSF
      ? [
          {
            key: "app_id",
            header: "APP ID",
            sortable: true,
            render: (r) => (/^GQFSF/i.test(r?.lan) ? (r.app_id ?? "—") : "—"),
            sortAccessor: (r) =>
              /^GQFSF/i.test(r?.lan) ? String(r?.app_id || "").toLowerCase() : "",
            csvAccessor: (r) => (/^GQFSF/i.test(r?.lan) ? (r.app_id ?? "") : ""),
            width: 140,
          },
        ]
      : []),
      // App ID column (only for NonGQFSF LANs; non-FSFshows —)
    ...(hasGQNonFSF
      ? [
          {
            key: "app_id",
            header: "APP ID",
            sortable: true,
            render: (r) => (/^GQNonFSF/i.test(r?.lan) ? (r.app_id ?? "—") : "—"),
            sortAccessor: (r) =>
              /^GQNonFSF/i.test(r?.lan) ? String(r?.app_id || "").toLowerCase() : "",
            csvAccessor: (r) => (/^GQNonFSF/i.test(r?.lan) ? (r.app_id ?? "") : ""),
            width: 140,
          },
        ]
      : []),

    // ⛔ Customer ID column removed as requested

    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,
      render: (r) =>
        r.mobile_number ? (
          <a href={`tel:${r.mobile_number}`} style={phoneLink}>
            {r.mobile_number}
          </a>
        ) : (
          "—"
        ),
      width: 160,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (r) => (
        <span style={statusPillStyle(r.status)}>
          {r.status || "Pending"}
        </span>
      ),
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
      csvAccessor: () => "",
      width: 120,
    },
  ];

  return (
    <DataTable
      title={title}
      rows={rows}
      columns={columns}
      globalSearchKeys={[
        "customer_name",
        "partner_loan_id",
        "lan",
        ...(hasADK ? ["batch_id"] : []),
        ...(hasGQFSF ? ["app_id"] : []),
        ...(hasGQNonFSF ? ["app_id"] : []),
        "mobile_number",
        "status",
      ]}
      initialSort={{ key: "disbursement_date", dir: "desc" }}
      exportFileName="login_stage_loans"
    />
  );
};

export default LoginCaseScreen;

