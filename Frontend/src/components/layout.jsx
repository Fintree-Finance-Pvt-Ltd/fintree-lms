// src/components/Layout.jsx
import React from "react";
import Navbar from "./Navbar";
import Sidebar from "./sidebar";
import SupplyChainSidebar from "./SupplyChainSidebar";
import { Outlet } from "react-router-dom";


const Layout = () => {
  return (
    <div className="dashboard-container">
      <Navbar />
      <div className="dashboard-layout">
        <Sidebar />
        {/* Supply Chain Sidebar */}
        <SupplyChainSidebar />
        <div className="dashboard-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
