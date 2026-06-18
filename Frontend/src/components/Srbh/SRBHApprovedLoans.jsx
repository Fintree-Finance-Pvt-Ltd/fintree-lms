// src/components/ApprovedLoansTable.js
import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay";

const SRBHApprovedLoans = ({
  apiUrl = "/srbh/operation-initiated-loans",
  title = "SRBH Approved Loans",
}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Which LAN is processing eSign
  const [actionLan, setActionLan] = useState(null);
  const [toast, setToast] = useState(null);

  // ---------- Bank / eNACH Modal ----------
  const [showBankModal, setShowBankModal] = useState(false);
  const [stampInputs, setStampInputs] = useState({});
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

        const data = Array.isArray(res.data.rows) ? res.data.rows : [];

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
        loanRow.customer_account_number || loanRow.account_number || "",

      ifsc: loanRow.bank_ifsc_code || loanRow.ifsc || "",

      account_type: loanRow.bank_account_type || "SAVINGS",

      bank_name: loanRow.customer_bank_name || loanRow.bank_name || "",

      account_holder_name:
        loanRow.customer_name_as_per_bank || loanRow.customer_name || "",

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
          mandData.message || "Mandate creation failed. Please try again.",
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
          "Something went wrong. Please try again.",
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

    const c = map[st] || map.PENDING;

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

  const handleAgreementEsign = async (row) => {
    const lan = row.lan;
    const status = (row.agreement_esign_status || "").toUpperCase();

    if (status === "SIGNED") {
      setToast({ type: "info", msg: "Agreement already signed." });
      resetToastAfterDelay();
      return;
    }

    if (!window.confirm(`Send agreement eSign to ${lan}?`)) return;

    setActionLan(lan);

    try {
      await api.post(`/esign/${lan}/esign/agreement`);

      setRows((old) =>
        old.map((r) =>
          r.lan === lan
            ? {
                ...r,
                agreement_esign_status: "INITIATED",
                agreement_esign_sent_at: new Date().toISOString(),
              }
            : r,
        ),
      );

      setToast({
        type: "success",
        msg: "Agreement eSign initiated.",
      });
      resetToastAfterDelay();
    } catch (err) {
      setToast({
        type: "error",
        msg: err.response?.data?.message || "Failed to start agreement eSign.",
      });
      resetToastAfterDelay();
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
      key: "stamp_paper_no",
      header: "Stamp Paper No.",
      render: (r) => {
        const savedStampNo = String(r.stamp_paper_no ?? "").trim();
        const value = stampInputs[r.lan] ?? savedStampNo ?? "";

        const isSaving = actionLan === r.lan;
        const isSaved = !!savedStampNo;

        return (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              value={value}
              disabled={isSaved || isSaving}
              onChange={(e) =>
                setStampInputs((prev) => ({
                  ...prev,
                  [r.lan]: e.target.value,
                }))
              }
              placeholder="Stamp no"
              style={{
                width: 130,
                padding: "7px 8px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 12,
                background: isSaved ? "#f3f4f6" : "#ffffff",
                cursor: isSaved ? "not-allowed" : "text",
              }}
            />

            <button
              onClick={async () => {
                if (isSaved) return;

                const stampNo = String(value || "").trim();

                if (!stampNo) {
                  setToast({
                    type: "error",
                    msg: "Please enter stamp paper number.",
                  });
                  resetToastAfterDelay();
                  return;
                }

                try {
                  setActionLan(r.lan);

                  await api.post("/motion-corp/update-stamp-number", {
                    lan: r.lan,
                    stamp_paper_no: stampNo,
                  });

                  setRows((old) =>
                    old.map((row) =>
                      row.lan === r.lan
                        ? { ...row, stamp_paper_no: stampNo }
                        : row,
                    ),
                  );

                  setStampInputs((prev) => ({
                    ...prev,
                    [r.lan]: stampNo,
                  }));

                  setToast({
                    type: "success",
                    msg: "Stamp paper number updated successfully.",
                  });
                  resetToastAfterDelay();
                } catch (err) {
                  setToast({
                    type: "error",
                    msg:
                      err.response?.data?.message ||
                      "Failed to update stamp paper number.",
                  });
                  resetToastAfterDelay();
                } finally {
                  setActionLan(null);
                }
              }}
              disabled={isSaved || isSaving}
              style={{
                padding: "7px 10px",
                borderRadius: 8,
                border: isSaved ? "1px solid #d1d5db" : "1px solid #9ad9b0",
                color: isSaved ? "#6b7280" : "#0f7a42",
                background: isSaved ? "#f3f4f6" : "#eefbf3",
                cursor: isSaved || isSaving ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {isSaved ? "Saved" : isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        );
      },
    },

    {
      key: "status",
      header: "Loan Status",
      render: (r) => {
        const stage = (r.status || "Approved").toUpperCase();

        const statusMap = {
          APPROVED: {
            bg: "#eaf8ef",
            border: "#9ad9b0",
            color: "#0f7a42",
            dot: "#16a34a",
          },
          LOGIN: {
            bg: "#eef4ff",
            border: "#b8cdfa",
            color: "#1d4ed8",
            dot: "#2563eb",
          },
          DISBURSED: {
            bg: "#ecfdf3",
            border: "#a7f3d0",
            color: "#047857",
            dot: "#10b981",
          },
          PENDING: {
            bg: "#fff7e8",
            border: "#f4d08a",
            color: "#b45309",
            dot: "#f59e0b",
          },
          REJECTED: {
            bg: "#fef2f2",
            border: "#fecaca",
            color: "#b91c1c",
            dot: "#ef4444",
          },
        };

        const c = statusMap[stage] || {
          bg: "#f3f4f6",
          border: "#d1d5db",
          color: "#374151",
          dot: "#6b7280",
        };

        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 14px",
              borderRadius: "999px",
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: c.color,
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.2px",
              minWidth: 110,
              justifyContent: "center",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: c.dot,
                display: "inline-block",
              }}
            />
            {r.stage || "Approved"}
          </span>
        );
      },
    },
    {
      key: "stage",
      header: "Loan Stage",
      render: (r) => (
        <span
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: "rgba(59,130,246,.12)",
            border: "1px solid rgba(59,130,246,.35)",
            color: "#1e3a8a",
            fontWeight: 700,
          }}
        >
          ● {r.stage || "—"}
        </span>
      ),
    },

    // 🔹 AGREEMENT eSign
    // 🔹 AGREEMENT eSign
    {
      key: "agreement_esign",
      header: "Agreement eSign",
      render: (r) => {
        const status = (r.agreement_esign_status || "").toUpperCase();

        const isProcessing = actionLan === r.lan;
        const isSigned = status === "SIGNED";
        const canRetry = canRetryAgreementEsign(r);

        const disabled = isProcessing || isSigned || !canRetry;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <EsignChip status={r.agreement_esign_status} />

            <button
              onClick={() => handleAgreementEsign(r)}
              disabled={disabled}
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: disabled ? "1px solid #cbd5f5" : "1px solid #93c5fd",
                color: disabled ? "#9ca3af" : "#1d4ed8",
                background: "#fff",
                cursor: disabled ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {isProcessing
                ? "Processing..."
                : isSigned
                  ? "Already Signed"
                  : !canRetry
                    ? "Retry After 3 Hours"
                    : ["FAILED", "INITIATED", "PENDING"].includes(status)
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
      width: 280,
      render: (r) => {
        const bankStatus = (r.bank_status || "PENDING").toUpperCase();

        const disableBankBtn =
          bankStatus === "VERIFIED" ||
          bankStatus === "MANDATE_CREATED" ||
          bankStatus === "MANDATE_INITIATED" ||
          actionLan === r.lan;

        const bankChipMap = {
          PENDING: {
            bg: "#fff7e8",
            bd: "#f4d08a",
            fg: "#b45309",
            dot: "#f59e0b",
            label: "Pending Nach",
          },
          VERIFIED: {
            bg: "#eef4ff",
            bd: "#b8cdfa",
            fg: "#1d4ed8",
            dot: "#2563eb",
            label: "Verified",
          },
          MANDATE_INITIATED: {
            bg: "rgba(124,58,237,.12)",
            bd: "rgba(124,58,237,.35)",
            fg: "#5b21b6",
            label: "Mandate Initiated",
          },
          MANDATE_CREATED: {
            bg: "#eaf8ef",
            bd: "#9ad9b0",
            fg: "#0f7a42",
            dot: "#16a34a",
            label: "Mandate Created",
          },
        };

        const chip = bankChipMap[bankStatus] || bankChipMap.PENDING;

        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            {/* BANK STATUS CHIP */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 12px",
                borderRadius: "999px",
                fontSize: 12,
                fontWeight: 700,
                background: chip.bg,
                color: chip.fg,
                border: `1px solid ${chip.bd}`,
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: chip.dot,
                  display: "inline-block",
                }}
              />
              {chip.label}
            </span>

            {/* ACTION BUTTONS */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => nav(`/documents/${r.lan}`)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid #b8cdfa",
                  color: "#1d4ed8",
                  background: "#f8fbff",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                }}
              >
                Docs
              </button>

              <button
                onClick={() => !disableBankBtn && openBankModal(r)}
                disabled={disableBankBtn}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: disableBankBtn
                    ? "1px solid #d8dee9"
                    : "1px solid #9ad9b0",
                  color: disableBankBtn ? "#9ca3af" : "#0f7a42",
                  background: disableBankBtn ? "#f8fafc" : "#eefbf3",
                  cursor: disableBankBtn ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                  boxShadow: disableBankBtn
                    ? "none"
                    : "0 1px 2px rgba(15, 23, 42, 0.04)",
                }}
              >
                {bankStatus === "PENDING"
                  ? "Add Bank"
                  : bankStatus === "VERIFIED"
                    ? "Verified"
                    : "Mandate Created"}
              </button>
            </div>
          </div>
        );
      },
    },
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

export default SRBHApprovedLoans;
