// src/components/ApprovedLoansTable.js
import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const heliumApprovedLoans = ({
  apiUrl = "/helium-loans/approved-loans",
  title = "Approved Loans",
}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Which LAN is processing eSign
  const [actionLan, setActionLan] = useState(null);
  const [toast, setToast] = useState(null);

  // ---------- Bank / eNACH Modal ----------
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

  const nav = useNavigate();

  // ---------- INITIAL LOAD ----------
  useEffect(() => {
    let off = false;
    setLoading(true);
    setErr("");

    api
      .get(apiUrl)
      .then((res) => {
        if (off) return;
        const data = Array.isArray(res.data) ? res.data : [];
        setRows(data);
      })
      .catch(() => !off && setErr("Failed to fetch data."))
      .finally(() => !off && setLoading(false));

    return () => {
      off = true;
    };
  }, [apiUrl]);

  // ---------- Toast reset ----------
  const resetToastAfterDelay = () => {
    setTimeout(() => setToast(null), 3000);
  };

  // ---------- Date Helpers ----------
  const toYMD = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return "";
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const addMonths = (dateStr, months) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    d.setMonth(d.getMonth() + Number(months || 0));
    return toYMD(d);
  };

  const canRetryAgreementEsign = (row) => {
  const status = (row.agreement_esign_status || "").toUpperCase();

  if (!["FAILED", "PENDING", "INITIATED"].includes(status)) return true;

  if (!row.agreement_esign_sent_at) return true;

  const lastAttempt = new Date(row.agreement_esign_sent_at);
  const now = new Date();

  const diffHours = (now - lastAttempt) / (1000 * 60 * 60);

  return diffHours >= 3;
};

  // ---------- Bank Modal ----------
