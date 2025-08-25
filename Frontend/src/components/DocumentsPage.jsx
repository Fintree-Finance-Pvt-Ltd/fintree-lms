import React, { useState, useEffect } from "react";
import api from "../api/api";
import { useParams } from "react-router-dom";

const DocumentsPage = () => {
  const { lan } = useParams();
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileNameInput, setFileNameInput] = useState("");
  const [uploadedDocs, setUploadedDocs] = useState([]);

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
    formData.append("document", selectedFile); // for multer
    formData.append("filename", fileNameInput); // user-provided name

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

  return (
    <div className="container mt-4">
      <h4>📁 Upload Documents</h4>

      <div className="mb-3">
        <input
          type="text"
          className="form-control"
          value={lan}
          readOnly
          placeholder="LAN ID"
        />
      </div>
      <div className="mb-3">
        <input
          type="text"
          name="filename"
          className="form-control"
          placeholder="Enter document name"
          value={fileNameInput}
          onChange={handleFilenameChange}
        />
      </div>
      <div className="mb-3">
        <input type="file" className="form-control" onChange={handleFileChange} />
      </div>
      <div className="mb-3">
        <button className="btn btn-primary" onClick={handleUpload}>
          Upload
        </button>
      </div>

      <hr />
      <h5>Uploaded Documents</h5>
      <table className="table">
        <thead>
          <tr>
            <th>File Name</th>
            <th>Uploaded At</th>
            <th>Download</th>
          </tr>
        </thead>
        <tbody>
          {uploadedDocs.map((doc) => (
            <tr key={doc.id}>
              <td>{doc.original_name}</td>
              <td>{new Date(doc.uploaded_at).toLocaleString()}</td>
              <td>
                <a
  href={`${import.meta.env.VITE_API_BASE_URL.replace("/api", "")}/uploads/${doc.file_name}`}
  download={doc.original_name}
  target="_blank"
  rel="noreferrer"
>
  Download
</a>

              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DocumentsPage;
