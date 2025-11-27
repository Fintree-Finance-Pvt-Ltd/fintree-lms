// Frontend/src/components/HeliumEnachMandateButton.jsx
import React, { useState } from "react";
import api from "../../api/api";
import useDigioMandate from "../../hooks/useDigioMandate";

export default function HeliumEnachMandateButton({ lan, customerIdentifier }) {
  const { startMandateFlow } = useDigioMandate();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    try {
      setLoading(true);

      // 1️⃣ Ask backend to create mandate with Digio
      const res = await api.post("/enach/create-mandate", {
        lan,
        customer_identifier: customerIdentifier, // email or mobile
        amount: 1000,              // example – use your EMI/limit
        max_amount: 1000,
        start_date: "2025-12-01",  // yyyy-mm-dd
        end_date: null,
        frequency: "monthly",
        // optionally send bank details if not saved earlier
        // account_no, ifsc, account_type, customer_name...
      });

      const { documentId, customer_identifier } = res.data;
      if (!documentId) {
        alert("Failed to create mandate");
        return;
      }

      // 2️⃣ Trigger Digio Gateway SDK
      startMandateFlow(documentId, customer_identifier, {
        environment: process.env.NODE_ENV === "production" ? "production" : "sandbox",
        logoUrl: "https://your-logo-url.com/logo.png",
      });
    } catch (err) {
      console.error("eNACH init error:", err);
      alert("Failed to start eNACH: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        padding: "8px 14px",
        borderRadius: 8,
        border: "1px solid #4f46e5",
        background: "#4f46e5",
        color: "#fff",
        fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
      }}
    >
      {loading ? "Starting eNACH..." : "Start eNACH Mandate"}
    </button>
  );
}
