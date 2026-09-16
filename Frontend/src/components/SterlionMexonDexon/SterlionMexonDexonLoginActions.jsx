import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import api from "../../api/api";
import DataTable from "../ui/DataTable";

const LOGIN_CASES_ENDPOINT =
  "/sterlion-mexon-dexon/credit-approval-cases";

const getStatusUpdateEndpoint = (lan) =>
  `/sterlion-mexon-dexon/credit-approval/${encodeURIComponent(
    lan,
  )}/status`;

/*
 * This temporary row ensures the DataTable headers remain visible
 * while the backend route has no data or is not available yet.
 *
 * Its status is intentionally blank.
 * It must never be treated as a real LOGIN case.
 */
const EMPTY_PREVIEW_ROW = {
  id: "__preview__",
  __isPreviewRow: true,
  lan: "",
  business_name: "",
  product: "",
  industry: "",
  business_address: "",
  permanent_address: "",
  customer_name: "",
  first_name: "",
  last_name: "",
  mobile_number: "",
  status: "",
  created_at: "",
};

const isPreviewRow = (row) =>
  row?.__isPreviewRow === true;

const normalizeStatus = (status) =>
  String(status ?? "")
    .trim()
    .toUpperCase();

const displayValue = (value) => {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return "—";
  }

  return value;
};

