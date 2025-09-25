import React from "react";

const Dashboard = () => {
  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Welcome to Loan Management System</h1>
      <p style={styles.text}>
        You have successfully logged in. This is your LMS System where you can book and manage loans, view applications, and track repayments.
      </p>

      <div style={styles.section}>
        <h2 style={styles.subHeading}>Next Steps</h2>
        <ul>
          <li>➤ Book new Cases</li>
          <li>➤ View the existing loans</li>
          <li>➤ Check repayments history</li>
          <li>➤ Get Reports</li>
        </ul>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: "100vh",
    padding: "40px",
    backgroundColor: "#f4f6f8",
    fontFamily: "Arial, sans-serif",
  },
  heading: {
    fontSize: "28px",
    fontWeight: "bold",
    color: "#333",
    marginBottom: "10px",
  },
  text: {
    fontSize: "16px",
    color: "#555",
    marginBottom: "20px",
  },
  section: {
    backgroundColor: "#fff",
    padding: "20px",
    borderRadius: "8px",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
  },
  subHeading: {
    fontSize: "20px",
    marginBottom: "10px",
    color: "#222",
  },
};

export default Dashboard;
