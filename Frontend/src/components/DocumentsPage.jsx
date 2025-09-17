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


import React, { useState, useEffect, useMemo } from "react";
import api from "../api/api";
import { useParams } from "react-router-dom";

const DocumentsPage = () => {
  const { lan } = useParams();
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileNameInput, setFileNameInput] = useState("");
  const [uploadedDocs, setUploadedDocs] = useState([]);

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
  const styles = {
    page: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
      background: "#f6f7fb",
      minHeight: "100vh",
      color: "#1f2937",
    },
    container: { maxWidth: 960, margin: "32px auto", padding: "0 16px" },
    card: {
      background: "#fff",
      borderRadius: 12,
      boxShadow: "0 6px 24px rgba(16,24,40,0.06)",
      padding: 20,
    },
    title: { margin: "0 0 16px", fontSize: 22, fontWeight: 700, display: "flex", gap: 8 },
    group: { marginBottom: 12 },
    input: {
      width: "100%",
      padding: "10px 12px",
      borderRadius: 8,
      border: "1px solid #d1d5db",
      background: "#fff",
      fontSize: 14,
      outline: "none",
      boxShadow: "0 1px 2px rgba(16,24,40,0.04) inset",
    },
    fileInput: {
      width: "100%",
      padding: 8,
      borderRadius: 8,
      border: "1px solid #d1d5db",
      background: "#fff",
      fontSize: 14,
      outline: "none",
    },
    actionsRow: { display: "flex", gap: 10, flexWrap: "wrap" },
    btnBase: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 8,
      fontSize: 14,
      lineHeight: 1.1,
      padding: "10px 14px",
      border: "1px solid transparent",
      cursor: "pointer",
      userSelect: "none",
      textDecoration: "none",
      transition: "transform 0.02s ease-out",
    },
    btnPrimary: { background: "#2563eb", color: "#fff", borderColor: "#1d4ed8" },
    btnOutlinePrimary: { background: "#fff", color: "#1d4ed8", borderColor: "#93c5fd" },
    btnOutlineSuccess: { background: "#fff", color: "#059669", borderColor: "#86efac" },
    btnOutlineSecondary: { background: "#fff", color: "#374151", borderColor: "#d1d5db" },
    btnSmall: { padding: "8px 10px", fontSize: 13, borderRadius: 6 },
    hr: {
      height: 1,
      border: "none",
      background:
        "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(203,213,225,.8) 50%, rgba(0,0,0,0) 100%)",
      margin: "18px 0",
    },
    subsectionTitle: { margin: "0 0 10px", fontSize: 18, fontWeight: 700, color: "#111827" },
    tableWrap: {
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 1px 0 rgba(16,24,40,0.06)",
      border: "1px solid #e5e7eb",
      background: "#fff",
    },
    table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 14 },
    th: {
      textAlign: "left",
      background: "#f9fafb",
      color: "#374151",
      fontWeight: 600,
      borderBottom: "1px solid #e5e7eb",
      padding: "12px 14px",
    },
    td: { padding: "12px 14px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" },
    actionsCell: { padding: "12px 14px", borderBottom: "1px solid #f3f4f6", width: 280 },
    zebra: { background: "#fcfcfd" },
    emptyState: { padding: 24, textAlign: "center", color: "#6b7280", fontSize: 14 },
  };

  const modalStyles = {
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1050,
      padding: "2rem",
    },
    content: {
      background: "#fff",
      borderRadius: 8,
      maxWidth: "90vw",
      width: "100%",
      maxHeight: "90vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
    },
    header: {
      padding: "0.75rem 1rem",
      borderBottom: "1px solid #eee",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "1rem",
    },
    body: { padding: 0, flex: 1, overflow: "auto", background: "#fafafa" },
    footer: {
      padding: "0.75rem 1rem",
      borderTop: "1px solid #eee",
      display: "flex",
      gap: "0.5rem",
      justifyContent: "flex-end",
    },
    iframe: { width: "100%", height: "75vh", border: 0, display: "block" },
    img: { maxWidth: "100%", height: "auto", display: "block", margin: "0 auto" },
    closeBtn: { border: "none", background: "transparent", fontSize: "1.5rem", cursor: "pointer" },
  };

  const press = (e) => (e.currentTarget.style.transform = "translateY(1px)");
  const release = (e) => (e.currentTarget.style.transform = "translateY(0)");

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.card}>
          <h4 style={styles.title}>📁 Upload Documents</h4>

          <div style={styles.group}>
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
            <input
              type="file"
              onChange={handleFileChange}
              style={styles.fileInput}
              aria-label="Choose file to upload"
            />
          </div>

          <div style={{ ...styles.group, ...styles.actionsRow }}>
            <button
              style={{ ...styles.btnBase, ...styles.btnPrimary }}
              onMouseDown={press}
              onMouseUp={release}
              onMouseLeave={release}
              onClick={handleUpload}
            >
              Upload
            </button>
          </div>

          <hr style={styles.hr} />

          <h5 style={styles.subsectionTitle}>Uploaded Documents</h5>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>File Name</th>
                  <th style={styles.th}>Uploaded At</th>
                  <th style={{ ...styles.th, width: 280 }}>Actions</th>
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

                          {/* Download as real file */}
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

                          {/* Open in new tab */}
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Preview Modal */}
          {previewDoc && (
            <div style={modalStyles.overlay} onClick={closePreview}>
              <div
                style={modalStyles.content}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
              >
                <div style={modalStyles.header}>
                  <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {previewDoc.doc?.original_name}
                  </strong>
                  <button style={modalStyles.closeBtn} onClick={closePreview} aria-label="Close preview">
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
                      <div style={{ padding: 16 }}>
                        <p style={{ marginBottom: 10 }}>
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
                  {/* FIX: use previewDoc.doc here */}
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

