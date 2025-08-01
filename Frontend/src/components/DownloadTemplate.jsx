import React from "react";
import api from "../api/api";


const products = [
  { key: "ev", name: "EV Loan Booking" },
  { key: "bl", name: "BL Loan Booking" },
  { key: "gq_fsf", name: "GQ FSF Loan Booking" },
  { key: "gq_non_fsf", name: "GQ NON-FSF Loan Booking" },
  { key: "adikosh", name: "Adikosh Loan Booking" },
  { key: "utr_upload", name: "UTR Upload" },
  { key: "repayment_upload", name: "Repayment Upload" },
];

const DownloadTemplatePage = () => {
  const handleDownload = async (key) => {
    try {
      console.log(`Downloading template for: ${key}`);
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


  return (
    <div>
      <h2>Download Excel Formats</h2>
      <table border="1" cellPadding="10">
        <thead>
          <tr>
            <th>Product</th>
            <th>Download Format</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.key}>
              <td>{product.name}</td>
              <td>
                <button onClick={() => handleDownload(product.key)}>📥 Download Format</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DownloadTemplatePage;
