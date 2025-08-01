import React, { useState } from "react";
import { useParams } from "react-router-dom";
import TriggerReportForm from "./TriggerReportForm";
import DownloadedReports from "./DownloadedReports";
import "../../styles/ReportDetail.css";

const ReportDetail = () => {
  const { reportId } = useParams();
  const [activeTab, setActiveTab] = useState("trigger"); // default view

  return (
    <div className="report-detail-container ">
      {/* Sidebar */}
      <div className="sidebar-options">
        <div onClick={() => window.history.back()} className="back-arrow"><svg height="32" width="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="15 18 9 12 15 6" />
  </svg></div>
        <ul className="options-list">
          <li className={activeTab === "trigger" ? "active" : ""} onClick={() => setActiveTab("trigger")}>
            TRIGGER
          </li>
          <li className={activeTab === "downloads" ? "active" : ""} onClick={() => setActiveTab("downloads")}>
            DOWNLOAD
          </li>
        </ul>
      </div>

      {/* Content */}
      <div className="report-content">
        <h3 className="report-name">Report Name: {reportId}</h3>

        {activeTab === "trigger" && <TriggerReportForm reportIdFromParent={reportId} />}
        {activeTab === "downloads" && <DownloadedReports reportIdFromParent={reportId} />}
      </div>
    </div>
  );
};

export default ReportDetail;
