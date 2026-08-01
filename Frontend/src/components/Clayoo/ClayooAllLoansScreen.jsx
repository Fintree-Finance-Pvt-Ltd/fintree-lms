import React, { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import DataTable from "../ui/DataTable";
import LoaderOverlay from "../ui/LoaderOverlay"; // Import the loader

const ALLClayyoCaseScreen = ({
  apiUrl = `/clayyo-loans/all-loans?table=loan_booking_clayyo&prefix=CLY`,
  title = "CLAYYO All Loans Screen",
  lenderName = "CLAYYO",
}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLan, setActionLan] = useState(null);
  const [err, setErr] = useState("");

  const [showMisModal, setShowMisModal] = useState(false);

const [misDates, setMisDates] = useState({
  startDate: "",
  endDate: new Date().toISOString().split("T")[0],
});

const [misLoading, setMisLoading] = useState(false);
const [misError, setMisError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    let off = false;
    setLoading(true);

    api
      .get(apiUrl)
      .then((res) => {
        if (!off) {
          setRows(res.data?.rows || []);
          setErr("");
        }
      })
      .catch(() => {
        if (!off) setErr("Failed to fetch data.");
      })
      .finally(() => {
        if (!off) setLoading(false);
      });

    return () => {
      off = true;
    };
  }, [apiUrl]);

  // Handle Error state
  if (err)
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p style={{ color: "#b91c1c", fontWeight: 600 }}>{err}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 16px",
            cursor: "pointer",
            borderRadius: "8px",
            border: "1px solid #ccc",
          }}
        >
          Retry
        </button>
      </div>
    );

  const handleAadharRetry = async (r) => {
    const retryCount = Number(r.aadhaar_retry_count || 0);
    const aadhaarStatus = String(r.aadhaar_status || "")
      .trim()
      .toUpperCase();

    // ✅ Already verified validation
    if (aadhaarStatus === "VERIFIED") {
      alert("Aadhaar is already verified. Retry is not allowed.");
      return;
    }

    // ✅ Maximum 2 retry validation
    if (retryCount >= 2) {
      alert("Maximum Aadhaar retry limit reached");
      return;
    }

    if (
      !window.confirm(`Retrigger Aadhaar verification link for LAN ${r.lan}?`)
    ) {
      return;
    }

    try {
      setActionLan(r.lan);

      const res = await api.post("/retryAadharVerification", {
        lan: r.lan,
        mobile_number: r.mobile_number,
        email_id: r.email_id,
        customer_name: r.customer_name,
      });

      if (res.data?.ok) {
        alert(
          res.data.message ||
            "Aadhaar verification link retriggered successfully",
        );

        setRows((prev) =>
          prev.map((row) =>
            row.lan === r.lan
              ? {
                  ...row,
                  aadhaar_retry_count:
                    res.data?.aadhaar_retry_count ?? retryCount + 1,
                  aadhaar_status: res.data?.aadhaar_status ?? "INITIATED",
                }
              : row,
          ),
        );
      } else {
        alert(res.data?.error || "Aadhaar retry failed");
      }
    } catch (error) {
      console.error("Aadhaar retry error:", error);

      alert(
        error.response?.data?.error ||
          "Something went wrong while retrying Aadhaar verification",
      );
    } finally {
      setActionLan(null);
    }
  };

  const handleClayyoConsolidatedMisDownload = async () => {
  const { startDate, endDate } = misDates;

  setMisError("");

  if (!startDate || !endDate) {
    setMisError("Please select start date and end date.");
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    setMisError("Start date cannot be greater than end date.");
    return;
  }

  try {
    setMisLoading(true);

    const response = await api.get(
      "/reports/clayoo/consolidated-mis",
      {
        params: {
          startDate,
          endDate,
        },
        responseType: "blob",
      },
    );

    const contentType =
      response.headers["content-type"] || "";

    /*
     * The backend may return a JSON error as a Blob.
     */
    if (contentType.includes("application/json")) {
      const responseText = await response.data.text();
      const errorResponse = JSON.parse(responseText);

      throw new Error(
        errorResponse.message ||
          "Failed to generate Consolidated MIS.",
      );
    }

    const fileBlob = new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const downloadUrl =
      window.URL.createObjectURL(fileBlob);

    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download =
      `Clayyo_Consolidated_MIS_${startDate}_to_${endDate}.xlsx`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(downloadUrl);

    setShowMisModal(false);
  } catch (error) {
    console.error(
      "Clayyo Consolidated MIS download error:",
      error,
    );

    let message =
      "Failed to generate Clayyo Consolidated MIS.";

    if (error.response?.data instanceof Blob) {
      try {
        const responseText =
          await error.response.data.text();

        const parsedError =
          JSON.parse(responseText);

        message =
          parsedError.message || message;
      } catch {
        message =
          error.message || message;
      }
    } else {
      message =
        error.response?.data?.message ||
        error.message ||
        message;
    }

    setMisError(message);
  } finally {
    setMisLoading(false);
  }
};

  const pillStyle = (value, type = "status") => {
    const key = String(value || "")
      .trim()
      .toLowerCase();

    const statusMap = {
      login: {
        bg: "rgba(107,114,128,.12)",
        bd: "rgba(107,114,128,.35)",
        fg: "#374151",
      },
      "bre approved": {
        bg: "rgba(59,130,246,.12)",
        bd: "rgba(59,130,246,.35)",
        fg: "#1d4ed8",
      },
      "bre failed": {
        bg: "rgba(239,68,68,.12)",
        bd: "rgba(239,68,68,.35)",
        fg: "#7f1d1d",
      },
      "credit approved": {
        bg: "rgba(16,185,129,.12)",
        bd: "rgba(16,185,129,.35)",
        fg: "#065f46",
      },
      rejected: {
        bg: "rgba(239,68,68,.12)",
        bd: "rgba(239,68,68,.35)",
        fg: "#7f1d1d",
      },
      "limit requested": {
        bg: "rgba(234,179,8,.12)",
        bd: "rgba(234,179,8,.35)",
        fg: "#713f12",
      },
      "ops approved": {
        bg: "rgba(139,92,246,.12)",
        bd: "rgba(139,92,246,.35)",
        fg: "#5b21b6",
      },
      disbursed: {
        bg: "rgba(16,185,129,.12)",
        bd: "rgba(16,185,129,.35)",
        fg: "#065f46",
      },
      "credit recheck": {
        bg: "rgba(249,115,22,.12)",
        bd: "rgba(249,115,22,.35)",
        fg: "#9a3412",
      },
    };

    const stageMap = {
      login: {
        bg: "rgba(107,114,128,.12)",
        bd: "rgba(107,114,128,.35)",
        fg: "#374151",
      },
      credit_initiated: {
        bg: "rgba(59,130,246,.12)",
        bd: "rgba(59,130,246,.35)",
        fg: "#1d4ed8",
      },
      bre_rejected: {
        bg: "rgba(239,68,68,.12)",
        bd: "rgba(239,68,68,.35)",
        fg: "#7f1d1d",
      },
      limit_approval_pending: {
        bg: "rgba(234,179,8,.12)",
        bd: "rgba(234,179,8,.35)",
        fg: "#713f12",
      },
      credit_rework: {
        bg: "rgba(249,115,22,.12)",
        bd: "rgba(249,115,22,.35)",
        fg: "#9a3412",
      },
      credit_rejected: {
        bg: "rgba(239,68,68,.12)",
        bd: "rgba(239,68,68,.35)",
        fg: "#7f1d1d",
      },
      ops_initiated: {
        bg: "rgba(14,165,233,.12)",
        bd: "rgba(14,165,233,.35)",
        fg: "#0c4a6e",
      },
      ops_approved: {
        bg: "rgba(139,92,246,.12)",
        bd: "rgba(139,92,246,.35)",
        fg: "#5b21b6",
      },
      agreement_pending: {
        bg: "rgba(168,85,247,.12)",
        bd: "rgba(168,85,247,.35)",
        fg: "#6b21a8",
      },
      mandate_pending: {
        bg: "rgba(236,72,153,.12)",
        bd: "rgba(236,72,153,.35)",
        fg: "#9d174d",
      },
      ready_for_disbursal: {
        bg: "rgba(34,197,94,.12)",
        bd: "rgba(34,197,94,.35)",
        fg: "#166534",
      },
      disbursed: {
        bg: "rgba(16,185,129,.12)",
        bd: "rgba(16,185,129,.35)",
        fg: "#065f46",
      },
    };

    const map = type === "stage" ? stageMap : statusMap;
    const c = map[key] || {
      bg: "rgba(107,114,128,.12)",
      bd: "rgba(107,114,128,.35)",
      fg: "#374151",
    };

    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.bd}`,
      whiteSpace: "nowrap",
    };
  };

  const columns = [
    {
      key: "customer_name",
      header: "Loan Details",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/approved-loan-details-clayoo/${r.lan}`)}
          title="View loan details"
        >
          {r.customer_name ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.customer_name || "").toLowerCase(),
      width: 220,
    },
    {
      key: "hospital_name",
      header: "Hospital Name",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() =>
            navigate(`/approved-loan-details-clayoo-hospital/${r.lan}`)
          }
          title="View hospital details"
        >
          {r.hospital_name || "—"}
        </span>
      ),
      sortAccessor: (r) => (r.hospital_name || "").toLowerCase(),
      width: 220,
    },
    {
      key: "lan",
      header: "LAN",
      sortable: true,
      render: (r) => (
        <span
          style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
          onClick={() => navigate(`/approved-loan-details/${r.lan}`)}
          title="View LAN details"
        >
          {r.lan ?? "—"}
        </span>
      ),
      sortAccessor: (r) => (r.lan || "").toLowerCase(),
      width: 140,
    },
    // {
    //   key: "app_id",
    //   header: "APPLICATION ID",
    //   sortable: true,
    //   render: (r) => r.app_id ?? "—",
    //   sortAccessor: (r) => String(r?.app_id || "").toLowerCase(),
    //   csvAccessor: (r) => r.app_id ?? "",
    //   width: 160,
    // },
    {
      key: "mobile_number",
      header: "Mobile Number",
      sortable: true,
      render: (r) =>
        r.mobile_number ? (
          <a
            href={`tel:${r.mobile_number}`}
            style={{
              color: "#2563eb",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {r.mobile_number}
          </a>
        ) : (
          "—"
        ),
      sortAccessor: (r) => String(r?.mobile_number || ""),
      width: 160,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (r) => (
        <span style={pillStyle(r.status, "status")}>
          {r.status || "Pending"}
        </span>
      ),
      sortAccessor: (r) => (r.status || "").toLowerCase(),
      csvAccessor: (r) => r.status || "Pending",
      width: 180,
    },
    {
      key: "stage",
      header: "Stage",
      sortable: true,
      render: (r) => (
        <span style={pillStyle(r.stage, "stage")}>{r.stage || "—"}</span>
      ),
      sortAccessor: (r) => (r.stage || "").toLowerCase(),
      csvAccessor: (r) => r.stage || "",
      width: 190,
    },
    {
      key: "limit_rework_required",
      header: "Deviation",
      sortable: true,
      render: (r) =>
        Number(r.limit_rework_required) === 1 ? (
          <span
            title={r.limit_rework_reason || "Limit deviation found"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              background: "rgba(249,115,22,.12)",
              color: "#9a3412",
              border: "1px solid rgba(249,115,22,.35)",
              whiteSpace: "nowrap",
            }}
          >
            Limit Deviation
          </span>
        ) : (
          "—"
        ),
      sortAccessor: (r) => Number(r.limit_rework_required || 0),
      csvAccessor: (r) =>
        Number(r.limit_rework_required) === 1
          ? r.limit_rework_reason || "Limit Deviation"
          : "",
      width: 180,
    },
    {
      key: "aadhar_retry",
      header: "Aadhaar Verification Retry",
      render: (r) => {
        const retryCount = Number(r.aadhaar_retry_count || 0);
        const aadhaarStatus = String(r.aadhaar_status || "")
          .trim()
          .toUpperCase();

        const isVerified = aadhaarStatus === "VERIFIED";
        const isLimitReached = retryCount >= 2;
        const isLoading = actionLan === r.lan;

        const isDisabled = isVerified || isLimitReached || isLoading;

        return (
          <button
            type="button"
            onClick={() => handleAadharRetry(r)}
            disabled={isDisabled}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              background: isVerified
                ? "#16a34a"
                : isLimitReached
                  ? "#9ca3af"
                  : isLoading
                    ? "#60a5fa"
                    : "#2563eb",
              color: "#fff",
              border: "none",
              fontWeight: 600,
              cursor: isDisabled ? "not-allowed" : "pointer",
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            {isVerified
              ? "Verified"
              : isLimitReached
                ? "Limit Reached"
                : isLoading
                  ? "Retrying..."
                  : `Retry (${2 - retryCount} left)`}
          </button>
        );
      },
      csvAccessor: () => "",
      width: 180,
    },
    {
      key: "docs",
      header: "Documents",
      render: (r) => (
        <button
          onClick={() => navigate(`/documents/${r.lan}`)}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #93c5fd",
            color: "#1d4ed8",
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
          title="Open documents"
        >
          📂 Docs
        </button>
      ),
      csvAccessor: () => "",
      width: 120,
    },
  ];

  return (
    <>
      {/* Hamster Loader Overlay */}
      <LoaderOverlay show={loading} label="Fetching case data..." />

 {/* Top action section */}
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        marginBottom: 16,
      }}
    >
      <button
        type="button"
        onClick={() => {
          setMisError("");
          setShowMisModal(true);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderRadius: 8,
          border: "none",
          background: "#2563eb",
          color: "#ffffff",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow:
            "0 2px 6px rgba(37, 99, 235, 0.25)",
        }}
      >
        📊 Consolidated MIS
      </button>
    </div>
      <DataTable
        title={title}
        rows={rows}
        columns={columns}
        globalSearchKeys={[
          "customer_name",
          "hospital_name",
          "lan",
          "app_id",
          "mobile_number",
          "status",
          "stage",
          "limit_rework_reason",
        ]}
        initialSort={{ key: "lan", dir: "desc" }}
        exportFileName="clayyo_all_loans"
      />

      {showMisModal && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      background: "rgba(0, 0, 0, 0.5)",
    }}
  >
    <div
      style={{
        width: "100%",
        maxWidth: 440,
        padding: 24,
        borderRadius: 14,
        background: "#ffffff",
        boxShadow:
          "0 20px 40px rgba(0, 0, 0, 0.2)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 22,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              color: "#111827",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            Clayyo Consolidated MIS
          </h2>

          <p
            style={{
              margin: "6px 0 0",
              color: "#6b7280",
              fontSize: 13,
            }}
          >
            Select the required report period.
          </p>
        </div>

        <button
          type="button"
          disabled={misLoading}
          onClick={() => setShowMisModal(false)}
          style={{
            padding: 0,
            border: "none",
            background: "transparent",
            color: "#6b7280",
            fontSize: 26,
            lineHeight: 1,
            cursor: misLoading
              ? "not-allowed"
              : "pointer",
          }}
        >
          ×
        </button>
      </div>

      {/* Lender */}
      <div style={{ marginBottom: 16 }}>
        <label
          style={{
            display: "block",
            marginBottom: 6,
            color: "#374151",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Lender
        </label>

        <input
          type="text"
          value="CLAYOO"
          readOnly
          style={{
            boxSizing: "border-box",
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#f3f4f6",
            color: "#4b5563",
            fontSize: 14,
            cursor: "not-allowed",
          }}
        />
      </div>

      {/* Start Date */}
      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor="clayyo-mis-start-date"
          style={{
            display: "block",
            marginBottom: 6,
            color: "#374151",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Start Date
        </label>

        <input
          id="clayyo-mis-start-date"
          type="date"
          value={misDates.startDate}
          max={
            misDates.endDate ||
            new Date().toISOString().split("T")[0]
          }
          onChange={(event) =>
            setMisDates((previous) => ({
              ...previous,
              startDate: event.target.value,
            }))
          }
          style={{
            boxSizing: "border-box",
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            color: "#111827",
            fontSize: 14,
          }}
        />
      </div>

      {/* End Date */}
      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor="clayyo-mis-end-date"
          style={{
            display: "block",
            marginBottom: 6,
            color: "#374151",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          End Date
        </label>

        <input
          id="clayyo-mis-end-date"
          type="date"
          value={misDates.endDate}
          min={misDates.startDate || undefined}
          max={new Date().toISOString().split("T")[0]}
          onChange={(event) =>
            setMisDates((previous) => ({
              ...previous,
              endDate: event.target.value,
            }))
          }
          style={{
            boxSizing: "border-box",
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            color: "#111827",
            fontSize: 14,
          }}
        />
      </div>

      {misError && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {misError}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
          marginTop: 24,
        }}
      >
        <button
          type="button"
          disabled={misLoading}
          onClick={() => setShowMisModal(false)}
          style={{
            padding: "9px 16px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            color: "#374151",
            fontWeight: 600,
            cursor: misLoading
              ? "not-allowed"
              : "pointer",
          }}
        >
          Cancel
        </button>

        <button
          type="button"
          disabled={misLoading}
          onClick={
            handleClayyoConsolidatedMisDownload
          }
          style={{
            padding: "9px 16px",
            borderRadius: 8,
            border: "none",
            background: misLoading
              ? "#93c5fd"
              : "#2563eb",
            color: "#ffffff",
            fontWeight: 700,
            cursor: misLoading
              ? "not-allowed"
              : "pointer",
          }}
        >
          {misLoading
            ? "Generating..."
            : "Download MIS"}
        </button>
      </div>
    </div>
  </div>
)}
    </>
  );
};

export default ALLClayyoCaseScreen;
