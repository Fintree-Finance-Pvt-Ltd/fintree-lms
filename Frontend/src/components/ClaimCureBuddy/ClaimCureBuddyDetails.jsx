import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api/api";

const ClaimCureBuddyDetails = () => {
    const [searchParams] = useSearchParams();
    const lan = searchParams.get("lan");
    const navigate = useNavigate();

    const [details, setDetails] = useState(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!lan) {
                setErr("LAN is required.");
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setErr("");

                const res = await api.get(
                    `/claim-cure-buddy/customer-details/${encodeURIComponent(lan)}`
                );

                setDetails(res.data);
            } catch (e) {
                console.error("Failed to fetch Claim Cure Buddy details:", e);
                setErr(
                    e?.response?.data?.message ||
                    "Failed to fetch Claim Cure Buddy customer details."
                );
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [lan]);

    if (loading) {
        return (
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100vh",
                    background: "#f1f5f9",
                }}
            >
                <div
                    style={{
                        width: "60px",
                        height: "60px",
                        border: "6px solid #e2e8f0",
                        borderTop: "6px solid #0ea5e9",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                    }}
                />
                <style>
                    {`@keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }`}
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

    if (!details?.loan) {
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

    const { loan, preBre, bre, esign, audit } = details;

    // Bureau facts may be stored as JSON / LONGTEXT.
    // Parse once so the Risk & BRE section can read individual flags cleanly.
    const bureauFacts = parseFacts(loan.borrower_bureau?.facts);

    const sections = [
        {
            title: "Application & Applicant Information",
            icon: "👤",
            content: (
                <Grid>

                    <Field label="LAN" value={loan.lan} highlight />
                    <Field label="Application ID" value={loan.application_id} />
                    <Field label="Partner Loan ID" value={loan.partner_loan_id} />
                    <Field label="Product" value={loan.product} />
                    <Field label="Status" value={loan.status} isStatus />
                    <Field label="Stage" value={loan.stage} isStatus />
                    <Field label="Login Date" value={formatDate(loan.login_date)} />
                    <Field label="Mobile Number" value={loan.mobile_number} />
                    <Field label="PAN Card" value={loan.pan_card} />
                    <Field label="First Name" value={loan.first_name} />
                    <Field label="Last Name" value={loan.last_name} />
                    <Field label="Customer Name" value={loan.customer_name} />
                    <Field label="Gender" value={loan.gender} />
                    <Field label="DOB" value={formatDate(loan.dob)} />
                    <Field label="Father Name" value={loan.father_name} />
                    <Field label="Email" value={loan.email} />
                </Grid>
            ),
        },
        {
            title: "Permanent Address",
            icon: "🏠",
            content: (
                <Grid>
                    <Field
                        label="Address Line 1"
                        value={loan.permanent_address?.address_line_1}
                    />
                    <Field
                        label="Address Line 2"
                        value={loan.permanent_address?.address_line_2}
                    />
                    <Field label="City" value={loan.permanent_address?.city} />
                    <Field label="District" value={loan.permanent_address?.district} />
                    <Field label="State" value={loan.permanent_address?.state} />
                    <Field label="Pincode" value={loan.permanent_address?.pincode} />
                </Grid>
            ),
        },
        {
            title: "Current Address",
            icon: "📍",
            content: (
                <Grid>
                    <BooleanField
                        label="Same As Permanent"
                        value={loan.current_address?.same_as_permanent}
                    />
                    <Field
                        label="Address Line 1"
                        value={loan.current_address?.address_line_1}
                    />
                    <Field
                        label="Address Line 2"
                        value={loan.current_address?.address_line_2}
                    />
                    <Field label="City" value={loan.current_address?.city} />
                    <Field label="District" value={loan.current_address?.district} />
                    <Field label="State" value={loan.current_address?.state} />
                    <Field label="Pincode" value={loan.current_address?.pincode} />
                </Grid>
            ),
        },
        {
            title: "Loan & Financials",
            icon: "💰",
            content: (
                <Grid>
                    <Field
                        label="Loan Amount"
                        value={formatMoney(loan.loan_details?.loan_amount)}
                        highlight
                    />
                    <Field
                        label="Interest Rate"
                        value={formatPercent(loan.loan_details?.interest_rate)}
                    />
                    <Field
                        label="Loan Tenure"
                        value={formatMonths(loan.loan_details?.loan_tenure)}
                    />
                    <Field
                        label="Processing Fee"
                        value={formatMoney(loan.loan_details?.processing_fee)}
                    />
                    <Field
                        label="Disbursal Amount"
                        value={formatMoney(loan.loan_details?.disbursal_amount)}
                        highlight
                    />
                </Grid>
            ),
        },
        {
            title: "Bank Details & Verification",
            icon: "🏦",
            content: (
                <div style={{ display: "grid", gap: "28px" }}>
                    <Grid>
                        <Field
                            label="Account Holder Name"
                            value={loan.bank_details?.customer_name_as_per_bank}
                        />
                        <Field
                            label="Bank Name"
                            value={loan.bank_details?.customer_bank_name}
                        />
                        <Field
                            label="Account Number"
                            value={loan.bank_details?.customer_account_number}
                        />
                        <Field
                            label="IFSC Code"
                            value={loan.bank_details?.bank_ifsc_code}
                        />
                        <Field
                            label="Branch Address"
                            value={loan.bank_details?.bank_branch_address}
                        />
                        <Field
                            label="Verification Status"
                            value={loan.bank_details?.bank_verification_status}
                            isStatus
                        />
                    </Grid>
                </div>
            ),
        },
        {
            title: "Borrower Pre-BRE",
            icon: "🧪",
            content: (
                <Grid>
                    <Field
                        label="Pre-BRE Status"
                        value={preBre?.status}
                        isStatus
                    />

                    <Field
                        label="Pre-BRE Reason"
                        value={preBre?.reason}
                    />

                    <Field
                        label="Pre-BRE Checked At"
                        value={formatDateTime(preBre?.checked_at)}
                    />
                </Grid>
            ),
        },

        {
            title: "Risk & BRE Decisioning",
            icon: "⚖️",
            content: (
                <RiskGrid>
                    <Field
                        label="BRE Status"
                        value={titleCase(bre?.status)}
                        isStatus
                    />

                    <Field
                        label="BRE Reason"
                        value={formatBreReason(bre?.reason)}
                    />

                    <Field
                        label="Fintree CIBIL"
                        value={loan.borrower_bureau?.score}
                    />

                    <Field
                        label="Enquiries (30D)"
                        value={getFact(bureauFacts, [
                            "enquiries_30d",
                            "enquiries30d",
                            "inquiries_30d",
                            "inquiries30d",
                            "enquiry_30d",
                            "enquiry30d",
                        ])}
                    />

                    <FlagField
                        label="DPD 3M"
                        value={getFact(bureauFacts, [
                            "dpd_3m_flag",
                            "dpd3m_flag",
                            "dpd_3m",
                            "dpd3m",
                        ])}
                    />

                    <FlagField
                        label="DPD 6M"
                        value={getFact(bureauFacts, [
                            "dpd_6m_flag",
                            "dpd6m_flag",
                            "dpd_6m",
                            "dpd6m",
                        ])}
                    />

                    <FlagField
                        label="Overdue 12M"
                        value={getFact(bureauFacts, [
                            "overdue_12m_flag",
                            "overdue12m_flag",
                            "overdue_12m",
                            "overdue12m",
                        ])}
                    />

                    <FlagField
                        label="Written Off 3Y"
                        value={getFact(bureauFacts, [
                            "written_off_3y_flag",
                            "writtenoff_3y_flag",
                            "written_off_3y",
                            "writtenoff3y",
                        ])}
                    />

                    <FlagField
                        label="60+ DPD"
                        value={getFact(bureauFacts, [
                            "dpd_60plus_24m_flag",
                            "60plus_24m_flag",
                            "dpd60plus24m",
                            "dpd_60_plus_24m",
                        ])}
                    />

                    <FlagField
                        label="90+ DPD"
                        value={getFact(bureauFacts, [
                            "dpd_90plus_36m_flag",
                            "90plus_36m_flag",
                            "dpd90plus36m",
                            "dpd_90_plus_36m",
                        ])}
                    />

                    <FlagField
                        label="Deviation"
                        value={getFact(bureauFacts, [
                            "deviation_flag",
                            "deviation",
                        ])}
                    />

                    <Field
                        label="EMI Overdue"
                        value={formatRiskAmount(
                            getFact(bureauFacts, [
                                "emi_overdue_amount",
                                "emi_overdue",
                                "emioverdueamount",
                            ])
                        )}
                    />

                    <Field
                        label="CC Overdue"
                        value={formatRiskAmount(
                            getFact(bureauFacts, [
                                "cc_overdue_amount",
                                "cc_overdue",
                                "ccoverdueamount",
                            ])
                        )}
                    />
                </RiskGrid>
            ),
        },

        {
            title: "Agreement E-Sign",
            icon: "📄",
            content: (
                <div style={{ display: "grid", gap: "28px" }}>
                    <Grid>
                        <Field
                            label="Agreement E-Sign Status"
                            value={esign?.agreement?.status}
                            isStatus
                        />
                        <Field
                            label="Sent At"
                            value={formatDateTime(esign?.agreement?.sent_at)}
                        />
                        <Field
                            label="Signed At"
                            value={formatDateTime(esign?.agreement?.signed_at)}
                        />
                        <Field
                            label="Reference"
                            value={esign?.agreement?.reference}
                        />
                        <Field
                            label="Document ID"
                            value={esign?.agreement?.document_id}
                        />
                    </Grid>
                </div>
            ),
        },
    ];

    return (
        <div
            style={{
                background: "#f1f5f9",
                minHeight: "100vh",
                padding: "50px 25px",
                fontFamily: "'Inter', sans-serif",
            }}
        >
            <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                        gap: "20px",
                        flexWrap: "wrap",
                        marginBottom: "40px",
                    }}
                >
                    <button
                        onClick={() => navigate(-1)}
                        style={{
                            padding: "14px 28px",
                            background: "#ffffff",
                            color: "#334155",
                            border: "2px solid #e2e8f0",
                            borderRadius: "12px",
                            cursor: "pointer",
                            fontSize: "16px",
                            fontWeight: "700",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                        }}
                    >
                        ← Back
                    </button>

                    <div style={{ textAlign: "right" }}>
                        <span
                            style={{
                                fontSize: "14px",
                                color: "#64748b",
                                fontWeight: 800,
                                textTransform: "uppercase",
                                letterSpacing: "0.1em",
                            }}
                        >
                            Claim Cure Buddy Profile
                        </span>

                        <h1
                            style={{
                                margin: "8px 0 0 0",
                                color: "#0f172a",
                                fontSize: "42px",
                                fontWeight: 900,
                                letterSpacing: "-0.02em",
                            }}
                        >
                            {loan.customer_name || loan.application_id || lan}
                        </h1>
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "35px" }}>
                    {sections.map((section) => (
                        <div
                            key={section.title}
                            style={{
                                background: "#ffffff",
                                borderRadius: "24px",
                                padding: "40px",
                                boxShadow:
                                    "0 10px 15px -3px rgba(0,0,0,0.04), 0 4px 6px -2px rgba(0,0,0,0.02)",
                                border: "1px solid #e2e8f0",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "15px",
                                    marginBottom: "30px",
                                }}
                            >
                                <span style={{ fontSize: "28px" }}>{section.icon}</span>
                                <h3
                                    style={{
                                        margin: 0,
                                        color: "#1e293b",
                                        fontSize: "22px",
                                        fontWeight: 800,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.02em",
                                    }}
                                >
                                    {section.title}
                                </h3>
                            </div>

                            {section.content}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const Grid = ({ children }) => (
    <div
        style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "30px",
        }}
    >
        {children}
    </div>
);

// Risk/BRE grid: 4 columns on wide screens, automatically collapses on smaller screens.
const RiskGrid = ({ children }) => (
    <div
        style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            columnGap: "55px",
            rowGap: "38px",
            alignItems: "start",
        }}
    >
        {children}
    </div>
);

