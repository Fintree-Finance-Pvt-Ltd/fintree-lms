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

    const { lan, application_id } =
      await generateLoanIdentifiers("BUNDELA_DEALER");

    const dealerQuery = `
      INSERT INTO bundela_dealer_booking
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
        INSERT INTO bundela_dealer_products
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
      INSERT INTO bundela_dealer_products
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

router.put("/dealer/product/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { battery_type, battery_name, e_rickshaw_model, price } = req.body;

    await db.promise().query(
      `
      UPDATE bundela_dealer_products
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

router.delete("/dealer/product/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await db.promise().query(
      `
      DELETE FROM bundela_dealer_products WHERE id=?
    `,
      [id],
    );

    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

router.get("/dealer/:application_id/products", async (req, res) => {
  try {
    const { application_id } = req.params;

    const [rows] = await db.promise().query(
      `
      SELECT * FROM bundela_dealer_products
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
        UPDATE bundela_dealer_booking
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

router.get("/dealer-list", async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT 
        lan,
        id,
        business_name,
        city,
        state
      FROM bundela_dealer_booking
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
      FROM bundela_dealer_booking
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
      FROM bundela_dealer_products
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

router.get("/dealer-details/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const [rows] = await db.promise().query(
      `
      SELECT 
        d.*,
        p.id AS product_id,
        p.battery_type,
        p.battery_name,
        p.e_rickshaw_model,
        p.e_rickshaw_model_price
      FROM bundela_dealer_booking d
      LEFT JOIN bundela_dealer_products p
        ON d.application_id = p.application_id
      WHERE d.lan = ?`,
      [lan],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Dealer not found",
      });
    }

    const dealer = {
      ...rows[0],

      products: rows
        .filter((r) => r.product_id !== null)
        .map((r) => ({
          id: r.product_id,
          battery_type: r.battery_type,
          battery_name: r.battery_name,
          e_rickshaw_model: r.e_rickshaw_model,
          price: r.e_rickshaw_model_price,
        })),
    };

    delete dealer.product_id;
    delete dealer.battery_type;
    delete dealer.battery_name;
    delete dealer.e_rickshaw_model;
    delete dealer.e_rickshaw_model_price;

    res.json(dealer);
  } catch (err) {
    console.error("Dealer details error:", err);

    res.status(500).json({
      message: "Failed to fetch dealer details",
      error: err.message,
    });
  }
});

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
      FROM bundela_dealer_booking
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
      `
      UPDATE bundela_dealer_booking 
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

/*
OTP SEND & VERIFY
*/
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
      VALUES (?, ?, ?, ?, NOW(), 0)
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
      message: "OTP verified successfully",
    });
  } catch (err) {
    console.error("OTP verify error:", err.message);

    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
});

module.exports = router;

