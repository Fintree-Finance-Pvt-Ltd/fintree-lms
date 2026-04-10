// // import React, { useEffect, useState } from "react";
// // import api from "../../api/api";
// // import { useNavigate } from "react-router-dom";
// // import DataTable from "../ui/DataTable";

// // const ALLClayyoCaseScreen = ({
// //   apiUrl = `/loan-booking/all-loans?table=loan_booking_clayyo&prefix=CLY`,
// //   title = " CLAYYO All Loans Screen",
// //   lenderName = "CLAYYO",
// // }) => {
// //   const [rows, setRows] = useState([]);
// //   const [loading, setLoading] = useState(true);
// //   const [err, setErr] = useState("");
// //   const navigate = useNavigate();

// //   useEffect(() => {
// //     let off = false;
// //     setLoading(true);
// //     api
// //       .get(apiUrl)
// //       .then((res) => !off && setRows(res.data?.rows || []))
// //       .catch(() => !off && setErr("Failed to fetch data."))
// //       .finally(() => !off && setLoading(false));
// //     return () => (off = true);
// //   }, [apiUrl]);

// //   if (loading) return <p>Loading…</p>;
// //   if (err) return <p style={{ color: "#b91c1c", fontWeight: 600 }}>{err}</p>;

// //   // Show Batch ID column only if any LAN begins with ADK
// //   const hasclyoo = rows.some((r) => typeof r?.lan === "string" && /^CLY/i.test(r.lan));

// //   const statusPillStyle = (status) => {
// //     const map = {
// //       approved: { bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.35)", fg: "#065f46" },
// //       rejected: { bg: "rgba(239,68,68,.12)",  bd: "rgba(239,68,68,.35)",  fg: "#7f1d1d"  },
// //       pending:  { bg: "rgba(234,179,8,.12)",  bd: "rgba(234,179,8,.35)",  fg: "#713f12"  },
// //       login:    { bg: "rgba(107,114,128,.12)",bd: "rgba(107,114,128,.35)", fg: "#374151" },
// //     };
// //     const key = (status || "pending").toString().toLowerCase();
// //     const c = map[key] || map.login;
// //     return {
// //       display: "inline-flex",
// //       alignItems: "center",
// //       gap: 6,
// //       padding: "6px 10px",
// //       borderRadius: 999,
// //       fontSize: 12,
// //       fontWeight: 700,
// //       background: c.bg,
// //       color: c.fg,
// //       border: `1px solid ${c.bd}`,
// //     };
// //   };

// //   const phoneLink = {
// //     color: "#2563eb",
// //     textDecoration: "none",
// //     fontWeight: 600,
// //   };

// //   const columns = [
// //     {
// //       key: "customer_name",
// //       header: "Loan Details",
// //       sortable: true,
// //       render: (r) => (
// //         <span
// //           style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
// //           onClick={() => navigate(`/approved-loan-details-clayoo/${r.lan}`)}
// //           title="View loan details"
// //         >
// //           {r.customer_name ?? "—"}
// //         </span>
// //       ),
// //       sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
// //       width: 220,
// //     },
// //     {
// //       key: "hospital_name",
// //       header: "Hospital Name",
      
// //       sortable: true,
// //       render: (r) => (
// //           <span
// //           style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
// //           onClick={() => navigate(`/approved-loan-details-clayoo-hospital/${r.lan}`)}
// //           title="View loan details"
// //         > 
// //          {r.hospital_name}
// //         </span>
// //       ),
// //       width: 220,
// //     },
// //     {
// //       key: "lender",
// //       header: "Lender",
// //       render: () => lenderName,
// //       csvAccessor: () => lenderName,
// //       width: 120,
// //     },
// //     {
// //       key: "lan",
// //       header: "LAN",
// //       sortable: true,
// //       render: (r) => (
// //         <span
// //           style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
// //           onClick={() => navigate(`/approved-loan-details/${r.lan}`)}
// //         >
// //           {r.lan ?? "—"}
// //         </span>
// //       ),
// //       sortAccessor: (r) => (r.lan || "").toLowerCase(),
// //       width: 140,
// //     },

