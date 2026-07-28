////////////////////////
const express = require("express");
const axios = require("axios");
const db = require("../../config/db");
const crypto = require("crypto");
const {
  universalRunAllValidations,
  runApplicantValidation,
} = require("../../utils/runValiationsEngine");
const { initAadhaarKyc } = require("../../services/digitapaadharservice");
const partnerLimitService = require("../../services/partnerLimitService");
const partnerFldgService = require("../../services/partnerFldgService");
const {
  extractPartnerName,
  getMonthYear,
  validatePartnerName,
} = require("../../utils/partnerHelpers");

const {
  extractMotionCorpBureauFacts,
  evaluateMotionCorpBureauScreening,
} = require("./motionCorpBRE");

const router = express.Router();

/*
====================================================
IDENTIFIER GENERATOR
====================================================
*/
const generateLoanIdentifiers = async (lender) => {
  let prefixLan = "MCDLR";
  let applicationPrefix = "MCDLRAPP";
  let custPrefixLan = "MCL";
  let custPartnerLoanId = "MCFL";

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
CREATE DEALER + MULTIPLE PRODUCTS
====================================================
*/
// router.post("/dealer/create", async (req, res) => {
//   let connection;
//   try {
//     const data = req.body;

//     if (!data.business_name?.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "Business name is required",
//       });
//     }

//     if (!data.owner_name?.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "Owner name is required",
//       });
//     }

//     connection = await db.promise().getConnection();
//     await connection.beginTransaction();

//     const { lan, application_id } =
//       await generateLoanIdentifiers("MOTION-CORP_DEALER");

//     const dealerQuery = `
//       INSERT INTO motion_corp_dealer_booking
//       (
//         application_id, lan, dealer_id,
//         business_name, trade_name, business_type,
//         pan_number, gst_number,
//         owner_name, owner_mobile, owner_email,
//         showroom_address, city, state, pincode,
//         bank_name, branch_name, account_holder_name, account_number, ifsc_code,
//         status, created_at, login_date
//       )
//       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',NOW(),CURDATE())
//     `;

//     const dealerValues = [
//       application_id,
//       lan,
//       lan,

//       data.business_name.trim(),
//       data.trade_name?.trim() || null,
//       data.business_type?.trim() || null,

//       data.pan_number?.trim().toUpperCase() || null,
//       data.gst_number?.trim().toUpperCase() || null,

//       data.owner_name.trim(),
//       data.owner_mobile ? String(data.owner_mobile).trim() : null,
//       data.owner_email?.trim().toLowerCase() || null,

//       data.showroom_address?.trim() || null,
//       data.city?.trim() || null,
//       data.state?.trim() || null,
//       data.pincode ? String(data.pincode).trim() : null,

//       data.bank_name?.trim() || null,
//       data.branch_name?.trim() || null,
//       data.account_holder_name?.trim() || null,
//       data.account_number ? String(data.account_number).trim() : null,
//       data.ifsc_code?.trim().toUpperCase() || null,
//     ];

//     await connection.query(dealerQuery, dealerValues);

//     /*
//     ============================
//     INSERT MULTIPLE PRODUCTS
//     ============================
//     */
//     if (Array.isArray(data.products) && data.products.length > 0) {
//       const productQuery = `
//         INSERT INTO motion_corp_dealer_products
//         (application_id, battery_type, battery_name, e_rickshaw_model, e_rickshaw_model_price)
//         VALUES ?
//       `;

//       const productValues = data.products.map((p) => [
//         application_id,
//         p.battery_type || null,
//         p.battery_name || null,
//         p.e_rickshaw_model || null,
//         p.price ?? null,
//       ]);

//       await connection.query(productQuery, [productValues]);
//     }

//     await connection.commit();
//     return res.status(201).json({
//       success: true,
//       message: "Dealer and products created successfully",
//       data: {
//         application_id,
//         lan,
//         dealer_id: lan,
//       },
//     });
//   } catch (err) {
//     if (connection) {
//       await connection.rollback();
//     }

//     console.error("Dealer creation error:", {
//   message: err.message,
//   code: err.code,
//   errno: err.errno,
//   sqlState: err.sqlState,
//   sqlMessage: err.sqlMessage,
//   sql: err.sql,
//   stack: err.stack,
// });

//     if (err.code === "ER_DUP_ENTRY") {
//       return res.status(409).json({
//         success: false,
//         message: "Duplicate dealer information found",
//         error: err.message,
//       });
//     }

//     return res.status(500).json({
//       success: false,
//       message: "Dealer creation failed",
//       error: err.message,
//     });
//   } finally {
//     if (connection) {
//       connection.release();
//     }
//   }
// });

router.post("/dealer/create", async (req, res) => {
  let connection;
  let transactionStarted = false;
  let committed = false;

  try {
    const data = req.body;

    if (!data || typeof data !== "object") {
      return res.status(400).json({
        success: false,
        message: "Invalid request body",
      });
    }

    if (!data.business_name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Business name is required",
      });
    }

    if (!data.owner_name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Owner name is required",
      });
    }

    connection = await db.promise().getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const generatedIds = await generateLoanIdentifiers("MOTION-CORP_DEALER");

    const lan = String(generatedIds.lan);
    const application_id = String(generatedIds.application_id);

    const dealerQuery = `
      INSERT INTO motion_corp_dealer_booking
      (
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
        status,
        created_at,
        login_date
      )
      VALUES (
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        'ACTIVE',
        NOW(),
        CURDATE()
      )
    `;

    const dealerValues = [
      application_id,
      lan,
      lan,

      data.business_name.trim(),
      data.trade_name?.trim() || null,
      data.business_type?.trim() || null,

      data.pan_number?.trim().toUpperCase() || null,
      data.gst_number?.trim().toUpperCase() || null,

      data.owner_name.trim(),
      data.owner_mobile ? String(data.owner_mobile).trim() : null,
      data.owner_email?.trim().toLowerCase() || null,

      data.showroom_address?.trim() || null,
      data.city?.trim() || null,
      data.state?.trim() || null,
      data.pincode ? String(data.pincode).trim() : null,

      data.bank_name?.trim() || null,
      data.branch_name?.trim() || null,
      data.account_holder_name?.trim() || null,
      data.account_number ? String(data.account_number).trim() : null,
      data.ifsc_code?.trim().toUpperCase() || null,
    ];

    await connection.query(dealerQuery, dealerValues);

    if (Array.isArray(data.products) && data.products.length > 0) {
      const productQuery = `
        INSERT INTO motion_corp_dealer_products
        (
          application_id,
          battery_type,
          battery_name,
          e_rickshaw_model,
          e_rickshaw_model_price
        )
        VALUES ?
      `;

      const productValues = data.products
        .filter(
          (product) =>
            product &&
            (product.battery_type ||
              product.battery_name ||
              product.e_rickshaw_model ||
              (product.price !== null &&
                product.price !== undefined &&
                product.price !== "")),
        )
        .map((product) => [
          application_id,
          product.battery_type?.trim() || null,
          product.battery_name?.trim() || null,
          product.e_rickshaw_model?.trim() || null,
          product.price ?? product.e_rickshaw_model_price ?? null,
        ]);

      if (productValues.length > 0) {
        await connection.query(productQuery, [productValues]);
      }
    }

    await connection.commit();
    committed = true;

    return res.status(201).json({
      success: true,
      message: "Dealer and products created successfully",
      data: { application_id, lan, dealer_id: lan },
    });
  } catch (err) {
    console.error("Dealer Creation Error:", err);

    if (connection && transactionStarted && !committed) {
      await connection
        .rollback()
        .catch((e) => console.error("Rollback failed:", e));
    }

    if (res.headersSent) return;

    return res.status(409).json({
      success: false,
      message:
        err.code === "ER_DUP_ENTRY"
          ? "Duplicate dealer information found"
          : "Dealer creation failed",
      error: err.message,
    });
  } finally {
    if (connection) {
      connection.release();
    }
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
      INSERT INTO motion_corp_dealer_products
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
      UPDATE motion_corp_dealer_products
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
      DELETE FROM motion_corp_dealer_products WHERE id=?
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
      SELECT * FROM motion_corp_dealer_products
      WHERE application_id=?
    `,
      [application_id],
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
});

// /////////////// Dealer Lists & Details routes are in a separate file for better organization ///////////////
router.get("/dealer-list", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT 
        lan,
        dealer_id,
        business_name,
        business_type,
        city,
        state,
        owner_name,
        status
      FROM motion_corp_dealer_booking
      WHERE status IN ('APPROVED', 'ACTIVE')
      ORDER BY lan DESC
    `);

    const formatted = rows.map((d) => ({
      lan: d.lan,
      dealer_id: d.dealer_id,
      business_name: d.business_name,
      business_type: d.business_type,
      city: d.city,
      state: d.state,
      owner_name: d.owner_name,
      status: d.status,
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
      FROM motion_corp_dealer_booking
      WHERE status = 'APPROVED'
      ORDER BY business_name ASC
    `);

    const [products] = await db.promise().query(`
      SELECT 
        id,
        application_id,
        battery_type,
        battery_name,
        e_rickshaw_model
      FROM motion_corp_dealer_products
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
      FROM motion_corp_dealer_booking d
      LEFT JOIN motion_corp_dealer_products p
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
      FROM motion_corp_dealer_booking
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
      `UPDATE motion_corp_dealer_booking 
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

// router.post("/upload/ev-customer-manual", async (req, res) => {
//   const connection = await db.promise().getConnection();

//   try {
//     const data = req.body;
//     console.log("Received loan booking data:", data);

//     const [borrowerOtp] = await connection.query(
//       `
//   SELECT *
//   FROM otp_consent_model
//   WHERE mobile_number = ?
//   AND applicant_type = ?
//   AND verified = 1
//   AND is_used = 0
//   ORDER BY id DESC
//   LIMIT 1
//   `,
//       [data.Mobile_Number, "BORROWER"],
//     );

//     if (!borrowerOtp.length) {
//       return res.status(400).json({
//         success: false,
//         message: "Borrower mobile not verified",
//       });
//     }

//     const [guarantorOtp] = await connection.query(
//       `     SELECT *
//     FROM otp_consent_model
//     WHERE mobile_number = ?
//     AND applicant_type = 'GUARANTOR'
//     AND verified = 1
//     AND is_used = 0
//     ORDER BY id DESC
//     LIMIT 1
//     `,
//       [data.GURANTOR_MOBILE],
//     );

//     if (!guarantorOtp.length) {
//       return res.status(400).json({
//         success: false,
//         message: "Guarantor mobile not verified",
//       });
//     }

//     if (data.Co_Applicant) {
//       const [coApplicantOtp] = await connection.query(
//         `       SELECT *
//       FROM otp_consent_model
//       WHERE mobile_number = ?
//       AND applicant_type =
//       'CO_APPLICANT'
//       AND verified = 1
//       AND is_used = 0
//       ORDER BY id DESC
//       LIMIT 1
//       `,
//         [data.Co_Applicant_Mobile],
//       );

//       if (!coApplicantOtp.length) {
//         return res.status(400).json({
//           success: false,
//           message: "Co-applicant mobile not verified",
//         });
//       }
//     }

//     const { cust_lan, cust_partner_loan_id } = await generateLoanIdentifiers(
//       "MOTION-CORP_CUSTOMER",
//     );

//     await connection.beginTransaction();

//     const values = [
//       emptyToNull(data.lenderType),
//       emptyToNull(data.lender),
//       emptyToNull(data.product),
//       emptyToNull(data.status),
//       cust_partner_loan_id,
//       cust_lan,

//       emptyToNull(data.LOGIN_DATE),
//       emptyToNull(data.First_Name),
//       emptyToNull(data.Last_Name),
//       emptyToNull(data.Customer_Name),
//       emptyToNull(data.Borrower_DOB),
//       emptyToNull(data.Father_Name),
//       emptyToNull(data.Mobile_Number),
//       emptyToNull(data.Email),
//       emptyToNull(data.Pan_Card),
//       emptyToNull(data.Gender),

//       emptyToNull(data.Address_Line_1),
//       emptyToNull(data.Address_Line_2),
//       emptyToNull(data.Village),
//       emptyToNull(data.District),
//       emptyToNull(data.State),
//       emptyToNull(data.Pincode),

//       numberOrNull(data.Loan_Amount),
//       numberOrNull(data.Interest_Rate),
//       numberOrNull(data.Tenure),
//       numberOrNull(data.Disbursal_Amount),
//       numberOrNull(data.Processing_Fee),
//       numberOrNull(data.Processing_Fee_Percentage),

//       emptyToNull(data.GURANTOR),
//       emptyToNull(data.GURANTOR_DOB),
//       emptyToNull(data.GURANTOR_EMAIL),
//       emptyToNull(data.GURANTOR_PAN),
//       emptyToNull(data.GURANTOR_MOBILE),
//       emptyToNull(data.Relationship_with_Borrower),
//       emptyToNull(data.GURANTOR_Address_Line_1),
//       emptyToNull(data.GURANTOR_Address_Line_2),
//       emptyToNull(data.GURANTOR_Village),
//       emptyToNull(data.GURANTOR_District),
//       emptyToNull(data.GURANTOR_State),
//       emptyToNull(data.GURANTOR_Pincode),

//       emptyToNull(data.Co_Applicant),
//       emptyToNull(data.Co_Applicant_DOB),
//       emptyToNull(data.Co_Applicant_Email),
//       emptyToNull(data.Co_Applicant_PAN),
//       emptyToNull(data.Co_Applicant_Mobile),
//       emptyToNull(data.Co_Applicant_Address_Line_1),
//       emptyToNull(data.Co_Applicant_Address_Line_2),
//       emptyToNull(data.Co_Applicant_Village),
//       emptyToNull(data.Co_Applicant_District),
//       emptyToNull(data.Co_Applicant_State),
//       emptyToNull(data.Co_Applicant_Pincode),

//       emptyToNull(data.customer_name_as_per_bank),
//       emptyToNull(data.customer_bank_name),
//       emptyToNull(data.customer_account_number),
//       emptyToNull(data.bank_ifsc_code),

//       emptyToNull(data.selected_dealer_application_id),
//       emptyToNull(data.dealer_id),
//       emptyToNull(data.trade_name),
//       emptyToNull(data.dealer_name),
//       emptyToNull(data.dealer_contact),
//       emptyToNull(data.dealer_email),
//       emptyToNull(data.gst_no),
//       emptyToNull(data.pan_number),
//       emptyToNull(data.dealer_address),
//       emptyToNull(data.dealer_city),
//       emptyToNull(data.dealer_state),
//       emptyToNull(data.dealer_pincode),

//       emptyToNull(data.bank_name),
//       emptyToNull(data.account_number),
//       emptyToNull(data.ifsc),
//       emptyToNull(data.name_in_bank),

//       numberOrNull(data.selected_product_id),
//       emptyToNull(data.Battery_Name),
//       emptyToNull(data.Battery_Type),
//       emptyToNull(data.Battery_Serial_no_1),
//       emptyToNull(data.Battery_Serial_no_2),
//       emptyToNull(data.E_Rikshaw_model),
//       emptyToNull(data.Chassis_no),
//       data.borrower_mobile_verified || 0,
//       data.guarantor_mobile_verified || 0,
//       data.co_applicant_mobile_verified || 0,
//     ];

//     const insertQuery = `
//       INSERT INTO loan_booking_motion_corp (
//         lender_type,
//         lender,
//         product,
//         status,
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

//         permanent_address_line_1,
//         permanent_address_line_2,
//         permanent_village_city,
//         permanent_district,
//         permanent_state,
//         permanent_pincode,

//         loan_amount,
//         interest_rate,
//         loan_tenure,
//         disbursal_amount,
//         processing_fee,
//         processing_fee_percentage,

//         guarantor_name,
//         guarantor_dob,
//         guarantor_email,
//         guarantor_pan,
//         guarantor_mobile,
//         relationship_with_borrower,
//         guarantor_address_line_1,
//         guarantor_address_line_2,
//         guarantor_village_city,
//         guarantor_district,
//         guarantor_state,
//         guarantor_pincode,

//         co_applicant_name,
//         co_applicant_dob,
//         co_applicant_email,
//         co_applicant_pan,
//         co_applicant_mobile,
//         co_applicant_address_line_1,
//         co_applicant_address_line_2,
//         co_applicant_village_city,
//         co_applicant_district,
//         co_applicant_state,
//         co_applicant_pincode,

//         customer_name_as_per_bank,
//         customer_bank_name,
//         customer_account_number,
//         bank_ifsc_code,

//         selected_dealer_application_id,
//         dealer_id,
//         trade_name,
//         dealer_name,
//         dealer_contact,
//         dealer_email,
//         gst_no,
//         pan_number,
//         dealer_address,
//         dealer_city,
//         dealer_state,
//         dealer_pincode,

//         dealer_bank_name,
//         dealer_account_number,
//         dealer_ifsc,
//         dealer_name_in_bank,

//         selected_product_id,
//         battery_name,
//         battery_type,
//         battery_serial_no_1,
//         battery_serial_no_2,
//         e_rikshaw_model,
//         chassis_no,
//         borrower_mobile_verified,
//         guarantor_mobile_verified,
//         co_applicant_mobile_verified
//       )
//       VALUES (${values.map(() => "?").join(", ")})
//     `;

//     await connection.query(insertQuery, values);

//     await connection.query(
//       `   UPDATE otp_consent_model
//   SET is_used = 1
//   WHERE mobile_number = ?
//   AND applicant_type = ?
//   `,
//       [data.Mobile_Number, "BORROWER"],
//     );

//     await connection.query(
//       `   UPDATE otp_consent_model
//   SET is_used = 1
//   WHERE mobile_number = ?
//   AND applicant_type = ?
//   `,
//       [data.GURANTOR_MOBILE, "GUARANTOR"],
//     );

//     if (data.Co_Applicant) {
//       await connection.query(
//         `     UPDATE otp_consent_model
//     SET is_used = 1
//     WHERE mobile_number = ?
//     AND applicant_type =
//     'CO_APPLICANT'
//     `,
//         [data.Co_Applicant_Mobile],
//       );
//     }

//     await connection.commit();

//     universalRunAllValidations(cust_lan);

//     return res.status(201).json({
//       success: true,
//       message: "Motion Corp loan booking saved successfully",
//       partner_loan_id: cust_partner_loan_id,
//       lan: cust_lan,
//     });
//   } catch (error) {
//     await connection.rollback();

//     console.error("Motion Corp loan booking save error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to save Motion Corp loan booking",
//       error: error.message,
//     });
//   } finally {
//     connection.release();
//   }
// });

router.post("/update-stamp-number", async (req, res) => {
  try {
    const lan = String(req.body.lan ?? "").trim();
    const stamp_paper_no = String(req.body.stamp_paper_no ?? "").trim();

    if (!lan || !stamp_paper_no) {
      return res.status(400).json({
        status: "FAILED",
        message: "lan and stamp_paper_no are required",
      });
    }

    const [result] = await db.promise().execute(
      `
      UPDATE loan_booking_motion_corp
      SET stamp_paper_no = ?
      WHERE lan = ?
      `,
      [stamp_paper_no, lan],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "FAILED",
        message: "Loan not found",
      });
    }

    return res.json({
      status: "SUCCESS",
      message: "Stamp paper number updated successfully",
    });
  } catch (error) {
    console.error("Update stamp paper number error:", error);

    return res.status(500).json({
      status: "FAILED",
      message: "Failed to update stamp paper number",
    });
  }
});

router.post("/save-borrower-first-section", async (req, res) => {
  const connection = await db.promise().getConnection();

  try {
    const data = req.body;

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

    const { cust_lan, cust_partner_loan_id } = await generateLoanIdentifiers(
      "MOTION-CORP_CUSTOMER",
    );

    await connection.beginTransaction();

    await connection.query(
      `
      INSERT INTO loan_booking_motion_corp (
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
        driving_licence,
        borrower_mobile_verified
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
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
        emptyToNull(data.Driving_Licence),
        data.borrower_mobile_verified || 1,
      ],
    );

    await connection.query(
      `
      UPDATE otp_consent_model
      SET is_used = 1
      WHERE id = ?
      `,
      [borrowerOtp[0].id],
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
      ],
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Borrower saved and LAN generated",
      lan: cust_lan,
      partner_loan_id: cust_partner_loan_id,
    });
  } catch (error) {
    await connection.rollback();

    return res.status(500).json({
      success: false,
      message: "Failed to save borrower section",
      error: error.message,
    });
  } finally {
    connection.release();
  }
});

const runMotionCorpBureauScreening = async (req, res) => {
  const pool = db.promise();

  const data = req.body || {};
  const lan = String(data.lan || "").trim();

  if (!lan) {
    return res.status(400).json({
      success: false,
      message: "LAN is required",
    });
  }

  const addressLine1 = String(data.Address_Line_1 || "").trim();
  const village = String(data.Village || "").trim();
  const state = String(data.State || "").trim();
  const pincode = String(data.Pincode || "").trim();

  const loanAmount = numberOrNull(data.Loan_Amount);
  const interestRate = numberOrNull(data.Interest_Rate);
  const tenure = numberOrNull(data.Tenure);
  const processingFee = numberOrNull(data.Processing_Fee);
  const processingFeePercentage = numberOrNull(data.Processing_Fee_Percentage);
  const gpsCharges = numberOrNull(data.GPS_Charges);
  const disbursalAmount = numberOrNull(data.Disbursal_Amount);

  if (!addressLine1 || !village || !state || !/^[1-9]\d{5}$/.test(pincode)) {
    return res.status(400).json({
      success: false,
      message:
        "A valid address, village, state and six-digit pincode are required before bureau screening.",
    });
  }

  if (!loanAmount || loanAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Valid loan amount is required",
    });
  }

  if (!tenure || tenure <= 0) {
    return res.status(400).json({
      success: false,
      message: "Valid loan tenure is required",
    });
  }

  try {
    const [existingRows] = await pool.query(
      `
  SELECT
    lan,
    borrower_mobile_verified,
    motion_bureau_screening_status,
    motion_bureau_screening_reason,
    motion_bureau_screening_checked_at,
    fintree_cibil_score
  FROM loan_booking_motion_corp
  WHERE lan = ?
  LIMIT 1
  `,
      [lan],
    );

    if (!existingRows.length) {
      return res.status(404).json({
        success: false,
        message: "Motion Corp loan booking not found",
      });
    }

    if (Number(existingRows[0].borrower_mobile_verified) !== 1) {
      return res.status(409).json({
        success: false,
        message: "Borrower mobile verification is required",
      });
    }

    const existingLoan = existingRows[0];

    const existingBureauStatus = String(
      existingLoan.motion_bureau_screening_status || "",
    )
      .trim()
      .toUpperCase();

    const terminalBureauStatuses = ["BUREAU APPROVED", "BUREAU REJECTED"];

    if (terminalBureauStatuses.includes(existingBureauStatus)) {
      const storedReason = String(
        existingLoan.motion_bureau_screening_reason || "",
      ).trim();

      const storedReasons =
        storedReason && storedReason !== "ELIGIBLE"
          ? storedReason
              .split(",")
              .map((reason) => reason.trim())
              .filter(Boolean)
          : [];

      return res.json({
        success: true,
        alreadyScreened: true,
        screeningStatus: existingBureauStatus,
        screeningReason: storedReason || "ELIGIBLE",
        canContinue: true,
        bureauScore: existingLoan.fintree_cibil_score,
        reasons: storedReasons,
      });
    }

    // /*
    //  * Save Address and Loan Details before bureau.
    //  */
    // await pool.query(
    //   `
    //   UPDATE loan_booking_motion_corp
    //   SET
    //     permanent_address_line_1 = ?,
    //     permanent_address_line_2 = ?,
    //     permanent_village_city = ?,
    //     permanent_district = ?,
    //     permanent_state = ?,
    //     permanent_pincode = ?,

    //     requested_loan_amount = ?,
    //     interest_rate = ?,
    //     loan_tenure = ?,
    //     processing_fee = ?,
    //     processing_fee_percentage = ?,
    //     gps_charges = ?,
    //     disbursal_amount = ?
    //   WHERE lan = ?
    //   `,
    //   [
    //     addressLine1,
    //     emptyToNull(data.Address_Line_2),
    //     village,
    //     emptyToNull(data.District),
    //     state,
    //     pincode,

    //     loanAmount,
    //     interestRate,
    //     tenure,
    //     processingFee,
    //     processingFeePercentage,
    //     gpsCharges,
    //     disbursalAmount,

    //     lan,
    //   ],
    // );

    // /*
    //  * Prevent two simultaneous chargeable bureau requests.
    //  * A stale INITIATED request may retry after two minutes.
    //  */
    // const [claimResult] = await pool.query(
    //   `
    //   UPDATE loan_booking_motion_corp
    //   SET
    //     motion_bureau_screening_status = 'INITIATED',
    //     motion_bureau_screening_reason = NULL,
    //     motion_bureau_screening_checked_at = NOW()
    //   WHERE lan = ?
    //     AND (
    //       motion_bureau_screening_status IS NULL
    //       OR motion_bureau_screening_status <> 'INITIATED'
    //       OR motion_bureau_screening_checked_at IS NULL
    //       OR motion_bureau_screening_checked_at < DATE_SUB(NOW(), INTERVAL 2 MINUTE)
    //     )
    //   `,
    //   [lan],
    // );

    /*
     * Save the submitted details and claim bureau screening atomically.
     * A request that does not acquire this claim cannot overwrite
     * address or loan details.
     */
    const [claimResult] = await pool.query(
      `
  UPDATE loan_booking_motion_corp
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
    processing_fee = ?,
    processing_fee_percentage = ?,
    gps_charges = ?,
    disbursal_amount = ?,

    motion_bureau_screening_status = 'INITIATED',
    motion_bureau_screening_reason = NULL,
    motion_bureau_screening_checked_at = NOW()
  WHERE lan = ?
    AND borrower_mobile_verified = 1
    AND (
      motion_bureau_screening_status IS NULL
      OR TRIM(motion_bureau_screening_status) = ''
      OR motion_bureau_screening_status IN ('PENDING', 'FAILED')
      OR (
        motion_bureau_screening_status = 'INITIATED'
        AND motion_bureau_screening_checked_at <
          DATE_SUB(NOW(), INTERVAL 15 MINUTE)
      )
    )
  `,
      [
        addressLine1,
        emptyToNull(data.Address_Line_2),
        village,
        emptyToNull(data.District),
        state,
        pincode,

        loanAmount,
        interestRate,
        tenure,
        processingFee,
        processingFeePercentage,
        gpsCharges,
        disbursalAmount,

        lan,
      ],
    );

    if (claimResult.affectedRows !== 1) {
      const [currentRows] = await pool.query(
        `
    SELECT
      motion_bureau_screening_status,
      motion_bureau_screening_reason,
      fintree_cibil_score
    FROM loan_booking_motion_corp
    WHERE lan = ?
    LIMIT 1
    `,
        [lan],
      );

      const currentLoan = currentRows[0] || {};

      const currentStatus = String(
        currentLoan.motion_bureau_screening_status || "",
      )
        .trim()
        .toUpperCase();

      if (terminalBureauStatuses.includes(currentStatus)) {
        return res.json({
          success: true,
          alreadyScreened: true,
          screeningStatus: currentStatus,
          screeningReason:
            currentLoan.motion_bureau_screening_reason || "ELIGIBLE",
          canContinue: true,
          bureauScore: currentLoan.fintree_cibil_score,
        });
      }

      return res.status(409).json({
        success: false,
        code: "BUREAU_SCREENING_IN_PROGRESS",
        message: "Borrower bureau screening is already in progress.",
        screeningStatus: currentStatus || "INITIATED",
      });
    }

    const [loanRows] = await pool.query(
      `
      SELECT *
      FROM loan_booking_motion_corp
      WHERE lan = ?
      LIMIT 1
      `,
      [lan],
    );

    const loan = loanRows[0];

    /*
     * Only borrower bureau is run here.
     * PAN, Aadhaar and final Motion Corp BRE are not triggered.
     */
    await runApplicantValidation({
      pool,
      lan,
      table: "loan_booking_motion_corp",
      applicantType: "BORROWER",
      partyNo: 1,

      applicantData: {
        customer_name: loan.customer_name,
        first_name: loan.first_name,
        last_name: loan.last_name,
        dob: loan.dob,
        gender: loan.gender,
        pan_number: loan.pan_card,
        mobile_number: loan.mobile_number,
        email: loan.email,

        current_address: loan.permanent_address_line_1,
        current_village_city: loan.permanent_village_city,
        current_state: loan.permanent_state,
        current_pincode: loan.permanent_pincode,

        loan_amount: loan.requested_loan_amount,
        loan_tenure: loan.loan_tenure,
      },

      validations: {
        pan: false,
        aadhaar: false,
        bureau: true,
      },
    });

    const [kycRows] = await pool.query(
      `
      SELECT bureau_status, bureau_api_response
      FROM kyc_verification_status
      WHERE lan = ?
        AND applicant_type = 'BORROWER'
        AND party_no = 1
      LIMIT 1
      `,
      [lan],
    );

    const bureauStatus = String(kycRows[0]?.bureau_status || "").toUpperCase();

    if (bureauStatus !== "VERIFIED") {
      const failureReason =
        "Borrower bureau could not be verified. Please retry.";

      await pool.query(
        `
        UPDATE loan_booking_motion_corp
        SET
          motion_bureau_screening_status = 'FAILED',
          motion_bureau_screening_reason = ?,
          motion_bureau_screening_checked_at = NOW()
        WHERE lan = ?
        `,
        [failureReason, lan],
      );

      return res.status(502).json({
        success: false,
        message: failureReason,
        bureauStatus: bureauStatus || "FAILED",
      });
    }

    const [reportRows] = await pool.query(
      `
      SELECT score, report_xml
      FROM loan_cibil_reports
      WHERE lan = ?
        AND applicant_type = 'BORROWER'
        AND party_no = 1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      `,
      [lan],
    );

    if (!reportRows.length || !reportRows[0].report_xml) {
      throw new Error("Verified bureau report XML was not found");
    }

    const bureauFacts = extractMotionCorpBureauFacts(reportRows[0].report_xml);

    if (bureauFacts.score === null || bureauFacts.score === undefined) {
      throw new Error("Bureau score was not found in the report");
    }

    const decision = evaluateMotionCorpBureauScreening({
      loanPan: loan.pan_card,
      bureauFacts,
    });

    const allFlags = [...decision.reasons, ...decision.deviations];

    const reasonText = allFlags.length ? allFlags.join(", ") : "ELIGIBLE";

    await pool.query(
      `
      UPDATE loan_booking_motion_corp
      SET
        motion_bureau_screening_status = ?,
        motion_bureau_screening_reason = ?,
        motion_bureau_screening_checked_at = NOW(),

        fintree_cibil_score = ?,
        motioncorp_enquiries_30d = ?,
        motioncorp_dpd_3m_flag = ?,
        motioncorp_dpd_6m_flag = ?,
        motioncorp_overdue_12m_flag = ?,
        motioncorp_written_off_3y_flag = ?,
        motioncorp_60plus_24m_flag = ?,
        motioncorp_90plus_36m_flag = ?,
        motioncorp_emi_overdue_amount = ?,
        motioncorp_cc_overdue_amount = ?
      WHERE lan = ?
      `,
      [
        decision.status,
        reasonText,

        decision.bureauScore,
        bureauFacts.enquiries30d,
        bureauFacts.hasDpd3M ? 1 : 0,
        bureauFacts.hasDpd6M ? 1 : 0,
        bureauFacts.hasOverdue12M ? 1 : 0,
        bureauFacts.hasWrittenOff3Y ? 1 : 0,
        bureauFacts.has60Plus24M ? 1 : 0,
        bureauFacts.has90Plus36M ? 1 : 0,
        bureauFacts.emiOverdueAmount,
        bureauFacts.ccOverdueAmount,

        lan,
      ],
    );

    return res.json({
      success: true,

      screeningStatus: decision.status,
      screeningReason: reasonText,

      // Advisory screening: both terminal outcomes can proceed.
      canContinue: true,

      bureauScore: decision.bureauScore,
      isNtc: decision.isNtc,

      bureauFacts: {
        score: decision.bureauScore,
        enquiries30d: bureauFacts.enquiries30d,
        hasDpd3M: bureauFacts.hasDpd3M,
        hasDpd6M: bureauFacts.hasDpd6M,
        hasOverdue12M: bureauFacts.hasOverdue12M,
        hasWrittenOff3Y: bureauFacts.hasWrittenOff3Y,
        has60Plus24M: bureauFacts.has60Plus24M,
        has90Plus36M: bureauFacts.has90Plus36M,
        emiOverdueAmount: bureauFacts.emiOverdueAmount,
        ccOverdueAmount: bureauFacts.ccOverdueAmount,
      },

      reasons: allFlags,
      deviations: decision.deviations,
    });
  } catch (error) {
    console.error("Motion Corp bureau screening error:", error);

    await pool
      .query(
        `
        UPDATE loan_booking_motion_corp
        SET
          motion_bureau_screening_status = 'FAILED',
          motion_bureau_screening_reason = ?,
          motion_bureau_screening_checked_at = NOW()
        WHERE lan = ?
        `,
        [
          String(error.message || "Bureau screening failed").slice(0, 1000),
          lan,
        ],
      )
      .catch(() => {});

    return res.status(500).json({
      success: false,
      message: "Borrower bureau screening failed",
      error: error.message,
    });
  }
};

router.post("/run-bureau-screening", runMotionCorpBureauScreening);

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

//     const [[screeningRow]] = await connection.query(
//       `
//   SELECT motion_bureau_screening_status
//   FROM loan_booking_motion_corp
//   WHERE lan = ?
//   LIMIT 1
//   `,
//       [data.lan],
//     );

//     if (!screeningRow) {
//       return res.status(404).json({
//         success: false,
//         message: "Motion Corp loan booking not found",
//       });
//     }

//     const screeningStatus = String(
//       screeningRow.motion_bureau_screening_status || "",
//     )
//       .trim()
//       .toUpperCase();

//     const bureauScreeningCompleted = [
//       "BUREAU APPROVED",
//       "BUREAU REJECTED",
//     ].includes(screeningStatus);

//     if (!bureauScreeningCompleted) {
//       return res.status(409).json({
//         success: false,
//         code: "BUREAU_SCREENING_REQUIRED",
//         message:
//           "Borrower bureau screening must be completed before final submission.",
//         screeningStatus: screeningStatus || "PENDING",
//       });
//     }

//     const today = new Date();
//     const loanAmount = data.Loan_Amount;
//     const { month, year } = getMonthYear(today);

//     const partnerName = "Motion Corp";

//     await connection.beginTransaction();

//     const partner = await partnerLimitService.getOrCreatePartner(
//       connection,
//       partnerName,
//     );

//     const limitCheck = await partnerLimitService.validatePartnerBookingLimit(
//       connection,
//       partner.partner_id,
//       loanAmount,
//       month,
//       year,
//     );

//     if (!limitCheck.valid) {
//       await connection.rollback();

//       return res.status(400).json({
//         success: false,
//         stage: "limit-check",
//         message: `Booking Limit exceeded. Remaining ${limitCheck.remaining}, Required ${loanAmount}`,
//       });
//     }

//     // Fetch partner FLDG percent
//     const [[partnerConfig]] = await connection.query(
//       `SELECT fldg_percent, fldg_status FROM partner_master WHERE partner_id = ?`,
//       [partner.partner_id],
//     );

//     if (!partnerConfig) {
//       throw new Error("Partner configuration not found");
//     }

//     let requiredFldg = 0;

//     if (partnerConfig?.fldg_status === 1) {
//       const fldgPercent = Number(partnerConfig?.fldg_percent || 0);

//       requiredFldg = Number(((loanAmount * fldgPercent) / 100).toFixed(2));
//     }

//     // Validate FLDG availability
//     if (requiredFldg > 0) {
//       const fldgCheck = await partnerFldgService.validateFldgAvailability(
//         connection,
//         partner.partner_id,
//         requiredFldg,
//       );

//       if (!fldgCheck.valid) {
//         await connection.rollback();

//         return res.status(400).json({
//           success: false,
//           stage: "fldg-check",
//           message: `Insufficient FLDG. Available: ${fldgCheck.available}, Required: ${requiredFldg}`,
//         });
//       }
//     }

//     await connection.query(
//       `
//       UPDATE loan_booking_motion_corp
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
//         gps_charges = ?,

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
//         guarantor_driving_licence = ?,

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
//         co_applicant_driving_licence = ?,

//         customer_name_as_per_bank = ?,
//         customer_bank_name = ?,
//         customer_account_number = ?,
//         bank_ifsc_code = ?,
//         bank_branch_address = ?,

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
//         insurance_cost = ?,
//         insurance_company_provider = ?,
//         insurance_policy_number = ?,
//         policy_issued_date = ?,
//         period_of_insurance = ?,

//         cost_of_vehicle = ?,
//         manufacturing_year = ?,
//         sales_invoice_number = ?,
//         sales_invoice_date = ?,
//         downpayment_paid_by_borrower = ?,
//         vehicle_registration_cost = ?
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
//         numberOrNull(data.GPS_Charges),

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
//         emptyToNull(data.GURANTOR_Driving_Licence),

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
//         emptyToNull(data.Co_Applicant_Driving_Licence),

//         emptyToNull(data.customer_name_as_per_bank),
//         emptyToNull(data.customer_bank_name),
//         emptyToNull(data.customer_account_number),
//         emptyToNull(data.bank_ifsc_code),
//         emptyToNull(data.bank_branch_address),

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
//         numberOrNull(data.insurance_cost),
//         emptyToNull(data.insurance_company_provider),
//         emptyToNull(data.insurance_policy_number),
//         emptyToNull(data.policy_issued_date),
//         emptyToNull(data.period_of_insurance),

//         numberOrNull(data.cost_of_vehicle),
//         emptyToNull(data.manufacturing_year),
//         emptyToNull(data.sales_invoice_number),
//         emptyToNull(data.sales_invoice_date),
//         numberOrNull(data.downpayment_paid_by_borrower),
//         numberOrNull(data.vehicle_registration_cost),
//         data.lan,
//       ],
//     );

//     await partnerLimitService.updateBookedLimit(
//       connection,
//       limitCheck.limitId,
//       loanAmount,
//       data.lan,
//     );

//     /*
//     --------------------------------------------------
//     6. Reserve FLDG
//     --------------------------------------------------
//     Important:
//     If final-submit can be called multiple times for the same LAN,
//     you should also add duplicate FLDG reservation protection.
//     --------------------------------------------------
//     */

//     if (requiredFldg > 0) {
//       const [[alreadyReserved]] = await connection.query(
//         `
//         SELECT id
//         FROM partner_fldg_utilization
//         WHERE partner_id = ?
//           AND booking_lan = ?
//           AND utilization_type = 'RESERVED'
//         LIMIT 1
//         `,
//         [partner.partner_id, data.lan],
//       );

//       if (!alreadyReserved) {
//         await partnerFldgService.reserveFldg(
//           connection,
//           partner.partner_id,
//           data.lan,
//           requiredFldg,
//           `Motion Corp booking reservation | Amount: ${loanAmount}`,
//         );
//       }
//     }

//     await connection.commit();

//     universalRunAllValidations(data.lan).catch((err) => {
//       console.error("Validation engine failed after booking:", err);
//     });

//     return res.json({
//       success: true,
//       message: "Motion Corp loan booking submitted successfully",
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

router.post("/final-submit-ev-customer-manual", async (req, res) => {
  const connection = await db.promise().getConnection();
  let transactionStarted = false;

  try {
    const data = req.body || {};
    const lan = String(data.lan || "").trim();

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN required. Please save borrower first.",
      });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    /*
     * Lock the loan row:
     * two simultaneous final submissions cannot process the same LAN.
     */
    const [loanRows] = await connection.query(
      `
      SELECT
        lan,
        motion_bureau_screening_status,
        final_submission_status,
        final_submitted_at,

        borrower_mobile_verified,

        guarantor_name,
        guarantor_mobile,
        guarantor_mobile_verified,

        co_applicant_name,
        co_applicant_mobile,
        co_applicant_mobile_verified
      FROM loan_booking_motion_corp
      WHERE lan = ?
      LIMIT 1
      FOR UPDATE
      `,
      [lan],
    );

    if (!loanRows.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Motion Corp loan booking not found",
      });
    }

    const loan = loanRows[0];

    /*
     * Idempotency:
     * return success without updating anything a second time.
     */
    if (
      String(loan.final_submission_status || "").toUpperCase() ===
        "SUBMITTED" ||
      loan.final_submitted_at
    ) {
      await connection.commit();
      transactionStarted = false;

      return res.json({
        success: true,
        alreadySubmitted: true,
        message: "Motion Corp loan booking already submitted",
        lan,
      });
    }

    /*
     * Bureau must have a terminal result.
     * Both approved and advisory rejected cases can proceed.
     */
    const bureauStatus = String(loan.motion_bureau_screening_status || "")
      .trim()
      .toUpperCase();

    if (!["BUREAU APPROVED", "BUREAU REJECTED"].includes(bureauStatus)) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        code: "BUREAU_SCREENING_REQUIRED",
        message:
          "Borrower bureau screening must be completed before final submission.",
        screeningStatus: bureauStatus || "PENDING",
      });
    }

    /*
     * Never trust mobile-verification flags received from React.
     */
    if (Number(loan.borrower_mobile_verified) !== 1) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        code: "BORROWER_MOBILE_VERIFICATION_REQUIRED",
        message: "Borrower mobile number is not verified",
      });
    }

    const hasGuarantor =
      String(loan.guarantor_name || "").trim() !== "" ||
      String(loan.guarantor_mobile || "").trim() !== "";

    const hasCoApplicant =
      String(loan.co_applicant_name || "").trim() !== "" ||
      String(loan.co_applicant_mobile || "").trim() !== "";

    if (!hasGuarantor && !hasCoApplicant) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        code: "SECOND_PARTY_REQUIRED",
        message: "Either guarantor or co-applicant details are required",
      });
    }

    if (hasGuarantor && Number(loan.guarantor_mobile_verified) !== 1) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        code: "GUARANTOR_MOBILE_VERIFICATION_REQUIRED",
        message: "Guarantor mobile number is not verified",
      });
    }

    if (hasCoApplicant && Number(loan.co_applicant_mobile_verified) !== 1) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        code: "CO_APPLICANT_MOBILE_VERIFICATION_REQUIRED",
        message: "Co-applicant mobile number is not verified",
      });
    }

    /*
     * Address and loan details are intentionally not updated here.
     * They were saved before bureau screening and must remain the exact
     * values against which bureau screening was completed.
     *
     * Guarantor/co-applicant identity is also not overwritten here.
     * Those details were saved and mobile-verified earlier.
     */
    const [updateResult] = await connection.query(
      `
      UPDATE loan_booking_motion_corp
      SET
        customer_name_as_per_bank = ?,
        customer_bank_name = ?,
        customer_account_number = ?,
        bank_ifsc_code = ?,
        bank_branch_address = ?,

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
        sales_invoice_number = ?,
        sales_invoice_date = ?,
        downpayment_paid_by_borrower = ?,
        vehicle_registration_cost = ?,

        final_submission_status = 'SUBMITTED',
        final_submitted_at = NOW()
      WHERE lan = ?
        AND COALESCE(final_submission_status, '') <> 'SUBMITTED'
      `,
      [
        emptyToNull(data.customer_name_as_per_bank),
        emptyToNull(data.customer_bank_name),
        emptyToNull(data.customer_account_number),
        emptyToNull(data.bank_ifsc_code),
        emptyToNull(data.bank_branch_address),

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

        numberOrNull(data.insurance_cost),
        emptyToNull(data.insurance_company_provider),
        emptyToNull(data.insurance_policy_number),
        emptyToNull(data.policy_issued_date),
        emptyToNull(data.period_of_insurance),

        numberOrNull(data.cost_of_vehicle),
        emptyToNull(data.manufacturing_year),
        emptyToNull(data.sales_invoice_number),
        emptyToNull(data.sales_invoice_date),
        numberOrNull(data.downpayment_paid_by_borrower),
        numberOrNull(data.vehicle_registration_cost),

        lan,
      ],
    );

    if (updateResult.affectedRows !== 1) {
      throw new Error("Final submission update was not completed");
    }

    /*
     * No partner-limit validation.
     * No booking-limit deduction.
     * No FLDG validation or reservation.
     */
    await connection.commit();
    transactionStarted = false;

    universalRunAllValidations(lan).catch((error) => {
      console.error("Validation engine failed after final submission:", {
        lan,
        error: error.message,
      });
    });

    return res.json({
      success: true,
      alreadySubmitted: false,
      message: "Motion Corp loan booking submitted successfully",
      lan,
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback().catch(() => {});
    }

    console.error("Final Motion Corp submit failed:", {
      lan: req.body?.lan,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "Final submission failed",
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
SELECT
  lb.*,

  lb.fintree_cibil_score AS motion_bureau_score,
  lb.motioncorp_enquiries_30d AS motion_enquiries_30d,
  lb.motioncorp_dpd_3m_flag AS motion_dpd_3m_flag,
  lb.motioncorp_dpd_6m_flag AS motion_dpd_6m_flag,
  lb.motioncorp_emi_overdue_amount AS motion_emi_overdue_amount,
  lb.motioncorp_cc_overdue_amount AS motion_cc_overdue_amount

FROM loan_booking_motion_corp lb
WHERE lb.lan = ?
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

// router.post("/send-otp", async (req, res) => {
//   try {
//     console.log("Incoming body:", req.body);

//     const { mobile, applicantType } = req.body;

//     if (!mobile) {
//       return res.status(400).json({
//         success: false,
//         message: "Mobile required",
//       });
//     }

//     if (!applicantType) {
//       return res.status(400).json({
//         success: false,
//         message: "Applicant type required",
//       });
//     }

//     const cleanedMobile = mobile.replace(/\D/g, "");

//     const [existing] = await db.promise().query(
//       `
//     SELECT *
//     FROM otp_consent_model
//     WHERE mobile_number = ?
//     AND applicant_type = ?
//     ORDER BY id DESC
//     LIMIT 1
//     `,
//       [cleanedMobile, applicantType],
//     );

//     if (existing.length) {
//       const lastSent = new Date(existing[0].last_sent_at);

//       const diffSeconds = (Date.now() - lastSent.getTime()) / 1000;

//       if (diffSeconds < 60) {
//         return res.status(429).json({
//           success: false,
//           message: `Wait ${Math.ceil(60 - diffSeconds)} seconds before retry`,
//         });
//       }
//     }

//     const otp = Math.floor(100000 + Math.random() * 900000);

//     const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

//     const smsParams = {
//       user: process.env.ALOT_USER,
//       password: process.env.ALOT_PASSWORD,
//       senderid: process.env.SENDER_ID,
//       channel: "TRANS",
//       DCS: "0",
//       flashsms: "0",
//       number: cleanedMobile,

//       text: `OTP for mobile number verification is ${otp}. Do not share this OTP with anyone. Thanks & Regards Fintree Finance Private Limited:`,
//       route: "5",

//       DLTTemplateId: process.env.MOBILE_OTP_TEMPLATE_ID,

//       PEID: process.env.DLT_PEID,
//     };

//     console.log("Sending SMS with:", smsParams);

//     await axios.get(process.env.ALOT_API_URL, {
//       params: smsParams,
//     });

//     await db.promise().query(
//       `
//   INSERT INTO otp_consent_model (
//     mobile_number,
//     applicant_type,
//     otp,
//     expires_at,
//     last_sent_at,
//     verified
//   )
//   VALUES (
//     ?, ?, ?, ?, NOW(), 0
//   )
//   `,
//       [cleanedMobile, applicantType, otp, expiresAt],
//     );

//     return res.json({
//       success: true,
//       message: "OTP sent successfully",
//     });
//   } catch (err) {
//     console.error("SMS error:", err.message);

//     return res.status(500).json({
//       success: false,
//       message: "OTP send failed",
//     });
//   }
// });

router.post("/send-otp", async (req, res) => {
  try {
    const { mobile, applicantType, lan } = req.body || {};

    const allowedApplicantTypes = ["BORROWER", "GUARANTOR", "CO_APPLICANT"];

    if (!allowedApplicantTypes.includes(applicantType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid applicant type",
      });
    }

    const cleanedMobile = String(mobile || "").replace(/\D/g, "");

    if (!/^[6-9]\d{9}$/.test(cleanedMobile)) {
      return res.status(400).json({
        success: false,
        message: "Valid 10-digit mobile number is required",
      });
    }

    /*
     * If LAN exists, first check whether this number is already
     * verified and bound to this particular loan.
     */
    if (lan) {
      const [loanRows] = await db.promise().query(
        `
        SELECT
          mobile_number,
          borrower_mobile_verified,
          guarantor_mobile,
          guarantor_mobile_verified,
          co_applicant_mobile,
          co_applicant_mobile_verified
        FROM loan_booking_motion_corp
        WHERE lan = ?
        LIMIT 1
        `,
        [lan],
      );

      if (!loanRows.length) {
        return res.status(404).json({
          success: false,
          message: "Motion Corp loan not found",
        });
      }

      const loan = loanRows[0];

      let storedMobile = "";
      let storedVerified = false;

      if (applicantType === "BORROWER") {
        storedMobile = loan.mobile_number;
        storedVerified = Number(loan.borrower_mobile_verified) === 1;
      }

      if (applicantType === "GUARANTOR") {
        storedMobile = loan.guarantor_mobile;
        storedVerified = Number(loan.guarantor_mobile_verified) === 1;
      }

      if (applicantType === "CO_APPLICANT") {
        storedMobile = loan.co_applicant_mobile;
        storedVerified = Number(loan.co_applicant_mobile_verified) === 1;
      }

      const normalizedStoredMobile = String(storedMobile || "").replace(
        /\D/g,
        "",
      );

      if (storedVerified && normalizedStoredMobile === cleanedMobile) {
        return res.json({
          success: true,
          alreadyVerified: true,
          otpSent: false,
          message: "Number already verified",
        });
      }
    }

    /*
     * Find the current unused OTP session.
     */
    const [existingRows] = await db.promise().query(
      `
      SELECT
        id,
        verified,
        is_used,
        last_sent_at
      FROM otp_consent_model
      WHERE mobile_number = ?
        AND applicant_type = ?
        AND is_used = 0
      ORDER BY id DESC
      LIMIT 1
      `,
      [cleanedMobile, applicantType],
    );

    const existingOtp = existingRows[0] || null;

    /*
     * OTP was verified but has not yet been bound to a LAN.
     */
    if (existingOtp && Number(existingOtp.verified) === 1) {
      return res.json({
        success: true,
        alreadyVerified: true,
        otpSent: false,
        message: "Number already verified",
      });
    }

    /*
     * Keep the 60-second resend protection.
     */
    if (existingOtp?.last_sent_at) {
      const lastSentAt = new Date(existingOtp.last_sent_at);
      const secondsPassed = (Date.now() - lastSentAt.getTime()) / 1000;

      if (!Number.isNaN(lastSentAt.getTime()) && secondsPassed < 60) {
        return res.status(429).json({
          success: false,
          code: "OTP_COOLDOWN",
          message: `Please wait ${Math.ceil(
            60 - secondsPassed,
          )} seconds before resending OTP`,
        });
      }
    }

    /*
     * Secure OTP generation.
     */
    const otp = crypto.randomInt(100000, 1000000);

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

    /*
     * Never log smsParams—it contains the SMS password,
     * mobile number and OTP.
     */
    await axios.get(process.env.ALOT_API_URL, {
      params: smsParams,
      timeout: 15000,
    });

    /*
     * For retry, update the existing unverified OTP row.
     */
    if (existingOtp) {
      await db.promise().query(
        `
        UPDATE otp_consent_model
        SET
  otp = ?,
  expires_at = ?,
  last_sent_at = NOW(),
  verified = 0,
  failed_attempts = 0,
  locked_until = NULL,
  verified_at = NULL,
  consent_given = 0,
  consent_text = NULL,
  consent_at = NULL
WHERE id = ?
  AND verified = 0
  AND is_used = 0
        `,
        [otp, expiresAt, existingOtp.id],
      );

      return res.json({
        success: true,
        alreadyVerified: false,
        otpSent: true,
        otpUpdated: true,
        message: "New OTP sent successfully",
      });
    }

    /*
     * First OTP request: create a new row.
     */
    await db.promise().query(
      `
      INSERT INTO otp_consent_model (
        mobile_number,
        applicant_type,
        otp,
        expires_at,
        last_sent_at,
        verified,
        is_used
      )
      VALUES (?, ?, ?, ?, NOW(), 0, 0)
      `,
      [cleanedMobile, applicantType, otp, expiresAt],
    );

    return res.json({
      success: true,
      alreadyVerified: false,
      otpSent: true,
      otpUpdated: false,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Motion Corp OTP send failed:", {
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
});

router.post("/verify-otp", async (req, res) => {
  const { mobile, otp, consentText, applicantType } = req.body || {};

  const allowedTypes = ["BORROWER", "GUARANTOR", "CO_APPLICANT"];

  if (!allowedTypes.includes(applicantType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid applicant type",
    });
  }

  const cleanedMobile = String(mobile || "").replace(/\D/g, "");
  const cleanedOtp = String(otp || "").replace(/\D/g, "");

  if (!/^[6-9]\d{9}$/.test(cleanedMobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required",
    });
  }

  if (!/^\d{6}$/.test(cleanedOtp)) {
    return res.status(400).json({
      success: false,
      message: "Valid 6-digit OTP is required",
    });
  }

  if (!String(consentText || "").trim()) {
    return res.status(400).json({
      success: false,
      code: "CONSENT_REQUIRED",
      message: "Consent is required before OTP verification",
    });
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
      SELECT
        id,
        otp,
        verified,
        expires_at,
        failed_attempts,
        locked_until
      FROM otp_consent_model
      WHERE mobile_number = ?
        AND applicant_type = ?
        AND is_used = 0
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [cleanedMobile, applicantType],
    );

    if (!rows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        code: "OTP_NOT_FOUND",
        message: "OTP not found. Please request a new OTP.",
      });
    }

    const session = rows[0];

    if (Number(session.verified) === 1) {
      await connection.commit();

      return res.json({
        success: true,
        alreadyVerified: true,
        message: "Number already verified",
      });
    }

    if (session.locked_until) {
      const lockedUntil = new Date(session.locked_until);

      if (lockedUntil.getTime() > Date.now()) {
        const secondsRemaining = Math.ceil(
          (lockedUntil.getTime() - Date.now()) / 1000,
        );

        await connection.commit();

        return res.status(429).json({
          success: false,
          code: "OTP_LOCKED",
          message: `Too many incorrect attempts. Try again after ${Math.ceil(
            secondsRemaining / 60,
          )} minute(s).`,
          secondsRemaining,
        });
      }
    }

    const expiresAt = new Date(session.expires_at);

    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      await connection.commit();

      return res.status(410).json({
        success: false,
        code: "OTP_EXPIRED",
        message: "OTP expired. Please request a new OTP.",
      });
    }

    // MySQL may return OTP as a number, while React sends a string.
    const storedOtp = String(session.otp || "").padStart(6, "0");

    if (storedOtp !== cleanedOtp) {
      const failedAttempts = Number(session.failed_attempts || 0) + 1;

      const maxAttempts = 5;
      const attemptsRemaining = Math.max(maxAttempts - failedAttempts, 0);

      const lockedUntil =
        failedAttempts >= maxAttempts
          ? new Date(Date.now() + 15 * 60 * 1000)
          : null;

      await connection.query(
        `
        UPDATE otp_consent_model
        SET
          failed_attempts = ?,
          locked_until = ?
        WHERE id = ?
          AND verified = 0
          AND is_used = 0
        `,
        [failedAttempts, lockedUntil, session.id],
      );

      await connection.commit();

      if (lockedUntil) {
        return res.status(429).json({
          success: false,
          code: "OTP_LOCKED",
          message:
            "Too many incorrect OTP attempts. Verification is locked for 15 minutes.",
          attemptsRemaining: 0,
        });
      }

      return res.status(400).json({
        success: false,
        code: "INVALID_OTP",
        message: `Invalid OTP. ${attemptsRemaining} attempt(s) remaining.`,
        attemptsRemaining,
      });
    }

    const [updateResult] = await connection.query(
      `
      UPDATE otp_consent_model
      SET
        verified = 1,
        verified_at = NOW(),
        failed_attempts = 0,
        locked_until = NULL,
        consent_given = 1,
        consent_text = ?,
        consent_at = NOW()
      WHERE id = ?
        AND verified = 0
        AND is_used = 0
      `,
      [String(consentText).trim().slice(0, 5000), session.id],
    );

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        code: "OTP_STATE_CHANGED",
        message: "OTP status changed. Please try again.",
      });
    }

    await connection.commit();

    return res.json({
      success: true,
      alreadyVerified: false,
      message: "Mobile number verified successfully",
    });
  } catch (error) {
    await connection.rollback().catch(() => {});

    console.error("Motion Corp OTP verification failed:", {
      applicantType,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  } finally {
    connection.release();
  }
});

