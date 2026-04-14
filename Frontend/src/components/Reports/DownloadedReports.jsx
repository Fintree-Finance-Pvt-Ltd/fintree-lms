// import React, { useEffect, useState } from "react";
// import api from "../../api/api";
// import { useParams } from "react-router-dom";
// import "../../styles/ReportsDownload.css";

// const DownloadedReports = ({ reportIdFromParent }) => {
//   const { reportId: routeReportId } = useParams();
//   const reportId = reportIdFromParent || routeReportId;
//   const [downloads, setDownloads] = useState([]);

//   useEffect(() => {
//     if (!reportId) return;

//     const fetchDownloads = async () => {
//       try {
//         const response = await api.get(
//           `/reports/downloads?reportId=${encodeURIComponent(reportId)}`
//         );
//         setDownloads(response.data);
//         console.log("Fetched downloads:", response.data);
//       } catch (error) {
//         console.error("Failed to fetch downloads:", error);
//       }
//     };

//     fetchDownloads();
//     const interval = setInterval(fetchDownloads, 3000); // Refresh every 3 seconds

//     return () => clearInterval(interval); // Cleanup on unmount
//   }, [reportId]);

//   return (
//     <div className="downloaded-reports-container">
//       <h2 className="downloaded-reports-title">Downloaded Reports</h2>
//       <table className="download-table">
//         <thead>
//           <tr>
//             <th>Report</th>
//             <th>Report ID</th>
//             <th>Status</th>
//             <th>Time Taken</th>
//             <th>Description</th>
//             <th>Product</th>
//             <th>Created By</th>
//             <th>Generated At</th>
//           </tr>
//         </thead>
//         <tbody>
//           {Array.isArray(downloads) && downloads.length > 0 ? (
//             downloads.map((report, index) => (
//               <tr key={index}>
//                 <td>
//                   {report.status === "Completed" ? (
//                     <a
//                       href={report.downloadUrl}
//                       target="_blank"
//                       rel="noreferrer"
//                     >
//                       {report.file_name || "-"}
//                     </a>
//                   ) : (
//                     report.file_name || "-"
//                   )}
//                 </td>

//                 <td>{report.report_id}</td>
//                 <td>
//                   <span
//                     className={`status-badge ${report.status?.toLowerCase()}`}
//                   >
//                     {report.status || "Unknown"}
//                   </span>
//                 </td>
//                 <td>{report.time_taken || "In progress"}</td>
//                 <td>{report.description}</td>
//                 <td>{report.product}</td>
//                 <td>{report.created_by}</td>
//                 <td>{report.generated_at}</td>
//               </tr>
//             ))
//           ) : (
//             <tr>
//               <td colSpan="8">No reports found for this report ID.</td>
//             </tr>
//           )}
//         </tbody>
//       </table>
//     </div>
//   );
// };

// export default DownloadedReports;


// src/components/reports/DownloadedReports.jsx
// import React, { useEffect, useMemo, useState } from "react";
// import api from "../../api/api";
// import { useParams } from "react-router-dom";
// import DataTable from "../ui/DataTable";

