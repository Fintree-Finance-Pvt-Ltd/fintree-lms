// import React, { useState, useEffect } from "react";
// import api from "../api/api";
// import { useParams } from "react-router-dom";

// const DocumentsPage = () => {
//   const { lan } = useParams();
//   const [selectedFile, setSelectedFile] = useState(null);
//   const [fileNameInput, setFileNameInput] = useState("");
//   const [uploadedDocs, setUploadedDocs] = useState([]);

//   const handleFileChange = (e) => setSelectedFile(e.target.files[0]);
//   const handleFilenameChange = (e) => setFileNameInput(e.target.value);

//   const fetchDocuments = async () => {
//     try {
//       const res = await api.get(`/documents/${lan}`);
//       setUploadedDocs(res.data);
//     } catch (error) {
//       console.error("Failed to fetch documents:", error);
//     }
//   };

//   useEffect(() => {
//     if (lan) fetchDocuments();
//   }, [lan]);

//   const handleUpload = async () => {
//     if (!lan || !selectedFile) {
//       alert("LAN ID and file are required!");
//       return;
//     }

//     const formData = new FormData();
//     formData.append("lan", lan);
//     formData.append("document", selectedFile); // for multer
//     formData.append("filename", fileNameInput); // user-provided name

//     try {
//       await api.post(`/documents/upload`, formData);
//       alert("Document uploaded!");
//       setSelectedFile(null);
//       setFileNameInput("");
//       fetchDocuments();
//     } catch (error) {
//       console.error("Upload failed:", error);
//     }
//   };

//   return (
//     <div className="container mt-4">
//       <h4>📁 Upload Documents</h4>

//       <div className="mb-3">
//         <input
//           type="text"
//           className="form-control"
//           value={lan}
//           readOnly
//           placeholder="LAN ID"
//         />
//       </div>
//       <div className="mb-3">
//         <input
//           type="text"
//           name="filename"
//           className="form-control"
//           placeholder="Enter document name"
//           value={fileNameInput}
//           onChange={handleFilenameChange}
//         />
//       </div>
//       <div className="mb-3">
//         <input type="file" className="form-control" onChange={handleFileChange} />
//       </div>
//       <div className="mb-3">
//         <button className="btn btn-primary" onClick={handleUpload}>
//           Upload
//         </button>
//       </div>

//       <hr />
//       <h5>Uploaded Documents</h5>
//       <table className="table">
//         <thead>
//           <tr>
//             <th>File Name</th>
//             <th>Uploaded At</th>
//             <th>Download</th>
//           </tr>
//         </thead>
//         <tbody>
//           {uploadedDocs.map((doc) => (
//             <tr key={doc.id}>
//               <td>{doc.original_name}</td>
//               <td>{new Date(doc.uploaded_at).toLocaleString()}</td>
//               <td>
//                 <a
//   href={`${import.meta.env.VITE_API_BASE_URL.replace("/api", "")}/uploads/${doc.file_name}`}
//   download={doc.original_name}
//   target="_blank"
//   rel="noreferrer"
// >
//   Download
// </a>

//               </td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//     </div>
//   );
// };

// export default DocumentsPage;


import React, { useState, useEffect, useMemo, useRef } from "react";
import api from "../api/api";
import { useParams } from "react-router-dom";