const openBankModal = (loanRow) => {
  console.log("loanRow in openBankModal:", loanRow);

  const startDate =
    loanRow.agreement_date || loanRow.login_date || toYMD(new Date());

  const endDate =
    loanRow.loan_tenure && Number(loanRow.loan_tenure) > 0
      ? addMonths(startDate, loanRow.loan_tenure)
      : "";

  const defaultAmount = loanRow.emi_amount || loanRow.loan_amount || "";

  setSelectedLoan(loanRow);
  setBankError("");
  setBankResult(null);

  setBankForm({
    account_no:
      loanRow.account_number ||
      loanRow.account_no ||
      loanRow.acc_no ||
      loanRow.bankAccNo ||
      "",
    ifsc:
      loanRow.ifsc ||
      loanRow.bank_ifsc ||
      loanRow.bankIfsc ||
      "",
    account_type: loanRow.bank_account_type || "SAVINGS",
    bank_name:
      loanRow.bank_name ||
      loanRow.customer_bank_name ||
      loanRow.bankName ||
      "",
    account_holder_name:
      loanRow.account_holder_name ||
      loanRow.acc_holder_name ||
      loanRow.customer_name ||
      "",
    mandate_amount: defaultAmount,
    mandate_start_date: startDate,
    mandate_end_date: endDate,
    mandate_frequency: "monthly",
  });

  setShowBankModal(true);
};



  const closeBankModal = () => {
    setShowBankModal(false);
    setSelectedLoan(null);
    setBankError("");
    setBankResult(null);
  };

  const handleBankChange = (e) => {
    const { name, value } = e.target;
    setBankForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleBankSubmit = async (e) => {
    e.preventDefault();
    if (!selectedLoan) return;

    setBankError("");
    setBankResult(null);

    const {
      account_no,
      ifsc,
      account_type,
      bank_name,
      account_holder_name,
      mandate_amount,
      mandate_start_date,
      mandate_end_date,
      mandate_frequency,
    } = bankForm;

    if (!account_no || !ifsc || !account_holder_name || !mandate_amount) {
      setBankError("Please fill all required fields.");
      return;
    }

    setBankLoading(true);
    try {
      const lan = selectedLoan.lan;
      const customer_identifier =
        selectedLoan.mobile_number || selectedLoan.email_id || "";

      // 1️⃣ Verify bank
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

      const verifyData = verifyRes.data || {};
      setBankResult({
        verified: verifyData.verified,
        fuzzy_score: verifyData.fuzzy_match_score,
      });

      if (!verifyData.verified) {
        setBankError("Bank verification failed. Please recheck details.");
        setBankLoading(false);
        return;
      }

      // 2️⃣ Create mandate
      const mandateRes = await api.post("/enach/create-mandate", {
        lan,
        customer_identifier,
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

      const mandData = mandateRes.data || {};
      const { documentId } = mandData;

      if (!documentId) {
        setBankError("Mandate creation failed.");
        setBankLoading(false);
        return;
      }

      if (!mandData.success) {
        setBankError(
          mandData.message || "Mandate creation failed. Please try again."
        );
        setBankLoading(false);
        return;
      }

      setBankResult((prev) => ({
        ...prev,
        mandate_created: true,
        document_id: documentId,
      }));
    } catch (err) {
      setBankError(
        err.response?.data?.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setBankLoading(false);
    }
  };

  // ---------- Status Chip ----------
  const EsignChip = ({ status }) => {
    const st = (status || "PENDING").toUpperCase();

    const map = {
      SIGNED: {
        bg: "rgba(16,185,129,.12)",
        bd: "rgba(16,185,129,.35)",
        fg: "#065f46",
        label: "Signed",
      },
      INITIATED: {
        bg: "rgba(59,130,246,.12)",
        bd: "rgba(59,130,246,.35)",
        fg: "#1e3a8a",
        label: "Initiated",
      },
      FAILED: {
        bg: "rgba(239,68,68,.12)",
        bd: "rgba(239,68,68,.35)",
        fg: "#7f1d1d",
        label: "Failed",
      },
      PENDING: {
        bg: "rgba(234,179,8,.12)",
        bd: "rgba(234,179,8,.35)",
        fg: "#713f12",
        label: "Pending",
      },
    };

    const c = map[st];

    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 8px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          background: c.bg,
          color: c.fg,
          border: `1px solid ${c.bd}`,
          textTransform: "uppercase",
        }}
      >
        ● {c.label}
      </span>
    );
  };

  // ---------- SANCTION ESIGN ----------
  // const handleSanctionEsign = async (row) => {
  //   const lan = row.lan;

  //   if (row.sanction_esign_status === "SIGNED") {
  //     setToast({ type: "info", msg: "Sanction already signed." });
  //     resetToastAfterDelay();
  //     return;
  //   }

  //   if (!window.confirm(`Send sanction eSign to ${lan}?`)) return;

  //   setActionLan(lan);

  //   try {
  //     const res = await api.post(`/esign/${lan}/esign/sanction`);
  //     setToast({
  //       type: "success",
  //       msg: "Sanction eSign initiated.",
  //     });
  //     resetToastAfterDelay();

  //     setRows((old) =>
  //       old.map((r) =>
  //         r.lan === lan
  //           ? { ...r, sanction_esign_status: "INITIATED" }
  //           : r
  //       )
  //     );
  //   } catch (err) {
  //     setToast({
  //       type: "error",
  //       msg: "Failed to start sanction eSign.",
  //     });
  //   } finally {
  //     setActionLan(null);
  //   }
  // };

  // ---------- AGREEMENT ESIGN ----------
  const handleAgreementEsign = async (row) => {
    const lan = row.lan;

    if (row.agreement_esign_status === "SIGNED") {
      setToast({ type: "info", msg: "Agreement already signed." });
      resetToastAfterDelay();
      return;
    }

    // if (row.sanction_esign_status !== "SIGNED") {
    //   setToast({
    //     type: "error",
    //     msg: "Sanction must be signed first.",
    //   });
    //   resetToastAfterDelay();
    //   return;
    // }

    if (!window.confirm(`Send agreement eSign to ${lan}?`)) return;

    setActionLan(lan);

    try {
      const res = await api.post(`/esign/${lan}/esign/agreement`);
      setToast({
        type: "success",
        msg: "Agreement eSign initiated.",
      });
      resetToastAfterDelay();

      setRows((old) =>
        old.map((r) =>
          r.lan === lan
            ? { ...r, agreement_esign_status: "INITIATED" }
            : r
        )
      );
    } catch (err) {
      setToast({
        type: "error",
        msg: "Failed to start agreement eSign.",
      });
    } finally {
      setActionLan(null);
    }
  };

  // ---------- TABLE COLUMNS ----------
  const columns = [
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
          onClick={() => nav(`/approved-loan-details-helium/${r.lan}`)}
        >
          {r.customer_name ?? "—"}
        </span>
      ),
    },

    { key: "partner_loan_id", header: "Partner Loan ID" },
    { key: "lan", header: "LAN" },
    { key: "mobile_number", header: "Mobile" },

    {
      key: "status",
      header: "Loan Status",
      render: (r) => (
        <span
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: "rgba(16,185,129,.12)",
            border: "1px solid rgba(16,185,129,.35)",
            color: "#065f46",
            fontWeight: 700,
          }}
        >
          ● {r.status || "Approved"}
        </span>
      ),
    },

    // 🔹 SANCTION eSign
    // {
    //   key: "sanction_esign",
    //   header: "Sanction eSign",
    //   render: (r) => {
    //     const disabled =
    //       actionLan === r.lan ||
    //       r.sanction_esign_status === "INITIATED" ||
    //       r.sanction_esign_status === "SIGNED";

    //     return (
    //       <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    //         <EsignChip status={r.sanction_esign_status} />

    //         <button
    //           onClick={() => handleSanctionEsign(r)}
    //           disabled={disabled}
    //           style={{
    //             padding: "6px 8px",
    //             borderRadius: 6,
    //             border: disabled
    //               ? "1px solid #cbd5f5"
    //               : "1px solid #93c5fd",
    //             color: disabled ? "#9ca3af" : "#1d4ed8",
    //             background: "#fff",
    //             cursor: disabled ? "not-allowed" : "pointer",
    //             fontWeight: 600,
    //           }}
    //         >
    //           {actionLan === r.lan
    //             ? "Processing..."
    //             : r.sanction_esign_status === "INITIATED"
    //             ? "Pending Signature…"
    //             : r.sanction_esign_status === "SIGNED"
    //             ? "Already Signed"
    //             : "Send Sanction eSign"}
    //         </button>
    //       </div>
    //     );
    //   },
    // },

    // 🔹 AGREEMENT eSign
    {
      key: "agreement_esign",
      header: "Agreement eSign",
      render: (r) => {
        const status = (r.agreement_esign_status || "").toUpperCase();

const disabled =
  actionLan === r.lan ||
  status === "SIGNED";

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <EsignChip status={r.agreement_esign_status} />

            <button
              onClick={() => handleAgreementEsign(r)}
              disabled={disabled}
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: disabled
                  ? "1px solid #cbd5f5"
                  : "1px solid #93c5fd",
                color: disabled ? "#9ca3af" : "#1d4ed8",
                background: "#fff",
                cursor: disabled ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {actionLan === r.lan
  ? "Processing..."
  : status === "SIGNED"
  ? "Already Signed"
  : ["FAILED", "INITIATED"].includes(status)
  ? "Retry Agreement eSign"
  : "Send Agreement eSign"}
            </button>
          </div>
        );
      },
    },

    // 🔹 ACTION Buttons
   {
  key: "actions",
  header: "Actions",
  width: 260,
  render: (r) => {
    const bankStatus = (r.bank_status || "PENDING").toUpperCase();

    const disableBankBtn =
      bankStatus === "VERIFIED" ||
      bankStatus === "MANDATE_CREATED" ||
      actionLan === r.lan;

    const bankChipMap = {
      PENDING: {
        bg: "rgba(234,179,8,.12)",
        bd: "rgba(234,179,8,.35)",
        fg: "#713f12",
        label: "Pending Bank",
      },
      VERIFIED: {
        bg: "rgba(59,130,246,.12)",
        bd: "rgba(59,130,246,.35)",
        fg: "#1e3a8a",
        label: "Verified",
      },
      MANDATE_CREATED: {
        bg: "rgba(16,185,129,.12)",
        bd: "rgba(16,185,129,.35)",
        fg: "#065f46",
        label: "Mandate Created",
      },
    };

    const chip = bankChipMap[bankStatus];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        
        {/* BANK STATUS CHIP */}
        <span
          style={{
            padding: "3px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            background: chip.bg,
            color: chip.fg,
            border: `1px solid ${chip.bd}`,
            textTransform: "uppercase",
            width: "fit-content",
          }}
        >
          ● {chip.label}
        </span>

        {/* DOCS BUTTON */}
        <button
          onClick={() => nav(`/documents/${r.lan}`)}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #93c5fd",
            color: "#1d4ed8",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          📂 Docs
        </button>

        {/* ADD BANK BUTTON */}
        <button
          onClick={() => !disableBankBtn && openBankModal(r)}
          disabled={disableBankBtn}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: disableBankBtn ? "1px solid #cbd5f5" : "1px solid #34d399",
            color: disableBankBtn ? "#9ca3af" : "#047857",
            background: disableBankBtn ? "#f3f4f6" : "#ecfdf5",
            cursor: disableBankBtn ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {bankStatus === "PENDING"
            ? "🏦 Add Bank"
            : bankStatus === "VERIFIED"
            ? "Verified"
            : "Mandate Created"}
        </button>
      </div>
    );
  },
}
  ];

  // ---------- FINAL JSX ----------
  return (
    <>
      <LoaderOverlay show={loading} label="Fetching data…" />

      {err && <p style={{ color: "#b91c1c" }}>{err}</p>}

      {toast && (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 12px",
            borderRadius: 6,
            background:
              toast.type === "error"
                ? "rgba(248,113,113,.1)"
                : toast.type === "success"
                ? "rgba(16,185,129,.08)"
                : "rgba(59,130,246,.08)",
            border:
              toast.type === "error"
                ? "1px solid rgba(248,113,113,.4)"
                : toast.type === "success"
                ? "1px solid rgba(16,185,129,.35)"
                : "1px solid rgba(59,130,246,.35)",
            color:
              toast.type === "error"
                ? "#991b1b"
                : toast.type === "success"
                ? "#14532d"
                : "#1e3a8a",
            fontWeight: 500,
          }}
        >
          {toast.msg}
        </div>
      )}

      <DataTable
        title={title}
        rows={rows}
        columns={columns}
        globalSearchKeys={[
          "customer_name",
          "partner_loan_id",
          "lan",
          "mobile_number",
          "agreement_esign_status",
        ]}
        initialSort={{ key: "lan", dir: "asc" }}
        exportFileName="approved_loans"
      />

      {/* BANK MODAL remains unchanged */}
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
                  readOnly
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

export default heliumApprovedLoans;
