import React, { useEffect, useState } from "react";
import {  Navigate, useNavigate, useParams, } from "react-router-dom";
import api from "../../api/api";

const EMPTY_BANK_FORM = {
  bank_name: "",
  name_in_bank: "",
  account_number: "",
  ifsc: "",
  bank_branch: "",
};

const EMPTY_EMAIL_FORM = {
  email: "",
};

const EMPTY_INSURANCE_FORM = {
  insurance_card_company: "",
  policy_number: "",
  policy_holder_name: "",
  patient_name: "",
  father_name: "",
  mother_name: "",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hasValue = (value) =>
  value !== null &&
  value !== undefined &&
  String(value).trim() !== "";

const firstAvailableValue = (...values) =>
  values.find((value) => hasValue(value)) ?? "";

const hasStoredInsuranceDetails = (
  insurance = {},
) => {
  const oldInsuranceCost = Number(
    insurance.insurance_cost,
  );

  return Boolean(
    [
      insurance.insurance_card_company,
      insurance.insurance_company,
      insurance.insurance_provider,
      insurance.policy_number,
      insurance.policy_holder_name,
      insurance.patient_name,
      insurance.father_name,
      insurance.fathers_name,
      insurance.mother_name,
      insurance.mothers_name,
      insurance.policy_issued_date,
      insurance.period_of_insurance,
    ].some(hasValue) ||
    (
      hasValue(insurance.insurance_cost) &&
      Number.isFinite(oldInsuranceCost) &&
      oldInsuranceCost > 0
    ),
  );
};

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const toDateInputValue = (value) => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
};

const formatAmount = (value) => {
  if (!hasValue(value)) return "—";

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return `₹${value}`;
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
};

const getStatusClass = (value) => {
  const status = String(
    value || "PENDING",
  ).toUpperCase();

  if (
    [
      "APPROVED",
      "VERIFIED",
      "SUCCESS",
      "COMPLETED",
    ].includes(status)
  ) {
    return "status status-success";
  }

  if (
    ["REJECTED", "FAILED"].includes(
      status,
    )
  ) {
    return "status status-danger";
  }

  if (
    [
      "INITIATED",
      "MANDATE_CREATED",
    ].includes(status)
  ) {
    return "status status-info";
  }

  if (status === "PENDING") {
    return "status status-warning";
  }

  return "status status-neutral";
};

function SectionCard({
  title,
  icon,
  action,
  children,
}) {
  return (
    <section className="section-card">
      <div className="section-heading">
        <div className="section-title-wrap">
          <span className="section-icon">
            {icon}
          </span>

          <h2 className="section-title">
            {title}
          </h2>
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}

function Field({
  label,
  value,
  highlight = false,
  isStatus = false,
  onUpdate,
  updateDisabled = false,
  updateText = "Update",
}) {
  return (
    <div className="field">
      <div className="field-heading">
        <span className="field-label">
          {label}
        </span>

        {onUpdate && (
          <button
            type="button"
            className={
              updateDisabled
                ? "mini-button mini-button-success"
                : "mini-button"
            }
            onClick={onUpdate}
            disabled={updateDisabled}
          >
            {updateText}
          </button>
        )}
      </div>

      {isStatus ? (
        <span
          className={getStatusClass(value)}
        >
          {String(
            value || "PENDING",
          ).toUpperCase()}
        </span>
      ) : (
        <span
          className={
            highlight
              ? "field-value field-value-highlight"
              : "field-value"
          }
        >
          {hasValue(value) ? value : "—"}
        </span>
      )}
    </div>
  );
}

function ExternalLinkField({
  label,
  url,
}) {
  const [copied, setCopied] =
    useState(false);

  const copyLink = async () => {
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
      }, 1500);
    } catch (error) {
      console.error(
        "Failed to copy link:",
        error,
      );

      alert(
        "Failed to copy the link.",
      );
    }
  };

  return (
    <div className="link-field">
      <span className="field-label">
        {label}
      </span>

      {url ? (
        <div className="link-actions">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="open-link"
          >
            Open Link ↗
          </a>

          <button
            type="button"
            className={
              copied
                ? "copy-button copy-button-success"
                : "copy-button"
            }
            onClick={copyLink}
          >
            {copied
              ? "✓ Copied"
              : "Copy Link"}
          </button>
        </div>
      ) : (
        <span className="not-available">
          Not Available
        </span>
      )}
    </div>
  );
}

function FormInput({
  label,
  name,
  value,
  onChange,
  disabled,
  required = true,
  ...props
}) {
  return (
    <label className="form-control">
      <span className="form-label">
        {label}

        {required && (
          <span className="required">
            {" "}
            *
          </span>
        )}
      </span>

      <input
        {...props}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        className="form-input"
      />
    </label>
  );
}

function Modal({
  open,
  title,
  saving,
  onClose,
  children,
}) {
  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget &&
          !saving
        ) {
          onClose();
        }
      }}
    >
      <div className="modal-card">
        <div className="modal-heading">
          <h2>{title}</h2>

          <button
            type="button"
            className="modal-close"
            disabled={saving}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function PrimaryButton({
  children,
  type = "button",
  disabled = false,
  success = false,
  onClick,
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={
        success
          ? "primary-button success-button"
          : "primary-button"
      }
    >
      {children}
    </button>
  );
}