// const StatusBadge = ({ status }) => {
//   const s = String(status || "Unknown");
//   const k = s.toLowerCase().replace(/\s+/g, "-"); // "In Progress" -> "in-progress"
//   const base = {
//     display: "inline-flex",
//     alignItems: "center",
//     gap: 6,
//     padding: "6px 10px",
//     borderRadius: 999,
//     fontSize: 12,
//     fontWeight: 800,
//     letterSpacing: ".01em",
//     border: "1px solid transparent",
//     userSelect: "none",
//   };
//   const variants = {
//     completed: { background: "rgba(16,185,129,.12)", color: "#047857", borderColor: "rgba(16,185,129,.35)" },
//     success:   { background: "rgba(16,185,129,.12)", color: "#047857", borderColor: "rgba(16,185,129,.35)" },
//     "in-progress": { background: "rgba(251,191,36,.14)", color: "#b45309", borderColor: "rgba(251,191,36,.35)" },
//     processing:    { background: "rgba(251,191,36,.14)", color: "#b45309", borderColor: "rgba(251,191,36,.35)" },
//     pending:       { background: "rgba(251,191,36,.14)", color: "#b45309", borderColor: "rgba(251,191,36,.35)" },
//     running:       { background: "rgba(251,191,36,.14)", color: "#b45309", borderColor: "rgba(251,191,36,.35)" },
//     failed:   { background: "rgba(239,68,68,.12)", color: "#b91c1c", borderColor: "rgba(239,68,68,.35)" },
//     error:    { background: "rgba(239,68,68,.12)", color: "#b91c1c", borderColor: "rgba(239,68,68,.35)" },
//     cancelled:{ background: "rgba(239,68,68,.12)", color: "#b91c1c", borderColor: "rgba(239,68,68,.35)" },
//     canceled: { background: "rgba(239,68,68,.12)", color: "#b91c1c", borderColor: "rgba(239,68,68,.35)" },
//     unknown:  { background: "#f3f4f6", color: "#374151", borderColor: "#e5e7eb" },
//   };
//   const style = { ...base, ...(variants[k] || variants.unknown) };

//   return (
//     <span style={style}>
//       {/(in-progress|processing|pending|running)/.test(k) && (
//         <span
//           style={{
//             width: 6, height: 6, borderRadius: 999, background: "currentColor", display: "inline-block",
//             animation: "dt-pulse 1.2s ease-in-out infinite",
//           }}
//         />
//       )}
//       {s || "Unknown"}
//       {/* inline keyframes once (scoped-ish) */}
//       <style>{`
//         @keyframes dt-pulse { 0%,100%{transform:scale(.9);opacity:.75} 50%{transform:scale(1.25);opacity:1}}
//       `}</style>
//     </span>
//   );
// };

// const fmtDate = (v) => {
//   if (!v) return "—";
//   const d = new Date(v);
//   return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
// };

// const DownloadedReports = ({ reportIdFromParent, title = "Downloaded Reports" }) => {
//   const { reportId: routeReportId } = useParams();
//   const reportId = reportIdFromParent || routeReportId;
//   const [downloads, setDownloads] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [err, setErr] = useState("");

//   useEffect(() => {
//     if (!reportId) return;

//     let off = false;
//     const fetchDownloads = async () => {
//       try {
//         const res = await api.get(`/reports/downloads?reportId=${encodeURIComponent(reportId)}`);
//         if (!off) {
//           setDownloads(Array.isArray(res.data) ? res.data : []);
//           setErr("");
//           setLoading(false);
//         }
//       } catch (e) {
//         if (!off) {
//           setErr("Failed to fetch downloads.");
//           setLoading(false);
//         }
//       }
//     };

//     fetchDownloads();
//     const interval = setInterval(fetchDownloads, 3000);
//     return () => {
//       off = true;
//       clearInterval(interval);
//     };
//   }, [reportId]);

//   // shape rows once for DataTable
//   const rows = useMemo(() => downloads.map((r, i) => ({ _idx: i, ...r })), [downloads]);

//   if (loading) return <p>Loading…</p>;
//   if (err) return <p style={{ color: "#b91c1c" }}>{err}</p>;

//   const linkStyle = {
//     color: "#1d4ed8",
//     fontWeight: 600,
//     textDecoration: "none",
//     borderBottom: "1px dashed rgba(37,99,235,.35)",
//   };

