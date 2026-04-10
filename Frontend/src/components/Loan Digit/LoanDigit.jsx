// import React, { useEffect, useState } from "react";
// import api from "../../api/api";
// import { useNavigate } from "react-router-dom";
// import DataTable from "../ui/DataTable";

// const LoginCaseScreen = ({
//   apiUrl = `/loan-booking/login-loans?table=loan_booking_loan_digit&prefix=LD`,
//   title = "Loan Digit Login Stage Loans",
//   lenderName = "LOAN-DIGIT",
// }) => {
//   const [rows, setRows] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [err, setErr] = useState("");
//   const navigate = useNavigate();

//   useEffect(() => {
//     let off = false;
//     setLoading(true);
//     api
//       .get(apiUrl)
//       .then((res) => !off && setRows(Array.isArray(res.data) ? res.data : []))
//       .catch(() => !off && setErr("Failed to fetch data."))
//       .finally(() => !off && setLoading(false));
//     return () => (off = true);
//   }, [apiUrl]);

//   if (loading) return <p>Loading…</p>;
//   if (err) return <p style={{ color: "#b91c1c", fontWeight: 600 }}>{err}</p>;

//   // Show Application ID column only if any LAN begins with LD
//   const hasLoanDigit = rows.some((r) => typeof r?.lan === "string" && /^LD/i.test(r.lan));

//   const statusPillStyle = (status) => {
//     const map = {
//       approved: { bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.35)", fg: "#065f46" },
//       rejected: { bg: "rgba(239,68,68,.12)",  bd: "rgba(239,68,68,.35)",  fg: "#7f1d1d"  },
//       pending:  { bg: "rgba(234,179,8,.12)",  bd: "rgba(234,179,8,.35)",  fg: "#713f12"  },
//       login:    { bg: "rgba(107,114,128,.12)",bd: "rgba(107,114,128,.35)", fg: "#374151" },
//     };
//     const key = (status || "pending").toString().toLowerCase();
//     const c = map[key] || map.login;
//     return {
//       display: "inline-flex",
//       alignItems: "center",
//       gap: 6,
//       padding: "6px 10px",
//       borderRadius: 999,
//       fontSize: 12,
//       fontWeight: 700,
//       background: c.bg,
//       color: c.fg,
//       border: `1px solid ${c.bd}`,
//     };
//   };

//   const phoneLink = {
//     color: "#2563eb",
//     textDecoration: "none",
//     fontWeight: 600,
//   };

//   const columns = [
//     {
//       key: "customer_name",
//       header: "Loan Details",
//       sortable: true,
//       render: (r) => (
//         <span
//           style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
//           onClick={() => navigate(`/approved-loan-details/${r.lan}`)}  // Adjust route if needed
//           title="View loan details"
//         >
//           {r.customer_name ?? "—"}
//         </span>
//       ),
//       sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
//       width: 220,
//     },
//     {
//       key: "lender",
//       header: "Lender",
//       render: () => lenderName,
//       csvAccessor: () => lenderName,
//       width: 120,
//     },
//     {
//       key: "lan",
//       header: "LAN",
//       sortable: true,
//       render: (r) => (
//         <span
//           style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
//           onClick={() => navigate(`/approved-loan-details/${r.lan}`)}  // Adjust route if needed
//         >
//           {r.lan ?? "—"}
//         </span>
//       ),
//       sortAccessor: (r) => (r.lan || "").toLowerCase(),
//       width: 140,
//     },
//     // Application ID column (only for LD LANs; non-LD shows —)
//     ...(hasLoanDigit
//       ? [
//           {
//             key: "application_id",
//             header: "APPLICATION ID",
//             sortable: true,
//             render: (r) => (/^LD/i.test(r?.lan) ? (r.app_id ?? "—") : "—"),
//             sortAccessor: (r) =>
//               /^LD/i.test(r?.lan) ? String(r?.app_id || "").toLowerCase() : "",
//             csvAccessor: (r) => (/^LD/i.test(r?.lan) ? (r.app_id ?? "") : ""),
//             width: 140,
//           },
//         ]
//       : []),
//     {
//       key: "mobile_number",
//       header: "Mobile Number",
//       sortable: true,
//       render: (r) =>
//         r.mobile_number ? (
//           <a href={`tel:${r.mobile_number}`} style={phoneLink}>
//             {r.mobile_number}
//           </a>
//         ) : (
//           "—"
//         ),
//       width: 160,
//     },
//     {
//       key: "status",
//       header: "Status",
//       sortable: true,
//       render: (r) => (
//         <span style={statusPillStyle(r.status)}>
//           {r.status || "Pending"}
//         </span>
//       ),
//       sortAccessor: (r) => (r.status || "").toLowerCase(),
//       csvAccessor: (r) => r.status || "Pending",
//       width: 140,
//     },
//     {
//       key: "docs",
//       header: "Documents",
//       render: (r) => (
//         <button
//           onClick={() => navigate(`/documents/${r.lan}`)}
//           style={{
//             padding: "8px 10px",
//             borderRadius: 8,
//             border: "1px solid #93c5fd",
//             color: "#1d4ed8",
//             background: "#fff",
//             cursor: "pointer",
//             fontSize: 13,
//             fontWeight: 600,
//           }}
//           title="Open documents"
//         >
//           📂 Docs
//         </button>
//       ),
//       csvAccessor: () => "",
//       width: 120,
//     },
//   ];