const getCustomerName = (row) => {
  if (isPreviewRow(row)) return "—";

  if (row?.customer_name) {
    return String(row.customer_name).trim();
  }

  const customerName = [
    row?.first_name,
    row?.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return customerName || "—";
};

const getLocation = (row) => {
  if (isPreviewRow(row)) return "—";

  return (
    row?.business_address ||
    row?.permanent_address ||
    "—"
  );
};

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const getStatusPillStyle = (status) => {
  const normalizedStatus =
    normalizeStatus(status);

  const statusStyles = {
    LOGIN: {
      background: "rgba(234, 179, 8, 0.15)",
      border: "rgba(234, 179, 8, 0.40)",
      color: "#713f12",
    },

    APPROVED: {
      background: "rgba(16, 185, 129, 0.15)",
      border: "rgba(16, 185, 129, 0.40)",
      color: "#065f46",
    },

    REJECTED: {
      background: "rgba(239, 68, 68, 0.15)",
      border: "rgba(239, 68, 68, 0.40)",
      color: "#991b1b",
    },
  };

  const selectedStyle =
    statusStyles[normalizedStatus] || {
      background: "rgba(107, 114, 128, 0.12)",
      border: "rgba(107, 114, 128, 0.35)",
      color: "#374151",
    };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 11px",
    borderRadius: "999px",
    border: `1px solid ${selectedStyle.border}`,
    background: selectedStyle.background,
    color: selectedStyle.color,
    fontSize: "11px",
    fontWeight: 800,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
};

const getActionButtonStyle = (
  type,
  disabled,
) => {
  const isApprove = type === "approve";

  return {
    minWidth: "90px",
    padding: "8px 11px",
    borderRadius: "8px",
    border: `1px solid ${
      isApprove ? "#059669" : "#dc2626"
    }`,
    background: isApprove
      ? "#10b981"
      : "#ef4444",
    color: "#ffffff",
    cursor: disabled
      ? "not-allowed"
      : "pointer",
    fontSize: "12px",
    fontWeight: 700,
    opacity: disabled ? 0.5 : 1,
    whiteSpace: "nowrap",
  };
};

const SterlionMexonDexonLoginActions = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] =
    useState(true);
  const [errorMessage, setErrorMessage] =
    useState("");
  const [updatingLan, setUpdatingLan] =
    useState("");

  /*
  ==========================
  FETCH LOGIN CASES
  ==========================
  */
  const fetchLoginCases = useCallback(
    async (signal) => {
      try {
        setLoading(true);
        setErrorMessage("");

        const response = await api.get(
          LOGIN_CASES_ENDPOINT,
          {
            signal,
          },
        );

        let fetchedRows = [];

        if (Array.isArray(response?.data)) {
          fetchedRows = response.data;
        } else if (
          Array.isArray(response?.data?.rows)
        ) {
          fetchedRows = response.data.rows;
        } else if (
          Array.isArray(response?.data?.data)
        ) {
          fetchedRows = response.data.data;
        } else if (
          Array.isArray(
            response?.data?.data?.rows,
          )
        ) {
          fetchedRows =
            response.data.data.rows;
        }

        /*
         * Do not create or replace status here.
         * The status must come directly from the backend.
         */
        setRows(fetchedRows);
      } catch (error) {
        if (
          error?.code === "ERR_CANCELED" ||
          error?.name === "CanceledError" ||
          error?.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "Failed to fetch Sterlion Mexon Dexon login cases:",
          error,
        );

        setRows([]);

        setErrorMessage(
          error?.response?.data?.message ||
            "Backend route is not available yet. The configured columns are shown below.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller =
      new AbortController();

    fetchLoginCases(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchLoginCases]);

  /*
  ==========================
  STATUS UPDATE
  ==========================
  */
  const handleStatusChange = useCallback(
    async (row, requestedStatus) => {
      if (
        !row?.lan ||
        isPreviewRow(row) ||
        updatingLan
      ) {
        return;
      }

      /*
       * The action is allowed only when the actual
       * backend status is LOGIN.
       */
      const currentStatus =
        normalizeStatus(row?.status);

      if (currentStatus !== "LOGIN") {
        window.alert(
          "Only loans with LOGIN status can be approved or rejected.",
        );
        return;
      }

      const normalizedRequestedStatus =
        normalizeStatus(requestedStatus);

      if (
        ![
          "APPROVED",
          "REJECTED",
        ].includes(
          normalizedRequestedStatus,
        )
      ) {
        window.alert(
          "Invalid status selected.",
        );
        return;
      }

      const actionText =
        normalizedRequestedStatus ===
        "APPROVED"
          ? "approve"
          : "reject";

      const confirmed = window.confirm(
        `Are you sure you want to ${actionText} loan ${row.lan}?`,
      );

      if (!confirmed) return;

      try {
        setUpdatingLan(row.lan);

        await api.patch(
          getStatusUpdateEndpoint(row.lan),
          {
            status:
              normalizedRequestedStatus,
          },
        );

        /*
         * Update the UI only after backend success.
         */
        setRows((previousRows) =>
          previousRows.map((item) =>
            item.lan === row.lan
              ? {
                  ...item,
                  status:
                    normalizedRequestedStatus,
                }
              : item,
          ),
        );

        window.alert(
          normalizedRequestedStatus ===
            "APPROVED"
            ? "Loan approved successfully."
            : "Loan rejected successfully.",
        );
      } catch (error) {
        console.error(
          "Failed to update loan status:",
          error,
        );

        window.alert(
          error?.response?.data?.message ||
            "Failed to update loan status.",
        );
      } finally {
        setUpdatingLan("");
      }
    },
    [updatingLan],
  );

  /*
  ==========================
  PREVIEW ROW
  ==========================
  */
  const tableRows = useMemo(() => {
    /*
     * The preview row is only for displaying the
     * table structure before backend data arrives.
     */
    if (rows.length === 0) {
      return [EMPTY_PREVIEW_ROW];
    }

    return rows;
  }, [rows]);

  /*
  ==========================
  TABLE COLUMNS
  ==========================
  */
  const columns = useMemo(
    () => [
      {
        key: "business_name",
        header: "BUSINESS NAME",
        sortable: true,
        width: 220,

        render: (row) => {
          const canOpenDocuments =
            !isPreviewRow(row) &&
            Boolean(row?.lan);

          return (
            <span
              title={
                canOpenDocuments
                  ? "Open documents"
                  : ""
              }
              style={{
                color: canOpenDocuments
                  ? "#2563eb"
                  : "#64748b",
                fontWeight: 600,
                cursor: canOpenDocuments
                  ? "pointer"
                  : "default",
              }}
              onClick={() => {
                if (!canOpenDocuments) {
                  return;
                }

                navigate(
                  `/documents/${encodeURIComponent(
                    row.lan,
                  )}`,
                );
              }}
            >
              {displayValue(
                row?.business_name,
              )}
            </span>
          );
        },

        sortAccessor: (row) =>
          String(
            row?.business_name || "",
          ).toLowerCase(),

        csvAccessor: (row) =>
          isPreviewRow(row)
            ? ""
            : row?.business_name || "",
      },

      {
        key: "product",
        header: "PRODUCT",
        sortable: true,
        width: 150,

        render: (row) => (
          <span
            style={{
              fontWeight: 700,
              color: "#334155",
            }}
          >
            {displayValue(row?.product)}
          </span>
        ),

        sortAccessor: (row) =>
          String(
            row?.product || "",
          ).toLowerCase(),

        csvAccessor: (row) =>
          isPreviewRow(row)
            ? ""
            : row?.product || "",
      },

      {
        key: "industry",
        header: "INDUSTRY",
        sortable: true,
        width: 170,

        render: (row) =>
          displayValue(row?.industry),

        sortAccessor: (row) =>
          String(
            row?.industry || "",
          ).toLowerCase(),

        csvAccessor: (row) =>
          isPreviewRow(row)
            ? ""
            : row?.industry || "",
      },

      {
        key: "location",
        header: "LOCATION",
        sortable: true,
        width: 230,

        render: (row) => {
          const location =
            getLocation(row);

          return (
            <span
              title={
                location === "—"
                  ? ""
                  : location
              }
              style={{
                display: "inline-block",
                maxWidth: "210px",
                overflow: "hidden",
                textOverflow:
                  "ellipsis",
                whiteSpace: "nowrap",
                verticalAlign: "middle",
              }}
            >
              {location}
            </span>
          );
        },

        sortAccessor: (row) =>
          getLocation(
            row,
          ).toLowerCase(),

        csvAccessor: (row) => {
          if (isPreviewRow(row)) {
            return "";
          }

          const location =
            getLocation(row);

          return location === "—"
            ? ""
            : location;
        },
      },

      {
        key: "customer_name",
        header: "CUSTOMER NAME",
        sortable: true,
        width: 190,

        render: (row) => (
          <span
            style={{
              fontWeight: 600,
              color: "#0f172a",
            }}
          >
            {getCustomerName(row)}
          </span>
        ),

        sortAccessor: (row) =>
          getCustomerName(
            row,
          ).toLowerCase(),

        csvAccessor: (row) => {
          if (isPreviewRow(row)) {
            return "";
          }

          const customerName =
            getCustomerName(row);

          return customerName === "—"
            ? ""
            : customerName;
        },
      },

      {
        key: "mobile_number",
        header: "MOBILE",
        sortable: true,
        width: 150,

        render: (row) => {
          if (
            isPreviewRow(row) ||
            !row?.mobile_number
          ) {
            return "—";
          }

          return (
            <a
              href={`tel:${row.mobile_number}`}
              style={{
                color: "#2563eb",
                textDecoration:
                  "underline",
                fontWeight: 600,
              }}
            >
              {row.mobile_number}
            </a>
          );
        },

        sortAccessor: (row) =>
          String(
            row?.mobile_number || "",
          ),

        csvAccessor: (row) =>
          isPreviewRow(row)
            ? ""
            : row?.mobile_number || "",
      },

      {
        key: "status",
        header: "STATUS",
        sortable: true,
        width: 125,

        render: (row) => {
          /*
           * No fallback to LOGIN.
           * Status must be present in backend data.
           */
          const status =
            normalizeStatus(row?.status);

          if (!status) {
            return "—";
          }

          return (
            <span
              style={getStatusPillStyle(
                status,
              )}
            >
              {status}
            </span>
          );
        },

        sortAccessor: (row) =>
          normalizeStatus(
            row?.status,
          ).toLowerCase(),

        csvAccessor: (row) =>
          isPreviewRow(row)
            ? ""
            : normalizeStatus(
                row?.status,
              ),
      },

      {
        key: "created_at",
        header: "CREATED AT",
        sortable: true,
        width: 145,

        render: (row) =>
          formatDate(row?.created_at),

        sortAccessor: (row) =>
          row?.created_at
            ? new Date(
                row.created_at,
              ).getTime()
            : 0,

        csvAccessor: (row) =>
          isPreviewRow(row)
            ? ""
            : row?.created_at || "",
      },

      {
        key: "documents",
        header: "DOCUMENTS",
        width: 130,

        render: (row) => {
          const disabled =
            isPreviewRow(row) ||
            !row?.lan;

          return (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;

                navigate(
                  `/documents/${encodeURIComponent(
                    row.lan,
                  )}`,
                );
              }}
              style={{
                padding: "8px 11px",
                borderRadius: "8px",
                border:
                  "1px solid #93c5fd",
                color: "#1d4ed8",
                background: "#ffffff",
                cursor: disabled
                  ? "not-allowed"
                  : "pointer",
                fontSize: "12px",
                fontWeight: 700,
                opacity: disabled
                  ? 0.5
                  : 1,
                whiteSpace: "nowrap",
              }}
            >
              📂 Docs
            </button>
          );
        },

        csvAccessor: () => "",
      },

      {
        key: "actions",
        header: "ACTIONS",
        width: 220,

        render: (row) => {
          /*
           * Buttons are enabled only when the actual
           * backend status equals LOGIN.
           */
          const currentStatus =
            normalizeStatus(row?.status);

          const isUpdating =
            updatingLan === row?.lan;

          const disabled =
            isPreviewRow(row) ||
            !row?.lan ||
            isUpdating ||
            currentStatus !== "LOGIN";

          return (
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                disabled={disabled}
                style={getActionButtonStyle(
                  "approve",
                  disabled,
                )}
                onClick={() =>
                  handleStatusChange(
                    row,
                    "APPROVED",
                  )
                }
              >
                {isUpdating
                  ? "Updating..."
                  : "✅ Approve"}
              </button>

              <button
                type="button"
                disabled={disabled}
                style={getActionButtonStyle(
                  "reject",
                  disabled,
                )}
                onClick={() =>
                  handleStatusChange(
                    row,
                    "REJECTED",
                  )
                }
              >
                {isUpdating
                  ? "Updating..."
                  : "❌ Reject"}
              </button>
            </div>
          );
        },

        csvAccessor: () => "",
      },
    ],
    [
      navigate,
      updatingLan,
      handleStatusChange,
    ],
  );

  /*
  ==========================
  PAGE UI
  ==========================
  */
  return (
    <div className="all-loans-page-wrapper">
      {loading && (
        <div
          style={{
            padding: "11px 16px",
            marginBottom: "12px",
            borderRadius: "8px",
            border:
              "1px solid #bfdbfe",
            background: "#eff6ff",
            color: "#1d4ed8",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          Loading Sterlion Mexon Dexon
          login cases...
        </div>
      )}

      {!loading && errorMessage && (
        <div
          style={{
            padding: "11px 16px",
            marginBottom: "12px",
            borderRadius: "8px",
            border:
              "1px solid #fed7aa",
            background: "#fff7ed",
            color: "#9a3412",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {errorMessage}
        </div>
      )}

      {!loading &&
        !errorMessage &&
        rows.length === 0 && (
          <div
            style={{
              padding: "11px 16px",
              marginBottom: "12px",
              borderRadius: "8px",
              border:
                "1px solid #e2e8f0",
              background: "#f8fafc",
              color: "#475569",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            No LOGIN cases are currently
            available.
          </div>
        )}

      <DataTable
        title="Sterlion Mexon Dexon Credit Approval"
        rows={tableRows}
        columns={columns}
        globalSearchKeys={[
          "business_name",
          "product",
          "industry",
          "business_address",
          "permanent_address",
          "customer_name",
          "first_name",
          "last_name",
          "mobile_number",
          "status",
        ]}
        initialSort={{
          key: "created_at",
          dir: "desc",
        }}
        exportFileName="sterlion_mexon_dexon_credit_approval"
        initialPageSize={10}
        pageSizeOptions={[
          10,
          25,
          50,
          100,
        ]}
      />
    </div>
  );
};

export default SterlionMexonDexonLoginActions;