const Field = ({ label, value, highlight, isStatus }) => {
    const normalized = String(value ?? "").toUpperCase();

    const statusColors = {
        DRAFT: { bg: "#f1f5f9", text: "#475569" },
        LOGIN: { bg: "#e0f2fe", text: "#075985" },
        APPROVED: { bg: "#dcfce7", text: "#166534" },
        REJECTED: { bg: "#fee2e2", text: "#991b1b" },
        DISBURSED: { bg: "#d1fae5", text: "#065f46" },
        "FULLY PAID": { bg: "#ccfbf1", text: "#115e59" },
        PENDING: { bg: "#fef9c3", text: "#854d0e" },
        RUNNING: { bg: "#dbeafe", text: "#1e40af" },
        ERROR: { bg: "#fee2e2", text: "#991b1b" },
        VERIFIED: { bg: "#dcfce7", text: "#166534" },
        FAILED: { bg: "#fee2e2", text: "#991b1b" },
        NOT_INITIATED: { bg: "#f1f5f9", text: "#475569" },
        INITIATED: { bg: "#dbeafe", text: "#1e40af" },
        IN_PROGRESS: { bg: "#e0e7ff", text: "#3730a3" },
        SIGNED: { bg: "#dcfce7", text: "#166534" },
        EXPIRED: { bg: "#ffedd5", text: "#9a3412" },
        "BASIC DETAILS": { bg: "#e0f2fe", text: "#075985" },
        ADDRESS: { bg: "#ede9fe", text: "#5b21b6" },
        "LOAN DETAILS": { bg: "#fef3c7", text: "#92400e" },
        "CO-APPLICANTS": { bg: "#fce7f3", text: "#9d174d" },
        "BANK DETAILS": { bg: "#cffafe", text: "#155e75" },
        BRE: { bg: "#e0e7ff", text: "#3730a3" },
        COMPLETED: { bg: "#dcfce7", text: "#166534" },
    };

    const colors = statusColors[normalized] || {
        bg: "#f1f5f9",
        text: "#475569",
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label
                style={{
                    fontSize: "12px",
                    color: "#94a3b8",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
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
                        background: colors.bg,
                        color: colors.text,
                        width: "fit-content",
                        border: "1px solid rgba(0,0,0,0.05)",
                    }}
                >
                    {hasValue(value) ? String(value) : "—"}
                </span>
            ) : (
                <div
                    style={{
                        fontSize: "18px",
                        fontWeight: highlight ? 900 : 700,
                        color: highlight ? "#0284c7" : "#1e293b",
                        wordBreak: "break-word",
                        lineHeight: 1.4,
                    }}
                >
                    {hasValue(value) ? String(value) : "—"}
                </div>
            )}
        </div>
    );
};