//   return (
//     <DataTable
//       title={title}
//       rows={rows}
//       columns={columns}
//       globalSearchKeys={[
//         "customer_name",
//         "partner_loan_id",
//         "lan",  
//         "mobile_number",
//         "status",
//       ]}
//       initialSort={{ key: "lan", dir: "desc" }}
//       exportFileName="login_stage_loans_loan_digit"
//     />
//   );
// };

// const LoanDigit = () => <LoginCaseScreen />;

// export default LoanDigit;


import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import "../../styles/LoginCaseScreen.css"; // Ensure you create this CSS file

const LoginCaseScreen = ({
  apiUrl = `/loan-booking/login-loans?table=loan_booking_loan_digit&prefix=LD`,
  title = "Loan Digit Login Stage Loans",
  lenderName = "LOAN-DIGIT",
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
      .catch(() => !off && setErr("Connectivity issue: Unable to sync case data."))
      .finally(() => !off && setLoading(false));
    return () => (off = true);
  }, [apiUrl]);

  if (loading) return (
    <div className="modern-loader-container">
      <div className="spinner"></div>
      <p>Syncing cases...</p>
    </div>
  );

  if (err) return <div className="modern-error-banner">{err}</div>;

  const hasLoanDigit = rows.some((r) => typeof r?.lan === "string" && /^LD/i.test(r.lan));

  const columns = [
    {
      key: "customer_name",
      header: "Case Details",
      sortable: true,
      render: (r) => (
        <div className="case-cell" onClick={() => navigate(`/approved-loan-details/${r.lan}`)}>
          <span className="case-primary">{r.customer_name ?? "Unknown Applicant"}</span>
          <span className="case-secondary">LAN: {r.lan ?? "—"}</span>
        </div>
      ),
      sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
      width: 260,
    },
    {
      key: "lender",
      header: "Lender Provider",
      render: () => <span className="lender-badge">{lenderName}</span>,
      width: 140,
    },
    ...(hasLoanDigit
      ? [
        {
          key: "application_id",
          header: "Internal App ID",
          sortable: true,
          render: (r) => (/^LD/i.test(r?.lan) ? <span className="mono-id">{r.app_id ?? "—"}</span> : "—"),
          width: 160,
        },
      ]
      : []),
    {
      key: "mobile_number",
      header: "Contact",
      render: (r) =>
        r.mobile_number ? (
          <a href={`tel:${r.mobile_number}`} className="modern-phone-link">
            📞 {r.mobile_number}
          </a>
        ) : "—",
      width: 160,
    },
    {
      key: "status",
      header: "Application Status",
      sortable: true,
      render: (r) => (
        <span className={`status-pill status-${(r.status || "pending").toString().toLowerCase()}`}>
          {r.status || "Pending"}
        </span>
      ),
      width: 150,
    },
    {
      key: "docs",
      header: "File Access",
      render: (r) => (
        <button
          className="btn-docs-modern"
          onClick={() => navigate(`/documents/${r.lan}`)}
          title="Open Repository"
        >
          <span>Documents</span>
        </button>
      ),
      width: 140,
    },
  ];

  return (
    <div className="login-case-wrapper">
      <header className="case-header">
        <h1>{title}</h1>
        <div className="case-stats">
          <span>{rows.length} Active Records</span>
        </div>
      </header>

      <div className="table-card">
        <DataTable
          title={null} // We use our custom header
          rows={rows}
          columns={columns}
          globalSearchKeys={["customer_name",
            "partner_loan_id",
            "lan",
            "status", 
            "mobile_number"]}
          initialSort={{ key: "lan", dir: "desc" }}
          exportFileName="loan_digit_logins"
        />
      </div>
    </div>
  );
};

const LoanDigit = () => <LoginCaseScreen />;
export default LoanDigit;
