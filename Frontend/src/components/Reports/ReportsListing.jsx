// This is a simple React component that lists reports with a search functionality.
import React, { useState } from "react";
import { Link } from "react-router-dom";
import "../../styles/ReportsListing.css"; // Optional for styling   

const dummyReports = [
  { id: 1, name: "Consolidated MIS" },
  { id: 2, name: "Due Demand vs Collection Report(All products)" },
  { id: 3, name: "CashFlow Report" },
  { id: 4, name: "RPS Generate Report" },
  { id: 5, name: "Delayed Interest Report" },
  { id: 6, name: "GQ Non-FSF IRR Report" }, // ✅ New report added here
  { id: 7, name: "Adikosh CAM Report" }, // ✅ New report added here  
  { id: 8, name: "Adikosh CAM Report Print" }, // ✅ New report added here
  { id: 9, name: "CashFlow Report Bank Date" } // ✅ New report added here
];

const ReportsListing = () => {
  const [search, setSearch] = useState("");

  const filteredReports = dummyReports.filter(report =>
    report.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container mt-4">
      <h3>📊 MIS Report Listing</h3>

      <input
        type="text"
        className="form-control my-3"
        placeholder="Search reports..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <ul className="list-group">
        {filteredReports.map((report) => (
          
// Inside map loop:
<li key={report.id} className="list-group-item">
  <Link to={`/mis-reports/${report.name.replace(/\s+/g, "-").toLowerCase()}`}>
    {report.name}
  </Link>
</li>
        ))}
      </ul>
    </div>
  );
};

export default ReportsListing;
