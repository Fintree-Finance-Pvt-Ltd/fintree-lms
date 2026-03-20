import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";


const ClayooLimitEntry = ({
  apiUrl = `/clayyo-loans/credit-approved-loans?table=loan_booking_clayyo&prefix=CLY`,
  title = "Credit Approved Stage Loans",
  lenderName = "CLAYOO",
  tableName = "loan_booking_clayyo",
}) => {
  const [rows, setRows] = useState([]);
  const [limits, setLimits] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState({});
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let off = false;
    setLoading(true);
    setErr("");

    api
      .get(apiUrl)
      .then((res) => !off && setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => !off && setErr("Failed to fetch data."))
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
  }, [apiUrl]);

  const handleLimitChange = (lan, value) => {
  setLimits((prev) => ({
    ...prev,
    [lan]: value,
  }));
};

const isOpsApproved = (r) => r.status === "OPS_APPROVED";

const handleLimitSubmit = async (lan) => {
  const limit = Number(limits[lan]);

  if (!limit || limit <= 0) {
    alert("Enter valid limit");
    return;
  }

  try {
    setSubmitting((prev) => ({ ...prev, [lan]: true }));

    await api.put(`/clayyo-loans/set-limit/${lan}`, {
      limit,
      status: "LIMIT_REQUESTED",
      table: tableName,
    });

    setRows((prev) =>
      prev.map((r) =>
        r.lan === lan
          ? { ...r, final_limit: limit, status: "LIMIT_REQUESTED" }
          : r
      )
    );

  } catch (err) {
    console.error(err);
    alert("Failed to submit limit");
  } finally {
    setSubmitting((prev) => ({ ...prev, [lan]: false }));
  }
};

const handleAgreementEsign = async (r) => {
  if (!isOpsApproved(r)) {
    alert("Ops approval required first");
    return;
  }

  try {
    await api.post(`/esign/${r.lan}/esign/agreement`);

    setRows((prev) =>
      prev.map((row) =>
        row.lan === r.lan
          ? { ...row, agreement_esign_status: "INITIATED" }
          : row
      )
    );
  } catch (err) {
    console.error(err);
    alert("Failed to send agreement");
  }
};

const handleOpenBank = (r) => {
  if (!isOpsApproved(r)) {
    alert("Ops approval required first");
    return;
  }

  openBankModal(r); // reuse existing
};

  // styles
  const pill = (status) => {
    const map = {
      approved: { bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.35)", fg: "#065f46" },
      rejected: { bg: "rgba(239,68,68,.12)", bd: "rgba(239,68,68,.35)", fg: "#7f1d1d" },
      pending: { bg: "rgba(234,179,8,.12)", bd: "rgba(234,179,8,.35)", fg: "#713f12" },
      login: { bg: "rgba(107,114,128,.12)", bd: "rgba(107,114,128,.35)", fg: "#374151" },
    };
    const key = (status || "pending").toLowerCase();
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

  const link = { color: "#2563eb", textDecoration: "none", fontWeight: 600 };

  // base columns
  const baseColumns = [
    {
      key: "customer_name",
      header: "Loan Details",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/approved-loan-details-clayoo/${r.lan}`)}
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
    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,
      render: (r) =>
        r.mobile_number ? (
          <a href={`tel:${r.mobile_number}`} style={link}>
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
      render: (r) => <span style={pill(r.status)}>{r.status || "Pending"}</span>,
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
    {
  key: "loan_amount",
  header: "Requested",
  width: 120,
},
{
  key: "final_limit",
  header: "Approved Limit",
  width: 140,
},

{
  key: "limit_entry",
  header: "Final Limit",
  render: (r) => {
    const isAssigned = r.status === "LIMIT_REQUESTED";
    const isOpsComplete = r.status === "OPS_APPROVED";
    const isLoading = submitting[r.lan];

    return (
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="number"
          placeholder="Enter limit"
          value={limits[r.lan] ?? r.final_limit ?? ""}
          onChange={(e) => handleLimitChange(r.lan, e.target.value)}
          disabled={isAssigned || isLoading || isOpsComplete}
          style={{
            width: 120,
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            fontSize: 13,
            background: isAssigned ? "#f3f4f6" : "#fff",
            cursor: isAssigned ? "not-allowed" : "text",
          }}
        />

        <button
          onClick={() => handleLimitSubmit(r.lan)}
          disabled={isAssigned || isLoading || isOpsComplete}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            background: isAssigned
              ? "#9ca3af"
              : isLoading
              ? "#60a5fa"
              : isOpsComplete
              ? "#9ca3af"
              : "#2563eb",
            color: "#fff",
            border: "none",
            fontWeight: 600,
            cursor:
              isAssigned || isLoading || isOpsComplete ? "not-allowed" : "pointer",
          }}
        >
          {isAssigned ? "Assigned" : isLoading ? "Saving..." : isOpsComplete ? "Approved": "Submit"}
        </button>
      </div>
    );
  },
  csvAccessor: (r) => r.final_limit || "",
  width: 220,
},
{
  key: "post_limit_actions",
  header: "Agreement & Mandate",
  width: 240,
  render: (r) => {
    const opsApproved = isOpsApproved(r);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        
        {/* AGREEMENT BUTTON */}
        <button
          onClick={() => handleAgreementEsign(r)}
          disabled={!opsApproved}
          style={{
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid #93c5fd",
            color: opsApproved ? "#1d4ed8" : "#9ca3af",
            background: "#fff",
            cursor: opsApproved ? "pointer" : "not-allowed",
            fontWeight: 600,
          }}
        >
          {opsApproved ? "Send Agreement" : "Ops Pending"}
        </button>

        {/* MANDATE BUTTON */}
        <button
          onClick={() => handleOpenBank(r)}
          disabled={!opsApproved}
          style={{
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid #34d399",
            color: opsApproved ? "#047857" : "#9ca3af",
            background: opsApproved ? "#ecfdf5" : "#f3f4f6",
            cursor: opsApproved ? "pointer" : "not-allowed",
            fontWeight: 600,
          }}
        >
          {opsApproved ? "Add Bank / Mandate" : "Ops Pending"}
        </button>

      </div>
    );
  },
},
  ];

  // include batch_id in search/CSV only when present
  const globalSearchKeys = [
    "customer_name",
    "partner_loan_id",
    "lan",
    "mobile_number",
    "status",
  ];

  return (
    <>
    <LoaderOverlay show={loading} label="Fetching data…" />
      {err && <p style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</p>}
    <DataTable
      title={title}
      rows={rows}
      columns={baseColumns}
      globalSearchKeys={globalSearchKeys}
      exportFileName="login_stage_loans"
    />
    </>
  );
};

export default ClayooLimitEntry;