const DocumentsPage = () => {
  const { lan } = useParams();
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileNameInput, setFileNameInput] = useState("");
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [lockInfo, setLockInfo] = useState({ canEdit: false, status: "unknown" });

  const fileReplaceRef = useRef(null);
  const [docToReplace, setDocToReplace] = useState(null);


  // --- preview state ---
  const [previewDoc, setPreviewDoc] = useState(null); // { doc, url } | null

  const handleFileChange = (e) => setSelectedFile(e.target.files[0]);
  const handleFilenameChange = (e) => setFileNameInput(e.target.value);

  const fetchDocuments = async () => {
    try {
      const res = await api.get(`/documents/${lan}`);
      setUploadedDocs(res.data);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    }
  };

  useEffect(() => {
    if (lan) fetchDocuments();
  }, [lan]);

  useEffect(() => {
    if (!lan) return;
    (async () => {
      try {
        const r = await api.get(`/documents/lock-state/${lan}`);
        setLockInfo(r.data); // {canEdit, status}
      } catch {
        setLockInfo({ canEdit: false, status: "unknown" });
      }
    })();
  }, [lan]);


  const handleDelete = async (doc) => {
    if (!lockInfo.canEdit) {
      alert(`Locked by loan status: ${lockInfo.status || "unknown"}`);
      return;
    }
    const ok = window.confirm(`Delete "${doc.original_name || doc.file_name}"?`);
    if (!ok) return;

    try {
      await api.delete(`/documents/${doc.id}`);
      await fetchDocuments();
    } catch (e) {
      console.error("Delete failed:", e);
      alert("Delete failed");
    }
  };

  const startReplace = (doc) => {
    if (!lockInfo.canEdit) {
      alert(`Locked by loan status: ${lockInfo.status || "unknown"}`);
      return;
    }
    setDocToReplace(doc);
    fileReplaceRef.current?.click();
  };

  const onReplaceFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset for next time
    if (!file || !docToReplace) return;

    try {
      const fd = new FormData();
      fd.append("document", file);
      await api.put(`/documents/${docToReplace.id}/replace`, fd);
      setDocToReplace(null);
      await fetchDocuments();
    } catch (err) {
      console.error("Replace failed:", err);
      alert("Replace failed");
    }
  };


  const handleUpload = async () => {
    if (!lan || !selectedFile) {
      alert("LAN ID and file are required!");
      return;
    }

    const formData = new FormData();
    formData.append("lan", lan);
    formData.append("document", selectedFile);
    formData.append("filename", fileNameInput);

    try {
      await api.post(`/documents/upload`, formData);
      alert("Document uploaded!");
      setSelectedFile(null);
      setFileNameInput("");
      fetchDocuments();
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  // ---------- helpers ----------
  const baseUploadsUrl = useMemo(() => {
    const base = import.meta.env.VITE_API_BASE_URL || "";
    return base.replace("/api", "");
  }, []);

  const getFileUrl = (fileName) => `${baseUploadsUrl}/uploads/${fileName}`;

  const getExt = (name = "") => {
    const idx = name.lastIndexOf(".");
    return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
  };

  const isImage = (ext) =>
    ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"].includes(ext);
  const isPdf = (ext) => ext === "pdf";
  const isPlainText = (ext) => ["txt", "md", "csv", "json", "log"].includes(ext);
  const canInlinePreview = (ext) => isImage(ext) || isPdf(ext) || isPlainText(ext);

  const handlePreview = (doc) => {
    const url = getFileUrl(doc.file_name);
    setPreviewDoc({ doc, url });
  };

  // force a real download using a Blob
  const handleDownload = async (doc) => {
    try {
      const url = getFileUrl(doc.file_name);
      const res = await fetch(url); // include if your API uses cookies
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      const a = document.createElement("a");
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = doc.original_name || doc.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      console.error("Download failed:", e);
      alert("Download failed");
    }
  };

  const closePreview = () => setPreviewDoc(null);

  // --- inline styles ---
  //   const styles = {
  //     page: {
  //       fontFamily:
  //         '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
  //       background: "#f6f7fb",
  //       minHeight: "100vh",
  //       color: "#1f2937",
  //     },
  //     container: { maxWidth: 960, margin: "32px auto", padding: "0 16px" },
  //     card: {
  //       background: "#fff",
  //       borderRadius: 12,
  //       boxShadow: "0 6px 24px rgba(16,24,40,0.06)",
  //       padding: 20,
  //     },
  //     title: { margin: "0 0 16px", fontSize: 22, fontWeight: 700, display: "flex", gap: 8 },
  //     group: { marginBottom: 12 },
  //     input: {
  //       width: "100%",
  //       padding: "10px 12px",
  //       borderRadius: 8,
  //       border: "1px solid #d1d5db",
  //       background: "#fff",
  //       fontSize: 14,
  //       outline: "none",
  //       boxShadow: "0 1px 2px rgba(16,24,40,0.04) inset",
  //     },
  //     fileInput: {
  //       width: "100%",
  //       padding: 8,
  //       borderRadius: 8,
  //       border: "1px solid #d1d5db",
  //       background: "#fff",
  //       fontSize: 14,
  //       outline: "none",
  //     },
  //     actionsRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  //     btnBase: {
  //       display: "inline-flex",
  //       alignItems: "center",
  //       justifyContent: "center",
  //       gap: 8,
  //       borderRadius: 8,
  //       fontSize: 14,
  //       lineHeight: 1.1,
  //       padding: "10px 14px",
  //       border: "1px solid transparent",
  //       cursor: "pointer",
  //       userSelect: "none",
  //       textDecoration: "none",
  //       transition: "transform 0.02s ease-out",
  //     },
  //     btnPrimary: { background: "#2563eb", color: "#fff", borderColor: "#1d4ed8" },
  //     btnOutlinePrimary: { background: "#fff", color: "#1d4ed8", borderColor: "#93c5fd" },
  //     btnOutlineSuccess: { background: "#fff", color: "#059669", borderColor: "#86efac" },
  //     btnOutlineSecondary: { background: "#fff", color: "#374151", borderColor: "#d1d5db" },
  //     btnSmall: { padding: "8px 10px", fontSize: 13, borderRadius: 6 },
  //     hr: {
  //       height: 1,
  //       border: "none",
  //       background:
  //         "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(203,213,225,.8) 50%, rgba(0,0,0,0) 100%)",
  //       margin: "18px 0",
  //     },
  //     subsectionTitle: { margin: "0 0 10px", fontSize: 18, fontWeight: 700, color: "#111827" },
  //     tableWrap: {
  //       borderRadius: 12,
  //       overflow: "hidden",
  //       boxShadow: "0 1px 0 rgba(16,24,40,0.06)",
  //       border: "1px solid #e5e7eb",
  //       background: "#fff",
  //     },
  //     table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 14 },
  //     th: {
  //       textAlign: "left",
  //       background: "#f9fafb",
  //       color: "#374151",
  //       fontWeight: 600,
  //       borderBottom: "1px solid #e5e7eb",
  //       padding: "12px 14px",
  //     },
  //     td: { padding: "12px 14px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" },
  //     actionsCell: { padding: "12px 14px", borderBottom: "1px solid #f3f4f6", width: 280 },
  //     zebra: { background: "#fcfcfd" },
  //     emptyState: { padding: 24, textAlign: "center", color: "#6b7280", fontSize: 14 },
  //   };

  //   const modalStyles = {
  //     overlay: {
  //       position: "fixed",
  //       inset: 0,
  //       background: "rgba(0,0,0,0.6)",
  //       display: "flex",
  //       alignItems: "center",
  //       justifyContent: "center",
  //       zIndex: 1050,
  //       padding: "2rem",
  //     },
  //     content: {
  //       background: "#fff",
  //       borderRadius: 8,
  //       maxWidth: "90vw",
  //       width: "100%",
  //       maxHeight: "90vh",
  //       display: "flex",
  //       flexDirection: "column",
  //       overflow: "hidden",
  //       boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
  //     },
  //     header: {
  //       padding: "0.75rem 1rem",
  //       borderBottom: "1px solid #eee",
  //       display: "flex",
  //       alignItems: "center",
  //       justifyContent: "space-between",
  //       gap: "1rem",
  //     },
  //     body: { padding: 0, flex: 1, overflow: "auto", background: "#fafafa" },
  //     footer: {
  //       padding: "0.75rem 1rem",
  //       borderTop: "1px solid #eee",
  //       display: "flex",
  //       gap: "0.5rem",
  //       justifyContent: "flex-end",
  //     },
  //     iframe: { width: "100%", height: "75vh", border: 0, display: "block" },
  //     img: { maxWidth: "100%", height: "auto", display: "block", margin: "0 auto" },
  //     closeBtn: { border: "none", background: "transparent", fontSize: "1.5rem", cursor: "pointer" },
  //   };

  //   const press = (e) => (e.currentTarget.style.transform = "translateY(1px)");
  //   const release = (e) => (e.currentTarget.style.transform = "translateY(0)");

  //   return (
  //     <div style={styles.page}>
  //       <div style={styles.container}>
  //         <div style={styles.card}>
  //           <h4 style={styles.title}>📁 Upload Documents</h4>
  //           <div style={{ fontSize: 13, color: lockInfo.canEdit ? "#059669" : "#b91c1c", marginBottom: 8 }}>
  //   {lockInfo.canEdit ? "🟢 Editable" : "🔴 Locked"} (status: {lockInfo.status || "unknown"})
  // </div>


  //           <div style={styles.group}>
  //             <input
  //               type="text"
  //               value={lan}
  //               readOnly
  //               placeholder="LAN ID"
  //               style={styles.input}
  //               aria-label="LAN ID"
  //             />
  //           </div>

  //           <div style={styles.group}>
  //             <input
  //               type="text"
  //               name="filename"
  //               placeholder="Enter document name"
  //               value={fileNameInput}
  //               onChange={handleFilenameChange}
  //               style={styles.input}
  //               aria-label="Document name"
  //             />
  //           </div>

  //           <div style={styles.group}>
  //             <input
  //               type="file"
  //               onChange={handleFileChange}
  //               style={styles.fileInput}
  //               aria-label="Choose file to upload"
  //             />
  //           </div>

  //           <div style={{ ...styles.group, ...styles.actionsRow }}>
  //             <button
  //               style={{ ...styles.btnBase, ...styles.btnPrimary }}
  //               onMouseDown={press}
  //               onMouseUp={release}
  //               onMouseLeave={release}
  //               onClick={handleUpload}
  //             >
  //               Upload
  //             </button>
  //           </div>

  //           <hr style={styles.hr} />

  //           <h5 style={styles.subsectionTitle}>Uploaded Documents</h5>

  //           <div style={styles.tableWrap}>
  //             <table style={styles.table}>
  //               <thead>
  //                 <tr>
  //                   <th style={styles.th}>File Name</th>
  //                   <th style={styles.th}>Uploaded At</th>
  //                   <th style={{ ...styles.th, width: 280 }}>Actions</th>
  //                 </tr>
  //               </thead>
  //               <tbody>
  //                 {uploadedDocs.length === 0 && (
  //                   <tr>
  //                     <td colSpan={3} style={styles.emptyState}>
  //                       No documents uploaded yet.
  //                     </td>
  //                   </tr>
  //                 )}

  //                 {uploadedDocs.map((doc, idx) => {
  //                   const fileUrl = getFileUrl(doc.file_name);
  //                   const ext = getExt(doc.original_name || doc.file_name);
  //                   const previewable = canInlinePreview(ext);
  //                   const rowStyle = idx % 2 === 1 ? styles.zebra : null;

  //                   return (
  //                     <tr key={doc.id} style={rowStyle}>
  //                       <td style={styles.td}>{doc.original_name || doc.file_name}</td>
  //                       <td style={styles.td}>{new Date(doc.uploaded_at).toLocaleString()}</td>
  //                       <td style={styles.actionsCell}>
  //                         <div style={styles.actionsRow}>
  //                           <button
  //                             type="button"
  //                             onClick={() => handlePreview(doc)}
  //                             title={previewable ? "Preview inline" : "Open in new tab"}
  //                             style={{ ...styles.btnBase, ...styles.btnSmall, ...styles.btnOutlineSecondary }}
  //                             onMouseDown={press}
  //                             onMouseUp={release}
  //                             onMouseLeave={release}
  //                           >
  //                             Preview
  //                           </button>

  //                           {/* Download as real file */}
  //                           <button
  //                             type="button"
  //                             onClick={() => handleDownload(doc)}
  //                             style={{ ...styles.btnBase, ...styles.btnSmall, ...styles.btnOutlineSuccess }}
  //                             onMouseDown={press}
  //                             onMouseUp={release}
  //                             onMouseLeave={release}
  //                           >
  //                             Download
  //                           </button>

  //                           {/* Open in new tab */}
  //                           <a
  //                             href={fileUrl}
  //                             target="_blank"
  //                             rel="noreferrer"
  //                             style={{ ...styles.btnBase, ...styles.btnSmall, ...styles.btnOutlinePrimary }}
  //                             onMouseDown={press}
  //                             onMouseUp={release}
  //                             onMouseLeave={release}
  //                           >
  //                             Open
  //                           </a>
  //                           <button
  //   type="button"
  //   onClick={() => startReplace(doc)}
  //   disabled={!lockInfo.canEdit}
  //   title={lockInfo.canEdit ? "Replace this file" : `Locked (status: ${lockInfo.status})`}
  //   style={{ ...styles.btnBase, ...styles.btnSmall, ...styles.btnOutlinePrimary, opacity: lockInfo.canEdit ? 1 : 0.6, cursor: lockInfo.canEdit ? "pointer" : "not-allowed" }}
  //   onMouseDown={press}
  //   onMouseUp={release}
  //   onMouseLeave={release}
  // >
  //   Replace
  // </button>

  // <button
  //   type="button"
  //   onClick={() => handleDelete(doc)}
  //   disabled={!lockInfo.canEdit}
  //   title={lockInfo.canEdit ? "Delete this file" : `Locked (status: ${lockInfo.status})`}
  //   style={{ ...styles.btnBase, ...styles.btnSmall, ...styles.btnOutlineSecondary, opacity: lockInfo.canEdit ? 1 : 0.6, cursor: lockInfo.canEdit ? "pointer" : "not-allowed" }}
  //   onMouseDown={press}
  //   onMouseUp={release}
  //   onMouseLeave={release}
  // >
  //   Delete
  // </button>

  //                         </div>
  //                       </td>
  //                     </tr>
  //                   );
  //                 })}
  //               </tbody>
  //             </table>
  //           </div>

  //           <input
  //   type="file"
  //   ref={fileReplaceRef}
  //   style={{ display: "none" }}
  //   onChange={onReplaceFileChosen}
  //   aria-hidden="true"
  // />


  //           {/* Preview Modal */}
  //           {previewDoc && (
  //             <div style={modalStyles.overlay} onClick={closePreview}>
  //               <div
  //                 style={modalStyles.content}
  //                 onClick={(e) => e.stopPropagation()}
  //                 role="dialog"
  //                 aria-modal="true"
  //               >
  //                 <div style={modalStyles.header}>
  //                   <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
  //                     {previewDoc.doc?.original_name}
  //                   </strong>
  //                   <button style={modalStyles.closeBtn} onClick={closePreview} aria-label="Close preview">
  //                     ×
  //                   </button>
  //                 </div>

  //                 <div style={modalStyles.body}>
  //                   {(() => {
  //                     const name = previewDoc.doc?.original_name || previewDoc.doc?.file_name;
  //                     const ext = getExt(name);
  //                     const url = previewDoc.url;

  //                     if (isImage(ext)) return <img src={url} alt={name} style={modalStyles.img} />;
  //                     if (isPdf(ext) || isPlainText(ext))
  //                       return <iframe src={url} title={name} style={modalStyles.iframe} />;

  //                     return (
  //                       <div style={{ padding: 16 }}>
  //                         <p style={{ marginBottom: 10 }}>
  //                           Preview not available for <code>.{ext || "unknown"}</code> files.
  //                         </p>
  //                         <a
  //                           href={url}
  //                           target="_blank"
  //                           rel="noreferrer"
  //                           style={{ ...styles.btnBase, ...styles.btnOutlinePrimary }}
  //                         >
  //                           Open in new tab
  //                         </a>
  //                       </div>
  //                     );
  //                   })()}
  //                 </div>

  //                 <div style={modalStyles.footer}>
  //                   {/* FIX: use previewDoc.doc here */}
  //                   <button
  //                     type="button"
  //                     onClick={() => handleDownload(previewDoc.doc)}
  //                     style={{ ...styles.btnBase, ...styles.btnOutlineSuccess }}
  //                   >
  //                     Download
  //                   </button>

  //                   <a
  //                     href={previewDoc.url}
  //                     target="_blank"
  //                     rel="noreferrer"
  //                     style={{ ...styles.btnBase, ...styles.btnOutlinePrimary }}
  //                   >
  //                     Open in new tab
  //                   </a>

  //                   <button
  //                     onClick={closePreview}
  //                     style={{ ...styles.btnBase, ...styles.btnOutlineSecondary }}
  //                   >
  //                     Close
  //                   </button>
  //                 </div>
  //               </div>
  //             </div>
  //           )}
  //         </div>
  //       </div>
  //     </div>
  //   );


  const styles = {
    page: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
      background:
        "radial-gradient(circle at top right, rgba(56,189,248,0.08), transparent 22%), linear-gradient(180deg, #f7fbff 0%, #eef4fa 100%)",
      minHeight: "100vh",
      color: "#1f2937",
      padding: "24px 0",
    },

    container: {
      maxWidth: 1120,
      margin: "0 auto",
      padding: "0 18px",
    },

    hero: {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 18,
      alignItems: "stretch",
      marginBottom: 20,
    },

    heroLeft: {
      background:
        "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(240,248,255,0.94))",
      borderRadius: 24,
      border: "1px solid #dbe5f0",
      boxShadow: "0 16px 38px rgba(15, 23, 42, 0.07)",
      padding: 24,
    },

    heroBadge: {
      display: "inline-flex",
      width: "fit-content",
      padding: "8px 14px",
      borderRadius: 999,
      background:
        "linear-gradient(90deg, rgba(56,189,248,0.16), rgba(56,189,248,0.05))",
      border: "1px solid rgba(56,189,248,0.22)",
      color: "#0f172a",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      marginBottom: 14,
    },

    heroTitle: {
      margin: 0,
      fontSize: 24,
      fontWeight: 700,
      color: "#102a56",
      letterSpacing: "-0.02em",
      display: "flex",
      alignItems: "center",
      gap: 10,
    },

    heroText: {
      margin: "10px 0 0",
      fontSize: 15,
      lineHeight: 1.6,
      color: "#5b6778",
      maxWidth: 700,
    },

    heroStat: {
      background: "linear-gradient(135deg, #081225, #17385c)",
      borderRadius: 24,
      padding: 22,
      color: "#fff",
      boxShadow: "0 16px 30px rgba(15, 23, 42, 0.18)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    },

    heroStatLabel: {
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      color: "rgba(255,255,255,0.72)",
      marginBottom: 8,
      fontWeight: 700,
    },

    heroStatValue: {
      fontSize: 18,
      fontWeight: 700,
      lineHeight: 1.3,
    },

    card: {
      background: "#fff",
      borderRadius: 24,
      boxShadow: "0 14px 34px rgba(16,24,40,0.07)",
      padding: 24,
      border: "1px solid #dbe5f0",
    },

    cardHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 14,
      flexWrap: "wrap",
      marginBottom: 18,
    },

    title: {
      margin: 0,
      fontSize: 18,
      fontWeight: 700,
      display: "flex",
      alignItems: "center",
      gap: 10,
      color: "#17356b",
    },

    titleAccent: {
      width: 8,
      height: 34,
      borderRadius: 999,
      background: "linear-gradient(180deg, #38bdf8, #2563eb)",
      boxShadow: "0 0 0 6px rgba(56,189,248,0.12)",
    },

    statusPill: (editable) => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "9px 14px",
      borderRadius: 999,
      fontSize: 13,
      fontWeight: 600,
      background: editable ? "#eafbf2" : "#fff1f2",
      color: editable ? "#047857" : "#b91c1c",
      border: editable ? "1px solid #bbf7d0" : "1px solid #fecdd3",
    }),

    formGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1.1fr auto",
      gap: 14,
      alignItems: "end",
      marginBottom: 8,
    },

    group: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      marginBottom: 0,
    },

    label: {
      fontSize: 12,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      color: "#475569",
    },

    input: {
      width: "100%",
      height: 50,
      padding: "0 16px",
      borderRadius: 16,
      border: "1px solid #d6e0ec",
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
      fontSize: 14,
      outline: "none",
      boxShadow: "inset 0 1px 2px rgba(16,24,40,0.03)",
      color: "#0f172a",
    },

    fileInputWrap: {
      border: "1px dashed #c5d4e6",
      borderRadius: 18,
      padding: 16,
      background: "#f8fbff",
      marginTop: 8,
      marginBottom: 16,
    },

    fileInput: {
      width: "100%",
      padding: 6,
      borderRadius: 10,
      border: "none",
      background: "transparent",
      fontSize: 14,
      outline: "none",
    },

    actionsRow: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      alignItems: "center",
    },

    btnBase: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 14,
      fontSize: 14,
      lineHeight: 1.1,
      padding: "11px 16px",
      border: "1px solid transparent",
      cursor: "pointer",
      userSelect: "none",
      textDecoration: "none",
      transition: "all .18s ease",
      fontWeight: 600,
    },

    btnPrimary: {
      background: "linear-gradient(90deg, #020617 0%, #0f172a 55%, #1d456a 100%)",
      color: "#fff",
      borderColor: "rgba(56, 189, 248, 0.18)",
      boxShadow: "0 10px 22px rgba(14, 116, 144, 0.22)",
    },

    btnOutlinePrimary: {
      background: "#f8fbff",
      color: "#1d4ed8",
      borderColor: "#bfdbfe",
    },

    btnOutlineSuccess: {
      background: "#effdf5",
      color: "#059669",
      borderColor: "#a7f3d0",
    },

    btnOutlineSecondary: {
      background: "#ffffff",
      color: "#374151",
      borderColor: "#d1d5db",
    },

    btnDanger: {
      background: "#fff1f2",
      color: "#dc2626",
      borderColor: "#fecdd3",
    },

    btnSmall: {
      padding: "9px 12px",
      fontSize: 13,
      borderRadius: 12,
    },

    hr: {
      height: 1,
      border: "none",
      background:
        "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(203,213,225,.8) 50%, rgba(0,0,0,0) 100%)",
      margin: "20px 0",
    },

    subsectionTitle: {
      margin: "0 0 12px",
      fontSize: 18,
      fontWeight: 700,
      color: "#17356b",
      display: "flex",
      alignItems: "center",
      gap: 10,
    },

    tableWrap: {
      borderRadius: 18,
      overflow: "hidden",
      border: "1px solid #e5edf5",
      background: "#fff",
    },

    table: {
      width: "100%",
      borderCollapse: "separate",
      borderSpacing: 0,
      fontSize: 14,
    },

    th: {
      textAlign: "left",
      background: "linear-gradient(180deg, #f7faff 0%, #edf3fa 100%)",
      color: "#48627f",
      fontWeight: 700,
      borderBottom: "1px solid #e5edf5",
      padding: "14px 16px",
      fontSize: 12,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
    },

    td: {
      padding: "14px 16px",
      borderBottom: "1px solid #f3f6fa",
      verticalAlign: "middle",
      color: "#111827",
    },

    actionsCell: {
      padding: "14px 16px",
      borderBottom: "1px solid #f3f6fa",
      width: 320,
    },

    zebra: {
      background: "#fbfdff",
    },

    emptyState: {
      padding: 28,
      textAlign: "center",
      color: "#6b7280",
      fontSize: 14,
    },
    hiddenFileInput: {
      position: "absolute",
      left: "-9999px",
      width: 1,
      height: 1,
      opacity: 0,
    },

    fileUploadBox: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
      position: "relative",
    },

    chooseFileBtn: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 120,
      height: 42,
      padding: "0 16px",
      borderRadius: 12,
      border: "1px solid #bfdbfe",
      background: "linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)",
      color: "#1d4ed8",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      boxShadow: "0 6px 14px rgba(37, 99, 235, 0.08)",
    },

    fileMeta: {
      minHeight: 42,
      flex: 1,
      display: "flex",
      alignItems: "center",
      padding: "0 14px",
      borderRadius: 12,
      border: "1px solid #dbe5ef",
      background: "#ffffff",
      color: "#475569",
      fontSize: 14,
    },
  };

  const modalStyles = {
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(2,6,23,0.58)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1050,
      padding: "2rem",
      backdropFilter: "blur(4px)",
    },

    content: {
      background: "#fff",
      borderRadius: 22,
      maxWidth: "92vw",
      width: "100%",
      maxHeight: "90vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      boxShadow: "0 20px 50px rgba(0,0,0,0.22)",
      border: "1px solid #dbe5f0",
    },

    header: {
      padding: "14px 18px",
      borderBottom: "1px solid #eef2f7",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "1rem",
      background: "#f8fbff",
    },

    body: {
      padding: 0,
      flex: 1,
      overflow: "auto",
      background: "#fafcff",
    },

    footer: {
      padding: "14px 18px",
      borderTop: "1px solid #eef2f7",
      display: "flex",
      gap: "0.5rem",
      justifyContent: "flex-end",
      background: "#fff",
    },

    iframe: {
      width: "100%",
      height: "75vh",
      border: 0,
      display: "block",
    },

    img: {
      maxWidth: "100%",
      height: "auto",
      display: "block",
      margin: "0 auto",
    },

    closeBtn: {
      border: "none",
      background: "transparent",
      fontSize: "1.5rem",
      cursor: "pointer",
      color: "#334155",
    },


    fileInputWrap: {
      border: "1px dashed #c5d4e6",
      borderRadius: 16,
      padding: 16,
      background: "#f8fbff",
      marginTop: 8,
      marginBottom: 18,
    },

    hiddenFileInput: {
      position: "absolute",
      left: "-9999px",
      width: 1,
      height: 1,
      opacity: 0,
    },

    fileUploadBox: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
      position: "relative",
    },
    chooseFileBtn: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 120,
      height: 42,
      padding: "0 16px",
      borderRadius: 12,
      border: "1px solid #bfdbfe",
      background: "linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)",
      color: "#1d4ed8",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      boxShadow: "0 6px 14px rgba(37, 99, 235, 0.08)",
    },

    fileMeta: {
      minHeight: 42,
      flex: 1,
      display: "flex",
      alignItems: "center",
      padding: "0 14px",
      borderRadius: 12,
      border: "1px solid #dbe5ef",
      background: "#ffffff",
      color: "#475569",
      fontSize: 14,
    },

    hiddenFileInput: {
      position: "absolute",
      opacity: 0,
      pointerEvents: "none",
      width: 1,
      height: 1,
    },
  };

  const press = (e) => (e.currentTarget.style.transform = "translateY(1px)");
  const release = (e) => (e.currentTarget.style.transform = "translateY(0)");

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.hero}>
          <div style={styles.heroLeft}>
            <div style={styles.heroBadge}>Document Center</div>
            <h2 style={styles.heroTitle}>📁 Upload Documents</h2>
            <p style={styles.heroText}>
              Upload, preview, replace, download, and manage customer documents for
              this LAN from one clean workspace.
            </p>
          </div>

          {/* <div style={styles.heroStat}>
          <div style={styles.heroStatLabel}>LAN</div>
          <div style={styles.heroStatValue}>{lan || "—"}</div>
        </div> */}
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.title}>
              <span style={styles.titleAccent}></span>
              Manage Documents
            </div>

            <div style={styles.statusPill(lockInfo.canEdit)}>
              {lockInfo.canEdit ? "🟢 Editable" : "🔴 Locked"} (status: {lockInfo.status || "unknown"})
            </div>
          </div>

          <div style={styles.formGrid}>
            <div style={styles.group}>
              <label style={styles.label}>LAN ID</label>
              <input
                type="text"
                value={lan}
                readOnly
                placeholder="LAN ID"
                style={styles.input}
                aria-label="LAN ID"
              />
            </div>

            <div style={styles.group}>
              <label style={styles.label}>Document Name</label>
              <input
                type="text"
                name="filename"
                placeholder="Enter document name"
                value={fileNameInput}
                onChange={handleFilenameChange}
                style={styles.input}
                aria-label="Document name"
              />
            </div>

            <div style={styles.group}>
              <label style={styles.label}>Document Status</label>
              <input
                type="text"
                value={lockInfo.status || "unknown"}
                readOnly
                style={styles.input}
                aria-label="Document status"
              />
            </div>

            <div style={{ ...styles.group, justifyContent: "flex-end" }}>
              <button
                style={{ ...styles.btnBase, ...styles.btnPrimary, width: "100%" }}
                onMouseDown={press}
                onMouseUp={release}
                onMouseLeave={release}
                onClick={handleUpload}
              >
                Upload Document
              </button>
            </div>
          </div>


          <div style={styles.fileInputWrap}>
            <label style={{ ...styles.label, display: "block", marginBottom: 10 }}>
              Select File
            </label>

            <div style={styles.fileUploadBox}>
              <input
                type="file"
                id="documentUpload"
                onChange={handleFileChange}
                style={styles.hiddenFileInput}
                aria-label="Choose file to upload"
              />

              <button
                type="button"
                style={styles.chooseFileBtn}
                onClick={() => document.getElementById("documentUpload")?.click()}
              >
                Choose File
              </button>

              <div style={styles.fileMeta}>
                {selectedFile?.name || "No file selected"}
              </div>
            </div>
          </div>
          {/* <div style={styles.fileInputWrap}>
          <label style={{ ...styles.label, display: "block", marginBottom: 10 }}>
            Select File
          </label>
          <input
            type="file"
            onChange={handleFileChange}
            style={styles.fileInput}
            aria-label="Choose file to upload"
          />
        </div> */}

          <hr style={styles.hr} />

          <h5 style={styles.subsectionTitle}>
            <span style={styles.titleAccent}></span>
            Uploaded Documents
          </h5>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>File Name</th>
                  <th style={styles.th}>Uploaded At</th>
                  <th style={{ ...styles.th, width: 320 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {uploadedDocs.length === 0 && (
                  <tr>
                    <td colSpan={3} style={styles.emptyState}>
                      No documents uploaded yet.
                    </td>
                  </tr>
                )}

                {uploadedDocs.map((doc, idx) => {
                  const fileUrl = getFileUrl(doc.file_name);
                  const ext = getExt(doc.original_name || doc.file_name);
                  const previewable = canInlinePreview(ext);
                  const rowStyle = idx % 2 === 1 ? styles.zebra : null;

                  return (
                    <tr key={doc.id} style={rowStyle}>
                      <td style={styles.td}>{doc.original_name || doc.file_name}</td>
                      <td style={styles.td}>{new Date(doc.uploaded_at).toLocaleString()}</td>
                      <td style={styles.actionsCell}>
                        <div style={styles.actionsRow}>
                          <button
                            type="button"
                            onClick={() => handlePreview(doc)}
                            title={previewable ? "Preview inline" : "Open in new tab"}
                            style={{ ...styles.btnBase, ...styles.btnSmall, ...styles.btnOutlineSecondary }}
                            onMouseDown={press}
                            onMouseUp={release}
                            onMouseLeave={release}
                          >
                            Preview
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownload(doc)}
                            style={{ ...styles.btnBase, ...styles.btnSmall, ...styles.btnOutlineSuccess }}
                            onMouseDown={press}
                            onMouseUp={release}
                            onMouseLeave={release}
                          >
                            Download
                          </button>

                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ ...styles.btnBase, ...styles.btnSmall, ...styles.btnOutlinePrimary }}
                            onMouseDown={press}
                            onMouseUp={release}
                            onMouseLeave={release}
                          >
                            Open
                          </a>

                          <button
                            type="button"
                            onClick={() => startReplace(doc)}
                            disabled={!lockInfo.canEdit}
                            title={lockInfo.canEdit ? "Replace this file" : `Locked (status: ${lockInfo.status})`}
                            style={{
                              ...styles.btnBase,
                              ...styles.btnSmall,
                              ...styles.btnOutlinePrimary,
                              opacity: lockInfo.canEdit ? 1 : 0.6,
                              cursor: lockInfo.canEdit ? "pointer" : "not-allowed",
                            }}
                            onMouseDown={press}
                            onMouseUp={release}
                            onMouseLeave={release}
                          >
                            Replace
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(doc)}
                            disabled={!lockInfo.canEdit}
                            title={lockInfo.canEdit ? "Delete this file" : `Locked (status: ${lockInfo.status})`}
                            style={{
                              ...styles.btnBase,
                              ...styles.btnSmall,
                              ...styles.btnDanger,
                              opacity: lockInfo.canEdit ? 1 : 0.6,
                              cursor: lockInfo.canEdit ? "pointer" : "not-allowed",
                            }}
                            onMouseDown={press}
                            onMouseUp={release}
                            onMouseLeave={release}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <input
            type="file"
            ref={fileReplaceRef}
            style={{ display: "none" }}
            onChange={onReplaceFileChosen}
            aria-hidden="true"
          />

          {previewDoc && (
            <div style={modalStyles.overlay} onClick={closePreview}>
              <div
                style={modalStyles.content}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
              >
                <div style={modalStyles.header}>
                  <strong
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "#102a56",
                    }}
                  >
                    {previewDoc.doc?.original_name}
                  </strong>
                  <button
                    style={modalStyles.closeBtn}
                    onClick={closePreview}
                    aria-label="Close preview"
                  >
                    ×
                  </button>
                </div>

                <div style={modalStyles.body}>
                  {(() => {
                    const name = previewDoc.doc?.original_name || previewDoc.doc?.file_name;
                    const ext = getExt(name);
                    const url = previewDoc.url;

                    if (isImage(ext)) return <img src={url} alt={name} style={modalStyles.img} />;
                    if (isPdf(ext) || isPlainText(ext))
                      return <iframe src={url} title={name} style={modalStyles.iframe} />;

                    return (
                      <div style={{ padding: 20 }}>
                        <p style={{ marginBottom: 12 }}>
                          Preview not available for <code>.{ext || "unknown"}</code> files.
                        </p>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ ...styles.btnBase, ...styles.btnOutlinePrimary }}
                        >
                          Open in new tab
                        </a>
                      </div>
                    );
                  })()}
                </div>

                <div style={modalStyles.footer}>
                  <button
                    type="button"
                    onClick={() => handleDownload(previewDoc.doc)}
                    style={{ ...styles.btnBase, ...styles.btnOutlineSuccess }}
                  >
                    Download
                  </button>

                  <a
                    href={previewDoc.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...styles.btnBase, ...styles.btnOutlinePrimary }}
                  >
                    Open in new tab
                  </a>

                  <button
                    onClick={closePreview}
                    style={{ ...styles.btnBase, ...styles.btnOutlineSecondary }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

};

export default DocumentsPage;