//   const columns = [
//     {
//       key: "file_name",
//       header: "Report",
//       width: 220,
//       sortable: true,
//       render: (r) =>
//         r.status === "Completed" && r.downloadUrl ? (
//           <a href={r.downloadUrl} target="_blank" rel="noreferrer" style={linkStyle}>
//             {r.file_name || "-"}
//           </a>
//         ) : (
//           r.file_name || "—"
//         ),
//       sortAccessor: (r) => (r.file_name || "").toLowerCase(),
//       csvAccessor: (r) => r.file_name || "",
//     },
//     {
//       key: "report_id",
//       header: "Report ID",
//       width: 180,
//       sortable: true,
//       sortAccessor: (r) => (r.report_id || "").toLowerCase(),
//       render: (r) => (
//         <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace', fontSize: 12.5 }}>
//           {r.report_id || "—"}
//         </span>
//       ),
//     },
//     {
//       key: "status",
//       header: "Status",
//       width: 160,
//       sortable: true,
//       render: (r) => <StatusBadge status={r.status} />,
//       sortAccessor: (r) => (r.status || "").toLowerCase(),
//       csvAccessor: (r) => r.status || "",
//     },
//     {
//       key: "time_taken",
//       header: "Time Taken",
//       width: 140,
//       sortable: true,
//       render: (r) => r.time_taken || "In progress",
//       sortAccessor: (r) => (r.time_taken || "\uFFFF"), // push "In progress" to bottom on asc
//       csvAccessor: (r) => r.time_taken || "In progress",
//     },
//     { key: "description", header: "Description", width: 260, sortable: true },
//     { key: "product", header: "Product", width: 140, sortable: true },
//     { key: "created_by", header: "Created By", width: 160, sortable: true },
//     {
//       key: "generated_at",
//       header: "Generated At",
//       width: 190,
//       sortable: true,
//       render: (r) => (
//         <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace', fontSize: 12.5 }}>
//           {fmtDate(r.generated_at)}
//         </span>
//       ),
//       sortAccessor: (r) => Date.parse(r.generated_at) || 0,
//       csvAccessor: (r) => (r.generated_at ? new Date(r.generated_at).toISOString() : ""),
//     },
//   ];

//   return (
//     <DataTable
//       title={title}
//       rows={rows}
//       columns={columns}
//       globalSearchKeys={["file_name", "report_id", "status", "description", "product", "created_by"]}
//       initialSort={{ key: "generated_at", dir: "desc" }}
//       exportFileName={`downloads_${reportId}`}
//       stickyHeader
//       zebra
//     />
//   );
// };

// export default DownloadedReports;



////////////// SAjag Jain //////////
import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useParams } from "react-router-dom";
import "../../styles/ReportsDownload.css";

const REPORT_ID_MAP = {
  "consolidated-mis": "Consolidated MIS",
  "due-demand-vs-collection-all-products":
    "Due Demand vs Collection Report(All products)",
  "cashflow-report": "CashFlow Report",
  "rps-generate-report": "RPS Generate Report",
  "delayed-interest-report": "Delayed Interest Report",
  "irr-report": "IRR Report",
  "adikosh-cam-report": "Adikosh CAM Report",
  "adikosh-cam-report-print": "Adikosh CAM Report Print",
  "cashflow-report-bank-date": "CashFlow Report Bank Date",
  "ccod-loan-data-report": "CCOD Loan Data Report",
  "bank-payment-file-report": "Bank Payment File Report",
  "consumer-bureau-report": "Consumer Bureau Report",
  "pay-out-report": "Pay Out Report",
  "bank-payment-file-bank-holiday-report": "Bank Payment File Bank Holiday Report",
  "due-demand-vs-collection-fintree":
    "Due Demand vs Collection Report(Fintree)",
};

const StatusBadge = ({ status }) => {
  const s = String(status || "Unknown");
  const k = s.toLowerCase().replace(/\s+/g, "-");

  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  };

  const variants = {
    completed: {
      background: "rgba(16,185,129,.12)",
      color: "#047857",
      borderColor: "rgba(16,185,129,.35)",
    },
    success: {
      background: "rgba(16,185,129,.12)",
      color: "#047857",
      borderColor: "rgba(16,185,129,.35)",
    },
    "in-progress": {
      background: "rgba(251,191,36,.14)",
      color: "#b45309",
      borderColor: "rgba(251,191,36,.35)",
    },
    processing: {
      background: "rgba(251,191,36,.14)",
      color: "#b45309",
      borderColor: "rgba(251,191,36,.35)",
    },
    pending: {
      background: "rgba(251,191,36,.14)",
      color: "#b45309",
      borderColor: "rgba(251,191,36,.35)",
    },
    running: {
      background: "rgba(251,191,36,.14)",
      color: "#b45309",
      borderColor: "rgba(251,191,36,.35)",
    },
    failed: {
      background: "rgba(239,68,68,.12)",
      color: "#b91c1c",
      borderColor: "rgba(239,68,68,.35)",
    },
    error: {
      background: "rgba(239,68,68,.12)",
      color: "#b91c1c",
      borderColor: "rgba(239,68,68,.35)",
    },
    cancelled: {
      background: "rgba(239,68,68,.12)",
      color: "#b91c1c",
      borderColor: "rgba(239,68,68,.35)",
    },
    canceled: {
      background: "rgba(239,68,68,.12)",
      color: "#b91c1c",
      borderColor: "rgba(239,68,68,.35)",
    },
    unknown: {
      background: "#f3f4f6",
      color: "#374151",
      borderColor: "#e5e7eb",
    },
  };

  return <span style={{ ...base, ...(variants[k] || variants.unknown) }}>{s}</span>;
};

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
};

