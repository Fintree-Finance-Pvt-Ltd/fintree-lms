// // This is a simple React component that lists reports with a search functionality.
// import React, { useState } from "react";
// import { Link } from "react-router-dom";
// import "../../styles/ReportsListing.css"; // Optional for styling   

// const dummyReports = [
//   { id: 1, name: "Consolidated MIS" },
//   { id: 2, name: "Due Demand vs Collection Report(All products)" },
//   { id: 3, name: "CashFlow Report" },
//   { id: 4, name: "RPS Generate Report" },
//   { id: 5, name: "Delayed Interest Report" },
//   { id: 6, name: "IRR Report" }, // ✅ New report added here
//   { id: 7, name: "Adikosh CAM Report" }, // ✅ New report added here  
//   { id: 8, name: "Adikosh CAM Report Print" }, // ✅ New report added here
//   { id: 9, name: "CashFlow Report Bank Date" }, // ✅ New report added here
//   { id: 10, name: "CCOD Loan Data Report" }, // ✅ New report added here
//    { id: 11, name: "Bank Payment File Report" }, // ✅ New report added here
//    {id: 12, name: "Consumer Bureau Report"} , //Consumer Bureau Report
//    {id: 13, name: "Pay Out Report"} , //Consumer Bureau Report
//     { id: 14, name: "Due Demand vs Collection Report(Fintree)" } // Fintree DUE VS Collection


// ];

// const ReportsListing = () => {
//   const [search, setSearch] = useState("");

//   const filteredReports = dummyReports.filter(report =>
//     report.name.toLowerCase().includes(search.toLowerCase())
//   );

//   return (
//     <div className="container mt-4">
//       <h3>📊 MIS Report Listing</h3>

//       <input
//         type="text"
//         className="form-control my-3"
//         placeholder="Search reports..."
//         value={search}
//         onChange={(e) => setSearch(e.target.value)}
//       />

//       <ul className="list-group">
//         {filteredReports.map((report) => (
          
// // Inside map loop:
// <li key={report.id} className="list-group-item">
//   <Link to={`/mis-reports/${report.name.replace(/\s+/g, "-").toLowerCase()}`}>
//     {report.name}
//   </Link>
// </li>
//         ))}
//       </ul>
//     </div>
//   );
// };

// export default ReportsListing;


// import React, { useState, useMemo } from "react";
// import { Link } from "react-router-dom";
// // import { Search, FileBarChart, ArrowRight, AlertCircle } from "lucide-react";
// import { Search, FileChartLine, ArrowRight, AlertCircle } from "lucide-react";
// import "../../styles/ReportsListing.css";
 
// const REPORT_DATA = [
//   { id: 1, name: "Consolidated MIS", category: "MIS" },
//   { id: 2, name: "Due Demand vs Collection Report (All products)", category: "Collection" },
//   { id: 3, name: "CashFlow Report", category: "Finance" },
//   { id: 4, name: "RPS Generate Report", category: "Operations" },
//   { id: 5, name: "Delayed Interest Report", category: "Finance" },
//   { id: 6, name: "IRR Report", category: "Finance" },
//   { id: 7, name: "Adikosh CAM Report", category: "Credit" },
//   { id: 8, name: "Adikosh CAM Report Print", category: "Credit" },
//   { id: 9, name: "CashFlow Report Bank Date", category: "Finance" },
//   { id: 10, name: "CCOD Loan Data Report", category: "Data" },
//   { id: 11, name: "Bank Payment File Report", category: "Finance" },
//   { id: 12, name: "Consumer Bureau Report", category: "Compliance" },
//   { id: 13, name: "Pay Out Report", category: "Finance" },
//   { id: 14, name: "Due Demand vs Collection Report (Fintree)", category: "Collection" }
// ];
 
// const ReportsListing = () => {
//   const [searchTerm, setSearchTerm] = useState("");
 
//   // Memoized filter for performance and to prevent unnecessary calculations
//   const filteredReports = useMemo(() => {
//     return REPORT_DATA.filter((report) =>
//       report.name.toLowerCase().includes(searchTerm.toLowerCase())
//     );
//   }, [searchTerm]);
 
//   // URL-friendly slug generator
//   const slugify = (text) => text.replace(/\s+/g, "-").toLowerCase();
 
//   return (
//     <div className="reports-container">
//       <header className="reports-header">
//         <div className="title-section">
//           <div className="title-icon-wrapper">
//             <FileChartLine  className="title-icon" size={54} />
//           </div>
//           <div>
//             <h3>MIS Report Listing</h3>
//             <p className="subtitle">Select a report to configure and generate data</p>
//           </div>
//         </div>
 
