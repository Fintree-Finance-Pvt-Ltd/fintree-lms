// const express = require("express");
// const multer = require("multer");
// const axios = require("axios");
// const fs = require("fs");
// const FormData = require("form-data");
// const db = require("../../config/db");

// const router = express.Router();

// /*
// ====================================================
// IDENTIFIER GENERATOR (FIXED VERSION)
// ====================================================
// */

// const generateLoanIdentifiers = async (lender) => {

//   let prefixLan = "MCDLR";
//   let applicationPrefix = "MCDLRAPP";

//   const [rows] = await db.promise().query(
//     "SELECT last_sequence FROM loan_sequences WHERE lender_name=? FOR UPDATE",
//     [lender]
//   );

//   let newSequence;

//   if (rows.length > 0) {

//     newSequence = rows[0].last_sequence + 1;

//     await db.promise().query(
//       "UPDATE loan_sequences SET last_sequence=? WHERE lender_name=?",
//       [newSequence, lender]
//     );

//   } else {

//     newSequence = 11000;

//     await db.promise().query(
//       "INSERT INTO loan_sequences (lender_name,last_sequence) VALUES (?,?)",
//       [lender, newSequence]
//     );

//   }

//   return {
//     application_id: `${applicationPrefix}${newSequence}`,
//     lan: `${prefixLan}${newSequence}`,
//   };
// };


// /*
// ====================================================
// MULTER CONFIG (CHEQUE UPLOAD)
// ====================================================
// */

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/cheques/");
//   },
//   filename: (req, file, cb) => {
//     cb(null, `${Date.now()}-${file.originalname}`);
//   },
// });

// const uploadCheque = multer({ storage });


// /*
// ====================================================
// CREATE DEALER (MANUAL ENTRY)
// ====================================================
// */

// router.post("/dealer/create", async (req, res) => {
//   try {

//     const data = req.body;

//     const { lan, application_id } =
//       await generateLoanIdentifiers("MOTION-CORP_DEALER");

//     const query = `
//       INSERT INTO motion_corp_dealer_booking
//       (
//         application_id,
//         lan,
//         dealer_id,

//         business_name,
//         trade_name,
//         business_type,

//         pan_number,
//         gst_number,

//         owner_name,
//         owner_mobile,
//         owner_email,

//         showroom_address,
//         city,
//         state,
//         pincode,

//         bank_name,
//         branch_name,
//         account_holder_name,
//         account_number,
//         ifsc_code,

//         battery_type,
//         battery_name,
//         e_rickshaw_model,

//         cheque_file_path,
//         cheque_ocr_bank_name,
//         cheque_ocr_branch_name,
//         cheque_ocr_account_holder_name,
//         cheque_ocr_account_number,
//         cheque_ocr_ifsc_code,
//         cheque_ocr_response,
//         cheque_uploaded_at,

//         status,
//         created_at,
//         login_date
//       )
//       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),'ACTIVE',NOW(),CURDATE())
//     `;

//     const values = [

//       application_id,
//       lan,
//       lan,

//       data.business_name,
//       data.trade_name || null,
//       data.business_type,

//       data.pan_number,
//       data.gst_number,

//       data.owner_name,
//       data.owner_mobile,
//       data.owner_email || null,

//       data.showroom_address,
//       data.city,
//       data.state,
//       data.pincode,

//       data.bank_name,
//       data.branch_name && data.branch_name.trim()
//   ? data.branch_name
//   : null, // ✅ handle empty string
//       data.account_holder_name,
//       data.account_number,
//       data.ifsc_code,

//       data.battery_type || null,
//       data.battery_name || null,
//       data.e_rickshaw_model || null,

//       data.cheque_file_path || null,
//       data.cheque_ocr_bank_name || null,
//       data.cheque_ocr_branch_name || null,
//       data.cheque_ocr_account_holder_name || null,
//       data.cheque_ocr_account_number || null,
//       data.cheque_ocr_ifsc_code || null,
//       JSON.stringify(data.cheque_ocr_response || {})

//     ];

//     console.log("OCR fields received:", {
//       cheque_file_path: data.cheque_file_path,
//       cheque_ocr_bank_name: data.cheque_ocr_bank_name,
//       cheque_ocr_account_number: data.cheque_ocr_account_number
//     });

