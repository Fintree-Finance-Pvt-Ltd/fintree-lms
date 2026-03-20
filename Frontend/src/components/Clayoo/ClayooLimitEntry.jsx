import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";


const ClayooLimitEntry = ({
  apiUrl = `/clayyo-loans/credit-approved-loans?table=loan_booking_clayyo&prefix=CLY`,
  title = "Credit Limit Approval And Disburse Loans",
  lenderName = "CLAYOO",
  tableName = "loan_booking_clayyo",
}) => {
  const [rows, setRows] = useState([]);
  const [limits, setLimits] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState({});
  const [err, setErr] = useState("");
  const [actionLan, setActionLan] = useState(null);
const [toast, setToast] = useState(null);

// Bank modal
const [showBankModal, setShowBankModal] = useState(false);
const [selectedLoan, setSelectedLoan] = useState(null);
const [bankForm, setBankForm] = useState({
  account_no: "",
  ifsc: "",
  account_type: "SAVINGS",
  bank_name: "",
  account_holder_name: "",
  mandate_amount: "",
  mandate_start_date: "",
  mandate_end_date: "",
  mandate_frequency: "monthly",
});
const [bankLoading, setBankLoading] = useState(false);
const [bankError, setBankError] = useState("");
const [bankResult, setBankResult] = useState(null);
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
const handleBankChange = (e) => {
  const { name, value } = e.target;
  setBankForm((prev) => ({ ...prev, [name]: value }));
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

const handleAgreementEsign = async (row) => {
  const lan = row.lan;

  if (row.agreement_esign_status === "SIGNED") {
    alert("Agreement already signed");
    return;
  }

  if (!window.confirm(`Send agreement eSign to ${lan}?`)) return;

  setActionLan(lan);

  try {
    await api.post(`/esign/${lan}/esign/agreement`);

    setRows((old) =>
      old.map((r) =>
        r.lan === lan
          ? { ...r, agreement_esign_status: "INITIATED" }
          : r
      )
    );

    setToast({ type: "success", msg: "Agreement eSign initiated" });
  } catch (err) {
    setToast({ type: "error", msg: "Failed to start agreement eSign" });
  } finally {
    setActionLan(null);
    setTimeout(() => setToast(null), 3000);
  }
};

const openBankModal = (loanRow) => {
  setSelectedLoan(loanRow);
  setBankError("");
  setBankResult(null);

  setBankForm({
    account_no: loanRow.account_number || "",
    ifsc: loanRow.ifsc || "",
    account_type: "SAVINGS",
    bank_name: loanRow.bank_name || "",
    account_holder_name: loanRow.customer_name || "",
    mandate_amount: loanRow.emi_amount || loanRow.loan_amount || "",
    mandate_start_date: new Date().toISOString().slice(0, 10),
    mandate_end_date: "",
    mandate_frequency: "monthly",
  });

  setShowBankModal(true);
};

const handleBankSubmit = async (e) => {
  e.preventDefault();
  if (!selectedLoan) return;

  const {
    account_no,
    ifsc,
    account_holder_name,
    mandate_amount,
    mandate_start_date,
    mandate_end_date,
    mandate_frequency,
    bank_name,
    account_type,
  } = bankForm;

  if (!account_no || !ifsc || !account_holder_name || !mandate_amount) {
    setBankError("Please fill all required fields.");
    return;
  }

  setBankLoading(true);

  try {
    const lan = selectedLoan.lan;

    // 1️⃣ verify
    const verifyRes = await api.post("/enach/verify-bank", {
      lan,
      account_no,
      ifsc,
      name: account_holder_name,
      bank_name,
      account_type,
      mandate_amount,
      amount: 1,
    });

    if (!verifyRes.data?.verified) {
      setBankError("Bank verification failed");
      setBankLoading(false);
      return;
    }

    // 2️⃣ create mandate
    const mandateRes = await api.post("/enach/create-mandate", {
      lan,
      amount: mandate_amount,
      max_amount: mandate_amount,
      start_date: mandate_start_date,
      end_date: mandate_end_date || null,
      frequency: mandate_frequency,
      account_no,
      ifsc,
      account_type,
      customer_name: account_holder_name,
      bank_name,
    });

    if (!mandateRes.data?.success) {
      setBankError("Mandate creation failed");
      return;
    }

    setBankResult({
      verified: true,
      mandate_created: true,
      document_id: mandateRes.data.documentId,
    });

  } catch (err) {
    setBankError("Something went wrong");
  } finally {
    setBankLoading(false);
  }
};


const EsignChip = ({ status }) => {
  const st = (status || "PENDING").toUpperCase();

  const map = {
    SIGNED: { bg: "#dcfce7", fg: "#14532d", label: "Signed" },
    INITIATED: { bg: "#dbeafe", fg: "#1e3a8a", label: "Initiated" },
    FAILED: { bg: "#fee2e2", fg: "#991b1b", label: "Failed" },
    PENDING: { bg: "#fef9c3", fg: "#713f12", label: "Pending" },
  };

  const c = map[st];

  return (
    <span style={{
      padding: "3px 8px",
      borderRadius: 999,
      fontSize: 11,
      background: c.bg,
      color: c.fg,
      fontWeight: 600
    }}>
      ● {c.label}
    </span>
  );
};

const handleOpenBank = (r) => {
  if (!isOpsApproved(r)) {
    alert("Ops approval required first");
    return;
  }

  openBankModal(r); // reuse existing
};

const closeBankModal = () => {
  setShowBankModal(false);
  setSelectedLoan(null);
  setBankError("");
  setBankResult(null);
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
  render: (r) => {
    const opsApproved = isOpsApproved(r);

    const disableBank =
      !opsApproved ||
      r.bank_status === "VERIFIED" ||
      r.bank_status === "MANDATE_CREATED";

    const isAgreementDisabled =
      !opsApproved ||
      actionLan === r.lan ||
      r.agreement_esign_status === "INITIATED" ||
      r.agreement_esign_status === "SIGNED";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

        <EsignChip status={r.agreement_esign_status} />

        {/* Agreement */}
        <button
          onClick={() => handleAgreementEsign(r)}
          disabled={isAgreementDisabled}
        >
          {r.agreement_esign_status === "SIGNED"
            ? "Already Signed"
            : r.agreement_esign_status === "INITIATED"
            ? "Pending Signature…"
            : actionLan === r.lan
            ? "Processing..."
            : "Send Agreement"}
        </button>

        {/* Bank */}
        <button
          onClick={() => handleOpenBank(r)}
          disabled={disableBank}
        >
          {r.bank_status === "MANDATE_CREATED"
            ? "Mandate Created"
            : r.bank_status === "VERIFIED"
            ? "Verified"
            : "Add Bank / Mandate"}
        </button>

      </div>
    );
  },
}
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
      {toast && (
  <div
    style={{
      marginBottom: 12,
      padding: "8px 12px",
      borderRadius: 6,
      background:
        toast.type === "error"
          ? "rgba(248,113,113,.1)"
          : "rgba(16,185,129,.08)",
      border:
        toast.type === "error"
          ? "1px solid rgba(248,113,113,.4)"
          : "1px solid rgba(16,185,129,.35)",
      color: toast.type === "error" ? "#991b1b" : "#14532d",
      fontWeight: 500,
    }}
  >
    {toast.msg}
  </div>
)}
    <DataTable
      title={title}
      rows={rows}
      columns={baseColumns}
      globalSearchKeys={globalSearchKeys}
      exportFileName="login_stage_loans"
    />
    {showBankModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Add Bank Details & Mandate</h3>

            <form onSubmit={handleBankSubmit} className="bank-form">
              <div className="field-row">
                <label>Account Holder Name*</label>
                <input
                  name="account_holder_name"
                  value={bankForm.account_holder_name}
                  onChange={handleBankChange}
                  readOnly
                />
              </div>

              <div className="field-row">
                <label>Bank Name</label>
                <input
                  name="bank_name"
                  value={bankForm.bank_name}
                  onChange={handleBankChange}
                  readOnly
                />
              </div>

              <div className="field-row">
                <label>Account Number*</label>
                <input
                  name="account_no"
                  value={bankForm.account_no}
                  onChange={handleBankChange}
                  readOnly
                />
              </div>

              <div className="field-row">
                <label>IFSC*</label>
                <input
                  name="ifsc"
                  value={bankForm.ifsc}
                  onChange={handleBankChange}
                  readOnly
                />
              </div>

              <div className="field-row">
                <label>Account Type</label>
                <select
                  name="account_type"
                  value={bankForm.account_type}
                  onChange={handleBankChange}
                >
                  <option value="SAVINGS">SAVINGS</option>
                  <option value="CURRENT">CURRENT</option>
                 
                </select>
              </div>

              <hr />

              <div className="field-row">
                <label>Mandate Amount (₹)*</label>
                <input
                  type="number"
                  name="mandate_amount"
                  value={bankForm.mandate_amount}
                  onChange={handleBankChange}
                  
                />
              </div>

              <div className="field-row">
                <label>Mandate Start Date*</label>
                <input
                  type="date"
                  name="mandate_start_date"
                  value={bankForm.mandate_start_date}
                  onChange={handleBankChange}
                  
                />
              </div>

              <div className="field-row">
                <label>Mandate End Date</label>
                <input
                  type="date"
                  name="mandate_end_date"
                  value={bankForm.mandate_end_date}
                  onChange={handleBankChange}
                  
                />
              </div>

              <div className="field-row">
                <label>Frequency</label>
                <select
                  name="mandate_frequency"
                  value={bankForm.mandate_frequency}
                  onChange={handleBankChange}
                >
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {bankError && (
                <p style={{ color: "#b91c1c", marginTop: 8 }}>{bankError}</p>
              )}

              {bankResult && (
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <div>
                    ✅ Verified: <b>{bankResult.verified ? "YES" : "NO"}</b>
                  </div>
                  {bankResult.fuzzy_score != null && (
                    <div>Fuzzy Score: {bankResult.fuzzy_score}</div>
                  )}
                  {bankResult.mandate_created && (
                    <div>
                      Mandate Created: <b>{bankResult.document_id}</b>
                    </div>
                  )}
                </div>
              )}

              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  gap: 8,
                  justifyContent: "flex-end",
                }}
              >
                <button type="button" onClick={closeBankModal}>
                  Cancel
                </button>
                <button type="submit" disabled={bankLoading}>
                  {bankLoading ? "Processing..." : "Verify & Create Mandate"}
                </button>
              </div>
            </form>
          </div>

          <style>{`
            .modal-backdrop {
              position: fixed;
              inset: 0;
              background: rgba(15,23,42,.45);
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 50;
            }
            .modal {
              background: #fff;
              border-radius: 12px;
              padding: 20px 24px;
              width: 480px;
              max-width: 95vw;
              box-shadow: 0 20px 40px rgba(15,23,42,.35);
            }
            .bank-form .field-row {
              display: flex;
              flex-direction: column;
              margin-bottom: 10px;
            }
            .bank-form label {
              font-size: 13px;
              font-weight: 600;
              margin-bottom: 4px;
            }
            .bank-form input,
            .bank-form select {
              padding: 8px;
              border-radius: 6px;
              border: 1px solid #d1d5db;
              font-size: 14px;
            }
          `}</style>
        </div>
      )}
    </>
  );
};

export default ClayooLimitEntry;
