import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useParams } from "react-router-dom";
import "../../styles/ReportsDownload.css";

const DownloadedReports = ({ reportIdFromParent }) => {
  const { reportId: routeReportId } = useParams();
  const reportId = reportIdFromParent || routeReportId;
  const [downloads, setDownloads] = useState([]);

  useEffect(() => {
    if (!reportId) return;

    const fetchDownloads = async () => {
      try {
        const response = await api.get(
          `/reports/downloads?reportId=${encodeURIComponent(reportId)}`
        );
        setDownloads(response.data);
        console.log("Fetched downloads:", response.data);
      } catch (error) {
        console.error("Failed to fetch downloads:", error);
      }
    };

    fetchDownloads();
    const interval = setInterval(fetchDownloads, 3000); // Refresh every 3 seconds

    return () => clearInterval(interval); // Cleanup on unmount
  }, [reportId]);

  return (
    <div className="downloaded-reports-container">
      <h2 className="downloaded-reports-title">Downloaded Reports</h2>
      <table className="download-table">
        <thead>
          <tr>
            <th>Report</th>
            <th>Report ID</th>
            <th>Status</th>
            <th>Time Taken</th>
            <th>Description</th>
            <th>Product</th>
            <th>Created By</th>
            <th>Generated At</th>
          </tr>
        </thead>
        <tbody>
          {Array.isArray(downloads) && downloads.length > 0 ? (
            downloads.map((report, index) => (
              <tr key={index}>
                <td>
                  {report.status === "Completed" ? (
                    <a
                      href={`/reports/${report.file_name}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {report.file_name || "-"}
                    </a>
                  ) : (
                    report.file_name || "-"
                  )}
                </td>
                <td>{report.report_id}</td>
                <td>
                  <span className={`status-badge ${report.status?.toLowerCase()}`}>
                    {report.status || "Unknown"}
                  </span>
                </td>
                <td>{report.time_taken || "In progress"}</td>
                <td>{report.description}</td>
                <td>{report.product}</td>
                <td>{report.created_by}</td>
                <td>{report.generated_at}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="8">No reports found for this report ID.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DownloadedReports;
