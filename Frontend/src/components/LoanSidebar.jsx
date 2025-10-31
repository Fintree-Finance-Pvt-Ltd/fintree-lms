import React, { useState } from "react";
import { useNavigate } from "react-router-dom"; // ✅ Import this!
import "../styles/LoanDetailsPage.css"; // Ensure you have this CSS file

const LoanSidebar = ({ onSelect, isAdikosh, isGNonFSF }) => {
    const [activeSection, setActiveSection] = useState("loan-details");
    const navigate = useNavigate(); // ✅ Declare the navigate function
  
    const handleSelect = (section) => {
      setActiveSection(section);
      if (section === "documents") {
        navigate("/documents"); // ✅ Navigates to documents page
      } else {
        onSelect(section); // For internal section control
      }
    };


    const allSections = [
        { key: "loan-details", label: "Loan Details" },
        { key: "disbursement-details", label: "Disbursement Details" },
        { key: "schedule", label: "Schedule" },
        { key: "fintree-schedule", label: "Fintree Schedule", adikoshOnly: true },
        { key: "partner-schedule", label: "Partner Schedule", adikoshOnly: true },
        { key: "gq-fintree-schedule", label: "Fintree Schedule",gqnonfsfOnly: true },
        { key: "gqfsf-fintree-schedule", label: "Fintree Schedule", gqfsfOnly: true },
        { key : "fintree-roi-schedule", label: "Fintree ROI Schedule", adikoshOnly: true },
        { key: "charges-cashflow", label: "Charges & Cashflow" },
        { key: "extra-charges", label: "Extra Charges" },
        { key: "allocation", label: "Allocation" },
        { key: "forecloser-collection", label: "Foreclosure-Collection" },
        { key: "documents-page", label: "Documents" },
        { key: "action-page", label: "Action" },

    ];

    const sections = allSections.filter(
        section => !section.adikoshOnly || isAdikosh
    ).filter(
        section => !section.gqnonfsfOnly || isGNonFSF
    );

    return (
        <div className="loan-sidebar">
            <h3>Loan Sections</h3>
            <ul>
                {sections.map((section) => (
                    <li
                        key={section.key}
                        className={activeSection === section.key ? "active" : ""}
                        onClick={() => handleSelect(section.key)}
                    >
                        {section.label}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default LoanSidebar;
