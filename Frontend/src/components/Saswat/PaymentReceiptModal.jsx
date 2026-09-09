import React, { useEffect, useState } from "react";
import axios from "axios";

const getTodayDate = () => {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const PaymentReceiptModal = ({
  open,
  onClose,
  partnerCode = "SASWAT",
  defaultLan = "",
}) => {
  const [form, setForm] = useState({
  lan: "",
  payment_id: "",
  payment_date: getTodayDate(),
  amount: "",
});
  const [loanDetails, setLoanDetails] = useState(null);

  const [fetchingLoan, setFetchingLoan] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [error, setError] = useState("");

 useEffect(() => {
  if (open) {
    setForm({
      lan: defaultLan || "",
      payment_id: "",
      payment_date: getTodayDate(),
      amount: "",
    });

    setLoanDetails(null);
    setError("");
  }
}, [open, defaultLan]);

  if (!open) {
    return null;
  }

  /* =========================================================
     FORM CHANGE
  ========================================================= */

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (name === "lan") {
      setLoanDetails(null);
    }

    setError("");
  };

  /* =========================================================
     FETCH LOAN DETAILS
  ========================================================= */

  const fetchLoanDetails = async () => {
    const lan = form.lan.trim().toUpperCase();

    if (!lan) {
      setError("Please enter LAN");
      return;
    }

    try {
      setFetchingLoan(true);
      setError("");
      setLoanDetails(null);

      const response = await axios.get(
        "https://uat.fintreelms.com/api/payment-receipts/loan-details",
                // "http://localhost:5000/api/payment-receipts/loan-details",

        {
          params: {
            partner_code: partnerCode,
            lan,
          },
        }
      );

      if (!response.data?.success) {
        setError(
          response.data?.message || "Unable to fetch loan details"
        );
        return;
      }

      setLoanDetails(response.data.data);

      setForm((prev) => ({
        ...prev,
        lan,
      }));
    } catch (err) {
      console.error("Fetch loan error:", err);

      setLoanDetails(null);

      setError(
        err.response?.data?.message ||
          "Loan details could not be fetched"
      );
    } finally {
      setFetchingLoan(false);
    }
  };

  /* =========================================================
     READ ERROR WHEN RESPONSE TYPE IS BLOB
  ========================================================= */

  const getBlobErrorMessage = async (err) => {
    try {
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text();

        if (text) {
          const parsed = JSON.parse(text);

          return (
            parsed.message ||
            parsed.error ||
            "Unable to generate payment receipt"
          );
        }
      }

      return (
        err.response?.data?.message ||
        err.message ||
        "Unable to generate payment receipt"
      );
    } catch {
      return "Unable to generate payment receipt";
    }
  };

  /* =========================================================
     GENERATE PDF
  ========================================================= */

  const generateReceipt = async () => {
  const lan = form.lan.trim().toUpperCase();
  const paymentId = form.payment_id.trim();
const paymentDate = form.payment_date;
  const amount = Number(form.amount);

  if (!lan) {
    setError("Please enter LAN");
    return;
  }

  if (!paymentId) {
    setError("Please enter Payment ID");
    return;
  }

  if (!paymentDate) {
  setError(
    "Please select Payment Date"
  );

  return;
}

  if (!Number.isFinite(amount) || amount <= 0) {
    setError("Please enter a valid amount");
    return;
  }

  /*
    IMPORTANT:
    Open the tab immediately from the button click.
    Browser will not treat this as a popup.
  */
  const pdfWindow = window.open("", "_blank");

  if (!pdfWindow) {
    setError(
      "Unable to open receipt window. Please allow popups for this site."
    );
    return;
  }

  /*
    Show temporary loading message
  */
  pdfWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Generating Receipt...</title>

        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f8fafc;
            color: #334155;
          }

          .loader {
            text-align: center;
          }

          .loader h3 {
            margin-bottom: 8px;
          }
        </style>
      </head>

      <body>
        <div class="loader">
          <h3>Generating Payment Receipt...</h3>
          <div>Please wait</div>
        </div>
      </body>
    </html>
  `);

  try {
    setGenerating(true);
    setError("");

    /*
      Optional:
      validate/fetch loan first
    */
    if (!loanDetails) {
      try {
        const loanResponse = await axios.get(
          "https://uat.fintreelms.com/api/payment-receipts/loan-details",
          // "http://localhost:5000/api/payment-receipts/loan-details",
          {
            params: {
              partner_code: partnerCode,
              lan,
            },
          }
        );

        if (!loanResponse.data?.success) {
          pdfWindow.close();

          setError(
            loanResponse.data?.message || "Loan not found"
          );

          return;
        }

        setLoanDetails(
          loanResponse.data.data
        );
      } catch (loanError) {
        pdfWindow.close();

        setError(
          loanError.response?.data?.message ||
            "Loan not found"
        );

        return;
      }
    }

    /*
      Generate PDF
    */
    const response = await axios.post(
      "https://uat.fintreelms.com/api/payment-receipts/generate-pdf",
      // "http://localhost:5000/api/payment-receipts/generate-pdf",
      {
        partner_code: partnerCode,
        lan: lan,
        payment_id: paymentId,
        payment_date: paymentDate,
        amount: amount,
      },
      {
        responseType: "blob",
      }
    );

    /*
      Create PDF Blob
    */
    const pdfBlob = new Blob(
      [response.data],
      {
        type: "application/pdf",
      }
    );

    const pdfUrl =
      URL.createObjectURL(pdfBlob);

    /*
      Load PDF into already opened tab
    */
    pdfWindow.location.href =
      pdfUrl;

    /*
      Close modal
    */
    onClose();

    /*
      Release Blob URL later
    */
    setTimeout(() => {
      URL.revokeObjectURL(
        pdfUrl
      );
    }, 120000);

  } catch (error) {
    console.error(
      "Generate receipt error:",
      error
    );

    /*
      Close blank PDF tab if API failed
    */
    if (
      pdfWindow &&
      !pdfWindow.closed
    ) {
      pdfWindow.close();
    }

    /*
      Blob error handling
    */
    try {
      if (
        error.response?.data instanceof Blob
      ) {
        const text =
          await error.response.data.text();

        const json =
          JSON.parse(text);

        setError(
          json.message ||
            json.error ||
            "Unable to generate payment receipt"
        );

        return;
      }
    } catch (_) {
      // ignore JSON parse error
    }

    setError(
      error.response?.data?.message ||
        "Unable to generate payment receipt"
    );

  } finally {
    setGenerating(false);
  }
};


  /* =========================================================
     CLOSE ON BACKGROUND CLICK
  ========================================================= */

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !generating) {
      onClose();
    }
  };

  return (
    <div
      style={styles.overlay}
      onClick={handleOverlayClick}
    >
      <div style={styles.modal}>
        {/* HEADER */}

        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>
              Generate Payment Receipt
            </h2>

            <p style={styles.subtitle}>
              Saswat Payment Receipt
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            style={styles.closeButton}
          >
            ×
          </button>
        </div>

        {/* PARTNER */}

        <div style={styles.formGroup}>
          <label style={styles.label}>
            Partner
          </label>

          <input
            type="text"
            value="Saswat"
            disabled
            style={{
              ...styles.input,
              backgroundColor: "#f3f4f6",
              cursor: "not-allowed",
            }}
          />
        </div>

        {/* LAN */}

        <div style={styles.formGroup}>
          <label style={styles.label}>
            LAN
            <span style={styles.required}> *</span>
          </label>

          <div style={styles.lanContainer}>
            <input
              type="text"
              name="lan"
              value={form.lan}
              onChange={handleChange}
              placeholder="Enter LAN e.g. SW11008"
              style={{
                ...styles.input,
                flex: 1,
              }}
            />

            <button
              type="button"
              onClick={fetchLoanDetails}
              disabled={fetchingLoan || generating}
              style={{
                ...styles.fetchButton,
                opacity:
                  fetchingLoan || generating ? 0.6 : 1,
              }}
            >
              {fetchingLoan ? "Fetching..." : "Fetch"}
            </button>
          </div>
        </div>

        {/* FETCHED LOAN DETAILS */}

        {loanDetails && (
          <div style={styles.loanCard}>
            <div style={styles.loanCardHeader}>
              Loan Details
            </div>

            <div style={styles.loanRow}>
              <span style={styles.loanLabel}>
                Customer Name
              </span>

              <span style={styles.loanValue}>
                {loanDetails.customer_name || "-"}
              </span>
            </div>

            <div style={styles.loanRow}>
              <span style={styles.loanLabel}>
                LAN
              </span>

              <span style={styles.loanValue}>
                {loanDetails.lan || "-"}
              </span>
            </div>

            <div style={styles.loanRow}>
              <span style={styles.loanLabel}>
                Loan Account Number
              </span>

              <span style={styles.loanValue}>
                {loanDetails.loan_account_number ||
                  loanDetails.lan ||
                  "-"}
              </span>
            </div>

            <div style={styles.loanRow}>
              <span style={styles.loanLabel}>
                Product
              </span>

              <span style={styles.loanValue}>
                {loanDetails.product ||
                  loanDetails.lender_type ||
                  "-"}
              </span>
            </div>

            <div style={styles.loanRow}>
              <span style={styles.loanLabel}>
                Lender
              </span>

              <span style={styles.loanValue}>
                {loanDetails.lender || "-"}
              </span>
            </div>
          </div>
        )}

        {/* PAYMENT ID */}

        <div style={styles.formGroup}>
          <label style={styles.label}>
            Payment ID
            <span style={styles.required}> *</span>
          </label>

          <input
            type="text"
            name="payment_id"
            value={form.payment_id}
            onChange={handleChange}
            placeholder="Enter Payment ID"
            style={styles.input}
          />
        </div>

{/* PAYMENT DATE */}

<div style={styles.formGroup}>
  <label style={styles.label}>
    Payment Date
    <span style={styles.required}> *</span>
  </label>

  <input
    type="date"
    name="payment_date"
    value={form.payment_date}
    onChange={handleChange}
    style={styles.input}
  />
</div>
        {/* AMOUNT */}

        <div style={styles.formGroup}>
          <label style={styles.label}>
            Amount
            <span style={styles.required}> *</span>
          </label>

          <div style={styles.amountContainer}>
            <span style={styles.rupeeSymbol}>₹</span>

            <input
              type="number"
              name="amount"
              value={form.amount}
              onChange={handleChange}
              min="0"
              step="0.01"
              placeholder="Enter amount"
              style={styles.amountInput}
            />
          </div>
        </div>

        {/* ERROR */}

        {error && (
          <div style={styles.errorBox}>
            {error}
          </div>
        )}

        {/* ACTION BUTTONS */}

        <div style={styles.actions}>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            style={styles.cancelButton}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={generateReceipt}
            disabled={generating}
            style={{
              ...styles.generateButton,
              opacity: generating ? 0.7 : 1,
              cursor: generating
                ? "not-allowed"
                : "pointer",
            }}
          >
            {generating
              ? "Generating Receipt..."
              : "Generate Receipt"}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,

    display: "flex",
    justifyContent: "center",
    alignItems: "center",

    padding: "20px",

    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },

  modal: {
    width: "560px",
    maxWidth: "100%",
    maxHeight: "90vh",

    overflowY: "auto",

    backgroundColor: "#ffffff",

    borderRadius: "12px",

    boxShadow: "0 24px 60px rgba(0,0,0,0.22)",

    padding: "24px",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",

    marginBottom: "22px",
  },

  title: {
    margin: 0,

    fontSize: "22px",
    fontWeight: "700",

    color: "#111827",
  },

  subtitle: {
    margin: "4px 0 0 0",

    color: "#6b7280",

    fontSize: "13px",
  },

  closeButton: {
    border: "none",

    background: "transparent",

    fontSize: "28px",

    lineHeight: 1,

    color: "#6b7280",

    cursor: "pointer",
  },

  formGroup: {
    marginBottom: "17px",
  },

  label: {
    display: "block",

    marginBottom: "6px",

    color: "#374151",

    fontSize: "13px",
    fontWeight: "600",
  },

  required: {
    color: "#dc2626",
  },

  input: {
    width: "100%",
    height: "43px",

    boxSizing: "border-box",

    padding: "0 12px",

    border: "1px solid #d1d5db",

    borderRadius: "7px",

    outline: "none",

    fontSize: "14px",

    color: "#111827",
  },

  lanContainer: {
    display: "flex",

    gap: "8px",
  },

  fetchButton: {
    minWidth: "90px",

    padding: "0 15px",

    border: "1px solid #cbd5e1",

    borderRadius: "7px",

    backgroundColor: "#f8fafc",

    color: "#1e293b",

    fontWeight: "600",

    cursor: "pointer",
  },

  loanCard: {
    padding: "14px",

    marginBottom: "18px",

    backgroundColor: "#f8fafc",

    border: "1px solid #e2e8f0",

    borderRadius: "8px",
  },

  loanCardHeader: {
    marginBottom: "9px",

    color: "#111827",

    fontSize: "13px",

    fontWeight: "700",
  },

  loanRow: {
    display: "flex",

    justifyContent: "space-between",

    gap: "20px",

    padding: "5px 0",

    borderBottom: "1px solid #eef2f7",

    fontSize: "13px",
  },

  loanLabel: {
    color: "#64748b",
  },

  loanValue: {
    color: "#111827",

    fontWeight: "600",

    textAlign: "right",
  },

  amountContainer: {
    display: "flex",

    alignItems: "center",

    height: "43px",

    border: "1px solid #d1d5db",

    borderRadius: "7px",

    overflow: "hidden",
  },

  rupeeSymbol: {
    display: "flex",

    alignItems: "center",

    height: "100%",

    padding: "0 13px",

    backgroundColor: "#f8fafc",

    borderRight: "1px solid #d1d5db",

    color: "#475569",

    fontWeight: "600",
  },

  amountInput: {
    flex: 1,

    height: "100%",

    padding: "0 12px",

    border: "none",

    outline: "none",

    fontSize: "14px",
  },

  errorBox: {
    marginBottom: "16px",

    padding: "10px 12px",

    border: "1px solid #fecaca",

    borderRadius: "7px",

    backgroundColor: "#fef2f2",

    color: "#b91c1c",

    fontSize: "13px",
  },

  actions: {
    display: "flex",

    justifyContent: "flex-end",

    gap: "10px",

    marginTop: "24px",
  },

  cancelButton: {
    height: "41px",

    padding: "0 18px",

    border: "1px solid #d1d5db",

    borderRadius: "7px",

    backgroundColor: "#ffffff",

    color: "#374151",

    fontWeight: "600",

    cursor: "pointer",
  },

  generateButton: {
    height: "41px",

    padding: "0 20px",

    border: "none",

    borderRadius: "7px",

    backgroundColor: "#1d4ed8",

    color: "#ffffff",

    fontWeight: "600",
  },
};

export default PaymentReceiptModal;