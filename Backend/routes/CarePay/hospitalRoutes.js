const express = require("express");
const db = require("../../config/db");
const verifyApiKey = require("../../middleware/apiKeyAuth");
const { CAREPAY_HOSPITAL_REQUIRED_FIELDS } = require("../../utils/constant");

module.exports = function createCarePayHospitalRoutes({
  generateLoanIdentifiers,
  getMissingFields,
  nullableString,
  isCarePayPartner,
}) {
  const router = express.Router();

router.post("/v1/carepay-hospitals/create", verifyApiKey, async (req, res) => {
  try {
    const partner = req.partner.name || {};
    if (partner.toLowerCase().trim() !== "carepay") {
      return res
        .status(403)
        .json({ message: "This route is only for CarePay partner." });
    }
    const data = req.body || {};
    const missing = getMissingFields(data, CAREPAY_HOSPITAL_REQUIRED_FIELDS);

    if (missing.length) {
      return res.status(400).json({
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }

    const partnerLoanId = nullableString(data.partner_loan_id);
    const { lan } = await generateLoanIdentifiers("carepay-hospital");

    const fields = {
      partner_loan_id: partnerLoanId,
      lan,
      hospital_legal_name: data.hospital_legal_name,
      brand_name: nullableString(data.brand_name),
      branch_locations: nullableString(data.branch_locations),
      hospital_registration_number: nullableString(
        data.hospital_registration_number,
      ),
      year_of_establishment: nullableString(data.year_of_establishment),
      hospital_type: nullableString(data.hospital_type),
      bed_capacity: nullableString(data.bed_capacity),
      key_specialties: nullableString(data.key_specialties),
      major_procedures: nullableString(data.major_procedures),
      departments: nullableString(data.departments),
      registered_address: data.registered_address,
      registered_city: data.registered_city,
      registered_district: data.registered_district,
      registered_state: data.registered_state,
      registered_pincode: data.registered_pincode,
      hospital_email: nullableString(data.hospital_email),
      hospital_phone: data.hospital_phone,
      contact_person_name: data.contact_person_name,
      contact_person_email: nullableString(data.contact_person_email),
      contact_person_phone: data.contact_person_phone,
      ifsc_code: data.ifsc_code,
      bank_name: data.bank_name,
      branch_name: data.branch_name,
      account_holder_name: data.account_holder_name,
      account_number: data.account_number,
      status: "PENDING",
      created_at: new Date(),
    };

    const columns = Object.keys(fields).join(", ");
    const placeholders = Object.keys(fields)
      .map(() => "?")
      .join(", ");
    const values = Object.values(fields);

    await db
      .promise()
      .query(
        `INSERT INTO carepay_hospital_booking (${columns}) VALUES (${placeholders})`,
        values,
      );

    return res.json({
      message: "CarePay hospital created successfully",
      lan,
      partner_loan_id: partnerLoanId,
    });
  } catch (err) {
    console.error("CarePay hospital creation error:", err);

    return res.status(500).json({
      message: "CarePay hospital creation failed",
      error: err.sqlMessage || err.message,
    });
  }
});

////////// CARE PAY HOSPITAL LIST FOR CAREPAY PARTNER (for excel upload) //////////
router.get("/v1/carepay-hospitals-list", verifyApiKey, async (req, res) => {
  try {
    if (!isCarePayPartner(req)) {
      return res
        .status(403)
        .json({ message: "This route is only for CarePay partner." });
    }

    const [rows] = await db.promise().query(`
      SELECT
        id,
        partner_loan_id,
        lan,
        hospital_legal_name,
        registered_city,
        registered_district,
        registered_state,
        bank_name,
        account_holder_name,
        account_number,
        ifsc_code
      FROM carepay_hospital_booking
      WHERE status IN ('ACTIVE', 'APPROVED')
      ORDER BY hospital_legal_name ASC
    `);

    return res.json(
      rows.map((hospital) => ({
        id: hospital.id,
        partner_loan_id: hospital.partner_loan_id,
        lan: hospital.lan,
        name: `${hospital.hospital_legal_name} (${hospital.registered_city}, ${hospital.registered_district})`,
        hospital_legal_name: hospital.hospital_legal_name,
        city: hospital.registered_city,
        district: hospital.registered_district,
        state: hospital.registered_state,
        bank_name: hospital.bank_name,
        account_holder_name: hospital.account_holder_name,
        account_number: hospital.account_number,
        ifsc_code: hospital.ifsc_code,
      })),
    );
  } catch (err) {
    console.error("CarePay hospital list error:", err);

    return res.status(500).json({
      message: "Failed to fetch CarePay hospitals",
      error: err.message,
    });
  }
});

router.get("/carepay-hospitals", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT
        id,
        partner_loan_id,
        lan,
        hospital_legal_name,
        brand_name,
        hospital_type,
        bed_capacity,
        registered_city,
        registered_district,
        registered_state,
        hospital_phone,
        contact_person_name,
        bank_name,
        account_holder_name,
        account_number,
        ifsc_code,
        CASE WHEN status = 'ACTIVE' THEN 'APPROVED' ELSE status END AS status,
        created_at
      FROM carepay_hospital_booking
      WHERE status IN ('PENDING', 'APPROVED', 'ACTIVE')
      ORDER BY created_at DESC
    `);

    return res.json(rows);
  } catch (err) {
    console.error("CarePay hospital fetch error:", err);

    return res.status(500).json({
      message: "Failed to fetch CarePay hospitals",
      error: err.message,
    });
  }
});

////////////////// CARE PAY HOSPITAL PENDING CASES FOR ADMIN APPROVAL //////////
router.get("/carepay-hospitals-login-loans", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT
        id,
        partner_loan_id,
        lan,
        hospital_legal_name,
        brand_name,
        hospital_type,
        bed_capacity,
        registered_city,
        registered_district,
        registered_state,
        hospital_phone,
        contact_person_name,
        bank_name,
        account_holder_name,
        account_number,
        ifsc_code,
        status,
        created_at
      FROM carepay_hospital_booking
      WHERE status = 'PENDING'
      ORDER BY created_at DESC
    `);

    return res.json(rows);
  } catch (err) {
    console.error("CarePay hospital pending fetch error:", err);

    return res.status(500).json({
      message: "Failed to fetch pending CarePay hospitals",
      error: err.message,
    });
  }
});

