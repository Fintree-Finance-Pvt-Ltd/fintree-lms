import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/api";

const InvoiceAdd = () => {
  const { lan } = useParams(); // 🟦 LAN from URL
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [loanInfo, setLoanInfo] = useState({
    loan_limit: 0,
    outstanding_principal: 0,
    available_limit: 0,
  });

  const [invoices, setInvoices] = useState([]);

  const [form, setForm] = useState({
    supplier_name: "",
    invoice_number: "",
    invoice_date: "",
    invoice_amount: "",
    description: "",
  });

  const requiredFields = [
    "supplier_name",
    "invoice_number",
    "invoice_date",
    "invoice_amount",
  ];

  const [errors, setErrors] = useState({});

  // Fetch Loan Details + Invoices
  useEffect(() => {
    fetchLoanInfo();
    fetchInvoices();
  }, [lan]);

  useEffect(() => {
  console.log("Loaded LoanInfo:", loanInfo);
}, [loanInfo]);


  const fetchLoanInfo = async () => {
    try {
      const res = await api.get(`/wctl-ccod/loan/${lan}`);
      console.log("response:", res);
      if (res.data.success) {
        setLoanInfo(res.data.data);
      }
    } catch (err) {
      console.error("Loan fetch error", err);
    }
  };

  const fetchInvoices = async () => {
    try {
      const res = await api.get(`/wctl-ccod/invoice/${lan}`);
      if (res.data.success) {
        setInvoices(res.data.data);
      }
    } catch (err) {
      console.error("Invoice list error", err);
    }
  };

  // Generic form handler
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // Validate form
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

  const handleSubmit = async (e) => {
  e.preventDefault();
  setMessage("");

  // Wait until loan info is loaded
  if (!loanInfo || loanInfo.available_limit === undefined) {
    setMessage("⚠ Loan details not loaded yet. Please wait.");
    return;
  }

  if (!validateForm()) {
    setMessage("❌ Please fill all required fields.");
    return;
  }

  // Convert to numbers safely
  const invoiceAmount = parseFloat(form.invoice_amount);
  const availableLimit = parseFloat(loanInfo.available_limit);

  if (isNaN(invoiceAmount) || isNaN(availableLimit)) {
    setMessage("❌ Invalid amount values.");
    return;
  }

  const fixDate = (d) => {
  if (!d) return "";
  if (d.includes("-")) {
    // If already correct format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;

    // Convert DD-MM-YYYY → YYYY-MM-DD
    const [dd, mm, yyyy] = d.split("-");
    return `${yyyy}-${mm}-${dd}`;
  }
  return d;
};



  // Validate against available limit
  if (Number(invoiceAmount) > Number(availableLimit)) {
    setMessage(
      `❌ Invoice amount exceeds available limit. Available: ₹${availableLimit}`
    );
    return;
  }

  setLoading(true);

  try {
    const payload = { lan, ...form, invoice_date: fixDate(form.invoice_date) };

    const res = await api.post("/wctl-ccod/invoice/create", payload);

    if (res.data.success) {
      setMessage("✅ Invoice created & disbursement approved.");

      // Refresh data
      fetchLoanInfo();
      fetchInvoices();

      // Reset form
      setForm({
        supplier_name: "",
        invoice_number: "",
        invoice_date: "",
        invoice_amount: "",
        description: "",
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


  // Render input field
  const renderInput = (label, name, type = "text") => (
    <div className="form-group">
      <label>
        {label}{" "}
        {requiredFields.includes(name) && <span className="req">*</span>}
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
    <div className="invoice-container">
      <h2>Invoice Entry — LAN: {lan}</h2>

      {/* Loan Summary */}
      <div className="summary-box">
        <h3>Loan Summary</h3>
        <p>
          Loan Limit: <b>₹{loanInfo.loan_limit}</b>
        </p>
        <p>
          Outstanding Principal: <b>₹{loanInfo.outstanding_principal}</b>
        </p>
        <p>
          Available Limit:{" "}
          <b style={{ color: "green" }}>₹{loanInfo.available_limit}</b>
        </p>
      </div>

      {/* Invoice Form */}
      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>Invoice Details</legend>

          {renderInput("Supplier Name", "supplier_name")}
          {renderInput("Invoice Number", "invoice_number")}
          {renderInput("Invoice Date", "invoice_date", "date")}
          {renderInput("Invoice Amount", "invoice_amount", "number")}

          {/* Description */}
          <div className="form-group">
            <label>Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
            />
          </div>
        </fieldset>

        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Save Invoice"}
        </button>
      </form>

      {message && <div className="message">{message}</div>}

      {/* Invoice List */}
      <h3 style={{ marginTop: "30px" }}>Previous Invoices</h3>
      <table className="invoice-table">
        <thead>
          <tr>
            <th>Supplier</th>
            <th>Invoice No</th>
            <th>Date</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td>{inv.supplier_name}</td>
              <td>{inv.invoice_number}</td>
              <td>{inv.invoice_date}</td>
              <td>₹{inv.invoice_amount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Inline CSS */}
      <style>{`
        .invoice-container {
          max-width: 900px;
          margin: 2rem auto;
          background: #fafafa;
          padding: 2rem;
          border-radius: 10px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        h2 {
          text-align: center;
          margin-bottom: 1.5rem;
        }
        fieldset {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 1rem 1.5rem;
          margin-bottom: 1.5rem;
        }
        legend {
          padding: 0 10px;
          font-weight: bold;
        }
        .summary-box {
          margin-bottom: 1.5rem;
          padding: 1rem;
          background: #eef7ff;
          border-radius: 8px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          margin-bottom: 0.8rem;
        }
        label {
          font-weight: 600;
          margin-bottom: 4px;
        }
        input, textarea {
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        textarea {
          resize: vertical;
          min-height: 80px;
        }
        .req {
          color: red;
        }
        .error-input {
          border-color: red;
          background-color: #fff0f0;
        }
        .error-text {
          color: red;
          font-size: 0.85rem;
          margin-top: 3px;
        }
        button {
          background-color: #007bff;
          color: white;
          border: none;
          padding: 10px 20px;
          font-size: 16px;
          cursor: pointer;
          border-radius: 6px;
        }
        .invoice-table {
          width: 100%;
          border-collapse: collapse;
        }
        .invoice-table th, .invoice-table td {
          padding: 10px;
          border-bottom: 1px solid #ccc;
          text-align: left;
        }
      `}</style>
    </div>
  );
};

export default InvoiceAdd;
