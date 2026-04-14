// import React from 'react';
// import { useNavigate } from 'react-router-dom';
// import api from '../api/api';
// import '../styles/navbar.css'; // Assuming you have some styles for buttons

// const ActionButtons = ({ lan }) => {
//   const navigate = useNavigate();

//   const handleSOA = async () => {
//   const res = await api.post(
//     `/documents/generate-soa`,
//     { lan: lan }
//   );
//   if (res.data?.fileUrl) {
//     window.open(res.data.fileUrl, "_blank");
//   } else {
//     alert("SOA generation failed!");
//   }

//   };

//   const handleNOC = async () => {
//   const res = await api.post(
//     `/documents/generate-noc`,
//     { lan: lan }
//   );
//   if (res.data?.fileUrl) {
//     window.open(res.data.fileUrl, "_blank");
//   } else {
//     alert("NOC generation failed!");
//   }
// };



//   return (
//     <>
//       <button className='action-buttons' onClick={handleSOA}>SOA</button>
//       <button className='action-buttons' onClick={handleNOC}>NOC</button>
//     </>
//   );
// };

// export default ActionButtons;


import React from "react";
import api from "../api/api";
import "../styles/navbar.css";

const ActionButtons = ({ lan }) => {

  const handleSOA = async () => {
    try {
      const res = await api.post("/documents/generate-soa", { lan });
      if (res.data?.fileUrl) {
        window.open(res.data.fileUrl, "_blank");
      } else {
        alert("SOA generation failed.");
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "SOA generation failed.";
      alert(msg);
    }
  };

  const handleNOC = async () => {
    try {
      const res = await api.post("/documents/generate-noc", { lan });
      if (res.data?.fileUrl) {
        window.open(res.data.fileUrl, "_blank");
      } else {
        alert("NOC generation failed.");
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "NOC generation failed.";
      alert(msg);
    }
  };

  const handleForeclose = async () => {
    try {
      const res = await api.post("/documents/generate-foreclosure", { lan });
      if (res.data?.fileUrl) {
        window.open(res.data.fileUrl, "_blank");
      } else {
        alert("Foreclosure generation failed.");
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Foreclosure generation failed.";
      alert(msg);
    }
  };

  return (
    <>
      {/* 🔥 INLINE MODERN UI STYLE */}
      <style>{`
        .action-buttons {
          padding: 12px 20px;
          border-radius: 12px;
          border: none;
          cursor: pointer;

          font-size: 14px;
          font-weight: 600;

          margin-right: 12px;

          transition: all 0.25s ease;

          color: white;
          background: linear-gradient(135deg, #4f46e5, #6366f1);

          box-shadow: 0 8px 20px rgba(79,70,229,0.3);
        }

        /* Hover */
        .action-buttons:hover {
          transform: translateY(-3px) scale(1.03);
          box-shadow: 0 12px 30px rgba(79,70,229,0.4);
        }

        /* Click */
        .action-buttons:active {
          transform: scale(0.96);
        }

        /* Different colors per button (auto using nth-child) */
        button.action-buttons:nth-child(2) {
          background: linear-gradient(135deg, #16a34a, #22c55e);
          box-shadow: 0 8px 20px rgba(34,197,94,0.3);
        }

        button.action-buttons:nth-child(3) {
          background: linear-gradient(135deg, #dc2626, #ef4444);
          box-shadow: 0 8px 20px rgba(239,68,68,0.3);
        }

        /* Container spacing (auto applies) */
        .action-buttons + .action-buttons {
          margin-left: 10px;
        }

        /* Mobile */
        @media (max-width: 768px) {
          .action-buttons {
            width: 100%;
            margin-bottom: 10px;
          }
        }
      `}</style>

      {/* Buttons */}
      <button className="action-buttons" onClick={handleSOA}>SOA</button>
      <button className="action-buttons" onClick={handleNOC}>NOC</button>
      <button className="action-buttons" onClick={handleForeclose}>Foreclosure</button>
    </>
  );
};

export default ActionButtons;
