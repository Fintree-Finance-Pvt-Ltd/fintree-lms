const express = require("express");
const db = require("../../config/db");
const authenticateUser = require("../../middleware/verifyToken")

const router = express.Router();

const generateLoanIdentifiers = async (lender) => {
  lender = lender.trim(); // normalize input

  let prefixPartnerLoan;
  let prefixLan;

  if (lender === "WCTL_CC_OD") {
    prefixLan = "FCCOD1";
  }
  else {
    return res.status(400).json({ message: "Invalid lender type." }); // ✅ handled in route
  }

     console.log("prefixLan:", prefixLan);

  const [rows] = await db
    .promise()
    .query(
      "SELECT last_sequence FROM loan_sequences WHERE lender_name = ? FOR UPDATE",
      [lender]
    );

  let newSequence;

  if (rows.length > 0) {
    newSequence = rows[0].last_sequence + 1;
    await db
      .promise()
      .query(
        "UPDATE loan_sequences SET last_sequence = ? WHERE lender_name = ?",
        [newSequence, lender]
      );
  } else {
    newSequence = 11000;
    await db
      .promise()
      .query(
        "INSERT INTO loan_sequences (lender_name, last_sequence) VALUES (?, ?)",
        [lender, newSequence]
      );
  }

  return {
    partnerLoanId: `${prefixPartnerLoan}${newSequence}`,
    lan: `${prefixLan}${newSequence}`,
  };
};