const FlagField = ({ label, value }) => {
    const normalized = String(value ?? "").trim().toUpperCase();

    const yes =
        value === 1 ||
        value === true ||
        normalized === "1" ||
        normalized === "Y" ||
        normalized === "YES" ||
        normalized === "TRUE";

    const no =
        value === 0 ||
        value === false ||
        normalized === "0" ||
        normalized === "N" ||
        normalized === "NO" ||
        normalized === "FALSE";

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
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                }}
            >
                {label}
            </label>

            {yes ? (
                <span
                    style={{
                        width: "fit-content",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        background: "#fef2f2",
                        color: "#dc2626",
                        fontWeight: 800,
                        fontSize: "16px",
                    }}
                >
                    ● Yes
                </span>
            ) : no ? (
                <span
                    style={{
                        width: "fit-content",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        background: "#f0fdf4",
                        color: "#16a34a",
                        fontWeight: 800,
                        fontSize: "16px",
                    }}
                >
                    ○ No
                </span>
            ) : (
                <span
                    style={{
                        color: "#cbd5e1",
                        fontWeight: 800,
                        fontSize: "16px",
                    }}
                >
                    N/A
                </span>
            )}
        </div>
    );
};

const BooleanField = ({ label, value }) => {
    const yes = value === 1 || value === true || value === "1";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label
                style={{
                    fontSize: "12px",
                    color: "#94a3b8",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                }}
            >
                {label}
            </label>

            <span
                style={{
                    padding: "8px 16px",
                    borderRadius: "999px",
                    width: "fit-content",
                    fontSize: "14px",
                    fontWeight: 900,
                    background: yes ? "#dcfce7" : "#f1f5f9",
                    color: yes ? "#166534" : "#475569",
                    border: `1px solid ${yes ? "#bbf7d0" : "#e2e8f0"}`,
                }}
            >
                {yes ? "YES" : "NO"}
            </span>
        </div>
    );
};