// //     // Batch ID column (only for ADK LANs; non-ADK shows —)

// //       ...(hasclyoo
// //       ? [
// //           {
// //             key: "application_id",
// //             header: "APPLICATION ID",
// //             sortable: true,
// //             render: (r) => (/^CLY/i.test(r?.lan) ? (r.app_id ?? "—") : "—"),
// //             sortAccessor: (r) =>
// //               /^CLY/i.test(r?.lan) ? String(r?.app_id || "").toLowerCase() : "",
// //             csvAccessor: (r) => (/^CLY/i.test(r?.lan) ? (r.app_id ?? "") : ""),
// //             width: 140,
// //           },
// //         ]
// //       : []),

// //     // ⛔ Customer ID column removed as requested

// //     {
// //       key: "mobile_number",
// //       header: "Mobile Number",
// //       sortable: true,
// //       render: (r) =>
// //         r.mobile_number ? (
// //           <a href={`tel:${r.mobile_number}`} style={phoneLink}>
// //             {r.mobile_number}
// //           </a>
// //         ) : (
// //           "—"
// //         ),
// //       width: 160,
// //     },
// //     {
// //       key: "status",
// //       header: "Status",
// //       sortable: true,
// //       render: (r) => (
// //         <span style={statusPillStyle(r.status)}>
// //           {r.status || "Pending"}
// //         </span>
// //       ),
// //       sortAccessor: (r) => (r.status || "").toLowerCase(),
// //       csvAccessor: (r) => r.status || "Pending",
// //       width: 140,
// //     },
// //     {
// //       key: "docs",
// //       header: "Documents",
// //       render: (r) => (
// //         <button
// //           onClick={() => navigate(`/documents/${r.lan}`)}
// //           style={{
// //             padding: "8px 10px",
// //             borderRadius: 8,
// //             border: "1px solid #93c5fd",
// //             color: "#1d4ed8",
// //             background: "#fff",
// //             cursor: "pointer",
// //             fontSize: 13,
// //             fontWeight: 600,
// //           }}
// //           title="Open documents"
// //         >
// //           📂 Docs
// //         </button>
// //       ),
// //       csvAccessor: () => "",
// //       width: 120,
// //     },
// //   ];

// //   return (
// //     <DataTable
// //       title={title}
// //       rows={rows}
// //       columns={columns}
// //       globalSearchKeys={[
// //         "customer_name",
// //         "partner_loan_id",
// //         "lan",
// //         "mobile_number",
// //         "status",
// //       ]}
// //       initialSort={{ key: "lan", dir: "desc" }}
// //       exportFileName="login_stage_loans"
// //     />
// //   );
// // };

// // export default ALLClayyoCaseScreen;

// import React, { useEffect, useState } from "react";
// import api from "../../api/api";
// import { useNavigate } from "react-router-dom";
// import DataTable from "../ui/DataTable";

// const ALLClayyoCaseScreen = ({
//   apiUrl = `/loan-booking/all-loans?table=loan_booking_clayyo&prefix=CLY`,
//   title = "CLAYYO All Loans Screen",
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
//       .then((res) => {
//         if (!off) {
//           setRows(res.data?.rows || []);
//           setErr("");
//         }
//       })
//       .catch(() => {
//         if (!off) setErr("Failed to fetch data.");
//       })
//       .finally(() => {
//         if (!off) setLoading(false);
//       });

//     return () => {
//       off = true;
//     };
//   }, [apiUrl]);

//   if (loading) return <p>Loading…</p>;
//   if (err) return <p style={{ color: "#b91c1c", fontWeight: 600 }}>{err}</p>;

//   const pillStyle = (value, type = "status") => {
//     const key = String(value || "").trim().toLowerCase();

