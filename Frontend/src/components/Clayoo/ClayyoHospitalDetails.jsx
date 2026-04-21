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

        const res = await api.get(
          `clayyo-loans/clayyo-hospital-booking-details/${lan}`,
        );
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

  if (err) return <p style={{ padding: 16, color: "#b91c1c" }}>{err}</p>;

  if (!details) return <p style={{ padding: 16 }}>No data found.</p>;

  const hospital = details;

  // return (
  //   <div
  //     style={{
  //       background: "#f3f4f6",
  //       minHeight: "100vh",
  //       padding: "30px",
  //       fontFamily: "Arial, sans-serif",
  //     }}
  //   >
  //     <div
  //       style={{
  //         maxWidth: "1000px",
  //         margin: "0 auto",
  //         background: "#fff",
  //         padding: "25px 30px",
  //         borderRadius: "10px",
  //         boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
  //       }}
  //     >
  //       {/* Back Button */}
  //       <button
  //         onClick={() => navigate(-1)}
  //         style={{
  //           marginBottom: "10px",
  //           padding: "6px 12px",
  //           background: "#374151",
  //           color: "#fff",
  //           border: "none",
  //           borderRadius: "4px",
  //           cursor: "pointer",
  //         }}
  //       >
  //         ← Back
  //       </button>

  //       {/* Title */}
  //       <h2
  //         style={{
  //           marginBottom: "20px",
  //           borderBottom: "2px solid #0ea5e9",
  //           paddingBottom: "8px",
  //         }}
  //       >
  //         🏥 Hospital Booking - {hospital.hospital_legal_name || lan}
  //       </h2>

  //       {[
  //         {
  //           title: "Application Info 📄",
  //           content: (
  //             <Grid>
  //               <Field label="Application ID" value={hospital.application_id} />
  //               <Field label="LAN" value={hospital.lan} />
  //               <Field label="Status" value={hospital.status} />
  //               <Field label="Created At" value={hospital.created_at} />
  //             </Grid>
  //           ),
  //         },

  //         {
  //           title: "Hospital Profile 🏥",
  //           content: (
  //             <Grid>
  //               <Field
  //                 label="Legal Name"
  //                 value={hospital.hospital_legal_name}
  //               />
  //               <Field label="Brand Name" value={hospital.brand_name} />
  //               <Field
  //                 label="Registration Number"
  //                 value={hospital.hospital_registration_number}
  //               />
  //               <Field
  //                 label="Year of Establishment"
  //                 value={hospital.year_of_establishment}
  //               />
  //               <Field label="Hospital Type" value={hospital.hospital_type} />
  //               <Field label="Bed Capacity" value={hospital.bed_capacity} />
  //             </Grid>
  //           ),
  //         },

  //         {
  //           title: "Hospital Banking Details 🏥",
  //           content: (
  //             <Grid>
  //               <Field label="Account Number" value={hospital.account_number} />
  //               <Field label="IFSC Code" value={hospital.ifsc_code} />
  //               <Field
  //                 label="Account Holder Name"
  //                 value={hospital.account_holder_name}
  //               />
  //               <Field label="Bank Name" value={hospital.bank_name} />
  //               <Field label="Branch Name" value={hospital.branch_name} />
  //             </Grid>
  //           ),
  //         },

  //         {
  //           title: "Departments & Services 🧪",
  //           content: (
  //             <Grid>
  //               <Field
  //                 label="Key Specialties"
  //                 value={hospital.key_specialties}
  //               />
  //               <Field
  //                 label="Major Procedures"
  //                 value={hospital.major_procedures}
  //               />
  //               <Field label="Departments" value={hospital.departments} />
  //             </Grid>
  //           ),
  //         },

  //         {
  //           title: "Registered Address 📍",
  //           content: (
  //             <Grid>
  //               <Field label="Address" value={hospital.registered_address} />
  //               <Field label="City" value={hospital.registered_city} />
  //               <Field label="District" value={hospital.registered_district} />
  //               <Field label="State" value={hospital.registered_state} />
  //               <Field label="Pincode" value={hospital.registered_pincode} />
  //               <Field
  //                 label="Branch Locations"
  //                 value={hospital.branch_locations}
  //               />
  //             </Grid>
  //           ),
  //         },

  //         {
  //           title: "Operational Metrics 📊",
  //           content: (
  //             <Grid>
  //               <Field
  //                 label="Monthly Patient Footfall"
  //                 value={hospital.avg_monthly_patient_footfall}
  //               />
  //               <Field
  //                 label="Average Ticket Size"
  //                 value={hospital.avg_ticket_size}
  //               />
  //             </Grid>
  //           ),
  //         },

  //         {
  //           title: "Hospital Contact 📞",
  //           content: (
  //             <Grid>
  //               <Field label="Hospital Email" value={hospital.hospital_email} />
  //               <Field label="Hospital Phone" value={hospital.hospital_phone} />
  //             </Grid>
  //           ),
  //         },

  //         {
  //           title: "Owner Details 👤",
  //           content: (
  //             <Grid>
  //               <Field label="Owner Name" value={hospital.owner_name} />
  //               <Field label="Owner Email" value={hospital.owner_email} />
  //               <Field label="Owner Phone" value={hospital.owner_phone} />
  //             </Grid>
  //           ),
  //         },
  //       ].map((section, idx) => (
  //         <div key={idx} style={{ marginBottom: "25px" }}>
  //           <h3
  //             style={{
  //               borderBottom: "1px solid #e5e7eb",
  //               paddingBottom: "6px",
  //               marginBottom: "15px",
  //               color: "#1f2937",
  //             }}
  //           >
  //             {section.title}
  //           </h3>
  //           {section.content}
  //         </div>
  //       ))}
  //     </div>
  //   </div>
  // );

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

      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
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
            boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
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
            Hospital Profile
          </span>

          <h1
            style={{
              margin: "8px 0 0",
              color: "#0f172a",
              fontSize: "42px",
              fontWeight: 900,
              letterSpacing: "-0.02em",
            }}
          >
            {hospital.hospital_legal_name || lan}
          </h1>
        </div>
      </div>

      {/* SECTION GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "35px",
        }}
      >
        {[
          {
            title: "Application Info",
            icon: "📄",
            content: (
              <Grid>
                <Field label="Application ID" value={hospital.application_id} highlight />
                <Field label="LAN" value={hospital.lan} />
                <Field label="Status" value={hospital.status} isStatus />
                <Field label="Created At" value={new Date(hospital.created_at).toLocaleDateString("en-GB")} />
              </Grid>
            ),
          },

          {
            title: "Hospital Profile",
            icon: "🏥",
            content: (
              <Grid>
                <Field label="Legal Name" value={hospital.hospital_legal_name} />
                <Field label="Brand Name" value={hospital.brand_name} />
                <Field label="Registration Number" value={hospital.hospital_registration_number} />
                <Field label="Year of Establishment" value={hospital.year_of_establishment} />
                <Field label="Hospital Type" value={hospital.hospital_type} />
                <Field label="Bed Capacity" value={hospital.bed_capacity} />
              </Grid>
            ),
          },

          {
            title: "Banking Details",
            icon: "🏦",
            content: (
              <Grid>
                <Field label="Account Number" value={hospital.account_number} />
                <Field label="IFSC Code" value={hospital.ifsc_code} />
                <Field label="Account Holder Name" value={hospital.account_holder_name} />
                <Field label="Bank Name" value={hospital.bank_name} />
                <Field label="Branch Name" value={hospital.branch_name} />
              </Grid>
            ),
          },

          {
            title: "Departments & Services",
            icon: "🧪",
            content: (
              <Grid>
                <Field label="Key Specialties" value={hospital.key_specialties} />
                <Field label="Major Procedures" value={hospital.major_procedures} />
                <Field label="Departments" value={hospital.departments} />
              </Grid>
            ),
          },

          {
            title: "Registered Address",
            icon: "📍",
            content: (
              <Grid>
                <Field label="Address" value={hospital.registered_address} />
                <Field label="City" value={hospital.registered_city} />
                <Field label="District" value={hospital.registered_district} />
                <Field label="State" value={hospital.registered_state} />
                <Field label="Pincode" value={hospital.registered_pincode} />
                <Field label="Branch Locations" value={hospital.branch_locations} />
              </Grid>
            ),
          },

          {
            title: "Operational Metrics",
            icon: "📊",
            content: (
              <Grid>
                <Field label="Monthly Patient Footfall" value={hospital.avg_monthly_patient_footfall} />
                <Field label="Average Ticket Size" value={hospital.avg_ticket_size} />
              </Grid>
            ),
          },

          {
            title: "Hospital Contact",
            icon: "📞",
            content: (
              <Grid>
                <Field label="Hospital Email" value={hospital.hospital_email} />
                <Field label="Hospital Phone" value={hospital.hospital_phone} />
              </Grid>
            ),
          },

          {
            title: "Owner Details",
            icon: "👤",
            content: (
              <Grid>
                <Field label="Owner Name" value={hospital.owner_name} />
                <Field label="Owner Email" value={hospital.owner_email} />
                <Field label="Owner Phone" value={hospital.owner_phone} />
              </Grid>
            ),
          },
        ].map((section, idx) => (
          <SectionCard key={idx} {...section} />
        ))}
      </div>
    </div>
  </div>
);

};


export default ClayyoHospitalDetails;

/* Shared Components */

// const Grid = ({ children }) => (
//   <div
//     style={{
//       display: "grid",
//       gridTemplateColumns: "repeat(2, 1fr)",
//       gap: "15px 30px",
//     }}
//   >
//     {children}
//   </div>
// );

// const Field = ({ label, value }) => (
//   <div>
//     <label
//       style={{
//         fontSize: "13px",
//         color: "#6b7280",
//       }}
//     >
//       {label}
//     </label>

//     <input
//       value={value || ""}
//       readOnly
//       style={{
//         width: "100%",
//         padding: "6px 8px",
//         marginTop: "4px",
//         border: "1px solid #d1d5db",
//         borderRadius: "4px",
//         background: "#f9fafb",
//       }}
//     />
//   </div>
// );


const SectionCard = ({ title, icon, content }) => (
  <div
    style={{
      background: "#ffffff",
      borderRadius: "24px",
      padding: "40px",
      boxShadow:
        "0 10px 15px rgba(0,0,0,0.04)",
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
      <span style={{ fontSize: "28px" }}>{icon}</span>

      <h3
        style={{
          margin: 0,
          fontSize: "22px",
          fontWeight: 800,
          textTransform: "uppercase",
          color: "#1e293b",
          letterSpacing: "0.02em",
        }}
      >
        {title}
      </h3>
    </div>

    {content}
  </div>
);

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

const Field = ({ label, value, highlight, isStatus }) => {
  const statusColors = {
    ACTIVE: { bg: "#dcfce7", text: "#166534" },
    INACTIVE: { bg: "#fee2e2", text: "#991b1b" },
  };

  const s = statusColors[value] || {
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
            fontWeight: 800,
            background: s.bg,
            color: s.text,
            width: "fit-content",
          }}
        >
          {value || "—"}
        </span>
      ) : (
        <div
          style={{
            fontSize: "18px",
            fontWeight: highlight ? 900 : 700,
            color: highlight ? "#0284c7" : "#1e293b",
          }}
        >
          {value || "—"}
        </div>
      )}
    </div>
  );
};