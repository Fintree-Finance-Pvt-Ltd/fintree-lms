import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/api";
import LoaderOverlay from "../ui/LoaderOverlay";

const CustomerDetailsScreen = () => {

  const { partner_loan_id } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const abortRef = useRef(null);

  const fetchCustomer = useCallback(() => {

    if (abortRef.current) abortRef.current.abort();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setErr("");

    api.get(`/supply-chain/customers/${partner_loan_id}`, {
      signal: ctrl.signal,
    })
      .then((res) => {
        setData(res.data || {});
      })
      .catch((e) => {

        if (e?.code === "ERR_CANCELED") return;

        console.error("Customer fetch error:", e);
        setErr("Failed to fetch customer details");

      })
      .finally(() => setLoading(false));

  }, [partner_loan_id]);


  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);


  if (loading) {
    return <LoaderOverlay show label="Fetching customer details…" />;
  }

  if (err) {
    return <p style={{ color: "#b91c1c" }}>{err}</p>;
  }

  if (!data) return null;


  return (
    <div style={styles.wrapper}>

      <h2 style={styles.title}>
        Customer Details ({data.partner_loan_id})
      </h2>

      {/* APPLICANT DETAILS */}

      <Section title="Applicant Information">

        <Info label="Name" value={data.applicant_name} />
        <Info label="Mobile" value={data.applicant_mobile} />
        <Info label="PAN" value={data.applicant_pan} />
        <Info label="Aadhaar" value={data.applicant_aadhaar} />
        <Info label="Address" value={data.applicant_address} />

      </Section>


      {/* CO-APPLICANT DETAILS */}

      <Section title="Co-Applicant Information">

        <Info label="Name" value={data.co_applicant_name} />
        <Info label="Mobile" value={data.co_applicant_mobile} />
        <Info label="PAN" value={data.co_applicant_pan} />
        <Info label="Aadhaar" value={data.co_applicant_aadhaar} />
        <Info label="Address" value={data.co_applicant_address} />

      </Section>


      {/* COMPANY DETAILS */}

      <Section title="Company Information">

        <Info label="Company Name" value={data.company_name} />
        <Info label="GST Number" value={data.gst_number} />
        <Info label="Company PAN" value={data.company_pan} />
        <Info label="Company Address" value={data.company_address} />

      </Section>


      {/* LOAN DETAILS */}

      <Section title="Loan Information">

        <Info label="LAN" value={data.lan} />
        <Info label="Sanction Amount" value={formatCurrency(data.sanction_amount)} />
        <Info label="Utilized Limit" value={formatCurrency(data.utilized_sanction_limit)} />
        <Info label="Available Limit" value={formatCurrency(data.unutilization_sanction_limit)} />
        <Info label="Interest Rate (%)" value={data.interest_rate} />
        <Info label="Penal Rate (%)" value={data.penal_rate} />
        <Info label="Tenure (Months)" value={data.tenure_months} />

      </Section>

    </div>
  );
};


function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      <div style={styles.grid}>
        {children}
      </div>
    </div>
  );
}


function Info({ label, value }) {
  return (
    <div>
      <strong>{label}:</strong>
      <div>{value || "—"}</div>
    </div>
  );
}


function formatCurrency(val) {
  return Number(val || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });
}


const styles = {
  wrapper: {
    padding: 20,
  },
  title: {
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#f9fafb",
  },
  sectionTitle: {
    marginBottom: 12,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))",
    gap: 12,
  },
};

export default CustomerDetailsScreen;