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

  // const styles = {
  //   container: {
  //     padding: "30px",
  //     maxWidth: "1200px",
  //     margin: "40px auto",
  //     backgroundColor: "#fff",
  //     borderRadius: "8px",
  //     boxShadow: "0 0 10px rgba(0,0,0,0.1)",
  //     fontFamily: "Segoe UI, sans-serif",
  //   },
  //   heading: { textAlign: "center", marginBottom: "25px", color: "#333" },
  //   form: {
  //     display: "flex",
  //     gap: "10px",
  //     justifyContent: "center",
  //     marginBottom: "25px",
  //     flexWrap: "wrap",
  //   },
  //   input: {
  //     padding: "10px",
  //     borderRadius: "4px",
  //     border: "1px solid #ccc",
  //     width: "200px",
  //   },
  //   button: {
  //     padding: "10px 20px",
  //     backgroundColor: "#007bff",
  //     color: "#fff",
  //     border: "none",
  //     borderRadius: "4px",
  //     cursor: "pointer",
  //   },
  //   table: {
  //     width: "100%",
  //     borderCollapse: "collapse",
  //     marginTop: "10px",
  //   },
  //   th: {
  //     backgroundColor: "#007bff",
  //     color: "#fff",
  //     padding: "12px",
  //     border: "1px solid #ddd",
  //   },
  //   td: { padding: "10px", border: "1px solid #ddd" },
  //   remarkInput: {
  //     width: "95%",
  //     padding: "8px",
  //     borderRadius: "4px",
  //     border: "1px solid #aaa",
  //   },
  //   saveBtn: {
  //     marginTop: "6px",
  //     backgroundColor: "#28a745",
  //     color: "white",
  //     border: "none",
  //     padding: "6px 12px",
  //     borderRadius: "4px",
  //     cursor: "pointer",
  //   },
  // };

  const styles = {
    page: {
      minHeight: "100vh",
      background:
        "linear-gradient(180deg, #f4f8fc 0%, #eaf1f8 100%)",
      padding: "28px 20px",
      fontFamily: "Inter, Segoe UI, sans-serif",
    },

    container: {
      maxWidth: "1380px",
      margin: "0 auto",
    },

    heroCard: {
      background:
        "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(240,248,255,0.92))",
      border: "1px solid #d9e4ef",
      borderRadius: "24px",
      padding: "28px 28px 24px",
      boxShadow: "0 16px 38px rgba(15, 23, 42, 0.08)",
      marginBottom: "22px",
    },

    topRow: {
      display: "flex",
      justifyContent: "flex-start",
      alignItems: "flex-start",
      gap: "20px",
      flexWrap: "wrap",
      marginBottom: "22px",
    },

    headingWrap: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    },

    badge: {
      display: "inline-flex",
      width: "fit-content",
      padding: "8px 14px",
      borderRadius: "999px",
      background:
        "linear-gradient(90deg, rgba(56,189,248,0.16), rgba(56,189,248,0.05))",
      border: "1px solid rgba(56,189,248,0.22)",
      color: "#0f172a",
      fontSize: "12px",
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
    },

    heading: {
      margin: 0,
      fontSize: "42px",
      fontWeight: 700,
      color: "#102a56",
      letterSpacing: "-0.02em",
    },

    subheading: {
      margin: 0,
      color: "#5b6778",
      fontSize: "16px",
      lineHeight: 1.6,
      maxWidth: "720px",
    },

    statsCard: {
      minWidth: "220px",
      padding: "18px 20px",
      borderRadius: "18px",
      background: "linear-gradient(135deg, #081225, #17385c)",
      color: "#fff",
      boxShadow: "0 14px 28px rgba(15, 23, 42, 0.18)",
    },

    statsLabel: {
      fontSize: "11px",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      color: "rgba(255,255,255,0.72)",
      marginBottom: "8px",
      fontWeight: 700,
    },

    statsValue: {
      fontSize: "24px",
      fontWeight: 800,
    },

    searchCard: {
      background: "#fff",
      border: "1px solid #d9e4ef",
      borderRadius: "22px",
      padding: "22px",
      boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)",
      marginBottom: "22px",
    },

    cardTitle: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      fontSize: "28px",
      fontWeight: 700,
      color: "#17356b",
      marginBottom: "18px",
    },

    cardTitleAccent: {
      width: "8px",
      height: "34px",
      borderRadius: "999px",
      background: "linear-gradient(180deg, #38bdf8, #2563eb)",
      boxShadow: "0 0 0 6px rgba(56,189,248,0.12)",
    },

    form: {
      display: "grid",
      gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
      gap: "16px",
      alignItems: "end",
    },

    fieldWrap: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    },

    label: {
      fontSize: "12px",
      fontWeight: 600,
      color: "#334155",
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    },

    input: {
      width: "100%",
      height: "52px",
      padding: "0 16px",
      borderRadius: "14px",
      border: "1px solid #d2dce8",
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
      fontSize: "15px",
      color: "#0f172a",
      outline: "none",
    },

    button: {
      height: "52px",
      padding: "0 22px",
      borderRadius: "14px",
      border: "1px solid rgba(56, 189, 248, 0.18)",
      background:
        "linear-gradient(90deg, #020617 0%, #0f172a 55%, #1d456a 100%)",
      color: "#fff",
      fontSize: "15px",
      fontWeight: 700,
      cursor: "pointer",
      boxShadow: "0 10px 22px rgba(14, 116, 144, 0.28)",
    },

    resultCard: {
      background: "#fff",
      border: "1px solid #d9e4ef",
      borderRadius: "22px",
      padding: "22px",
      boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)",
    },

    resultHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "16px",
      gap: "16px",
      flexWrap: "wrap",
    },

    resultInfo: {
      color: "#64748b",
      fontSize: "14px",
      fontWeight: 500,
    },

    tableWrap: {
      width: "100%",
      overflowX: "auto",
      border: "1px solid #e2e8f0",
      borderRadius: "18px",
      background: "#fff",
    },

    table: {
      width: "100%",
      minWidth: "1400px",
      borderCollapse: "separate",
      borderSpacing: 0,
    },

    th: {
      background: "linear-gradient(90deg, #0f172a 0%, #16324f 100%)",
      color: "#fff",
      padding: "16px 14px",
      borderRight: "1px solid rgba(255,255,255,0.2)",
      fontSize: "13px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.03em",
      textAlign: "left",
      position: "sticky",
      top: 0,
    },

    td: {
      padding: "16px 14px",
      borderBottom: "1px solid #edf2f7",
      fontSize: "14px",
      color: "#0f172a",
      background: "#fff",
      verticalAlign: "top",
    },

    customerName: {
      fontWeight: 600,
      color: "#102a56",
    },

    mutedText: {
      color: "#64748b",
    },

    remarkInput: {
      width: "100%",
      minWidth: "170px",
      height: "42px",
      padding: "0 12px",
      borderRadius: "12px",
      border: "1px solid #cfd9e5",
      background: "#f8fbff",
      outline: "none",
    },

    selectInput: {
      width: "100%",
      minWidth: "170px",
      height: "42px",
      padding: "0 12px",
      borderRadius: "12px",
      border: "1px solid #cfd9e5",
      background: "#f8fbff",
      outline: "none",
    },

    saveBtn: {
      background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
      color: "#fff",
      border: "none",
      padding: "10px 16px",
      borderRadius: "12px",
      fontWeight: 600,
      cursor: "pointer",
      whiteSpace: "nowrap",
      boxShadow: "0 8px 18px rgba(34, 197, 94, 0.22)",
    },

    emptyState: {
      background: "#fff",
      border: "1px dashed #cbd5e1",
      borderRadius: "18px",
      padding: "32px 20px",
      textAlign: "center",
      color: "#64748b",
      fontSize: "16px",
      fontWeight: 600,
      boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)",
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.heroCard}>
          <div style={styles.topRow}>
            <div style={styles.headingWrap}>
              <div style={styles.badge}>Collection Search Panel</div>
              <h2 style={styles.heading}>Customer Search</h2>
              <p style={styles.subheading}>
                Search customers by name, mobile, LAN, district, or dealer and
                update remarks and assigner details instantly.
              </p>
            </div>

            {/* <div style={styles.statsCard}>
            <div style={styles.statsLabel}>Search Results</div>
            <div style={styles.statsValue}>{results.length}</div>
          </div> */}
          </div>

          <div style={styles.searchCard}>
            <div style={styles.cardTitle}>
              <span style={styles.cardTitleAccent}></span>
              Search Filters
            </div>

            <div style={styles.form}>
              <div style={styles.fieldWrap}>
                <label style={styles.label}>Customer Name</label>
                <input
                  type="text"
                  name="customer_name"
                  placeholder="Enter customer name"
                  onChange={handleChange}
                  value={form.customer_name}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Mobile No</label>
                <input
                  type="text"
                  name="mobile_number"
                  placeholder="Enter mobile number"
                  onChange={handleChange}
                  value={form.mobile_number}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>LAN</label>
                <input
                  type="text"
                  name="lan"
                  placeholder="Enter LAN"
                  onChange={handleChange}
                  value={form.lan}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>District</label>
                <input
                  type="text"
                  name="district"
                  placeholder="Enter district"
                  onChange={handleChange}
                  value={form.district}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Dealer Name</label>
                <input
                  type="text"
                  name="dealer_name"
                  placeholder="Enter dealer name"
                  onChange={handleChange}
                  value={form.dealer_name}
                  style={styles.input}
                />
              </div>

              <button
                onClick={handleSearch}
                disabled={loading}
                style={styles.button}
              >
                {loading ? "Searching..." : "Search"}
              </button>
            </div>
          </div>

          {results.length > 0 ? (
            <div style={styles.resultCard}>
              <div style={styles.resultHeader}>
                <div style={styles.cardTitle}>
                  <span style={styles.cardTitleAccent}></span>
                  Search Results
                </div>
                <div style={styles.resultInfo}>
                  {results.length} customer{results.length > 1 ? "s" : ""} found
                </div>
              </div>

              <div style={styles.tableWrap}>
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
                        <td style={{ ...styles.td, ...styles.customerName }}>
                          {cust.customer_name}
                        </td>
                        <td style={styles.td}>{cust.mobile_number}</td>
                        <td style={styles.td}>{cust.lan}</td>
                        <td style={styles.td}>
                          {cust.district || <span style={styles.mutedText}>—</span>}
                        </td>
                        <td style={styles.td}>
                          {cust.dealer_name || <span style={styles.mutedText}>—</span>}
                        </td>
                        <td style={styles.td}>
                          {cust.collection_remarks || (
                            <span style={styles.mutedText}>—</span>
                          )}
                        </td>
                        <td style={styles.td}>
                          {cust.collection_assigner || (
                            <span style={styles.mutedText}>—</span>
                          )}
                        </td>

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
                            style={styles.selectInput}
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
              </div>
            </div>
          ) : (
            !loading && <div style={styles.emptyState}>No customers found.</div>
          )}
        </div>
      </div>
    </div>
  );
  // return (
  //   <div style={styles.container}>
  //     <h2 style={styles.heading}>Customer Search</h2>

  //     <div style={styles.form}>
  //       <input
  //         type="text"
  //         name="customer_name"
  //         placeholder="Customer Name"
  //         onChange={handleChange}
  //         value={form.customer_name}
  //         style={styles.input}
  //       />

  //       <input
  //         type="text"
  //         name="mobile_number"
  //         placeholder="Mobile No"
  //         onChange={handleChange}
  //         value={form.mobile_number}
  //         style={styles.input}
  //       />

  //       <input
  //         type="text"
  //         name="lan"
  //         placeholder="LAN"
  //         onChange={handleChange}
  //         value={form.lan}
  //         style={styles.input}
  //       />

  //       <input
  //         type="text"
  //         name="district"
  //         placeholder="District"
  //         onChange={handleChange}
  //         value={form.district}
  //         style={styles.input}
  //       />

  //       <input
  //         type="text"
  //         name="dealer_name"
  //         placeholder="Dealer Name"
  //         onChange={handleChange}
  //         value={form.dealer_name}
  //         style={styles.input}
  //       />

  //       <button onClick={handleSearch} disabled={loading} style={styles.button}>
  //         {loading ? "Searching..." : "Search"}
  //       </button>
  //     </div>

  //     {results.length > 0 && (
  //       <table style={styles.table}>
  //         <thead>
  //           <tr>
  //             <th style={styles.th}>Customer Name</th>
  //             <th style={styles.th}>Mobile</th>
  //             <th style={styles.th}>LAN</th>
  //             <th style={styles.th}>District</th>
  //             <th style={styles.th}>Dealer</th>
  //             <th style={styles.th}>Stored Remarks</th>
  //             <th style={styles.th}>Stored Assigner</th>
  //             <th style={styles.th}>New Remarks</th>
  //             <th style={styles.th}>New Assigner</th>
  //             <th style={styles.th}>Action</th>
  //           </tr>
  //         </thead>

  //         <tbody>
  //           {results.map((cust, index) => (
  //             <tr key={index}>
  //               <td style={styles.td}>{cust.customer_name}</td>
  //               <td style={styles.td}>{cust.mobile_number}</td>
  //               <td style={styles.td}>{cust.lan}</td>
  //               <td style={styles.td}>{cust.district || "—"}</td>
  //               <td style={styles.td}>{cust.dealer_name || "—"}</td>
  //               <td style={styles.td}>{cust.collection_remarks || "—"}</td>
  //               <td style={styles.td}>{cust.collection_assigner || "—"}</td>

  //               <td style={styles.td}>
  //                 <input
  //                   type="text"
  //                   placeholder="Enter remarks"
  //                   value={remarks[cust.lan] || ""}
  //                   onChange={(e) =>
  //                     handleRemarksChange(cust.lan, e.target.value)
  //                   }
  //                   style={styles.remarkInput}
  //                 />
  //               </td>

  //               <td style={styles.td}>
  //                 <select
  //                   style={styles.remarkInput}
  //                   value={assigners[cust.lan] || ""}
  //                   onChange={(e) =>
  //                     handleAssignerChange(cust.lan, e.target.value)
  //                   }
  //                 >
  //                   <option value="">Select Assigner</option>
  //                   {assignerList.map((name) => (
  //                     <option key={name} value={name}>
  //                       {name}
  //                     </option>
  //                   ))}
  //                 </select>
  //               </td>

  //               <td style={styles.td}>
  //                 <button
  //                   style={styles.saveBtn}
  //                   onClick={() => saveRemarks(cust.lan)}
  //                 >
  //                   Save
  //                 </button>
  //               </td>
  //             </tr>
  //           ))}
  //         </tbody>
  //       </table>
  //     )}

  //     {results.length === 0 && !loading && <p>No customers found.</p>}
  //   </div>
  // );
};

export default EmbifiCustomerRemarks;
