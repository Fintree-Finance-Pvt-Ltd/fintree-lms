import React from "react";
import api from "../api/api";
import { useState } from "react";

const products = [
  { key: "ev", name: "EV Loan Booking" },
  { key: "bl", name: "BL Loan Booking" },
  { key: "gq_fsf", name: "GQ FSF Loan Booking" },
  { key: "gq_non_fsf", name: "GQ NON-FSF Loan Booking" },
  { key: "adikosh", name: "Adikosh Loan Booking" },
  { key: "utr_upload", name: "UTR Upload" },
  { key: "repayment_upload", name: "Repayment Upload" },
  { key: "fc_upload", name: "Forecloser Upload" },
  { key: "fc_upload", name: "Settled Upload" },
  { key: "fc_upload", name: "GQ 20%  Upload" },

];

const DownloadTemplatePage = () => {
  const [hoveredRow, setHoveredRow] = useState(null);
  const [hoveredBtn, setHoveredBtn] = useState(null);

  const handleDownload = async (key) => {
    try {
      const response = await api.get(`/reports/download-template/${key}`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${key}_template.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);

    } catch (error) {
      console.error("❌ Download failed:", error);
      alert("Download failed. Please try again.");
    }
  };

  const styles = {

    page: {
      padding: "48px 60px",
      background:
        "linear-gradient(180deg,#f8fafc 0%,#eef2f7 100%)",
      minHeight: "calc(100vh - 70px)",
      display: "flex",
      justifyContent: "center",
    },

    card: {
      width: 760,
      background: "#fff",
      borderRadius: 22,
      padding: 40,
      boxShadow: "0 14px 44px rgba(0,0,0,0.06)",
      border: "1px solid #e5e7eb",
      transition: "0.3s ease",
    },

    title: {
      fontSize: 26,
      fontWeight: 700,
      marginBottom: 28,
      color: "#0f172a",
    },

    table: {
      width: "100%",
      borderCollapse: "collapse",
    },

    th: {
      textAlign: "left",
      background: "#f1f5f9",
      padding: "16px",
      fontSize: 14,
      fontWeight: 600,
      color: "#334155",
    },

    row: {
      borderBottom: "1px solid #e2e8f0",
      transition: "all 0.25s ease",
    },

    rowHover: {
      background:
        "linear-gradient(90deg,#f8fbff,#eef4ff)",
    },

    td: {
      padding: "18px 16px",
      fontSize: 15,
      color: "#334155",
    },

    // btn: {
    //   background:
    //     "linear-gradient(135deg,#3b82f6,#2563eb)",
    //   color: "#fff",
    //   border: "none",
    //   padding: "10px 22px",
    //   borderRadius: 999,
    //   fontWeight: 600,
    //   fontSize: 14,
    //   cursor: "pointer",
    //   transition: "all 0.25s ease",
    //   boxShadow: "0 6px 18px rgba(37,99,235,0.25)",
    // },
    btn: {
      padding: "10px 22px",
      borderRadius: "999px",
      fontWeight: 600,
      cursor: "pointer",
      border: "2px solid #0f172a",
      background: "#ffffff",
      color: "#0f172a",
      transition: "all 0.25s ease"
    }
    ,

    btnHover: {
      transform: "translateY(-2px)",
      boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
      background: "#0f172a",   // same as sidebar/navbar dark theme
      color: "#ffffff",
      border: "2px solid #0f172a",
    }

    // btnHover: {
    //   transform: "translateY(-2px) scale(1.05)",
    //   boxShadow: "0 12px 28px rgba(37,99,235,0.35)",
    //   // background:
    //     // "linear-gradient(135deg,#2563eb,#1e40af)",   
    //      background: "rgba(255,255,255,0.15)",

    // },

  };

  // return (
  //   <div>
  //     <h2>Download Excel Formats</h2>
  //     <table border="1" cellPadding="10">
  //       <thead>
  //         <tr>
  //           <th>Product</th>
  //           <th>Download Format</th>
  //         </tr>
  //       </thead>
  //       <tbody>
  //         {products.map((product) => (
  //           <tr key={product.key}>
  //             <td>{product.name}</td>
  //             <td>
  //               <button onClick={() => handleDownload(product.key)}>📥 Download Format</button>
  //             </td>
  //           </tr>
  //         ))}
  //       </tbody>
  //     </table>
  //   </div>
  // );


  // const [hoveredBtn, setHoveredBtn] = useState(null);

  // return (
  //   <div style={styles.page}>
  //     <div style={styles.card}>

  //       <h2 style={styles.title}>
  //         Download Excel Formats
  //       </h2>

  //       <table style={styles.table}>

  //         <thead>
  //           <tr>
  //             <th style={styles.th}>Product</th>
  //             <th style={styles.th}>Download Format</th>
  //           </tr>
  //         </thead>

  //         <tbody>

  //           {products.map((product) => (

  //             <tr key={product.key} style={styles.row}>

  //               <td style={styles.td}>
  //                 {product.name}
  //               </td>

  //               <td style={styles.td}>

  //                 <button
  //                   style={{
  //                     ...styles.btn,
  //                     ...(hoveredBtn === product.key
  //                       ? styles.btnHover
  //                       : {}),
  //                   }}
  //                   onMouseEnter={() =>
  //                     setHoveredBtn(product.key)
  //                   }
  //                   onMouseLeave={() =>
  //                     setHoveredBtn(null)
  //                   }
  //                   onClick={() =>
  //                     handleDownload(product.key)
  //                   }
  //                 >
  //                   ⬇ Download Format
  //                 </button>

  //               </td>

  //             </tr>

  //           ))}

  //         </tbody>

  //       </table>

  //     </div>
  //   </div>
  // );


  return (
    <div style={styles.page}>
      <div style={styles.card}>

        <h2 style={styles.title}>
          Download Excel Formats
        </h2>

        <table style={styles.table}>

          <thead>
            <tr>
              <th style={styles.th}>Product</th>
              <th style={styles.th}>Download Format</th>
            </tr>
          </thead>

          <tbody>

            {products.map((product) => {

              const isRowHovered =
                hoveredRow === product.key;

              const isBtnHovered =
                hoveredBtn === product.key;

              return (
                <tr
                  key={product.key}
                  style={{
                    ...styles.row,
                    ...(isRowHovered
                      ? styles.rowHover
                      : {}),
                  }}
                  onMouseEnter={() =>
                    setHoveredRow(product.key)
                  }
                  onMouseLeave={() =>
                    setHoveredRow(null)
                  }
                >

                  <td style={styles.td}>
                    {product.name}
                  </td>

                  <td style={styles.td}>

                    <button
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "linear-gradient(135deg,#0f172a,#1e293b)";
                        e.currentTarget.style.color = "#fff";
                        e.currentTarget.style.boxShadow =
                          "0 8px 22px rgba(15,23,42,0.45)";
                        e.currentTarget.style.transform = "translateY(-2px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#fff";
                        e.currentTarget.style.color = "#2563eb";
                        e.currentTarget.style.boxShadow = "none";
                        e.currentTarget.style.transform = "translateY(0)";
                      }}
                      style={{
                        padding: "10px 24px",
                        borderRadius: "999px",
                        border: "2px solid #2563eb",
                        background: "#ffffff",
                        color: "#2563eb",
                        fontWeight: 600,
                        fontSize: "14px",
                        cursor: "pointer",
                        transition: "all 0.25s ease"
                      }}
                      onClick={() =>
                      handleDownload(product.key)
                    }
                    >
                      ⬇ Download Format
                    </button>
                    {/* <button
                    style={{
    padding: "10px 22px",
    borderRadius: "999px",
    fontWeight: 600,
    cursor: "pointer",
    border: "2px solid #2563eb",
    transition: "all 0.25s ease",

    background:
      hoveredBtn === product.key
        ? "linear-gradient(135deg,#0f172a,#1e293b)"
        : "#ffffff",

    color:
      hoveredBtn === product.key
        ? "#ffffff"
        : "#1e293b",

    boxShadow:
      hoveredBtn === product.key
        ? "0 10px 24px rgba(37,99,235,0.35)"
        : "none",

    transform:
      hoveredBtn === product.key
        ? "translateY(-2px)"
        : "translateY(0px)",
  }}
  //                   style={{
  //   ...styles.btn,
  //   ...(hoveredBtn === product.key
  //     ? styles.btnHover
  //     : {}),
  // }}
                    onMouseEnter={() =>
                      setHoveredBtn(product.key)
                    }
                    onMouseLeave={() =>
                      setHoveredBtn(null)
                    }
                    onClick={() =>
                      handleDownload(product.key)
                    }
                  >
                    ⬇ Download Format
                  </button> */}

                  </td>

                </tr>
              );
            })}

          </tbody>

        </table>

      </div>
    </div>
  );
};

export default DownloadTemplatePage;
