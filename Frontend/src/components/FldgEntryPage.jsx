import React, { useState, useEffect } from "react";
import api from "../api/api";
import "../styles/PartnerLimitEntry.css";

const FldgEntryPage = () => {
  const [partners, setPartners] = useState([]);
  const [selectedPartner, setSelectedPartner] = useState("");
  const [receipts, setReceipts] = useState([]);
  const [availableBalance, setAvailableBalance] = useState(0);

  const [form, setForm] = useState({
    utr_no: "",
    fldg_amount: "",
    payment_date: "",
    remarks: "",
  });

  const numberToIndianWords = (value) => {
    if (value === "" || value === null || value === undefined) {
      return "";
    }

    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
      return "";
    }

    if (amount === 0) {
      return "Zero Rupees Only";
    }

    const ones = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];

    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];

    const convertBelowHundred = (number) => {
      if (number < 20) {
        return ones[number];
      }

      return `${tens[Math.floor(number / 10)]} ${ones[number % 10]}`.trim();
    };

    const convertBelowThousand = (number) => {
      let words = "";

      if (number >= 100) {
        words += `${ones[Math.floor(number / 100)]} Hundred`;
        number %= 100;

        if (number > 0) {
          words += " ";
        }
      }

      if (number > 0) {
        words += convertBelowHundred(number);
      }

      return words.trim();
    };

    const convertInteger = (number) => {
      if (number === 0) {
        return "Zero";
      }

      const parts = [];

      const crore = Math.floor(number / 10000000);
      number %= 10000000;

      const lakh = Math.floor(number / 100000);
      number %= 100000;

      const thousand = Math.floor(number / 1000);
      number %= 1000;

      const hundredPart = number;

      if (crore > 0) {
        parts.push(`${convertInteger(crore)} Crore`);
      }

      if (lakh > 0) {
        parts.push(`${convertBelowThousand(lakh)} Lakh`);
      }

      if (thousand > 0) {
        parts.push(`${convertBelowThousand(thousand)} Thousand`);
      }

      if (hundredPart > 0) {
        parts.push(convertBelowThousand(hundredPart));
      }

      return parts.join(" ").trim();
    };

    const roundedAmount = Math.round(amount * 100) / 100;
    const rupees = Math.floor(roundedAmount);
    const paise = Math.round((roundedAmount - rupees) * 100);

    let result = `${convertInteger(rupees)} ${
      rupees === 1 ? "Rupee" : "Rupees"
    }`;

    if (paise > 0) {
      result += ` and ${convertInteger(paise)} ${
        paise === 1 ? "Paisa" : "Paise"
      }`;
    }

    return `${result} Only`;
  };

  

  // Fetch partners list
  const fetchPartners = async () => {
    try {
      const res = await api.get("partners/partners");
      setPartners(res.data.partners || []);
    } catch (err) {
      console.error("Partner fetch error:", err);
    }
  };

  // Fetch receipts for selected partner
  const fetchReceipts = async (partnerId) => {
    if (!partnerId) return;

    try {
      const receiptsRes = await api.get(`fldg/receipts/${partnerId}`);
      setReceipts(receiptsRes.data);

      const summaryRes = await api.get(`fldg/summary/${partnerId}`);
      setAvailableBalance(summaryRes.data.available_fldg);
    } catch (err) {
      console.error("Receipt fetch error:", err);
    }
  };

  // Submit FLDG entry
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.post("fldg/receipts", {
        partner_id: selectedPartner,
        utr_no: form.utr_no,
        fldg_amount: parseFloat(form.fldg_amount),
        payment_date: form.payment_date,
        remarks: form.remarks,
      });

      alert("FLDG entry saved successfully ✅");

      setForm({
        utr_no: "",
        fldg_amount: "",
        payment_date: "",
        remarks: "",
      });

      fetchReceipts(selectedPartner);
    } catch (err) {
      console.error("Save error:", err);

      alert(err.response?.data?.error || "Error saving FLDG entry");
    }
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  useEffect(() => {
    if (selectedPartner) {
      fetchReceipts(selectedPartner);
    }
  }, [selectedPartner]);

  const formatCurrency = (value) => {
    return `₹${Number(value || 0).toLocaleString("en-IN")}`;
  };

  return (
    <div className="partner-page">
      <div className="partner-container">
        <div className="page-header">
          <h1>Partner FLDG Entry</h1>
          <p>Add new FLDG receipts partner-wise and track balances.</p>
        </div>

        {/* Entry Form */}

        <form className="card form-card" onSubmit={handleSubmit}>
          <div className="card-title">Add FLDG Entry</div>

          <div className="form-grid">
            <div className="field">
              <label>Partner</label>
              <select
                value={selectedPartner}
                onChange={(e) => setSelectedPartner(e.target.value)}
                required
              >
                <option value="">Select Partner</option>

                {partners.map((p) => (
                  <option key={p.partner_id} value={p.partner_id}>
                    {p.partner_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>UTR Number</label>
              <input
                type="text"
                value={form.utr_no}
                onChange={(e) => setForm({ ...form, utr_no: e.target.value })}
                required
              />
            </div>

      <div className="field">
  <label>FLDG Amount</label>

  <input
    type="text"
    inputMode="decimal"
    value={
      form.fldg_amount
        ? Number(form.fldg_amount).toLocaleString("en-IN")
        : ""
    }
    onChange={(e) => {
      const rawValue = e.target.value.replace(/,/g, "");

      if (/^\d*\.?\d{0,2}$/.test(rawValue)) {
        setForm({
          ...form,
          fldg_amount: rawValue,
        });
      }
    }}
    placeholder="0.00"
    required
  />

  {form.fldg_amount !== "" && (
    <div className="amount-in-words">
      {numberToIndianWords(form.fldg_amount)}
    </div>
  )}
</div>

            <div className="field">
              <label>Payment Date</label>
              <input
                type="date"
                value={form.payment_date}
                onChange={(e) =>
                  setForm({ ...form, payment_date: e.target.value })
                }
                required
              />
            </div>

            <div className="field">
              <label>Remarks</label>
              <input
                type="text"
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-success">Save FLDG Entry</button>
          </div>
        </form>

        {/* Balance Section */}

        {selectedPartner && (
          <div className="card">
            <div className="card-title">Available FLDG Balance</div>

            <h2 style={{ color: "#2e7d32" }}>
              {formatCurrency(availableBalance)}
            </h2>
          </div>
        )}

        {/* Receipts Table */}

        {selectedPartner && (
          <div className="card table-card">
            <div className="card-title">Previous FLDG Receipts</div>
            <div className="card table-card">
              <table className="partner-table">
                <thead>
                  <tr>
                    <th>UTR</th>
                    <th>Amount</th>
                    <th>Payment Date</th>
                    <th>Remarks</th>
                    <th>Created At</th>
                  </tr>
                </thead>

                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td>{r.utr_no}</td>

                      <td className="text-right">
                        {formatCurrency(r.fldg_amount)}
                      </td>

                      <td>{r.payment_date?.slice(0, 10)}</td>

                      <td>{r.remarks || "-"}</td>

                      <td>{r.created_at?.slice(0, 19)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {receipts.length === 0 && (
                <div className="empty-state">No FLDG receipts found</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FldgEntryPage;