//     await db.promise().query(query, values);

//     res.json({
//       message: "Dealer created successfully",
//       lan,
//       application_id
//     });

//   }  catch (err) {

//   console.error("Insert Error:", err);

//   // ✅ Duplicate PAN
//   if (err.code === "ER_DUP_ENTRY") {

//   const match = err.sqlMessage.match(/key '(.+?)'/);

//   let field = "";

//   if (match && match[1]) {
//     const key = match[1];

//     if (key.includes("pan")) field = "PAN Number";
//     else if (key.includes("gst")) field = "GST Number";
//     else if (key.includes("account")) field = "Account Number";
//   }

//   return res.status(400).json({
//     message: `❌ ${field} already exists`,
//     field: field
//   });
// }

//   res.status(500).json({
//     message: "Dealer creation failed",
//     error: err.message
//   });
// }
// });

// /*
// ====================================================
// UPLOAD CHEQUE + OCR
// ====================================================
// */

// router.post(
//   "/dealer/:lan/upload-cheque",
//   uploadCheque.single("cheque"),
//   async (req, res) => {

//     try {

//       const { lan } = req.params;

//       if (!req.file) {
//         return res.status(400).json({
//           message: "Cheque file required",
//         });
//       }

//       const formData = new FormData();
//       formData.append("file", fs.createReadStream(req.file.path));

//       const ocrResponse = await axios.post(
//         process.env.CHEQUE_OCR_API,
//         formData,
//         { headers: formData.getHeaders() }
//       );

//       const ocr = ocrResponse.data;

//       await db.promise().query(
//         `UPDATE motion_corp_dealer_booking
//          SET cheque_file_path=?,
//              cheque_ocr_bank_name=?,
//              cheque_ocr_branch_name=?,
//              cheque_ocr_account_holder_name=?,
//              cheque_ocr_account_number=?,
//              cheque_ocr_ifsc_code=?,
//              cheque_ocr_response=?,
//              cheque_uploaded_at=NOW()
//          WHERE lan=?`,
//         [
//           req.file.path,
//           ocr.bank_name,
//           ocr.branch_name,
//           ocr.account_holder_name,
//           ocr.account_number,
//           ocr.ifsc_code,
//           JSON.stringify(ocr),
//           lan,
//         ]
//       );

//       res.json({
//         message: "Cheque OCR completed successfully",
//         ocr,
//       });

//     } catch (err) {

//       console.error(err);

//       res.status(500).json({
//         message: "Cheque OCR failed",
//         error: err.message,
//       });

//     }

//   }
// );


// /*
// ====================================================
// DEALER LOGIN → CREDIT SCREEN
// ====================================================
// */

// router.patch("/dealer/:lan/login", async (req, res) => {

//   try {

//     const { lan } = req.params;

//     await db.promise().query(
//       `UPDATE motion_corp_dealer_booking
//        SET status='LOGIN',
//            login_date=CURDATE(),
//            updated_at=NOW()
//        WHERE lan=?`,
//       [lan]
//     );

//     res.json({
//       message: "Dealer moved to credit screen",
//       lan,
//     });

//   } catch (err) {

//     console.error(err);

//     res.status(500).json({
//       message: "Dealer login failed",
//     });

//   }

// });


// /*
// ====================================================
// CREDIT APPROVE / REJECT
// ====================================================
// */

// router.patch("/dealer/:lan/credit-decision", async (req, res) => {

//   try {

//     const { lan } = req.params;
//     const { decision, remarks } = req.body;

//     if (!["APPROVED", "REJECTED"].includes(decision)) {

//       return res.status(400).json({
//         message: "Decision must be APPROVED or REJECTED",
//       });

//     }

//     await db.promise().query(
//       `UPDATE motion_corp_dealer_booking
//        SET status=?,
//            credit_remarks=?,
//            credit_decision_at=NOW()
//        WHERE lan=?`,
//       [decision, remarks || null, lan]
//     );

//     res.json({
//       message: `Case ${decision}`,
//       lan,
//     });

//   } catch (err) {

//     console.error(err);

//     res.status(500).json({
//       message: "Credit decision update failed",
//     });

//   }

// });