router.post("/wctl-cc-od-upload", authenticateUser, async (req, res) => {
  try {
    const {
      customer_name,
      mobile_number,
      alternate_mobile,
      email,
      business_type,
      business_category,
      gst_number,
      business_address_line1,
      business_address_line2,
      business_pincode,
      business_city,
      business_state,
      business_vintage_years,
    } = req.body;

    // -----------------------
    // system fields
    // -----------------------
    const created_by = req.user?.name || null; // pick from logged-in user
    const approved_by = null; 

    const lenderType = "WCTL_CC_OD"
    const { lan } = await generateLoanIdentifiers(lenderType);
    console.log("✅ Generated IDs:", { lan });

    // -----------------------
    // INSERT QUERY
    //------------------------
    const sql = `
      INSERT INTO loan_booking_wctl_cc_od (
      lan,
        customer_name,
        mobile_number,
        alternate_mobile,
        email,
        business_type,
        business_category,
        gst_number,
        business_address_line1,
        business_address_line2,
        business_pincode,
        business_city,
        business_state,
        business_vintage_years,
        created_by,
        approved_by
      ) VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      lan,
      customer_name,
      mobile_number,
      alternate_mobile || null,
      email || null,

      business_type,
      business_category,
      gst_number || null,
      business_address_line1,
      business_address_line2 || null,
      business_pincode,
      business_city,
      business_state,
      business_vintage_years || null,

      created_by,
      approved_by,
    ];

    const [result] = await db.promise().query(sql, values);

    // FETCH INSERTED RECORD
    const [rows] = await db.promise().query(
      "SELECT * FROM loan_booking_wctl_cc_od WHERE id = ?",
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: "Business customer created successfully",
      data: rows[0],
    });
  } catch (err) {
    console.error("❌ Error creating business customer:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


router.get("/list", async (req, res) => {
  try {
    const [rows] = await db
    .promise()
    .query(`
      SELECT 
        lan,
        customer_name,
        mobile_number,
        alternate_mobile,
        email,
        business_type,
        business_category,
        gst_number,
        business_address_line1,
        business_address_line2,
        business_pincode,
        business_city,
        business_state,
        business_vintage_years,
        status,
        created_by,
        approved_by,
        created_at,
        updated_at
      FROM loan_booking_wctl_cc_od
      ORDER BY lan DESC
    `);

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error fetching records:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});


router.post("/add-inventory", authenticateUser, async (req, res) => {
  const conn = await db.promise().getConnection();
  await conn.beginTransaction();

  try {
    console.log("Inside inventory add route");

    const {
      lan,
      item_name,
      item_category,
      item_subcategory,
      brand,
      model,
      sku_code,
      description,
      quantity,
      uom,
      batch_number,
      serial_number,
      manufacturing_date,
      expiry_date,
      purchase_rate,
      market_rate,
      mrp,
      total_value,
      warehouse_name,
      storage_rack,
      storage_section,
      quality_status,
      stock_status,
    } = req.body;

    if (!lan || !item_name || !item_category || !quantity || !uom) {
      return res.status(400).json({
        success: false,
        message: "lan, item_name, item_category, quantity, uom are required",
      });
    }

    const qtyNum = Number(quantity);
    const marketRateNum = market_rate ? Number(market_rate) : null;
    const purchaseRateNum = purchase_rate ? Number(purchase_rate) : null;
    const mrpNum = mrp ? Number(mrp) : null;

    const totalValueNum =
      total_value !== undefined && total_value !== null && total_value !== ""
        ? Number(total_value)
        : marketRateNum && qtyNum
        ? qtyNum * marketRateNum
        : null;

    // ------------------------------------------------------------
    // (1) Insert Inventory Item
    // ------------------------------------------------------------
    const insertSQL = `
      INSERT INTO inventory_items (
        lan, item_name, item_category, item_subcategory, brand, model,
        sku_code, description, quantity, uom, batch_number, serial_number,
        manufacturing_date, expiry_date, purchase_rate, market_rate, mrp,
        total_value, warehouse_name, storage_rack, storage_section,
        quality_status, stock_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await conn.query(insertSQL, [
      lan,
      item_name,
      item_category,
      item_subcategory || null,
      brand || null,
      model || null,
      sku_code || null,
      description || null,
      qtyNum,
      uom,
      batch_number || null,
      serial_number || null,
      manufacturing_date || null,
      expiry_date || null,
      purchaseRateNum,
      marketRateNum,
      mrpNum,
      totalValueNum,
      warehouse_name || null,
      storage_rack || null,
      storage_section || null,
      quality_status || "Good",
      stock_status || "Available",
    ]);

    // ------------------------------------------------------------
    // (2) Check if loan account already exists for this LAN
    // ------------------------------------------------------------
    const [loanExists] = await conn.query(
      "SELECT lan FROM wctl_ccod_loan_accounts WHERE lan = ? LIMIT 1",
      [lan]
    );

    if (loanExists.length === 0) {
      console.log("Loan account missing — creating initial loan account...");

      // (3) Calculate total inventory value for this LAN
      const [inv] = await conn.query(
        "SELECT COALESCE(SUM(total_value),0) AS total_inventory_value FROM inventory_items WHERE lan = ?",
        [lan]
      );

      const total_inventory_value = Number(inv[0].total_inventory_value);

      if (total_inventory_value <= 0) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Cannot create loan account. Inventory total is zero.",
        });
      }

      const loan_limit = total_inventory_value;
      const outstanding = 0;
      const accrued_interest = 0;
      const pledged_inventory = 0;
      const released_inventory = loan_limit;
      const available_limit = loan_limit;
      const today = new Date().toISOString().slice(0, 10);

      // ------------------------------------------------------------
      // (4) Create loan account automatically
      // ------------------------------------------------------------
      await conn.query(
        `INSERT INTO wctl_ccod_loan_accounts (
          lan,
          loan_limit,
          outstanding_principal,
          accrued_interest,
          pledged_inventory,
          released_inventory,
          available_limit,
          annual_interest_rate,
          last_interest_calculation_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lan,
          loan_limit,
          outstanding,
          accrued_interest,
          pledged_inventory,
          released_inventory,
          available_limit,
          18.0,
          today,
        ]
      );
    }

    await conn.commit();

    return res.status(201).json({
      success: true,
      message: "Inventory added successfully. Loan account updated/initialized.",
    });
  } catch (err) {
    await conn.rollback();
    console.error("❌ Error adding inventory:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    conn.release();
  }
});


/**
 * GET /api/inventory/customer/:customerId
 * List all inventory items for a given customer
 */
router.get("/customer/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const [rows] = await db
    .promise()
    .query(
      `
      SELECT
        inventory_id,
        lan,
        item_name,
        item_category,
        item_subcategory,
        brand,
        model,
        sku_code,
        description,
        quantity,
        uom,
        batch_number,
        serial_number,
        manufacturing_date,
        expiry_date,
        purchase_rate,
        market_rate,
        mrp,
        total_value,
        warehouse_name,
        storage_rack,
        storage_section,
        quality_status,
        stock_status,
        created_at,
        updated_at
      FROM inventory_items
      WHERE lan = ?
      ORDER BY created_at DESC
      `,
      [lan]
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("❌ Error fetching inventory items:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * GET /api/inventory/customer/:customerId/summary
 * Summary: total inventory value & basic limits (we'll later plug loan data here)
 */
router.get(
  "/customer/:lan/summary",
  async (req, res) => {
    try {
      const { lan } = req.params;

      const [rows] = await db
    .promise()
    .query(
        `
        SELECT
          COALESCE(SUM(total_value), 0) AS total_inventory_value
        FROM inventory_items
        WHERE lan = ?
        `,
        [lan]
      );

      const total_inventory_value = Number(rows[0]?.total_inventory_value || 0);

      // For now, we don't have loan account table.
      // We'll assume outstanding_principal = 0 and plug real data later.
      const outstanding_principal = 0;
      const loan_limit = total_inventory_value; // 100% of inventory
      const pledged_inventory = outstanding_principal;
      const released_inventory = loan_limit - pledged_inventory;
      const available_limit = loan_limit - outstanding_principal;

      return res.json({
        success: true,
        data: {
          total_inventory_value,
          loan_limit,
          outstanding_principal,
          pledged_inventory,
          released_inventory,
          available_limit,
        },
      });
    } catch (err) {
      console.error("❌ Error fetching inventory summary:", err);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

router.post("/loan/init/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required"
      });
    }

    // 1. Check if loan account already exists
    const [existing] = await db.promise().query(
      "SELECT lan FROM wctl_ccod_loan_accounts WHERE lan = ? LIMIT 1",
      [lan]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Loan account already exists for LAN: ${lan}`
      });
    }

    // 2. Ensure LAN exists in loan booking table
    const [booking] = await db.promise().query(
      "SELECT lan FROM loan_booking_wctl_ccod WHERE lan = ? LIMIT 1",
      [lan]
    );

    if (booking.length === 0) {
      return res.status(400).json({
        success: false,
        message: "LAN not found in customer booking table."
      });
    }

    // 3. Get inventory total for this LAN
    const [inv] = await db.promise().query(
      `SELECT COALESCE(SUM(total_value),0) AS total_inventory_value
       FROM inventory_items
       WHERE lan = ?`,
      [lan]
    );

    const total_inventory_value = Number(inv[0].total_inventory_value);
    if (total_inventory_value <= 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot create loan account — no inventory added."
      });
    }

    // 4. Calculate fields
    const loan_limit = total_inventory_value;
    const outstanding_principal = 0;
    const accrued_interest = 0;
    const pledged_inventory = 0;
    const released_inventory = loan_limit;
    const available_limit = loan_limit;
    const today = new Date().toISOString().slice(0, 10);

    // 5. Insert loan account
    await db.promise().query(
      `INSERT INTO wctl_ccod_loan_accounts (
        lan, loan_limit, outstanding_principal, accrued_interest,
        pledged_inventory, released_inventory, available_limit,
        annual_interest_rate, last_interest_calculation_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lan, loan_limit, outstanding_principal, accrued_interest,
        pledged_inventory, released_inventory, available_limit,
        18.0, today
      ]
    );

    return res.json({
      success: true,
      message: "Loan account initialized for this LAN",
      loan_limit,
      available_limit
    });

  } catch (err) {
    console.error("Loan Init Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
});

// GET Loan Account Details by LAN
router.get("/loan/:lan", async (req, res) => {
  try {
    const { lan } = req.params;
    console.log("inside /loan/:lan");

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required"
      });
    }

    // Ensure loan account exists
    const [loanRows] = await db.promise().query(
      `SELECT 
        lan,
        loan_limit + 0 AS loan_limit,
        outstanding_principal + 0 AS outstanding_principal,
        available_limit + 0 AS available_limit,
        pledged_inventory + 0 AS pledged_inventory,
        released_inventory + 0 AS released_inventory,
        accrued_interest + 0 AS accrued_interest,
        annual_interest_rate + 0 AS annual_interest_rate,
        status,
        last_interest_calculation_date,
        created_at,
        updated_at
      FROM wctl_ccod_loan_accounts
      WHERE lan = ?
      LIMIT 1`,
      [lan]
    );

    if (loanRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Loan account not found for LAN: ${lan}`
      });
    }

    // Fetch total inventory value for reference (not mandatory)
    const [invRows] = await db.promise().query(
      `SELECT COALESCE(SUM(total_value),0) AS total_inventory_value 
       FROM inventory_items 
       WHERE lan = ?`,
      [lan]
    );

    const total_inventory_value = Number(invRows[0].total_inventory_value);

    // Return combined data
    return res.json({
      success: true,
      data: {
        ...loanRows[0],
        total_inventory_value
      }
    });

  } catch (err) {
    console.error("❌ Loan GET Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
});


