import React from "react";

/**
 * Reusable full-screen loader overlay.
 * Usage: <LoaderOverlay show={loading} label="Fetching data…" />
 */
const LoaderOverlay = ({ show, label = "Loading…" }) => {
  // inject keyframes once
  React.useEffect(() => {
    const STYLE_ID = "global-loader-overlay-styles";
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // lock scroll while visible
  React.useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(1px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 12,
          padding: "24px 28px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          minWidth: 260,
          justifyContent: "center"
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "3px solid #e6e6e6",
            borderTopColor: "#e53935",
            animation: "spin 0.9s linear infinite",
          }}
        />
        <div style={{ fontWeight: 600, color: "#333", letterSpacing: 0.2 }}>
          {label}
        </div>
      </div>
    </div>
  );
};

export default LoaderOverlay;