// router.post("/init-aadhaar", async (req, res) => {
//   try {
//     const { lan, applicantType } = req.body;

//     if (!lan) {
//       return res.status(400).json({
//         success: false,
//         message: "LAN required",
//       });
//     }

//     if (!["BORROWER", "GUARANTOR", "CO_APPLICANT"].includes(applicantType)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid applicant type",
//       });
//     }

//     const [rows] = await db.promise().query(
//       `
//       SELECT *
//       FROM loan_booking_motion_corp
//       WHERE lan = ?
//       LIMIT 1
//       `,
//       [lan],
//     );

//     if (!rows.length) {
//       return res.status(404).json({
//         success: false,
//         message: "Loan not found",
//       });
//     }

//     const loan = rows[0];

//     let applicantData = {};

//     if (applicantType === "BORROWER") {
//       applicantData = {
//         name: loan.customer_name,
//         mobile: loan.mobile_number,
//         email: loan.email,
//       };
//     }

//     if (applicantType === "GUARANTOR") {
//       applicantData = {
//         name: loan.guarantor_name,
//         mobile: loan.guarantor_mobile,
//         email: loan.guarantor_email,
//       };
//     }

//     if (applicantType === "CO_APPLICANT") {
//       applicantData = {
//         name: loan.co_applicant_name,
//         mobile: loan.co_applicant_mobile,
//         email: loan.co_applicant_email,
//       };
//     }