//     const statusMap = {
//       login: {
//         bg: "rgba(107,114,128,.12)",
//         bd: "rgba(107,114,128,.35)",
//         fg: "#374151",
//       },
//       "bre approved": {
//         bg: "rgba(59,130,246,.12)",
//         bd: "rgba(59,130,246,.35)",
//         fg: "#1d4ed8",
//       },
//       "bre failed": {
//         bg: "rgba(239,68,68,.12)",
//         bd: "rgba(239,68,68,.35)",
//         fg: "#7f1d1d",
//       },
//       "credit approved": {
//         bg: "rgba(16,185,129,.12)",
//         bd: "rgba(16,185,129,.35)",
//         fg: "#065f46",
//       },
//       "rejected": {
//         bg: "rgba(239,68,68,.12)",
//         bd: "rgba(239,68,68,.35)",
//         fg: "#7f1d1d",
//       },
//       "limit requested": {
//         bg: "rgba(234,179,8,.12)",
//         bd: "rgba(234,179,8,.35)",
//         fg: "#713f12",
//       },
//       "ops approved": {
//         bg: "rgba(139,92,246,.12)",
//         bd: "rgba(139,92,246,.35)",
//         fg: "#5b21b6",
//       },
//       disbursed: {
//         bg: "rgba(16,185,129,.12)",
//         bd: "rgba(16,185,129,.35)",
//         fg: "#065f46",
//       },
//       "credit recheck": {
//         bg: "rgba(249,115,22,.12)",
//         bd: "rgba(249,115,22,.35)",
//         fg: "#9a3412",
//       },
//     };

//     const stageMap = {
//       login: {
//         bg: "rgba(107,114,128,.12)",
//         bd: "rgba(107,114,128,.35)",
//         fg: "#374151",
//       },
//       credit_initiated: {
//         bg: "rgba(59,130,246,.12)",
//         bd: "rgba(59,130,246,.35)",
//         fg: "#1d4ed8",
//       },
//       bre_rejected: {
//         bg: "rgba(239,68,68,.12)",
//         bd: "rgba(239,68,68,.35)",
//         fg: "#7f1d1d",
//       },
//       limit_approval_pending: {
//         bg: "rgba(234,179,8,.12)",
//         bd: "rgba(234,179,8,.35)",
//         fg: "#713f12",
//       },
//       credit_rework: {
//         bg: "rgba(249,115,22,.12)",
//         bd: "rgba(249,115,22,.35)",
//         fg: "#9a3412",
//       },
//       credit_rejected: {
//         bg: "rgba(239,68,68,.12)",
//         bd: "rgba(239,68,68,.35)",
//         fg: "#7f1d1d",
//       },
//       ops_initiated: {
//         bg: "rgba(14,165,233,.12)",
//         bd: "rgba(14,165,233,.35)",
//         fg: "#0c4a6e",
//       },
//       ops_approved: {
//         bg: "rgba(139,92,246,.12)",
//         bd: "rgba(139,92,246,.35)",
//         fg: "#5b21b6",
//       },
//       agreement_pending: {
//         bg: "rgba(168,85,247,.12)",
//         bd: "rgba(168,85,247,.35)",
//         fg: "#6b21a8",
//       },
//       mandate_pending: {
//         bg: "rgba(236,72,153,.12)",
//         bd: "rgba(236,72,153,.35)",
//         fg: "#9d174d",
//       },
//       ready_for_disbursal: {
//         bg: "rgba(34,197,94,.12)",
//         bd: "rgba(34,197,94,.35)",
//         fg: "#166534",
//       },
//       disbursed: {
//         bg: "rgba(16,185,129,.12)",
//         bd: "rgba(16,185,129,.35)",
//         fg: "#065f46",
//       },
//     };

//     const map = type === "stage" ? stageMap : statusMap;
//     const c = map[key] || {
//       bg: "rgba(107,114,128,.12)",
//       bd: "rgba(107,114,128,.35)",
//       fg: "#374151",
//     };

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
//       whiteSpace: "nowrap",
//     };
//   };

//   const phoneLink = {
//     color: "#2563eb",
//     textDecoration: "none",
//     fontWeight: 600,
//   };

