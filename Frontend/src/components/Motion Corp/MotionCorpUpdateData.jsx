import React, { useEffect, useState } from "react";
import {
  useSearchParams,
  useNavigate,
} from "react-router-dom";

import api from "../../api/api";

function ExternalLinkField({
  label,
  url,
  status,
}) {
  const [copied, setCopied] =
    useState(false);

  const handleCopyLink = async () => {
    if (!url) return;

    try {
      if (
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(
          url,
        );
      } else {
        const textArea =
          document.createElement(
            "textarea",
          );

        textArea.value = url;
        textArea.style.position =
          "fixed";
        textArea.style.opacity = "0";

        document.body.appendChild(
          textArea,
        );

        textArea.select();

        document.execCommand("copy");

        document.body.removeChild(
          textArea,
        );
      }

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error(
        "Failed to copy link:",
        error,
      );

      alert(
        "Failed to copy link. Please copy it manually.",
      );
    }
  };

  return (
    <div>
      <strong>{label}</strong>

      {status && (
        <div
          style={{
            marginTop: "4px",
            color: "#6b7280",
          }}
        >
          Status: {status}
        </div>
      )}

      <div
        style={{
          marginTop: "8px",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        {url ? (
          <>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#2563eb",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Open link ↗
            </a>

            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                padding: "7px 12px",
                border:
                  "1px solid #cbd5e1",
                borderRadius: "7px",

                background: copied
                  ? "#dcfce7"
                  : "#ffffff",

                color: copied
                  ? "#166534"
                  : "#334155",

                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {copied
                ? "✓ Copied"
                : "📋 Copy link"}
            </button>
          </>
        ) : (
          <span
            style={{
              color: "#9ca3af",
            }}
          >
            Not available
          </span>
        )}
      </div>
    </div>
  );
}

function InsuranceInput({
  label,
  name,
  type = "text",
  value,
  onChange,
  disabled = false,
  ...inputProps
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "15px",

        background: disabled
          ? "#f1f5f9"
          : "#f8fafc",

        border:
          "1px solid #e2e8f0",

        borderRadius: "14px",
      }}
    >
      <span
        style={{
          fontSize: "13px",
          fontWeight: 800,

          color: disabled
            ? "#64748b"
            : "#334155",
        }}
      >
        {label}

        {!disabled && (
          <span
            style={{
              color: "#dc2626",
              marginLeft: "4px",
            }}
          >
            *
          </span>
        )}
      </span>

      <input
        {...inputProps}
        required={!disabled}
        disabled={disabled}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        style={{
          width: "100%",
          minHeight: "44px",
          boxSizing: "border-box",
          padding: "11px 13px",

          border: `1px solid ${disabled
              ? "#e2e8f0"
              : "#cbd5e1"
            }`,

          borderRadius: "10px",

          background: disabled
            ? "#e2e8f0"
            : "#ffffff",

          color: disabled
            ? "#475569"
            : "#0f172a",

          fontSize: "15px",
          fontWeight: 600,
          outline: "none",

          cursor: disabled
            ? "not-allowed"
            : "text",

          opacity: disabled
            ? 0.85
            : 1,
        }}
      />
    </label>
  );
}