// /////////////// Dealer Lists & Details routes are in a separate file for better organization ///////////////
// router.get("/dealer-list", async (req, res) => {
//   try {
//     const [rows] = await db.promise().query(`
//       SELECT 
//         lan,
//         id,
//         business_name,
//         city,
//         state
//       FROM motion_corp_dealer_booking
//       WHERE status IN ('APPROVED', 'ACTIVE')
//       ORDER BY lan ASC
//     `);

//     const formatted = rows.map((d) => ({
//       lan: d.lan,
//       id: d.id,
//       name: `${d.business_name} (${d.city}, ${d.state})`,
//       business_name: d.business_name,
//       city: d.city,
//       state: d.state,
//     }));

//     res.json(formatted);

//   } catch (err) {

//     console.error("Dealer list error:", err);

//     res.status(500).json({
//       message: "Failed to fetch dealers",
//       error: err.message,
//     });

//   }
// });

// //////////// Details route is in a separate file for better organization ///////////////
// router.get("/dealer-details/:lan", async (req, res) => {
//   try {

//     const { lan } = req.params;

//     const [rows] = await db.promise().query(
//       `SELECT * FROM motion_corp_dealer_booking WHERE lan = ?`,
//       [lan]
//     );

//     if (rows.length === 0) {
//       return res.status(404).json({
//         message: "Dealer not found"
//       });
//     }

//     res.json(rows[0]);

//   } catch (err) {

//     console.error("Dealer details error:", err);

//     res.status(500).json({
//       message: "Failed to fetch dealer details",
//       error: err.message
//     });

//   }
// });

// /////////// Dealer Approve/Reject routes are in a separate file for better organization ///////////////
// router.get("/dealers-login-cases", async (req, res) => {
//   try {

//     const [rows] = await db.promise().query(`
//       SELECT 
//         id,
//         lan,
//         business_name,
//         trade_name,
//         business_type,
//         city,
//         state,
//         owner_name,
//         owner_mobile,
//         status,
//         created_at
//       FROM motion_corp_dealer_booking
//       WHERE status = 'ACTIVE'
//       ORDER BY created_at DESC
//     `);

//     res.json(rows);

//   } catch (err) {

//     console.error("Dealer login cases error:", err);

//     res.status(500).json({
//       message: "Failed to fetch dealer cases",
//       error: err.message,
//     });

//   }
// });

// router.patch("/dealer/status/:lan", async (req, res) => {
//   try {

//     const { lan } = req.params;
//     const { status } = req.body;

//     if (!status) {
//       return res.status(400).json({
//         message: "Status is required"
//       });
//     }

//     const [result] = await db.promise().query(
//       `UPDATE motion_corp_dealer_booking 
//        SET status = ?, updated_at = NOW() 
//        WHERE lan = ?`,
//       [status, lan]
//     );

//     if (result.affectedRows === 0) {
//       return res.status(404).json({
//         message: "Dealer not found"
//       });
//     }

//     res.json({
//       message: "Status updated successfully"
//     });

//   } catch (err) {

//     console.error("Dealer status update error:", err);

//     res.status(500).json({
//       message: "Failed to update dealer status",
//       error: err.message
//     });

//   }
// });

// module.exports = router;

////////////////////////
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const db = require("../../config/db");

const router = express.Router();

/*
====================================================
IDENTIFIER GENERATOR
====================================================
*/
const generateLoanIdentifiers = async (lender) => {

  let prefixLan = "MCDLR";
  let applicationPrefix = "MCDLRAPP";

  const [rows] = await db.promise().query(
    "SELECT last_sequence FROM loan_sequences WHERE lender_name=? FOR UPDATE",
    [lender]
  );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;

    await db.promise().query(
      "UPDATE loan_sequences SET last_sequence=? WHERE lender_name=?",
      [newSequence, lender]
    );
  } else {
    newSequence = 11000;

    await db.promise().query(
      "INSERT INTO loan_sequences (lender_name,last_sequence) VALUES (?,?)",
      [lender, newSequence]
    );
  }

  return {
    application_id: `${applicationPrefix}${newSequence}`,
    lan: `${prefixLan}${newSequence}`,
  };
};

