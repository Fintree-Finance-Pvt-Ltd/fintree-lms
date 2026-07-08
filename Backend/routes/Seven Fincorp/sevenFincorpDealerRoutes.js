////////////////////////
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const db = require("../../config/db");
const {
  universalRunAllValidations,
} = require("../../utils/runValiationsEngine");
const { initAadhaarKyc } = require("../../services/digitapaadharservice");

const router = express.Router();

/*
====================================================
IDENTIFIER GENERATOR
====================================================
*/
const generateLoanIdentifiers = async (lender) => {
  let prefixLan = "SFDLR";
  let applicationPrefix = "SFDLRAPP";
  let custPrefixLan = "SFL";
  let custPartnerLoanId = "SFFFPL";

  const [rows] = await db
    .promise()
    .query(
      "SELECT last_sequence FROM loan_sequences WHERE lender_name=? FOR UPDATE",
      [lender],
    );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;

    await db
      .promise()
      .query("UPDATE loan_sequences SET last_sequence=? WHERE lender_name=?", [
        newSequence,
        lender,
      ]);
  } else {
    newSequence = 11000;

    await db
      .promise()
      .query(
        "INSERT INTO loan_sequences (lender_name,last_sequence) VALUES (?,?)",
        [lender, newSequence],
      );
  }

  return {
    application_id: `${applicationPrefix}${newSequence}`,
    lan: `${prefixLan}${newSequence}`,
    cust_lan: `${custPrefixLan}${newSequence}`,
    cust_partner_loan_id: `${custPartnerLoanId}${newSequence}`,
  };
};

const OTP_EXPIRY_SECONDS = 300;

const emptyToNull = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return value;
};

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};

/*
====================================================
MULTER CONFIG
====================================================
*/
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/cheques/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const uploadCheque = multer({ storage });

/*
====================================================
CREATE DEALER + MULTIPLE PRODUCTS
====================================================
*/
router.post("/dealer/create", async (req, res) => {
  try {
    const data = req.body;

    const { lan, application_id } = await generateLoanIdentifiers(
      "SEVEN_FINCORP_DEALER",
    );

    const dealerQuery = `
      INSERT INTO seven_fincorp_dealer_booking
      (
        application_id, lan, dealer_id,
        business_name, trade_name, business_type,
        pan_number, gst_number,
        owner_name, owner_mobile, owner_email,
        showroom_address, city, state, pincode,
        bank_name, branch_name, account_holder_name, account_number, ifsc_code,
        cheque_file_path, cheque_ocr_bank_name, cheque_ocr_branch_name,
        cheque_ocr_account_holder_name, cheque_ocr_account_number,
        cheque_ocr_ifsc_code, cheque_ocr_response,
        cheque_uploaded_at,
        status, created_at, login_date
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),'ACTIVE',NOW(),CURDATE())
    `;

    const dealerValues = [
      application_id,
      lan,
      lan,

      data.business_name,
      data.trade_name || null,
      data.business_type,

      data.pan_number,
      data.gst_number,

      data.owner_name,
      data.owner_mobile,
      data.owner_email || null,

      data.showroom_address,
      data.city,
      data.state,
      data.pincode,

      data.bank_name,
      data.branch_name?.trim() || null,
      data.account_holder_name,
      data.account_number,
      data.ifsc_code,

      data.cheque_file_path || null,
      data.cheque_ocr_bank_name || null,
      data.cheque_ocr_branch_name || null,
      data.cheque_ocr_account_holder_name || null,
      data.cheque_ocr_account_number || null,
      data.cheque_ocr_ifsc_code || null,
      JSON.stringify(data.cheque_ocr_response || {}),
    ];

    await db.promise().query(dealerQuery, dealerValues);

    /*
    ============================
    INSERT MULTIPLE PRODUCTS
    ============================
    */
    if (data.products && data.products.length > 0) {
      const productQuery = `
        INSERT INTO seven_fincorp_dealer_products
        (application_id, battery_type, battery_name, e_rickshaw_model, e_rickshaw_model_price)
        VALUES ?
      `;

      const productValues = data.products.map((p) => [
        application_id,
        p.battery_type || null,
        p.battery_name || null,
        p.e_rickshaw_model || null,
        p.price || null,
      ]);

      await db.promise().query(productQuery, [productValues]);
    }

    res.json({
      message: "Dealer + Products created successfully",
      lan,
      application_id,
    });
  } catch (err) {
    console.error("Insert Error:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        message: "Duplicate entry found",
      });
    }

    res.status(500).json({
      message: "Dealer creation failed",
      error: err.message,
    });
  }
});

/*
====================================================
PRODUCT APIs
====================================================
*/

// ➕ Add Product
router.post("/dealer/product/add", async (req, res) => {
  try {
    const {
      application_id,
      battery_type,
      battery_name,
      e_rickshaw_model,
      price,
    } = req.body;

    await db.promise().query(
      `
      INSERT INTO seven_fincorp_dealer_products
      (application_id, battery_type, battery_name, e_rickshaw_model, e_rickshaw_model_price)
      VALUES (?, ?, ?, ?, ?)
    `,
      [application_id, battery_type, battery_name, e_rickshaw_model, price],
    );

    res.json({ message: "Product added successfully" });
  } catch (err) {
    res.status(500).json({ message: "Insert failed", error: err.message });
  }
});