const JsonBlock = ({ title, value }) => {
    if (!hasValue(value)) {
        return (
            <div
                style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "16px",
                    padding: "20px",
                }}
            >
                <div
                    style={{
                        fontSize: "12px",
                        color: "#94a3b8",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: "10px",
                    }}
                >
                    {title}
                </div>
                <div style={{ color: "#64748b", fontWeight: 700 }}>—</div>
            </div>
        );
    }

    return (
        <div
            style={{
                background: "#0f172a",
                borderRadius: "16px",
                padding: "20px",
                overflowX: "auto",
            }}
        >
            <div
                style={{
                    fontSize: "12px",
                    color: "#94a3b8",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "12px",
                }}
            >
                {title}
            </div>

            <pre
                style={{
                    margin: 0,
                    color: "#e2e8f0",
                    fontSize: "13px",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                }}
            >
                {prettyValue(value)}
            </pre>
        </div>
    );
};

const parseFacts = (value) => {
    if (!value) return {};

    if (typeof value === "object") {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
};

const normalizeFactKey = (key) =>
    String(key || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

const getFact = (source, keys) => {
    if (!source || typeof source !== "object") {
        return null;
    }

    const wantedKeys = keys.map(normalizeFactKey);

    const search = (obj) => {
        if (!obj || typeof obj !== "object") {
            return undefined;
        }

        for (const [key, value] of Object.entries(obj)) {
            if (
                wantedKeys.includes(normalizeFactKey(key)) &&
                value !== null &&
                value !== undefined &&
                value !== ""
            ) {
                return value;
            }
        }

        for (const value of Object.values(obj)) {
            if (value && typeof value === "object") {
                const found = search(value);

                if (found !== undefined) {
                    return found;
                }
            }
        }

        return undefined;
    };

    const result = search(source);
    return result === undefined ? null : result;
};

const formatBreReason = (value) => {
    if (!value) return "—";

    let data = value;

    // If backend sends JSON as LONGTEXT/string, parse it first.
    if (typeof data === "string") {
        try {
            data = JSON.parse(data);
        } catch {
            // Already a normal readable string.
            return data;
        }
    }

    if (typeof data !== "object" || data === null) {
        return String(data);
    }

    const result = [];

    const flatten = (obj, parentKey = "") => {
        Object.entries(obj).forEach(([key, val]) => {
            const fullKey = parentKey
                ? `${parentKey}_${key}`
                : key;

            if (
                val !== null &&
                typeof val === "object" &&
                !Array.isArray(val)
            ) {
                flatten(val, fullKey);
                return;
            }

            if (Array.isArray(val)) {
                if (val.length) {
                    result.push(
                        `${fullKey.toUpperCase()}=${val.join(", ")}`
                    );
                }
                return;
            }

            if (
                val !== null &&
                val !== undefined &&
                val !== ""
            ) {
                result.push(
                    `${fullKey.toUpperCase()}=${val}`
                );
            }
        });
    };

    flatten(data);

    return result.length
        ? result.join(" | ")
        : "—";
};

const titleCase = (value) => {
    if (!value) return "Pending";

    return String(value)
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatRiskAmount = (value) => {
    if (value === null || value === undefined || value === "") {
        return "0.00";
    }

    const amount = Number(value);

    if (Number.isNaN(amount)) {
        return String(value);
    }

    return amount.toFixed(2);
};

const hasValue = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim() !== "";
    return true;
};

const prettyValue = (value) => {
    if (!hasValue(value)) return "—";

    if (typeof value === "object") {
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }

    const text = String(value);

    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
};

const formatDate = (value) => {
    if (!value) return "—";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);

    return dt.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
};

const formatDateTime = (value) => {
    if (!value) return "—";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);

    return dt.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const formatMoney = (value) => {
    if (!hasValue(value)) return "—";

    const amount = Number(value);
    if (Number.isNaN(amount)) return `₹${value}`;

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    }).format(amount);
};

const formatPercent = (value) =>
    hasValue(value) ? `${value}%` : "—";

const formatMonths = (value) =>
    hasValue(value) ? `${value} Months` : "—";

export default ClaimCureBuddyDetails;