//   const linkStyle = {
//     color: "#2563eb",
//     fontWeight: 600,
//     cursor: "pointer",
//   };

//   const columns = [
//     {
//       key: "customer_name",
//       header: "Loan Details",
//       sortable: true,
//       render: (r) => (
//         <span
//           style={linkStyle}
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
//         <span
//           style={linkStyle}
//           onClick={() => navigate(`/approved-loan-details-clayoo-hospital/${r.lan}`)}
//           title="View hospital details"
//         >
//           {r.hospital_name || "—"}
//         </span>
//       ),
//       sortAccessor: (r) => (r.hospital_name || "").toLowerCase(),
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
//           style={linkStyle}
//           onClick={() => navigate(`/approved-loan-details/${r.lan}`)}
//           title="View LAN details"
//         >
//           {r.lan ?? "—"}
//         </span>
//       ),
//       sortAccessor: (r) => (r.lan || "").toLowerCase(),
//       width: 140,
//     },
//     {
//       key: "app_id",
//       header: "APPLICATION ID",
//       sortable: true,
//       render: (r) => r.app_id ?? "—",
//       sortAccessor: (r) => String(r?.app_id || "").toLowerCase(),
//       csvAccessor: (r) => r.app_id ?? "",
//       width: 160,
//     },
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
//       sortAccessor: (r) => String(r?.mobile_number || ""),
//       width: 160,
//     },
//     {
//       key: "status",
//       header: "Status",
//       sortable: true,
//       render: (r) => (
//         <span style={pillStyle(r.status, "status")}>
//           {r.status || "Pending"}
//         </span>
//       ),
//       sortAccessor: (r) => (r.status || "").toLowerCase(),
//       csvAccessor: (r) => r.status || "Pending",
//       width: 180,
//     },
//     {
//       key: "stage",
//       header: "Stage",
//       sortable: true,
//       render: (r) => (
//         <span style={pillStyle(r.stage, "stage")}>
//           {r.stage || "—"}
//         </span>
//       ),
//       sortAccessor: (r) => (r.stage || "").toLowerCase(),
//       csvAccessor: (r) => r.stage || "",
//       width: 190,
//     },
//     {
//       key: "limit_rework_required",
//       header: "Deviation",
//       sortable: true,
//       render: (r) =>
//         Number(r.limit_rework_required) === 1 ? (
//           <span
//             title={r.limit_rework_reason || "Limit deviation found"}
//             style={{
//               display: "inline-flex",
//               alignItems: "center",
//               padding: "6px 10px",
//               borderRadius: 999,
//               fontSize: 12,
//               fontWeight: 700,
//               background: "rgba(249,115,22,.12)",
//               color: "#9a3412",
//               border: "1px solid rgba(249,115,22,.35)",
//               whiteSpace: "nowrap",
//             }}
//           >
//             Limit Deviation
//           </span>
//         ) : (
//           "—"
//         ),
//       sortAccessor: (r) => Number(r.limit_rework_required || 0),
//       csvAccessor: (r) =>
//         Number(r.limit_rework_required) === 1
//           ? r.limit_rework_reason || "Limit Deviation"
//           : "",
//       width: 180,
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
//         "hospital_name",
//         "lan",
//         "app_id",
//         "mobile_number",
//         "status",
//         "stage",
//         "limit_rework_reason",
//       ]}
//       initialSort={{ key: "lan", dir: "desc" }}
//       exportFileName="clayyo_all_loans"
//     />
//   );
// };

// export default ALLClayyoCaseScreen;


// import React, { useEffect, useState } from "react";
// import api from "../../api/api";
// import { useNavigate } from "react-router-dom";
// import DataTable from "../ui/DataTable";
 
// const ALLClayyoCaseScreen = ({
//   apiUrl = `/loan-booking/all-loans?table=loan_booking_clayyo&prefix=CLY`,
//   title = " CLAYYO All Loans Screen",
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
//       .then((res) => !off && setRows(res.data?.rows || []))
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
//           onClick={() => navigate(`/approved-loan-details/${r.lan}`)}
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
 