//     if (!applicantData.mobile || !applicantData.name) {
//       return res.status(400).json({
//         success: false,
//         message: `${applicantType} details not saved`,
//       });
//     }

//     await db.promise().query(
//       `
//       INSERT IGNORE INTO kyc_verification_status (
//         lan,
//         applicant_type,
//         applicant_name,
//         mobile_number
//       )
//       VALUES (?, ?, ?, ?)
//       `,
//       [lan, applicantType, applicantData.name, applicantData.mobile],
//     );

//     await db.promise().query(
//       `
//       UPDATE kyc_verification_status
//       SET aadhaar_status = 'INITIATED'
//       WHERE lan = ?
//       AND applicant_type = ?
//       `,
//       [lan, applicantType],
//     );

//     const aadhaarInit = await initAadhaarKyc(
//       lan,
//       applicantData.mobile,
//       applicantData.email,
//       applicantData.name,
//     );

//     if (!aadhaarInit.success) {
//       await db.promise().query(
//         `
//         UPDATE kyc_verification_status
//         SET aadhaar_status = 'FAILED'
//         WHERE lan = ?
//         AND applicant_type = ?
//         `,
//         [lan, applicantType],
//       );

//       return res.status(400).json({
//         success: false,
//         message: "Aadhaar init failed",
//       });
//     }