//         <div className="search-wrapper">
//           <Search className="search-icon" size={18} />
//           <input
//             type="text"
//             className="search-input"
//             placeholder="Search by report name..."
//             value={searchTerm}
//             onChange={(e) => setSearchTerm(e.target.value)}
//           />
//         </div>
//       </header>
 
//       <div className="reports-grid">
//         {filteredReports.length > 0 ? (
//           filteredReports.map((report) => (
//             <div key={report.id} className="report-card">
//               <div className="report-top">
//                 <span className="category-tag">{report.category}</span>
//                 <h4>{report.name}</h4>
//               </div>
             
//               <Link
//                 to={`/mis-reports/${slugify(report.name)}`}
//                 className="generate-link"
//               >
//                 <span>Generate Report</span>
//                 <ArrowRight size={18} className="arrow-icon" />
//               </Link>
//             </div>
//           ))
//         ) : (
//           <div className="empty-state">
//             <div className="empty-icon-wrapper">
//               <AlertCircle size={48} />
//             </div>
//             <p>No reports found matching <strong>"{searchTerm}"</strong></p>
//             <button onClick={() => setSearchTerm("")} className="reset-btn">
//               Clear Search
//             </button>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };
 
// export default ReportsListing;
 

///////////// SAJAG Jain //////////
import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Search, FileChartLine, ArrowRight, AlertCircle } from "lucide-react";
import "../../styles/ReportsListing.css";

const REPORT_DATA = [
  {
    id: 1,
    slug: "consolidated-mis",
    name: "Consolidated MIS",
    category: "MIS",
  },
  {
    id: 2,
    slug: "due-demand-vs-collection-all-products",
    name: "Due Demand vs Collection Report(All products)",
    category: "Collection",
  },
  {
    id: 3,
    slug: "cashflow-report",
    name: "CashFlow Report",
    category: "Finance",
  },
  {
    id: 4,
    slug: "rps-generate-report",
    name: "RPS Generate Report",
    category: "Operations",
  },
  {
    id: 5,
    slug: "delayed-interest-report",
    name: "Delayed Interest Report",
    category: "Finance",
  },
  {
    id: 6,
    slug: "irr-report",
    name: "IRR Report",
    category: "Finance",
  },
  {
    id: 7,
    slug: "adikosh-cam-report",
    name: "Adikosh CAM Report",
    category: "Credit",
  },
  {
    id: 8,
    slug: "adikosh-cam-report-print",
    name: "Adikosh CAM Report Print",
    category: "Credit",
  },
  {
    id: 9,
    slug: "cashflow-report-bank-date",
    name: "CashFlow Report Bank Date",
    category: "Finance",
  },
  {
    id: 10,
    slug: "ccod-loan-data-report",
    name: "CCOD Loan Data Report",
    category: "Data",
  },
  {
    id: 11,
    slug: "bank-payment-file-report",
    name: "Bank Payment File Report",
    category: "Finance",
  },
  {
    id: 12,
    slug: "consumer-bureau-report",
    name: "Consumer Bureau Report",
    category: "Compliance",
  },
  {
    id: 13,
    slug: "pay-out-report",
    name: "Pay Out Report",
    category: "Finance",
  },
  {
    id: 14,
    slug: "due-demand-vs-collection-fintree",
    name: "Due Demand vs Collection Report(Fintree)",
    category: "Collection",
  },
];

const ReportsListing = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredReports = useMemo(() => {
    return REPORT_DATA.filter((report) =>
      report.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <div className="reports-container">
      <header className="reports-header">
        <div className="title-section">
          <div className="title-icon-wrapper">
            <FileChartLine className="title-icon" size={54} />
          </div>
          <div>
            <h3>MIS Report Listing</h3>
            <p className="subtitle">Select a report to configure and generate data</p>
          </div>
        </div>

        <div className="search-wrapper">
          <Search className="search-icon" size={18} />
          <input
            type="text"
            className="search-input"
            placeholder="Search by report name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </header>

      <div className="reports-grid">
        {filteredReports.length > 0 ? (
          filteredReports.map((report) => (
            <div key={report.id} className="report-card">
              <div className="report-top">
                <span className="category-tag">{report.category}</span>
                <h4>{report.name}</h4>
              </div>

              <Link
                to={`/mis-reports/${report.slug}`}
                className="generate-link"
              >
                <span>Generate Report</span>
                <ArrowRight size={18} className="arrow-icon" />
              </Link>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <div className="empty-icon-wrapper">
              <AlertCircle size={48} />
            </div>
            <p>
              No reports found matching <strong>"{searchTerm}"</strong>
            </p>
            <button onClick={() => setSearchTerm("")} className="reset-btn">
              Clear Search
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsListing;