import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/api";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN");
};

const Field = ({ label, value, status }) => {
  if (status) {
    const normalized = String(value || "PENDING").toUpperCase();
    const approved = normalized === "APPROVED";

    return (
      <div className="carepay-detail-field">
        <label>{label}</label>
        <span className={`carepay-status ${approved ? "approved" : "pending"}`}>
          {normalized}
        </span>
      </div>
    );
  }

  return (
    <div className="carepay-detail-field">
      <label>{label}</label>
      <strong>{value || "-"}</strong>
    </div>
  );
};

const Section = ({ title, children }) => (
  <section className="carepay-detail-section">
    <h2>{title}</h2>
    <div className="carepay-detail-grid">{children}</div>
  </section>
);

const CarePayHospitalDetails = () => {
  const { lan } = useParams();
  const navigate = useNavigate();
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        setErr("");
        const res = await api.get(`/loan-booking/carepay-hospital-booking-details/${lan}`);
        setHospital(res.data || null);
      } catch (error) {
        setErr("Failed to fetch CarePay hospital details.");
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [lan]);

  if (loading) {
    return <p style={{ padding: 24, fontWeight: 700 }}>Loading hospital details...</p>;
  }

  if (err) {
    return <p style={{ padding: 24, color: "#991b1b", fontWeight: 700 }}>{err}</p>;
  }

  if (!hospital) {
    return <p style={{ padding: 24, fontWeight: 700 }}>No hospital details found.</p>;
  }

  return (
    <div className="carepay-detail-page">
      <header className="carepay-detail-header">
        <button type="button" onClick={() => navigate(-1)}>
          <ArrowLeft size={17} />
          Back
        </button>
        <div>
          <p>CarePay Hospital Profile</p>
          <h1>{hospital.hospital_legal_name || lan}</h1>
        </div>
      </header>

      <div className="carepay-detail-stack">
        <Section title="Application">
          <Field label="Application ID" value={hospital.application_id} />
          <Field label="Partner Hospital ID" value={hospital.partner_loan_id} />
          <Field label="LAN" value={hospital.lan} />
          <Field label="Credit Status" value={hospital.status} status />
          <Field label="Created Date" value={formatDate(hospital.created_at)} />
        </Section>

        <Section title="Hospital Profile">
          <Field label="Legal Name" value={hospital.hospital_legal_name} />
          <Field label="Brand Name" value={hospital.brand_name} />
          <Field label="Registration Number" value={hospital.hospital_registration_number} />
          <Field label="Year of Establishment" value={hospital.year_of_establishment} />
          <Field label="Hospital Type" value={hospital.hospital_type} />
          <Field label="Bed Capacity" value={hospital.bed_capacity} />
          <Field label="Branch Locations" value={hospital.branch_locations} />
        </Section>

        <Section title="Services">
          <Field label="Key Specialties" value={hospital.key_specialties} />
          <Field label="Major Procedures" value={hospital.major_procedures} />
          <Field label="Departments" value={hospital.departments} />
        </Section>

        <Section title="Registered Address">
          <Field label="Address" value={hospital.registered_address} />
          <Field label="City" value={hospital.registered_city} />
          <Field label="District" value={hospital.registered_district} />
          <Field label="State" value={hospital.registered_state} />
          <Field label="Pincode" value={hospital.registered_pincode} />
        </Section>

        <Section title="Contact">
          <Field label="Hospital Phone" value={hospital.hospital_phone} />
          <Field label="Hospital Email" value={hospital.hospital_email} />
          <Field label="Contact Person" value={hospital.contact_person_name} />
          <Field label="Contact Person Phone" value={hospital.contact_person_phone} />
          <Field label="Contact Person Email" value={hospital.contact_person_email} />
        </Section>

        <Section title="Banking">
          <Field label="Bank Name" value={hospital.bank_name} />
          <Field label="Branch Name" value={hospital.branch_name} />
          <Field label="IFSC Code" value={hospital.ifsc_code} />
          <Field label="Account Holder Name" value={hospital.account_holder_name} />
          <Field label="Account Number" value={hospital.account_number} />
        </Section>
      </div>

      <style>{`
        .carepay-detail-page {
          min-height: 100vh;
          padding: 36px;
          background: #f6f9fc;
          color: #10233f;
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .carepay-detail-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 18px;
          margin-bottom: 24px;
        }

        .carepay-detail-header button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 42px;
          border: 1px solid #d9e3ee;
          border-radius: 7px;
          padding: 0 16px;
          background: #ffffff;
          color: #0f2b5b;
          font-weight: 800;
          cursor: pointer;
        }

        .carepay-detail-header p {
          margin: 0 0 6px;
          color: #0f766e;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-align: right;
        }

        .carepay-detail-header h1 {
          margin: 0;
          color: #0f2b5b;
          font-size: 30px;
          font-weight: 800;
          text-align: right;
        }

        .carepay-detail-stack {
          display: grid;
          gap: 18px;
        }

        .carepay-detail-section {
          background: #ffffff;
          border: 1px solid #e5edf5;
          border-radius: 8px;
          padding: 22px;
          box-shadow: 0 10px 28px rgba(15, 43, 91, 0.06);
        }

        .carepay-detail-section h2 {
          margin: 0 0 18px;
          color: #0f2b5b;
          font-size: 17px;
          font-weight: 800;
        }

        .carepay-detail-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 18px;
        }

        .carepay-detail-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .carepay-detail-field label {
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .carepay-detail-field strong {
          color: #10233f;
          font-size: 16px;
          font-weight: 800;
          word-break: break-word;
        }

        .carepay-status {
          width: fit-content;
          border-radius: 999px;
          padding: 8px 13px;
          font-size: 12px;
          font-weight: 900;
        }

        .carepay-status.pending {
          border: 1px solid #fde68a;
          background: #fef9c3;
          color: #713f12;
        }

        .carepay-status.approved {
          border: 1px solid #bbf7d0;
          background: #dcfce7;
          color: #166534;
        }

        @media (max-width: 900px) {
          .carepay-detail-page {
            padding: 20px;
          }

          .carepay-detail-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .carepay-detail-header p,
          .carepay-detail-header h1 {
            text-align: left;
          }
        }
      `}</style>
    </div>
  );
};

export default CarePayHospitalDetails;