// export default ALLClayyoCaseScreen;
 
// import React, { useEffect, useState } from "react";
// import api from "../../api/api";
// import { useNavigate } from "react-router-dom";
// import DataTable from "../ui/DataTable";
 
// const ALLClayyoCaseScreen = ({
//   apiUrl = `/loan-booking/all-loans?table=loan_booking_clayyo&prefix=CLY`,
//   title = " CLAYYO All Loans Screen",
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
//       .then((res) => !off && setRows(res.data?.rows || []))
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
//           onClick={() => navigate(`/approved-loan-details/${r.lan}`)}
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
 
// export default ALLClayyoCaseScreen;
 
 
import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay"; // Import the loader
 
const ALLClayyoCaseScreen = ({
  apiUrl = `/loan-booking/all-loans?table=loan_booking_clayyo&prefix=CLY`,
  title = "CLAYYO All Loans Screen",
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
      .then((res) => {
        if (!off) {
          setRows(res.data?.rows || []);
          setErr("");
        }
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
  }, [apiUrl]);
 
  // Handle Error state
  if (err) return (
    <div style={{ padding: "20px", textAlign: "center" }}>
      <p style={{ color: "#b91c1c", fontWeight: 600 }}>{err}</p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: "8px 16px", cursor: "pointer", borderRadius: "8px", border: "1px solid #ccc" }}
      >
        Retry
      </button>
    </div>
  );
 
  const pillStyle = (value, type = "status") => {
    const key = String(value || "").trim().toLowerCase();
 
    const statusMap = {
      login: { bg: "rgba(107,114,128,.12)", bd: "rgba(107,114,128,.35)", fg: "#374151" },
      "bre approved": { bg: "rgba(59,130,246,.12)", bd: "rgba(59,130,246,.35)", fg: "#1d4ed8" },
      "bre failed": { bg: "rgba(239,68,68,.12)", bd: "rgba(239,68,68,.35)", fg: "#7f1d1d" },
      "credit approved": { bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.35)", fg: "#065f46" },
      "rejected": { bg: "rgba(239,68,68,.12)", bd: "rgba(239,68,68,.35)", fg: "#7f1d1d" },
      "limit requested": { bg: "rgba(234,179,8,.12)", bd: "rgba(234,179,8,.35)", fg: "#713f12" },
      "ops approved": { bg: "rgba(139,92,246,.12)", bd: "rgba(139,92,246,.35)", fg: "#5b21b6" },
      disbursed: { bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.35)", fg: "#065f46" },
      "credit recheck": { bg: "rgba(249,115,22,.12)", bd: "rgba(249,115,22,.35)", fg: "#9a3412" },
    };
 
    const stageMap = {
      login: { bg: "rgba(107,114,128,.12)", bd: "rgba(107,114,128,.35)", fg: "#374151" },
      credit_initiated: { bg: "rgba(59,130,246,.12)", bd: "rgba(59,130,246,.35)", fg: "#1d4ed8" },
      bre_rejected: { bg: "rgba(239,68,68,.12)", bd: "rgba(239,68,68,.35)", fg: "#7f1d1d" },
      limit_approval_pending: { bg: "rgba(234,179,8,.12)", bd: "rgba(234,179,8,.35)", fg: "#713f12" },
      credit_rework: { bg: "rgba(249,115,22,.12)", bd: "rgba(249,115,22,.35)", fg: "#9a3412" },
      credit_rejected: { bg: "rgba(239,68,68,.12)", bd: "rgba(239,68,68,.35)", fg: "#7f1d1d" },
      ops_initiated: { bg: "rgba(14,165,233,.12)", bd: "rgba(14,165,233,.35)", fg: "#0c4a6e" },
      ops_approved: { bg: "rgba(139,92,246,.12)", bd: "rgba(139,92,246,.35)", fg: "#5b21b6" },
      agreement_pending: { bg: "rgba(168,85,247,.12)", bd: "rgba(168,85,247,.35)", fg: "#6b21a8" },
      mandate_pending: { bg: "rgba(236,72,153,.12)", bd: "rgba(236,72,153,.35)", fg: "#9d174d" },
      ready_for_disbursal: { bg: "rgba(34,197,94,.12)", bd: "rgba(34,197,94,.35)", fg: "#166534" },
      disbursed: { bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.35)", fg: "#065f46" },
    };
 
    const map = type === "stage" ? stageMap : statusMap;
    const c = map[key] || {
      bg: "rgba(107,114,128,.12)",
      bd: "rgba(107,114,128,.35)",
      fg: "#374151",
    };
 
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
      whiteSpace: "nowrap",
    };
  };
 
  const columns = [
    {
      key: "customer_name",
      header: "Loan Details",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/approved-loan-details-clayoo/${r.lan}`)}
          title="View loan details"
        >
          {r.customer_name ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
      width: 220,
    },
    {
      key: "hospital_name",
      header: "Hospital Name",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/approved-loan-details-clayoo-hospital/${r.lan}`)}
          title="View hospital details"
        >
          {r.hospital_name || "—"}
        </span>
      ),
      sortAccessor: (r) => (r.hospital_name || "").toLowerCase(),
      width: 220,
    },
    {
      key: "lender",
      header: "Lender",
      render: () => lenderName,
      csvAccessor: () => lenderName,
      width: 120,
    },
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/approved-loan-details/${r.lan}`)}
          title="View LAN details"
        >
          {r.lan ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.lan || "").toLowerCase(),
      width: 140,
    },
    {
      key: "app_id",
      header: "APPLICATION ID",
      sortable: true,
      render: (r) => r.app_id ?? "—",
      sortAccessor: (r) => String(r?.app_id || "").toLowerCase(),
      csvAccessor: (r) => r.app_id ?? "",
      width: 160,
    },
    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,
      render: (r) =>
        r.mobile_number ? (
          <a href={`tel:${r.mobile_number}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
            {r.mobile_number}
          </a>
        ) : (
          "—"
        ),
      sortAccessor: (r) => String(r?.mobile_number || ""),
      width: 160,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (r) => (
        <span style={pillStyle(r.status, "status")}>
          {r.status || "Pending"}
        </span>
      ),
      sortAccessor: (r) => (r.status || "").toLowerCase(),
      csvAccessor: (r) => r.status || "Pending",
      width: 180,
    },
    {
      key: "stage",
      header: "Stage",
      sortable: true,
      render: (r) => (
        <span style={pillStyle(r.stage, "stage")}>
          {r.stage || "—"}
        </span>
      ),
      sortAccessor: (r) => (r.stage || "").toLowerCase(),
      csvAccessor: (r) => r.stage || "",
      width: 190,
    },
    {
      key: "limit_rework_required",
      header: "Deviation",
      sortable: true,
      render: (r) =>
        Number(r.limit_rework_required) === 1 ? (
          <span
            title={r.limit_rework_reason || "Limit deviation found"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              background: "rgba(249,115,22,.12)",
              color: "#9a3412",
              border: "1px solid rgba(249,115,22,.35)",
              whiteSpace: "nowrap",
            }}
          >
            Limit Deviation
          </span>
        ) : (
          "—"
        ),
      sortAccessor: (r) => Number(r.limit_rework_required || 0),
      csvAccessor: (r) =>
         Number(r.limit_rework_required) === 1
       ? r.limit_rework_reason || "Limit Deviation"
       : "",
      width: 180,
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
    <>
      {/* Hamster Loader Overlay */}
      <LoaderOverlay show={loading} label="Fetching case data..." />
 
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
          "stage",
          "limit_rework_reason",
        ]}
        initialSort={{ key: "lan", dir: "desc" }}
        exportFileName="clayyo_all_loans"
      />
    </>
  );
};
 
export default ALLClayyoCaseScreen;
 