router.post("/invoice/create", async (req, res) => {
  try {
    const {
      lan,
      supplier_name,
      invoice_number,
      invoice_date,
      invoice_amount,
      description
    } = req.body;

    if (!lan || !supplier_name || !invoice_number || !invoice_date || !invoice_amount) {
      return res.status(400).json({
        success: false,
        message: "All required invoice fields must be provided."
      });
    }

    // 1. Fetch loan account
    const [loan] = await db.promise().query(
      `SELECT
         loan_limit + 0 AS loan_limit,
         outstanding_principal + 0 AS outstanding_principal,
         available_limit + 0 AS available_limit
       FROM wctl_ccod_loan_accounts
       WHERE lan = ?
       LIMIT 1`,
      [lan]
    );

    if (loan.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Loan account not found for this LAN."
      });
    }

    // Convert numeric safely
    const loan_limit = Number(loan[0].loan_limit);
    const outstanding_principal = Number(loan[0].outstanding_principal);
    const available_limit = Number(loan[0].available_limit);
    const invAmount = Number(invoice_amount);

    if (
      [loan_limit, outstanding_principal, available_limit, invAmount].some(
        (n) => Number.isNaN(n)
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid numeric values in loan or invoice data."
      });
    }

    // 2. Check available limit
    if (invAmount > available_limit) {
      return res.status(400).json({
        success: false,
        message: `Invoice amount exceeds available limit. Available: ${available_limit}`
      });
    }

    // 3. Insert invoice
    const [inv] = await db.promise().query(
      `INSERT INTO invoices_wctl_ccod 
        (lan, supplier_name, invoice_number, invoice_date, invoice_amount, invoice_outstanding, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [lan, supplier_name, invoice_number, invoice_date, invAmount, invAmount, description || null]
    );

    // 4. Update loan account outstanding & available limit
    const newOutstanding = outstanding_principal + invAmount;
    const newAvailable = loan_limit - newOutstanding;

    await db.promise().query(
      `UPDATE wctl_ccod_loan_accounts 
       SET outstanding_principal = ?, 
           available_limit = ?, 
           pledged_inventory = ?
       WHERE lan = ?`,
      [newOutstanding, newAvailable, newOutstanding, lan]
    );

    // 5. 🚀 FIRST INVOICE LOGIC — Set interest start date
    const [countRows] = await db.promise().query(
      `SELECT COUNT(*) AS cnt 
         FROM invoices_wctl_ccod
         WHERE lan = ?`,
      [lan]
    );

    const invoiceCount = Number(countRows[0].cnt);

    if (invoiceCount === 1) {
      console.log("📌 FIRST Invoice detected → Setting last_interest_calculation_date");

      await db.promise().query(
        `UPDATE wctl_ccod_loan_accounts
         SET last_interest_calculation_date = ?
         WHERE lan = ?`,
        [invoice_date, lan]
      );
    }

    return res.json({
      success: true,
      message: "Invoice recorded & disbursement approved.",
      invoice_id: inv.insertId,
      new_outstanding_principal: newOutstanding,
      new_available_limit: newAvailable
    });

  } catch (err) {
    console.error("Invoice Create Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
});


// GET all invoices for a LAN
router.get("/invoice/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required"
      });
    }

    // Fetch all invoices related to this LAN
    const [rows] = await db.promise().query(
      `SELECT 
        id,
        lan,
        supplier_name,
        invoice_number,
        invoice_date,
        invoice_amount,
        invoice_outstanding,
        description,
        created_at
      FROM invoices_wctl_ccod
      WHERE lan = ?
      ORDER BY invoice_date DESC, id DESC`,  // newest first
      [lan]
    );

    return res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error("❌ Invoice Fetch Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
});

router.post("/repayment/create", async (req, res) => {
  try {
    const {
      lan,
      repayment_date,
      amount,
      mode,
      reference_no,
      notes,
    } = req.body;

    if (!lan || !repayment_date || !amount) {
      return res.status(400).json({
        success: false,
        message: "lan, repayment_date and amount are required",
      });
    }

    let repayAmt = Number(amount);
    if (!Number.isFinite(repayAmt) || repayAmt <= 0) {
      return res.status(400).json({
        success: false,
        message: "Repayment amount must be a positive number",
      });
    }

    // 1) Fetch loan account
    const [loanRows] = await db.promise().query(
      `SELECT 
          loan_limit + 0 AS loan_limit,
          outstanding_principal + 0 AS outstanding_principal,
          accrued_interest + 0 AS accrued_interest,
          excess_payment + 0 AS excess_payment
       FROM wctl_ccod_loan_accounts
       WHERE lan = ?
       LIMIT 1`,
      [lan]
    );

    if (loanRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Loan account not found",
      });
    }

    let loan = loanRows[0];
    let loanLimit = Number(loan.loan_limit);
    let outstanding = Number(loan.outstanding_principal);
    let accruedInterest = Number(loan.accrued_interest);
    let excessPayment = Number(loan.excess_payment);

    // Just a sanity log
    console.log("🔹 Before repayment:", {
      lan,
      repayAmt,
      outstanding,
      accruedInterest,
      excessPayment,
    });

    // 2) Create repayment record (header)
    const [repaymentResult] = await db.promise().query(
      `INSERT INTO repayments_wctl_ccod
        (lan, repayment_date, amount, mode, reference_no, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        lan,
        repayment_date,
        repayAmt,
        mode || null,
        reference_no || null,
        notes || null,
      ]
    );

    const repayment_id = repaymentResult.insertId;

    // ✅ ALLOCATION PHASE
    let remaining = repayAmt;

    /* ==================================================
       STEP A: Allocate to PRINCIPAL (FIFO by invoice)
       ================================================== */

    if (outstanding > 0 && remaining > 0) {
      const [invoiceRows] = await db.promise().query(
        `SELECT 
            id,
            invoice_number,
            invoice_outstanding + 0 AS invoice_outstanding
         FROM invoices_wctl_ccod
         WHERE lan = ?
           AND invoice_outstanding > 0
         ORDER BY invoice_date ASC, id ASC`,
        [lan]
      );

      for (const inv of invoiceRows) {
        if (remaining <= 0) break;

        const pending = Number(inv.invoice_outstanding);
        if (pending <= 0) continue;

        const allocPrincipal = Math.min(remaining, pending);
        if (allocPrincipal <= 0) continue;

        // Insert principal allocation (invoice-wise)
        await db.promise().query(
          `INSERT INTO repayment_allocations_wctl_ccod
            (repayment_id, lan, invoice_number, principal_allocated, interest_allocated)
           VALUES (?, ?, ?, ?, 0)`,
          [repayment_id, lan, inv.invoice_number, allocPrincipal]
        );

        // Update invoice outstanding
        await db.promise().query(
          `UPDATE invoices_wctl_ccod
           SET invoice_outstanding = invoice_outstanding - ?
           WHERE id = ?`,
          [allocPrincipal, inv.id]
        );

        // Update loan-level principal
        outstanding -= allocPrincipal;
        remaining -= allocPrincipal;

        console.log(
          `✅ Allocated ₹${allocPrincipal} to invoice ${inv.invoice_number}. Remaining: ₹${remaining}`
        );
      }
    }

    /* ==================================================
       STEP B: Allocate to INTEREST (accrued_interest)
       ================================================== */

    if (remaining > 0 && accruedInterest > 0) {
      const interestAlloc = Math.min(remaining, accruedInterest);

      // Insert interest allocation row (no invoice_number)
      await db.promise().query(
        `INSERT INTO repayment_allocations_wctl_ccod
          (repayment_id, lan, invoice_number, principal_allocated, interest_allocated)
         VALUES (?, ?, NULL, 0, ?)`,
        [repayment_id, lan, interestAlloc]
      );

      accruedInterest -= interestAlloc;
      remaining -= interestAlloc;

      console.log(
        `✅ Allocated ₹${interestAlloc} to accrued interest. Remaining: ₹${remaining}`
      );
    }

    /* ==================================================
       STEP C: Any leftover → Overpayment Balance
       ================================================== */

    if (remaining > 0) {
      excessPayment += remaining;

      // Optional: also insert a "virtual allocation" row for transparency
      await db.promise().query(
        `INSERT INTO repayment_allocations_wctl_ccod
          (repayment_id, lan, invoice_number, principal_allocated, interest_allocated)
         VALUES (?, ?, NULL, 0, 0)`,
        [repayment_id, lan]
      );

      console.log(
        `⚠️ Remaining ₹${remaining} stored as excess_payment.`
      );

      remaining = 0;
    }

    // 3) Recalculate available limit
    const newOutstanding = Math.max(outstanding, 0);
    const newAvailable = loanLimit - newOutstanding;

    // 4) Update loan master
    await db.promise().query(
      `UPDATE wctl_ccod_loan_accounts
       SET outstanding_principal = ?,
           available_limit = ?,
           accrued_interest = ?,
           excess_payment = ?
       WHERE lan = ?`,
      [newOutstanding, newAvailable, accruedInterest, excessPayment, lan]
    );

    console.log("🔹 After repayment:", {
      lan,
      newOutstanding,
      newAvailable,
      accruedInterest,
      excessPayment,
    });

    return res.json({
      success: true,
      message: "Repayment recorded & allocated (principal + interest).",
      repayment_id,
      new_outstanding_principal: newOutstanding,
      new_available_limit: newAvailable,
      new_accrued_interest: accruedInterest,
      excess_payment: excessPayment,
    });
  } catch (err) {
    console.error("❌ Combined Repayment Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});



router.get("/repayment/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    const [rows] = await db.promise().query(
      `SELECT id, repayment_date, amount, mode, reference_no, notes
       FROM repayments_wctl_ccod
       WHERE lan = ?
       ORDER BY repayment_date DESC, id DESC`,
      [lan]
    );

    return res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error("Get Repayments Error:", err);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
});