// ✏️ Update Product
router.put("/dealer/product/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { battery_type, battery_name, e_rickshaw_model, price } = req.body;

    await db.promise().query(
      `
      UPDATE seven_fincorp_dealer_products
      SET battery_type=?, battery_name=?, e_rickshaw_model=?, e_rickshaw_model_price=?
      WHERE id=?
    `,
      [battery_type, battery_name, e_rickshaw_model, price, id],
    );

    res.json({ message: "Product updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});

// ❌ Delete Product
router.delete("/dealer/product/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await db.promise().query(
      `
      DELETE FROM seven_fincorp_dealer_products WHERE id=?
    `,
      [id],
    );

    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

// 📋 Get Products
router.get("/dealer/:application_id/products", async (req, res) => {
  try {
    const { application_id } = req.params;

    const [rows] = await db.promise().query(
      `
      SELECT * FROM seven_fincorp_dealer_products
      WHERE application_id=?
    `,
      [application_id],
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
});

/*
====================================================
UPLOAD CHEQUE OCR
====================================================
*/
router.post(
  "/dealer/:lan/upload-cheque",
  uploadCheque.single("cheque"),
  async (req, res) => {
    try {
      const { lan } = req.params;

      const formData = new FormData();
      formData.append("file", fs.createReadStream(req.file.path));

      const ocrResponse = await axios.post(
        process.env.CHEQUE_OCR_API,
        formData,
        { headers: formData.getHeaders() },
      );

      const ocr = ocrResponse.data;

      await db.promise().query(
        `
        UPDATE seven_fincorp_dealer_booking
        SET cheque_file_path=?, cheque_ocr_bank_name=?, cheque_ocr_branch_name=?,
            cheque_ocr_account_holder_name=?, cheque_ocr_account_number=?,
            cheque_ocr_ifsc_code=?, cheque_ocr_response=?, cheque_uploaded_at=NOW()
        WHERE lan=?
      `,
        [
          req.file.path,
          ocr.bank_name,
          ocr.branch_name,
          ocr.account_holder_name,
          ocr.account_number,
          ocr.ifsc_code,
          JSON.stringify(ocr),
          lan,
        ],
      );

      res.json({ message: "Cheque OCR success", ocr });
    } catch (err) {
      res.status(500).json({ message: "OCR failed", error: err.message });
    }
  },
);

// /////////////// Dealer Lists & Details routes are in a separate file for better organization ///////////////
router.get("/dealer-list", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT 
        lan,
        id,
        business_name,
        city,
        state
      FROM seven_fincorp_dealer_booking
      WHERE status IN ('APPROVED', 'ACTIVE')
      ORDER BY lan ASC
    `);

    const formatted = rows.map((d) => ({
      lan: d.lan,
      id: d.id,
      name: `${d.business_name} (${d.city}, ${d.state})`,
      business_name: d.business_name,
      city: d.city,
      state: d.state,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Dealer list error:", err);

    res.status(500).json({
      message: "Failed to fetch dealers",
      error: err.message,
    });
  }
});

////////////////////// Dealer list for loan booking //////////////////////////////////////////////
router.get("/dealersforbooking", async (req, res) => {
  try {
    const [dealers] = await db.promise().query(`
      SELECT 
        id,
        application_id,
        lan,
        dealer_id,
        business_name,
        trade_name,
        business_type,
        pan_number,
        gst_number,
        owner_name,
        owner_mobile,
        owner_email,
        showroom_address,
        city,
        state,
        pincode,
        bank_name,
        branch_name,
        account_holder_name,
        account_number,
        ifsc_code,
        status
      FROM seven_fincorp_dealer_booking
      WHERE status = 'ACTIVE'
      ORDER BY business_name ASC
    `);

    const [products] = await db.promise().query(`
      SELECT 
        id,
        application_id,
        battery_type,
        battery_name,
        e_rickshaw_model
      FROM seven_fincorp_dealer_products
      ORDER BY id ASC
    `);

    const dealersWithProducts = dealers.map((dealer) => ({
      ...dealer,
      products: products.filter(
        (product) => product.application_id === dealer.application_id,
      ),
    }));

    return res.status(200).json({
      success: true,
      dealers: dealersWithProducts,
    });
  } catch (error) {
    console.error("Fetch dealers error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dealers.",
    });
  }
});

//////////// Details route is in a separate file for better organization ///////////////
router.get("/dealer-details/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const [rows] = await db.promise().query(
      `SELECT 
        d.*,
        p.id AS product_id,
        p.battery_type,
        p.battery_name,
        p.e_rickshaw_model,
        p.e_rickshaw_model_price
      FROM seven_fincorp_dealer_booking d
      LEFT JOIN seven_fincorp_dealer_products p
        ON d.application_id = p.application_id
      WHERE d.lan = ?`,
      [lan],
    );

    // ❌ No dealer found
    if (rows.length === 0) {
      return res.status(404).json({
        message: "Dealer not found",
      });
    }

    /*
    ==========================
    TRANSFORM DATA
    ==========================
    */

    const dealer = {
      ...rows[0],

      products: rows
        .filter((r) => r.product_id !== null) // remove null rows
        .map((r) => ({
          id: r.product_id,
          battery_type: r.battery_type,
          battery_name: r.battery_name,
          e_rickshaw_model: r.e_rickshaw_model,
          price: r.e_rickshaw_model_price,
        })),
    };

    // ✅ Clean duplicate fields from root
    delete dealer.product_id;
    delete dealer.battery_type;
    delete dealer.battery_name;
    delete dealer.e_rickshaw_model;
    delete dealer.e_rickshaw_model_price;

    /*
    ==========================
    RESPONSE
    ==========================
    */

    res.json(dealer);
  } catch (err) {
    console.error("Dealer details error:", err);

    res.status(500).json({
      message: "Failed to fetch dealer details",
      error: err.message,
    });
  }
});

/////////// Dealer Approve/Reject routes are in a separate file for better organization ///////////////
router.get("/dealers-login-cases", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT 
        id,
        lan,
        business_name,
        trade_name,
        business_type,
        city,
        state,
        owner_name,
        owner_mobile,
        status,
        created_at
      FROM seven_fincorp_dealer_booking
      WHERE status = 'ACTIVE'
      ORDER BY created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("Dealer login cases error:", err);

    res.status(500).json({
      message: "Failed to fetch dealer cases",
      error: err.message,
    });
  }
});

router.patch("/dealer/status/:lan", async (req, res) => {
  try {
    const { lan } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        message: "Status is required",
      });
    }

    const [result] = await db.promise().query(
      `UPDATE seven_fincorp_dealer_booking 
       SET status = ?, updated_at = NOW() 
       WHERE lan = ?`,
      [status, lan],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Dealer not found",
      });
    }

    res.json({
      message: "Status updated successfully",
    });
  } catch (err) {
    console.error("Dealer status update error:", err);

    res.status(500).json({
      message: "Failed to update dealer status",
      error: err.message,
    });
  }
});

router.post("/upload/ev-customer-manual", async (req, res) => {
  const connection = await db.promise().getConnection();

  try {
    const data = req.body;
    console.log("Received loan booking data:", data);

    const [borrowerOtp] = await connection.query(
      `
  SELECT *
  FROM otp_consent_model
  WHERE mobile_number = ?
  AND applicant_type = ?
  AND verified = 1
  AND is_used = 0
  ORDER BY id DESC
  LIMIT 1
  `,
      [data.Mobile_Number, "BORROWER"],
    );

    if (!borrowerOtp.length) {
      return res.status(400).json({
        success: false,
        message: "Borrower mobile not verified",
      });
    }

    const [guarantorOtp] = await connection.query(
      `     SELECT *
    FROM otp_consent_model
    WHERE mobile_number = ?
    AND applicant_type = 'GUARANTOR'
    AND verified = 1
    AND is_used = 0
    ORDER BY id DESC
    LIMIT 1
    `,
      [data.GURANTOR_MOBILE],
    );

    if (!guarantorOtp.length) {
      return res.status(400).json({
        success: false,
        message: "Guarantor mobile not verified",
      });
    }

    if (data.Co_Applicant) {
      const [coApplicantOtp] = await connection.query(
        `       SELECT *
      FROM otp_consent_model
      WHERE mobile_number = ?
      AND applicant_type =
      'CO_APPLICANT'
      AND verified = 1
      AND is_used = 0
      ORDER BY id DESC
      LIMIT 1
      `,
        [data.Co_Applicant_Mobile],
      );

      if (!coApplicantOtp.length) {
        return res.status(400).json({
          success: false,
          message: "Co-applicant mobile not verified",
        });
      }
    }

    const { cust_lan, cust_partner_loan_id } = await generateLoanIdentifiers(
      "SEVEN_FINCORP_CUSTOMER",
    );

    await connection.beginTransaction();

    const values = [
      emptyToNull(data.lenderType),
      emptyToNull(data.lender),
      emptyToNull(data.product),
      emptyToNull(data.status),
      cust_partner_loan_id,
      cust_lan,

      emptyToNull(data.LOGIN_DATE),
      emptyToNull(data.First_Name),
      emptyToNull(data.Last_Name),
      emptyToNull(data.Customer_Name),
      emptyToNull(data.Borrower_DOB),
      emptyToNull(data.Father_Name),
      emptyToNull(data.Mobile_Number),
      emptyToNull(data.Email),
      emptyToNull(data.Pan_Card),
      emptyToNull(data.Gender),

      emptyToNull(data.Address_Line_1),
      emptyToNull(data.Address_Line_2),
      emptyToNull(data.Village),
      emptyToNull(data.District),
      emptyToNull(data.State),
      emptyToNull(data.Pincode),

      numberOrNull(data.Loan_Amount),
      numberOrNull(data.Interest_Rate),
      numberOrNull(data.Tenure),
      numberOrNull(data.Disbursal_Amount),
      numberOrNull(data.Processing_Fee),
      numberOrNull(data.Processing_Fee_Percentage),

      emptyToNull(data.GURANTOR),
      emptyToNull(data.GURANTOR_DOB),
      emptyToNull(data.GURANTOR_EMAIL),
      emptyToNull(data.GURANTOR_PAN),
      emptyToNull(data.GURANTOR_MOBILE),
      emptyToNull(data.Relationship_with_Borrower),
      emptyToNull(data.GURANTOR_Address_Line_1),
      emptyToNull(data.GURANTOR_Address_Line_2),
      emptyToNull(data.GURANTOR_Village),
      emptyToNull(data.GURANTOR_District),
      emptyToNull(data.GURANTOR_State),
      emptyToNull(data.GURANTOR_Pincode),

      emptyToNull(data.Co_Applicant),
      emptyToNull(data.Co_Applicant_DOB),
      emptyToNull(data.Co_Applicant_Email),
      emptyToNull(data.Co_Applicant_PAN),
      emptyToNull(data.Co_Applicant_Mobile),
      emptyToNull(data.Co_Applicant_Address_Line_1),
      emptyToNull(data.Co_Applicant_Address_Line_2),
      emptyToNull(data.Co_Applicant_Village),
      emptyToNull(data.Co_Applicant_District),
      emptyToNull(data.Co_Applicant_State),
      emptyToNull(data.Co_Applicant_Pincode),

      emptyToNull(data.customer_name_as_per_bank),
      emptyToNull(data.customer_bank_name),
      emptyToNull(data.customer_account_number),
      emptyToNull(data.bank_ifsc_code),

      emptyToNull(data.selected_dealer_application_id),
      emptyToNull(data.dealer_id),
      emptyToNull(data.trade_name),
      emptyToNull(data.dealer_name),
      emptyToNull(data.dealer_contact),
      emptyToNull(data.dealer_email),
      emptyToNull(data.gst_no),
      emptyToNull(data.pan_number),
      emptyToNull(data.dealer_address),
      emptyToNull(data.dealer_city),
      emptyToNull(data.dealer_state),
      emptyToNull(data.dealer_pincode),

      emptyToNull(data.bank_name),
      emptyToNull(data.account_number),
      emptyToNull(data.ifsc),
      emptyToNull(data.name_in_bank),

      numberOrNull(data.selected_product_id),
      emptyToNull(data.Battery_Name),
      emptyToNull(data.Battery_Type),
      emptyToNull(data.Battery_Serial_no_1),
      emptyToNull(data.Battery_Serial_no_2),
      emptyToNull(data.E_Rikshaw_model),
      emptyToNull(data.Chassis_no),
      // Add after emptyToNull(data.Chassis_no):
      emptyToNull(data.Driving_License),
      numberOrNull(data.GPS_Charges),
      emptyToNull(data.GURANTOR_Driving_Licence),
      emptyToNull(data.Co_Applicant_Driving_Licence),
      emptyToNull(data.branch_address),
      numberOrNull(data.insurance_cost),
      emptyToNull(data.insurance_company_provider),
      emptyToNull(data.insurance_policy_number),
      emptyToNull(data.policy_issued_date),
      emptyToNull(data.period_of_insurance),
      numberOrNull(data.cost_of_vehicle),
      numberOrNull(data.manufacturing_year),
      numberOrNull(data.downpayment_paid_by_borrower),
      numberOrNull(data.vehicle_registration_cost),
      emptyToNull(data.sales_invoice_number),
      emptyToNull(data.sales_invoice_date),
      data.borrower_mobile_verified || 0,
      data.guarantor_mobile_verified || 0,
      data.co_applicant_mobile_verified || 0,
    ];

    const insertQuery = `
      INSERT INTO loan_booking_seven_fincorp (
        lender_type,
        lender,
        product,
        status,
        partner_loan_id,
        lan,

        login_date,
        first_name,
        last_name,
        customer_name,
        dob,
        father_name,
        mobile_number,
        email,
        pan_card,
        gender,

        permanent_address_line_1,
        permanent_address_line_2,
        permanent_village_city,
        permanent_district,
        permanent_state,
        permanent_pincode,

        loan_amount,
        interest_rate,
        loan_tenure,
        disbursal_amount,
        processing_fee,
        processing_fee_percentage,

        guarantor_name,
        guarantor_dob,
        guarantor_email,
        guarantor_pan,
        guarantor_mobile,
        relationship_with_borrower,
        guarantor_address_line_1,
        guarantor_address_line_2,
        guarantor_village_city,
        guarantor_district,
        guarantor_state,
        guarantor_pincode,


        co_applicant_name,
        co_applicant_dob,
        co_applicant_email,
        co_applicant_pan,
        co_applicant_mobile,
        co_applicant_address_line_1,
        co_applicant_address_line_2,
        co_applicant_village_city,
        co_applicant_district,
        co_applicant_state,
        co_applicant_pincode,


        customer_name_as_per_bank,
        customer_bank_name,
        customer_account_number,
        bank_ifsc_code,

        selected_dealer_application_id,
        dealer_id,
        trade_name,
        dealer_name,
        dealer_contact,
        dealer_email,
        gst_no,
        pan_number,
        dealer_address,
        dealer_city,
        dealer_state,
        dealer_pincode,

        dealer_bank_name,
        dealer_account_number,
        dealer_ifsc,
        dealer_name_in_bank,

        selected_product_id,
        battery_name,
        battery_type,
        battery_serial_no_1,
        battery_serial_no_2,
        e_rikshaw_model,
        chassis_no,
        borrower_mobile_verified,
        guarantor_mobile_verified,
        co_applicant_mobile_verified
      )
      VALUES (${values.map(() => "?").join(", ")})
    `;

    await connection.query(insertQuery, values);

    await connection.query(
      `   UPDATE otp_consent_model
  SET is_used = 1
  WHERE mobile_number = ?
  AND applicant_type = ?
  `,
      [data.Mobile_Number, "BORROWER"],
    );

    await connection.query(
      `   UPDATE otp_consent_model
  SET is_used = 1
  WHERE mobile_number = ?
  AND applicant_type = ?
  `,
      [data.GURANTOR_MOBILE, "GUARANTOR"],
    );

    if (data.Co_Applicant) {
      await connection.query(
        `     UPDATE otp_consent_model
    SET is_used = 1
    WHERE mobile_number = ?
    AND applicant_type =
    'CO_APPLICANT'
    `,
        [data.Co_Applicant_Mobile],
      );
    }

    await connection.commit();

    universalRunAllValidations(cust_lan);

    return res.status(201).json({
      success: true,
      message: "Seven Fincorp loan booking saved successfully",
      partner_loan_id: cust_partner_loan_id,
      lan: cust_lan,
    });
  } catch (error) {
    await connection.rollback();

    console.error("Seven Fincorp loan booking save error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to save Seven Fincorp loan booking",
      error: error.message,
    });
  } finally {
    connection.release();
  }
});

// router.post("/save-borrower-first-section", async (req, res) => {
//   const connection = await db.promise().getConnection();

//   try {
//     const data = req.body;

//     const [borrowerOtp] = await connection.query(
//       `
//       SELECT *
//       FROM otp_consent_model
//       WHERE mobile_number = ?
//       AND applicant_type = ?
//       AND verified = 1
//       AND is_used = 0
//       ORDER BY id DESC
//       LIMIT 1
//       `,
//       [data.Mobile_Number, "BORROWER"],
//     );

//     if (!borrowerOtp.length) {
//       return res.status(400).json({
//         success: false,
//         message: "Borrower mobile not verified",
//       });
//     }

//     const { cust_lan, cust_partner_loan_id } = await generateLoanIdentifiers(
//       "SEVEN_FINCORP_CUSTOMER",
//     );

//     await connection.beginTransaction();

//     await connection.query(
//       `
//       INSERT INTO loan_booking_seven_fincorp (
//         lender_type,
//         lender,
//         product,
//         status,
//         stage,
//         partner_loan_id,
//         lan,
//         login_date,
//         first_name,
//         last_name,
//         customer_name,
//         dob,
//         father_name,
//         mobile_number,
//         email,
//         pan_card,
//         gender,
//         borrower_mobile_verified
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//       `,
//       [
//         emptyToNull(data.lenderType),
//         emptyToNull(data.lender),
//         emptyToNull(data.product),
//         "Login",
//         "Login",
//         cust_partner_loan_id,
//         cust_lan,
//         emptyToNull(data.LOGIN_DATE),
//         emptyToNull(data.First_Name),
//         emptyToNull(data.Last_Name),
//         emptyToNull(data.Customer_Name),
//         emptyToNull(data.Borrower_DOB),
//         emptyToNull(data.Father_Name),
//         emptyToNull(data.Mobile_Number),
//         emptyToNull(data.Email),
//         emptyToNull(data.Pan_Card),
//         emptyToNull(data.Gender),
//         data.borrower_mobile_verified || 1,
//       ],
//     );

//     await connection.query(
//       `
//       UPDATE otp_consent_model
//       SET is_used = 1
//       WHERE id = ?
//       `,
//       [borrowerOtp[0].id],
//     );

//     await connection.query(
//       `
//       INSERT IGNORE INTO kyc_verification_status (
//         lan,
//         applicant_type,
//         applicant_name,
//         mobile_number,
//         pan_number
//       )
//       VALUES (?, ?, ?, ?, ?)
//       `,
//       [
//         cust_lan,
//         "BORROWER",
//         data.Customer_Name,
//         data.Mobile_Number,
//         data.Pan_Card,
//       ],
//     );

//     await connection.commit();

//     return res.status(201).json({
//       success: true,
//       message: "Borrower saved and LAN generated",
//       lan: cust_lan,
//       partner_loan_id: cust_partner_loan_id,
//     });
//   } catch (error) {
//     await connection.rollback();

//     return res.status(500).json({
//       success: false,
//       message: "Failed to save borrower section",
//       error: error.message,
//     });
//   } finally {
//     connection.release();
//   }
// });

// router.post("/final-submit-ev-customer-manual", async (req, res) => {
//   const connection = await db.promise().getConnection();

//   try {
//     const data = req.body;

//     if (!data.lan) {
//       return res.status(400).json({
//         success: false,
//         message: "LAN required. Please save borrower first.",
//       });
//     }

//     await connection.beginTransaction();

//     await connection.query(
//       `
//       UPDATE loan_booking_seven_fincorp
//       SET
//         permanent_address_line_1 = ?,
//         permanent_address_line_2 = ?,
//         permanent_village_city = ?,
//         permanent_district = ?,
//         permanent_state = ?,
//         permanent_pincode = ?,

//         requested_loan_amount = ?,
//         interest_rate = ?,
//         loan_tenure = ?,
//         disbursal_amount = ?,
//         processing_fee = ?,
//         processing_fee_percentage = ?,

//         guarantor_name = ?,
//         guarantor_dob = ?,
//         guarantor_email = ?,
//         guarantor_pan = ?,
//         guarantor_mobile = ?,
//         relationship_with_borrower = ?,
//         guarantor_address_line_1 = ?,
//         guarantor_address_line_2 = ?,
//         guarantor_village_city = ?,
//         guarantor_district = ?,
//         guarantor_state = ?,
//         guarantor_pincode = ?,

//         co_applicant_name = ?,
//         co_applicant_dob = ?,
//         co_applicant_email = ?,
//         co_applicant_pan = ?,
//         co_applicant_mobile = ?,
//         co_applicant_address_line_1 = ?,
//         co_applicant_address_line_2 = ?,
//         co_applicant_village_city = ?,
//         co_applicant_district = ?,
//         co_applicant_state = ?,
//         co_applicant_pincode = ?,

//         customer_name_as_per_bank = ?,
//         customer_bank_name = ?,
//         customer_account_number = ?,
//         bank_ifsc_code = ?,

//         selected_dealer_application_id = ?,
//         dealer_id = ?,
//         trade_name = ?,
//         dealer_name = ?,
//         dealer_contact = ?,
//         dealer_email = ?,
//         gst_no = ?,
//         pan_number = ?,
//         dealer_address = ?,
//         dealer_city = ?,
//         dealer_state = ?,
//         dealer_pincode = ?,

//         dealer_bank_name = ?,
//         dealer_account_number = ?,
//         dealer_ifsc = ?,
//         dealer_name_in_bank = ?,

//         selected_product_id = ?,
//         battery_name = ?,
//         battery_type = ?,
//         battery_serial_no_1 = ?,
//         battery_serial_no_2 = ?,
//         e_rikshaw_model = ?,
//         chassis_no = ?,

//         borrower_mobile_verified = ?,
//         guarantor_mobile_verified = ?,
//         co_applicant_mobile_verified = ?
//       WHERE lan = ?
//       `,
//       [
//         emptyToNull(data.Address_Line_1),
//         emptyToNull(data.Address_Line_2),
//         emptyToNull(data.Village),
//         emptyToNull(data.District),
//         emptyToNull(data.State),
//         emptyToNull(data.Pincode),

//         numberOrNull(data.Loan_Amount),
//         numberOrNull(data.Interest_Rate),
//         numberOrNull(data.Tenure),
//         numberOrNull(data.Disbursal_Amount),
//         numberOrNull(data.Processing_Fee),
//         numberOrNull(data.Processing_Fee_Percentage),

//         emptyToNull(data.GURANTOR),
//         emptyToNull(data.GURANTOR_DOB),
//         emptyToNull(data.GURANTOR_EMAIL),
//         emptyToNull(data.GURANTOR_PAN),
//         emptyToNull(data.GURANTOR_MOBILE),
//         emptyToNull(data.Relationship_with_Borrower),
//         emptyToNull(data.GURANTOR_Address_Line_1),
//         emptyToNull(data.GURANTOR_Address_Line_2),
//         emptyToNull(data.GURANTOR_Village),
//         emptyToNull(data.GURANTOR_District),
//         emptyToNull(data.GURANTOR_State),
//         emptyToNull(data.GURANTOR_Pincode),

//         emptyToNull(data.Co_Applicant),
//         emptyToNull(data.Co_Applicant_DOB),
//         emptyToNull(data.Co_Applicant_Email),
//         emptyToNull(data.Co_Applicant_PAN),
//         emptyToNull(data.Co_Applicant_Mobile),
//         emptyToNull(data.Co_Applicant_Address_Line_1),
//         emptyToNull(data.Co_Applicant_Address_Line_2),
//         emptyToNull(data.Co_Applicant_Village),
//         emptyToNull(data.Co_Applicant_District),
//         emptyToNull(data.Co_Applicant_State),
//         emptyToNull(data.Co_Applicant_Pincode),

//         emptyToNull(data.customer_name_as_per_bank),
//         emptyToNull(data.customer_bank_name),
//         emptyToNull(data.customer_account_number),
//         emptyToNull(data.bank_ifsc_code),

//         emptyToNull(data.selected_dealer_application_id),
//         emptyToNull(data.dealer_id),
//         emptyToNull(data.trade_name),
//         emptyToNull(data.dealer_name),
//         emptyToNull(data.dealer_contact),
//         emptyToNull(data.dealer_email),
//         emptyToNull(data.gst_no),
//         emptyToNull(data.pan_number),
//         emptyToNull(data.dealer_address),
//         emptyToNull(data.dealer_city),
//         emptyToNull(data.dealer_state),
//         emptyToNull(data.dealer_pincode),

//         emptyToNull(data.bank_name),
//         emptyToNull(data.account_number),
//         emptyToNull(data.ifsc),
//         emptyToNull(data.name_in_bank),

//         numberOrNull(data.selected_product_id),
//         emptyToNull(data.Battery_Name),
//         emptyToNull(data.Battery_Type),
//         emptyToNull(data.Battery_Serial_no_1),
//         emptyToNull(data.Battery_Serial_no_2),
//         emptyToNull(data.E_Rikshaw_model),
//         emptyToNull(data.Chassis_no),

//         data.borrower_mobile_verified || 0,
//         data.guarantor_mobile_verified || 0,
//         data.co_applicant_mobile_verified || 0,

//         data.lan,
//       ],
//     );

//     await connection.commit();

//     universalRunAllValidations(data.lan).catch((err) => {
//       console.error("Validation engine failed after booking:", err);
//     });

//     return res.json({
//       success: true,
//       message: "Seven Fincorp loan booking submitted successfully",
//       lan: data.lan,
//     });
//   } catch (error) {
//     await connection.rollback();

//     console.error("Final Motion Corp submit error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Final submit failed",
//       error: error.message,
//     });
//   } finally {
//     connection.release();
//   }
// });
router.post("/save-borrower-first-section", async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    connection = await db.promise().getConnection();

    const data = req.body;
    const section = Number(data.activeSection || 0);
    const existingLan = data.lan ? String(data.lan).trim() : "";

    await connection.beginTransaction();
    transactionStarted = true;

    // SECTION 0: INSERT first time / UPDATE if LAN already exists
    if (section === 0) {
      if (existingLan) {
        const [updateResult] = await connection.query(
          `
          UPDATE loan_booking_seven_fincorp
          SET
            lender_type = ?,
            lender = ?,
            product = ?,
            login_date = ?,
            first_name = ?,
            last_name = ?,
            customer_name = ?,
            dob = ?,
            father_name = ?,
            mobile_number = ?,
            email = ?,
            pan_card = ?,
            gender = ?,
            driving_license = ?,
            borrower_mobile_verified = ?
          WHERE lan = ?
          `,
          [
            emptyToNull(data.lenderType),
            emptyToNull(data.lender),
            emptyToNull(data.product),
            emptyToNull(data.LOGIN_DATE),
            emptyToNull(data.First_Name),
            emptyToNull(data.Last_Name),
            emptyToNull(data.Customer_Name),
            emptyToNull(data.Borrower_DOB),
            emptyToNull(data.Father_Name),
            emptyToNull(data.Mobile_Number),
            emptyToNull(data.Email),
            emptyToNull(data.Pan_Card),
            emptyToNull(data.Gender),
            emptyToNull(data.Driving_License),
            data.borrower_mobile_verified || 1,
            existingLan,
          ]
        );

        if (updateResult.affectedRows === 0) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(404).json({
            success: false,
            message: "LAN not found",
          });
        }

        await connection.commit();
        transactionStarted = false;

        return res.json({
          success: true,
          message: "Borrower section updated",
          lan: existingLan,
          partner_loan_id: data.partner_loan_id || "",
        });
      }

      const [borrowerOtp] = await connection.query(
        `
        SELECT *
        FROM otp_consent_model
        WHERE mobile_number = ?
        AND applicant_type = ?
        AND verified = 1
        AND is_used = 0
        ORDER BY id DESC
        LIMIT 1
        `,
        [data.Mobile_Number, "BORROWER"]
      );

      if (!borrowerOtp.length) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "Borrower mobile not verified",
        });
      }

      const { cust_lan, cust_partner_loan_id } =
        await generateLoanIdentifiers( "SEVEN_FINCORP_CUSTOMER");

      await connection.query(
        `
        INSERT INTO loan_booking_seven_fincorp (
          lender_type,
          lender,
          product,
          status,
          stage,
          partner_loan_id,
          lan,
          login_date,
          first_name,
          last_name,
          customer_name,
          dob,
          father_name,
          mobile_number,
          email,
          pan_card,
          gender,
          driving_license,
          borrower_mobile_verified,
          gps_charges
        )
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)        `,
        [
          emptyToNull(data.lenderType),
          emptyToNull(data.lender),
          emptyToNull(data.product),
          "Login",
          "Login",
          cust_partner_loan_id,
          cust_lan,
          emptyToNull(data.LOGIN_DATE),
          emptyToNull(data.First_Name),
          emptyToNull(data.Last_Name),
          emptyToNull(data.Customer_Name),
          emptyToNull(data.Borrower_DOB),
          emptyToNull(data.Father_Name),
          emptyToNull(data.Mobile_Number),
          emptyToNull(data.Email),
          emptyToNull(data.Pan_Card),
          emptyToNull(data.Gender),
          emptyToNull(data.Driving_License),
          data.borrower_mobile_verified || 1,
          emptyToNull(data.GPS_Charges),
        ]
      );

      await connection.query(
        `
        UPDATE otp_consent_model
        SET is_used = 1
        WHERE id = ?
        `,
        [borrowerOtp[0].id]
      );

      await connection.query(
        `
        INSERT IGNORE INTO kyc_verification_status (
          lan,
          applicant_type,
          applicant_name,
          mobile_number,
          pan_number
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          cust_lan,
          "BORROWER",
          data.Customer_Name,
          data.Mobile_Number,
          data.Pan_Card,
        ]
      );

      await connection.commit();
      transactionStarted = false;

      return res.status(201).json({
        success: true,
        message: "Borrower saved and LAN generated",
        lan: cust_lan,
        partner_loan_id: cust_partner_loan_id,
      });
    }

    // SECTION 1 ONWARD: LAN IS REQUIRED
    if (!existingLan) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "LAN is required to save this section",
      });
    }

    let query = "";
    let values = [];

    // SECTION 1: Address
    if (section === 1) {
      query = `
        UPDATE loan_booking_seven_fincorp
        SET
          permanent_address_line_1 = ?,
          permanent_address_line_2 = ?,
          permanent_village_city = ?,
          permanent_district = ?,
          permanent_state = ?,
          permanent_pincode = ?
        WHERE lan = ?
      `;

      values = [
        emptyToNull(data.Address_Line_1),
        emptyToNull(data.Address_Line_2),
        emptyToNull(data.Village),
        emptyToNull(data.District),
        emptyToNull(data.State),
        emptyToNull(data.Pincode),
        existingLan,
      ];
    }

    // SECTION 2: Loan Details
    else if (section === 2) {
      query = `
        UPDATE loan_booking_seven_fincorp
        SET
          requested_loan_amount = ?,
          loan_amount = ?,
          interest_rate = ?,
          loan_tenure = ?,
          processing_fee = ?,
          processing_fee_percentage = ?,
          disbursal_amount = ?,
          gps_charges = ?
        WHERE lan = ?
      `;

      values = [
        emptyToNull(data.Loan_Amount),
        emptyToNull(data.Loan_Amount),
        emptyToNull(data.Interest_Rate),
        emptyToNull(data.Tenure),
        emptyToNull(data.Processing_Fee),
        emptyToNull(data.Processing_Fee_Percentage),
        emptyToNull(data.Disbursal_Amount),
        emptyToNull(data.GPS_Charges),
        existingLan,
      ];
    }

    // SECTION 3: Guarantor
    else if (section === 3) {
      query = `
        UPDATE loan_booking_seven_fincorp
        SET
          guarantor_name = ?,
          guarantor_dob = ?,
          guarantor_email = ?,
          guarantor_pan = ?,
          guarantor_mobile = ?,
          relationship_with_borrower = ?,
          guarantor_address_line_1 = ?,
          guarantor_address_line_2 = ?,
          guarantor_village_city = ?,
          guarantor_district = ?,
          guarantor_state = ?,
          guarantor_pincode = ?,
          guarantor_mobile_verified = ?
        WHERE lan = ?
      `;

      values = [
        emptyToNull(data.GURANTOR),
        emptyToNull(data.GURANTOR_DOB),
        emptyToNull(data.GURANTOR_EMAIL),
        emptyToNull(data.GURANTOR_PAN),
        emptyToNull(data.GURANTOR_MOBILE),
        emptyToNull(data.Relationship_with_Borrower),
        emptyToNull(data.GURANTOR_Address_Line_1),
        emptyToNull(data.GURANTOR_Address_Line_2),
        emptyToNull(data.GURANTOR_Village),
        emptyToNull(data.GURANTOR_District),
        emptyToNull(data.GURANTOR_State),
        emptyToNull(data.GURANTOR_Pincode),
        data.guarantor_mobile_verified || 0,
        existingLan,
      ];
    }

    // SECTION 4: Co-Applicant
    else if (section === 4) {
      query = `
        UPDATE loan_booking_seven_fincorp
        SET
          co_applicant_name = ?,
          co_applicant_dob = ?,
          co_applicant_email = ?,
          co_applicant_pan = ?,
          co_applicant_mobile = ?,
          co_applicant_address_line_1 = ?,
          co_applicant_address_line_2 = ?,
          co_applicant_village_city = ?,
          co_applicant_district = ?,
          co_applicant_state = ?,
          co_applicant_pincode = ?,
          co_applicant_mobile_verified = ?
        WHERE lan = ?
      `;

      values = [
        emptyToNull(data.Co_Applicant),
        emptyToNull(data.Co_Applicant_DOB),
        emptyToNull(data.Co_Applicant_Email),
        emptyToNull(data.Co_Applicant_PAN),
        emptyToNull(data.Co_Applicant_Mobile),
        emptyToNull(data.Co_Applicant_Address_Line_1),
        emptyToNull(data.Co_Applicant_Address_Line_2),
        emptyToNull(data.Co_Applicant_Village),
        emptyToNull(data.Co_Applicant_District),
        emptyToNull(data.Co_Applicant_State),
        emptyToNull(data.Co_Applicant_Pincode),
        data.co_applicant_mobile_verified || 0,
        existingLan,
      ];
    }

    // SECTION 5: Customer Bank Details
    else if (section === 5) {
      query = `
        UPDATE loan_booking_seven_fincorp
        SET
          customer_name_as_per_bank = ?,
          customer_bank_name = ?,
          customer_account_number = ?,
          bank_ifsc_code = ?
        WHERE lan = ?
      `;

      values = [
        emptyToNull(data.customer_name_as_per_bank),
        emptyToNull(data.customer_bank_name),
        emptyToNull(data.customer_account_number),
        emptyToNull(data.bank_ifsc_code),
        existingLan,
      ];
    }

    // SECTION 6: Dealer Details
    else if (section === 6) {
      query = `
        UPDATE loan_booking_seven_fincorp
        SET
          selected_dealer_application_id = ?,
          dealer_id = ?,
          trade_name = ?,
          dealer_name = ?,
          dealer_contact = ?,
          dealer_email = ?,
          gst_no = ?,
          pan_number = ?,
          dealer_address = ?,
          dealer_city = ?,
          dealer_state = ?,
          dealer_pincode = ?,
          dealer_bank_name = ?,
          dealer_account_number = ?,
          dealer_ifsc = ?,
          dealer_name_in_bank = ?
        WHERE lan = ?
      `;

      values = [
        emptyToNull(data.selected_dealer_application_id),
        emptyToNull(data.dealer_id),
        emptyToNull(data.trade_name),
        emptyToNull(data.dealer_name),
        emptyToNull(data.dealer_contact),
        emptyToNull(data.dealer_email),
        emptyToNull(data.gst_no),
        emptyToNull(data.pan_number),
        emptyToNull(data.dealer_address),
        emptyToNull(data.dealer_city),
        emptyToNull(data.dealer_state),
        emptyToNull(data.dealer_pincode),
        emptyToNull(data.bank_name),
        emptyToNull(data.account_number),
        emptyToNull(data.ifsc),
        emptyToNull(data.name_in_bank),
        existingLan,
      ];
    }

    // SECTION 7: Product Details
    else if (section === 7) {
      query = `
        UPDATE loan_booking_seven_fincorp
        SET
          selected_product_id = ?,
          battery_name = ?,
          battery_type = ?,
          battery_serial_no_1 = ?,
          battery_serial_no_2 = ?,
          e_rikshaw_model = ?,
          chassis_no = ?
        WHERE lan = ?
      `;

      values = [
        emptyToNull(data.selected_product_id),
        emptyToNull(data.Battery_Name),
        emptyToNull(data.Battery_Type),
        emptyToNull(data.Battery_Serial_no_1),
        emptyToNull(data.Battery_Serial_no_2),
        emptyToNull(data.E_Rikshaw_model),
        emptyToNull(data.Chassis_no),
        existingLan,
      ];
    }

    else {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "Invalid section",
        activeSection: section,
      });
    }

    const [result] = await connection.query(query, values);

    if (result.affectedRows === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "LAN not found",
        lan: existingLan,
      });
    }

    if (section === 3 && data.GURANTOR) {
      await connection.query(
        `
        INSERT IGNORE INTO kyc_verification_status (
          lan,
          applicant_type,
          applicant_name,
          mobile_number,
          pan_number
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          existingLan,
          "GUARANTOR",
          data.GURANTOR,
          data.GURANTOR_MOBILE,
          data.GURANTOR_PAN,
        ]
      );
    }

    if (section === 4 && data.Co_Applicant) {
      await connection.query(
        `
        INSERT IGNORE INTO kyc_verification_status (
          lan,
          applicant_type,
          applicant_name,
          mobile_number,
          pan_number
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          existingLan,
          "CO_APPLICANT",
          data.Co_Applicant,
          data.Co_Applicant_Mobile,
          data.Co_Applicant_PAN,
        ]
      );
    }

    await connection.commit();
    transactionStarted = false;

    return res.json({
      success: true,
      message: "Section saved successfully",
      lan: existingLan,
      activeSection: section,
      affectedRows: result.affectedRows,
      changedRows: result.changedRows,
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("SAVE BORROWER / SECTION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to save section",
      error: error.message,
      sqlMessage: error.sqlMessage,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
router.post("/final-submit-ev-customer-manual", async (req, res) => {
  const connection = await db.promise().getConnection();

  try {
    const data = req.body;

    if (!data.lan) {
      return res.status(400).json({
        success: false,
        message: "LAN required. Please save borrower first.",
      });
    }

    await connection.beginTransaction();

    await connection.query(
      `
      UPDATE loan_booking_seven_fincorp
      SET
        permanent_address_line_1 = ?,
        permanent_address_line_2 = ?,
        permanent_village_city = ?,
        permanent_district = ?,
        permanent_state = ?,
        permanent_pincode = ?,

        requested_loan_amount = ?,
        interest_rate = ?,
        loan_tenure = ?,
        disbursal_amount = ?,
        processing_fee = ?,
        processing_fee_percentage = ?,
        gps_charges = ?,

        guarantor_name = ?,
        guarantor_dob = ?,
        guarantor_email = ?,
        guarantor_pan = ?,
        guarantor_mobile = ?,
        relationship_with_borrower = ?,
        guarantor_address_line_1 = ?,
        guarantor_address_line_2 = ?,
        guarantor_village_city = ?,
        guarantor_district = ?,
        guarantor_state = ?,
        guarantor_pincode = ?,
        guarantor_driving_licence = ?,

        co_applicant_name = ?,
        co_applicant_dob = ?,
        co_applicant_email = ?,
        co_applicant_pan = ?,
        co_applicant_mobile = ?,
        co_applicant_address_line_1 = ?,
        co_applicant_address_line_2 = ?,
        co_applicant_village_city = ?,
        co_applicant_district = ?,
        co_applicant_state = ?,
        co_applicant_pincode = ?,
        co_applicant_driving_licence = ?,

        customer_name_as_per_bank = ?,
        customer_bank_name = ?,
        customer_account_number = ?,
        bank_ifsc_code = ?,
        branch_address = ?,

        selected_dealer_application_id = ?,
        dealer_id = ?,
        trade_name = ?,
        dealer_name = ?,
        dealer_contact = ?,
        dealer_email = ?,
        gst_no = ?,
        pan_number = ?,
        dealer_address = ?,
        dealer_city = ?,
        dealer_state = ?,
        dealer_pincode = ?,

        dealer_bank_name = ?,
        dealer_account_number = ?,
        dealer_ifsc = ?,
        dealer_name_in_bank = ?,

        selected_product_id = ?,
        battery_name = ?,
        battery_type = ?,
        battery_serial_no_1 = ?,
        battery_serial_no_2 = ?,
        e_rikshaw_model = ?,
        chassis_no = ?,

        insurance_cost = ?,
        insurance_company_provider = ?,
        insurance_policy_number = ?,
        policy_issued_date = ?,
        period_of_insurance = ?,

        cost_of_vehicle = ?,
        manufacturing_year = ?,
        downpayment_paid_by_borrower = ?,
        vehicle_registration_cost = ?,
        sales_invoice_number = ?,
        sales_invoice_date = ?,

        borrower_mobile_verified = ?,
        guarantor_mobile_verified = ?,
        co_applicant_mobile_verified = ?

      WHERE lan = ?
      `,
      [
        // Permanent Address
        emptyToNull(data.Address_Line_1),
        emptyToNull(data.Address_Line_2),
        emptyToNull(data.Village),
        emptyToNull(data.District),
        emptyToNull(data.State),
        emptyToNull(data.Pincode),

        // Loan Details
        numberOrNull(data.Loan_Amount),
        numberOrNull(data.Interest_Rate),
        numberOrNull(data.Tenure),
        numberOrNull(data.Disbursal_Amount),
        numberOrNull(data.Processing_Fee),
        numberOrNull(data.Processing_Fee_Percentage),
        numberOrNull(data.GPS_Charges),

        // Guarantor
        emptyToNull(data.GURANTOR),
        emptyToNull(data.GURANTOR_DOB),
        emptyToNull(data.GURANTOR_EMAIL),
        emptyToNull(data.GURANTOR_PAN),
        emptyToNull(data.GURANTOR_MOBILE),
        emptyToNull(data.Relationship_with_Borrower),
        emptyToNull(data.GURANTOR_Address_Line_1),
        emptyToNull(data.GURANTOR_Address_Line_2),
        emptyToNull(data.GURANTOR_Village),
        emptyToNull(data.GURANTOR_District),
        emptyToNull(data.GURANTOR_State),
        emptyToNull(data.GURANTOR_Pincode),
        emptyToNull(data.GURANTOR_Driving_Licence),

        // Co-Applicant
        emptyToNull(data.Co_Applicant),
        emptyToNull(data.Co_Applicant_DOB),
        emptyToNull(data.Co_Applicant_Email),
        emptyToNull(data.Co_Applicant_PAN),
        emptyToNull(data.Co_Applicant_Mobile),
        emptyToNull(data.Co_Applicant_Address_Line_1),
        emptyToNull(data.Co_Applicant_Address_Line_2),
        emptyToNull(data.Co_Applicant_Village),
        emptyToNull(data.Co_Applicant_District),
        emptyToNull(data.Co_Applicant_State),
        emptyToNull(data.Co_Applicant_Pincode),
        emptyToNull(data.Co_Applicant_Driving_Licence),

        // Borrower Bank Details
        emptyToNull(data.customer_name_as_per_bank),
        emptyToNull(data.customer_bank_name),
        emptyToNull(data.customer_account_number),
        emptyToNull(data.bank_ifsc_code),
        emptyToNull(data.branch_address),

        // Dealer Details
        emptyToNull(data.selected_dealer_application_id),
        emptyToNull(data.dealer_id),
        emptyToNull(data.trade_name),
        emptyToNull(data.dealer_name),
        emptyToNull(data.dealer_contact),
        emptyToNull(data.dealer_email),
        emptyToNull(data.gst_no),
        emptyToNull(data.pan_number),
        emptyToNull(data.dealer_address),
        emptyToNull(data.dealer_city),
        emptyToNull(data.dealer_state),
        emptyToNull(data.dealer_pincode),

        // Dealer Bank Details
        emptyToNull(data.bank_name),
        emptyToNull(data.account_number),
        emptyToNull(data.ifsc),
        emptyToNull(data.name_in_bank),

        // Product Details
        numberOrNull(data.selected_product_id),
        emptyToNull(data.Battery_Name),
        emptyToNull(data.Battery_Type),
        emptyToNull(data.Battery_Serial_no_1),
        emptyToNull(data.Battery_Serial_no_2),
        emptyToNull(data.E_Rikshaw_model),
        emptyToNull(data.Chassis_no),

        // Insurance Details
        numberOrNull(data.insurance_cost),
        emptyToNull(data.insurance_company_provider),
        emptyToNull(data.insurance_policy_number),
        emptyToNull(data.policy_issued_date),
        emptyToNull(data.period_of_insurance),

        // Vehicle Details
        numberOrNull(data.cost_of_vehicle),
        numberOrNull(data.manufacturing_year),
        numberOrNull(data.downpayment_paid_by_borrower),
        numberOrNull(data.vehicle_registration_cost),
        emptyToNull(data.sales_invoice_number),
        emptyToNull(data.sales_invoice_date),

        // OTP Flags
        data.borrower_mobile_verified || 0,
        data.guarantor_mobile_verified || 0,
        data.co_applicant_mobile_verified || 0,

        data.lan,
      ],
    );

    await connection.commit();

    universalRunAllValidations(data.lan).catch((err) => {
      console.error("Validation engine failed after booking:", err);
    });

    return res.json({
      success: true,
      message: "Seven Fincorp loan booking submitted successfully",
      lan: data.lan,
    });
  } catch (error) {
    await connection.rollback();

    console.error("Final submit error:", error);

    return res.status(500).json({
      success: false,
      message: "Final submit failed",
      error: error.message,
    });
  } finally {
    connection.release();
  }
});

router.get("/loan-booking/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const [rows] = await db.promise().query(
      `
      SELECT *
      FROM loan_booking_seven_fincorp
      WHERE lan = ?
      LIMIT 1
      `,
      [lan],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Loan booking not found",
      });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Fetch Motion Corp booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch loan booking",
      error: error.message,
    });
  }
});

router.post("/send-otp", async (req, res) => {
  try {
    console.log("Incoming body:", req.body);

    const { mobile, applicantType } = req.body;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: "Mobile required",
      });
    }

    if (!applicantType) {
      return res.status(400).json({
        success: false,
        message: "Applicant type required",
      });
    }

    const cleanedMobile = mobile.replace(/\D/g, "");

    const [existing] = await db.promise().query(
      `
    SELECT *
    FROM otp_consent_model
    WHERE mobile_number = ?
    AND applicant_type = ?
    ORDER BY id DESC
    LIMIT 1
    `,
      [cleanedMobile, applicantType],
    );

    if (existing.length) {
      const lastSent = new Date(existing[0].last_sent_at);

      const diffSeconds = (Date.now() - lastSent.getTime()) / 1000;

      if (diffSeconds < 60) {
        return res.status(429).json({
          success: false,
          message: `Wait ${Math.ceil(60 - diffSeconds)} seconds before retry`,
        });
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

    const smsParams = {
      user: process.env.ALOT_USER,
      password: process.env.ALOT_PASSWORD,
      senderid: process.env.SENDER_ID,
      channel: "TRANS",
      DCS: "0",
      flashsms: "0",
      number: cleanedMobile,

      text: `OTP for mobile number verification is ${otp}. Do not share this OTP with anyone. Thanks & Regards Fintree Finance Private Limited:`,
      route: "5",

      DLTTemplateId: process.env.MOBILE_OTP_TEMPLATE_ID,

      PEID: process.env.DLT_PEID,
    };

    console.log("Sending SMS with:", smsParams);

    await axios.get(process.env.ALOT_API_URL, {
      params: smsParams,
    });

    await db.promise().query(
      `
  INSERT INTO otp_consent_model (
    mobile_number,
    applicant_type,
    otp,
    expires_at,
    last_sent_at,
    verified
  )
  VALUES (
    ?, ?, ?, ?, NOW(), 0
  )
  `,
      [cleanedMobile, applicantType, otp, expiresAt],
    );

    return res.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (err) {
    console.error("SMS error:", err.message);

    return res.status(500).json({
      success: false,
      message: "OTP send failed",
    });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { mobile, otp, consentText, applicantType } = req.body;

    const [rows] = await db.promise().query(
      `
  SELECT *
  FROM otp_consent_model
  WHERE mobile_number = ?
  AND applicant_type = ?
  AND verified = 0
  ORDER BY id DESC
  LIMIT 1
  `,
      [mobile, applicantType],
    );

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "OTP not found",
      });
    }

    const session = rows[0];

    if (session.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (new Date() > new Date(session.expires_at)) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    await db.promise().query(
      `
  UPDATE otp_consent_model
  SET
    verified = 1,
    consent_given = 1,
    consent_text = ?,
    consent_at = NOW()
  WHERE id = ?
  `,
      [consentText, session.id],
    );

    return res.json({
      success: true,
      message: "OTP verified",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Verification failed",
    });
  }
});

router.post("/init-aadhaar", async (req, res) => {
  try {
    const { lan, applicantType } = req.body;

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN required",
      });
    }

    if (!["BORROWER", "GUARANTOR", "CO_APPLICANT"].includes(applicantType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid applicant type",
      });
    }

    const [rows] = await db.promise().query(
      `
      SELECT *
      FROM loan_booking_seven_fincorp
      WHERE lan = ?
      LIMIT 1
      `,
      [lan],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    const loan = rows[0];

    let applicantData = {};

    if (applicantType === "BORROWER") {
      applicantData = {
        name: loan.customer_name,
        mobile: loan.mobile_number,
        email: loan.email,
      };
    }

    if (applicantType === "GUARANTOR") {
      applicantData = {
        name: loan.guarantor_name,
        mobile: loan.guarantor_mobile,
        email: loan.guarantor_email,
      };
    }

    if (applicantType === "CO_APPLICANT") {
      applicantData = {
        name: loan.co_applicant_name,
        mobile: loan.co_applicant_mobile,
        email: loan.co_applicant_email,
      };
    }

    if (!applicantData.mobile || !applicantData.name) {
      return res.status(400).json({
        success: false,
        message: `${applicantType} details not saved`,
      });
    }

    await db.promise().query(
      `
      INSERT IGNORE INTO kyc_verification_status (
        lan,
        applicant_type,
        applicant_name,
        mobile_number
      )
      VALUES (?, ?, ?, ?)
      `,
      [lan, applicantType, applicantData.name, applicantData.mobile],
    );

    await db.promise().query(
      `
      UPDATE kyc_verification_status
      SET aadhaar_status = 'INITIATED'
      WHERE lan = ?
      AND applicant_type = ?
      `,
      [lan, applicantType],
    );

    const aadhaarInit = await initAadhaarKyc(
      lan,
      applicantData.mobile,
      applicantData.email,
      applicantData.name,
    );

    if (!aadhaarInit.success) {
      await db.promise().query(
        `
        UPDATE kyc_verification_status
        SET aadhaar_status = 'FAILED'
        WHERE lan = ?
        AND applicant_type = ?
        `,
        [lan, applicantType],
      );

      return res.status(400).json({
        success: false,
        message: "Aadhaar init failed",
      });
    }

    await db.promise().query(
      `
      UPDATE kyc_verification_status
      SET
        aadhaar_transaction_id = ?,
        aadhaar_kyc_url = ?,
        aadhaar_unique_id = ?
      WHERE lan = ?
      AND applicant_type = ?
      `,
      [
        aadhaarInit.unifiedTransactionId,
        aadhaarInit.kycUrl,
        aadhaarInit.uniqueId,
        lan,
        applicantType,
      ],
    );

    return res.json({
      success: true,
      message: "Aadhaar initiated",
      kycUrl: aadhaarInit.kycUrl,
      transactionId: aadhaarInit.unifiedTransactionId,
      uniqueId: aadhaarInit.uniqueId,
    });
  } catch (error) {
    console.error("Aadhaar init error:", error);

    return res.status(500).json({
      success: false,
      message: "Aadhaar init failed",
      error: error.message,
    });
  }
});

router.post("/save-applicant-details", async (req, res) => {
  try {
    const { lan, applicantType, data } = req.body;

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN required",
      });
    }

    if (applicantType === "GUARANTOR") {
      await db.promise().query(
        `
        UPDATE loan_booking_seven_fincorp
        SET
          guarantor_name = ?,
          guarantor_dob = ?,
          guarantor_email = ?,
          guarantor_pan = ?,
          guarantor_mobile = ?,
          relationship_with_borrower = ?,
          guarantor_address_line_1 = ?,
          guarantor_address_line_2 = ?,
          guarantor_village_city = ?,
          guarantor_district = ?,
          guarantor_state = ?,
          guarantor_pincode = ?,
          guarantor_mobile_verified = ?,
          guarantor_driving_licence = ?
        WHERE lan = ?
        `,
        [
          emptyToNull(data.GUARANTOR),
          emptyToNull(data.GURANTOR_DOB),
          emptyToNull(data.GURANTOR_EMAIL),
          emptyToNull(data.GURANTOR_PAN),
          emptyToNull(data.GURANTOR_MOBILE),
          emptyToNull(data.Relationship_with_Borrower),
          emptyToNull(data.GURANTOR_Address_Line_1),
          emptyToNull(data.GURANTOR_Address_Line_2),
          emptyToNull(data.GURANTOR_Village),
          emptyToNull(data.GURANTOR_District),
          emptyToNull(data.GURANTOR_State),
          emptyToNull(data.GURANTOR_Driving_Licence),
          emptyToNull(data.GURANTOR_Pincode),
          data.guarantor_mobile_verified || 0,
          lan,
        ],
      );
    }

    if (applicantType === "CO_APPLICANT") {
      await db.promise().query(
        `
        UPDATE loan_booking_seven_fincorp
        SET
          co_applicant_name = ?,
          co_applicant_dob = ?,
          co_applicant_email = ?,
          co_applicant_pan = ?,
          co_applicant_mobile = ?,
          co_applicant_address_line_1 = ?,
          co_applicant_address_line_2 = ?,
          co_applicant_village_city = ?,
          co_applicant_district = ?,
          co_applicant_state = ?,
          co_applicant_pincode = ?,
          co_applicant_driving_licence = ?,
          co_applicant_mobile_verified = ?
        WHERE lan = ?
        `,
        [
          emptyToNull(data.Co_Applicant),
          emptyToNull(data.Co_Applicant_DOB),
          emptyToNull(data.Co_Applicant_Email),
          emptyToNull(data.Co_Applicant_PAN),
          emptyToNull(data.Co_Applicant_Mobile),
          emptyToNull(data.Co_Applicant_Address_Line_1),
          emptyToNull(data.Co_Applicant_Address_Line_2),
          emptyToNull(data.Co_Applicant_Village),
          emptyToNull(data.Co_Applicant_District),
          emptyToNull(data.Co_Applicant_State),
          emptyToNull(data.Co_Applicant_Pincode),
          emptyToNull(data.Co_Applicant_Driving_Licence),
          data.co_applicant_mobile_verified || 0,
          lan,
        ],
      );
    }

    return res.json({
      success: true,
      message: `${applicantType} saved`,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Applicant save failed",
      error: error.message,
    });
  }
});

router.get("/aadhaar-address/:lan/:applicantType", async (req, res) => {
  try {
    const { lan, applicantType } = req.params;

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN required",
      });
    }

    if (!["BORROWER", "GUARANTOR", "CO_APPLICANT"].includes(applicantType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid applicant type",
      });
    }

    const [rows] = await db.promise().query(
      `
      SELECT
        aadhaar_status,
        aadhaar_name,
        aadhaar_dob,
        aadhaar_masked_number,
        aadhaar_address
      FROM kyc_verification_status
      WHERE lan = ?
      AND applicant_type = ?
      LIMIT 1
      `,
      [lan, applicantType],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Aadhaar KYC record not found",
      });
    }

    const row = rows[0];

    if (row.aadhaar_status !== "VERIFIED") {
      return res.json({
        success: false,
        status: row.aadhaar_status,
        message: "Aadhaar is not verified yet",
      });
    }

    if (!row.aadhaar_address) {
      return res.json({
        success: false,
        status: row.aadhaar_status,
        message: "Aadhaar address not available",
      });
    }

    return res.json({
      success: true,
      status: row.aadhaar_status,
      aadhaarName: row.aadhaar_name,
      aadhaarDob: row.aadhaar_dob,
      aadhaarMaskedNumber: row.aadhaar_masked_number,
      aadhaarAddress: row.aadhaar_address,
    });
  } catch (error) {
    console.error("Fetch Aadhaar address error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Aadhaar address",
      error: error.message,
    });
  }
});

router.get("/customer-details/:lan", async (req, res) => {
  const { lan } = req.params;

  try {
    const [rows] = await db.promise().query(
      `
  SELECT
    lb.lan,
    lb.partner_loan_id,
    lb.login_date,

    lb.first_name,
    lb.last_name,
    lb.customer_name,

    lb.mobile_number,
    lb.email,
    lb.pan_card,
    lb.dob,
    lb.gender,
    lb.father_name,

    lb.permanent_address_line_1,
    lb.permanent_address_line_2,
    lb.permanent_village_city,
    lb.permanent_district,
    lb.permanent_state,
    lb.permanent_pincode,

    lb.loan_amount,
    lb.requested_loan_amount,
    lb.processing_fee,
    lb.processing_fee_percentage,
    lb.disbursal_amount,
    lb.interest_rate,
    lb.loan_tenure,

    lb.guarantor_name,
    lb.guarantor_dob,
    lb.guarantor_pan,
    lb.guarantor_mobile,
    lb.guarantor_email,
    lb.relationship_with_borrower,

    lb.guarantor_address_line_1,
    lb.guarantor_address_line_2,
    lb.guarantor_village_city,
    lb.guarantor_district,
    lb.guarantor_state,
    lb.guarantor_pincode,

    lb.co_applicant_name,
    lb.co_applicant_dob,
    lb.co_applicant_pan,
    lb.co_applicant_mobile,
    lb.co_applicant_email,

    lb.co_applicant_address_line_1,
    lb.co_applicant_address_line_2,
    lb.co_applicant_village_city,
    lb.co_applicant_district,
    lb.co_applicant_state,
    lb.co_applicant_pincode,

    lb.customer_name_as_per_bank,
    lb.customer_bank_name,
    lb.customer_account_number,
    lb.bank_ifsc_code,

    lb.selected_dealer_application_id,
    lb.dealer_id,
    lb.trade_name,
    lb.dealer_name,
    lb.dealer_contact,
    lb.dealer_email,
    lb.gst_no,
    lb.pan_number,

    lb.dealer_address,
    lb.dealer_city,
    lb.dealer_state,
    lb.dealer_pincode,

    lb.dealer_bank_name,
    lb.dealer_account_number,
    lb.dealer_ifsc,
    lb.dealer_name_in_bank,

    lb.selected_product_id,
    lb.battery_name,
    lb.battery_type,
    lb.battery_serial_no_1,
    lb.battery_serial_no_2,
    lb.e_rikshaw_model,
    lb.chassis_no,

    lb.driving_license,
    lb.gps_charges,
    lb.guarantor_driving_licence,
    lb.co_applicant_driving_licence,
    lb.branch_address,
    lb.insurance_cost,
    lb.insurance_company_provider,
    lb.insurance_policy_number,
    lb.policy_issued_date,
    lb.period_of_insurance,
    lb.cost_of_vehicle,
    lb.manufacturing_year,
    lb.downpayment_paid_by_borrower,
    lb.vehicle_registration_cost,
    lb.sales_invoice_number,
    lb.sales_invoice_date,

    lb.borrower_mobile_verified,
    lb.guarantor_mobile_verified,
    lb.co_applicant_mobile_verified,

    lb.lender,
    lb.lender_type,
    lb.product,
    lb.status,

    lb.created_at,
    lb.updated_at,

    lb.seven_fincorp_bre_status,
    lb.seven_fincorp_bre_reason,
    lb.seven_fincorp_bre_checked_at,

    lb.fintree_cibil_score,
    lb.seven_fincorp_enquiries_30d,

    lb.seven_fincorp_dpd_3m_flag,
    lb.seven_fincorp_dpd_6m_flag,
    lb.seven_fincorp_overdue_12m_flag,

    lb.seven_fincorp_written_off_3y_flag,

    lb.seven_fincorp_60plus_24m_flag,
    lb.seven_fincorp_90plus_36m_flag,

    lb.seven_fincorp_emi_overdue_amount,
    lb.seven_fincorp_cc_overdue_amount,

    lb.seven_fincorp_deviation_flag,

    borrower_kyc.pan_status AS borrower_pan_status,
    borrower_kyc.aadhaar_status AS borrower_aadhaar_status,
    borrower_kyc.bureau_status AS borrower_bureau_status,

    guarantor_kyc.pan_status AS guarantor_pan_status,
    guarantor_kyc.aadhaar_status AS guarantor_aadhaar_status,
    guarantor_kyc.bureau_status AS guarantor_bureau_status,

    co_kyc.pan_status AS co_applicant_pan_status,
    co_kyc.aadhaar_status AS co_applicant_aadhaar_status,
    co_kyc.bureau_status AS co_applicant_bureau_status

  FROM loan_booking_seven_fincorp lb

  LEFT JOIN kyc_verification_status borrower_kyc
    ON borrower_kyc.lan = lb.lan
    AND borrower_kyc.applicant_type = 'BORROWER'

  LEFT JOIN kyc_verification_status guarantor_kyc
    ON guarantor_kyc.lan = lb.lan
    AND guarantor_kyc.applicant_type = 'GUARANTOR'

  LEFT JOIN kyc_verification_status co_kyc
    ON co_kyc.lan = lb.lan
    AND co_kyc.applicant_type = 'CO_APPLICANT'

  WHERE lb.lan = ?
  LIMIT 1
  `,
      [lan],
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Motion Corp loan not found",
      });
    }

    const row = rows[0];

    const loan = {
      lan: row.lan,
      partner_loan_id: row.partner_loan_id,
      login_date: row.login_date,

      first_name: row.first_name,
      last_name: row.last_name,
      customer_name: row.customer_name,

      mobile_number: row.mobile_number,
      email: row.email,
      pan_card: row.pan_card,
      dob: row.dob,
      gender: row.gender,
      father_name: row.father_name,

      permanent_address: {
        address_line_1: row.permanent_address_line_1,
        address_line_2: row.permanent_address_line_2,
        city: row.permanent_village_city,
        district: row.permanent_district,
        state: row.permanent_state,
        pincode: row.permanent_pincode,
      },

      loan_details: {
        requested_loan_amount: row.requested_loan_amount,
        loan_amount: row.loan_amount,
        processing_fee: row.processing_fee,
        processing_fee_percentage: row.processing_fee_percentage,
        disbursal_amount: row.disbursal_amount,
        interest_rate: row.interest_rate,
        loan_tenure: row.loan_tenure,
        gps_charges: row.gps_charges,
      },

      guarantor: {
        name: row.guarantor_name,
        dob: row.guarantor_dob,
        pan: row.guarantor_pan,
        mobile: row.guarantor_mobile,
        email: row.guarantor_email,
        relationship_with_borrower: row.relationship_with_borrower,
        driving_licence: row.guarantor_driving_licence,

        address: {
          address_line_1: row.guarantor_address_line_1,
          address_line_2: row.guarantor_address_line_2,
          city: row.guarantor_village_city,
          district: row.guarantor_district,
          state: row.guarantor_state,
          pincode: row.guarantor_pincode,
        },
      },

      co_applicant: {
        name: row.co_applicant_name,
        dob: row.co_applicant_dob,
        pan: row.co_applicant_pan,
        mobile: row.co_applicant_mobile,
        email: row.co_applicant_email,
        driving_licence: row.co_applicant_driving_licence,

        address: {
          address_line_1: row.co_applicant_address_line_1,
          address_line_2: row.co_applicant_address_line_2,
          city: row.co_applicant_village_city,
          district: row.co_applicant_district,
          state: row.co_applicant_state,
          pincode: row.co_applicant_pincode,
        },
      },

      bank_details: {
        customer_name_as_per_bank: row.customer_name_as_per_bank,
        customer_bank_name: row.customer_bank_name,
        customer_account_number: row.customer_account_number,
        bank_ifsc_code: row.bank_ifsc_code,
        branch_address: row.branch_address,
      },

      dealer_details: {
        selected_dealer_application_id: row.selected_dealer_application_id,
        dealer_id: row.dealer_id,
        trade_name: row.trade_name,
        dealer_name: row.dealer_name,
        dealer_contact: row.dealer_contact,
        dealer_email: row.dealer_email,
        gst_no: row.gst_no,
        pan_number: row.pan_number,

        dealer_address: row.dealer_address,
        dealer_city: row.dealer_city,
        dealer_state: row.dealer_state,
        dealer_pincode: row.dealer_pincode,

        dealer_bank_name: row.dealer_bank_name,
        dealer_account_number: row.dealer_account_number,
        dealer_ifsc: row.dealer_ifsc,
        dealer_name_in_bank: row.dealer_name_in_bank,
      },

      product_details: {
        selected_product_id: row.selected_product_id,
        battery_name: row.battery_name,
        battery_type: row.battery_type,
        battery_serial_no_1: row.battery_serial_no_1,
        battery_serial_no_2: row.battery_serial_no_2,
        e_rikshaw_model: row.e_rikshaw_model,
        chassis_no: row.chassis_no,
        driving_license: row.driving_license,
      },

      insurance_details: {
        insurance_cost: row.insurance_cost,
        insurance_company_provider: row.insurance_company_provider,
        insurance_policy_number: row.insurance_policy_number,
        policy_issued_date: row.policy_issued_date,
        period_of_insurance: row.period_of_insurance,
      },

      vehicle_details: {
        cost_of_vehicle: row.cost_of_vehicle,
        manufacturing_year: row.manufacturing_year,
        downpayment_paid_by_borrower: row.downpayment_paid_by_borrower,
        vehicle_registration_cost: row.vehicle_registration_cost,
        sales_invoice_number: row.sales_invoice_number,
        sales_invoice_date: row.sales_invoice_date,
      },

      // ADD HERE
      verification_status: {
        borrower: {
          pan_status: row.borrower_pan_status || "PENDING",
          aadhaar_status: row.borrower_aadhaar_status || "PENDING",
          bureau_status: row.borrower_bureau_status || "PENDING",
        },

        guarantor: row.guarantor_name
          ? {
              pan_status: row.guarantor_pan_status || "PENDING",
              aadhaar_status: row.guarantor_aadhaar_status || "PENDING",
              bureau_status: row.guarantor_bureau_status || "PENDING",
            }
          : null,

        co_applicant: row.co_applicant_name
          ? {
              pan_status: row.co_applicant_pan_status || "PENDING",
              aadhaar_status: row.co_applicant_aadhaar_status || "PENDING",
              bureau_status: row.co_applicant_bureau_status || "PENDING",
            }
          : null,
      },

      verification: {
        borrower_mobile_verified: row.borrower_mobile_verified,

        guarantor_mobile_verified: row.guarantor_mobile_verified,

        co_applicant_mobile_verified: row.co_applicant_mobile_verified,
      },

      lender: row.lender,
      lender_type: row.lender_type,
      product: row.product,
      status: row.status,

      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    const bre = {
      fintree_cibil_score: row.fintree_cibil_score,

      enquiries_30d: row.seven_fincorp_enquiries_30d,

      dpd_3m_flag: row.seven_fincorp_dpd_3m_flag,

      dpd_6m_flag: row.seven_fincorp_dpd_6m_flag,

      overdue_12m_flag: row.seven_fincorp_overdue_12m_flag,

      written_off_3y_flag: row.seven_fincorp_written_off_3y_flag,

      dpd_60plus_24m_flag: row.seven_fincorp_60plus_24m_flag,

      dpd_90plus_36m_flag: row.seven_fincorp_90plus_36m_flag,

      emi_overdue_amount: row.seven_fincorp_emi_overdue_amount,

      cc_overdue_amount: row.seven_fincorp_cc_overdue_amount,

      deviation_flag: row.seven_fincorp_deviation_flag,

      bre_status: row.seven_fincorp_bre_status,

      bre_reason: row.seven_fincorp_bre_reason,

      bre_checked_at: row.seven_fincorp_bre_checked_at,
    };

    return res.json({
      loan,
      bre,
    });
  } catch (err) {
    console.error("❌ Error fetching Motion Corp details:", err);

    return res.status(500).json({
      message: "Failed to fetch Motion Corp details",
      error: err.sqlMessage || err.message,
    });
  }
});

router.get("/credit-initiated-loans", async (req, res) => {
  const {
    table = "loan_booking_seven_fincorp",
    prefix = "SFL",
    page = "1",
    pageSize = "50",
    search = "",
    sortBy = "lan",
    sortDir = "desc",
  } = req.query;

  const allowedTables = {
    loan_booking_seven_fincorp: true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({
      message: "Invalid table name",
    });
  }

  const pg = Math.max(1, parseInt(page, 10) || 1);

  const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));

  const offset = (pg - 1) * limit;

  const safeSortDir = sortDir.toLowerCase() === "asc" ? "ASC" : "DESC";

  const allowedSort = [
    "lan",
    "partner_loan_id",
    "customer_name",
    "mobile_number",
    "loan_amount",
    "created_at",
    "seven_fincorp_bre_checked_at",
  ];

  const sortCol = allowedSort.includes(sortBy) ? sortBy : "created_at";

  try {
    const likeVal = `${prefix}%`;

    const searchClause = search
      ? `
        AND (
          lb.lan LIKE ?
          OR lb.customer_name LIKE ?
          OR lb.partner_loan_id LIKE ?
          OR lb.mobile_number LIKE ?
        )
      `
      : "";

    const searchParams = search
      ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
      : [];

    const countSql = `
      SELECT COUNT(*) AS total
      FROM ?? lb
      WHERE
        lb.status = 'Credit Initiated'
        AND lb.stage = 'BRE Approved'
        AND lb.lan LIKE ?
        ${searchClause}
    `;

    const dataSql = `
      SELECT
        lb.id,
        lb.lan,
        lb.partner_loan_id,

        lb.customer_name,
        lb.mobile_number,
        lb.pan_card,

        lb.loan_amount,
        lb.interest_rate,
        lb.loan_tenure,

        lb.cibil_score,
        lb.fintree_cibil_score,

        lb.seven_fincorp_bre_status,
        lb.seven_fincorp_bre_reason,
        lb.seven_fincorp_bre_checked_at,

        lb.status,
        lb.stage,

        lb.created_at

      FROM ?? lb
      WHERE
        lb.status = 'Credit Initiated'
        AND lb.stage = 'BRE Approved'
        AND lb.lan LIKE ?
        ${searchClause}

      ORDER BY lb.${sortCol} ${safeSortDir}

      LIMIT ? OFFSET ?
    `;

    const [[countRows], [rows]] = await Promise.all([
      db.promise().query(countSql, [table, likeVal, ...searchParams]),

      db
        .promise()
        .query(dataSql, [table, likeVal, ...searchParams, limit, offset]),
    ]);

    return res.json({
      rows,

      pagination: {
        page: pg,
        pageSize: limit,
        total: Number(countRows[0]?.total || 0),
      },
    });
  } catch (err) {
    console.error("Error fetching credit initiated loans:", err);

    return res.status(500).json({
      message: "Database error",
      error: err.sqlMessage || err.message,
    });
  }
});

router.get("/operation-initiated-loans", async (req, res) => {
  const {
    table = "loan_booking_seven_fincorp",
    prefix = "SFL",
    page = "1",
    pageSize = "50",
    search = "",
    sortBy = "lan",
    sortDir = "desc",
  } = req.query;

  const allowedTables = {
    loan_booking_seven_fincorp: true,
  };

  if (!allowedTables[table]) {
    return res.status(400).json({
      message: "Invalid table name",
    });
  }

  const pg = Math.max(1, parseInt(page, 10) || 1);

  const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));

  const offset = (pg - 1) * limit;

  const safeSortDir = sortDir.toLowerCase() === "asc" ? "ASC" : "DESC";

  const allowedSort = [
    "lan",
    "partner_loan_id",
    "customer_name",
    "mobile_number",
    "loan_amount",
    "created_at",
    "seven_fincorp_bre_checked_at",
  ];

  const sortCol = allowedSort.includes(sortBy) ? sortBy : "created_at";

  try {
    const likeVal = `${prefix}%`;

    const searchClause = search
      ? `
        AND (
          lb.lan LIKE ?
          OR lb.customer_name LIKE ?
          OR lb.partner_loan_id LIKE ?
          OR lb.mobile_number LIKE ?
        )
      `
      : "";

    const searchParams = search
      ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
      : [];

    const countSql = `
      SELECT COUNT(*) AS total
      FROM ?? lb
      WHERE
        lb.status = 'Operations Initiated'
        AND lb.stage = 'Credit Approved'
        AND lb.lan LIKE ?
        ${searchClause}
    `;

    const dataSql = `
      SELECT
        lb.id,
        lb.lan,
        lb.partner_loan_id,

        lb.customer_name,
        lb.mobile_number,
        lb.pan_card,

        lb.loan_amount,
        lb.interest_rate,
        lb.loan_tenure,

        lb.cibil_score,
        lb.fintree_cibil_score,

        lb.seven_fincorp_bre_status,
        lb.seven_fincorp_bre_reason,
        lb.seven_fincorp_bre_checked_at,

        lb.customer_name_as_per_bank,
        lb.customer_bank_name,
        lb.customer_account_number, 
        lb.bank_ifsc_code,

        lb.agreement_esign_status,
        lb.agreement_esign_sent_at,

        lb.bank_status,

        lb.email,

        lb.emi_amount,

        lb.agreement_date,
        lb.login_date,

        lb.bank_account_type,

        lb.status,
        lb.stage,

        lb.created_at

      FROM ?? lb
      WHERE
        lb.status = 'Operations Initiated'
        AND lb.stage = 'Credit Approved'
        AND lb.lan LIKE ?
        ${searchClause}

      ORDER BY lb.${sortCol} ${safeSortDir}

      LIMIT ? OFFSET ?
    `;

    const [[countRows], [rows]] = await Promise.all([
      db.promise().query(countSql, [table, likeVal, ...searchParams]),

      db
        .promise()
        .query(dataSql, [table, likeVal, ...searchParams, limit, offset]),
    ]);

    return res.json({
      rows,

      pagination: {
        page: pg,
        pageSize: limit,
        total: Number(countRows[0]?.total || 0),
      },
    });
  } catch (err) {
    console.error("Error fetching credit initiated loans:", err);

    return res.status(500).json({
      message: "Database error",
      error: err.sqlMessage || err.message,
    });
  }
});

router.post("/:lan/approve", async (req, res) => {
  try {
    const { lan } = req.params;

    // Check loan exists
    const [rows] = await db.promise().query(
      `
      SELECT lan, bank_status
      FROM loan_booking_seven_fincorp
      WHERE lan = ?
      `,
      [lan],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    const loan = rows[0];

    // CONDITION
    if ((loan.bank_status || "").toUpperCase() !== "MANDATE_CREATED") {
      return res.status(400).json({
        success: false,
        message: "Loan cannot be approved until mandate is created",
      });
    }

    // UPDATE STATUS
    await db.promise().query(
      `
      UPDATE loan_booking_seven_fincorp
      SET
        status = 'Approved',
        stage = 'Operation Approved',
        updated_at = NOW()
      WHERE lan = ?
      `,
      [lan],
    );

    return res.json({
      success: true,
      message: "Loan approved successfully",
    });
  } catch (err) {
    console.error("approveLoan error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.post("/:lan/reject", async (req, res) => {
  try {
    const { lan } = req.params;

    // Check loan exists
    const [rows] = await db.promise().query(
      `
      SELECT lan, bank_status
      FROM loan_booking_seven_fincorp
      WHERE lan = ?
      `,
      [lan],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    const loan = rows[0];

    // CONDITION
    if ((loan.bank_status || "").toUpperCase() !== "MANDATE_CREATED") {
      return res.status(400).json({
        success: false,
        message: "Loan cannot be rejected until mandate is created",
      });
    }

    // UPDATE STATUS
    await db.promise().query(
      `
      UPDATE loan_booking_motion_corp
      SET
        status = 'Rejected',
        stage = 'Operation Rejected',
        updated_at = NOW()
      WHERE lan = ?
      `,
      [lan],
    );

    return res.json({
      success: true,
      message: "Loan rejected successfully",
    });
  } catch (err) {
    console.error("rejectLoan error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;
