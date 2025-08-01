import React, { useState } from "react";
import api from "../api/api";
import { useParams, useNavigate } from "react-router-dom";

const ManualCollectionForm = () => {
  const { loan_account_number } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    collected_amount: "",
    collection_date: new Date().toISOString().split("T")[0],
    remarks: "",
    utr_no: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    try {
      if (form.utr_no === "" || form.collected_amount === "" || form.collection_date === "") {
        alert("⚠️ Please fill in all fields.");
        return;
      }

      await api.post(`/loan-booking/aldun-manual-collection`, {
        loan_account_number,
        ...form,
        collected_amount: parseFloat(form.collected_amount),
      });

      alert("✅ Collection recorded successfully.");
      navigate(-1);
    } catch (err) {
      console.error(err);
      alert("❌ Failed to record collection.");
    }
  };

  return (
    <div style={{ padding: "30px", maxWidth: "500px", margin: "auto", background: "#f7f7f7", borderRadius: "10px" }}>
      <h2 style={{ textAlign: "center", marginBottom: "20px" }}>
        Upload Collection for <span style={{ color: "#007bff" }}>{loan_account_number}</span>
      </h2>

      {/* UTR No */}
      <div style={{ marginBottom: "15px" }}>
        <label style={{ display: "block", marginBottom: "5px" }}>UTR No.</label>
        <input
          type="text"
          name="utr_no"
          value={form.utr_no}
          onChange={handleChange}
          required
          style={{ width: "100%", padding: "8px", borderRadius: "5px", border: "1px solid #ccc" }}
        />
      </div>

      {/* Collected Amount */}
      <div style={{ marginBottom: "15px" }}>
        <label style={{ display: "block", marginBottom: "5px" }}>Collected Amount:</label>
        <input
          type="number"
          name="collected_amount"
          value={form.collected_amount}
          onChange={handleChange}
          required
          style={{ width: "100%", padding: "8px", borderRadius: "5px", border: "1px solid #ccc" }}
        />
      </div>

      {/* Collection Date */}
      <div style={{ marginBottom: "15px" }}>
        <label style={{ display: "block", marginBottom: "5px" }}>Collection Date:</label>
        <input
          type="date"
          name="collection_date"
          value={form.collection_date}
          onChange={handleChange}
          required
          style={{ width: "100%", padding: "8px", borderRadius: "5px", border: "1px solid #ccc" }}
        />
      </div>

      {/* Remarks */}
      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", marginBottom: "5px" }}>Remarks:</label>
        <textarea
          name="remarks"
          value={form.remarks}
          onChange={handleChange}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "5px",
            border: "1px solid #ccc",
            resize: "vertical",
            minHeight: "60px",
          }}
        />
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button
          onClick={handleSubmit}
          style={{
            padding: "10px 20px",
            backgroundColor: "#28a745",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Submit Collection
        </button>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: "10px 20px",
            backgroundColor: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default ManualCollectionForm;
