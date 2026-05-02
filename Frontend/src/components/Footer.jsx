import React from "react";

const Footer = () => {
  return (
    <footer style={styles.footer}>
      <div style={styles.container}>
        {/* Links Container */}
        
        {/* Copyright Line - Now Centered via Container and Flex order */}
        <p style={styles.text}>
          © 2025 Sajag Jain System. All rights reserved.
        </p>

        {/* Empty spacer to help balance the flex layout if needed, 
            but the current CSS handles the centering across the whole bar */}
        <div style={{ width: "200px", display: "none" }}></div> 
      </div>
    </footer>
  );
};

const styles = {
  footer: {
    // Deep midnight gradient for a professional fintech look
    background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
    padding: "20px 20px",
    marginTop: "auto",
    borderTop: "1px solid rgba(255, 255, 255, 0.05)",
  },

  container: {
    display: "flex",
    flexDirection: "column", // Stack items to ensure true centering
    justifyContent: "center",
    alignItems: "center",
    maxWidth: "1200px",
    margin: "0 auto",
    gap: "16px",
  },

  text: {
    fontSize: "18px",
    color: "#94a3b8", // Muted slate for a modern look
    fontWeight: "400",
    letterSpacing: "0.025em",
    textAlign: "center",
    order: 2, // Ensures text stays below links on smaller screens if desired
  },

  links: {
    display: "flex",
    gap: "24px",
    alignItems: "center",
    justifyContent: "center",
    order: 1,
    marginBottom: "4px",
  },

  link: {
    fontSize: "14px",
    color: "#cbd5e1",
    textDecoration: "none",
    fontWeight: "500",
    transition: "color 0.2s ease",
    // Use inline hover styles in your actual project or handle via state/CSS-in-JS
  },
};

export default Footer;