//     await db.promise().query(
//       `
//       UPDATE kyc_verification_status
//       SET
//         aadhaar_transaction_id = ?,
//         aadhaar_kyc_url = ?,
//         aadhaar_unique_id = ?
//       WHERE lan = ?
//       AND applicant_type = ?
//       `,
//       [
//         aadhaarInit.unifiedTransactionId,
//         aadhaarInit.kycUrl,
//         aadhaarInit.uniqueId,
//         lan,
//         applicantType,
//       ],
//     );

//     return res.json({
//       success: true,
//       message: "Aadhaar initiated",
//       kycUrl: aadhaarInit.kycUrl,
//       transactionId: aadhaarInit.unifiedTransactionId,
//       uniqueId: aadhaarInit.uniqueId,
//     });
//   } catch (error) {
//     console.error("Aadhaar init error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Aadhaar init failed",
//       error: error.message,
//     });
//   }
// });

router.post("/init-aadhaar", async (req, res) => {
  const connection = await db.promise().getConnection();

  const { lan, applicantType, forceRetry = false } = req.body;
  const partyNo = 1;

  let transactionOpen = false;
  let aadhaarClaimed = false;
  let providerSucceeded = false;

  try {
    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN required",
      });
    }

    const allowedApplicantTypes = ["BORROWER", "GUARANTOR", "CO_APPLICANT"];

    if (!allowedApplicantTypes.includes(applicantType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid applicant type",
      });
    }

    await connection.beginTransaction();
    transactionOpen = true;

    /*
     * Lock the loan row so simultaneous requests for the same LAN
     * cannot both initiate Aadhaar.
     */
    const [loanRows] = await connection.query(
      `
      SELECT *
      FROM loan_booking_motion_corp
      WHERE lan = ?
      LIMIT 1
      FOR UPDATE
      `,
      [lan],
    );

    if (!loanRows.length) {
      await connection.rollback();
      transactionOpen = false;

      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    const loan = loanRows[0];

    let applicantData;

    if (applicantType === "BORROWER") {
      applicantData = {
        name: loan.customer_name,
        mobile: loan.mobile_number,
        email: loan.email,
        pan: loan.pan_card,
      };
    } else if (applicantType === "GUARANTOR") {
      applicantData = {
        name: loan.guarantor_name,
        mobile: loan.guarantor_mobile,
        email: loan.guarantor_email,
        pan: loan.guarantor_pan,
      };
    } else {
      applicantData = {
        name: loan.co_applicant_name,
        mobile: loan.co_applicant_mobile,
        email: loan.co_applicant_email,
        pan: loan.co_applicant_pan,
      };
    }

    if (!applicantData.name || !applicantData.mobile) {
      await connection.rollback();
      transactionOpen = false;

      return res.status(400).json({
        success: false,
        message: `${applicantType} details not saved`,
      });
    }

    const cleanedMobile = String(applicantData.mobile).replace(/\D/g, "");

    if (!/^[6-9]\d{9}$/.test(cleanedMobile)) {
      await connection.rollback();
      transactionOpen = false;

      return res.status(400).json({
        success: false,
        message: `${applicantType} mobile number is invalid`,
      });
    }

    /*
     * Always use the exact party row.
     */
    const [kycRows] = await connection.query(
      `
      SELECT
        aadhaar_status,
        aadhaar_transaction_id,
        aadhaar_kyc_url,
        aadhaar_unique_id
      FROM kyc_verification_status
      WHERE lan = ?
        AND applicant_type = ?
        AND party_no = ?
      LIMIT 1
      FOR UPDATE
      `,
      [lan, applicantType, partyNo],
    );

    let currentKyc = kycRows[0] || null;

    if (!currentKyc) {
      await connection.query(
        `
        INSERT INTO kyc_verification_status (
          lan,
          applicant_type,
          party_no,
          applicant_name,
          mobile_number,
          pan_number,
          aadhaar_status
        )
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
        `,
        [
          lan,
          applicantType,
          partyNo,
          applicantData.name,
          cleanedMobile,
          applicantData.pan || null,
        ],
      );

      currentKyc = {
        aadhaar_status: "PENDING",
        aadhaar_transaction_id: null,
        aadhaar_kyc_url: null,
        aadhaar_unique_id: null,
      };
    }

    const currentStatus = String(
      currentKyc.aadhaar_status || "PENDING",
    ).toUpperCase();

    /*
     * Never retry an already verified Aadhaar.
     */
    if (currentStatus === "VERIFIED") {
      await connection.commit();
      transactionOpen = false;

      return res.json({
        success: true,
        status: "VERIFIED",
        alreadyVerified: true,
        message: `${applicantType} Aadhaar is already verified`,
      });
    }

    /*
     * Reuse an existing initiated Aadhaar session.
     */
    if (currentStatus === "INITIATED" && currentKyc.aadhaar_kyc_url) {
      await connection.commit();
      transactionOpen = false;

      return res.json({
        success: true,
        status: "INITIATED",
        alreadyInitiated: true,
        message: `${applicantType} Aadhaar is already initiated`,
        kycUrl: currentKyc.aadhaar_kyc_url,
        transactionId: currentKyc.aadhaar_transaction_id,
        uniqueId: currentKyc.aadhaar_unique_id,
      });
    }

    /*
     * An INITIATED record without provider details can mean another
     * request is currently running. Do not create another provider call.
     */
    if (currentStatus === "INITIATED") {
      await connection.commit();
      transactionOpen = false;

      return res.status(409).json({
        success: false,
        code: "AADHAAR_IN_PROGRESS",
        status: "INITIATED",
        message: `${applicantType} Aadhaar initiation is already in progress`,
      });
    }

    /*
     * FAILED Aadhaar sessions require an explicit retry request.
     */
    if (currentStatus === "FAILED" && forceRetry !== true) {
      await connection.commit();
      transactionOpen = false;

      return res.status(409).json({
        success: false,
        code: "AADHAAR_RETRY_REQUIRED",
        status: "FAILED",
        message: `${applicantType} Aadhaar failed previously. Retry is required.`,
      });
    }

    /*
     * Atomically claim this Aadhaar initiation.
     */
    await connection.query(
      `
      UPDATE kyc_verification_status
      SET
        applicant_name = ?,
        mobile_number = ?,
        pan_number = ?,
        aadhaar_status = 'INITIATED',
        aadhaar_transaction_id = NULL,
        aadhaar_kyc_url = NULL,
        aadhaar_unique_id = NULL
      WHERE lan = ?
        AND applicant_type = ?
        AND party_no = ?
      `,
      [
        applicantData.name,
        cleanedMobile,
        applicantData.pan || null,
        lan,
        applicantType,
        partyNo,
      ],
    );

    aadhaarClaimed = true;

    await connection.commit();
    transactionOpen = false;

    /*
     * Do not use only LAN as the provider reference.
     */
    const providerReference = `${lan}_${applicantType}_${partyNo}_${Date.now()}`;

    const aadhaarInit = await initAadhaarKyc(
      providerReference,
      cleanedMobile,
      applicantData.email || "",
      applicantData.name,
    );

    providerSucceeded = aadhaarInit?.success === true;

    if (!providerSucceeded) {
      await db.promise().query(
        `
        UPDATE kyc_verification_status
        SET aadhaar_status = 'FAILED'
        WHERE lan = ?
          AND applicant_type = ?
          AND party_no = ?
          AND aadhaar_status <> 'VERIFIED'
        `,
        [lan, applicantType, partyNo],
      );

      return res.status(502).json({
        success: false,
        status: "FAILED",
        message: `${applicantType} Aadhaar initiation failed`,
      });
    }

    await db.promise().query(
      `
      UPDATE kyc_verification_status
      SET
        aadhaar_status = 'INITIATED',
        aadhaar_transaction_id = ?,
        aadhaar_kyc_url = ?,
        aadhaar_unique_id = ?
      WHERE lan = ?
        AND applicant_type = ?
        AND party_no = ?
        AND aadhaar_status <> 'VERIFIED'
      `,
      [
        aadhaarInit.unifiedTransactionId,
        aadhaarInit.kycUrl,
        aadhaarInit.uniqueId,
        lan,
        applicantType,
        partyNo,
      ],
    );

    return res.json({
      success: true,
      status: "INITIATED",
      message: `${applicantType} Aadhaar initiated successfully`,
      kycUrl: aadhaarInit.kycUrl,
      transactionId: aadhaarInit.unifiedTransactionId,
      uniqueId: aadhaarInit.uniqueId,
    });
  } catch (error) {
    if (transactionOpen) {
      await connection.rollback().catch(() => {});
    }

    /*
     * Mark FAILED only when the provider request itself failed.
     * If the provider succeeded but saving its response failed,
     * keep INITIATED to prevent another chargeable request.
     */
    if (aadhaarClaimed && !providerSucceeded) {
      await db
        .promise()
        .query(
          `
          UPDATE kyc_verification_status
          SET aadhaar_status = 'FAILED'
          WHERE lan = ?
            AND applicant_type = ?
            AND party_no = ?
            AND aadhaar_status <> 'VERIFIED'
          `,
          [lan, applicantType, partyNo],
        )
        .catch(() => {});
    }

    console.error("Motion Corp Aadhaar initialization failed:", {
      lan,
      applicantType,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "Aadhaar initiation failed",
    });
  } finally {
    connection.release();
  }
});

