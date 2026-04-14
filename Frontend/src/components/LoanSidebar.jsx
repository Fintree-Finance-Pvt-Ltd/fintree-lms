import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wallet, FileText, CalendarDays, Layers, BarChart3,
  Percent, Receipt, PlusCircle, Users, RefreshCw,
  Folder, Settings
} from "lucide-react";

import "../styles/LoanDetailsPage.css";


const LoanSidebar = ({ onSelect, isAdikosh, isGNonFSF, isGQFSF }) => {
  const [activeSection, setActiveSection] = useState("loan-details");
  const navigate = useNavigate();

  const handleSelect = (section) => {
    setActiveSection(section);
    if (section === "documents") {
      navigate("/documents");
    } else {
      onSelect(section);
    }
  };

  // ✅ ICON MAPPING
  const iconMap = {
    "loan-details": <Wallet size={16} />,
    "disbursement-details": <Receipt size={16} />,
    "schedule": <CalendarDays size={16} />,
    "fintree-schedule": <Layers size={16} />,
    "partner-schedule": <Users size={16} />,
    "gq-fintree-schedule": <Layers size={16} />,
    "gqfsf-fintree-schedule": <Layers size={16} />,
    "fintree-roi-schedule": <Percent size={16} />,
    "charges-cashflow": <BarChart3 size={16} />,
    "extra-charges": <PlusCircle size={16} />,
    "allocation": <Users size={16} />,
    "forecloser-collection": <RefreshCw size={16} />,
    "documents-page": <Folder size={16} />,
    "action-page": <Settings size={16} />,
  };

  const allSections = [
    { key: "loan-details", label: "Loan Details" },
    { key: "disbursement-details", label: "Disbursement Details" },
    { key: "schedule", label: "Schedule" },
    { key: "fintree-schedule", label: "Fintree Schedule", adikoshOnly: true },
    { key: "partner-schedule", label: "Partner Schedule", adikoshOnly: true },
    { key: "gq-fintree-schedule", label: "Fintree Schedule", gqnonfsfOnly: true },
    { key: "gqfsf-fintree-schedule", label: "Fintree Schedule", gqfsfOnly: true },
    { key: "fintree-roi-schedule", label: "Fintree ROI Schedule", adikoshOnly: true },
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
    ).filter(
        section => !section.gqfsfOnly || isGQFSF
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
            <span className="sidebar-icon">
              {iconMap[section.key]}
            </span>
            {section.label}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LoanSidebar;