const DownloadedReports = ({ reportIdFromParent }) => {
  const { reportId: routeReportId } = useParams();
  const routeOrParentReportId = reportIdFromParent || routeReportId;

  const backendReportId =
    REPORT_ID_MAP[routeOrParentReportId] || routeOrParentReportId;

  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!backendReportId) {
      setDownloads([]);
      setError("Report ID is missing.");
      return;
    }

    let isMounted = true;

    const fetchDownloads = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get(
          `/reports/downloads?reportId=${encodeURIComponent(backendReportId)}`
        );

        console.log("Fetched downloads:", response.data);
        console.log("Route reportId:", routeOrParentReportId);
        console.log("Backend reportId:", backendReportId);

        if (isMounted) {
          setDownloads(Array.isArray(response.data) ? response.data : []);
        }
      } catch (err) {
        console.error("Failed to fetch downloads:", err);
        if (isMounted) {
          setError("Failed to fetch downloads.");
          setDownloads([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchDownloads();
    const interval = setInterval(fetchDownloads, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [backendReportId, routeOrParentReportId]);

  return (
    <div className="downloaded-reports-container">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <h2 className="downloaded-reports-title" style={{ margin: 0 }}>
          Downloaded Reports
        </h2>

        {loading && (
          <span style={{ fontSize: "14px", color: "#6b7280" }}>
            Refreshing...
          </span>
        )}
      </div>

      {error ? (
        <p style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</p>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <table
          className="download-table"
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            background: "#fff",
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={thStyle}>Report</th>
              <th style={thStyle}>Report ID</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Time Taken</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Product</th>
              <th style={thStyle}>Created By</th>
              <th style={thStyle}>Generated At</th>
            </tr>
          </thead>

          <tbody>
            {Array.isArray(downloads) && downloads.length > 0 ? (
              downloads.map((report, index) => (
                <tr key={report.report_id || index} style={trStyle}>
                  <td style={tdStyle}>
                    {String(report.status || "").toLowerCase() === "completed" &&
                    report.downloadUrl ? (
                      <a
                        href={report.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: "#2563eb",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        {report.file_name || "-"}
                      </a>
                    ) : (
                      report.file_name || "-"
                    )}
                  </td>

                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>
                    {report.report_id || "-"}
                  </td>

                  <td style={tdStyle}>
                    <StatusBadge status={report.status} />
                  </td>

                  <td style={tdStyle}>{report.time_taken || "In progress"}</td>
                  <td style={tdStyle}>{report.description || "-"}</td>
                  <td style={tdStyle}>{report.product || "-"}</td>
                  <td style={tdStyle}>{report.created_by || "-"}</td>
                  <td style={tdStyle}>{formatDate(report.generated_at)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="8"
                  style={{ ...tdStyle, textAlign: "center", padding: "24px" }}
                >
                  No reports found for this report ID.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const thStyle = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: "13px",
  fontWeight: 700,
  color: "#374151",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "14px 16px",
  fontSize: "14px",
  color: "#111827",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "top",
};

const trStyle = {
  background: "#ffffff",
};

export default DownloadedReports;