// router.post("/save-applicant-details", async (req, res) => {
//   try {
//     const { lan, applicantType, data } = req.body;

//     if (!["GUARANTOR", "CO_APPLICANT"].includes(applicantType)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid applicant type",
//       });
//     }

//     if (!data || typeof data !== "object") {
//       return res.status(400).json({
//         success: false,
//         message: "Applicant data is required",
//       });
//     }

//     if (!lan) {
//       return res.status(400).json({
//         success: false,
//         message: "LAN required",
//       });
//     }

//     if (applicantType === "GUARANTOR") {
//       await db.promise().query(
//         `
//         UPDATE loan_booking_motion_corp
//         SET
//           guarantor_name = ?,
//           guarantor_dob = ?,
//           guarantor_email = ?,
//           guarantor_pan = ?,
//           guarantor_mobile = ?,
//           relationship_with_borrower = ?,
//           guarantor_address_line_1 = ?,
//           guarantor_address_line_2 = ?,
//           guarantor_village_city = ?,
//           guarantor_district = ?,
//           guarantor_state = ?,
//           guarantor_pincode = ?,
//           guarantor_mobile_verified = ?,
//           guarantor_driving_licence = ?,
//         WHERE lan = ?
//         `,
//         [
//           emptyToNull(data.GURANTOR),
//           emptyToNull(data.GURANTOR_DOB),
//           emptyToNull(data.GURANTOR_EMAIL),
//           emptyToNull(data.GURANTOR_PAN),
//           emptyToNull(data.GURANTOR_MOBILE),
//           emptyToNull(data.Relationship_with_Borrower),
//           emptyToNull(data.GURANTOR_Address_Line_1),
//           emptyToNull(data.GURANTOR_Address_Line_2),
//           emptyToNull(data.GURANTOR_Village),
//           emptyToNull(data.GURANTOR_District),
//           emptyToNull(data.GURANTOR_State),
//           emptyToNull(data.GURANTOR_Pincode),
//           data.guarantor_mobile_verified || 0,
//           emptyToNull(data.GURANTOR_Driving_Licence),
//           lan,
//         ],
//       );
//     }

