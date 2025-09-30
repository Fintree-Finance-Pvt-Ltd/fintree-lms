// // components/DisbursedLoansTable.jsx
// import React, { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import api from "../api/api";
// import "../styles/DisbursedLoans.css";

// const DisbursedLoansTable = ({ apiEndpoint, title = "Disbursed Loans", amountField = "disbursement_amount" }) => {
//     const [disbursedLoans, setDisbursedLoans] = useState([]);
//     const navigate = useNavigate();

//     useEffect(() => {
//         const fetchDisbursedLoans = async () => {
//             try {
//                 const response = await api.get(apiEndpoint);
//                 const sortedLoans = response.data.sort((a, b) => b.lan.localeCompare(a.lan));
//                 setDisbursedLoans(sortedLoans);
//             } catch (err) {
//                 console.error(`Failed to fetch disbursed loans from ${apiEndpoint}`);
//             }
//         };

//         fetchDisbursedLoans();
//     }, [apiEndpoint]);

//     return (
//         <div className="disbursed-loans-container">
//             <h2>{title}</h2>
//             <table>
//                 <thead>
//                     <tr>
//                         <th>Customer Name</th>
//                         <th>LAN</th>
//                         <th>Disbursement Amount</th>
//                         <th>Disbursement Date</th>
//                         <th>Status</th>
//                     </tr>
//                 </thead>
//                 <tbody>
//                     {disbursedLoans.map((loan) => (
//                         <tr key={loan.lan}>
//                             <td>
//                                 <span className="clickable" onClick={() => navigate(`/loan-details/${loan.lan}`)}>
//                                     {loan.customer_name}
//                                 </span>
//                             </td>
//                             <td>
//                                 <span className="clickable" onClick={() => navigate(`/loan-details/${loan.lan}`)}>
//                                     {loan.lan}
//                                 </span>
//                             </td>
//                             <td>{loan.loan_amount}</td>
//                             <td>{loan.disbursement_date}</td>
//                             <td>{loan.status}</td>
//                         </tr>
//                     ))}
//                 </tbody>
//             </table>
//         </div>
//     );
// };

// export default DisbursedLoansTable;

// components/DisbursedLoansScreen.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import DataTable from "./ui/DataTable";
import LoaderOverlay from "./ui/LoaderOverlay";

const DisbursedLoansTable = ({
  apiEndpoint,
  title = "Disbursed Loans",
  amountField = "disbursement_amount",
  currency = "INR",
}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const navigate = useNavigate();

  // Fetch
  useEffect(() => {
    let off = false;
    setLoading(true);
    setErr(""); 
    api
      .get(apiEndpoint)
      .then((res) => {
        if (off) return;
        const data = Array.isArray(res.data) ? res.data : [];
        // original behavior: sort by LAN desc
        const sorted = [...data].sort((a, b) =>
          String(b?.lan ?? "").localeCompare(String(a?.lan ?? ""))
        );
        setRows(sorted);
        setErr("");
      })
      .catch((e) => {
        console.error(`Failed to fetch disbursed loans from ${apiEndpoint}`, e);
        if (!off) setErr("Failed to fetch data.");
      })
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
  }, [apiEndpoint]);

  // Status options
  const statuses = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.status).filter(Boolean)))],
    [rows]
  );

  // Apply status filter before sending to DataTable
  const filteredRows = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  // Formatters
  const nf = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }),
    [currency]
  );
  const formatAmount = (r) => {
    const raw = r?.[amountField] ?? r?.loan_amount;
    const n = Number(raw);
    return Number.isFinite(n) ? nf.format(n) : "—";
  };

  // Column defs
  const columns = [
    {
      key: "customer_name",
      header: "Customer Name",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/loan-details/${r.lan}`)}
          title="View loan details"
        >
          {r.customer_name ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
      width: 220,
    },
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/loan-details/${r.lan}`)}
          title="View loan details"
        >
          {r.lan ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.lan || "").toLowerCase(),
      width: 150,
    },
    {
      key: amountField,
      header: "Disbursement Amount",
      sortable: true,
      render: (r) => formatAmount(r),
      sortAccessor: (r) => {
        const v = Number(r?.[amountField] ?? r?.loan_amount ?? 0);
        return Number.isFinite(v) ? v : 0;
      },
      width: 190,
    },
    {
      key: "disbursement_date",
      header: "Disbursement Date",
      sortable: true,
      sortAccessor: (r) => (r.disbursement_date ? Date.parse(r.disbursement_date) : 0),
      width: 170,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (r) => {
        const map = {
          Disbursed: { bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.35)", fg: "#065f46" },
          Settled: { bg: "rgba(59,130,246,.12)", bd: "rgba(59,130,246,.35)", fg: "#1e3a8a" },
          Pending: { bg: "rgba(234,179,8,.12)", bd: "rgba(234,179,8,.35)", fg: "#713f12" },
          Failed: { bg: "rgba(239,68,68,.12)", bd: "rgba(239,68,68,.35)", fg: "#7f1d1d" },
        };
        const c = map[r.status] || { bg: "rgba(107,114,128,.12)", bd: "rgba(107,114,128,.35)", fg: "#374151" };
        return (
          <span
            style={{
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
            }}
          >
            {r.status ?? "—"}
          </span>
        );
      },
      sortAccessor: (r) => (r.status || "").toLowerCase(),
      width: 140,
    },
  ];


  return (
    <>
    <LoaderOverlay show={loading} label="Fetching data…" />
      {err && <p style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</p>}
    <DataTable
      title={title}
      rows={filteredRows}
      columns={columns}
      globalSearchKeys={["customer_name", "lan", "status", amountField, "disbursement_date"]}
      initialSort={{ key: "disbursement_date", dir: "desc" }}
      exportFileName="disbursed_loans"
      // right-side toolbar content (status filter)
      // renderTopRight={
      //   <select
      //     value={statusFilter}
      //     onChange={(e) => setStatusFilter(e.target.value)}
      //     style={{
      //       padding: "10px 12px",
      //       borderRadius: 10,
      //       border: "1px solid #d1d5db",
      //       background: "#fff",
      //       fontSize: 14,
      //       minWidth: 160,
      //       outline: "none",
      //     }}
      //   >
      //     {statuses.map((st) => (
      //       <option key={st} value={st}>
      //         {st === "all" ? "All statuses" : st}
      //       </option>
      //     ))}
      //   </select>
      // }
    />
    </>
  );
};

export default DisbursedLoansTable;