// GET repayment allocations for a LAN (invoice-wise, FIFO history)
router.get("/repayment/allocations/:lan", async (req, res) => {
  try {
    const { lan } = req.params;

    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    // Join repayments + allocations so we see date, repayment amount & invoice mapping
    const [rows] = await db.promise().query(
      `SELECT 
          ra.id,
          ra.repayment_id,
          ra.lan,
          ra.invoice_number,
          ra.allocated_amount + 0 AS allocated_amount,
          r.repayment_date,
          r.amount + 0 AS repayment_amount,
          r.mode,
          r.reference_no
       FROM repayment_allocations_wctl_ccod ra
       JOIN repayments_wctl_ccod r 
         ON ra.repayment_id = r.id
       WHERE ra.lan = ?
       ORDER BY r.repayment_date DESC, ra.repayment_id DESC, ra.id ASC`,
      [lan]
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("❌ Repayment allocations fetch error:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

// In your wctl-ccod router

router.get("/interest-ledger/:lan", async (req, res) => {
  try {
    const { lan } = req.params;
    if (!lan) {
      return res.status(400).json({
        success: false,
        message: "LAN is required",
      });
    }

    // 1) Loan master (for live balances)
    const [loanRows] = await db.promise().query(
      `SELECT 
          lan,
          loan_limit + 0 AS loan_limit,
          outstanding_principal + 0 AS outstanding_principal,
          accrued_interest + 0 AS accrued_interest,
          excess_payment + 0 AS excess_payment,
          annual_interest_rate + 0 AS annual_interest_rate,
          last_interest_calculation_date,
          status
       FROM wctl_ccod_loan_accounts
       WHERE lan = ?
       LIMIT 1`,
      [lan]
    );

    if (loanRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Loan account not found",
      });
    }

    const loan = loanRows[0];

    // 2) Daily interest ledger
    const [ledgerRows] = await db.promise().query(
      `SELECT 
          id,
          interest_date,
          outstanding_principal + 0 AS outstanding_principal,
          annual_interest_rate + 0 AS annual_interest_rate,
          daily_interest + 0 AS daily_interest,
          total_interest + 0 AS total_interest
       FROM wctl_ccod_interest_ledger
       WHERE lan = ?
       ORDER BY interest_date ASC, id ASC`,
      [lan]
    );

    // 3) Totals from ledger
    let totalAccruedFromLedger = 0;
    if (ledgerRows.length > 0) {
      // last row's total_interest = lifetime accrued
      totalAccruedFromLedger = Number(
        ledgerRows[ledgerRows.length - 1].total_interest
      );
    }

    // 4) Interest paid from repayment allocations
    const [paidRows] = await db.promise().query(
      `SELECT COALESCE(SUM(interest_allocated),0) AS interest_paid
       FROM repayment_allocations_wctl_ccod
       WHERE lan = ?`,
      [lan]
    );
    const totalInterestPaid = Number(paidRows[0].interest_paid);

    // 5) Pending interest = loan.accrued_interest
    const pendingInterest = Number(loan.accrued_interest);

    return res.json({
      success: true,
      loan,
      ledger: ledgerRows,
      summary: {
        total_accrued_interest_lifetime: totalAccruedFromLedger,
        total_interest_paid: totalInterestPaid,
        pending_interest: pendingInterest,
      },
    });
  } catch (err) {
    console.error("❌ Interest Ledger Fetch Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});





module.exports = router;