//     if (applicantType === "CO_APPLICANT") {
//       await db.promise().query(
//         `
//         UPDATE loan_booking_motion_corp
//         SET
//           co_applicant_name = ?,
//           co_applicant_dob = ?,
//           co_applicant_email = ?,
//           co_applicant_pan = ?,
//           co_applicant_mobile = ?,
//           co_applicant_address_line_1 = ?,
//           co_applicant_address_line_2 = ?,
//           co_applicant_village_city = ?,
//           co_applicant_district = ?,
//           co_applicant_state = ?,
//           co_applicant_pincode = ?,
//           co_applicant_mobile_verified = ?
//         WHERE lan = ?
//         `,
//         [
//           emptyToNull(data.Co_Applicant),
//           emptyToNull(data.Co_Applicant_DOB),
//           emptyToNull(data.Co_Applicant_Email),
//           emptyToNull(data.Co_Applicant_PAN),
//           emptyToNull(data.Co_Applicant_Mobile),
//           emptyToNull(data.Co_Applicant_Address_Line_1),
//           emptyToNull(data.Co_Applicant_Address_Line_2),
//           emptyToNull(data.Co_Applicant_Village),
//           emptyToNull(data.Co_Applicant_District),
//           emptyToNull(data.Co_Applicant_State),
//           emptyToNull(data.Co_Applicant_Pincode),
//           data.co_applicant_mobile_verified || 0,
//           lan,
//         ],
//       );
//     }

