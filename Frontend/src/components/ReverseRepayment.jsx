import React, { useMemo, useState } from "react";
import api from "../api/api";

const cardStyle = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 10px 30px rgba(2, 6, 23, 0.06)",
};

const labelStyle = {
  display: "block",
  fontSize: 14,
  fontWeight: 700,
  color: "#111827",
  marginBottom: 8,
};

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: 14,
  color: "#111827",
  background: "#fff",
  boxSizing: "border-box",
};

const errorTextStyle = {
  marginTop: 6,
  fontSize: 12,
  color: "#b91c1c",
  fontWeight: 600,
};

const helpTextStyle = {
  marginTop: 6,
  fontSize: 12,
  color: "#6b7280",
};

const buttonStyle = {
  padding: "12px 18px",
  borderRadius: 12,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  padding: "12px 18px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const statusBox = (type) => {
  if (type === "success") {
    return {
      background: "rgba(16,185,129,.10)",
      color: "#065f46",
      border: "1px solid rgba(16,185,129,.35)",
    };
  }
  if (type === "error") {
    return {
      background: "rgba(239,68,68,.10)",
      color: "#991b1b",
      border: "1px solid rgba(239,68,68,.35)",
    };
  }
  return {
    background: "rgba(59,130,246,.10)",
    color: "#1d4ed8",
    border: "1px solid rgba(59,130,246,.35)",
  };
};

const ReverseRepayment = () => {
  const [form, setForm] = useState({
    lan: "",
    payment_id: "",
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverState, setServerState] = useState({
    type: "",
    message: "",
    data: null,
  });

  const trimmed = useMemo(
    () => ({
      lan: form.lan.trim(),
      payment_id: form.payment_id.trim(),
    }),
    [form]
  );

  const validate = () => {
    const errors = {};

    if (!trimmed.lan) {
      errors.lan = "LAN is required.";
    } else if (trimmed.lan.length < 3) {
      errors.lan = "Enter a valid LAN.";
    }

    if (!trimmed.payment_id) {
      errors.payment_id = "Payment ID is required.";
    } else if (trimmed.payment_id === "0") {
      errors.payment_id = "Payment ID cannot be 0.";
    }

    return errors;
  };

  const onChange = (key) => (e) => {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
    setServerState({ type: "", message: "", data: null });
  };

  const handleReset = () => {
    setForm({ lan: "", payment_id: "" });
    setFieldErrors({});
    setServerState({ type: "", message: "", data: null });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = validate();
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setServerState({ type: "", message: "", data: null });

    try {
      const payload = {
        lan: trimmed.lan,
        payment_id: trimmed.payment_id,
      };

      // Adjust endpoint as per your backend route
      const res = await api.post("/delete-cashflow/reverse-repayment", payload);

      setServerState({
        type: "success",
        message:
          res?.data?.message ||
          "Repayment reversal executed successfully.",
        data: res?.data || null,
      });
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        "Failed to reverse repayment.";

      setServerState({
        type: "error",
        message: msg,
        data: err?.response?.data || null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={{ marginBottom: 20 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Reverse Repayment
            </h2>
            <p
              style={{
                marginTop: 8,
                marginBottom: 0,
                color: "#6b7280",
                fontSize: 14,
              }}
            >
              Enter LAN and Payment ID to run repayment reversal.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 18,
              }}
            >
              <div>
                <label style={labelStyle}>LAN</label>
                <input
                  type="text"
                  value={form.lan}
                  onChange={onChange("lan")}
                  placeholder="Enter LAN"
                  style={{
                    ...inputStyle,
                    borderColor: fieldErrors.lan ? "#ef4444" : "#d1d5db",
                  }}
                />
                {fieldErrors.lan ? (
                  <div style={errorTextStyle}>{fieldErrors.lan}</div>
                ) : (
                  <div style={helpTextStyle}>
                    Example: GQFSF111521
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Payment ID</label>
                <input
                  type="text"
                  value={form.payment_id}
                  onChange={onChange("payment_id")}
                  placeholder="Enter Payment ID"
                  style={{
                    ...inputStyle,
                    borderColor: fieldErrors.payment_id ? "#ef4444" : "#d1d5db",
                  }}
                />
                {fieldErrors.payment_id ? (
                  <div style={errorTextStyle}>{fieldErrors.payment_id}</div>
                ) : (
                  <div style={helpTextStyle}>
                    Alphanumeric Payment ID is allowed.
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 24,
                flexWrap: "wrap",
              }}
            >
              <button type="submit" disabled={submitting} style={buttonStyle}>
                {submitting ? "Processing..." : "Run Reversal"}
              </button>

              <button
                type="button"
                onClick={handleReset}
                disabled={submitting}
                style={secondaryButtonStyle}
              >
                Reset
              </button>
            </div>
          </form>

          {serverState.message ? (
            <div
              style={{
                marginTop: 22,
                borderRadius: 14,
                padding: 16,
                ...statusBox(serverState.type),
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                {serverState.type === "success" ? "Success" : "Response"}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                {serverState.message}
              </div>

              {serverState.data ? (
                <pre
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 10,
                    background: "rgba(255,255,255,.55)",
                    overflowX: "auto",
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {JSON.stringify(serverState.data, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ReverseRepayment;