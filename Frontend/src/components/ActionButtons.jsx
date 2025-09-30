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
      // <- this is where your 400 lands
      const msg =
        err?.response?.data?.error || // e.g. "NOC can be generated only when the loan is Fully Paid."
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
      // <- this is where your 400 lands
      const msg =
        err?.response?.data?.error || // e.g. "NOC can be generated only when the loan is Fully Paid."
        err?.response?.data?.message ||
        err?.message ||
        "Foreclosure generation failed.";
      alert(msg);
    }
  };

  return (
    <>
      <button className="action-buttons" onClick={handleSOA}>SOA</button>
      <button className="action-buttons" onClick={handleNOC}>NOC</button>
      <button className="action-buttons" onClick={handleForeclose}>Foreclosure</button>
    </>
  );
};

export default ActionButtons;
