import React from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/api';
import '../styles/navbar.css'; // Assuming you have some styles for buttons

const ActionButtons = ({ lan }) => {
  const navigate = useNavigate();

  const handleSOA = async () => {
  const res = await api.post(
    `/documents/generate-soa`,
    { lan: lan }
  );
  if (res.data?.fileUrl) {
    window.open(res.data.fileUrl, "_blank");
  } else {
    alert("SOA generation failed!");
  }

  };

  const handleNOC = async () => {
  const res = await api.post(
    `/documents/generate-noc`,
    { lan: lan }
  );
  if (res.data?.fileUrl) {
    window.open(`${api.defaults.baseURL}${res.data.fileUrl}`, "_blank");
  } else {
    alert("NOC generation failed!");
  }
};



  return (
    <>
      <button className='action-buttons' onClick={handleSOA}>SOA</button>
      <button className='action-buttons' onClick={handleNOC}>NOC</button>
    </>
  );
};

export default ActionButtons;