const MotionCorpUpdateData = () => {
  const [searchParams] =
    useSearchParams();

  const lan =
    searchParams.get("lan");

  const navigate = useNavigate();

  const [details, setDetails] =
    useState(null);

  const [err, setErr] =
    useState("");

  const [
    insuranceForm,
    setInsuranceForm,
  ] = useState({
    insurance_cost: "",
    insurance_company_provider: "",
    insurance_policy_number: "",
    policy_issued_date: "",
    period_of_insurance: "",
  });

  const [
    insuranceSubmitted,
    setInsuranceSubmitted,
  ] = useState(false);

  const [
    insuranceSaving,
    setInsuranceSaving,
  ] = useState(false);

  const [
    insuranceMessage,
    setInsuranceMessage,
  ] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [
    retryingApplicant,
    setRetryingApplicant,
  ] = useState("");

  const [
    retryClock,
    setRetryClock,
  ] = useState(Date.now());

  /*
   * Update retry countdown every minute.
   *
   * Actual retry validation is always
   * performed by the backend.
   */
  useEffect(() => {
    const timerId =
      window.setInterval(() => {
        setRetryClock(Date.now());
      }, 60000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  /*
   * Initial page details fetch.
   *
   * Status shown in UI comes from
   * customer-details database response.
   */
  useEffect(() => {
    const fetchDetails = async () => {
      if (!lan) {
        setErr(
          "LAN is missing. Please open the case from the case list.",
        );

        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErr("");

        const response = await api.get(
          `/motion-corp/customer-details/${encodeURIComponent(
            lan,
          )}`,
          {
            params: {
              _refresh: Date.now(),
            },
          },
        );

        setDetails(response.data);

        const insurance =
          response.data?.loan
            ?.insurance_details || {};

        setInsuranceForm({
          insurance_cost:
            insurance.insurance_cost ??
            "",

          insurance_company_provider:
            insurance
              .insurance_company_provider ||
            "",

          insurance_policy_number:
            insurance
              .insurance_policy_number ||
            "",

          policy_issued_date:
            insurance.policy_issued_date
              ? String(
                insurance.policy_issued_date,
              ).slice(0, 10)
              : "",

          period_of_insurance:
            insurance
              .period_of_insurance ||
            "",
        });

        const alreadySubmitted = [
          insurance.insurance_cost,

          insurance
            .insurance_company_provider,

          insurance
            .insurance_policy_number,

          insurance.policy_issued_date,

          insurance
            .period_of_insurance,
        ].every(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== "",
        );

        setInsuranceSubmitted(
          alreadySubmitted,
        );
      } catch (error) {
        console.error(
          "Failed to fetch Motion Corp details:",
          error,
        );

        setErr(
          error.response?.data?.message ||
          "Failed to fetch customer details.",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [lan]);

  /*
   * Poll database while:
   *
   * 1. Status is INITIATED, so provider
   *    callback can change it to VERIFIED.
   *
   * 2. FAILED/PENDING is inside the
   *    24-hour waiting period.
   */
  const shouldPollAadhaar = [
    details?.loan?.verification_status
      ?.borrower,

    details?.loan?.verification_status
      ?.guarantor,

    details?.loan?.verification_status
      ?.co_applicant,
  ].some((applicantStatus) => {
    if (!applicantStatus) {
      return false;
    }

    const aadhaarStatus = String(
      applicantStatus.aadhaar_status ||
      "PENDING",
    )
      .trim()
      .toUpperCase();

    const retryCount = Number(
      applicantStatus
        .aadhaar_retry_count || 0,
    );

    const backendCanRetry =
      applicantStatus
        .aadhaar_can_retry === true ||
      Number(
        applicantStatus
          .aadhaar_can_retry,
      ) === 1;

    if (
      aadhaarStatus === "INITIATED"
    ) {
      return true;
    }

    return (
      ["PENDING", "FAILED"].includes(
        aadhaarStatus,
      ) &&
      Boolean(
        applicantStatus
          .aadhaar_initiated_at,
      ) &&
      !backendCanRetry &&
      retryCount < 2
    );
  });

  useEffect(() => {
    if (
      !lan ||
      !shouldPollAadhaar
    ) {
      return undefined;
    }

    let cancelled = false;

    const refreshStatus = async () => {
      try {
        const response = await api.get(
          `/motion-corp/customer-details/${encodeURIComponent(
            lan,
          )}`,
          {
            params: {
              _refresh: Date.now(),
            },
          },
        );

        if (!cancelled) {
          setDetails(response.data);
          setRetryClock(Date.now());
        }
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Failed to refresh Aadhaar status:",
            error,
          );
        }
      }
    };

    const intervalId =
      window.setInterval(
        refreshStatus,
        10000,
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        intervalId,
      );
    };
  }, [lan, shouldPollAadhaar]);

  /*
   * Retry or initiate Aadhaar.
   *
   * Frontend does not manually set
   * INITIATED or FAILED.
   *
   * It calls backend and then fetches
   * actual database values again.
   */
  const handleAadhaarRetry = async (
    applicantType,
  ) => {
    if (
      !lan ||
      retryingApplicant
    ) {
      return;
    }

    const normalizedApplicantType =
      String(applicantType || "")
        .trim()
        .toUpperCase();

    if (
      ![
        "BORROWER",
        "GUARANTOR",
        "CO_APPLICANT",
      ].includes(
        normalizedApplicantType,
      )
    ) {
      alert("Invalid applicant type.");
      return;
    }

    const refreshFromDatabase =
      async () => {
        const latestResponse =
          await api.get(
            `/motion-corp/customer-details/${encodeURIComponent(
              lan,
            )}`,
            {
              params: {
                _refresh: Date.now(),
              },
            },
          );

        setDetails(
          latestResponse.data,
        );

        setRetryClock(Date.now());

        return latestResponse.data;
      };

    try {
      setRetryingApplicant(
        normalizedApplicantType,
      );

      const response = await api.post(
        "/motion-corp/init-aadhaar",
        {
          lan,

          applicantType:
            normalizedApplicantType,

          forceRetry: true,
        },
      );

      /*
       * Backend has already saved:
       *
       * INITIATED + provider link,
       * or the applicable database status.
       *
       * Read database values again.
       */
      await refreshFromDatabase();

      alert(
        response.data?.message ||
        `${normalizedApplicantType} Aadhaar initiated successfully.`,
      );
    } catch (error) {
      const errorPayload =
        error.response?.data || {};

      console.error(
        "Aadhaar retry failed:",
        {
          lan,

          applicantType:
            normalizedApplicantType,

          error: errorPayload,
        },
      );

      /*
       * Provider failure and 24-hour
       * waiting responses are also
       * followed by a database refresh.
       */
      try {
        await refreshFromDatabase();
      } catch (refreshError) {
        console.error(
          "Failed to refresh Aadhaar status after retry error:",
          refreshError,
        );
      }

      alert(
        errorPayload.message ||
        "Failed to retry Aadhaar verification.",
      );
    } finally {
      setRetryingApplicant("");
    }
  };

  const handleInsuranceChange = (
    event,
  ) => {
    const { name, value } =
      event.target;

    setInsuranceForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setInsuranceMessage("");
  };

  const handleInsuranceSubmit =
    async (event) => {
      event.preventDefault();

      if (!lan) {
        setInsuranceMessage(
          "❌ LAN is missing.",
        );

        return;
      }

      try {
        setInsuranceSaving(true);
        setInsuranceMessage("");

        const response = await api.patch(
          `/motion-corp/insurance/${encodeURIComponent(
            lan,
          )}`,
          insuranceForm,
        );

        setInsuranceSubmitted(true);

        const savedInsurance =
          response.data?.insurance ||
          insuranceForm;

        setInsuranceForm({
          insurance_cost:
            savedInsurance
              .insurance_cost ?? "",

          insurance_company_provider:
            savedInsurance
              .insurance_company_provider ||
            "",

          insurance_policy_number:
            savedInsurance
              .insurance_policy_number ||
            "",

          policy_issued_date:
            savedInsurance
              .policy_issued_date
              ? String(
                savedInsurance
                  .policy_issued_date,
              ).slice(0, 10)
              : "",

          period_of_insurance:
            savedInsurance
              .period_of_insurance ||
            "",
        });

        setDetails((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,

            loan: {
              ...previous.loan,

              insurance_details:
                savedInsurance,
            },
          };
        });

        setInsuranceMessage(
          `✅ ${response.data?.message ||
          "Insurance details saved successfully"
          }`,
        );
      } catch (error) {
        console.error(
          "Insurance save failed:",
          error,
        );

        setInsuranceMessage(
          `❌ ${error.response?.data
            ?.message ||
          "Failed to save insurance details"
          }`,
        );
      } finally {
        setInsuranceSaving(false);
      }
    };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",

          justifyContent:
            "center",

          alignItems: "center",

          height: "100vh",
        }}
      >
        <div
          style={{
            width: "60px",
            height: "60px",

            border:
              "6px solid #f3f3f3",

            borderTop:
              "6px solid #0ea5e9",

            borderRadius: "50%",

            animation:
              "spin 1s linear infinite",
          }}
        />

        <style>
          {`
            @keyframes spin {
              0% {
                transform: rotate(0deg);
              }

              100% {
                transform: rotate(360deg);
              }
            }
          `}
        </style>
      </div>
    );
  }

  if (err) {
    return (
      <p
        style={{
          padding: 40,
          fontSize: "20px",
          color: "#dc2626",
          fontWeight: 700,
        }}
      >
        {err}
      </p>
    );
  }

  if (!details) {
    return (
      <p
        style={{
          padding: 40,
          fontSize: "20px",
          color: "#6b7280",
        }}
      >
        No data found.
      </p>
    );
  }

  const { loan, bre } = details;

  const formatDate = (date) => {
    if (!date) {
      return "—";
    }

    const parsedDate =
      new Date(date);

    if (
      Number.isNaN(
        parsedDate.getTime(),
      )
    ) {
      return date;
    }

    return parsedDate.toLocaleDateString(
      "en-GB",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      },
    );
  };

  const hasValue = (value) =>
    value !== null &&
    value !== undefined &&
    String(value).trim() !== "";

  const sections = [
    {
      title:
        "Applicant Information",

      icon: "👤",

      content: (
        <Grid>
          <Field
            label="LAN"
            value={loan.lan}
            highlight
          />

          <Field
            label="Partner Loan ID"
            value={
              loan.partner_loan_id
            }
          />

          <Field
            label="Customer Name"
            value={
              loan.customer_name
            }
          />

          <Field
            label="First Name"
            value={
              loan.first_name
            }
          />

          <Field
            label="Last Name"
            value={
              loan.last_name
            }
          />

          <Field
            label="Father Name"
            value={
              loan.father_name
            }
          />

          <Field
            label="PAN Number"
            value={loan.pan_card}
          />

          <Field
            label="Mobile Number"
            value={
              loan.mobile_number
            }
          />

          <Field
            label="Email"
            value={loan.email}
          />

          <Field
            label="DOB"
            value={formatDate(
              loan.dob,
            )}
          />

          <Field
            label="Gender"
            value={loan.gender}
          />

          <Field
            label="Current Status"
            value={loan.status}
            isStatus
          />

          <Field
            label="Stage"
            value={loan.stage}
            isStatus
          />
        </Grid>
      ),
    },

    {
      title:
        "Guarantor Details",

      icon: "🧾",

      content: hasValue(
        loan.guarantor?.name,
      ) ? (
        <Grid>
          <Field
            label="Guarantor Name"
            value={
              loan.guarantor?.name
            }
          />

          <Field
            label="Guarantor PAN"
            value={
              loan.guarantor?.pan
            }
          />

          <Field
            label="Guarantor Mobile"
            value={
              loan.guarantor?.mobile
            }
          />

          <Field
            label="Guarantor Email"
            value={
              loan.guarantor?.email
            }
          />

          <Field
            label="Guarantor DOB"
            value={formatDate(
              loan.guarantor?.dob,
            )}
          />

          <Field
            label="Relationship With Borrower"
            value={
              loan.guarantor
                ?.relationship_with_borrower
            }
          />

          <Field
            label="Address Line 1"
            value={
              loan.guarantor
                ?.address
                ?.address_line_1
            }
          />

          <Field
            label="Address Line 2"
            value={
              loan.guarantor
                ?.address
                ?.address_line_2
            }
          />

          <Field
            label="City"
            value={
              loan.guarantor
                ?.address
                ?.city
            }
          />

          <Field
            label="District"
            value={
              loan.guarantor
                ?.address
                ?.district
            }
          />

          <Field
            label="State"
            value={
              loan.guarantor
                ?.address
                ?.state
            }
          />

          <Field
            label="Pincode"
            value={
              loan.guarantor
                ?.address
                ?.pincode
            }
          />
        </Grid>
      ) : (
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          No guarantor details
          available.
        </p>
      ),
    },

    {
      title:
        "Co-Applicant Details",

      icon: "👥",

      content: hasValue(
        loan.co_applicant?.name,
      ) ? (
        <Grid>
          <Field
            label="Co-Applicant Name"
            value={
              loan.co_applicant?.name
            }
          />

          <Field
            label="Co-Applicant PAN"
            value={
              loan.co_applicant?.pan
            }
          />

          <Field
            label="Co-Applicant Mobile"
            value={
              loan.co_applicant?.mobile
            }
          />

          <Field
            label="Co-Applicant Email"
            value={
              loan.co_applicant?.email
            }
          />

          <Field
            label="Co-Applicant DOB"
            value={formatDate(
              loan.co_applicant?.dob,
            )}
          />

          <Field
            label="Address Line 1"
            value={
              loan.co_applicant
                ?.address
                ?.address_line_1
            }
          />

          <Field
            label="Address Line 2"
            value={
              loan.co_applicant
                ?.address
                ?.address_line_2
            }
          />

          <Field
            label="City"
            value={
              loan.co_applicant
                ?.address
                ?.city
            }
          />

          <Field
            label="District"
            value={
              loan.co_applicant
                ?.address
                ?.district
            }
          />

          <Field
            label="State"
            value={
              loan.co_applicant
                ?.address
                ?.state
            }
          />

          <Field
            label="Pincode"
            value={
              loan.co_applicant
                ?.address
                ?.pincode
            }
          />
        </Grid>
      ) : (
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          No co-applicant details
          available.
        </p>
      ),
    },

    {
      title:
        "Loan & Financials",

      icon: "💰",

      content: (
        <Grid>
          <Field
            label="Requested Loan Amount"
            value={`₹${loan.loan_details
                ?.requested_loan_amount ||
              "-"
              }`}
            highlight
          />

          <Field
            label="Loan Amount"
            value={`₹${loan.loan_details
                ?.loan_amount ||
              "-"
              }`}
            highlight
          />

          <Field
            label="Tenure"
            value={`${loan.loan_details
                ?.loan_tenure ||
              0
              } Months`}
          />

          <Field
            label="Interest Rate"
            value={`${loan.loan_details
                ?.interest_rate ||
              0
              }%`}
          />

          <Field
            label="Processing Fee"
            value={`₹${loan.loan_details
                ?.processing_fee ||
              "-"
              }`}
          />

          <Field
            label="Processing Fee %"
            value={
              loan.loan_details
                ?.processing_fee_percentage
            }
          />

          <Field
            label="Disbursal Amount"
            value={
              loan.loan_details
                ?.disbursal_amount
            }
          />

          <Field
            label="CIBIL Score"
            value={
              bre?.fintree_cibil_score
            }
          />
        </Grid>
      ),
    },

    {
      title: "Bank Details",
      icon: "🏦",

      content: (
        <Grid>
          <Field
            label="Bank Name"
            value={
              loan.bank_details
                ?.customer_bank_name
            }
          />

          <Field
            label="Account Holder"
            value={
              loan.bank_details
                ?.customer_name_as_per_bank
            }
          />

          <Field
            label="Account Number"
            value={
              loan.bank_details
                ?.customer_account_number
            }
          />

          <Field
            label="IFSC Code"
            value={
              loan.bank_details
                ?.bank_ifsc_code
            }
          />
        </Grid>
      ),
    },

    {
      title:
        "Address Details",

      icon: "📍",

      content: (
        <Grid>
          <Field
            label="Address Line 1"
            value={
              loan.permanent_address
                ?.address_line_1
            }
          />

          <Field
            label="Address Line 2"
            value={
              loan.permanent_address
                ?.address_line_2
            }
          />

          <Field
            label="City"
            value={
              loan.permanent_address
                ?.city
            }
          />

          <Field
            label="District"
            value={
              loan.permanent_address
                ?.district
            }
          />

          <Field
            label="State"
            value={
              loan.permanent_address
                ?.state
            }
          />

          <Field
            label="Pincode"
            value={
              loan.permanent_address
                ?.pincode
            }
          />
        </Grid>
      ),
    },

    {
      title:
        "Dealer Details",

      icon: "🏪",

      content: (
        <Grid>
          <Field
            label="Dealer Name"
            value={
              loan.dealer_details
                ?.dealer_name
            }
          />

          <Field
            label="Trade Name"
            value={
              loan.dealer_details
                ?.trade_name
            }
          />

          <Field
            label="Dealer Contact"
            value={
              loan.dealer_details
                ?.dealer_contact
            }
          />

          <Field
            label="Dealer Email"
            value={
              loan.dealer_details
                ?.dealer_email
            }
          />

          <Field
            label="GST Number"
            value={
              loan.dealer_details
                ?.gst_no
            }
          />

          <Field
            label="Dealer City"
            value={
              loan.dealer_details
                ?.dealer_city
            }
          />

          <Field
            label="Dealer State"
            value={
              loan.dealer_details
                ?.dealer_state
            }
          />
        </Grid>
      ),
    },

    {
      title:
        "Vehicle & Product",

      icon: "🛺",

      content: (
        <Grid>
          <Field
            label="E-Rickshaw Model"
            value={
              loan.product_details
                ?.e_rikshaw_model
            }
          />

          <Field
            label="Battery Name"
            value={
              loan.product_details
                ?.battery_name
            }
          />

          <Field
            label="Battery Type"
            value={
              loan.product_details
                ?.battery_type
            }
          />

          <Field
            label="Battery Serial No"
            value={
              loan.product_details
                ?.battery_serial_no_1
            }
          />

          <Field
            label="Chassis No"
            value={
              loan.product_details
                ?.chassis_no
            }
          />
        </Grid>
      ),
    },

    /*
     * Upper section contains only:
     *
     * PAN status
     * Aadhaar status
     * Retry button
     * Bureau status
     *
     * Provider links are not shown here.
     */
    {
      title:
        "Verification Status",

      icon: "✅",

      content: (
        <div
          style={{
            display: "grid",
            gap: "24px",
          }}
        >
          <ApplicantVerificationBlock
            title="Borrower"
            applicantType="BORROWER"
            data={
              loan.verification_status
                ?.borrower
            }
            retryingApplicant={
              retryingApplicant
            }
            nowMs={retryClock}
            onAadhaarRetry={
              handleAadhaarRetry
            }
          />

          {hasValue(
            loan.guarantor?.name,
          ) && (
              <ApplicantVerificationBlock
                title="Guarantor"
                applicantType="GUARANTOR"
                data={
                  loan
                    .verification_status
                    ?.guarantor
                }
                retryingApplicant={
                  retryingApplicant
                }
                nowMs={retryClock}
                onAadhaarRetry={
                  handleAadhaarRetry
                }
              />
            )}

          {hasValue(
            loan.co_applicant?.name,
          ) && (
              <ApplicantVerificationBlock
                title="Co-Applicant"
                applicantType="CO_APPLICANT"
                data={
                  loan
                    .verification_status
                    ?.co_applicant
                }
                retryingApplicant={
                  retryingApplicant
                }
                nowMs={retryClock}
                onAadhaarRetry={
                  handleAadhaarRetry
                }
              />
            )}
        </div>
      ),
    },

    {
      title:
        "Risk & BRE Decisioning",

      icon: "⚖️",

      content: (
        <Grid>
          <Field
            label="BRE Status"
            value={bre?.bre_status}
            isStatus
          />

          <Field
            label="BRE Reason"
            value={bre?.bre_reason}
          />

          <Field
            label="Fintree CIBIL"
            value={
              bre?.fintree_cibil_score
            }
          />

          <Field
            label="Enquiries (30D)"
            value={bre?.enquiries_30d}
          />

          <FlagField
            label="DPD 3M"
            value={bre?.dpd_3m_flag}
          />

          <FlagField
            label="DPD 6M"
            value={bre?.dpd_6m_flag}
          />

          <FlagField
            label="Overdue 12M"
            value={
              bre?.overdue_12m_flag
            }
          />

          <FlagField
            label="Written Off 3Y"
            value={
              bre?.written_off_3y_flag
            }
          />

          <FlagField
            label="60+ DPD"
            value={
              bre?.dpd_60plus_24m_flag
            }
          />

          <FlagField
            label="90+ DPD"
            value={
              bre?.dpd_90plus_36m_flag
            }
          />

          <FlagField
            label="Deviation"
            value={
              bre?.deviation_flag
            }
          />

          <Field
            label="EMI Overdue"
            value={
              bre?.emi_overdue_amount
            }
          />

          <Field
            label="CC Overdue"
            value={
              bre?.cc_overdue_amount
            }
          />
        </Grid>
      ),
    },

    /*
     * Aadhaar links remain only in
     * this lower KYC section.
     */
    {
      title:
        "KYC, NACH & Insurance",

      icon: "🛡️",

      content: (
        <>
          <Grid>
            <ExternalLinkField
              label="Borrower Aadhaar"
              url={
                loan.verification_links
                  ?.borrower_aadhaar_url
              }
              status={
                loan.verification_status
                  ?.borrower
                  ?.aadhaar_status
              }
            />

            <ExternalLinkField
              label="Guarantor Aadhaar"
              url={
                loan.verification_links
                  ?.guarantor_aadhaar_url
              }
              status={
                loan.verification_status
                  ?.guarantor
                  ?.aadhaar_status
              }
            />

            <ExternalLinkField
              label="Co-applicant Aadhaar"
              url={
                loan.verification_links
                  ?.co_applicant_aadhaar_url
              }
              status={
                loan.verification_status
                  ?.co_applicant
                  ?.aadhaar_status
              }
            />

            <ExternalLinkField
              label="NACH Authentication Link"
              url={
                loan.nach_details?.auth_url
              }
            />

            {loan.nach_details?.umrn && (
              <Field
                label="UMRN"
                value={
                  loan.nach_details.umrn
                }
                highlight
              />
            )}
          </Grid>

          <form
            onSubmit={
              handleInsuranceSubmit
            }
            style={{
              marginTop: "24px",
              paddingTop: "20px",

              borderTop:
                "1px solid #e5e7eb",
            }}
          >
            <h4
              style={{
                marginTop: 0,
              }}
            >
              Insurance Details
            </h4>

            <Grid>
              <InsuranceInput
                label="Insurance Cost"
                name="insurance_cost"
                type="number"
                min="0"
                step="0.01"
                value={
                  insuranceForm
                    .insurance_cost
                }
                onChange={
                  handleInsuranceChange
                }
                disabled={
                  insuranceSubmitted ||
                  insuranceSaving
                }
              />

              <InsuranceInput
                label="Insurance Provider"
                name="insurance_company_provider"
                value={
                  insuranceForm
                    .insurance_company_provider
                }
                onChange={
                  handleInsuranceChange
                }
                disabled={
                  insuranceSubmitted ||
                  insuranceSaving
                }
              />

              <InsuranceInput
                label="Policy Number"
                name="insurance_policy_number"
                value={
                  insuranceForm
                    .insurance_policy_number
                }
                onChange={
                  handleInsuranceChange
                }
                disabled={
                  insuranceSubmitted ||
                  insuranceSaving
                }
              />

              <InsuranceInput
                label="Policy Issued Date"
                name="policy_issued_date"
                type="date"
                value={
                  insuranceForm
                    .policy_issued_date
                }
                onChange={
                  handleInsuranceChange
                }
                disabled={
                  insuranceSubmitted ||
                  insuranceSaving
                }
              />

              <InsuranceInput
                label="Period of Insurance"
                name="period_of_insurance"
                placeholder="Example: 12 months"
                value={
                  insuranceForm
                    .period_of_insurance
                }
                onChange={
                  handleInsuranceChange
                }
                disabled={
                  insuranceSubmitted ||
                  insuranceSaving
                }
              />
            </Grid>

            {insuranceMessage && (
              <div
                style={{
                  marginTop: "14px",
                }}
              >
                {insuranceMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={
                insuranceSaving ||
                insuranceSubmitted
              }
              style={{
                marginTop: "18px",
                padding: "11px 22px",
                border: 0,
                borderRadius: "8px",

                background:
                  insuranceSubmitted
                    ? "#16a34a"
                    : insuranceSaving
                      ? "#9ca3af"
                      : "#2563eb",

                color: "#ffffff",
                fontWeight: 700,

                cursor:
                  insuranceSaving ||
                    insuranceSubmitted
                    ? "not-allowed"
                    : "pointer",

                opacity:
                  insuranceSaving
                    ? 0.75
                    : 1,
              }}
            >
              {insuranceSubmitted
                ? "✓ Insurance Details Submitted"
                : insuranceSaving
                  ? "Saving..."
                  : "Submit Insurance Details"}
            </button>
          </form>
        </>
      ),
    },
  ];

  return (
    <div
      style={{
        background: "#f1f5f9",
        minHeight: "100vh",
        padding: "50px 25px",

        fontFamily:
          "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1300px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",

            justifyContent:
              "space-between",

            alignItems: "flex-end",

            marginBottom: "40px",
          }}
        >
          <button
            type="button"
            onClick={() =>
              navigate(-1)
            }
            style={{
              padding: "14px 28px",
              background: "#ffffff",
              color: "#334155",

              border:
                "2px solid #e2e8f0",

              borderRadius: "12px",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: 700,

              display: "flex",
              alignItems: "center",
              gap: "10px",

              boxShadow:
                "0 4px 6px -1px rgba(0,0,0,0.1)",
            }}
          >
            ← Back
          </button>

          <div
            style={{
              textAlign: "right",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                color: "#64748b",
                fontWeight: 800,

                textTransform:
                  "uppercase",

                letterSpacing:
                  "0.1em",
              }}
            >
              Motion Corp Profile
            </span>

            <h1
              style={{
                margin:
                  "8px 0 0 0",

                color: "#0f172a",
                fontSize: "42px",
                fontWeight: 900,

                letterSpacing:
                  "-0.02em",
              }}
            >
              {loan.customer_name ||
                lan}
            </h1>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr",
            gap: "35px",
          }}
        >
          {sections.map(
            (
              section,
              index,
            ) => (
              <div
                key={
                  section.title ||
                  index
                }
                style={{
                  background:
                    "#ffffff",

                  borderRadius:
                    "24px",

                  padding: "40px",

                  boxShadow:
                    "0 10px 15px -3px rgba(0,0,0,0.04), " +
                    "0 4px 6px -2px rgba(0,0,0,0.02)",

                  border:
                    "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems:
                      "center",
                    gap: "15px",

                    marginBottom:
                      "30px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "28px",
                    }}
                  >
                    {section.icon}
                  </span>

                  <h3
                    style={{
                      margin: 0,
                      color: "#1e293b",
                      fontSize: "22px",
                      fontWeight: 800,

                      textTransform:
                        "uppercase",

                      letterSpacing:
                        "0.02em",
                    }}
                  >
                    {section.title}
                  </h3>
                </div>

                {section.content}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
};

const Grid = ({ children }) => (
  <div
    style={{
      display: "grid",

      gridTemplateColumns:
        "repeat(auto-fill, minmax(280px, 1fr))",

      gap: "30px",
    }}
  >
    {children}
  </div>
);

const Field = ({
  label,
  value,
  highlight,
  isStatus,
}) => {
  const statusColors = {
    APPROVED: {
      bg: "#bbf7d0",
      text: "#14532d",
    },

    SUCCESS: {
      bg: "#bbf7d0",
      text: "#14532d",
    },

    VERIFIED: {
      bg: "#dcfce7",
      text: "#166534",
    },

    INITIATED: {
      bg: "#dbeafe",
      text: "#1e40af",
    },

    REJECTED: {
      bg: "#fecaca",
      text: "#7f1d1d",
    },

    FAILED: {
      bg: "#fecaca",
      text: "#7f1d1d",
    },

    PENDING: {
      bg: "#fef08a",
      text: "#713f12",
    },

    LOGIN: {
      bg: "#e0f2fe",
      text: "#075985",
    },
  };

  const normalizedValue = String(
    value || "",
  )
    .trim()
    .toUpperCase();

  const statusStyle = isStatus
    ? statusColors[normalizedValue] || {
      bg: "#f1f5f9",
      text: "#475569",
    }
    : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <label
        style={{
          fontSize: "12px",
          color: "#94a3b8",
          fontWeight: 800,

          textTransform:
            "uppercase",

          letterSpacing:
            "0.08em",
        }}
      >
        {label}
      </label>

      {isStatus ? (
        <span
          style={{
            padding: "8px 18px",
            borderRadius: "10px",
            fontSize: "15px",
            fontWeight: 800,

            background:
              statusStyle.bg,

            color:
              statusStyle.text,

            width: "fit-content",

            border:
              "1px solid rgba(0,0,0,0.05)",
          }}
        >
          {value || "PENDING"}
        </span>
      ) : (
        <div
          style={{
            fontSize: "18px",

            fontWeight: highlight
              ? 900
              : 700,

            color: highlight
              ? "#0284c7"
              : "#1e293b",

            wordBreak: "break-word",
            lineHeight: "1.4",
          }}
        >
          {value ?? "—"}
        </div>
      )}
    </div>
  );
};

const ApplicantVerificationBlock = ({
  title,
  applicantType,
  data,
  retryingApplicant,
  nowMs,
  onAadhaarRetry,
}) => {
  const status = data || {
    pan_status: "PENDING",
    aadhaar_status: "PENDING",
    bureau_status: "PENDING",

    aadhaar_retry_count: 0,

    aadhaar_initiated_at:
      null,

    retry_available_at: null,

    retry_seconds_remaining:
      0,

    retry_hours_remaining: 0,

    aadhaar_can_retry: false,
  };

  const aadhaarStatus = String(
    status.aadhaar_status ||
    "PENDING",
  )
    .trim()
    .toUpperCase();

  const retryCount = Number(
    status.aadhaar_retry_count ||
    0,
  );

  const maxRetries = 2;

  /*
   * Backend/customer-details controls
   * whether retry is allowed.
   */
  const backendCanRetry =
    status.aadhaar_can_retry ===
    true ||
    Number(
      status.aadhaar_can_retry,
    ) === 1;

  const parseDatabaseDate = (
    value,
  ) => {
    if (!value) {
      return null;
    }

    const directTime =
      new Date(value).getTime();

    if (
      Number.isFinite(directTime)
    ) {
      return directTime;
    }

    const normalizedTime =
      new Date(
        String(value).replace(
          " ",
          "T",
        ),
      ).getTime();

    return Number.isFinite(
      normalizedTime,
    )
      ? normalizedTime
      : null;
  };

  const initiatedAtMs =
    parseDatabaseDate(
      status.aadhaar_initiated_at,
    );

  const backendRetryAvailableAtMs =
    parseDatabaseDate(
      status.retry_available_at,
    );

  const retryAvailableAtMs =
    backendRetryAvailableAtMs ||
    (initiatedAtMs
      ? initiatedAtMs +
      24 * 60 * 60 * 1000
      : null);

  const currentTime = Number(
    nowMs || Date.now(),
  );

  const remainingMilliseconds =
    retryAvailableAtMs
      ? Math.max(
        0,
        retryAvailableAtMs -
        currentTime,
      )
      : Math.max(
        0,

        Number(
          status
            .retry_seconds_remaining ||
          0,
        ) * 1000,
      );

  /*
   * VERIFIED is intentionally excluded.
   */
  const retryableStatus = [
    "PENDING",
    "FAILED",
    "INITIATED",
  ].includes(aadhaarStatus);

  const retryLimitReached =
    retryCount >= maxRetries;

  /*
   * A fresh PENDING row can initiate
   * immediately without waiting.
   */
  const isFirstPendingAttempt =
    aadhaarStatus === "PENDING" &&
    !status.aadhaar_initiated_at &&
    retryCount === 0;

  /*
   * All later attempts follow backend
   * 24-hour permission.
   */
  const canRetryAadhaar =
    retryableStatus &&
    !retryLimitReached &&
    (
      isFirstPendingAttempt ||
      backendCanRetry
    );

  const retryWaitActive =
    retryableStatus &&
    !isFirstPendingAttempt &&
    !retryLimitReached &&
    !canRetryAadhaar;

  const isRetrying =
    retryingApplicant ===
    applicantType;

  /*
   * VERIFIED means no button rendered.
   */
  const showRetryButton =
    retryableStatus;

  const retryButtonDisabled =
    isRetrying ||
    retryLimitReached ||
    !canRetryAadhaar;

  const retriesRemaining =
    Math.max(
      0,
      maxRetries - retryCount,
    );

  const totalRemainingMinutes =
    Math.max(
      0,

      Math.ceil(
        remainingMilliseconds /
        (60 * 1000),
      ),
    );

  const remainingHours =
    Math.floor(
      totalRemainingMinutes / 60,
    );

  const remainingMinutes =
    totalRemainingMinutes % 60;

  const formatRemainingTime =
    () => {
      if (!retryWaitActive) {
        return "";
      }

      if (remainingHours <= 0) {
        return `${Math.max(
          1,
          remainingMinutes,
        )} minute(s)`;
      }

      return (
        `${remainingHours} hour(s) ` +
        `${remainingMinutes} minute(s)`
      );
    };

  const retryButtonText = (() => {
    if (isRetrying) {
      return "Generating Aadhaar link...";
    }

    if (retryLimitReached) {
      return "Aadhaar retry limit reached";
    }

    if (retryWaitActive) {
      return (
        "Retry available in " +
        formatRemainingTime()
      );
    }

    if (isFirstPendingAttempt) {
      return "Initiate Aadhaar";
    }

    return (
      `Retry Aadhaar ` +
      `(${retriesRemaining} left)`
    );
  })();

  return (
    <div
      style={{
        background: "#f8fafc",

        border:
          "1px solid #e2e8f0",

        borderRadius: "18px",
        padding: "24px",
      }}
    >
      <h4
        style={{
          margin:
            "0 0 20px 0",

          fontSize: "18px",
          fontWeight: 900,
          color: "#0f172a",
        }}
      >
        {title}
      </h4>

      <Grid>
        <VerificationField
          label="PAN Status"
          value={status.pan_status}
        />

        <div>
          <VerificationField
            label="Aadhaar Status"
            value={aadhaarStatus}
          />

          {showRetryButton && (
            <button
              type="button"

              disabled={
                retryButtonDisabled
              }

              onClick={() =>
                onAadhaarRetry(
                  applicantType,
                )
              }

              style={{
                marginTop: "12px",
                padding: "9px 16px",

                border: `1px solid ${retryButtonDisabled
                    ? "#cbd5e1"
                    : "#2563eb"
                  }`,

                borderRadius: "8px",

                background:
                  retryButtonDisabled
                    ? "#e2e8f0"
                    : "#ffffff",

                color:
                  retryButtonDisabled
                    ? "#64748b"
                    : "#1d4ed8",

                fontSize: "13px",
                fontWeight: 800,

                cursor:
                  retryButtonDisabled
                    ? "not-allowed"
                    : "pointer",

                opacity:
                  retryButtonDisabled
                    ? 0.8
                    : 1,
              }}
            >
              {retryButtonText}
            </button>
          )}

          {retryWaitActive && (
            <div
              style={{
                marginTop: "10px",
                color: "#92400e",
                fontSize: "12px",
                fontWeight: 700,
                lineHeight: "1.5",
              }}
            >
              Aadhaar retry is locked
              for 24 hours from the
              previous attempt.{" "}

              {formatRemainingTime()}{" "}
              remaining.
            </div>
          )}

          {retryLimitReached &&
            retryableStatus && (
              <div
                style={{
                  marginTop: "10px",
                  color: "#991b1b",
                  fontSize: "12px",
                  fontWeight: 700,
                  lineHeight: "1.5",
                }}
              >
                Maximum two Aadhaar
                retries have been used.
              </div>
            )}
        </div>

        <VerificationField
          label="Bureau Status"
          value={status.bureau_status}
        />
      </Grid>
    </div>
  );
};

const VerificationField = ({
  label,
  value,
}) => {
  const status = String(
    value || "PENDING",
  )
    .trim()
    .toUpperCase();

  const statusColors = {
    VERIFIED: {
      bg: "#dcfce7",
      text: "#166534",
      border: "#bbf7d0",
    },

    FAILED: {
      bg: "#fee2e2",
      text: "#991b1b",
      border: "#fecaca",
    },

    INITIATED: {
      bg: "#dbeafe",
      text: "#1e40af",
      border: "#bfdbfe",
    },

    PENDING: {
      bg: "#fef9c3",
      text: "#854d0e",
      border: "#fde68a",
    },
  };

  const statusStyle =
    statusColors[status] ||
    statusColors.PENDING;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <label
        style={{
          fontSize: "12px",
          color: "#94a3b8",
          fontWeight: 800,

          textTransform:
            "uppercase",

          letterSpacing:
            "0.08em",
        }}
      >
        {label}
      </label>

      <span
        style={{
          padding: "9px 18px",
          borderRadius: "999px",
          fontSize: "14px",
          fontWeight: 900,

          background:
            statusStyle.bg,

          color:
            statusStyle.text,

          border:
            `1px solid ` +
            statusStyle.border,

          width: "fit-content",
        }}
      >
        {status}
      </span>
    </div>
  );
};

const FlagField = ({
  label,
  value,
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    }}
  >
    <label
      style={{
        fontSize: "12px",
        color: "#94a3b8",
        fontWeight: 800,

        textTransform:
          "uppercase",

        letterSpacing:
          "0.08em",
      }}
    >
      {label}
    </label>

    <div
      style={{
        fontSize: "16px",
        fontWeight: 800,
      }}
    >
      {value === 1 ||
        value === "Y" ? (
        <span
          style={{
            color: "#dc2626",
            background: "#fef2f2",
            padding: "4px 10px",
            borderRadius: "6px",
          }}
        >
          ● Yes
        </span>
      ) : value === 0 ||
        value === "N" ? (
        <span
          style={{
            color: "#16a34a",
            background: "#f0fdf4",
            padding: "4px 10px",
            borderRadius: "6px",
          }}
        >
          ○ No
        </span>
      ) : (
        <span
          style={{
            color: "#cbd5e1",
          }}
        >
          N/A
        </span>
      )}
    </div>
  </div>
);

export default MotionCorpUpdateData;