const ClayyoUpdateData = () => {
  const { lan } = useParams();
  const navigate = useNavigate();

  const [details, setDetails] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    bankModalOpen,
    setBankModalOpen,
  ] = useState(false);

  const [bankForm, setBankForm] =
    useState(EMPTY_BANK_FORM);

  const [bankSaving, setBankSaving] =
    useState(false);

  const [bankMessage, setBankMessage] =
    useState("");

  const [
    emailModalOpen,
    setEmailModalOpen,
  ] = useState(false);

  const [emailForm, setEmailForm] =
    useState(EMPTY_EMAIL_FORM);

  const [emailSaving, setEmailSaving] =
    useState(false);

  const [emailMessage, setEmailMessage] =
    useState("");

  const [
    insuranceForm,
    setInsuranceForm,
  ] = useState(EMPTY_INSURANCE_FORM);

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

  const fetchDetails = async () => {
    if (!lan) {
      setErrorMessage(
        "LAN is missing.",
      );

      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const [
        loanResponse,
        hospitalResponse,
      ] = await Promise.all([
        api.get(
          `/clayyo-loans/loan-info/${encodeURIComponent(
            lan,
          )}`,
        ),

        api
          .get(
            "/clayyo-loans/hospitals-list",
          )
          .catch((error) => {
            console.warn(
              "Clayyo hospital list fetch failed:",
              error,
            );

            return {
              data: [],
            };
          }),
      ]);

      const responseData =
        loanResponse.data;

      const loanData =
        responseData?.loan || {};

      const hospitalResponseData =
        hospitalResponse?.data;

      const hospitalList =
        Array.isArray(hospitalResponseData)
          ? hospitalResponseData
          : Array.isArray(
            hospitalResponseData?.hospitals,
          )
            ? hospitalResponseData.hospitals
            : Array.isArray(
              hospitalResponseData?.data,
            )
              ? hospitalResponseData.data
              : [];

      const selectedHospitalId =
        loanData.hospital_id ??
        loanData.hospitalId ??
        loanData.hospital_code ??
        "";

      const selectedHospital =
        hospitalList.find((hospital) => {
          const hospitalId =
            hospital.id ??
            hospital.hospital_id ??
            hospital.hospitalId ??
            hospital.hospital_code ??
            "";

          return (
            String(hospitalId) ===
            String(selectedHospitalId)
          );
        });

      const hospitalName =
        firstAvailableValue(
          loanData.hospital_name,
          loanData.hospitalName,
          loanData.hospital,
          selectedHospital?.hospital_name,
          selectedHospital?.hospitalName,
          selectedHospital?.name,
        );

      const normalizedLoanData = {
        ...loanData,
        hospital_name: hospitalName,
      };

      const insuranceDetails =
        normalizedLoanData.insurance_details ||
        normalizedLoanData.insuranceDetails ||
        {};

      setDetails({
        ...responseData,
        hospitals: hospitalList,
        loan: normalizedLoanData,
      });

      setBankForm({
        bank_name:
          normalizedLoanData.bank_name ||
          "",

        name_in_bank:
          normalizedLoanData.name_in_bank ||
          "",

        account_number:
          normalizedLoanData.account_number ||
          "",

        ifsc:
          normalizedLoanData.ifsc ||
          "",

        bank_branch:
          normalizedLoanData.bank_branch ||
          "",
      });

      setEmailForm({
        email:
          normalizedLoanData.email_id ||
          "",
      });

      setInsuranceForm({
        insurance_card_company:
          firstAvailableValue(
            insuranceDetails
              .insurance_card_company,

            insuranceDetails
              .insuranceCardCompany,

            insuranceDetails
              .insurance_company,

            insuranceDetails
              .insuranceCompany,

            insuranceDetails
              .insurance_provider,

            normalizedLoanData
              .insurance_card_company,

            normalizedLoanData
              .insuranceCardCompany,

            normalizedLoanData
              .insurance_company,

            normalizedLoanData
              .insuranceCompany,

            normalizedLoanData
              .insurance_provider,
          ),

        policy_number:
          firstAvailableValue(
            insuranceDetails.policy_number,
            insuranceDetails.policyNumber,
            normalizedLoanData.policy_number,
            normalizedLoanData.policyNumber,
          ),

        policy_holder_name:
          firstAvailableValue(
            insuranceDetails
              .policy_holder_name,

            insuranceDetails
              .policyHolderName,

            normalizedLoanData
              .policy_holder_name,

            normalizedLoanData
              .policyHolderName,
          ),

        patient_name:
          firstAvailableValue(
            insuranceDetails.patient_name,
            insuranceDetails.patientName,
            normalizedLoanData.patient_name,
            normalizedLoanData.patientName,
          ),

        father_name:
          firstAvailableValue(
            insuranceDetails.father_name,
            insuranceDetails.fatherName,
            insuranceDetails.fathers_name,
            normalizedLoanData.father_name,
            normalizedLoanData.fatherName,
            normalizedLoanData.fathers_name,
          ),

        mother_name:
          firstAvailableValue(
            insuranceDetails.mother_name,
            insuranceDetails.motherName,
            insuranceDetails.mothers_name,
            normalizedLoanData.mother_name,
            normalizedLoanData.motherName,
            normalizedLoanData.mothers_name,
          ),
      });

      setInsuranceSubmitted(
        Boolean(
          insuranceDetails.submitted ||
          insuranceDetails
            .update_disabled,
        ),
      );
    } catch (error) {
      console.error(
        "Clayyo details fetch failed:",
        error,
      );

      setErrorMessage(
        error.response?.data?.message ||
        "Failed to fetch Clayyo loan details.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lan]);

  const handleBankChange = (
    event,
  ) => {
    const { name, value } =
      event.target;

    setBankForm((previous) => ({
      ...previous,

      [name]:
        name === "ifsc"
          ? value.toUpperCase()
          : value,
    }));

    setBankMessage("");
  };

  const handleBankSubmit = async (
    event,
  ) => {
    event.preventDefault();

    try {
      setBankSaving(true);
      setBankMessage("");

      const response =
        await api.patch(
          `/clayyo-loans/bank-details/${encodeURIComponent(
            lan,
          )}`,

          bankForm,
        );

      const savedBank =
        response.data?.bank_details ||
        bankForm;

      setDetails((previous) => ({
        ...previous,

        loan: {
          ...previous.loan,
          ...savedBank,

          update_status: {
            ...previous.loan
              .update_status,

            bank_details_updated_once:
              true,

            bank_details_updated_at:
              new Date().toISOString(),
          },
        },
      }));

      setBankForm({
        bank_name:
          savedBank.bank_name || "",

        name_in_bank:
          savedBank.name_in_bank || "",

        account_number:
          savedBank.account_number ||
          "",

        ifsc:
          savedBank.ifsc || "",

        bank_branch:
          savedBank.bank_branch || "",
      });

      setBankMessage(
        response.data?.message ||
        "Bank details updated successfully.",
      );

      window.setTimeout(() => {
        setBankModalOpen(false);
      }, 800);
    } catch (error) {
      console.error(
        "Clayyo bank update failed:",
        error,
      );

      setBankMessage(
        error.response?.data?.message ||
        "Failed to update bank details.",
      );
    } finally {
      setBankSaving(false);
    }
  };

  const handleEmailChange = (
    event,
  ) => {
    setEmailForm({
      email: event.target.value,
    });

    setEmailMessage("");
  };

  const handleEmailSubmit = async (
    event,
  ) => {
    event.preventDefault();

    const normalizedEmail = String(
      emailForm.email || "",
    )
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      setEmailMessage(
        "Applicant email is required.",
      );

      return;
    }

    if (
      normalizedEmail.length > 150 ||
      !EMAIL_REGEX.test(
        normalizedEmail,
      )
    ) {
      setEmailMessage(
        "Please enter a valid email address.",
      );

      return;
    }

    try {
      setEmailSaving(true);
      setEmailMessage("");

      const response =
        await api.patch(
          `/clayyo-loans/applicant-email/${encodeURIComponent(
            lan,
          )}`,

          {
            email:
              normalizedEmail,
          },
        );

      const savedEmail =
        response.data?.email ||
        normalizedEmail;

      setDetails((previous) => ({
        ...previous,

        loan: {
          ...previous.loan,

          email_id:
            savedEmail,

          update_status: {
            ...previous.loan
              .update_status,

            applicant_email_updated_once:
              true,

            applicant_email_updated_at:
              response.data
                ?.update_status
                ?.applicant_email_updated_at ||
              new Date().toISOString(),
          },
        },
      }));

      setEmailForm({
        email:
          savedEmail,
      });

      setEmailMessage(
        response.data?.message ||
        "Applicant email updated successfully.",
      );

      window.setTimeout(() => {
        setEmailModalOpen(false);
      }, 800);
    } catch (error) {
      console.error(
        "Clayyo applicant email update failed:",
        error,
      );

      setEmailMessage(
        error.response?.data?.message ||
        "Failed to update applicant email.",
      );
    } finally {
      setEmailSaving(false);
    }
  };

  const handleInsuranceChange = (
    event,
  ) => {
    const { name, value } =
      event.target;

    setInsuranceForm(
      (previous) => ({
        ...previous,
        [name]: value,
      }),
    );

    setInsuranceMessage("");
  };

  const handleInsuranceSubmit =
    async (event) => {
      event.preventDefault();

      const currentInsurance =
        details?.loan?.insurance_details ||
        details?.loan?.insuranceDetails ||
        {};

      const insuranceLockedNow =
        Boolean(
          insuranceSubmitted ||
          currentInsurance
            .update_disabled ||
          currentInsurance.submitted ||
          hasStoredInsuranceDetails(
            currentInsurance,
          ),
        );

      if (insuranceLockedNow) {
        setInsuranceMessage(
          "Insurance details are already available and cannot be updated.",
        );

        return;
      }

      const payload = {
        insurance_card_company:
          String(
            insuranceForm
              .insurance_card_company ||
            "",
          ).trim(),

        policy_number:
          String(
            insuranceForm.policy_number ||
            "",
          ).trim(),

        policy_holder_name:
          String(
            insuranceForm
              .policy_holder_name ||
            "",
          ).trim(),

        patient_name:
          String(
            insuranceForm.patient_name ||
            "",
          ).trim(),

        father_name:
          String(
            insuranceForm.father_name ||
            "",
          ).trim(),

        mother_name:
          String(
            insuranceForm.mother_name ||
            "",
          ).trim(),
      };

      const requiredFields = [
        {
          key: "insurance_card_company",
          label:
            "Insurance card / company",
        },
        {
          key: "policy_number",
          label: "Policy number",
        },
        {
          key: "policy_holder_name",
          label: "Policy holder name",
        },
      ];

      const missingField =
        requiredFields.find(
          ({ key }) =>
            !hasValue(payload[key]),
        );

      if (missingField) {
        setInsuranceMessage(
          `${missingField.label} is required.`,
        );

        return;
      }

      try {
        setInsuranceSaving(true);
        setInsuranceMessage("");

        const response =
          await api.patch(
            `/clayyo-loans/insurance/${encodeURIComponent(
              lan,
            )}`,

            payload,
          );

        const responseInsurance =
          response.data
            ?.insurance_details ||
          response.data?.insurance ||
          {};

        const savedInsurance = {
          ...payload,
          ...responseInsurance,
          submitted: true,
        };

        setDetails((previous) => ({
          ...previous,

          loan: {
            ...previous.loan,

            patient_name:
              savedInsurance.patient_name,

            father_name:
              savedInsurance.father_name,

            mother_name:
              savedInsurance.mother_name,

            insurance_details:
              savedInsurance,
          },
        }));

        setInsuranceForm({
          insurance_card_company:
            firstAvailableValue(
              savedInsurance
                .insurance_card_company,

              savedInsurance
                .insuranceCardCompany,

              savedInsurance
                .insurance_company,

              savedInsurance
                .insurance_provider,
            ),

          policy_number:
            firstAvailableValue(
              savedInsurance.policy_number,
              savedInsurance.policyNumber,
            ),

          policy_holder_name:
            firstAvailableValue(
              savedInsurance
                .policy_holder_name,

              savedInsurance
                .policyHolderName,
            ),

          patient_name:
            firstAvailableValue(
              savedInsurance.patient_name,
              savedInsurance.patientName,
            ),

          father_name:
            firstAvailableValue(
              savedInsurance.father_name,
              savedInsurance.fatherName,
              savedInsurance.fathers_name,
            ),

          mother_name:
            firstAvailableValue(
              savedInsurance.mother_name,
              savedInsurance.motherName,
              savedInsurance.mothers_name,
            ),
        });

        setInsuranceSubmitted(true);

        setInsuranceMessage(
          response.data?.message ||
          "Insurance details submitted successfully.",
        );
      } catch (error) {
        console.error(
          "Clayyo insurance submission failed:",
          error,
        );

        setInsuranceMessage(
          error.response?.data?.message ||
          "Failed to submit insurance details.",
        );
      } finally {
        setInsuranceSaving(false);
      }
    };

  if (loading) {
    return (
      <div className="page-state">
        <div className="spinner" />

        <style>{PAGE_CSS}</style>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <>
        <style>{PAGE_CSS}</style>

        <div className="page-error">
          {errorMessage}
        </div>
      </>
    );
  }

  if (!details?.loan) {
    return (
      <>
        <style>{PAGE_CSS}</style>

        <div className="page-error">
          No Clayyo loan details
          found.
        </div>
      </>
    );
  }

  const { loan, kyc = {} } =
    details;

  const bankAlreadyUpdated =
    Boolean(
      loan.update_status
        ?.bank_details_updated_once,
    );

  const applicantEmailAlreadyUpdated =
    Boolean(
      loan.update_status
        ?.applicant_email_updated_once,
    );

  const insuranceDetails =
    loan.insurance_details || {};

  const insuranceCostNumber = Number(
    insuranceDetails.insurance_cost,
  );

  const insuranceCostAlreadyPresent =
    hasValue(
      insuranceDetails.insurance_cost,
    ) &&
    Number.isFinite(
      insuranceCostNumber,
    ) &&
    insuranceCostNumber > 0;

  const insuranceLocked = Boolean(
    insuranceSubmitted ||
    insuranceDetails.update_disabled ||
    insuranceDetails.submitted ||
    insuranceCostAlreadyPresent
  );

  return (
    <div className="clayyo-page">
      <style>{PAGE_CSS}</style>

      <div className="page-container">
        <div className="page-header">
          <button
            type="button"
            className="back-button"
            onClick={() =>
              navigate(-1)
            }
          >
            ← Back
          </button>

          <div className="page-heading">
            <span>
              Clayyo Loan Profile
            </span>

            <h1>
              {loan.customer_name ||
                loan.lan}
            </h1>
          </div>
        </div>

        <div className="section-list">
          <SectionCard
            title="Applicant Information"
            icon="👤"
          >
            <div className="field-grid">
              <Field
                label="LAN"
                value={loan.lan}
                highlight
              />

              <Field
                label="Application ID"
                value={loan.app_id}
              />

              <Field
                label="Login Date"
                value={formatDate(
                  loan.login_date,
                )}
              />

              <Field
                label="Customer Name"
                value={
                  loan.customer_name
                }
              />

              <Field
                label="Patient Name"
                value={
                  loan.patient_name
                }
              />

              <Field
                label="Mobile Number"
                value={
                  loan.mobile_number
                }
              />

              <Field
                label="Applicant Email"
                value={loan.email_id}
                onUpdate={() => {
                  setEmailForm({
                    email:
                      loan.email_id ||
                      "",
                  });

                  setEmailMessage("");

                  setEmailModalOpen(
                    true,
                  );
                }}
                updateDisabled={
                  applicantEmailAlreadyUpdated
                }
                updateText={
                  applicantEmailAlreadyUpdated
                    ? "✓ Updated"
                    : "Update Email"
                }
              />

              <Field
                label="Email Updated At"
                value={formatDate(
                  loan.update_status
                    ?.applicant_email_updated_at,
                )}
              />

              <Field
                label="PAN Number"
                value={
                  loan.pan_number
                }
              />

              <Field
                label="Date of Birth"
                value={formatDate(
                  loan.dob,
                )}
              />

              <Field
                label="Gender"
                value={loan.gender}
              />

              <Field
                label="Status"
                value={loan.status}
                isStatus
              />

              <Field
                label="Stage"
                value={loan.stage}
                isStatus
              />

              <Field
                label="Disbursed At"
                value={formatDate(
                  loan.disbursed_at,
                )}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Loan & Financials"
            icon="💰"
          >
            <div className="field-grid">
              <Field
                label="Loan Amount"
                value={formatAmount(
                  loan.loan_amount,
                )}
                highlight
              />

              <Field
                label="Final Limit"
                value={formatAmount(
                  loan.final_limit,
                )}
              />

              <Field
                label="Approved Limit"
                value={formatAmount(
                  loan.approved_limit,
                )}
              />

              <Field
                label="Interest Rate"
                value={
                  hasValue(
                    loan.interest_rate,
                  )
                    ? `${loan.interest_rate}%`
                    : "—"
                }
              />

              <Field
                label="Loan Tenure"
                value={
                  hasValue(
                    loan.loan_tenure,
                  )
                    ? `${loan.loan_tenure} Months`
                    : "—"
                }
              />

              <Field
                label="EMI Amount"
                value={formatAmount(
                  loan.emi_amount,
                )}
              />

              <Field
                label="CIBIL Score"
                value={
                  loan.cibil_score
                }
              />

              <Field
                label="Policy Type"
                value={
                  loan.policy_type
                }
              />

              <Field
                label="Employment Type"
                value={
                  loan.employment_type
                }
              />

              <Field
                label="Net Monthly Income"
                value={formatAmount(
                  loan.net_monthly_income,
                )}
              />

              <Field
                label="Processing Fee"
                value={
                  hasValue(
                    loan.pf_percent,
                  )
                    ? `${loan.pf_percent}%`
                    : "—"
                }
              />

              <Field
                label="Subvention"
                value={
                  hasValue(
                    loan.subvention_percent,
                  )
                    ? `${loan.subvention_percent}%`
                    : "—"
                }
              />

              <Field
                label="Updated Subvention"
                value={
                  hasValue(
                    loan.updated_subvention,
                  )
                    ? `${loan.updated_subvention}%`
                    : "—"
                }
              />

              <Field
                label="Hospital"
                value={
                  loan.hospital_name
                }
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Bank Details"
            icon="🏦"
            action={
              <PrimaryButton
                disabled={
                  bankAlreadyUpdated
                }
                success={
                  bankAlreadyUpdated
                }
                onClick={() => {
                  setBankForm({
                    bank_name:
                      loan.bank_name ||
                      "",

                    name_in_bank:
                      loan.name_in_bank ||
                      "",

                    account_number:
                      loan.account_number ||
                      "",

                    ifsc:
                      loan.ifsc || "",

                    bank_branch:
                      loan.bank_branch ||
                      "",
                  });

                  setBankMessage("");

                  setBankModalOpen(
                    true,
                  );
                }}
              >
                {bankAlreadyUpdated
                  ? "✓ Bank Details Updated"
                  : "Update Bank Details"}
              </PrimaryButton>
            }
          >
            <div className="field-grid">
              <Field
                label="Bank Name"
                value={loan.bank_name}
              />

              <Field
                label="Account Holder Name"
                value={
                  loan.name_in_bank
                }
              />

              <Field
                label="Account Number"
                value={
                  loan.account_number
                }
              />

              <Field
                label="IFSC Code"
                value={loan.ifsc}
              />

              <Field
                label="Bank Branch"
                value={
                  loan.bank_branch
                }
              />

              <Field
                label="Bank Status"
                value={
                  kyc.bank_status
                }
                isStatus
              />

              <Field
                label="Bank Updated At"
                value={formatDate(
                  loan.update_status
                    ?.bank_details_updated_at,
                )}
              />
            </div>

            {bankAlreadyUpdated && (
              <div className="success-note">
                ✓ Bank details were
                updated once. A second
                update is not allowed.
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Address Details"
            icon="📍"
          >
            <div className="field-grid">
              <Field
                label="Current Address"
                value={
                  loan.current_address
                }
              />

              <Field
                label="Current City"
                value={
                  loan.current_village_city
                }
              />

              <Field
                label="Current District"
                value={
                  loan.current_district
                }
              />

              <Field
                label="Current State"
                value={
                  loan.current_state
                }
              />

              <Field
                label="Current Pincode"
                value={
                  loan.current_pincode
                }
              />

              <Field
                label="Permanent Address"
                value={
                  loan.permanent_address
                }
              />

              <Field
                label="Permanent City"
                value={
                  loan.permanent_village_city
                }
              />

              <Field
                label="Permanent District"
                value={
                  loan.permanent_district
                }
              />

              <Field
                label="Permanent State"
                value={
                  loan.permanent_state
                }
              />

              <Field
                label="Permanent Pincode"
                value={
                  loan.permanent_pincode
                }
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Verification Status"
            icon="✅"
          >
            <div className="field-grid">
              <Field
                label="PAN Status"
                value={kyc.pan_status}
                isStatus
              />

              <Field
                label="Aadhaar Status"
                value={
                  kyc.aadhaar_status
                }
                isStatus
              />

              <Field
                label="Bureau Status"
                value={
                  kyc.bureau_status
                }
                isStatus
              />

              <Field
                label="Agreement E-Sign"
                value={
                  kyc.agreement_esign_status
                }
                isStatus
              />

              <Field
                label="Bank Verification"
                value={
                  kyc.bank_status
                }
                isStatus
              />

              <Field
                label="BRE Status"
                value={
                  loan.clayyo_bre_status
                }
                isStatus
              />

              <Field
                label="BRE Reason"
                value={
                  loan.clayyo_bre_reason
                }
              />

              <Field
                label="BRE Checked At"
                value={formatDate(
                  loan.clayyo_bre_checked_at,
                )}
              />

              <Field
                label="Bureau Score"
                value={
                  loan.clayyo_bureau_score
                }
              />

              <Field
                label="Enquiries in 30 Days"
                value={
                  loan.clayyo_enquiries_30d
                }
              />

              <Field
                label="DPD 3 Month Flag"
                value={
                  loan.clayyo_dpd_3m_flag
                }
              />

              <Field
                label="DPD 12 Month Count"
                value={
                  loan.clayyo_dpd_12m_count
                }
              />

              <Field
                label="DPD 24 Month 60+ Flag"
                value={
                  loan.clayyo_dpd_24m_60_flag
                }
              />

              <Field
                label="DPD 36 Month 90+ Flag"
                value={
                  loan.clayyo_dpd_36m_90_flag
                }
              />

              <Field
                label="Overdue Flag"
                value={
                  loan.clayyo_overdue_flag
                }
              />

              <Field
                label="Written-Off Flag"
                value={
                  loan.clayyo_writtenoff_flag
                }
              />

              <Field
                label="Moratorium Flag"
                value={
                  loan.clayyo_moratorium_flag
                }
              />

              <Field
                label="Restructured Flag"
                value={
                  loan.clayyo_restructured_flag
                }
              />
            </div>
          </SectionCard>

          <SectionCard
            title="KYC, NACH & INSURANCE"
            icon="🛡️"
          >
            <div className="kyc-link-grid">
              <ExternalLinkField
                label="Borrower Aadhaar"
                url={
                  loan.verification_links
                    ?.borrower_aadhaar_url
                }
              />

              <ExternalLinkField
                label="Agreement Link"
                url={
                  loan.verification_links
                    ?.agreement_url ||
                  null
                }
              />

              <ExternalLinkField
                label="NACH Authentication Link"
                url={
                  loan.nach_details
                    ?.auth_url
                }
              />

              <Field
                label="NACH UMRN"
                value={
                  loan.nach_details?.umrn ||
                  "Not Available"
                }
                highlight={Boolean(
                  loan.nach_details?.umrn,
                )}
              />
            </div>

            <div className="section-divider" />

            <h3 className="insurance-title">
              <span className="insurance-title-icon">
                💳
              </span>

              Insurance Details
            </h3>

            <form
              onSubmit={
                handleInsuranceSubmit
              }
            >
              <div className="insurance-grid">
                <div className="insurance-input-card">
                  <FormInput
                    label="Insurance Card / Company"
                    name="insurance_card_company"
                    value={
                      insuranceForm
                        .insurance_card_company
                    }
                    onChange={
                      handleInsuranceChange
                    }
                    disabled={
                      insuranceSaving ||
                      insuranceLocked
                    }
                    placeholder="Enter insurance card or company"
                    maxLength={150}
                  />
                </div>

                <div className="insurance-input-card">
                  <FormInput
                    label="Policy Number"
                    name="policy_number"
                    value={
                      insuranceForm.policy_number
                    }
                    onChange={
                      handleInsuranceChange
                    }
                    disabled={
                      insuranceSaving ||
                      insuranceLocked
                    }
                    placeholder="Enter policy number"
                    maxLength={100}
                  />
                </div>

                <div className="insurance-input-card">
                  <FormInput
                    label="Policy Holder Name"
                    name="policy_holder_name"
                    value={
                      insuranceForm
                        .policy_holder_name
                    }
                    onChange={
                      handleInsuranceChange
                    }
                    disabled={
                      insuranceSaving ||
                      insuranceLocked
                    }
                    placeholder="Enter policy holder name"
                    maxLength={150}
                  />
                </div>

              </div>

              {insuranceMessage && (
                <div
                  className={
                    insuranceLocked
                      ? "form-message form-message-success"
                      : "form-message form-message-error"
                  }
                >
                  {insuranceMessage}
                </div>
              )}

              <div className="insurance-action">
                {insuranceLocked ? (
                  <PrimaryButton
                    disabled
                    success
                  >
                    ✓ Insurance Details Available
                  </PrimaryButton>
                ) : (
                  <PrimaryButton
                    type="submit"
                    disabled={
                      insuranceSaving
                    }
                  >
                    {insuranceSaving
                      ? "Submitting..."
                      : "Submit Insurance Details"}
                  </PrimaryButton>
                )}
              </div>
            </form>



            {/* <form
              onSubmit={
                handleInsuranceSubmit
              }
            >
              <div className="insurance-grid">
                <div className="insurance-input-card">
                  <FormInput
                    label="Insurance Cost"
                    name="insurance_cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      insuranceForm.insurance_cost
                    }
                    onChange={
                      handleInsuranceChange
                    }
                    disabled={
                      insuranceSaving ||
                      insuranceLocked
                    }
                  />
                </div>

                <div className="insurance-input-card">
                  <FormInput
                    label="Insurance Provider"
                    name="insurance_provider"
                    value={
                      insuranceForm.insurance_provider
                    }
                    onChange={
                      handleInsuranceChange
                    }
                    disabled={
                      insuranceSaving ||
                      insuranceLocked
                    }
                    placeholder="Enter provider name"
                    maxLength={150}
                  />
                </div>

                <div className="insurance-input-card">
                  <FormInput
                    label="Policy Number"
                    name="policy_number"
                    value={
                      insuranceForm.policy_number
                    }
                    onChange={
                      handleInsuranceChange
                    }
                    disabled={
                      insuranceSaving ||
                      insuranceLocked
                    }
                    placeholder="Enter policy number"
                    maxLength={100}
                  />
                </div>

                <div className="insurance-input-card">
                  <FormInput
                    label="Policy Issued Date"
                    name="policy_issued_date"
                    type="date"
                    value={
                      insuranceForm.policy_issued_date
                    }
                    onChange={
                      handleInsuranceChange
                    }
                    disabled={
                      insuranceSaving ||
                      insuranceLocked
                    }
                  />
                </div>

                <div className="insurance-input-card">
                  <FormInput
                    label="Period of Insurance"
                    name="period_of_insurance"
                    value={
                      insuranceForm.period_of_insurance
                    }
                    onChange={
                      handleInsuranceChange
                    }
                    disabled={
                      insuranceSaving ||
                      insuranceLocked
                    }
                    placeholder="Example: 12 months"
                    maxLength={100}
                  />
                </div>
              </div>

              {insuranceMessage && (
                <div
                  className={
                    insuranceLocked
                      ? "form-message form-message-success"
                      : "form-message form-message-error"
                  }
                >
                  {insuranceMessage}
                </div>
              )}

              <div className="insurance-action">
                {insuranceLocked ? (
                  <PrimaryButton
                    disabled
                    success
                  >
                    ✓ Insurance Details
                    Available
                  </PrimaryButton>
                ) : (
                  <PrimaryButton
                    type="submit"
                    disabled={
                      insuranceSaving
                    }
                  >
                    {insuranceSaving
                      ? "Submitting..."
                      : "Submit Insurance Details"}
                  </PrimaryButton>
                )}
              </div>
            </form> */}
          </SectionCard>
        </div>
      </div>

      <Modal
        open={bankModalOpen}
        title="Update Bank Details"
        saving={bankSaving}
        onClose={() => {
          if (!bankSaving) {
            setBankModalOpen(false);
            setBankMessage("");
          }
        }}
      >
        <form
          onSubmit={handleBankSubmit}
        >
          <div className="modal-form-grid">
            <FormInput
              label="Bank Name"
              name="bank_name"
              value={
                bankForm.bank_name
              }
              onChange={
                handleBankChange
              }
              disabled={bankSaving}
              maxLength={150}
            />

            <FormInput
              label="Account Holder Name"
              name="name_in_bank"
              value={
                bankForm.name_in_bank
              }
              onChange={
                handleBankChange
              }
              disabled={bankSaving}
              maxLength={150}
            />

            <FormInput
              label="Account Number"
              name="account_number"
              value={
                bankForm.account_number
              }
              onChange={
                handleBankChange
              }
              disabled={bankSaving}
              inputMode="numeric"
              maxLength={40}
            />

            <FormInput
              label="IFSC Code"
              name="ifsc"
              value={bankForm.ifsc}
              onChange={
                handleBankChange
              }
              disabled={bankSaving}
              maxLength={20}
            />

            <FormInput
              label="Bank Branch"
              name="bank_branch"
              value={
                bankForm.bank_branch
              }
              onChange={
                handleBankChange
              }
              disabled={bankSaving}
              required={false}
              maxLength={150}
            />
          </div>

          <div className="warning-note">
            Bank details can be updated
            only once. Verify everything
            before submitting.
          </div>

          {bankMessage && (
            <div
              className={
                bankMessage
                  .toLowerCase()
                  .includes("success")
                  ? "modal-message success-text"
                  : "modal-message error-text"
              }
            >
              {bankMessage}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={bankSaving}
              onClick={() => {
                setBankModalOpen(
                  false,
                );

                setBankMessage("");
              }}
            >
              Cancel
            </button>

            <PrimaryButton
              type="submit"
              disabled={bankSaving}
            >
              {bankSaving
                ? "Updating..."
                : "Update Bank Details"}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal
        open={emailModalOpen}
        title="Update Applicant Email"
        saving={emailSaving}
        onClose={() => {
          if (!emailSaving) {
            setEmailModalOpen(false);
            setEmailMessage("");

            setEmailForm({
              email:
                loan.email_id || "",
            });
          }
        }}
      >
        <form
          onSubmit={handleEmailSubmit}
        >
          <FormInput
            label="Applicant Email"
            name="email"
            type="email"
            value={emailForm.email}
            onChange={
              handleEmailChange
            }
            disabled={emailSaving}
            placeholder="Enter applicant email"
            maxLength={150}
          />

          <div className="warning-note">
            The applicant email can be
            updated only once. Please
            verify the email address
            before submitting.
          </div>

          {emailMessage && (
            <div
              className={
                emailMessage
                  .toLowerCase()
                  .includes("success")
                  ? "modal-message success-text"
                  : "modal-message error-text"
              }
            >
              {emailMessage}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={emailSaving}
              onClick={() => {
                setEmailModalOpen(
                  false,
                );

                setEmailMessage("");

                setEmailForm({
                  email:
                    loan.email_id ||
                    "",
                });
              }}
            >
              Cancel
            </button>

            <PrimaryButton
              type="submit"
              disabled={
                emailSaving ||
                applicantEmailAlreadyUpdated
              }
              success={
                applicantEmailAlreadyUpdated
              }
            >
              {applicantEmailAlreadyUpdated
                ? "✓ Email Updated"
                : emailSaving
                  ? "Updating..."
                  : "Update Email"}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const PAGE_CSS = `
  * {
    box-sizing: border-box;
  }

  .clayyo-page {
    min-height: 100vh;
    padding: 36px 24px;
    background: #f1f5f9;
    font-family: Inter, Arial, sans-serif;
  }

  .page-container {
    width: 100%;
    max-width: 1320px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
    margin-bottom: 30px;
  }

  .back-button,
  .secondary-button {
    padding: 10px 17px;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    background: #ffffff;
    color: #334155;
    cursor: pointer;
    font-weight: 900;
  }

  .back-button {
    padding: 11px 20px;
  }

  .back-button:hover,
  .secondary-button:hover:not(:disabled) {
    background: #f8fafc;
  }

  .page-heading {
    text-align: right;
  }

  .page-heading span {
    color: #64748b;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .page-heading h1 {
    margin: 6px 0 0;
    color: #0f172a;
    font-size: 34px;
  }

  .section-list {
    display: grid;
    gap: 28px;
  }

  .section-card {
    padding: 30px;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    background: #ffffff;
    box-shadow:
      0 8px 24px
      rgba(15, 23, 42, 0.06);
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 26px;
  }

  .section-title-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .section-icon {
    font-size: 25px;
  }

  .section-title {
    margin: 0;
    color: #0f172a;
    font-size: 20px;
    font-weight: 900;
  }

  .field-grid,
  .kyc-link-grid,
  .insurance-grid {
    display: grid;
    gap: 24px;
  }

  .field-grid {
    grid-template-columns:
      repeat(
        auto-fit,
        minmax(240px, 1fr)
      );
  }

  .kyc-link-grid {
    grid-template-columns:
      repeat(
        auto-fit,
        minmax(230px, 1fr)
      );
    gap: 34px;
  }

  .insurance-grid {
  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 1fr));
  gap: 22px 24px;
  align-items: start;
}

  .field,
  .link-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .field-label {
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .field-value {
    color: #0f172a;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.45;
    word-break: break-word;
  }

  .field-value-highlight {
    color: #0369a1;
    font-weight: 900;
  }

  .status {
    width: fit-content;
    padding: 7px 13px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 900;
  }

  .status-success {
    background: #dcfce7;
    color: #166534;
  }

  .status-danger {
    background: #fee2e2;
    color: #991b1b;
  }

  .status-warning {
    background: #fef9c3;
    color: #854d0e;
  }

  .status-info {
    background: #dbeafe;
    color: #1e40af;
  }

  .status-neutral {
    background: #e2e8f0;
    color: #334155;
  }

  .mini-button {
    padding: 5px 10px;
    border: 1px solid #93c5fd;
    border-radius: 8px;
    background: #eff6ff;
    color: #1d4ed8;
    cursor: pointer;
    font-size: 12px;
    font-weight: 900;
  }

  .mini-button-success {
    border-color: #bbf7d0;
    background: #dcfce7;
    color: #166534;
    cursor: not-allowed;
  }

  .link-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .open-link,
  .copy-button {
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 900;
  }

  .open-link {
    display: inline-flex;
    align-items: center;
    background: #eff6ff;
    color: #1d4ed8;
    text-decoration: none;
  }

  .copy-button {
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #334155;
    cursor: pointer;
  }

  .copy-button-success {
    background: #dcfce7;
    color: #166534;
  }

  .not-available {
    color: #94a3b8;
    font-weight: 700;
  }

  .primary-button {
    padding: 10px 17px;
    border: 0;
    border-radius: 9px;
    background: #2563eb;
    color: #ffffff;
    cursor: pointer;
    font-weight: 900;
  }

  .primary-button:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .primary-button:disabled {
    background: #94a3b8;
    cursor: not-allowed;
  }

  .success-button,
  .success-button:disabled {
    background: #16a34a;
  }

  .success-note {
    margin-top: 22px;
    padding: 12px 15px;
    border-radius: 9px;
    background: #dcfce7;
    color: #166534;
    font-weight: 900;
  }

  .section-divider {
    height: 1px;
    margin: 30px 0 22px;
    background: #e2e8f0;
  }

.insurance-title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 22px;
  color: #009688;
  font-size: 18px;
  font-weight: 900;
}

.insurance-title-icon {
  font-size: 17px;
}

.insurance-input-card {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.insurance-grid .form-label {
  color: #53698f;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.insurance-grid .form-input {
  min-height: 43px;
  border: 1px solid #d6deeb;
  border-radius: 8px;
  background: #ffffff;
}

.insurance-grid .form-input:focus {
  border-color: #009688;
  box-shadow:
    0 0 0 3px
    rgba(0, 150, 136, 0.12);
}

  .form-control {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-label {
    color: #334155;
    font-size: 13px;
    font-weight: 900;
  }

  .required {
    color: #dc2626;
  }

  .form-input {
    width: 100%;
    min-height: 44px;
    padding: 11px 13px;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    background: #ffffff;
    color: #0f172a;
    font-size: 15px;
    font-weight: 700;
    outline: none;
  }

  .form-input:focus {
    border-color: #2563eb;
    box-shadow:
      0 0 0 3px
      rgba(37, 99, 235, 0.12);
  }

  .form-input:disabled {
    background: #f1f5f9;
    cursor: not-allowed;
  }

  .insurance-action {
    margin-top: 20px;
  }

  .form-message {
    margin-top: 18px;
    padding: 12px 15px;
    border-radius: 9px;
    font-weight: 900;
  }

  .form-message-success {
    background: #dcfce7;
    color: #166534;
  }

  .form-message-error {
    background: #fee2e2;
    color: #b91c1c;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background:
      rgba(15, 23, 42, 0.58);
  }

  .modal-card {
    width: 100%;
    max-width: 620px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 28px;
    border-radius: 18px;
    background: #ffffff;
    box-shadow:
      0 24px 60px
      rgba(15, 23, 42, 0.3);
  }

  .modal-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 24px;
  }

  .modal-heading h2 {
    margin: 0;
    color: #0f172a;
    font-size: 22px;
  }

  .modal-close {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 9px;
    background: #f1f5f9;
    cursor: pointer;
    font-size: 22px;
  }

  .modal-close:disabled {
    cursor: not-allowed;
  }

  .modal-form-grid {
    display: grid;
    gap: 17px;
  }

  .warning-note {
    margin-top: 18px;
    padding: 12px;
    border-radius: 9px;
    background: #fef9c3;
    color: #854d0e;
    font-size: 14px;
    font-weight: 800;
  }

  .modal-message {
    margin-top: 14px;
    font-weight: 900;
  }

  .success-text {
    color: #166534;
  }

  .error-text {
    color: #b91c1c;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 22px;
  }

  .page-state {
    min-height: 70vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f1f5f9;
  }

  .spinner {
    width: 54px;
    height: 54px;
    border:
      6px solid #e2e8f0;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation:
      clayyo-spin
      0.9s
      linear
      infinite;
  }

  .page-error {
    min-height: 50vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    background: #f1f5f9;
    color: #b91c1c;
    font-size: 18px;
    font-weight: 900;
  }

  @keyframes clayyo-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 700px) {
    .clayyo-page {
      padding: 20px 12px;
    }
      .insurance-grid {
  grid-template-columns: 1fr;
}

    @media (max-width: 1000px) {
  .insurance-grid {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }
}

    .section-card {
      padding: 20px;
    }

    .page-heading {
      width: 100%;
      text-align: left;
    }

    .page-heading h1 {
      font-size: 26px;
    }

    .modal-actions {
      flex-direction:
        column-reverse;
    }

    .modal-actions button {
      width: 100%;
    }
  }
`;

export default ClayyoUpdateData;