////////////// CARE PAY HOSPITAL DETAILS BY LAN (for admin view and excel upload) //////////
router.get("/carepay-hospital-booking-details/:lan", async (req, res) => {
  const { lan } = req.params;

  try {
    const [rows] = await db.promise().query(
      `
      SELECT
        id,
        partner_loan_id,
        lan,
        hospital_legal_name,
        brand_name,
        branch_locations,
        hospital_registration_number,
        year_of_establishment,
        hospital_type,
        bed_capacity,
        key_specialties,
        major_procedures,
        departments,
        registered_address,
        registered_city,
        registered_district,
        registered_state,
        registered_pincode,
        hospital_email,
        hospital_phone,
        contact_person_name,
        contact_person_email,
        contact_person_phone,
        ifsc_code,
        bank_name,
        branch_name,
        account_holder_name,
        account_number,
        CASE WHEN status = 'ACTIVE' THEN 'APPROVED' ELSE status END AS status,
        created_at
      FROM carepay_hospital_booking
      WHERE lan = ?
      LIMIT 1
      `,
      [lan],
    );

    return res.json(rows[0] || null);
  } catch (err) {
    console.error("CarePay hospital details fetch error:", err);

    return res.status(500).json({
      message: "Failed to fetch CarePay hospital details",
      error: err.message,
    });
  }
});

//////////////// CARE PAY HOSPITAL STATUS UPDATE BY LAN (for admin approval and excel upload) //////////
router.patch("/carepay-hospitals/status/:lan", async (req, res) => {
  try {
    const { lan } = req.params;
    const status = String(req.body?.status || "")
      .toUpperCase()
      .trim();

    if (!["PENDING", "APPROVED"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status. Allowed values are PENDING and APPROVED.",
      });
    }

    const [result] = await db
      .promise()
      .query(`UPDATE carepay_hospital_booking SET status = ? WHERE lan = ?`, [
        status,
        lan,
      ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: `Hospital not found: ${lan}` });
    }

    return res.json({ message: "Status updated successfully", status });
  } catch (err) {
    console.error("CarePay hospital status update error:", err);

    return res.status(500).json({
      message: "Failed to update CarePay hospital status",
      error: err.message,
    });
  }
});

  return router;
};
