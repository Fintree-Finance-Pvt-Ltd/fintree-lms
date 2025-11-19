import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/api";

const RepaymentAdd = () => {
  const { lan } = useParams();

  const [loanInfo, setLoanInfo] = useState({
    loan_limit: 0,
    outstanding_principal: 0,
    available_limit: 0,
    accrued_interest: 0,
    excess_payment: 0,
  });

  const [repayments, setRepayments] = useState([]);
  const [allocations, setAllocations] = useState([]);

  const [form, setForm] = useState({
    repayment_date: "",
    amount: "",
    mode: "",
    reference_no: "",
    notes: "",
  });

  const requiredFields = ["repayment_date", "amount"];
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch Data
  useEffect(() => {
    fetchLoanInfo();
    fetchRepayments();
    fetchAllocations();
  }, [lan]);

  const fetchLoanInfo = async () => {
    try {
      const res = await api.get(`/wctl-ccod/loan/${lan}`);
      if (res.data.success) {
        setLoanInfo(res.data.data);
      }
    } catch (err) {
      console.error("Loan fetch error", err);
    }
  };

  const fetchRepayments = async () => {
    try {
      const res = await api.get(`/wctl-ccod/repayment/${lan}`);
      if (res.data.success) {
        setRepayments(res.data.data);
      }
    } catch (err) {
      console.error("Repayment list error", err);
    }
  };

  const fetchAllocations = async () => {
    try {
      const res = await api.get(`/wctl-ccod/repayment/allocations/${lan}`);
      if (res.data.success) {
        setAllocations(res.data.data);
      }
    } catch (err) {
      console.error("Allocation fetch error", err);
    }
  };

  // Form change
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // Validate
  const validateForm = () => {
    const newErr = {};
    requiredFields.forEach((f) => {
      if (!form[f] || String(form[f]).trim() === "") {
        newErr[f] = "Required";
      }
    });
    setErrors(newErr);
    return Object.keys(newErr).length === 0;
  };

  // Submit repayment
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!validateForm()) {
      setMessage("❌ Please fill all required fields.");
      return;
    }

    const repayAmt = Number(form.amount);
    if (isNaN(repayAmt) || repayAmt <= 0) {
      setMessage("❌ Invalid repayment amount.");
      return;
    }

    setLoading(true);

    try {
      const payload = { lan, ...form };
      const res = await api.post("/wctl-ccod/repayment/create", payload);

      if (res.data.success) {
        setMessage("✅ Repayment recorded & allocated successfully.");

        fetchLoanInfo();
        fetchRepayments();
        fetchAllocations();

        setForm({
          repayment_date: "",
          amount: "",
          mode: "",
          reference_no: "",
          notes: "",
        });
      } else {
        setMessage(res.data.message);
      }
    } catch (err) {
      setMessage(
        err.response?.data?.message || "❌ Something went wrong. Try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Input component
  const renderInput = (label, name, type = "text") => (
    <div className="form-group">
      <label>
        {label} {requiredFields.includes(name) && <span className="req">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={form[name]}
        onChange={handleChange}
        className={errors[name] ? "error-input" : ""}
      />
      {errors[name] && <p className="error-text">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="repay-container">
      <h2>Repayment — LAN: {lan}</h2>

      {/* Loan Summary */}
      <div className="summary-box">
        <h3>Loan Summary</h3>
        <p>Loan Limit: <b>₹{loanInfo.loan_limit}</b></p>
        <p>Outstanding Principal: <b>₹{loanInfo.outstanding_principal}</b></p>
        <p>Accrued Interest: <b style={{ color: "red" }}>₹{loanInfo.accrued_interest}</b></p>
        <p>Available Limit: <b style={{ color: "green" }}>₹{loanInfo.available_limit}</b></p>
        <p>Excess Payment: <b style={{ color: "orange" }}>₹{loanInfo.excess_payment}</b></p>
      </div>

      {/* Repayment Form */}
      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>Repayment Details</legend>
          {renderInput("Repayment Date", "repayment_date", "date")}
          {renderInput("Amount", "amount", "number")}
          {renderInput("Payment Mode", "mode")}
          {renderInput("Reference No", "reference_no")}

          <div className="form-group">
            <label>Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} />
          </div>
        </fieldset>

        <button type="submit" disabled={loading}>
          {loading ? "Processing..." : "Submit Repayment"}
        </button>
      </form>

      {message && <div className="message">{message}</div>}

      {/* Repayment History */}
      <h3 style={{ marginTop: "30px" }}>Repayment History</h3>
      <table className="repayment-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Amount</th>
            <th>Mode</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {repayments.map((r) => (
            <tr key={r.id}>
              <td>{r.repayment_date}</td>
              <td>₹{r.amount}</td>
              <td>{r.mode || "—"}</td>
              <td>{r.reference_no || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Allocation History */}
      <h3 style={{ marginTop: "30px" }}>Allocation Details (Principal + Interest)</h3>
      <table className="repayment-table">
        <thead>
          <tr>
            <th>Repayment Date</th>
            <th>Invoice No</th>
            <th>Principal Allocated</th>
            <th>Interest Allocated</th>
            <th>Mode</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((a) => (
            <tr key={a.id}>
              <td>{a.repayment_date}</td>
              <td>{a.invoice_number || "—"}</td>
              <td>
                {a.principal_allocated > 0
                  ? `₹${a.principal_allocated}`
                  : "—"}
              </td>
              <td>
                {a.interest_allocated > 0
                  ? `₹${a.interest_allocated}`
                  : "—"}
              </td>
              <td>{a.mode || "—"}</td>
              <td>{a.reference_no || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* CSS */}
      <style>{`
        .repay-container {
          max-width: 900px;
          margin: 2rem auto;
          background: #fafafa;
          padding: 2rem;
          border-radius: 10px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        h2 { text-align: center; margin-bottom: 1.5rem; }
        .summary-box {
          margin-bottom: 1.5rem; padding: 1rem;
          background: #eef7ff; border-radius: 8px;
        }
        fieldset {
          border: 1px solid #ddd; border-radius: 8px;
          padding: 1rem 1.5rem; margin-bottom: 1.5rem;
        }
        .form-group { margin-bottom: 0.8rem; display: flex; flex-direction: column; }
        input, textarea {
          padding: 8px; border: 1px solid #ccc;
          border-radius: 4px;
        }
        textarea { min-height: 80px; }
        .error-input { border-color: red; background-color: #fff0f0; }
        .repayment-table {
          width: 100%; border-collapse: collapse;
        }
        .repayment-table th, .repayment-table td {
          padding: 10px; border-bottom: 1px solid #ccc;
        }
        button {
          background-color: #007bff; color: white;
          border: none; padding: 10px 20px;
          font-size: 16px; cursor: pointer;
          border-radius: 6px;
        }
      `}</style>
    </div>
  );
};

export default RepaymentAdd;
