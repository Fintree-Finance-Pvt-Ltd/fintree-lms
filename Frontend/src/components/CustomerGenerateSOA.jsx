import { useState } from "react";
import api from "../api/api";

const CustomerGenerateSOA = () => {
  const [form, setForm] = useState({ customer_name: "", mobile_number: "", lan: "" });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Handle input change
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Handle search
  const handleSearch = async () => {
    setLoading(true);
    try {
      const res = await api.get("/customers-soa/search", { params: form });
      if (Array.isArray(res.data)) setResults(res.data);
      else setResults([]);
    } catch (err) {
      console.error("Error fetching customers:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Generate SOA
  const generateSOA = async (lan) => {
    try {
      const res = await api.post("/documents/generate-soa", { lan });
      if (res.data?.fileUrl) window.open(res.data.fileUrl, "_blank");
      else alert("SOA generation failed.");
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "SOA generation failed.";
      alert(msg);
    }
  };

  // ===== Inline Styles =====
  const styles = {
    container: {
      padding: "30px",
      maxWidth: "900px",
      margin: "40px auto",
      backgroundColor: "#fff",
      borderRadius: "8px",
      boxShadow: "0 0 10px rgba(0,0,0,0.1)",
      fontFamily: "Segoe UI, sans-serif",
    },
    heading: {
      textAlign: "center",
      color: "#333",
      marginBottom: "25px",
    },
    form: {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "10px",
      marginBottom: "25px",
    },
    input: {
      padding: "10px",
      width: "200px",
      borderRadius: "4px",
      border: "1px solid #ccc",
      outline: "none",
      fontSize: "14px",
      transition: "0.2s",
    },
    button: {
      padding: "10px 20px",
      backgroundColor: "#007bff",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px",
      transition: "0.2s",
    },
    buttonHover: {
      backgroundColor: "#0056b3",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      marginTop: "10px",
    },
    th: {
      backgroundColor: "#007bff",
      color: "white",
      padding: "12px",
      textAlign: "left",
      border: "1px solid #ddd",
    },
    td: {
      padding: "10px",
      border: "1px solid #ddd",
      fontSize: "14px",
    },
    actionBtn: {
      backgroundColor: "#28a745",
      color: "white",
      border: "none",
      padding: "6px 12px",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "13px",
      transition: "0.2s",
    },
    actionBtnHover: {
      backgroundColor: "#1e7e34",
    },
    noResults: {
      textAlign: "center",
      color: "#888",
      marginTop: "20px",
    },
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Customer Search</h2>

      <div style={styles.form}>
        <input
          type="text"
          name="customer_name"
          placeholder="Customer Name"
          value={form.customer_name}
          onChange={handleChange}
          style={styles.input}
        />
        <input
          type="text"
          name="mobile_number"
          placeholder="Mobile No"
          value={form.mobile_number}
          onChange={handleChange}
          style={styles.input}
        />
        <input
          type="text"
          name="lan"
          placeholder="LAN"
          value={form.lan}
          onChange={handleChange}
          style={styles.input}
        />
        <button onClick={handleSearch} disabled={loading} style={styles.button}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {Array.isArray(results) && results.length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Customer Name</th>
              <th style={styles.th}>Mobile No</th>
              <th style={styles.th}>LAN</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {results.map((cust, idx) => (
              <tr key={idx}>
                <td style={styles.td}>{cust.customer_name}</td>
                <td style={styles.td}>{cust.mobile_number}</td>
                <td style={styles.td}>{cust.lan}</td>
                <td style={styles.td}>
                  <button
                    style={styles.actionBtn}
                    onClick={() => generateSOA(cust.lan)}
                  >
                    Generate SOA
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {Array.isArray(results) && results.length === 0 && !loading && (
        <p style={styles.noResults}>No customers found.</p>
      )}
    </div>
  );
};

export default CustomerGenerateSOA;