//     return res.json({
//       success: true,
//       message: `${applicantType} saved`,
//     });
//   } catch (error) {
//     console.error("Motion Corp applicant save failed:", {
//       lan: req.body?.lan,
//       applicantType: req.body?.applicantType,
//       error: error.message,
//     });

//     return res.status(500).json({
//       success: false,
//       message: "Applicant save failed",
//     });
//   }
// });

router.post("/save-applicant-details", async (req, res) => {
  const { lan, applicantType, data } = req.body || {};

  if (!lan) {
    return res.status(400).json({
      success: false,
      message: "LAN required",
    });
  }

  if (!["GUARANTOR", "CO_APPLICANT"].includes(applicantType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid applicant type",
    });
  }

  if (!data || typeof data !== "object") {
    return res.status(400).json({
      success: false,
      message: "Applicant data is required",
    });
  }

  const applicantName =
    applicantType === "GUARANTOR" ? data.GURANTOR : data.Co_Applicant;

  const applicantMobile =
    applicantType === "GUARANTOR"
      ? data.GURANTOR_MOBILE
      : data.Co_Applicant_Mobile;

  const cleanedMobile = String(applicantMobile || "").replace(/\D/g, "");

  if (!String(applicantName || "").trim()) {
    return res.status(400).json({
      success: false,
      message: `${applicantType} name is required`,
    });
  }

  if (!/^[6-9]\d{9}$/.test(cleanedMobile)) {
    return res.status(400).json({
      success: false,
      message: `${applicantType} mobile number is invalid`,
    });
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [loanRows] = await connection.query(
      `
      SELECT
        guarantor_mobile,
        guarantor_mobile_verified,
        co_applicant_mobile,
        co_applicant_mobile_verified
      FROM loan_booking_motion_corp
      WHERE lan = ?
      LIMIT 1
      FOR UPDATE
      `,
      [lan],
    );

    if (!loanRows.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Motion Corp loan not found",
      });
    }

    const loan = loanRows[0];

    const existingMobile =
      applicantType === "GUARANTOR"
        ? loan.guarantor_mobile
        : loan.co_applicant_mobile;

    const existingVerified =
      applicantType === "GUARANTOR"
        ? Number(loan.guarantor_mobile_verified) === 1
        : Number(loan.co_applicant_mobile_verified) === 1;

    const sameVerifiedMobile =
      existingVerified &&
      String(existingMobile || "").replace(/\D/g, "") === cleanedMobile;

    let verifiedOtpId = null;

    /*
     * If this mobile is not already bound and verified against this LAN,
     * verify it from the OTP table.
     */
    if (!sameVerifiedMobile) {
      const [otpRows] = await connection.query(
        `
        SELECT id
        FROM otp_consent_model
        WHERE mobile_number = ?
          AND applicant_type = ?
          AND verified = 1
          AND is_used = 0
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
        `,
        [cleanedMobile, applicantType],
      );

      if (!otpRows.length) {
        await connection.rollback();

        return res.status(409).json({
          success: false,
          code: "MOBILE_VERIFICATION_REQUIRED",
          message: `${applicantType} mobile number is not verified`,
        });
      }

      verifiedOtpId = otpRows[0].id;
    }

    if (applicantType === "GUARANTOR") {
      await connection.query(
        `
        UPDATE loan_booking_motion_corp
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
          guarantor_mobile_verified = 1,
          guarantor_driving_licence = ?
        WHERE lan = ?
        `,
        [
          emptyToNull(data.GURANTOR),
          emptyToNull(data.GURANTOR_DOB),
          emptyToNull(data.GURANTOR_EMAIL),
          emptyToNull(data.GURANTOR_PAN),
          cleanedMobile,
          emptyToNull(data.Relationship_with_Borrower),
          emptyToNull(data.GURANTOR_Address_Line_1),
          emptyToNull(data.GURANTOR_Address_Line_2),
          emptyToNull(data.GURANTOR_Village),
          emptyToNull(data.GURANTOR_District),
          emptyToNull(data.GURANTOR_State),
          emptyToNull(data.GURANTOR_Pincode),
          emptyToNull(data.GURANTOR_Driving_Licence),
          lan,
        ],
      );
    }

    if (applicantType === "CO_APPLICANT") {
      await connection.query(
        `
        UPDATE loan_booking_motion_corp
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
          co_applicant_mobile_verified = 1,
          co_applicant_driving_licence = ?
        WHERE lan = ?
        `,
        [
          emptyToNull(data.Co_Applicant),
          emptyToNull(data.Co_Applicant_DOB),
          emptyToNull(data.Co_Applicant_Email),
          emptyToNull(data.Co_Applicant_PAN),
          cleanedMobile,
          emptyToNull(data.Co_Applicant_Address_Line_1),
          emptyToNull(data.Co_Applicant_Address_Line_2),
          emptyToNull(data.Co_Applicant_Village),
          emptyToNull(data.Co_Applicant_District),
          emptyToNull(data.Co_Applicant_State),
          emptyToNull(data.Co_Applicant_Pincode),
          emptyToNull(data.Co_Applicant_Driving_Licence),
          lan,
        ],
      );
    }

    if (verifiedOtpId) {
      await connection.query(
        `
        UPDATE otp_consent_model
        SET is_used = 1
        WHERE id = ?
          AND verified = 1
          AND is_used = 0
        `,
        [verifiedOtpId],
      );
    }

    await connection.commit();

    return res.json({
      success: true,
      alreadyVerified: sameVerifiedMobile,
      mobileVerified: true,
      message: sameVerifiedMobile
        ? "Number already verified"
        : `${applicantType} mobile verified and applicant saved successfully`,
    });
  } catch (error) {
    await connection.rollback().catch(() => {});

    console.error("Motion Corp applicant save failed:", {
      lan,
      applicantType,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "Applicant save failed",
    });
  } finally {
    connection.release();
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

    lb.gps_charges,
    lb.driving_licence,
    lb.guarantor_driving_licence,
    lb.co_applicant_driving_licence,
    lb.bank_branch_address,
    lb.insurance_cost,
    lb.insurance_company_provider,
    lb.insurance_policy_number,
    lb.policy_issued_date,
    lb.period_of_insurance,
    lb.cost_of_vehicle,
    lb.manufacturing_year,
    lb.sales_invoice_number,
    lb.sales_invoice_date,
    lb.downpayment_paid_by_borrower,
    lb.vehicle_registration_cost,

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

    lb.borrower_mobile_verified,
    lb.guarantor_mobile_verified,
    lb.co_applicant_mobile_verified,

    lb.lender,
    lb.lender_type,
    lb.product,
    lb.status,

    lb.created_at,
    lb.updated_at,

    lb.motioncorp_bre_status,
    lb.motioncorp_bre_reason,
    lb.motioncorp_bre_checked_at,

    lb.fintree_cibil_score,
    lb.motioncorp_enquiries_30d,

    lb.motioncorp_dpd_3m_flag,
    lb.motioncorp_dpd_6m_flag,
    lb.motioncorp_overdue_12m_flag,

    lb.motioncorp_written_off_3y_flag,

    lb.motioncorp_60plus_24m_flag,
    lb.motioncorp_90plus_36m_flag,

    lb.motioncorp_emi_overdue_amount,
    lb.motioncorp_cc_overdue_amount,

    lb.motioncorp_deviation_flag,

    borrower_kyc.pan_status AS borrower_pan_status,
    borrower_kyc.aadhaar_status AS borrower_aadhaar_status,
    borrower_kyc.bureau_status AS borrower_bureau_status,

    guarantor_kyc.pan_status AS guarantor_pan_status,
    guarantor_kyc.aadhaar_status AS guarantor_aadhaar_status,
    guarantor_kyc.bureau_status AS guarantor_bureau_status,

    co_kyc.pan_status AS co_applicant_pan_status,
    co_kyc.aadhaar_status AS co_applicant_aadhaar_status,
    co_kyc.bureau_status AS co_applicant_bureau_status

  FROM loan_booking_motion_corp lb

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
      },

      guarantor: {
        name: row.guarantor_name,
        dob: row.guarantor_dob,
        pan: row.guarantor_pan,
        mobile: row.guarantor_mobile,
        email: row.guarantor_email,
        relationship_with_borrower: row.relationship_with_borrower,

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
      },

      product_details: {
        selected_product_id: row.selected_product_id,
        battery_name: row.battery_name,
        battery_type: row.battery_type,
        battery_serial_no_1: row.battery_serial_no_1,
        battery_serial_no_2: row.battery_serial_no_2,
        e_rikshaw_model: row.e_rikshaw_model,
        chassis_no: row.chassis_no,
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

      enquiries_30d: row.motioncorp_enquiries_30d,

      dpd_3m_flag: row.motioncorp_dpd_3m_flag,

      dpd_6m_flag: row.motioncorp_dpd_6m_flag,

      overdue_12m_flag: row.motioncorp_overdue_12m_flag,

      written_off_3y_flag: row.motioncorp_written_off_3y_flag,

      dpd_60plus_24m_flag: row.motioncorp_60plus_24m_flag,

      dpd_90plus_36m_flag: row.motioncorp_90plus_36m_flag,

      emi_overdue_amount: row.motioncorp_emi_overdue_amount,

      cc_overdue_amount: row.motioncorp_cc_overdue_amount,

      deviation_flag: row.motioncorp_deviation_flag,

      bre_status: row.motioncorp_bre_status,

      bre_reason: row.motioncorp_bre_reason,

      bre_checked_at: row.motioncorp_bre_checked_at,
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
    table = "loan_booking_motion_corp",
    prefix = "MC",
    page = "1",
    pageSize = "50",
    search = "",
    sortBy = "lan",
    sortDir = "desc",
  } = req.query;

  const allowedTables = {
    loan_booking_motion_corp: true,
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
    "motioncorp_bre_checked_at",
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
        AND lb.stage in ('BRE Deviation', 'BRE Approved')
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

        lb.motioncorp_bre_status,
        lb.motioncorp_bre_reason,
        lb.motioncorp_bre_checked_at,

        lb.status,
        lb.stage,

        lb.created_at

      FROM ?? lb
      WHERE
        lb.status = 'Credit Initiated'
        AND lb.stage in ('BRE Deviation', 'BRE Approved')
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
    table = "loan_booking_motion_corp",
    prefix = "MC",
    page = "1",
    pageSize = "50",
    search = "",
    sortBy = "lan",
    sortDir = "desc",
  } = req.query;

  const allowedTables = {
    loan_booking_motion_corp: true,
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
    "motioncorp_bre_checked_at",
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

        lb.motioncorp_bre_status,
        lb.motioncorp_bre_reason,
        lb.motioncorp_bre_checked_at,

        lb.customer_name_as_per_bank,
        lb.customer_bank_name,
        lb.customer_account_number, 
        lb.bank_ifsc_code,

        lb.agreement_esign_status,
        lb.agreement_esign_sent_at,

        lb.bank_status,

        lb.email,

        lb.emi_amount,
        lb.stamp_paper_no,

        lb.agreement_date,
        lb.login_date,

        lb.bank_account_type,

        lb.status,
        lb.stage,
        lb.stamp_paper_no,

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
      FROM loan_booking_motion_corp
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
      UPDATE loan_booking_motion_corp
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
      FROM loan_booking_motion_corp
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
