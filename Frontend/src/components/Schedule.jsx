import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import api from "../api/api";
import "../styles/Schedule.css";

const Schedule = () => {
  const { lan } = useParams();

  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const getStatusClass = (status) => {
    switch (status) {
      case "Due":
        return "due-status";

      case "Paid":
        return "paid-status";

      case "Part Paid":
        return "part-paid-status";

      case "Late":
        return "late-status";

      case "Not Set":
        return "not-set-status";

      default:
        return "";
    }
  };

  const getDPDClass = (value) => {
    const dpd = Number(value || 0);

    if (dpd >= 90) {
      return "dpd-red";
    }

    if (dpd >= 60) {
      return "dpd-orange";
    }

    if (dpd >= 30) {
      return "dpd-yellow";
    }

    return "";
  };

  useEffect(() => {
    let cancelled = false;

    const fetchSchedule = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get(
          `/loan-booking/schedule/${encodeURIComponent(lan)}`,
        );

        const scheduleRows = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.data)
            ? response.data.data
            : [];

        if (!cancelled) {
          setSchedule(scheduleRows);
        }
      } catch (err) {
        console.error("Schedule API error:", err.response?.data || err);

        if (!cancelled) {
          setError(err.response?.data?.message || "Failed to fetch schedule.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (lan) {
      fetchSchedule();
    } else {
      setError("LAN is missing.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [lan]);

  const formatDate = (dateString) => {
    if (!dateString) {
      return "-";
    }

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return date.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  };

  const formatExcelDate = (dateString) => {
    if (!dateString) {
      return "";
    }

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
  };

  const numberValue = (value) => {
    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
  };

  const exportToExcel = () => {
    if (!schedule.length) {
      alert("No repayment schedule available to export.");
      return;
    }

    try {
      setExporting(true);

      const excelRows = schedule.map((payment, index) => ({
        "Sr. No.": index + 1,
        LAN: lan || "",
        "Due Date": formatExcelDate(payment.due_date),
        Status: payment.status || "Pending",
        EMI: numberValue(payment.emi),
        Principal: numberValue(payment.principal),
        Interest: numberValue(payment.interest),
        "Payment Date": formatExcelDate(payment.payment_date),
        DPD: numberValue(payment.dpd),
        "Remaining Amount": numberValue(payment.remaining_emi),
        "Remaining Principal": numberValue(payment.remaining_principal),
        "Remaining Interest": numberValue(payment.remaining_interest),
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelRows);

      /*
       * Set Excel column widths.
       */
      worksheet["!cols"] = [
        { wch: 10 }, // Sr. No.
        { wch: 18 }, // LAN
        { wch: 15 }, // Due Date
        { wch: 15 }, // Status
        { wch: 15 }, // EMI
        { wch: 15 }, // Principal
        { wch: 15 }, // Interest
        { wch: 15 }, // Payment Date
        { wch: 10 }, // DPD
        { wch: 20 }, // Remaining Amount
        { wch: 22 }, // Remaining Principal
        { wch: 20 }, // Remaining Interest
      ];

      /*
       * Apply number formatting to amount columns.
       */
      const range = XLSX.utils.decode_range(worksheet["!ref"]);

      for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex += 1) {
        /*
         * EMI to Remaining Interest:
         * Excel columns E, F, G, J, K and L.
         */
        ["E", "F", "G", "J", "K", "L"].forEach((column) => {
          const cell = worksheet[`${column}${rowIndex + 1}`];

          if (cell) {
            cell.z = "#,##0.00";
          }
        });
      }

      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(workbook, worksheet, "Repayment Schedule");

      const cleanLan = String(lan || "Loan").replace(/[^a-zA-Z0-9-_]/g, "_");

      XLSX.writeFile(workbook, `${cleanLan}_Repayment_Schedule.xlsx`);
    } catch (exportError) {
      console.error("Excel export error:", exportError);

      alert("Failed to export repayment schedule.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="spinner-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="schedule-error">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="schedule-page-container">
      <div className="schedule-content">
        <div className="schedule-header">
          <div>
            <h2>Repayment Schedule</h2>

            <p className="schedule-lan">
              LAN: <strong>{lan}</strong>
            </p>
          </div>

          <button
            type="button"
            className="export-excel-button"
            onClick={exportToExcel}
            disabled={exporting || schedule.length === 0}
          >
            {exporting ? "Exporting..." : "Export to Excel"}
          </button>
        </div>

        {schedule.length === 0 ? (
          <p>No schedule available.</p>
        ) : (
          <div className="schedule-table-container">
            <table>
              <thead>
                <tr>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>EMI</th>
                  <th>Principal</th>
                  <th>Interest</th>
                  <th>Payment Date</th>
                  <th>DPD</th>
                  <th>Remaining Amount</th>
                  <th>Remaining Principal</th>
                  <th>Remaining Interest</th>
                </tr>
              </thead>

              <tbody>
                {schedule.map((payment, index) => (
                  <tr key={payment.id || `${payment.due_date}-${index}`}>
                    <td>{formatDate(payment.due_date)}</td>

                    <td>
                      <span
                        className={`status-label ${getStatusClass(
                          payment.status,
                        )}`}
                      >
                        {payment.status || "Pending"}
                      </span>
                    </td>

                    <td>{payment.emi ?? 0}</td>

                    <td>{payment.principal ?? 0}</td>

                    <td>{payment.interest ?? 0}</td>

                    <td>{formatDate(payment.payment_date)}</td>

                    <td className={`dpd-label ${getDPDClass(payment.dpd)}`}>
                      {payment.dpd ?? 0}
                    </td>

                    <td>{payment.remaining_emi ?? 0}</td>

                    <td>{payment.remaining_principal ?? 0}</td>

                    <td>{payment.remaining_interest ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Schedule;
