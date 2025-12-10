import { useState } from "react";
import api from "../api/api";

const EmbifiCustomerRemarks = () => {
  const [form, setForm] = useState({
    customer_name: "",
    mobile_number: "",
    lan: "",
    district: "",
    dealer_name: ""
  });

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const [remarks, setRemarks] = useState({});
  const [assigners, setAssigners] = useState({});

  const assignerList = ["Sajag", "Rohit", "Pratik"];

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleRemarksChange = (lan, value) => {
    setRemarks({ ...remarks, [lan]: value });
  };

  const handleAssignerChange = (lan, value) => {
    setAssigners({ ...assigners, [lan]: value });
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const res = await api.get("/customers-soa/search", { params: form });
      if (Array.isArray(res.data)) setResults(res.data);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  const saveRemarks = async (lan) => {
    const remarkText = remarks[lan] || "";
    const assignerName = assigners[lan] || "";

    try {
      const res = await api.post("/loan-booking/save-remarks", {
        lan,
        remarks: remarkText,
        collection_assigner: assignerName,
      });

      alert(res.data?.message || "Saved successfully.");
      handleSearch();
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Failed to save remarks.";
      alert(msg);
    }
  };

  const styles = {
    container: {
      padding: "30px",
      maxWidth: "1200px",
      margin: "40px auto",
      backgroundColor: "#fff",
      borderRadius: "8px",
      boxShadow: "0 0 10px rgba(0,0,0,0.1)",
      fontFamily: "Segoe UI, sans-serif",
    },
    heading: { textAlign: "center", marginBottom: "25px", color: "#333" },
    form: {
      display: "flex",
      gap: "10px",
      justifyContent: "center",
      marginBottom: "25px",
      flexWrap: "wrap",
    },
    input: {
      padding: "10px",
      borderRadius: "4px",
      border: "1px solid #ccc",
      width: "200px",
    },
    button: {
      padding: "10px 20px",
      backgroundColor: "#007bff",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      marginTop: "10px",
    },
    th: {
      backgroundColor: "#007bff",
      color: "#fff",
      padding: "12px",
      border: "1px solid #ddd",
    },
    td: { padding: "10px", border: "1px solid #ddd" },
    remarkInput: {
      width: "95%",
      padding: "8px",
      borderRadius: "4px",
      border: "1px solid #aaa",
    },
    saveBtn: {
      marginTop: "6px",
      backgroundColor: "#28a745",
      color: "white",
      border: "none",
      padding: "6px 12px",
      borderRadius: "4px",
      cursor: "pointer",
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
          onChange={handleChange}
          value={form.customer_name}
          style={styles.input}
        />

        <input
          type="text"
          name="mobile_number"
          placeholder="Mobile No"
          onChange={handleChange}
          value={form.mobile_number}
          style={styles.input}
        />

        <input
          type="text"
          name="lan"
          placeholder="LAN"
          onChange={handleChange}
          value={form.lan}
          style={styles.input}
        />

        <input
          type="text"
          name="district"
          placeholder="District"
          onChange={handleChange}
          value={form.district}
          style={styles.input}
        />

        <input
          type="text"
          name="dealer_name"
          placeholder="Dealer Name"
          onChange={handleChange}
          value={form.dealer_name}
          style={styles.input}
        />

        <button onClick={handleSearch} disabled={loading} style={styles.button}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {results.length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Customer Name</th>
              <th style={styles.th}>Mobile</th>
              <th style={styles.th}>LAN</th>
              <th style={styles.th}>District</th>
              <th style={styles.th}>Dealer</th>
              <th style={styles.th}>Stored Remarks</th>
              <th style={styles.th}>Stored Assigner</th>
              <th style={styles.th}>New Remarks</th>
              <th style={styles.th}>New Assigner</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>

          <tbody>
            {results.map((cust, index) => (
              <tr key={index}>
                <td style={styles.td}>{cust.customer_name}</td>
                <td style={styles.td}>{cust.mobile_number}</td>
                <td style={styles.td}>{cust.lan}</td>
                <td style={styles.td}>{cust.district || "—"}</td>
                <td style={styles.td}>{cust.dealer_name || "—"}</td>
                <td style={styles.td}>{cust.collection_remarks || "—"}</td>
                <td style={styles.td}>{cust.collection_assigner || "—"}</td>

                <td style={styles.td}>
                  <input
                    type="text"
                    placeholder="Enter remarks"
                    value={remarks[cust.lan] || ""}
                    onChange={(e) =>
                      handleRemarksChange(cust.lan, e.target.value)
                    }
                    style={styles.remarkInput}
                  />
                </td>

                <td style={styles.td}>
                  <select
                    style={styles.remarkInput}
                    value={assigners[cust.lan] || ""}
                    onChange={(e) =>
                      handleAssignerChange(cust.lan, e.target.value)
                    }
                  >
                    <option value="">Select Assigner</option>
                    {assignerList.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </td>

                <td style={styles.td}>
                  <button
                    style={styles.saveBtn}
                    onClick={() => saveRemarks(cust.lan)}
                  >
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {results.length === 0 && !loading && <p>No customers found.</p>}
    </div>
  );
};

export default EmbifiCustomerRemarks;
