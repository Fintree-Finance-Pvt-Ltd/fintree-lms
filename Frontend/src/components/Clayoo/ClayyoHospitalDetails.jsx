import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/api";

const ClayyoHospitalDetails = () => {
  const { lan } = useParams();
  const navigate = useNavigate();

  const [details, setDetails] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHospitalDetails = async () => {
      try {
        setLoading(true);
        setErr("");

        const res = await api.get(`clayyo-loans/clayyo-hospital-booking-details/${lan}`);
        setDetails(res.data);
      } catch (e) {
        console.error("Failed to fetch hospital details:", e);
        setErr("Failed to fetch hospital details.");
      } finally {
        setLoading(false);
      }
    };

    fetchHospitalDetails();
  }, [lan]);

  if (loading)
    return (
      <div className="spinner-container">
        <div className="spinner"></div>
      </div>
    );

  if (err)
    return (
      <p style={{ padding: 16, color: "#b91c1c" }}>
        {err}
      </p>
    );

  if (!details)
    return (
      <p style={{ padding: 16 }}>
        No data found.
      </p>
    );

  const hospital = details;

  return (
    <div
      style={{
        background: "#f3f4f6",
        minHeight: "100vh",
        padding: "30px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
          background: "#fff",
          padding: "25px 30px",
          borderRadius: "10px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
        }}
      >
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          style={{
            marginBottom: "10px",
            padding: "6px 12px",
            background: "#374151",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>

        {/* Title */}
        <h2
          style={{
            marginBottom: "20px",
            borderBottom: "2px solid #0ea5e9",
            paddingBottom: "8px",
          }}
        >
          🏥 Hospital Booking - {hospital.hospital_legal_name || lan}
        </h2>

        {[
          {
            title: "Application Info 📄",
            content: (
              <Grid>
                <Field label="Application ID" value={hospital.application_id} />
                <Field label="LAN" value={hospital.lan} />
                <Field label="Status" value={hospital.status} />
                <Field label="Created At" value={hospital.created_at} />
              </Grid>
            ),
          },

          {
            title: "Hospital Profile 🏥",
            content: (
              <Grid>
                <Field label="Legal Name" value={hospital.hospital_legal_name} />
                <Field label="Brand Name" value={hospital.brand_name} />
                <Field
                  label="Registration Number"
                  value={hospital.hospital_registration_number}
                />
                <Field
                  label="Year of Establishment"
                  value={hospital.year_of_establishment}
                />
                <Field label="Hospital Type" value={hospital.hospital_type} />
                <Field label="Bed Capacity" value={hospital.bed_capacity} />
              </Grid>
            ),
          },

          {
            title: "Departments & Services 🧪",
            content: (
              <Grid>
                <Field
                  label="Key Specialties"
                  value={hospital.key_specialties}
                />
                <Field
                  label="Major Procedures"
                  value={hospital.major_procedures}
                />
                <Field
                  label="Departments"
                  value={hospital.departments}
                />
              </Grid>
            ),
          },

          {
            title: "Registered Address 📍",
            content: (
              <Grid>
                <Field
                  label="Address"
                  value={hospital.registered_address}
                />
                <Field label="City" value={hospital.registered_city} />
                <Field
                  label="District"
                  value={hospital.registered_district}
                />
                <Field
                  label="State"
                  value={hospital.registered_state}
                />
                <Field
                  label="Pincode"
                  value={hospital.registered_pincode}
                />
                <Field
                  label="Branch Locations"
                  value={hospital.branch_locations}
                />
              </Grid>
            ),
          },

          {
            title: "Operational Metrics 📊",
            content: (
              <Grid>
                <Field
                  label="Monthly Patient Footfall"
                  value={hospital.avg_monthly_patient_footfall}
                />
                <Field
                  label="Average Ticket Size"
                  value={hospital.avg_ticket_size}
                />
              </Grid>
            ),
          },

          {
            title: "Hospital Contact 📞",
            content: (
              <Grid>
                <Field
                  label="Hospital Email"
                  value={hospital.hospital_email}
                />
                <Field
                  label="Hospital Phone"
                  value={hospital.hospital_phone}
                />
              </Grid>
            ),
          },

          {
            title: "Owner Details 👤",
            content: (
              <Grid>
                <Field label="Owner Name" value={hospital.owner_name} />
                <Field label="Owner Email" value={hospital.owner_email} />
                <Field label="Owner Phone" value={hospital.owner_phone} />
              </Grid>
            ),
          },
        ].map((section, idx) => (
          <div key={idx} style={{ marginBottom: "25px" }}>
            <h3
              style={{
                borderBottom: "1px solid #e5e7eb",
                paddingBottom: "6px",
                marginBottom: "15px",
                color: "#1f2937",
              }}
            >
              {section.title}
            </h3>
            {section.content}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClayyoHospitalDetails;

/* Shared Components */

const Grid = ({ children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: "15px 30px",
    }}
  >
    {children}
  </div>
);

const Field = ({ label, value }) => (
  <div>
    <label
      style={{
        fontSize: "13px",
        color: "#6b7280",
      }}
    >
      {label}
    </label>

    <input
      value={value || ""}
      readOnly
      style={{
        width: "100%",
        padding: "6px 8px",
        marginTop: "4px",
        border: "1px solid #d1d5db",
        borderRadius: "4px",
        background: "#f9fafb",
      }}
    />
  </div>
);