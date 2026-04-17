import React from "react";

const Dashboard = () => {
  return (
    <div style={styles.pageWrapper}>


      {/* Main Content */}
      <div style={styles.container}>
        
        {/* Welcome Card */}
        <div style={styles.welcomeCard}>
          <h2 style={styles.welcomeTitle}>👋 Welcome Back</h2>
          <p style={styles.welcomeText}>
            You are successfully logged in. Start managing your loans and track
            everything in one place.
          </p>
        </div>

        {/* Action Cards */}
        <div style={styles.grid}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>📄 Book New Case</h3>
            <p style={styles.cardText}>
              Create and submit a new loan application.
            </p>
          </div>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>📊 View Loans</h3>
            <p style={styles.cardText}>
              Check all your existing loan applications.
            </p>
          </div>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>💳 Repayments</h3>
            <p style={styles.cardText}>
              Track EMI payments and repayment history.
            </p>
          </div>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>📈 Reports</h3>
            <p style={styles.cardText}>
              Generate and download financial reports.
            </p>
          </div>
        </div>

        {/* Info Section */}
        <div style={styles.infoBox}>
          <h3 style={styles.infoTitle}>🚀 Quick Tips</h3>
          <ul style={styles.list}>
            <li>Keep your documents ready before applying</li>
            <li>Regularly track repayment schedules</li>
            <li>Download reports for better insights</li>
          </ul>
        </div>

      </div>

      {/* Footer */}
      <footer style={styles.footer}>
  <p style={{ ...styles.footerText, fontWeight: "bold" }}>
    © 2026 Loan Management System |@ SAJAG JAIN
  </p>
</footer>
    </div>
  );
};

const styles = {
  pageWrapper: {
    minHeight: "100vh",
    background: "#f1f5f9",
    fontFamily: "Inter, sans-serif",
    display: "flex",
    flexDirection: "column",
  },

  /* HEADER */
  header: {
    background: "linear-gradient(135deg, #4f46e5, #6366f1)",
    color: "#fff",
    padding: "40px 20px",
    textAlign: "center",
  },
  headerTitle: {
    margin: 0,
    fontSize: "28px",
    fontWeight: "600",
  },
  headerSubtitle: {
    marginTop: "10px",
    fontSize: "14px",
    opacity: 0.9,
  },

  /* CONTAINER */
  container: {
    flex: 1,
    maxWidth: "1100px",
    margin: "30px auto",
    padding: "0 20px",
  },

  /* WELCOME CARD */
  welcomeCard: {
    background: "#fff",
    padding: "25px",
    borderRadius: "16px",
    boxShadow: "0 8px 20px rgba(0,0,0,0.05)",
    marginBottom: "25px",
  },
  welcomeTitle: {
    margin: 0,
    fontSize: "20px",
  },
  welcomeText: {
    marginTop: "10px",
    color: "#64748b",
  },

  /* GRID */
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "20px",
    marginBottom: "25px",
  },

  card: {
    background: "#fff",
    padding: "20px",
    borderRadius: "14px",
    boxShadow: "0 6px 15px rgba(0,0,0,0.05)",
    cursor: "pointer",
    transition: "all 0.3s ease",
  },
  cardTitle: {
    margin: "0 0 10px 0",
    fontSize: "16px",
    fontWeight: "600",
  },
  cardText: {
    fontSize: "13px",
    color: "#64748b",
  },

  /* INFO BOX */
  infoBox: {
    background: "#ffffff",
    padding: "20px",
    borderRadius: "14px",
    boxShadow: "0 6px 15px rgba(0,0,0,0.05)",
  },
  infoTitle: {
    marginBottom: "10px",
  },
  list: {
    paddingLeft: "18px",
    color: "#475569",
    lineHeight: "1.8",
  },

  /* FOOTER */
  footer: {
    textAlign: "center",
    padding: "15px",
    background: "#fff",
    borderTop: "1px solid #e2e8f0",
  },
  footerText: {
    fontSize: "13px",
    color: "#94a3b8",
  },
};

export default Dashboard;