/*
====================================================
MULTER CONFIG
====================================================
*/
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/cheques/"),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname}`),
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
      await generateLoanIdentifiers("MOTION-CORP_DEALER");

    const dealerQuery = `
      INSERT INTO motion_corp_dealer_booking
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
      JSON.stringify(data.cheque_ocr_response || {})
    ];

    await db.promise().query(dealerQuery, dealerValues);

    /*
    ============================
    INSERT MULTIPLE PRODUCTS
    ============================
    */
    if (data.products && data.products.length > 0) {

      const productQuery = `
        INSERT INTO motion_corp_dealer_products
        (application_id, battery_type, battery_name, e_rickshaw_model, e_rickshaw_model_price)
        VALUES ?
      `;

      const productValues = data.products.map(p => ([
        application_id,
        p.battery_type || null,
        p.battery_name || null,
        p.e_rickshaw_model || null,
        p.price || null
      ]));

      await db.promise().query(productQuery, [productValues]);
    }

    res.json({
      message: "Dealer + Products created successfully",
      lan,
      application_id
    });

  } catch (err) {

    console.error("Insert Error:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        message: "Duplicate entry found"
      });
    }

    res.status(500).json({
      message: "Dealer creation failed",
      error: err.message
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
    const { application_id, battery_type, battery_name, e_rickshaw_model, price } = req.body;

    await db.promise().query(`
      INSERT INTO motion_corp_dealer_products
      (application_id, battery_type, battery_name, e_rickshaw_model, e_rickshaw_model_price)
      VALUES (?, ?, ?, ?, ?)
    `, [application_id, battery_type, battery_name, e_rickshaw_model, price]);

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

    await db.promise().query(`
      UPDATE motion_corp_dealer_products
      SET battery_type=?, battery_name=?, e_rickshaw_model=?, e_rickshaw_model_price=?
      WHERE id=?
    `, [battery_type, battery_name, e_rickshaw_model, price, id]);

    res.json({ message: "Product updated successfully" });

  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});

// ❌ Delete Product
router.delete("/dealer/product/:id", async (req, res) => {
  try {

    const { id } = req.params;

    await db.promise().query(`
      DELETE FROM motion_corp_dealer_products WHERE id=?
    `, [id]);

    res.json({ message: "Product deleted successfully" });

  } catch (err) {
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

// 📋 Get Products
router.get("/dealer/:application_id/products", async (req, res) => {
  try {

    const { application_id } = req.params;

    const [rows] = await db.promise().query(`
      SELECT * FROM motion_corp_dealer_products
      WHERE application_id=?
    `, [application_id]);

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
        { headers: formData.getHeaders() }
      );

      const ocr = ocrResponse.data;

      await db.promise().query(`
        UPDATE motion_corp_dealer_booking
        SET cheque_file_path=?, cheque_ocr_bank_name=?, cheque_ocr_branch_name=?,
            cheque_ocr_account_holder_name=?, cheque_ocr_account_number=?,
            cheque_ocr_ifsc_code=?, cheque_ocr_response=?, cheque_uploaded_at=NOW()
        WHERE lan=?
      `, [
        req.file.path,
        ocr.bank_name,
        ocr.branch_name,
        ocr.account_holder_name,
        ocr.account_number,
        ocr.ifsc_code,
        JSON.stringify(ocr),
        lan
      ]);

      res.json({ message: "Cheque OCR success", ocr });

    } catch (err) {
      res.status(500).json({ message: "OCR failed", error: err.message });
    }
  }
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
      FROM motion_corp_dealer_booking
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
      [lan]
    );

    // ❌ No dealer found
    if (rows.length === 0) {
      return res.status(404).json({
        message: "Dealer not found"
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
        .filter(r => r.product_id !== null) // remove null rows
        .map(r => ({
          id: r.product_id,
          battery_type: r.battery_type,
          battery_name: r.battery_name,
          e_rickshaw_model: r.e_rickshaw_model,
          price: r.e_rickshaw_model_price
        }))
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
      error: err.message
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
        message: "Status is required"
      });
    }

    const [result] = await db.promise().query(
      `UPDATE motion_corp_dealer_booking 
       SET status = ?, updated_at = NOW() 
       WHERE lan = ?`,
      [status, lan]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Dealer not found"
      });
    }

    res.json({
      message: "Status updated successfully"
    });

  } catch (err) {

    console.error("Dealer status update error:", err);

    res.status(500).json({
      message: "Failed to update dealer status",
      error: err.message
    });

  }
});


module.exports = router;