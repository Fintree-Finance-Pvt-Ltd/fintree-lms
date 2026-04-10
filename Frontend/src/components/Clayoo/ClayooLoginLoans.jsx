// import React, { useEffect, useState } from "react";
// import api from "../../api/api";
// import { useNavigate } from "react-router-dom";
// import DataTable from "../ui/DataTable";

// const LoginCaseScreen = ({
//   apiUrl = `/loan-booking/login-loans?table=loan_booking_clayyo&prefix=CLY`,
//   title = " CLAYYO Login Stage Loans",
//   lenderName = "CLAYYO",
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

//   // Show Batch ID column only if any LAN begins with ADK
//   const hasclyoo = rows.some((r) => typeof r?.lan === "string" && /^CLY/i.test(r.lan));

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
//           onClick={() => navigate(`/approved-loan-details-clayoo/${r.lan}`)}
//           title="View loan details"
//         >
//           {r.customer_name ?? "—"}
//         </span>
//       ),
//       sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
//       width: 220,
//     },
//     {
//       key: "hospital_name",
//       header: "Hospital Name",
      
//       sortable: true,
//       render: (r) => (
//           <span
//           style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
//           onClick={() => navigate(`/approved-loan-details-clayoo-hospital/${r.lan}`)}
//           title="View loan details"
//         > 
//          {r.hospital_name}
//         </span>
//       ),
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
//           onClick={() => navigate(`/approved-loan-details-clayoo/${r.lan}`)}
//         >
//           {r.lan ?? "—"}
//         </span>
//       ),
//       sortAccessor: (r) => (r.lan || "").toLowerCase(),
//       width: 140,
//     },

//     // Batch ID column (only for ADK LANs; non-ADK shows —)

//       ...(hasclyoo
//       ? [
//           {
//             key: "application_id",
//             header: "APPLICATION ID",
//             sortable: true,
//             render: (r) => (/^CLY/i.test(r?.lan) ? (r.app_id ?? "—") : "—"),
//             sortAccessor: (r) =>
//               /^CLY/i.test(r?.lan) ? String(r?.app_id || "").toLowerCase() : "",
//             csvAccessor: (r) => (/^CLY/i.test(r?.lan) ? (r.app_id ?? "") : ""),
//             width: 140,
//           },
//         ]
//       : []),

//     // ⛔ Customer ID column removed as requested

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
//       exportFileName="login_stage_loans"
//     />
//   );
// };

// export default LoginCaseScreen;


import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
 
const LoginCaseScreen = ({
  apiUrl = `/loan-booking/login-loans?table=loan_booking_clayyo&prefix=CLY`,
  title = "CLAYYO Login Stage Loans",
  lenderName = "CLAYYO",
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
 
  if (loading) return (
    <div style={{ display: 'grid', placeItems: 'center', height: '200px' }}>
      <div className="medical-spinner"></div>
      <p style={{ marginTop: '10px', color: '#0d9488', fontWeight: 600 }}>Accessing Records...</p>
    </div>
  );
 
  if (err) return (
    <div style={{ padding: '20px', background: '#fef2f2', borderRadius: '12px', borderLeft: '4px solid #ef4444' }}>
      <p style={{ color: "#b91c1c", fontWeight: 600, margin: 0 }}>{err}</p>
    </div>
  );
 
  const hasclyoo = rows.some((r) => typeof r?.lan === "string" && /^CLY/i.test(r.lan));
 
  // Updated Status Pill logic to use the new "Hospital" theme
  const statusPillStyle = (status) => {
    const map = {
      approved: { bg: "#dcfce7", bd: "#bbf7d0", fg: "#166534" },
      rejected: { bg: "#fee2e2", bd: "#fecaca", fg: "#991b1b" },
      pending:  { bg: "#fef3c7", bd: "#fde68a", fg: "#92400e" },
      login:    { bg: "#f1f5f9", bd: "#e2e8f0", fg: "#475569" },
    };
    const key = (status || "pending").toString().toLowerCase();
    const c = map[key] || map.login;
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "4px 12px",
      borderRadius: "6px",
      fontSize: "11px",
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.bd}`,
    };
  };
 
  const phoneLink = {
    color: "#0d9488", // Hospital Teal
    textDecoration: "none",
    fontWeight: 700,
    fontSize: "13px"
  };
 
  const columns = [
    {
      key: "customer_name",
      header: "Patient / Borrower",
      sortable: true,
      render: (r) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{ color: "#0d9488", fontWeight: 700, cursor: "pointer", fontSize: '14px' }}
            onClick={() => navigate(`/approved-loan-details-clayoo/${r.lan}`)}
          >
            {r.customer_name ?? "—"}
          </span>
          <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>Case ID: {r.lan}</span>
        </div>
      ),
      sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
      width: 220,
    },
    {
      key: "hospital_name",
      header: "Medical Facility",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#475569", fontWeight: 600, cursor: "pointer", fontSize: '13px' }}
          onClick={() => navigate(`/approved-loan-details-clayoo-hospital/${r.lan}`)}
        >
          🏥 {r.hospital_name}
        </span>
      ),
      width: 220,
    },
    {
      key: "lender",
      header: "Lender",
      render: () => <span style={{ fontWeight: 700, color: '#0f172a' }}>{lenderName}</span>,
      width: 120,
    },
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      render: (r) => (
        <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#0f172a', fontWeight: 'bold' }}>
          {r.lan ?? "—"}
        </code>
      ),
      sortAccessor: (r) => (r.lan || "").toLowerCase(),
      width: 140,
    },
    ...(hasclyoo
      ? [
          {
            key: "application_id",
            header: "APP ID",
            sortable: true,
            render: (r) => (/^CLY/i.test(r?.lan) ? <span style={{ fontWeight: 600 }}>{r.app_id ?? "—"}</span> : "—"),
            width: 140,
          },
        ]
      : []),
    {
      key: "mobile_number",
      header: "Contact",
      sortable: true,
      render: (r) =>
        r.mobile_number ? (
          <a href={`tel:${r.mobile_number}`} style={phoneLink}>
            📞 {r.mobile_number}
          </a>
        ) : "—",
      width: 160,
    },
    {
      key: "status",
      header: "Stage",
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
      header: "Medical Files",
      render: (r) => (
        <button
          onClick={() => navigate(`/documents/${r.lan}`)}
          style={{
            padding: "6px 12px",
            borderRadius: "6px",
            border: "1px solid #0d9488",
            color: "#0d9488",
            background: "#fff",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "700",
            transition: '0.2s'
          }}
          className="medical-btn-docs"
        >
          📋 Records
        </button>
      ),
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
        .medical-spinner {
          width: 30px;
          height: 30px;
          border: 3px solid #ccfbf1;
          border-top: 3px solid #0d9488;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
       
        .medical-btn-docs:hover {
          background: #0d9488 !important;
          color: #fff !important;
        }
      `}</style>
      <DataTable
        title={title}
        rows={rows}
        columns={columns}
        globalSearchKeys={["customer_name", "lan", "mobile_number", "status"]}
        initialSort={{ key: "lan", dir: "desc" }}
        exportFileName="clayyo_login_records"
      />
    </div>
  );
};
 
export default LoginCaseScreen;
 